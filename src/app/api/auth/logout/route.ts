import { NextResponse } from 'next/server';
import { env } from '@/lib/env';

export async function POST() {
  const response = NextResponse.json({
    message: 'Logout realizado com sucesso',
  });

  // Clear auth cookie
  response.cookies.set(env.auth.cookieName, '', {
    httpOnly: true,
    secure: env.isProduction,
    sameSite: 'lax',
    maxAge: 0, // Expire immediately
    path: '/',
  });

  return response;
}

export async function GET() {
  return POST();
}
