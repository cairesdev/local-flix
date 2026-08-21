import type { Channel } from '@/types/tv';

// Cache para evitar requests desnecessários no cliente
let cachedData: { channels: Channel[]; categories: string[] } | null = null;
let cacheTime = 0;
const CACHE_TTL = 10 * 60 * 1000; // 10 minutos

/**
 * Busca a lista de canais de TV ao vivo via API interna. A lógica de
 * fallback entre provedores (quando um mirror é bloqueado) acontece no
 * servidor - veja src/services/providers.ts e /api/tv/channels.
 */
export async function fetchEmbedTVChannels(): Promise<{ channels: Channel[]; categories: string[] }> {
  if (cachedData && Date.now() - cacheTime < CACHE_TTL) {
    return cachedData;
  }

  const response = await fetch('/api/tv/channels');

  if (!response.ok) {
    throw new Error(`Erro ao carregar canais: ${response.status}`);
  }

  const data: { channels: Channel[]; categories: string[] } = await response.json();

  cachedData = { channels: data.channels || [], categories: data.categories || [] };
  cacheTime = Date.now();

  return cachedData;
}

/**
 * URL do player (via proxy) para um canal. Usa o provedor de origem do
 * próprio canal (`channel.playerBaseUrl`) quando disponível, já que
 * diferentes canais podem vir de diferentes provedores em caso de
 * fallback. Sem isso, cai de volta para o primeiro provedor de TV ativo
 * (comportamento antigo, mantido apenas por segurança).
 */
export function getEmbedPlayerUrl(channel: Pick<Channel, 'id' | 'playerBaseUrl'>, useProxy = true): string {
  const base = channel.playerBaseUrl || 'https://www1.embedtv.best';
  const targetUrl = `${base}/${channel.id}`;

  if (useProxy) {
    return `/api/proxy/embed?url=${encodeURIComponent(targetUrl)}`;
  }

  return targetUrl;
}

export function clearEmbedTVCache(): void {
  cachedData = null;
  cacheTime = 0;
}
