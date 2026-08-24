'use client';

import { useState } from 'react';
import { Trash2, Loader2, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ClearCacheButtonProps {
  variant?: 'button' | 'menu-item';
  className?: string;
  onSuccess?: () => void;
}

export function ClearCacheButton({
  variant = 'button',
  className,
  onSuccess,
}: ClearCacheButtonProps) {
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');

  const clearAllCache = async () => {
    setStatus('loading');

    try {
      // 1. Limpar localStorage
      localStorage.clear();

      // 2. Limpar sessionStorage
      sessionStorage.clear();

      // 3. Limpar cookies (apenas os acessíveis via JS)
      document.cookie.split(';').forEach((cookie) => {
        const eqPos = cookie.indexOf('=');
        const name = eqPos > -1 ? cookie.substring(0, eqPos).trim() : cookie.trim();
        document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/`;
      });

      // 4. Limpar Cache API (Service Worker caches)
      if ('caches' in window) {
        const cacheNames = await caches.keys();
        await Promise.all(
          cacheNames.map((cacheName) => caches.delete(cacheName))
        );
      }

      // 5. Desregistrar Service Workers
      if ('serviceWorker' in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        await Promise.all(
          registrations.map((registration) => registration.unregister())
        );
      }

      // 6. Limpar IndexedDB (se existir)
      if ('indexedDB' in window) {
        const databases = await indexedDB.databases?.() || [];
        databases.forEach((db) => {
          if (db.name) {
            indexedDB.deleteDatabase(db.name);
          }
        });
      }

      setStatus('success');
      onSuccess?.();

      // Aguardar um momento e recarregar a página
      setTimeout(() => {
        window.location.reload();
      }, 1000);
    } catch (error) {
      console.error('Erro ao limpar cache:', error);
      setStatus('error');

      // Mesmo com erro, tenta recarregar
      setTimeout(() => {
        window.location.reload();
      }, 1500);
    }
  };

  if (variant === 'menu-item') {
    return (
      <button
        onClick={clearAllCache}
        disabled={status === 'loading'}
        className={cn(
          'w-full flex items-center gap-4 px-5 py-3 text-sm transition-colors',
          'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)]',
          status === 'loading' && 'opacity-50 cursor-wait',
          status === 'success' && 'text-[var(--success-accent)]',
          className
        )}
      >
        {status === 'loading' ? (
          <Loader2 size={18} strokeWidth={1.5} className="animate-spin" />
        ) : status === 'success' ? (
          <Check size={18} strokeWidth={1.5} />
        ) : (
          <Trash2 size={18} strokeWidth={1.5} />
        )}
        {status === 'loading'
          ? 'Limpando...'
          : status === 'success'
          ? 'Cache limpo!'
          : 'Limpar Cache'}
      </button>
    );
  }

  return (
    <button
      onClick={clearAllCache}
      disabled={status === 'loading'}
      className={cn(
        'inline-flex items-center gap-2 px-4 py-2 rounded-lg transition-all',
        'bg-[var(--bg-tertiary)] hover:bg-[var(--bg-tertiary)]/60 text-[var(--text-primary)]',
        'border border-[var(--border-color)]',
        status === 'loading' && 'opacity-50 cursor-wait',
        status === 'success' && 'bg-[var(--success-accent)]/15 border-[var(--success-accent)]/40 text-[var(--success-accent)]',
        className
      )}
    >
      {status === 'loading' ? (
        <Loader2 size={16} strokeWidth={1.5} className="animate-spin" />
      ) : status === 'success' ? (
        <Check size={16} strokeWidth={1.5} />
      ) : (
        <Trash2 size={16} strokeWidth={1.5} />
      )}
      <span className="text-sm font-medium">
        {status === 'loading'
          ? 'Limpando...'
          : status === 'success'
          ? 'Cache limpo!'
          : 'Limpar Cache'}
      </span>
    </button>
  );
}
