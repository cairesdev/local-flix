/**
 * Verificação de JWT compatível com o Edge Runtime (usado pelo
 * middleware). `jsonwebtoken` (src/lib/auth.ts) depende de APIs do Node
 * que não existem no Edge, então o middleware usa `jose` aqui - uma lib
 * separada e mínima só para não puxar esse módulo inteiro (bcryptjs, etc.)
 * para o bundle do middleware.
 */
import { jwtVerify } from 'jose';
import { env } from '@/lib/env';

export interface JWTPayload {
  userId: number;
  email: string;
  isAdmin: boolean;
}

const secretKey = new TextEncoder().encode(env.auth.jwtSecret);

/** Verifica o token e retorna o payload, ou `null` se inválido/expirado. */
export async function verifyTokenEdge(token: string): Promise<JWTPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey);
    if (
      typeof payload.userId !== 'number' ||
      typeof payload.email !== 'string' ||
      typeof payload.isAdmin !== 'boolean'
    ) {
      return null;
    }
    return payload as unknown as JWTPayload;
  } catch {
    return null;
  }
}
