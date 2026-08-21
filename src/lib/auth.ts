import jwt, { type SignOptions } from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { NextRequest } from 'next/server';
import { env } from '@/lib/env';

const JWT_SECRET = env.auth.jwtSecret;
// jsonwebtoken tipa `expiresIn` como um literal restrito (ex: '7d'), não
// `string` genérico. Como o valor vem de env (string livre), fazemos um
// cast explícito - a validação de formato acontece em runtime na própria
// lib caso o valor não seja válido.
const TOKEN_EXPIRY = env.auth.jwtExpiry as SignOptions['expiresIn'];
const COOKIE_NAME = env.auth.cookieName;

export interface JWTPayload {
  userId: number;
  email: string;
  isAdmin: boolean;
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function generateToken(payload: JWTPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: TOKEN_EXPIRY });
}

export function verifyToken(token: string): JWTPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as JWTPayload;
  } catch {
    return null;
  }
}

export function getTokenFromRequest(request: NextRequest): string | null {
  // 1) Header Authorization: Bearer <token> (usado pelo AuthContext no cliente)
  const authHeader = request.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }
  // 2) Cookie httpOnly (definido no login/registro) - permite que chamadas
  // que não anexam o header manualmente (ex.: telas do admin) continuem
  // autenticadas, já que o cookie sempre acompanha requests same-origin.
  const cookieToken = request.cookies.get(COOKIE_NAME)?.value;
  if (cookieToken) {
    return cookieToken;
  }
  return null;
}

export async function getCurrentUser(request: NextRequest): Promise<JWTPayload | null> {
  const token = getTokenFromRequest(request);
  if (!token) return null;
  return verifyToken(token);
}

// Higher-order function for protected routes
export function requireAuth<T>(
  handler: (request: NextRequest, context: T, user: JWTPayload) => Promise<Response>
) {
  return async (request: NextRequest, context: T): Promise<Response> => {
    const user = await getCurrentUser(request);
    if (!user) {
      return Response.json({ error: 'Não autorizado' }, { status: 401 });
    }
    return handler(request, context, user);
  };
}

// Higher-order function for admin routes
export function requireAdmin<T>(
  handler: (request: NextRequest, context: T, user: JWTPayload) => Promise<Response>
) {
  return async (request: NextRequest, context: T): Promise<Response> => {
    const user = await getCurrentUser(request);
    if (!user) {
      return Response.json({ error: 'Não autorizado' }, { status: 401 });
    }
    if (!user.isAdmin) {
      return Response.json({ error: 'Acesso de administrador necessário' }, { status: 403 });
    }
    return handler(request, context, user);
  };
}
