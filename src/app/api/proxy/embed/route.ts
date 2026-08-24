import { NextRequest, NextResponse } from "next/server";
import {
  resolveWithCloudflare,
  fetchWithResolvedDNS,
} from "@/lib/dns-resolver";
import { getAllowedProxyHosts } from "@/services/providers";

// A allowlist de domínios NÃO é mais fixa no código: vem dinamicamente dos
// provedores cadastrados no painel administrativo (tabela `providers`),
// já que os sites que hospedam os players mudam de domínio com frequência
// por causa de bloqueios. Veja src/services/providers.ts.
function isAllowedDomain(url: string, allowedHosts: string[]): boolean {
  try {
    const urlObj = new URL(url);
    return allowedHosts.some(
      (domain) =>
        urlObj.hostname === domain || urlObj.hostname.endsWith("." + domain),
    );
  } catch {
    return false;
  }
}

// Mesma allowlist é usada para decidir o que deve ser reescrito para o proxy
// (subdomínios como cdn.provedor.com já são cobertos pelo endsWith acima).
const shouldProxyUrl = isAllowedDomain;

function rewriteUrlsToProxy(
  html: string,
  baseOrigin: string,
  allowedHosts: string[],
): string {
  // Função para criar URL de proxy
  const proxyUrl = (url: string) =>
    `/api/proxy/asset?url=${encodeURIComponent(url)}`;

  // Reescrever URLs em atributos src e href que apontam para domínios dos provedores
  // Importante: só reescreve se a URL é completa (não tem concatenação JS como " + variavel)
  html = html.replace(
    /(src|href)=(["'])(https?:\/\/[^"']+)\2(?!\s*\+)/gi,
    (match, attr, quote, url) => {
      if (shouldProxyUrl(url, allowedHosts)) {
        return `${attr}=${quote}${proxyUrl(url)}${quote}`;
      }
      return match;
    },
  );

  // Reescrever URLs relativas (sem http/https) para URLs absolutas e então para proxy
  // Importante: só reescreve se a URL é completa (não tem concatenação JS)
  html = html.replace(
    /(src|href)=(["'])(?!https?:\/\/|data:|\/api\/|#|javascript:)([^"']+)\2(?!\s*\+)/gi,
    (match, attr, quote, path) => {
      // Construir URL absoluta
      let absoluteUrl: string;
      if (path.startsWith("//")) {
        absoluteUrl = "https:" + path;
      } else if (path.startsWith("/")) {
        absoluteUrl = baseOrigin + path;
      } else {
        absoluteUrl = baseOrigin + "/" + path;
      }

      if (shouldProxyUrl(absoluteUrl, allowedHosts)) {
        return `${attr}=${quote}${proxyUrl(absoluteUrl)}${quote}`;
      }
      return `${attr}=${quote}${absoluteUrl}${quote}`;
    },
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

  function resolveProxyTarget(url) {
    try {
      // Converter URL relativa para absoluta usando o <base> injetado (o
      // domínio real do provedor), não window.location.origin - a página
      // roda sob nosso próprio origin (localhost/nosso domínio), então
      // resolver contra window.location.origin faz URLs relativas
      // (ex.: fetch('/cdn-cgi/rum')) apontarem pra cá em vez do provedor,
      // escapando do proxy e batendo em CORS direto no domínio de terceiro.
      const urlObj = new URL(url, document.baseURI);
      // Verificar se é um domínio que deve ser proxiado
      if (PROXY_DOMAINS.some(d => urlObj.hostname === d || urlObj.hostname.endsWith('.' + d))) {
        return urlObj.href;
      }
      return null;
    } catch { return null; }
  }

  function proxyUrl(url, type) {
    // Determinar qual endpoint usar baseado no tipo
    const endpoint = type === 'hls' ? 'hls' : 'asset';
    return PROXY_BASE + endpoint + '?url=' + encodeURIComponent(url);
  }

  function isHlsUrl(url) {
    return url.includes('.m3u8') || url.includes('.ts');
  }

  // Interceptar fetch - rotear pelo proxy quando necessário (sem bloquear nada)
  const originalFetch = window.fetch;
  window.fetch = function(input, init) {
    let url = typeof input === 'string' ? input : input.url;

    const resolved = resolveProxyTarget(url);
    if (resolved) {
      const type = isHlsUrl(resolved) ? 'hls' : 'asset';
      url = proxyUrl(resolved, type);
      if (typeof input === 'string') {
        input = url;
      } else {
        input = new Request(url, input);
      }
    }
    return originalFetch.call(this, input, init);
  };

  // Interceptar XMLHttpRequest - rotear pelo proxy quando necessário
  const originalOpen = XMLHttpRequest.prototype.open;
  const originalSend = XMLHttpRequest.prototype.send;
  const originalSetRequestHeader = XMLHttpRequest.prototype.setRequestHeader;

  XMLHttpRequest.prototype.open = function(method, url, ...args) {
    const resolved = resolveProxyTarget(url);
    if (resolved) {
      const type = isHlsUrl(resolved) ? 'hls' : 'asset';
      url = proxyUrl(resolved, type);
    }
    return originalOpen.call(this, method, url, ...args);
  };

  XMLHttpRequest.prototype.setRequestHeader = function(name, value) {
    return originalSetRequestHeader.call(this, name, value);
  };

  XMLHttpRequest.prototype.send = function(...args) {
    return originalSend.apply(this, args);
  };

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
        if (name === 'src') {
          const resolved = resolveProxyTarget(value);
          if (resolved) value = proxyUrl(resolved, 'asset');
        }
        return originalSetAttribute.call(this, name, value);
      };
      // Também interceptar a propriedade src
      Object.defineProperty(element, 'src', {
        set: function(value) {
          const resolved = resolveProxyTarget(value);
          if (resolved) value = proxyUrl(resolved, 'asset');
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
  if (html.includes("<head>")) {
    html = html.replace("<head>", "<head>" + interceptorScript);
  } else if (html.includes("<head ")) {
    html = html.replace(/<head([^>]*)>/, "<head$1>" + interceptorScript);
  } else {
    // Se não tiver head, adicionar no início
    html = interceptorScript + html;
  }

  return html;
}

export const dynamic = "force-dynamic";

// Função para seguir redirects com DNS customizado
async function fetchWithRedirects(
  url: string,
  referer: string,
  maxRedirects = 5,
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
      const result = await fetchWithResolvedDNS(currentUrl, resolvedIP, {
        referer,
      });

      // Se for redirect, seguir
      if (result.status >= 300 && result.status < 400 && result.redirect) {
        console.log(`[Proxy] Redirect ${result.status} -> ${result.redirect}`);
        currentUrl = result.redirect.startsWith("http")
          ? result.redirect
          : new URL(result.redirect, currentUrl).href;

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
  const url = request.nextUrl.searchParams.get("url");

  console.log("[Embed Proxy] ========== NOVA REQUISIÇÃO ==========");
  console.log("[Embed Proxy] URL solicitada:", url);

  if (!url) {
    console.log("[Embed Proxy] ERRO: URL não fornecida");
    return NextResponse.json({ error: "URL é obrigatória" }, { status: 400 });
  }

  const allowedHosts = await getAllowedProxyHosts();

  try {
    // Usar o referer da request ou o host do site
    const requestReferer =
      request.headers.get("referer") || request.headers.get("origin");
    const referer =
      requestReferer ||
      `https://${request.headers.get("host") || "superflix.app"}/`;

    console.log("[Embed Proxy] Buscando conteúdo com referer:", referer);
    const result = await fetchWithRedirects(url, referer);

    if (!result) {
      console.log("[Embed Proxy] ERRO: fetchWithRedirects retornou null");
      return NextResponse.json(
        { error: "Erro ao acessar o conteúdo" },
        { status: 502 },
      );
    }

    console.log("[Embed Proxy] Resposta recebida - Status:", result.status);
    console.log(
      "[Embed Proxy] Tamanho do body:",
      result.body?.length || 0,
      "bytes",
    );

    if (result.status !== 200) {
      console.log("[Embed Proxy] ERRO: Status não-200:", result.status);
      return NextResponse.json(
        { error: `Servidor retornou status ${result.status}` },
        { status: result.status },
      );
    }

    let html = result.body;

    // Determinar a base URL original
    const urlObj = new URL(url);
    const baseOrigin = urlObj.origin;

    // Reescrever todas as URLs para usar o proxy
    html = rewriteUrlsToProxy(html, baseOrigin, allowedHosts);

    // Adicionar base tag se não existir (para recursos não capturados)
    if (!html.includes("<base")) {
      html = html.replace("<head>", `<head><base href="${baseOrigin}/">`);
    }

    // NOTA: já tentamos restringir script-src só aos domínios dos
    // provedores + CDNs de confiança, mas os players de terceiros mudam de
    // domínio/infra com muita frequência e carregam scripts de lugares que
    // não dá pra prever de antemão - isso quebrou a reprodução (o player
    // ficava sem carregar/aparecia 404 porque um script legítimo, não de
    // anúncio, era bloqueado). script-src geral, sem filtro de anúncio/
    // tracking/domínio - único limite real é o sandbox do <iframe> (sem
    // allow-popups/allow-top-navigation), que impede popup/redirecionamento
    // pra fora do player independente de qualquer allowlist.
    return new NextResponse(html, {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "*",
        "X-Frame-Options": "ALLOWALL",
        "Content-Security-Policy": [
          `default-src * 'unsafe-inline' 'unsafe-eval' data: blob:`,
          `script-src * 'unsafe-inline' 'unsafe-eval' blob:`,
          `worker-src * blob:`,
          `style-src * 'unsafe-inline'`,
          `img-src * data: blob:`,
          `media-src * data: blob:`,
          `connect-src *`,
          `frame-src *`,
        ].join("; "),
        "Cache-Control": "no-cache",
      },
    });
  } catch (error) {
    console.error("[Proxy] Error:", error);
    return NextResponse.json(
      { error: "Erro interno do proxy", details: String(error) },
      { status: 500 },
    );
  }
}
