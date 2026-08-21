import { NextRequest, NextResponse } from 'next/server';
import { getActiveProviders, buildVodDirectUrl, recordProviderOutcome } from '@/services/providers';

/**
 * Devolve os candidatos de URL de reprodução (filme/série) já ordenados
 * por prioridade/saúde do provedor, para o player no cliente tentar em
 * sequência caso um provedor esteja bloqueado/fora do ar.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const mediaType = searchParams.get('mediaType');
    const id = searchParams.get('id');
    const season = searchParams.get('season');
    const episode = searchParams.get('episode');

    if ((mediaType !== 'movie' && mediaType !== 'tv') || !id) {
      return NextResponse.json({ error: 'Parâmetros inválidos' }, { status: 400 });
    }

    const providers = await getActiveProviders('vod');

    if (providers.length === 0) {
      return NextResponse.json(
        { error: 'Nenhum provedor de vídeo configurado. Cadastre um no painel admin.' },
        { status: 503 }
      );
    }

    const candidates = providers.map((provider) => {
      const directUrl = buildVodDirectUrl(
        provider,
        mediaType,
        id,
        season ? Number(season) : undefined,
        episode ? Number(episode) : undefined
      );

      return {
        providerId: provider.id,
        name: provider.name,
        directUrl,
        proxiedUrl: `/api/proxy/embed?url=${encodeURIComponent(directUrl)}`,
      };
    });

    return NextResponse.json({ candidates });
  } catch (error) {
    console.error('[vod/player-url] Erro:', error);
    return NextResponse.json({ error: 'Erro ao montar URL do player' }, { status: 500 });
  }
}

/** Registra sucesso/falha de reprodução para health-check do provedor. */
export async function POST(request: NextRequest) {
  try {
    const { providerId, success } = await request.json();
    if (typeof providerId !== 'number' || typeof success !== 'boolean') {
      return NextResponse.json({ error: 'Payload inválido' }, { status: 400 });
    }
    await recordProviderOutcome(providerId, success);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[vod/player-url] Erro ao registrar resultado:', error);
    return NextResponse.json({ error: 'Erro ao registrar resultado' }, { status: 500 });
  }
}
