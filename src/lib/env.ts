/**
 * Configuração central da aplicação.
 *
 * Todas as variáveis de ambiente usadas pela aplicação devem ser lidas
 * a partir deste arquivo, nunca diretamente via `process.env` espalhado
 * pelo código. Isso facilita auditoria, documentação (.env.example) e
 * evita valores "mágicos" hard-coded nos serviços.
 */

function bool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value === '') return fallback;
  return value.toLowerCase() === 'true' || value === '1';
}

function num(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function csv(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
}

/** Gera um segredo aleatório (usado apenas como fallback de desenvolvimento). */
function randomDevSecret(): string {
  // Evita depender de 'crypto' no edge runtime do middleware.
  return Array.from({ length: 48 }, () =>
    Math.floor(Math.random() * 36).toString(36)
  ).join('');
}

const isProduction = process.env.NODE_ENV === 'production';

// Gerado uma única vez por processo, apenas para não travar o `next dev`
// quando o desenvolvedor esquece de definir JWT_SECRET localmente.
const devFallbackSecret = randomDevSecret();

export const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  isProduction,

  // --- TMDB -----------------------------------------------------------
  // Nota: apenas variáveis prefixadas com NEXT_PUBLIC_ ficam disponíveis no
  // navegador (o serviço TMDB roda no cliente). Não coloque segredos aqui.
  tmdb: {
    apiKey: process.env.NEXT_PUBLIC_TMDB_API_KEY || '',
    baseUrl: process.env.NEXT_PUBLIC_TMDB_BASE_URL || 'https://api.themoviedb.org/3',
    imageBaseUrl: process.env.NEXT_PUBLIC_TMDB_IMAGE_BASE_URL || 'https://image.tmdb.org/t/p',
    language: process.env.NEXT_PUBLIC_TMDB_LANGUAGE || 'pt-BR',
  },

  // --- Banco de dados ---------------------------------------------------
  database: {
    url: process.env.POSTGRES_URL || process.env.DATABASE_URL || '',
  },

  // --- Autenticação / JWT ----------------------------------------------
  auth: {
    jwtSecret:
      process.env.JWT_SECRET ||
      (isProduction
        ? // Em produção, nunca usar um segredo previsível. Se não configurado,
          // usamos um segredo aleatório por processo (invalida tokens a cada
          // deploy/restart) em vez de um valor fixo conhecido publicamente.
          devFallbackSecret
        : 'superflix-dev-secret-change-in-production'),
    jwtExpiry: process.env.JWT_EXPIRY || '7d',
    cookieName: process.env.AUTH_COOKIE_NAME || 'auth_token',
    cookieMaxAgeSeconds: num(process.env.AUTH_COOKIE_MAX_AGE, 60 * 60 * 24 * 7),
  },

  // --- Comportamento de acesso -------------------------------------------
  access: {
    // Site fechado: exige login para qualquer página (exceto login/registro
    // e páginas legais). Pode ser desligado via env para ambientes de demo.
    requireLoginForAccess: bool(process.env.REQUIRE_LOGIN_FOR_ACCESS, true),
    // Se registro público está disponível. Também pode ser controlado em
    // tempo real pelo admin (system_settings.allow_registration).
    allowRegistrationDefault: bool(process.env.ALLOW_REGISTRATION, false),
  },

  // --- Endpoint de setup remoto (/api/setup) ------------------------------
  // Desativado por padrão. Só funciona se SETUP_SECRET for definido - sem
  // isso o endpoint responde 404, mesmo com a env pública. NUNCA hard-code
  // este segredo: gere um valor aleatório e defina apenas quando for usar,
  // depois remova/rotacione.
  setup: {
    secret: process.env.SETUP_SECRET || '',
  },

  // --- Bootstrap do administrador master ---------------------------------
  // Usado apenas por database/setup.js e pela inicialização em modo
  // offline (memória) para criar/atualizar a conta admin inicial.
  // Nunca hard-code credenciais reais no código-fonte.
  adminBootstrap: {
    email: process.env.ADMIN_BOOTSTRAP_EMAIL || '',
    password: process.env.ADMIN_BOOTSTRAP_PASSWORD || '',
    name: process.env.ADMIN_BOOTSTRAP_NAME || 'Administrador',
  },

  // --- Site / branding (valores padrão; sobrescritos por system_settings) -
  site: {
    name: process.env.NEXT_PUBLIC_SITE_NAME || 'Superflix',
    description:
      process.env.NEXT_PUBLIC_SITE_DESCRIPTION ||
      'Plataforma de streaming com foco em TV ao vivo.',
    baseUrl: process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000',
  },

  // --- Proxy / bypass de bloqueios ---------------------------------------
  proxy: {
    enabled: bool(process.env.NEXT_PUBLIC_USE_PROXY, true),
    dohResolverUrl: process.env.DOH_RESOLVER_URL || 'https://1.1.1.1/dns-query',
    requestTimeoutMs: num(process.env.PROXY_TIMEOUT_MS, 15000),
  },

  // --- Provedores de conteúdo (seed para modo offline / primeira execução)
  // Em produção com banco de dados, os provedores reais são gerenciados
  // pelo painel administrativo (tabela `providers`). Estes valores só são
  // usados como carga inicial/fallback quando o banco não está configurado.
  providers: {
    vodSeedJson: process.env.DEFAULT_VOD_PROVIDERS_JSON || '',
    tvSeedJson: process.env.DEFAULT_TV_PROVIDERS_JSON || '',
    // Domínios extra (CDNs de stream, etc.) que também devem ser roteados
    // pelo proxy mesmo sem estarem cadastrados como provedor completo.
    extraProxyDomains: csv(process.env.EXTRA_PROXY_DOMAINS),
    // TTL do cache de canais/lista de provedores (ms)
    cacheTtlMs: num(process.env.PROVIDERS_CACHE_TTL_MS, 10 * 60 * 1000),
    // Quantas falhas seguidas até marcar um provedor como "down" e pular
    // para o próximo automaticamente.
    maxFailuresBeforeSkip: num(process.env.PROVIDER_MAX_FAILURES, 3),
  },
};

export type Env = typeof env;
