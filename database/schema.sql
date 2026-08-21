-- =============================================
-- SUPERFLIX DATABASE SCHEMA
-- PostgreSQL / Supabase
-- =============================================

-- Extensão para UUID (opcional, caso queira usar UUIDs)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================
-- TABELA: users
-- Armazena informações dos usuários
-- =============================================
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    name VARCHAR(255),
    password_hash VARCHAR(255) NOT NULL,
    is_admin BOOLEAN DEFAULT FALSE,
    status VARCHAR(20) DEFAULT 'active',
    last_login TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Índices para users
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);

-- =============================================
-- TABELA: watch_history
-- Histórico de visualização dos usuários
-- =============================================
CREATE TABLE IF NOT EXISTS watch_history (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    tmdb_id INTEGER NOT NULL,
    imdb_id VARCHAR(20),
    title VARCHAR(255) NOT NULL,
    poster_path VARCHAR(255),
    media_type VARCHAR(20) NOT NULL,
    season INTEGER,
    episode INTEGER,
    progress REAL DEFAULT 0,
    watched_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, tmdb_id, season, episode)
);

-- Índices para watch_history
CREATE INDEX IF NOT EXISTS idx_watch_history_user ON watch_history(user_id);
CREATE INDEX IF NOT EXISTS idx_watch_history_tmdb ON watch_history(tmdb_id);
CREATE INDEX IF NOT EXISTS idx_watch_history_watched ON watch_history(watched_at DESC);

-- =============================================
-- TABELA: favorites
-- Conteúdos favoritos dos usuários
-- =============================================
CREATE TABLE IF NOT EXISTS favorites (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    tmdb_id INTEGER NOT NULL,
    title VARCHAR(255) NOT NULL,
    poster_path VARCHAR(255),
    media_type VARCHAR(20) NOT NULL,
    added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, tmdb_id)
);

-- Índices para favorites
CREATE INDEX IF NOT EXISTS idx_favorites_user ON favorites(user_id);
CREATE INDEX IF NOT EXISTS idx_favorites_tmdb ON favorites(tmdb_id);

-- =============================================
-- TABELA: system_settings
-- Configurações do sistema
-- =============================================
CREATE TABLE IF NOT EXISTS system_settings (
    key VARCHAR(100) PRIMARY KEY,
    value TEXT,
    description TEXT,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_by INTEGER REFERENCES users(id)
);

-- =============================================
-- TABELA: admin_logs
-- Logs de ações administrativas
-- =============================================
CREATE TABLE IF NOT EXISTS admin_logs (
    id SERIAL PRIMARY KEY,
    admin_id INTEGER REFERENCES users(id),
    action VARCHAR(100) NOT NULL,
    target_type VARCHAR(50),
    target_id INTEGER,
    details JSONB,
    ip_address VARCHAR(45),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Índices para admin_logs
CREATE INDEX IF NOT EXISTS idx_admin_logs_admin ON admin_logs(admin_id);
CREATE INDEX IF NOT EXISTS idx_admin_logs_action ON admin_logs(action);
CREATE INDEX IF NOT EXISTS idx_admin_logs_created ON admin_logs(created_at DESC);

-- =============================================
-- CONFIGURAÇÕES INICIAIS DO SISTEMA
-- Site fechado por padrão: registro público desativado (allow_registration
-- = false). O admin cria contas pelo painel administrativo.
-- =============================================
INSERT INTO system_settings (key, value, description) VALUES
    ('site_name', 'Superflix', 'Nome do site'),
    ('site_description', 'Plataforma de streaming com foco em TV ao vivo', 'Descrição do site'),
    ('maintenance_mode', 'false', 'Modo de manutenção'),
    ('allow_registration', 'false', 'Permitir registro de novos usuários')
ON CONFLICT (key) DO NOTHING;

-- =============================================
-- USUÁRIO ADMIN MASTER
-- NÃO cadastramos credenciais fixas aqui: execute `npm run db:setup`
-- (database/setup.js) com ADMIN_BOOTSTRAP_EMAIL e ADMIN_BOOTSTRAP_PASSWORD
-- definidos no .env.local para criar/atualizar o administrador inicial.
-- =============================================

-- =============================================
-- FUNÇÃO: Atualizar updated_at automaticamente
-- =============================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger para users
DROP TRIGGER IF EXISTS update_users_updated_at ON users;
CREATE TRIGGER update_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Trigger para system_settings
DROP TRIGGER IF EXISTS update_system_settings_updated_at ON system_settings;
CREATE TRIGGER update_system_settings_updated_at
    BEFORE UPDATE ON system_settings
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- =============================================
-- TABELA: tv_favorites
-- Canais de TV favoritos dos usuarios
-- =============================================
CREATE TABLE IF NOT EXISTS tv_favorites (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    channel_id VARCHAR(100) NOT NULL,
    channel_name VARCHAR(255) NOT NULL,
    channel_logo VARCHAR(500),
    channel_category VARCHAR(100),
    added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, channel_id)
);

-- Indices para tv_favorites
CREATE INDEX IF NOT EXISTS idx_tv_favorites_user ON tv_favorites(user_id);
CREATE INDEX IF NOT EXISTS idx_tv_favorites_channel ON tv_favorites(channel_id);

-- =============================================
-- TABELA: tv_history
-- Historico de canais de TV assistidos
-- =============================================
CREATE TABLE IF NOT EXISTS tv_history (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    channel_id VARCHAR(100) NOT NULL,
    channel_name VARCHAR(255) NOT NULL,
    channel_logo VARCHAR(500),
    channel_category VARCHAR(100),
    watched_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, channel_id)
);

-- Indices para tv_history
CREATE INDEX IF NOT EXISTS idx_tv_history_user ON tv_history(user_id);
CREATE INDEX IF NOT EXISTS idx_tv_history_watched ON tv_history(watched_at DESC);

-- =============================================
-- TABELA: providers
-- Provedores de vídeo (VOD - filmes/séries - e TV ao vivo), gerenciados
-- pelo painel administrativo. Os sites que fornecem os players/streams
-- mudam de domínio com frequência (bloqueios); manter isso em banco em
-- vez de hard-coded permite trocar/adicionar espelhos sem deploy, com
-- fallback automático por prioridade quando um provedor falha.
-- =============================================
CREATE TABLE IF NOT EXISTS providers (
    id SERIAL PRIMARY KEY,
    type VARCHAR(10) NOT NULL CHECK (type IN ('vod', 'tv')),
    name VARCHAR(100) NOT NULL,
    base_url VARCHAR(500) NOT NULL,
    -- Somente VOD: templates de URL do player. Placeholders: {base} {id} {season} {episode}
    movie_path_template VARCHAR(255) DEFAULT '/filme/{id}',
    series_path_template VARCHAR(255) DEFAULT '/serie/{id}/{season}/{episode}',
    -- Somente TV: endpoint da lista de canais (JSON) e base do player por canal
    channels_url VARCHAR(500),
    player_base_url VARCHAR(500),
    priority INTEGER NOT NULL DEFAULT 100,
    is_active BOOLEAN DEFAULT TRUE,
    health_status VARCHAR(20) DEFAULT 'unknown',
    last_checked_at TIMESTAMP,
    failure_count INTEGER DEFAULT 0,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_providers_type_priority ON providers(type, priority);
CREATE INDEX IF NOT EXISTS idx_providers_active ON providers(is_active);

DROP TRIGGER IF EXISTS update_providers_updated_at ON providers;
CREATE TRIGGER update_providers_updated_at
    BEFORE UPDATE ON providers
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Seed inicial: replica o comportamento anterior (hard-coded) para não
-- quebrar instalações existentes. Pode ser editado livremente no admin.
INSERT INTO providers (type, name, base_url, priority, is_active)
SELECT * FROM (VALUES
    ('vod', 'SuperflixAPI (.cv)', 'https://superflixapi.cv', 10, TRUE),
    ('vod', 'SuperflixAPI (.run)', 'https://superflixapi.run', 20, TRUE),
    ('vod', 'SuperflixAPI (.buzz)', 'https://superflixapi.buzz', 30, TRUE),
    ('vod', 'SuperflixAPI (.top)', 'https://superflixapi.top', 40, TRUE)
) AS seed(type, name, base_url, priority, is_active)
WHERE NOT EXISTS (SELECT 1 FROM providers WHERE providers.type = 'vod');

INSERT INTO providers (type, name, base_url, channels_url, player_base_url, priority, is_active)
SELECT * FROM (VALUES
    ('tv', 'EmbedTV', 'https://embedtv.lat', 'https://embedtv.lat/channels.php', 'https://ww1.embedtv.lat', 10, TRUE)
) AS seed(type, name, base_url, channels_url, player_base_url, priority, is_active)
WHERE NOT EXISTS (SELECT 1 FROM providers WHERE providers.type = 'tv');

-- =============================================
-- FIM DO SCHEMA
-- =============================================
