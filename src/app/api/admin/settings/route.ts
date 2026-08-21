import { NextRequest, NextResponse } from 'next/server';
import { sql, isOfflineMode } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { getSettings, setSettings, SETTINGS_DEFAULTS } from '@/lib/settings';

/**
 * GET/PUT retornam e recebem um objeto "achatado" (key -> valor em
 * string), consistente entre modo offline e PostgreSQL. O PUT aceita
 * atualizar várias chaves de uma vez (o painel admin salva tudo junto).
 */
export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user || !user.isAdmin) {
      return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
    }

    const settings = await getSettings(true);
    return NextResponse.json({ settings });
  } catch (error) {
    console.error('Get settings error:', error);
    return NextResponse.json({ error: 'Erro ao buscar configurações' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user || !user.isAdmin) {
      return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
    }

    const body = await request.json();

    // Aceita tanto {key, value} (compatibilidade) quanto um objeto com
    // várias chaves de uma vez: {site_name: '...', maintenance_mode: '...'}
    const updates: Record<string, string> = {};

    if (typeof body.key === 'string') {
      updates[body.key] = String(body.value ?? '');
    } else {
      Object.keys(SETTINGS_DEFAULTS).forEach((key) => {
        if (body[key] !== undefined) {
          updates[key] = String(body[key]);
        }
      });
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'Nenhuma configuração válida enviada' }, { status: 400 });
    }

    await setSettings(updates, user.userId);

    if (!isOfflineMode) {
      await sql`
        INSERT INTO admin_logs (admin_id, action, target_type, details)
        VALUES (${user.userId}, 'update_settings', 'setting', ${JSON.stringify(updates)})
      `;
    }

    const settings = await getSettings(true);
    return NextResponse.json({ message: 'Configurações salvas com sucesso', settings });
  } catch (error) {
    console.error('Update setting error:', error);
    return NextResponse.json({ error: 'Erro ao atualizar configuração' }, { status: 500 });
  }
}
