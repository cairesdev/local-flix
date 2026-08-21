import { NextRequest, NextResponse } from 'next/server';
import { getTvChannelsWithFailover } from '@/services/providers';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: NextRequest) {
  try {
    const forceRefresh = request.nextUrl.searchParams.get('refresh') === 'true';
    const result = await getTvChannelsWithFailover(forceRefresh);

    return NextResponse.json(
      {
        channels: result.channels,
        categories: result.categories,
        provider: result.providerName,
      },
      {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'public, s-maxage=600',
        },
      }
    );
  } catch (error) {
    console.error('[TV Channels] Erro ao carregar canais:', error);
    return NextResponse.json(
      {
        error:
          'Não foi possível carregar os canais de TV ao vivo no momento. Tente novamente em instantes.',
        channels: [],
        categories: [],
      },
      { status: 502 }
    );
  }
}
