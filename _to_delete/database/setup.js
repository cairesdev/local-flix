/**
 * Script para configurar o banco de dados PostgreSQL
 *
 * Uso: node database/setup.js
 */

const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

// Carregar variaveis de ambiente
require('dotenv').config({ path: '.env.local' });

const POSTGRES_URL = process.env.POSTGRES_URL || process.env.DATABASE_URL;

if (!POSTGRES_URL) {
  console.error('POSTGRES_URL nao configurada no .env.local');
  process.exit(1);
}

// Configurar SSL baseado na URL
const useSSL = !POSTGRES_URL.includes('sslmode=disable');

const pool = new Pool({
  connectionString: POSTGRES_URL,
  ssl: useSSL ? { rejectUnauthorized: false } : false,
});

async function setup() {
  console.log('🚀 Iniciando configuração do banco de dados...\n');

  const client = await pool.connect();

  try {
    // 1. Criar tabela users
    console.log('📦 Criando tabela users...');
    await client.query(`
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
      )
    `);
    console.log('  ✅ Tabela users criada');

    // 2. Criar tabela watch_history
    console.log('📦 Criando tabela watch_history...');
    await client.query(`
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
      )
    `);
    console.log('  ✅ Tabela watch_history criada');

    // 3. Criar tabela favorites
    console.log('📦 Criando tabela favorites...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS favorites (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        tmdb_id INTEGER NOT NULL,
        title VARCHAR(255) NOT NULL,
        poster_path VARCHAR(255),
        media_type VARCHAR(20) NOT NULL,
        added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, tmdb_id)
      )
    `);
    console.log('  ✅ Tabela favorites criada');

    // 4. Criar tabela system_settings
    console.log('📦 Criando tabela system_settings...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS system_settings (
        key VARCHAR(100) PRIMARY KEY,
        value TEXT,
        description TEXT,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_by INTEGER REFERENCES users(id)
      )
    `);
    console.log('  ✅ Tabela system_settings criada');

    // 5. Criar tabela admin_logs
    console.log('📦 Criando tabela admin_logs...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS admin_logs (
        id SERIAL PRIMARY KEY,
        admin_id INTEGER REFERENCES users(id),
        action VARCHAR(100) NOT NULL,
        target_type VARCHAR(50),
        target_id INTEGER,
        details JSONB,
        ip_address VARCHAR(45),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('  ✅ Tabela admin_logs criada');

    // 6. Criar tabela tv_favorites
    console.log('📦 Criando tabela tv_favorites...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS tv_favorites (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        channel_id VARCHAR(100) NOT NULL,
        channel_name VARCHAR(255) NOT NULL,
        channel_logo VARCHAR(500),
        channel_category VARCHAR(100),
        added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, channel_id)
      )
    `);
    console.log('  ✅ Tabela tv_favorites criada');

    // 7. Criar tabela tv_history
    console.log('📦 Criando tabela tv_history...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS tv_history (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        channel_id VARCHAR(100) NOT NULL,
        channel_name VARCHAR(255) NOT NULL,
        channel_logo VARCHAR(500),
        channel_category VARCHAR(100),
        watched_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, channel_id)
      )
    `);
    console.log('  ✅ Tabela tv_history criada');

    // 8. Criar tabela providers (provedores de vídeo gerenciáveis)
    console.log('📦 Criando tabela providers...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS providers (
        id SERIAL PRIMARY KEY,
        type VARCHAR(10) NOT NULL CHECK (type IN ('vod', 'tv')),
        name VARCHAR(100) NOT NULL,
        base_url VARCHAR(500) NOT NULL,
        movie_path_template VARCHAR(255) DEFAULT '/filme/{id}',
        series_path_template VARCHAR(255) DEFAULT '/serie/{id}/{season}/{episode}',
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
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_providers_type_priority ON providers(type, priority)`);
    console.log('  ✅ Tabela providers criada');

    // 9. Inserir configurações do sistema (site fechado por padrão)
    console.log('\n⚙️ Inserindo configurações do sistema...');
    await client.query(`
      INSERT INTO system_settings (key, value, description) VALUES
        ('site_name', 'Superflix', 'Nome do site'),
        ('site_description', 'Plataforma de streaming com foco em TV ao vivo', 'Descrição do site'),
        ('maintenance_mode', 'false', 'Modo de manutenção'),
        ('allow_registration', 'false', 'Permitir registro de novos usuários')
      ON CONFLICT (key) DO NOTHING
    `);
    console.log('  ✅ Configurações inseridas');

    // 10. Seed dos provedores padrão (replica o comportamento anterior)
    console.log('\n📡 Verificando provedores padrão...');
    const existingVodProviders = await client.query(`SELECT id FROM providers WHERE type = 'vod' LIMIT 1`);
    if (existingVodProviders.rows.length === 0) {
      await client.query(`
        INSERT INTO providers (type, name, base_url, priority, is_active) VALUES
          ('vod', 'SuperflixAPI (.cv)', 'https://superflixapi.cv', 10, TRUE),
          ('vod', 'SuperflixAPI (.run)', 'https://superflixapi.run', 20, TRUE),
          ('vod', 'SuperflixAPI (.buzz)', 'https://superflixapi.buzz', 30, TRUE),
          ('vod', 'SuperflixAPI (.top)', 'https://superflixapi.top', 40, TRUE)
      `);
      console.log('  ✅ Provedores VOD padrão criados');
    } else {
      console.log('  ℹ️ Provedores VOD já existem, mantidos como estão');
    }
    const existingTvProviders = await client.query(`SELECT id FROM providers WHERE type = 'tv' LIMIT 1`);
    if (existingTvProviders.rows.length === 0) {
      await client.query(`
        INSERT INTO providers (type, name, base_url, channels_url, player_base_url, priority, is_active) VALUES
          ('tv', 'EmbedTV', 'https://embedtv.best', 'https://embedtv.best/channels.php', 'https://www1.embedtv.best', 10, TRUE)
      `);
      console.log('  ✅ Provedor de TV ao vivo padrão criado');
    } else {
      console.log('  ℹ️ Provedores de TV já existem, mantidos como estão');
    }

    // 11. Criar usuario admin master a partir de variaveis de ambiente
    console.log('\nVerificando usuario administrador master...');

    const adminMasterEmail = process.env.ADMIN_BOOTSTRAP_EMAIL;
    const adminMasterPassword = process.env.ADMIN_BOOTSTRAP_PASSWORD;
    const adminMasterName = process.env.ADMIN_BOOTSTRAP_NAME || 'Administrador';

    if (!adminMasterEmail || !adminMasterPassword) {
      console.log('  ⚠️ ADMIN_BOOTSTRAP_EMAIL / ADMIN_BOOTSTRAP_PASSWORD não definidos em .env.local.');
      console.log('     Nenhum administrador foi criado automaticamente. Defina essas variáveis e rode');
      console.log('     "npm run db:setup" novamente para criar o admin master.');
    } else {
      const existingAdminMaster = await client.query(
        'SELECT id FROM users WHERE email = $1',
        [adminMasterEmail]
      );

      const passwordHashMaster = await bcrypt.hash(adminMasterPassword, 10);

      if (existingAdminMaster.rows.length > 0) {
        console.log('  ⚠️ Admin Master já existe, atualizando...');
        await client.query(
          'UPDATE users SET password_hash = $1, is_admin = TRUE, name = $2, status = $3 WHERE email = $4',
          [passwordHashMaster, adminMasterName, 'active', adminMasterEmail]
        );
        console.log('  ✅ Admin Master atualizado');
      } else {
        await client.query(
          `INSERT INTO users (email, name, password_hash, is_admin, status)
           VALUES ($1, $2, $3, TRUE, 'active')`,
          [adminMasterEmail, adminMasterName, passwordHashMaster]
        );
        console.log('  ✅ Admin Master criado');
      }
      console.log(`  📋 Email do Admin Master: ${adminMasterEmail}`);
      console.log('  🔑 Senha: a definida em ADMIN_BOOTSTRAP_PASSWORD (não exibida no log)');
    }

    console.log('\n🎉 ================================');
    console.log('   SETUP CONCLUÍDO COM SUCESSO!');
    console.log('================================\n');

  } catch (error) {
    console.error('\n❌ Erro:', error.message);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

setup().catch((err) => {
  console.error('Setup failed:', err);
  process.exit(1);
});
