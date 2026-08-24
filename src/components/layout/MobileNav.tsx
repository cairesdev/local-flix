'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { Home, Film, Tv, Radio, User } from 'lucide-react';

export function MobileNav() {
  const pathname = usePathname();

  const navItems = [
    {
      // "/" redireciona para "/tv" - TV ao vivo é o produto principal.
      href: '/tv',
      label: 'TV ao Vivo',
      active: pathname === '/' || pathname === '/tv',
      icon: Radio,
    },
    {
      href: '/catalogo',
      label: 'Início',
      active: pathname === '/catalogo',
      icon: Home,
    },
    {
      href: '/movies',
      label: 'Filmes',
      active: pathname === '/movies' || pathname.startsWith('/movies/'),
      icon: Film,
    },
    {
      href: '/series',
      label: 'Séries',
      active: pathname === '/series' || pathname.startsWith('/series/'),
      icon: Tv,
    },
    {
      href: '/profile',
      label: 'Perfil',
      active: pathname === '/profile',
      icon: User,
    },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 md:hidden px-3 pb-3 safe-bottom pointer-events-none">
      {/* Ilha flutuante - em vez de barra full-width chapada, um cartão
          arredondado com sombra colorida, mais próximo do padrão atual
          de navegação mobile (iOS/Android) e menos "estourado" contra o
          fundo claro. */}
      <div className="relative max-w-md mx-auto rounded-[28px] glass shadow-[var(--shadow-lg)] pointer-events-auto">
        <div className="flex items-center justify-around h-[64px] px-1.5">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'relative flex flex-col items-center justify-center gap-0.5 py-2 rounded-2xl transition-all duration-300',
                  'min-w-[56px]',
                  item.active
                    ? 'text-[var(--accent-primary)] bg-[var(--accent-primary)]/12'
                    : 'text-[var(--text-tertiary)]'
                )}
              >
                <Icon
                  size={21}
                  strokeWidth={item.active ? 2.25 : 1.5}
                  className={cn('transition-transform duration-300', item.active && 'scale-110')}
                />
                <span
                  className={cn(
                    'text-[10px] font-medium transition-opacity',
                    item.active ? 'opacity-100' : 'opacity-70'
                  )}
                >
                  {item.label}
                </span>
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
