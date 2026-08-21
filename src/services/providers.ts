/**
 * Serviço de provedores de vídeo (VOD - filmes/séries - e TV ao vivo).
 *
 * Os sites que hospedam os players/streams mudam de domínio com frequência
 * por causa de bloqueios. Em vez de hard-codar um único domínio, os
 * provedores ficam cadastrados no banco (tabela `providers`, editável pelo
 * painel administrativo) com uma ordem de prioridade. Este módulo:
 *
 *  - carrega a lista de provedores ativos (com cache curto em memória);
 *  - constrói as URLs de reprodução a partir de templates configuráveis;
 *  - tenta os provedores de TV em ordem até um responder (fallback
 *    automático quando um espelho está bloqueado/fora do ar);
 *  - registra sucesso/falha para health-check simples exibido no admin.
 *
 * Roda apenas no servidor (usa `@/lib/db`).
 */
import { sql, isOfflineMode, inMemoryData, type Provider } from "@/lib/db";
import { env } from "@/lib/env";
import type { Channel } from "@/types/tv";

export type { Provider };

interface ProvidersCacheEntry {
  data: Provider[];
  time: number;
}

const providersCache = new Map<string, ProvidersCacheEntry>();
const CACHE_TTL = env.providers.cacheTtlMs;

export function invalidateProvidersCache(): void {
  providersCache.clear();
  channelsCache = null;
}

/** Provedores ativos de um tipo, ordenados por prioridade (menor = tentado primeiro). */
export async function getActiveProviders(
  type: "vod" | "tv",
): Promise<Provider[]> {
  const cached = providersCache.get(type);
  if (cached && Date.now() - cached.time < CACHE_TTL) {
    return cached.data;
  }

  let providers: Provider[];

  if (isOfflineMode) {
    providers = inMemoryData.providers.filter(
      (p) => p.type === type && p.is_active,
    );
  } else {
    const result = await sql<Provider>`
      SELECT * FROM providers WHERE type = ${type} AND is_active = true ORDER BY priority ASC
    `;
    providers = result.rows;
  }

  // Deprioriza (mas não remove) provedores marcados como "down": ainda
  // servem de último recurso caso todos os outros também falhem.
  const sorted = [...providers].sort((a, b) => {
    const aDown = a.health_status === "down" ? 1 : 0;
    const bDown = b.health_status === "down" ? 1 : 0;
    if (aDown !== bDown) return aDown - bDown;
    return a.priority - b.priority;
  });

  providersCache.set(type, { data: sorted, time: Date.now() });
  return sorted;
}

/** Todos os provedores (ativos e inativos), para a tela de administração. */
export async function getAllProviders(): Promise<Provider[]> {
  if (isOfflineMode) {
    return [...inMemoryData.providers].sort((a, b) => a.priority - b.priority);
  }
  const result =
    await sql<Provider>`SELECT * FROM providers ORDER BY type, priority ASC`;
  return result.rows;
}

/** Registra o resultado de uma tentativa de uso de um provedor (health-check simples). */
export async function recordProviderOutcome(
  providerId: number,
  success: boolean,
): Promise<void> {
  try {
    if (isOfflineMode) {
      const provider = inMemoryData.providers.find((p) => p.id === providerId);
      if (!provider) return;
      provider.last_checked_at = new Date();
      if (success) {
        provider.failure_count = 0;
        provider.health_status = "healthy";
      } else {
        provider.failure_count += 1;
        provider.health_status =
          provider.failure_count >= env.providers.maxFailuresBeforeSkip
            ? "down"
            : "degraded";
      }
      return;
    }

    if (success) {
      await sql`
        UPDATE providers
        SET failure_count = 0, health_status = 'healthy', last_checked_at = CURRENT_TIMESTAMP
        WHERE id = ${providerId}
      `;
    } else {
      await sql`
        UPDATE providers
        SET failure_count = failure_count + 1,
            health_status = CASE
              WHEN failure_count + 1 >= ${env.providers.maxFailuresBeforeSkip} THEN 'down'
              ELSE 'degraded'
            END,
            last_checked_at = CURRENT_TIMESTAMP
        WHERE id = ${providerId}
      `;
    }
  } catch (error) {
    console.error(
      "[providers] Erro ao registrar resultado do provedor:",
      error,
    );
  } finally {
    invalidateProvidersCache();
  }
}

function applyTemplate(
  template: string,
  vars: Record<string, string | number | undefined>,
): string {
  return template.replace(/\{(\w+)\}/g, (match, key) => {
    const value = vars[key];
    return value === undefined ? match : String(value);
  });
}

/** Constrói a URL direta (sem proxy) de reprodução VOD para um provedor específico. */
export function buildVodDirectUrl(
  provider: Provider,
  mediaType: "movie" | "tv",
  id: string | number,
  season?: number,
  episode?: number,
): string {
  const template =
    mediaType === "movie"
      ? provider.movie_path_template
      : provider.series_path_template;
  const path = applyTemplate(template, { id, season, episode });
  return `${provider.base_url}${path}`;
}

/** Lista de hosts que devem ser roteados pelo proxy (allowlist dinâmica). */
export async function getAllowedProxyHosts(): Promise<string[]> {
  const [vod, tv] = await Promise.all([
    getActiveProviders("vod"),
    getActiveProviders("tv"),
  ]);
  const hosts = new Set<string>();

  const addHost = (url: string | null | undefined) => {
    if (!url) return;
    try {
      hosts.add(new URL(url).hostname);
    } catch {
      // ignora URLs inválidas cadastradas por engano
    }
  };

  [...vod, ...tv].forEach((p) => {
    addHost(p.base_url);
    addHost(p.channels_url);
    addHost(p.player_base_url);
  });

  env.providers.extraProxyDomains.forEach((domain) => hosts.add(domain));

  return Array.from(hosts);
}

// ---------------------------------------------------------------------
// TV ao vivo: lista de canais com fallback automático entre provedores
// ---------------------------------------------------------------------

interface EmbedChannelsResponse {
  categories: { id: number; name: string }[];
  channels: {
    id: string;
    name: string;
    image: string;
    categories: number[];
    url: string;
  }[];
}

interface ChannelsResult {
  channels: Channel[];
  categories: string[];
  providerName: string | null;
}

let channelsCache: { data: ChannelsResult; time: number } | null = null;
const CHANNELS_FETCH_TIMEOUT_MS = 8000;

async function fetchChannelsFromProvider(
  provider: Provider,
): Promise<ChannelsResult | null> {
  if (!provider.channels_url || !provider.player_base_url) return null;

  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    CHANNELS_FETCH_TIMEOUT_MS,
  );

  try {
    const response = await fetch(provider.channels_url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "application/json",
      },
      cache: "no-store",
      signal: controller.signal,
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const data: EmbedChannelsResponse = await response.json();
    if (!Array.isArray(data.channels) || data.channels.length === 0) {
      throw new Error("Resposta sem canais");
    }

    const categoryMap = new Map<number, string>();
    data.categories?.forEach((cat) => categoryMap.set(cat.id, cat.name));

    const channels: Channel[] = data.channels.map((ch) => {
      const categoryIds = ch.categories.filter((id) => id !== 0);
      const category =
        categoryIds.length > 0
          ? categoryMap.get(categoryIds[0]) || "Outros"
          : "Outros";

      return {
        id: ch.id,
        name: ch.name,
        logo: ch.image,
        country: "Brasil",
        category,
        url: ch.url,
        providerId: provider.id,
        playerBaseUrl: provider.player_base_url!,
      };
    });

    const categories = (data.categories || [])
      .filter((cat) => cat.id !== 0)
      .map((cat) => cat.name)
      .sort();

    await recordProviderOutcome(provider.id, true);
    return { channels, categories, providerName: provider.name };
  } catch (error) {
    console.error(
      `[providers] Falha ao buscar canais de "${provider.name}":`,
      error,
    );
    await recordProviderOutcome(provider.id, false);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Busca a lista de canais de TV ao vivo, tentando cada provedor ativo em
 * ordem de prioridade até um responder com sucesso (fallback automático).
 */
export async function getTvChannelsWithFailover(
  forceRefresh = false,
): Promise<ChannelsResult> {
  if (
    !forceRefresh &&
    channelsCache &&
    Date.now() - channelsCache.time < CACHE_TTL
  ) {
    return channelsCache.data;
  }

  const providers = await getActiveProviders("tv");

  for (const provider of providers) {
    const result = await fetchChannelsFromProvider(provider);
    if (result) {
      channelsCache = { data: result, time: Date.now() };
      return result;
    }
  }

  // Todos os provedores falharam: devolve cache antigo (mesmo expirado) se existir
  if (channelsCache) {
    console.warn(
      "[providers] Todos os provedores de TV falharam - usando cache antigo",
    );
    return channelsCache.data;
  }

  throw new Error("Nenhum provedor de TV ao vivo disponível no momento.");
}

/** Testa a conectividade de um provedor (usado pelo botão "Testar" no admin). */
export async function testProvider(
  provider: Provider,
): Promise<{ ok: boolean; detail: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    CHANNELS_FETCH_TIMEOUT_MS,
  );

  try {
    const testUrl =
      provider.type === "tv" ? provider.channels_url : provider.base_url;
    if (!testUrl) return { ok: false, detail: "Provedor sem URL configurada" };

    const response = await fetch(testUrl, {
      method: "GET",
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; SuperflixHealthCheck/1.0)",
      },
    });

    const ok = response.status < 500;
    await recordProviderOutcome(provider.id, ok);
    return { ok, detail: `HTTP ${response.status}` };
  } catch (error) {
    await recordProviderOutcome(provider.id, false);
    return {
      ok: false,
      detail: error instanceof Error ? error.message : "Erro desconhecido",
    };
  } finally {
    clearTimeout(timeout);
  }
}
