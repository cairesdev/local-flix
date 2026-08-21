import { NextRequest, NextResponse } from 'next/server';
import { resolveWithCloudflare, fetchWithResolvedDNS } from '@/lib/dns-resolver';
import { getAllowedProxyHosts } from '@/services/providers';

// A allowlist de domínios NÃO é mais fixa no código: vem dinamicamente dos
// provedores cadastrados no painel administrativo (tabela `providers`),
// já que os sites que hospedam os players mudam de domínio com frequência
// por causa de bloqueios. Veja src/services/providers.ts.
function isAllowedDomain(url: string, allowedHosts: string[]): boolean {
  try {
    const urlObj = new URL(url);
    return allowedHosts.some(
      (domain) => urlObj.hostname === domain || urlObj.hostname.endsWith('.' + domain)
    );
  } catch {
    return false;
  }
}

// Mesma allowlist é usada para decidir o que deve ser reescrito para o proxy
// (subdomínios como cdn.provedor.com já são cobertos pelo endsWith acima).
const shouldProxyUrl = isAllowedDomain;

// Boas práticas: os sites de player de terceiros costumam vir carregados de
// redes de anúncio (popunders, redirects) e scripts de analytics/tracking
// externos ao Superflix. Nada disso deve rodar dentro do nosso player -
// nem para bloquear o vídeo, nem para redirecionar o usuário. Esta lista
// cobre as redes mais comuns nesse tipo de site; é usada tanto para tirar
// <script>/<ins> dessas redes do HTML (servidor) quanto para bloquear
// requisições dinâmicas para elas (interceptor no cliente).
const AD_AND_TRACKING_DOMAINS = [
  // Redes de popunder/push comuns em sites de streaming "pirata"
  'popads.net', 'popcash.net', 'poprevenue.com', 'propellerads.com',
  'propellerapi.com', 'adsterra.com', 'a-ads.com', 'exoclick.com',
  'juicyads.com', 'mgid.com', 'clickadu.com', 'hilltopads.net',
  'adcash.com', 'smartyads.com', 'richads.com', 'onclickalgo.com',
  'yllix.com', 'bidvertiser.com', 'adskeeper.co.uk', 'trafficjunky.net',
  'adprovider.io', 'galaksion.com', 'clickaine.com', 'monetag.com',
  'onesignal.com', 'pushnami.com', 'adnxs.com',
  // Redes de anúncio "mainstream" que também aparecem embutidas
  'doubleclick.net', 'googlesyndication.com', 'googleadservices.com',
  'taboola.com', 'outbrain.com', 'revcontent.com',
  // Analytics/tracking externos (não têm nada a ver com métricas do
  // Superflix - não devem rodar dentro do player de terceiros)
  'google-analytics.com', 'googletagmanager.com', 'connect.facebook.net',
  'facebook.net', 'hotjar.com', 'clarity.ms', 'mixpanel.com',
  'segment.io', 'amplitude.com', 'mc.yandex.ru',
];

function isAdOrTrackingUrl(url: string): boolean {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    return AD_AND_TRACKING_DOMAINS.some((d) => hostname === d || hostname.endsWith('.' + d));
  } catch {
    return false;
  }
}

/** Remove tags <script src="..."> e <ins class="adsbygoogle" ...> de redes de anúncio/tracking conhecidas. */
function stripAdScripts(html: string): string {
  return html
    // <script ... src="https://rede-de-anuncio.com/..." ...>...</script> (com ou sem corpo)
    .replace(
      /<script\b[^>]*\bsrc=(["'])(https?:\/\/[^"']+)\1[^>]*>[\s\S]*?<\/script>/gi,
      (match, _q, src) => (isAdOrTrackingUrl(src) ? '' : match)
    )
    // <ins class="adsbygoogle" ...></ins> - unidades de anúncio do AdSense e similares
    .replace(/<ins\b[^>]*\bclass=(["'])[^"']*adsbygoogle[^"']*\1[^>]*>[\s\S]*?<\/ins>/gi, '');
}

function rewriteUrlsToProxy(html: string, baseOrigin: string, allowedHosts: string[]): string {
  // Primeiro remove scripts/unidades de anúncio e tracking conhecidos -
  // antes de qualquer reescrita de URL, para não desperdiçar trabalho
  // "proxiando" algo que vai ser descartado de qualquer forma.
  html = stripAdScripts(html);

  // Função para criar URL de proxy
  const proxyUrl = (url: string) => `/api/proxy/asset?url=${encodeURIComponent(url)}`;

  // Reescrever URLs em atributos src e href que apontam para domínios bloqueados
  // Importante: só reescreve se a URL é completa (não tem concatenação JS como " + variavel)
  html = html.replace(
    /(src|href)=(["'])(https?:\/\/[^"']+)\2(?!\s*\+)/gi,
    (match, attr, quote, url) => {
      if (shouldProxyUrl(url, allowedHosts)) {
        return `${attr}=${quote}${proxyUrl(url)}${quote}`;
      }
      return match;
    }
  );

  // Reescrever URLs relativas (sem http/https) para URLs absolutas e então para proxy
  // Importante: só reescreve se a URL é completa (não tem concatenação JS)
  html = html.replace(
    /(src|href)=(["'])(?!https?:\/\/|data:|\/api\/|#|javascript:)([^"']+)\2(?!\s*\+)/gi,
    (match, attr, quote, path) => {
      // Construir URL absoluta
      let absoluteUrl: string;
      if (path.startsWith('//')) {
        absoluteUrl = 'https:' + path;
      } else if (path.startsWith('/')) {
        absoluteUrl = baseOrigin + path;
      } else {
        absoluteUrl = baseOrigin + '/' + path;
      }

      if (shouldProxyUrl(absoluteUrl, allowedHosts)) {
        return `${attr}=${quote}${proxyUrl(absoluteUrl)}${quote}`;
      }
      return `${attr}=${quote}${absoluteUrl}${quote}`;
    }
  );

  // Injetar script para interceptar fetch, XMLHttpRequest e HLS
  const interceptorScript = `
<script>
(function() {
  // ------------------------------------------------------------------
  // Shim de localStorage/sessionStorage: o iframe é sandboxed SEM
  // "allow-same-origin" de propósito (para que o conteúdo de terceiros
  // nunca enxergue o storage do nosso próprio site - ali fica o token de
  // login do usuário). Isso faz o navegador lançar SecurityError em
  // qualquer acesso a localStorage/sessionStorage, e alguns players
  // acessam sem try/catch, quebrando o script inteiro no meio. Damos a
  // eles um storage falso em memória (isolado, descartado ao trocar de
  // canal/título) só para não travar - nunca o storage real do site.
  // ------------------------------------------------------------------
  function createMemoryStorage() {
    var store = Object.create(null);
    var keys = [];
    return {
      getItem: function(k) { return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; },
      setItem: function(k, v) { if (!(k in store)) keys.push(k); store[k] = String(v); },
      removeItem: function(k) { delete store[k]; var i = keys.indexOf(k); if (i > -1) keys.splice(i, 1); },
      clear: function() { store = Object.create(null); keys = []; },
      key: function(i) { return keys[i] || null; },
      get length() { return keys.length; }
    };
  }
  function shimStorage(prop) {
    try { window[prop]; return; } catch (e) {}
    try {
      window[prop] = createMemoryStorage();
    } catch (e) {
      try { Object.defineProperty(window, prop, { value: createMemoryStorage(), configurable: true }); } catch (e2) {}
    }
  }
  shimStorage('localStorage');
  shimStorage('sessionStorage');

  const PROXY_DOMAINS = ${JSON.stringify(allowedHosts)};
  const PROXY_BASE = '/api/proxy/';
  // Redes de anúncio/tracking conhecidas - nunca devem carregar dentro do
  // player, nem via <script> estático (já removido no servidor) nem via
  // requisição dinâmica (fetch/XHR/elemento criado em runtime).
  const AD_DOMAINS = ${JSON.stringify(AD_AND_TRACKING_DOMAINS)};

  function isAdOrTrackingHost(url) {
    try {
      const hostname = new URL(url, window.location.href).hostname.toLowerCase();
      return AD_DOMAINS.some(function(d) { return hostname === d || hostname.endsWith('.' + d); });
    } catch { return false; }
  }

  // URLs que devem ser bloqueadas (causam erros de CORS ou são desnecessárias)
  const BLOCKED_URLS = [
    '/cdn-cgi/rum',           // Cloudflare RUM - causa erro de CORS
    'cdn-cgi/rum',
    '.ttf',                   // Fontes que podem falhar
    '.woff',
    '.woff2'
  ];

  // Domínios de WebSocket P2P que podem falhar
  const BLOCKED_WS_DOMAINS = [
    'p2p.s27-usa-cloudfront-net.online',
    'p2p.',
    'tracker.',
    'wss://'
  ];

  function shouldBlock(url) {
    if (!url) return false;
    const urlStr = url.toString().toLowerCase();
    return BLOCKED_URLS.some(blocked => urlStr.includes(blocked)) || isAdOrTrackingHost(urlStr);
  }

  function shouldProxy(url) {
    try {
      // Converter URL relativa para absoluta
      const urlObj = new URL(url, window.location.origin);
      // Verificar se é um domínio que deve ser proxiado
      return PROXY_DOMAINS.some(d => urlObj.hostname === d || urlObj.hostname.endsWith('.' + d));
    } catch { return false; }
  }

  function proxyUrl(url, type) {
    // Determinar qual endpoint usar baseado no tipo
    const endpoint = type === 'hls' ? 'hls' : 'asset';
    return PROXY_BASE + endpoint + '?url=' + encodeURIComponent(url);
  }

  function isHlsUrl(url) {
    return url.includes('.m3u8') || url.includes('.ts');
  }

  // ------------------------------------------------------------------
  // Bloqueio de anúncios: popups/novas abas e cliques que redirecionam
  // para fora do player. A proteção principal é o atributo "sandbox" do
  // <iframe> (sem allow-popups/allow-top-navigation o navegador já
  // bloqueia isso nativamente) - o que vem abaixo é uma segunda camada,
  // útil sobretudo quando o player não passa pelo proxy (modo "direct").
  // ------------------------------------------------------------------

  // window.open(): bloquear tudo incondicionalmente quebra o player - o
  // próprio provedor usa uma chamada de teste (geralmente com URL vazia,
  // tipo popup de checagem) para detectar bloqueador de popup/anúncio, e
  // se retornar null ele recusa rodar. Em vez de anular sempre, deixamos a
  // chamada passar de verdade e só bloqueamos quando o destino é um
  // domínio de ads/tracking conhecido (mesma lista usada no fetch/XHR) -
  // filtro por conteúdo (falha aberta/segura) em vez de bloqueio cego.
  const originalWindowOpen = window.open.bind(window);
  window.open = function(url, target, features) {
    if (url && shouldBlock(String(url))) {
      console.log('[Superflix Proxy] window.open bloqueado (destino de ad/tracking):', url);
      return null;
    }
    return originalWindowOpen(url, target, features);
  };

  // Clique em link (ou em qualquer elemento dentro de um <a>) que abriria
  // nova aba/janela ou navegaria para um domínio fora da lista de
  // provedores permitidos - captura no topo, antes de handlers do próprio
  // player, e cancela o evento.
  document.addEventListener('click', function(e) {
    var el = e.target;
    while (el && el !== document) {
      if (el.tagName === 'A') {
        var targetAttr = (el.getAttribute('target') || '').toLowerCase();
        var href = el.getAttribute('href') || '';
        var opensNewContext = targetAttr === '_blank' || targetAttr === '_top' || targetAttr === '_parent';
        var isAbsoluteHttp = /^https?:\\/\\//i.test(href);
        if (opensNewContext || isAbsoluteHttp) {
          var allowed = false;
          try {
            var host = new URL(href, window.location.href).hostname;
            allowed = PROXY_DOMAINS.some(function(d) { return host === d || host.endsWith('.' + d); });
          } catch {}
          if (!allowed) {
            e.preventDefault();
            e.stopPropagation();
            console.log('[Superflix Proxy] Clique bloqueado (redirecionaria para fora do player):', href);
            return false;
          }
        }
      }
      el = el.parentElement;
    }
  }, true);

  // Interceptar fetch - bloquear URLs problemáticas
  const originalFetch = window.fetch;
  window.fetch = function(input, init) {
    let url = typeof input === 'string' ? input : input.url;

    // Bloquear URLs que causam erros
    if (shouldBlock(url)) {
      return Promise.resolve(new Response('', { status: 200 }));
    }

    if (shouldProxy(url)) {
      const type = isHlsUrl(url) ? 'hls' : 'asset';
      url = proxyUrl(url, type);
      if (typeof input === 'string') {
        input = url;
      } else {
        input = new Request(url, input);
      }
    }
    return originalFetch.call(this, input, init);
  };

  // Interceptar XMLHttpRequest - bloquear URLs problemáticas
  const originalOpen = XMLHttpRequest.prototype.open;
  const originalSend = XMLHttpRequest.prototype.send;
  const originalSetRequestHeader = XMLHttpRequest.prototype.setRequestHeader;

  XMLHttpRequest.prototype.open = function(method, url, ...args) {
    this._blockedXhr = shouldBlock(url);
    this._xhrOpened = !this._blockedXhr;

    if (this._blockedXhr) {
      // Abrir para uma URL dummy para evitar erros de estado
      return originalOpen.call(this, 'GET', 'data:text/plain,', true);
    }

    if (shouldProxy(url)) {
      const type = isHlsUrl(url) ? 'hls' : 'asset';
      url = proxyUrl(url, type);
    }
    return originalOpen.call(this, method, url, ...args);
  };

  XMLHttpRequest.prototype.setRequestHeader = function(name, value) {
    if (this._blockedXhr) return; // Ignorar headers para XHR bloqueados
    return originalSetRequestHeader.call(this, name, value);
  };

  XMLHttpRequest.prototype.send = function(...args) {
    if (this._blockedXhr) {
      // Simular resposta bem-sucedida
      const self = this;
      setTimeout(() => {
        Object.defineProperty(self, 'status', { value: 200, writable: true });
        Object.defineProperty(self, 'readyState', { value: 4, writable: true });
        Object.defineProperty(self, 'responseText', { value: '', writable: true });
        Object.defineProperty(self, 'response', { value: '', writable: true });
        if (self.onreadystatechange) self.onreadystatechange();
        if (self.onload) self.onload();
      }, 0);
      return;
    }
    return originalSend.apply(this, args);
  };

  // Interceptar WebSocket para bloquear conexões P2P problemáticas
  const OriginalWebSocket = window.WebSocket;
  window.WebSocket = function(url, protocols) {
    const urlStr = url.toString().toLowerCase();
    const shouldBlockWs = BLOCKED_WS_DOMAINS.some(d => urlStr.includes(d));

    if (shouldBlockWs) {
      // Criar um WebSocket falso que não faz nada
      const fakeWs = {
        url: url,
        readyState: 3, // CLOSED
        send: function() {},
        close: function() {},
        addEventListener: function() {},
        removeEventListener: function() {},
        onopen: null,
        onclose: null,
        onerror: null,
        onmessage: null
      };
      // Simular fechamento após um momento
      setTimeout(() => {
        if (fakeWs.onclose) fakeWs.onclose({ code: 1000, reason: 'blocked' });
      }, 100);
      return fakeWs;
    }

    return new OriginalWebSocket(url, protocols);
  };
  window.WebSocket.CONNECTING = 0;
  window.WebSocket.OPEN = 1;
  window.WebSocket.CLOSING = 2;
  window.WebSocket.CLOSED = 3;

  // Suprimir erros de console relacionados a recursos bloqueados
  const originalConsoleError = console.error;
  const originalConsoleWarn = console.warn;

  function shouldSuppressLog(args) {
    const msg = args.map(a => String(a)).join(' ').toLowerCase();
    return msg.includes('cors') ||
           msg.includes('cdn-cgi') ||
           msg.includes('websocket') ||
           msg.includes('net::err') ||
           msg.includes('.ttf') ||
           msg.includes('.woff') ||
           msg.includes('attestation') ||
           msg.includes('invalidstateerror') ||
           msg.includes('setrequestheader') ||
           msg.includes('topics') ||
           msg.includes('jsdelivr') ||
           msg.includes('blocked') ||
           msg.includes('failed to load');
  }

  console.error = function(...args) {
    if (shouldSuppressLog(args)) return;
    return originalConsoleError.apply(console, args);
  };

  console.warn = function(...args) {
    if (shouldSuppressLog(args)) return;
    return originalConsoleWarn.apply(console, args);
  };

  // Capturar erros globais não tratados
  window.addEventListener('error', function(e) {
    const msg = (e.message || '').toLowerCase();
    if (msg.includes('cors') ||
        msg.includes('ttf') ||
        msg.includes('woff') ||
        msg.includes('invalidstate') ||
        msg.includes('setrequestheader') ||
        msg.includes('jsdelivr')) {
      e.preventDefault();
      e.stopPropagation();
      return false;
    }
  }, true);

  // Capturar rejeições de Promise não tratadas
  window.addEventListener('unhandledrejection', function(e) {
    const msg = String(e.reason || '').toLowerCase();
    if (msg.includes('cors') ||
        msg.includes('ttf') ||
        msg.includes('woff') ||
        msg.includes('blocked') ||
        msg.includes('invalidstate')) {
      e.preventDefault();
      return false;
    }
  });

  // Interceptar createElement para capturar scripts dinâmicos
  const originalCreateElement = document.createElement;
  document.createElement = function(tagName) {
    const element = originalCreateElement.call(document, tagName);
    if (tagName.toLowerCase() === 'script' || tagName.toLowerCase() === 'img') {
      const originalSetAttribute = element.setAttribute;
      element.setAttribute = function(name, value) {
        if (name === 'src' && shouldProxy(value)) {
          value = proxyUrl(value, 'asset');
        }
        return originalSetAttribute.call(this, name, value);
      };
      // Também interceptar a propriedade src
      Object.defineProperty(element, 'src', {
        set: function(value) {
          if (shouldProxy(value)) {
            value = proxyUrl(value, 'asset');
          }
          this.setAttribute('src', value);
        },
        get: function() {
          return this.getAttribute('src');
        }
      });
    }
    return element;
  };

  console.log('[Superflix Proxy] Interceptors initialized');

  // Auto-unmute: Tentar desmutar vídeos quando o usuário interagir
  function tryUnmute() {
    const videos = document.querySelectorAll('video');
    videos.forEach(video => {
      if (video.muted) {
        video.muted = false;
        console.log('[Superflix Proxy] Video unmuted');
      }
    });
  }

  // Observar novos elementos de vídeo
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        if (node.nodeName === 'VIDEO') {
          // Quando um vídeo é adicionado, tentar desmutar após um delay
          setTimeout(() => {
            if (node.muted) {
              node.muted = false;
              console.log('[Superflix Proxy] New video unmuted');
            }
          }, 1000);
        }
      });
    });
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true
  });

  // Desmutar em qualquer interação do usuário
  ['click', 'touchstart', 'keydown'].forEach(event => {
    document.addEventListener(event, function unmuter() {
      tryUnmute();
      // Continuar tentando por alguns segundos após a interação
      setTimeout(tryUnmute, 500);
      setTimeout(tryUnmute, 1000);
      setTimeout(tryUnmute, 2000);
    }, { passive: true });
  });

  // Tentar desmutar periodicamente nos primeiros segundos
  let attempts = 0;
  const unmuteInterval = setInterval(() => {
    tryUnmute();
    attempts++;
    if (attempts > 10) clearInterval(unmuteInterval);
  }, 500);
})();
</script>`;

  // Injetar o script no head
  if (html.includes('<head>')) {
    html = html.replace('<head>', '<head>' + interceptorScript);
  } else if (html.includes('<head ')) {
    html = html.replace(/<head([^>]*)>/, '<head$1>' + interceptorScript);
  } else {
    // Se não tiver head, adicionar no início
    html = interceptorScript + html;
  }

  return html;
}

export const dynamic = 'force-dynamic';

// Função para seguir redirects com DNS customizado
async function fetchWithRedirects(
  url: string,
  referer: string,
  allowedHosts: string[],
  maxRedirects = 5
): Promise<{ status: number; body: string } | null> {
  let currentUrl = url;
  let redirectCount = 0;

  while (redirectCount < maxRedirects) {
    const urlObj = new URL(currentUrl);
    const hostname = urlObj.hostname;

    // Resolver DNS via Cloudflare
    const resolvedIP = await resolveWithCloudflare(hostname);
    if (!resolvedIP) {
      console.error(`[Proxy] DNS failed for: ${hostname}`);
      return null;
    }

    console.log(`[Proxy] ${hostname} -> ${resolvedIP}`);

    try {
      const result = await fetchWithResolvedDNS(currentUrl, resolvedIP, { referer });

      // Se for redirect, seguir
      if (result.status >= 300 && result.status < 400 && result.redirect) {
        console.log(`[Proxy] Redirect ${result.status} -> ${result.redirect}`);
        currentUrl = result.redirect.startsWith('http')
          ? result.redirect
          : new URL(result.redirect, currentUrl).href;

        // Verificar se o novo domínio é permitido
        if (!isAllowedDomain(currentUrl, allowedHosts)) {
          console.error(`[Proxy] Redirect para domínio não permitido: ${currentUrl}`);
          return null;
        }

        redirectCount++;
        continue;
      }

      return { status: result.status, body: result.body };
    } catch (error) {
      console.error(`[Proxy] Fetch error:`, error);
      return null;
    }
  }

  console.error(`[Proxy] Too many redirects`);
  return null;
}

export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get('url');

  console.log('[Embed Proxy] ========== NOVA REQUISIÇÃO ==========');
  console.log('[Embed Proxy] URL solicitada:', url);

  if (!url) {
    console.log('[Embed Proxy] ERRO: URL não fornecida');
    return NextResponse.json({ error: 'URL é obrigatória' }, { status: 400 });
  }

  const allowedHosts = await getAllowedProxyHosts();

  if (!isAllowedDomain(url, allowedHosts)) {
    console.log('[Embed Proxy] ERRO: Domínio não permitido:', url);
    return NextResponse.json({ error: 'Domínio não permitido' }, { status: 403 });
  }

  try {
    // Usar o referer da request ou o host do site
    const requestReferer = request.headers.get('referer') || request.headers.get('origin');
    const referer = requestReferer || `https://${request.headers.get('host') || 'superflix.app'}/`;

    console.log('[Embed Proxy] Buscando conteúdo com referer:', referer);
    const result = await fetchWithRedirects(url, referer, allowedHosts);

    if (!result) {
      console.log('[Embed Proxy] ERRO: fetchWithRedirects retornou null');
      return NextResponse.json({ error: 'Erro ao acessar o conteúdo' }, { status: 502 });
    }

    console.log('[Embed Proxy] Resposta recebida - Status:', result.status);
    console.log('[Embed Proxy] Tamanho do body:', result.body?.length || 0, 'bytes');

    if (result.status !== 200) {
      console.log('[Embed Proxy] ERRO: Status não-200:', result.status);
      return NextResponse.json(
        { error: `Servidor retornou status ${result.status}` },
        { status: result.status }
      );
    }

    let html = result.body;

    // Determinar a base URL original
    const urlObj = new URL(url);
    const baseOrigin = urlObj.origin;

    // Reescrever todas as URLs para usar o proxy
    html = rewriteUrlsToProxy(html, baseOrigin, allowedHosts);

    // Adicionar base tag se não existir (para recursos não capturados)
    if (!html.includes('<base')) {
      html = html.replace('<head>', `<head><base href="${baseOrigin}/">`);
    }

    // NOTA: já tentamos restringir script-src só aos domínios dos
    // provedores + CDNs de confiança, mas os players de terceiros mudam de
    // domínio/infra com muita frequência e carregam scripts de lugares que
    // não dá pra prever de antemão - isso quebrou a reprodução (o player
    // ficava sem carregar/aparecia 404 porque um script legítimo, não de
    // anúncio, era bloqueado). Voltamos a liberar script-src geral e
    // deixamos o bloqueio de anúncio/tracking por conta das camadas que
    // não têm esse risco de falso positivo: stripAdScripts (remove só os
    // domínios conhecidos do HTML), o interceptor no cliente (idem, só
    // bloqueia domínios conhecidos) e o sandbox do iframe (sem
    // allow-popups/allow-top-navigation, que é o que realmente impede o
    // golpe de redirecionar/abrir aba - isso não depende de allowlist).
    return new NextResponse(html, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': '*',
        'X-Frame-Options': 'ALLOWALL',
        'Content-Security-Policy': [
          // Mesma restrição do atributo sandbox do <iframe> reforçada aqui:
          // sem allow-popups/allow-top-navigation* o navegador bloqueia
          // popups e redirecionamento da página inteira (anúncios). Isso é
          // uma allowlist de PERMISSÕES do sandbox (sempre seguro deixar
          // restrito), diferente do script-src (allowlist de ORIGENS, que
          // se errar quebra o player - por isso ficou permissivo acima).
          'sandbox allow-scripts allow-presentation',
          `default-src * 'unsafe-inline' 'unsafe-eval' data: blob:`,
          `script-src * 'unsafe-inline' 'unsafe-eval' blob:`,
          `worker-src * blob:`,
          `style-src * 'unsafe-inline'`,
          `img-src * data: blob:`,
          `media-src * data: blob:`,
          `connect-src *`,
          `frame-src *`,
        ].join('; '),
        'Cache-Control': 'no-cache',
      },
    });
  } catch (error) {
    console.error('[Proxy] Error:', error);
    return NextResponse.json(
      { error: 'Erro interno do proxy', details: String(error) },
      { status: 500 }
    );
  }
}
