import { NextRequest, NextResponse } from 'next/server';
import { sql, isOfflineMode, inMemoryData, type Provider } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { invalidateProvidersCache } from '@/services/providers';

async function requireAdminUser(request: NextRequest) {
  const user = await getCurrentUser(request);
  if (!user || !user.isAdmin) return null;
  return user;
}

async function logAdminAction(adminId: number, action: string, targetId?: number, details?: unknown) {
  if (isOfflineMode) return;
  try {
    await sql`
      INSERT INTO admin_logs (admin_id, action, target_type, target_id, details)
      VALUES (${adminId}, ${action}, 'provider', ${targetId ?? null}, ${JSON.stringify(details || {})})
    `;
  } catch (error) {
    console.error('Erro ao registrar admin_log:', error);
  }
}

export async function GET(request: NextRequest) {
  const user = await requireAdminUser(request);
  if (!user) return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });

  if (isOfflineMode) {
    const providers = [...inMemoryData.providers].sort((a, b) => a.type.localeCompare(b.type) || a.priority - b.priority);
    return NextResponse.json({ providers });
  }

  const result = await sql<Provider>`SELECT * FROM providers ORDER BY type, priority ASC`;
  return NextResponse.json({ providers: result.rows });
}

export async function POST(request: NextRequest) {
  const user = await requireAdminUser(request);
  if (!user) return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });

  const body = await request.json();
  const { type, name, base_url } = body;

  if (type !== 'vod' && type !== 'tv') {
    return NextResponse.json({ error: 'type deve ser "vod" ou "tv"' }, { status: 400 });
  }
  if (!name || !base_url) {
    return NextResponse.json({ error: 'name e base_url são obrigatórios' }, { status: 400 });
  }
  if (type === 'tv' && (!body.channels_url || !body.player_base_url)) {
    return NextResponse.json(
      { error: 'Provedores de TV precisam de channels_url e player_base_url' },
      { status: 400 }
    );
  }

  const record: Omit<Provider, 'id'> = {
    type,
    name,
    base_url,
    movie_path_template: body.movie_path_template || '/filme/{id}',
    series_path_template: body.series_path_template || '/serie/{id}/{season}/{episode}',
    channels_url: body.channels_url || null,
    player_base_url: body.player_base_url || null,
    priority: typeof body.priority === 'number' ? body.priority : 100,
    is_active: body.is_active !== undefined ? !!body.is_active : true,
    health_status: 'unknown',
    last_checked_at: null,
    failure_count: 0,
    notes: body.notes || null,
    created_at: new Date(),
    updated_at: new Date(),
  };

  if (isOfflineMode) {
    const nextId = Math.max(0, ...inMemoryData.providers.map((p) => p.id)) + 1;
    const created: Provider = { ...record, id: nextId };
    inMemoryData.providers.push(created);
    invalidateProvidersCache();
    return NextResponse.json({ message: 'Provedor criado', provider: created });
  }

  const result = await sql<Provider>`
    INSERT INTO providers (
      type, name, base_url, movie_path_template, series_path_template,
      channels_url, player_base_url, priority, is_active, notes
    ) VALUES (
      ${record.type}, ${record.name}, ${record.base_url}, ${record.movie_path_template},
      ${record.series_path_template}, ${record.channels_url}, ${record.player_base_url},
      ${record.priority}, ${record.is_active}, ${record.notes}
    )
    RETURNING *
  `;

  invalidateProvidersCache();
  await logAdminAction(user.userId, 'create_provider', result.rows[0].id, { name, type });

  return NextResponse.json({ message: 'Provedor criado', provider: result.rows[0] });
}

export async function PUT(request: NextRequest) {
  const user = await requireAdminUser(request);
  if (!user) return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });

  const body = await request.json();

  // Reordenação em lote: [{id, priority}, ...]
  if (Array.isArray(body.order)) {
    if (isOfflineMode) {
      body.order.forEach((item: { id: number; priority: number }) => {
        const provider = inMemoryData.providers.find((p) => p.id === item.id);
        if (provider) provider.priority = item.priority;
      });
    } else {
      for (const item of body.order as { id: number; priority: number }[]) {
        await sql`UPDATE providers SET priority = ${item.priority}, updated_at = CURRENT_TIMESTAMP WHERE id = ${item.id}`;
      }
    }
    invalidateProvidersCache();
    await logAdminAction(user.userId, 'reorder_providers', undefined, { order: body.order });
    return NextResponse.json({ message: 'Prioridades atualizadas' });
  }

  const { id, ...fields } = body;
  if (!id) return NextResponse.json({ error: 'id é obrigatório' }, { status: 400 });

  const allowedFields = [
    'name',
    'base_url',
    'movie_path_template',
    'series_path_template',
    'channels_url',
    'player_base_url',
    'priority',
    'is_active',
    'notes',
  ] as const;

  if (isOfflineMode) {
    const provider = inMemoryData.providers.find((p) => p.id === id);
    if (!provider) return NextResponse.json({ error: 'Provedor não encontrado' }, { status: 404 });
    allowedFields.forEach((key) => {
      if (fields[key] !== undefined) {
        (provider as unknown as Record<string, unknown>)[key] = fields[key];
      }
    });
    provider.updated_at = new Date();
    invalidateProvidersCache();
    return NextResponse.json({ message: 'Provedor atualizado', provider });
  }

  const updates = allowedFields.filter((key) => fields[key] !== undefined);
  if (updates.length === 0) {
    return NextResponse.json({ error: 'Nenhum campo para atualizar' }, { status: 400 });
  }

  // O helper `sql` não soma SET dinâmico com segurança, então atualizamos
  // campo a campo de forma explícita (cada valor continua parametrizado).
  for (const key of updates) {
    const value = fields[key];
    switch (key) {
      case 'name':
        await sql`UPDATE providers SET name = ${value}, updated_at = CURRENT_TIMESTAMP WHERE id = ${id}`;
        break;
      case 'base_url':
        await sql`UPDATE providers SET base_url = ${value}, updated_at = CURRENT_TIMESTAMP WHERE id = ${id}`;
        break;
      case 'movie_path_template':
        await sql`UPDATE providers SET movie_path_template = ${value}, updated_at = CURRENT_TIMESTAMP WHERE id = ${id}`;
        break;
      case 'series_path_template':
        await sql`UPDATE providers SET series_path_template = ${value}, updated_at = CURRENT_TIMESTAMP WHERE id = ${id}`;
        break;
      case 'channels_url':
        await sql`UPDATE providers SET channels_url = ${value}, updated_at = CURRENT_TIMESTAMP WHERE id = ${id}`;
        break;
      case 'player_base_url':
        await sql`UPDATE providers SET player_base_url = ${value}, updated_at = CURRENT_TIMESTAMP WHERE id = ${id}`;
        break;
      case 'priority':
        await sql`UPDATE providers SET priority = ${value}, updated_at = CURRENT_TIMESTAMP WHERE id = ${id}`;
        break;
      case 'is_active':
        await sql`UPDATE providers SET is_active = ${value}, updated_at = CURRENT_TIMESTAMP WHERE id = ${id}`;
        break;
      case 'notes':
        await sql`UPDATE providers SET notes = ${value}, updated_at = CURRENT_TIMESTAMP WHERE id = ${id}`;
        break;
    }
  }

  const result = await sql<Provider>`SELECT * FROM providers WHERE id = ${id}`;
  if (result.rows.length === 0) {
    return NextResponse.json({ error: 'Provedor não encontrado' }, { status: 404 });
  }

  invalidateProvidersCache();
  await logAdminAction(user.userId, 'update_provider', id, fields);

  return NextResponse.json({ message: 'Provedor atualizado', provider: result.rows[0] });
}

export async function DELETE(request: NextRequest) {
  const user = await requireAdminUser(request);
  if (!user) return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });

  const id = Number(request.nextUrl.searchParams.get('id'));
  if (!id) return NextResponse.json({ error: 'id é obrigatório' }, { status: 400 });

  if (isOfflineMode) {
    const idx = inMemoryData.providers.findIndex((p) => p.id === id);
    if (idx < 0) return NextResponse.json({ error: 'Provedor não encontrado' }, { status: 404 });
    inMemoryData.providers.splice(idx, 1);
    invalidateProvidersCache();
    return NextResponse.json({ message: 'Provedor removido' });
  }

  const result = await sql`DELETE FROM providers WHERE id = ${id} RETURNING id`;
  if (result.rows.length === 0) {
    return NextResponse.json({ error: 'Provedor não encontrado' }, { status: 404 });
  }

  invalidateProvidersCache();
  await logAdminAction(user.userId, 'delete_provider', id);

  return NextResponse.json({ message: 'Provedor removido' });
}
