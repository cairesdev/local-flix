/**
 * Acesso centralizado às configurações do sistema (tabela `system_settings`).
 *
 * Funciona tanto com PostgreSQL quanto em modo offline (memória), sempre
 * devolvendo um mapa "achatado" (key -> valor em string), com defaults
 * vindos de src/lib/env.ts quando a chave ainda não foi definida.
 */
import { sql, isOfflineMode, inMemoryData } from '@/lib/db';
import { env } from '@/lib/env';

export const SETTINGS_DEFAULTS: Record<string, string> = {
  site_name: env.site.name,
  site_description: env.site.description,
  maintenance_mode: 'false',
  allow_registration: String(env.access.allowRegistrationDefault),
};

export const SETTINGS_DESCRIPTIONS: Record<string, string> = {
  site_name: 'Nome do site exibido no cabeçalho e nas metatags',
  site_description: 'Descrição usada nas metatags (SEO)',
  maintenance_mode: 'Desativa o acesso ao site para usuários não-admin',
  allow_registration: 'Permitir que novos usuários criem conta (site fechado por padrão)',
};

let cache: { data: Record<string, string>; time: number } | null = null;
const CACHE_TTL = 30 * 1000; // 30s - configurações mudam raramente

/** Retorna todas as configurações (defaults + overrides salvos). */
export async function getSettings(forceRefresh = false): Promise<Record<string, string>> {
  if (!forceRefresh && cache && Date.now() - cache.time < CACHE_TTL) {
    return cache.data;
  }

  const result: Record<string, string> = { ...SETTINGS_DEFAULTS };

  if (isOfflineMode) {
    inMemoryData.settings.forEach((value, key) => {
      result[key] = value;
    });
  } else {
    try {
      const rows = await sql<{ key: string; value: string }>`
        SELECT key, value FROM system_settings
      `;
      rows.rows.forEach((row) => {
        if (row.value !== null && row.value !== undefined) {
          result[row.key] = row.value;
        }
      });
    } catch (error) {
      console.error('Erro ao carregar system_settings:', error);
    }
  }

  cache = { data: result, time: Date.now() };
  return result;
}

export async function getSetting(key: string): Promise<string> {
  const settings = await getSettings();
  return settings[key] ?? SETTINGS_DEFAULTS[key] ?? '';
}

export async function getBoolSetting(key: string): Promise<boolean> {
  const value = await getSetting(key);
  return value === 'true' || value === '1';
}

/** Atualiza uma ou mais configurações de uma vez (upsert). */
export async function setSettings(
  values: Record<string, string>,
  updatedBy?: number
): Promise<void> {
  if (isOfflineMode) {
    Object.entries(values).forEach(([key, value]) => {
      inMemoryData.settings.set(key, value);
    });
  } else {
    for (const [key, value] of Object.entries(values)) {
      await sql`
        INSERT INTO system_settings (key, value, description, updated_at, updated_by)
        VALUES (${key}, ${value}, ${SETTINGS_DESCRIPTIONS[key] || null}, CURRENT_TIMESTAMP, ${updatedBy ?? null})
        ON CONFLICT (key)
        DO UPDATE SET
          value = ${value},
          updated_at = CURRENT_TIMESTAMP,
          updated_by = ${updatedBy ?? null}
      `;
    }
  }
  cache = null; // invalidar cache
}

export function clearSettingsCache(): void {
  cache = null;
}
