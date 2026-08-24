'use client';

import { cn } from '@/lib/utils';

interface BadgeProps {
  children: React.ReactNode;
  variant?: 'default' | 'primary' | 'success' | 'warning' | 'danger';
  size?: 'sm' | 'md';
  className?: string;
}

export function Badge({
  children,
  variant = 'default',
  size = 'sm',
  className,
}: BadgeProps) {
  const variantClasses = {
    default: 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)]',
    primary: 'bg-[var(--accent-primary)] text-white',
    success: 'bg-[var(--success-accent)]/20 text-[var(--success-accent)]',
    warning: 'bg-[var(--warning-accent)]/20 text-[var(--warning-accent)]',
    danger: 'bg-[var(--live-accent)]/20 text-[var(--live-accent)]',
  };

  const sizeClasses = {
    sm: 'px-2 py-0.5 text-xs',
    md: 'px-3 py-1 text-sm',
  };

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full font-medium',
        variantClasses[variant],
        sizeClasses[size],
        className
      )}
    >
      {children}
    </span>
  );
}
