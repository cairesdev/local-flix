import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { verifyTokenEdge } from '@/lib/auth-edge';
import { env } from '@/lib/env';

// Páginas acessíveis sem login mesmo com o site fechado: autenticação e
// páginas legais/institucionais. Tudo mais exige sessão válida.
const PUBLIC_PATHS = ['/login', '/register', '/termos', '/privacidade', '/dmca'];

// Sub-rota que, dentro das páginas protegidas, exige também `isAdmin`.
const ADMIN_PATH = '/admin';

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get(env.auth.cookieName)?.value;
  const user = token ? await verifyTokenEdge(token) : null;

  const isPublic = isPublicPath(pathname);

  // Site fechado (padrão): qualquer página fora do allowlist exige uma
  // sessão válida (não basta o cookie existir - o token é verificado).
  if (env.access.requireLoginForAccess) {
    if (!isPublic && !user) {
      const loginUrl = new URL('/login', request.url);
      loginUrl.searchParams.set('redirect', pathname);
      return NextResponse.redirect(loginUrl);
    }

    // Já logado tentando acessar login/registro - manda para a home (TV).
    if (isPublic && user && (pathname === '/login' || pathname.startsWith('/login/') || pathname === '/register' || pathname.startsWith('/register/'))) {
      return NextResponse.redirect(new URL('/', request.url));
    }
  } else {
    // Modo "aberto" (apenas para ambientes de demo via env) - protege só
    // as áreas sensíveis, como no comportamento original do app.
    const requiresAuth = pathname.startsWith('/profile') || pathname.startsWith(ADMIN_PATH);
    if (requiresAuth && !user) {
      const loginUrl = new URL('/login', request.url);
      loginUrl.searchParams.set('redirect', pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

  // Independentemente do modo de acesso: área /admin sempre exige
  // usuário autenticado E administrador (defesa em profundidade - o
  // cliente e as rotas de API também checam isso).
  if (pathname.startsWith(ADMIN_PATH)) {
    if (!user) {
      const loginUrl = new URL('/login', request.url);
      loginUrl.searchParams.set('redirect', pathname);
      return NextResponse.redirect(loginUrl);
    }
    if (!user.isAdmin) {
      const homeUrl = new URL('/', request.url);
      homeUrl.searchParams.set('denied', 'admin');
      return NextResponse.redirect(homeUrl);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Roda em todas as rotas de página, exceto:
     * - api (rotas de API - cada uma valida seu próprio token)
     * - _next/static, _next/image (arquivos estáticos/otimização)
     * - favicon.ico, manifest.json, robots.txt, icons (arquivos públicos)
     */
    '/((?!api|_next/static|_next/image|favicon.ico|icons|manifest.json|robots.txt).*)',
  ],
};
