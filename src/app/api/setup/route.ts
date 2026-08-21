import { NextRequest, NextResponse } from 'next/server';
import { query, initializeDatabase, isOfflineMode } from '@/lib/db';
import { hashPassword } from '@/lib/auth';
import { env } from '@/lib/env';
import { setSettings } from '@/lib/settings';

/**
 * Endpoint de setup remoto - usado para inicializar tabelas e o
 * administrador master em ambientes onde não é possível rodar
 * `npm run db:setup` diretamente (ex.: alguns hosts serverless).
 *
 * Fica DESATIVADO por padrão (responde 404). Só funciona se a variável de
 * ambiente SETUP_SECRET estiver definida, e mesmo assim exige que o
 * segredo seja enviado no header `x-setup-secret` (nunca na query string,
 * para não vazar em logs de acesso/referrer). Depois de usar, remova
 * SETUP_SECRET do ambiente para desativar o endpoint novamente.
 *
 * As credenciais do admin master vêm de ADMIN_BOOTSTRAP_EMAIL e
 * ADMIN_BOOTSTRAP_PASSWORD - nunca hard-coded no código.
 */
export async function POST(request: NextRequest) {
  if (!env.setup.secret) {
    // Endpoint desativado - não revela nem que existe.
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const providedSecret = request.headers.get('x-setup-secret');
  if (!providedSecret || providedSecret !== env.setup.secret) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  }

  const logs: string[] = [];

  try {
    logs.push('Iniciando configuração do banco de dados...');

    if (isOfflineMode) {
      return NextResponse.json(
        {
          success: false,
          error: 'POSTGRES_URL não configurada - nada para inicializar (modo memória).',
          logs,
        },
        { status: 400 }
      );
    }

    await initializeDatabase();
    logs.push('Tabelas criadas/verificadas.');

    await setSettings({}); // garante que os defaults fiquem visíveis via getSettings()
    logs.push('Configurações padrão do sistema verificadas.');

    if (!env.adminBootstrap.email || !env.adminBootstrap.password) {
      logs.push(
        'ADMIN_BOOTSTRAP_EMAIL / ADMIN_BOOTSTRAP_PASSWORD não definidos - nenhum admin foi criado. ' +
          'Defina essas variáveis e chame o endpoint novamente, ou crie o primeiro admin manualmente no banco.'
      );
      return NextResponse.json({ success: true, message: 'Setup parcial concluído.', logs });
    }

    const existingAdmin = await query<{ id: number }>(
      'SELECT id FROM users WHERE email = $1',
      [env.adminBootstrap.email]
    );

    const passwordHash = await hashPassword(env.adminBootstrap.password);

    if (existingAdmin.rows.length > 0) {
      await query(
        'UPDATE users SET password_hash = $1, is_admin = TRUE, name = $2, status = $3 WHERE email = $4',
        [passwordHash, env.adminBootstrap.name, 'active', env.adminBootstrap.email]
      );
      logs.push('Administrador existente atualizado.');
    } else {
      await query(
        `INSERT INTO users (email, name, password_hash, is_admin, status)
         VALUES ($1, $2, $3, TRUE, 'active')`,
        [env.adminBootstrap.email, env.adminBootstrap.name, passwordHash]
      );
      logs.push('Administrador criado.');
    }

    logs.push('Setup concluído com sucesso. As credenciais não são retornadas nesta resposta.');

    return NextResponse.json({ success: true, message: 'Banco de dados configurado com sucesso.', logs });
  } catch (error) {
    console.error('Erro no setup:', error);
    logs.push(`ERRO: ${error}`);

    return NextResponse.json(
      { success: false, error: 'Erro ao configurar o banco de dados.', logs },
      { status: 500 }
    );
  }
}
