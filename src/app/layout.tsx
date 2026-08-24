import type { Metadata, Viewport } from 'next';
import { Poppins } from 'next/font/google';
import './globals.css';
import { Providers } from '@/components/Providers';
import { env } from '@/lib/env';

const poppins = Poppins({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
  display: 'swap',
  variable: '--font-poppins',
});

// Nome/descrição vêm de env.site (NEXT_PUBLIC_SITE_NAME / _DESCRIPTION),
// nunca hard-coded - ver src/lib/env.ts.
export const metadata: Metadata = {
  title: `${env.site.name} - TV ao Vivo, Filmes e Séries`,
  description: env.site.description,
  keywords: ['tv ao vivo', 'streaming', 'filmes', 'séries', 'animes', 'assistir online', 'hd', 'legendado'],
  authors: [{ name: env.site.name }],
  manifest: '/manifest.json',
  icons: {
    icon: '/favicon.ico',
    apple: '/icons/icon-192x192.png',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  themeColor: '#f7f5fb',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR" data-scroll-behavior="smooth">
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              // Suprimir erros de console desnecessários
              (function() {
                const originalError = console.error;
                const originalWarn = console.warn;
                const suppress = ['attestation', 'topics', 'react devtools'];
                function shouldSuppress(args) {
                  const msg = args.map(a => String(a)).join(' ').toLowerCase();
                  return suppress.some(s => msg.includes(s));
                }
                console.error = function(...args) {
                  if (shouldSuppress(args)) return;
                  return originalError.apply(console, args);
                };
                console.warn = function(...args) {
                  if (shouldSuppress(args)) return;
                  return originalWarn.apply(console, args);
                };
              })();
            `,
          }}
        />
      </head>
      <body className={poppins.className}>
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  );
}
