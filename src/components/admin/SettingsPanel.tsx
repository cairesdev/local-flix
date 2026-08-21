'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useToast } from '@/context/ToastContext';
import { cn } from '@/lib/utils';
import { Save } from 'lucide-react';
import type { AdminSettings } from '@/types/api';

const DEFAULTS: AdminSettings = {
  site_name: 'Superflix',
  site_description: '',
  maintenance_mode: 'false',
  allow_registration: 'false',
};

function Toggle({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  description: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <div>
        <p className="text-[var(--text-primary)]">{label}</p>
        <p className="text-sm text-[var(--text-secondary)]">{description}</p>
      </div>
      <button
        onClick={() => onChange(!checked)}
        className={cn(
          'w-12 h-6 rounded-full relative transition-colors shrink-0',
          checked ? 'bg-[var(--accent-primary)]' : 'bg-[var(--bg-tertiary)]'
        )}
      >
        <div
          className={cn(
            'absolute top-1 w-4 h-4 rounded-full bg-white transition-transform',
            checked ? 'translate-x-7' : 'translate-x-1'
          )}
        />
      </button>
    </div>
  );
}

export function SettingsPanel() {
  const { showToast } = useToast();
  const [settings, setSettings] = useState<AdminSettings>(DEFAULTS);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    fetch('/api/admin/settings')
      .then((res) => res.json())
      .then((data) => setSettings({ ...DEFAULTS, ...(data.settings || {}) }))
      .catch(() => showToast('Erro ao carregar configurações', 'error'))
      .finally(() => setIsLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const save = async () => {
    setIsSaving(true);
    try {
      const res = await fetch('/api/admin/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });
      if (!res.ok) throw new Error();
      showToast('Configurações salvas com sucesso', 'success');
    } catch {
      showToast('Erro ao salvar configurações', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return <div className="text-[var(--text-secondary)]">Carregando...</div>;
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div className="bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-xl p-6 space-y-4">
        <h3 className="text-lg font-semibold text-[var(--text-primary)]">Site</h3>
        <Input
          label="Nome do site"
          value={settings.site_name}
          onChange={(e) => setSettings({ ...settings, site_name: e.target.value })}
        />
        <Input
          label="Descrição (usada no SEO)"
          value={settings.site_description}
          onChange={(e) => setSettings({ ...settings, site_description: e.target.value })}
        />
      </div>

      <div className="bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-xl p-6 divide-y divide-[var(--border-color)]">
        <h3 className="text-lg font-semibold text-[var(--text-primary)] pb-2">Acesso</h3>
        <Toggle
          checked={settings.allow_registration === 'true'}
          onChange={(v) => setSettings({ ...settings, allow_registration: String(v) })}
          label="Permitir registro público"
          description="Site fechado por padrão: com isso desligado, só o admin pode criar contas (aba Usuários)."
        />
        <Toggle
          checked={settings.maintenance_mode === 'true'}
          onChange={(v) => setSettings({ ...settings, maintenance_mode: String(v) })}
          label="Modo manutenção"
          description="Bloqueia o acesso de usuários não-admin temporariamente."
        />
      </div>

      <Button onClick={save} loading={isSaving} className="gap-2">
        <Save size={18} />
        Salvar configurações
      </Button>
    </div>
  );
}
