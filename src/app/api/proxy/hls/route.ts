import { NextRequest, NextResponse } from 'next/server';
import { resolveWithCloudflare, fetchWithResolvedDNS } from '@/lib/dns-resolver';
import { getAllowedProxyHosts } from '@/services/providers';

// Domínios permitidos: dinâmicos, vindos dos provedores cadastrados no
// admin (veja src/services/providers.ts) em vez de hard-coded.
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

const shouldProxyUrl = isAllowedDomain;

function rewriteM3U8(content: string, baseUrl: string, allowedHosts: string[]): string {
  const baseUrlObj = new URL(baseUrl);
  const lines = content.split('\n');

  return lines
    .map((line) => {
      const trimmedLine = line.trim();

      // Ignorar linhas vazias e comentários que não são URLs
      if (!trimmedLine || trimmedLine.startsWith('#EXT')) {
        // Reescrever URIs em tags como #EXT-X-KEY
        if (trimmedLine.includes('URI="')) {
          return trimmedLine.replace(/URI="([^"]+)"/g, (match, uri) => {
            let absoluteUrl: string;
            if (uri.startsWith('http://') || uri.startsWith('https://')) {
              absoluteUrl = uri;
            } else if (uri.startsWith('/')) {
              absoluteUrl = `${baseUrlObj.origin}${uri}`;
            } else {
              const basePath = baseUrl.substring(0, baseUrl.lastIndexOf('/') + 1);
              absoluteUrl = basePath + uri;
            }

            if (shouldProxyUrl(absoluteUrl, allowedHosts)) {
              return `URI="/api/proxy/hls?url=${encodeURIComponent(absoluteUrl)}"`;
            }
            return match;
          });
        }
        return line;
      }

      // Reescrever URLs de segmentos
      let absoluteUrl: string;
      if (trimmedLine.startsWith('http://') || trimmedLine.startsWith('https://')) {
        absoluteUrl = trimmedLine;
      } else if (trimmedLine.startsWith('/')) {
        absoluteUrl = `${baseUrlObj.origin}${trimmedLine}`;
      } else {
        // URL relativa
        const basePath = baseUrl.substring(0, baseUrl.lastIndexOf('/') + 1);
        absoluteUrl = basePath + trimmedLine;
      }

      if (shouldProxyUrl(absoluteUrl, allowedHosts)) {
        // Para segmentos .ts, usar o proxy de asset
        if (absoluteUrl.endsWith('.ts') || absoluteUrl.includes('.ts?')) {
          return `/api/proxy/asset?url=${encodeURIComponent(absoluteUrl)}`;
        }
        // Para outros arquivos (sub-playlists .m3u8), usar o proxy HLS
        return `/api/proxy/hls?url=${encodeURIComponent(absoluteUrl)}`;
      }

      return line;
    })
    .join('\n');
}

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get('url');

  console.log('[HLS Proxy] ========== NOVA REQUISIÇÃO ==========');
  console.log('[HLS Proxy] URL solicitada:', url);

  if (!url) {
    console.log('[HLS Proxy] ERRO: URL não fornecida');
    return NextResponse.json({ error: 'URL é obrigatória' }, { status: 400 });
  }

  const allowedHosts = await getAllowedProxyHosts();

  if (!isAllowedDomain(url, allowedHosts)) {
    console.log('[HLS Proxy] ERRO: Domínio não permitido:', url);
    return NextResponse.json({ error: 'Domínio não permitido' }, { status: 403 });
  }

  try {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname;

    console.log('[HLS Proxy] Resolvendo DNS para:', hostname);

    // Resolver DNS via Cloudflare
    const resolvedIP = await resolveWithCloudflare(hostname);
    if (!resolvedIP) {
      console.error(`[HLS Proxy] ERRO: DNS falhou para: ${hostname}`);
      return NextResponse.json({ error: 'DNS resolution failed' }, { status: 502 });
    }

    console.log(`[HLS Proxy] DNS resolvido: ${hostname} -> ${resolvedIP}`);

    console.log('[HLS Proxy] Fazendo fetch com IP resolvido...');
    const result = await fetchWithResolvedDNS(url, resolvedIP, {
      referer: 'https://superflix.app/',
    });

    console.log('[HLS Proxy] Resposta recebida - Status:', result.status);
    console.log('[HLS Proxy] Tamanho do body:', result.body?.length || 0, 'bytes');

    // Seguir redirects
    if (result.status >= 300 && result.status < 400 && result.redirect) {
      const redirectUrl = result.redirect.startsWith('http')
        ? result.redirect
        : new URL(result.redirect, url).href;

      return NextResponse.redirect(
        `/api/proxy/hls?url=${encodeURIComponent(redirectUrl)}`
      );
    }

    // Detectar se é um arquivo M3U8 ou segmento TS
    const contentType = result.headers['content-type'];
    const isM3U8 =
      url.includes('.m3u8') ||
      (contentType &&
        (contentType.includes('mpegurl') ||
          contentType.includes('x-mpegurl') ||
          contentType.includes('vnd.apple.mpegurl')));

    if (isM3U8) {
      // Reescrever URLs no M3U8
      const rewrittenContent = rewriteM3U8(result.body, url, allowedHosts);

      return new NextResponse(rewrittenContent, {
        status: 200,
        headers: {
          'Content-Type': 'application/vnd.apple.mpegurl',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, OPTIONS',
          'Access-Control-Allow-Headers': '*',
          'Cache-Control': 'no-cache',
        },
      });
    }

    // Para segmentos TS, retornar o conteúdo diretamente
    return new NextResponse(result.body, {
      status: result.status,
      headers: {
        'Content-Type': 'video/mp2t',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': '*',
        'Cache-Control': 'public, max-age=3600',
      },
    });
  } catch (error) {
    console.error('[HLS Proxy] Error:', error);
    return NextResponse.json(
      { error: 'Erro ao acessar stream', details: String(error) },
      { status: 500 }
    );
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': '*',
    },
  });
}
