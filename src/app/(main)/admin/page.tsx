'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { cn } from '@/lib/utils';
import { UsersPanel } from '@/components/admin/UsersPanel';
import { ProvidersPanel } from '@/components/admin/ProvidersPanel';
import { SettingsPanel } from '@/components/admin/SettingsPanel';
import { LogsPanel } from '@/components/admin/LogsPanel';
import {
  Users,
  Settings,
  Activity,
  Shield,
  RefreshCw,
  Radio,
  ScrollText,
  LayoutDashboard,
} from 'lucide-react';

type SectionKey = 'dashboard' | 'users' | 'providers' | 'settings' | 'logs';

const SECTIONS: { key: SectionKey; label: string; icon: React.ReactNode }[] = [
  { key: 'dashboard', label: 'Painel', icon: <LayoutDashboard size={18} /> },
  { key: 'users', label: 'Usuários', icon: <Users size={18} /> },
  { key: 'providers', label: 'Provedores', icon: <Radio size={18} /> },
  { key: 'settings', label: 'Configurações', icon: <Settings size={18} /> },
  { key: 'logs', label: 'Logs', icon: <ScrollText size={18} /> },
];

interface DashboardData {
  totalUsers: number;
  activeUsers: number;
  newUsersLast7Days: number;
  watchesToday: number;
}

export default function AdminPage() {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const { showToast } = useToast();

  const [section, setSection] = useState<SectionKey>('dashboard');
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!authLoading) {
      if (!user) {
        router.push('/login');
      } else if (!user.isAdmin) {
        router.push('/');
        showToast('Acesso negado. Apenas administradores.', 'error');
      } else {
        loadDashboard();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, authLoading, router]);

  const loadDashboard = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/admin/dashboard');
      if (res.ok) setDashboard(await res.json());
    } catch {
      showToast('Erro ao carregar dashboard', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  if (authLoading || (isLoading && section === 'dashboard' && !dashboard)) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[var(--accent-primary)] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user?.isAdmin) return null;

  return (
    <div className="max-w-[1400px] mx-auto px-4 md:px-6 py-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold text-[var(--text-primary)] flex items-center gap-2">
            <Shield className="text-[var(--accent-primary)]" />
            Administração
          </h1>
          <p className="text-[var(--text-secondary)] mt-1">Gerencie usuários, provedores e configurações do sistema</p>
        </div>
        <button
          onClick={loadDashboard}
          className="w-10 h-10 flex items-center justify-center rounded-full text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] transition-colors"
          aria-label="Atualizar"
        >
          <RefreshCw size={18} />
        </button>
      </div>

      <div className="flex flex-col lg:flex-row gap-6">
        {/* Sidebar navigation */}
        <nav className="lg:w-56 shrink-0">
          <div className="flex lg:flex-col gap-1 overflow-x-auto pb-2 lg:pb-0">
            {SECTIONS.map((s) => (
              <button
                key={s.key}
                onClick={() => setSection(s.key)}
                className={cn(
                  'flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium whitespace-nowrap transition-colors',
                  section === s.key
                    ? 'bg-[var(--accent-primary)] text-white'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)]'
                )}
              >
                {s.icon}
                {s.label}
              </button>
            ))}
          </div>
        </nav>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {section === 'dashboard' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <DashboardCard title="Total de Usuários" value={dashboard?.totalUsers ?? 0} icon={<Users size={22} />} />
                <DashboardCard
                  title="Usuários Ativos"
                  value={dashboard?.activeUsers ?? 0}
                  icon={<Activity size={22} />}
                  variant="success"
                />
                <DashboardCard
                  title="Novos (7 dias)"
                  value={dashboard?.newUsersLast7Days ?? 0}
                  icon={<Users size={22} />}
                  variant="primary"
                />
                <DashboardCard title="Reproduções hoje" value={dashboard?.watchesToday ?? 0} icon={<Activity size={22} />} />
              </div>
              <p className="text-sm text-[var(--text-secondary)]">
                Use o menu ao lado para gerenciar usuários, provedores de vídeo (com fallback automático) e
                configurações gerais da plataforma.
              </p>
            </div>
          )}
          {section === 'users' && <UsersPanel currentUserId={user.id} />}
          {section === 'providers' && <ProvidersPanel />}
          {section === 'settings' && <SettingsPanel />}
          {section === 'logs' && <LogsPanel />}
        </div>
      </div>
    </div>
  );
}

function DashboardCard({
  title,
  value,
  icon,
  variant = 'default',
}: {
  title: string;
  value: number;
  icon: React.ReactNode;
  variant?: 'default' | 'primary' | 'success';
}) {
  const variantClasses = {
    default: 'bg-[var(--bg-secondary)]',
    primary: 'bg-[var(--accent-primary)]/10 border-[var(--accent-primary)]',
    success: 'bg-[var(--success-accent)]/10 border-[var(--success-accent)]',
  };

  const iconClasses = {
    default: 'text-[var(--text-secondary)]',
    primary: 'text-[var(--accent-primary)]',
    success: 'text-[var(--success-accent)]',
  };

  return (
    <div className={cn('rounded-xl p-6 border border-[var(--border-color)]', variantClasses[variant])}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-[var(--text-secondary)]">{title}</p>
          <p className="text-3xl font-semibold text-[var(--text-primary)] mt-1">{value.toLocaleString()}</p>
        </div>
        <div className={iconClasses[variant]}>{icon}</div>
      </div>
    </div>
  );
}
