# AGENT.md

Este arquivo fornece orientações para agentes de IA (Claude Code, Cursor, Copilot, etc.) ao trabalhar com código neste repositório.

> **Para desenvolvedores usando "vibe coding":** Este arquivo contém o contexto necessário para que a IA entenda o projeto. Mantenha-o atualizado conforme o projeto evolui.

## Comandos de Build e Desenvolvimento

```bash
npm run dev      # Iniciar servidor de desenvolvimento em localhost:3000
npm run build    # Build de produção
npm run start    # Iniciar servidor de produção
npm run lint     # Executar ESLint
npm run db:setup # Criar tabelas + seed inicial (database/setup.js)
```

## Visão Geral da Arquitetura

Superflix é uma plataforma de streaming em português brasileiro construída com Next.js 16 (App Router), com **TV ao vivo como produto principal** ("/" redireciona para "/tv"), além de filmes, séries e animes (catálogo em "/catalogo") com metadados do TMDB. A reprodução de vídeo (TV e VOD) usa provedores de terceiros geridos dinamicamente (ver "Sistema de Provedores" abaixo) - nada de domínio/URL de player fica hard-coded no código.

O site é **fechado por padrão**: toda a aplicação exige login (`REQUIRE_LOGIN_FOR_ACCESS=true`), não só `/profile` e `/admin`. Não há cadastro público a menos que um admin habilite (`ALLOW_REGISTRATION`/painel admin).

### Grupos de Rotas

- `src/app/(main)/` - Layout principal com Header + MobileNav (sem Footer - removido; a navegação inferior no mobile já cobre o essencial)
  - `/` - redireciona para `/tv` (produto principal)
  - `/tv` - TV ao vivo (player embutido, lista de canais com fallback de provedor)
  - `/catalogo` - catálogo de filmes/séries/animes (era a home antiga)
  - `/movies`, `/series`, `/anime`, `/search`, `/watch/[type]/[id]`, `/profile`, `/admin`
  - `/termos`, `/privacidade`, `/dmca` - únicas páginas de conteúdo acessíveis sem login além de auth
- `src/app/(auth)/` - `/login`, `/register` com layout mínimo (glass card)
- `src/app/api/` - Rotas da API REST para auth, histórico, TV, VOD, admin (usuários/provedores/configurações/logs) e setup

Não existe mais página de "cronograma"/calendário - foi removida junto com o Footer.

### Sistema de Provedores (fallback automático)

Os sites que hospedam os players de filmes/séries/TV mudam de domínio com frequência por bloqueio. Em vez de URLs hard-coded, há uma tabela `providers` (tipo `vod` ou `tv`) gerenciada pelo painel admin (`/admin` > Provedores):

- **`src/services/providers.ts`** - núcleo do sistema: `getActiveProviders()`, `buildVodDirectUrl()`, `getTvChannelsWithFailover()`, `recordProviderOutcome()`, `testProvider()`. Provedores são ordenados por prioridade e health-tracked (`failure_count`/`health_status`); um provedor que falha repetidamente (`PROVIDER_MAX_FAILURES`) é pulado automaticamente em favor do próximo.
- **VOD**: `/api/vod/player-url` retorna candidatos ordenados por prioridade; `VideoPlayer.tsx` tenta cada um (modo direto → proxy) e reporta sucesso/falha de volta.
- **TV**: `/api/tv/channels` usa `getTvChannelsWithFailover()` para buscar a lista de canais do provedor ativo com fallback.
- Sem banco de dados configurado (modo offline), `DEFAULT_VOD_PROVIDERS_JSON`/`DEFAULT_TV_PROVIDERS_JSON` (env) servem de seed inicial.

### Proxy (bypass de bloqueios de rede)

`src/app/api/proxy/{route,embed,asset,hls}/route.ts` resolvem os domínios via DNS-over-HTTPS (Cloudflare, configurável via `DOH_RESOLVER_URL`) e reescrevem URLs em HTML/M3U8 para contornar bloqueios de DNS/rede locais. A lista de domínios permitidos é computada dinamicamente a partir dos provedores cadastrados (`getAllowedProxyHosts()`), não mais hard-coded.

### Serviços Principais

- **Serviço TMDB** (`src/services/tmdb.ts`): Metadados de conteúdo, busca e descoberta com cache em memória (TTL de 10 minutos). Use os helpers `tmdb.getTitle()` e `tmdb.getReleaseDate()` já que filmes usam `title`/`release_date` enquanto séries usam `name`/`first_air_date`.
- **Parser M3U** (`src/services/m3u.ts`): Faz parsing de playlists M3U para canais de TV ao vivo. Filtra canais offline e linhas de cabeçalho, detecta automaticamente canais e categorias brasileiras.
- **EmbedTV** (`src/services/embedtv.ts`): monta a URL do player de um canal (`getEmbedPlayerUrl(channel, useProxy)`) a partir do `player_base_url` do provedor ativo.

### Fluxo de Autenticação

1. **Middleware** (`src/middleware.ts`) protege **todas as rotas** por padrão (site fechado), exceto o allowlist `/login`, `/register`, `/termos`, `/privacidade`, `/dmca` (e assets estáticos/API). A verificação do JWT no middleware usa `src/lib/auth-edge.ts` (lib `jose`), compatível com o Edge Runtime - `jsonwebtoken` (usado nas rotas de API) não roda no Edge. `/admin` exige adicionalmente `isAdmin`, com defesa em profundidade (checado de novo em cada rota de API).
2. Rotas da API usam HOFs `requireAuth()` ou `requireAdmin()` de `src/lib/auth.ts` (verificação completa com `jsonwebtoken`, roda em Node runtime) para validação JWT.
3. Estado do cliente gerenciado via `AuthContext` com persistência em localStorage; o cookie httpOnly `auth_token` é a fonte de verdade no servidor.
4. Login/registro respeitam `?redirect=` (para onde o middleware mandou o usuário) e propagam esse parâmetro entre as duas páginas.
5. `REQUIRE_LOGIN_FOR_ACCESS=false` (só recomendado para demos) volta ao comportamento antigo: apenas `/profile` e `/admin` exigem login.

### Banco de Dados

Usa `pg` (node-postgres) para conexão direta com PostgreSQL, com um helper `sql` (tagged template) em `src/lib/db.ts`. Modo offline automático (fallback para memória, incluindo seed de provedores) quando `POSTGRES_URL` não está definida - útil para dev, nunca use em produção.

Tabelas: `users`, `watch_history`, `favorites`, `providers`, `system_settings`, `admin_logs`.

Variável necessária: `POSTGRES_URL` (ou `DATABASE_URL`).

Para criar tabelas + seed inicial: `npm run db:setup` (lê `ADMIN_BOOTSTRAP_*` do env para criar a primeira conta admin - sem essas variáveis, nenhuma conta é criada automaticamente).

### Administração (`/admin`)

Painel com navegação lateral (`src/app/(main)/admin/page.tsx`), cada aba em `src/components/admin/`:
- **Painel** - métricas gerais (usuários, ativos, novos, reproduções)
- **Usuários** (`UsersPanel.tsx`) - CRUD completo, promover/rebaixar admin, resetar senha, com proteções para não remover/apagar a própria conta admin
- **Provedores** (`ProvidersPanel.tsx`) - CRUD de provedores VOD/TV, reordenar prioridade, testar disponibilidade, ativar/desativar
- **Configurações** (`SettingsPanel.tsx`) - nome/descrição do site, modo manutenção, permitir cadastro, etc. (`system_settings`)
- **Logs** (`LogsPanel.tsx`) - auditoria de ações administrativas (`admin_logs`)

### Providers de Contexto

Envolvidos em ordem via `src/components/Providers.tsx`:
- `ThemeProvider` - Modo escuro/claro
- `AuthProvider` - Estado da sessão do usuário
- `ToastProvider` - Sistema de notificações

### Alias de Caminho

Use `@/*` para importar de `src/*` (configurado em tsconfig.json).

## Variáveis de Ambiente

Configuração centralizada em `src/lib/env.ts` - **nunca leia `process.env` diretamente fora desse arquivo**. Lista completa e comentada em `.env.example`.

### Obrigatórias
- `NEXT_PUBLIC_TMDB_API_KEY` - Chave da API TMDB
- `POSTGRES_URL` - String de conexão PostgreSQL (produção)
- `JWT_SECRET` - Segredo para assinar tokens JWT (produção)

### Recomendadas na primeira instalação
- `ADMIN_BOOTSTRAP_EMAIL` / `ADMIN_BOOTSTRAP_PASSWORD` / `ADMIN_BOOTSTRAP_NAME` - conta admin inicial

### Mais usadas entre as opcionais
- `REQUIRE_LOGIN_FOR_ACCESS` (padrão `true`) - site fechado
- `ALLOW_REGISTRATION` (padrão `false`)
- `NEXT_PUBLIC_BASE_URL`, `NEXT_PUBLIC_SITE_NAME`, `NEXT_PUBLIC_SITE_DESCRIPTION`
- `NEXT_PUBLIC_USE_PROXY`, `DOH_RESOLVER_URL`
- `DEFAULT_VOD_PROVIDERS_JSON` / `DEFAULT_TV_PROVIDERS_JSON` (seed do modo offline)

Veja `.env.example` para a lista completa com todos os detalhes.

## Estilização

Tailwind CSS v4 com `@tailwindcss/postcss`. Design system "Apple TV inspired" em `src/app/globals.css` (tokens `--bg-*`, `--text-*`, `--accent-*`, `.glass`/`.glass-card`). Tema escuro é padrão e único (fundo `#000000`).

## Tipos de Conteúdo

Conteúdo do TMDB usa campos polimórficos:
- Filmes: `title`, `release_date`
- Séries: `name`, `first_air_date`
- Sempre verifique `media_type` ou use funções helper para lidar com ambos.

## Verificação após mudanças

`npx tsc --noEmit --pretty false` é o comando confiável de verificação neste ambiente (um `next build` completo pode falhar em sandboxes sem acesso a `fonts.googleapis.com` - não é um bug real da aplicação; valide o build completo no seu próprio ambiente antes de publicar).
