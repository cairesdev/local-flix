import { NextRequest, NextResponse } from 'next/server';
import { sql, isOfflineMode, inMemoryData, type Provider } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { testProvider } from '@/services/providers';

/** Testa a conectividade de um provedor (botão "Testar" no admin). */
export async function POST(request: NextRequest) {
  const user = await getCurrentUser(request);
  if (!user || !user.isAdmin) {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
  }

  const { id } = await request.json();
  if (!id) return NextResponse.json({ error: 'id é obrigatório' }, { status: 400 });

  let provider: Provider | undefined;
  if (isOfflineMode) {
    provider = inMemoryData.providers.find((p) => p.id === id);
  } else {
    const result = await sql<Provider>`SELECT * FROM providers WHERE id = ${id}`;
    provider = result.rows[0];
  }

  if (!provider) {
    return NextResponse.json({ error: 'Provedor não encontrado' }, { status: 404 });
  }

  const outcome = await testProvider(provider);
  return NextResponse.json(outcome);
}
