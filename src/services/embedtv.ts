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
 * URL do player (via proxy) para um canal.
 *
 * Prioridade:
 * 1. `channel.url` - URL completa que o próprio provedor já retorna no
 *    channels.php para aquele canal específico. Provedores como o EmbedTV
 *    distribuem os canais entre vários sub-domínios (ex: ww1, ww4, ww5...),
 *    então cada canal pode ter um host diferente - usar essa URL exata
 *    evita tentar montar o endereço errado.
 * 2. `channel.playerBaseUrl` + `channel.id` - fallback quando o provedor
 *    não informou uma URL por canal (formato mais simples/antigo).
 * 3. Último recurso fixo, só para nunca quebrar com dados incompletos.
 */
export function getEmbedPlayerUrl(
  channel: Pick<Channel, 'id' | 'url' | 'playerBaseUrl'>,
  useProxy = true
): string {
  const targetUrl =
    channel.url || `${channel.playerBaseUrl || 'https://ww1.embedtv.lat'}/${channel.id}`;

  if (useProxy) {
    return `/api/proxy/embed?url=${encodeURIComponent(targetUrl)}`;
  }

  return targetUrl;
}

export function clearEmbedTVCache(): void {
  cachedData = null;
  cacheTime = 0;
}
