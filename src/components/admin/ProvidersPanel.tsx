'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Badge } from '@/components/ui/Badge';
import { useToast } from '@/context/ToastContext';
import { cn } from '@/lib/utils';
import {
  Plus,
  ArrowUp,
  ArrowDown,
  Trash2,
  Pencil,
  Radio,
  Film,
  Wifi,
  WifiOff,
  HelpCircle,
} from 'lucide-react';
import type { AdminProvider, ProviderType } from '@/types/api';

const emptyForm = {
  id: 0,
  type: 'vod' as ProviderType,
  name: '',
  base_url: '',
  movie_path_template: '/filme/{id}',
  series_path_template: '/serie/{id}/{season}/{episode}',
  channels_url: '',
  player_base_url: '',
  notes: '',
};

function HealthBadge({ status }: { status: AdminProvider['health_status'] }) {
  if (status === 'healthy') return <Badge variant="success"><Wifi size={12} className="mr-1" />Saudável</Badge>;
  if (status === 'degraded') return <Badge variant="warning"><Wifi size={12} className="mr-1" />Instável</Badge>;
  if (status === 'down') return <Badge variant="danger"><WifiOff size={12} className="mr-1" />Fora do ar</Badge>;
  return <Badge variant="default"><HelpCircle size={12} className="mr-1" />Desconhecido</Badge>;
}

function ProviderGroup({
  type,
  title,
  icon,
  providers,
  onChange,
}: {
  type: ProviderType;
  title: string;
  icon: React.ReactNode;
  providers: AdminProvider[];
  onChange: () => void;
}) {
  const { showToast } = useToast();
  const [editing, setEditing] = useState<AdminProvider | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [testingId, setTestingId] = useState<number | null>(null);

  const list = providers.filter((p) => p.type === type).sort((a, b) => a.priority - b.priority);

  const openCreate = () => {
    setForm({ ...emptyForm, type });
    setCreating(true);
  };

  const openEdit = (p: AdminProvider) => {
    setEditing(p);
    setForm({
      id: p.id,
      type: p.type,
      name: p.name,
      base_url: p.base_url,
      movie_path_template: p.movie_path_template,
      series_path_template: p.series_path_template,
      channels_url: p.channels_url || '',
      player_base_url: p.player_base_url || '',
      notes: p.notes || '',
    });
  };

  const closeModals = () => {
    setEditing(null);
    setCreating(false);
  };

  const save = async () => {
    if (!form.name || !form.base_url) {
      showToast('Nome e URL base são obrigatórios', 'error');
      return;
    }
    if (type === 'tv' && (!form.channels_url || !form.player_base_url)) {
      showToast('Provedores de TV precisam da URL da lista de canais e da base do player', 'error');
      return;
    }
    setSaving(true);
    try {
      const isEdit = !!editing;
      const res = await fetch('/api/admin/providers', {
        method: isEdit ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) {
        showToast(data.error || 'Erro ao salvar provedor', 'error');
        return;
      }
      showToast(isEdit ? 'Provedor atualizado' : 'Provedor criado', 'success');
      closeModals();
      onChange();
    } catch {
      showToast('Erro ao salvar provedor', 'error');
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (p: AdminProvider) => {
    await fetch('/api/admin/providers', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: p.id, is_active: !p.is_active }),
    });
    onChange();
  };

  const remove = async (p: AdminProvider) => {
    if (!confirm(`Remover o provedor "${p.name}"?`)) return;
    await fetch(`/api/admin/providers?id=${p.id}`, { method: 'DELETE' });
    showToast('Provedor removido', 'success');
    onChange();
  };

  const move = async (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= list.length) return;
    const a = list[index];
    const b = list[target];
    await fetch('/api/admin/providers', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ order: [{ id: a.id, priority: b.priority }, { id: b.id, priority: a.priority }] }),
    });
    onChange();
  };

  const test = async (p: AdminProvider) => {
    setTestingId(p.id);
    try {
      const res = await fetch('/api/admin/providers/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: p.id }),
      });
      const data = await res.json();
      showToast(data.ok ? `Provedor respondendo (${data.detail})` : `Falhou: ${data.detail}`, data.ok ? 'success' : 'error');
      onChange();
    } catch {
      showToast('Erro ao testar provedor', 'error');
    } finally {
      setTestingId(null);
    }
  };

  return (
    <div className="bg-[var(--bg-secondary)] rounded-xl border border-[var(--border-color)] overflow-hidden">
      <div className="flex items-center justify-between p-4 border-b border-[var(--border-color)]">
        <div className="flex items-center gap-2 text-[var(--text-primary)] font-semibold">
          {icon}
          {title}
        </div>
        <Button size="sm" onClick={openCreate} className="gap-1">
          <Plus size={14} />
          Adicionar
        </Button>
      </div>

      <div className="divide-y divide-[var(--border-color)]">
        {list.map((p, index) => (
          <div key={p.id} className="p-4 flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="flex flex-col gap-1 shrink-0">
              <button
                disabled={index === 0}
                onClick={() => move(index, -1)}
                className="p-1 rounded text-[var(--text-secondary)] hover:text-white disabled:opacity-20"
              >
                <ArrowUp size={14} />
              </button>
              <button
                disabled={index === list.length - 1}
                onClick={() => move(index, 1)}
                className="p-1 rounded text-[var(--text-secondary)] hover:text-white disabled:opacity-20"
              >
                <ArrowDown size={14} />
              </button>
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className={cn('font-medium', !p.is_active && 'text-[var(--text-secondary)] line-through')}>
                  {p.name}
                </span>
                <HealthBadge status={p.health_status} />
                {!p.is_active && <Badge variant="default">Inativo</Badge>}
              </div>
              <p className="text-sm text-[var(--text-secondary)] truncate">{p.base_url}</p>
            </div>

            <div className="flex items-center gap-1 shrink-0">
              <Button size="sm" variant="secondary" loading={testingId === p.id} onClick={() => test(p)}>
                Testar
              </Button>
              <button
                onClick={() => toggleActive(p)}
                className="p-2 rounded-lg text-[var(--text-secondary)] hover:text-white hover:bg-white/10"
                title={p.is_active ? 'Desativar' : 'Ativar'}
              >
                {p.is_active ? <Wifi size={16} /> : <WifiOff size={16} />}
              </button>
              <button
                onClick={() => openEdit(p)}
                className="p-2 rounded-lg text-[var(--text-secondary)] hover:text-white hover:bg-white/10"
                title="Editar"
              >
                <Pencil size={16} />
              </button>
              <button
                onClick={() => remove(p)}
                className="p-2 rounded-lg text-red-400 hover:text-red-300 hover:bg-red-500/10"
                title="Remover"
              >
                <Trash2 size={16} />
              </button>
            </div>
          </div>
        ))}

        {list.length === 0 && (
          <div className="p-8 text-center text-[var(--text-secondary)] text-sm">
            Nenhum provedor cadastrado. Adicione ao menos um para {type === 'vod' ? 'filmes/séries' : 'TV ao vivo'} funcionar.
          </div>
        )}
      </div>

      <Modal isOpen={creating || !!editing} onClose={closeModals} size="md">
        <div className="p-6 space-y-4">
          <h3 className="text-lg font-semibold text-[var(--text-primary)]">
            {editing ? 'Editar provedor' : 'Novo provedor'} · {type === 'vod' ? 'Filmes/Séries' : 'TV ao vivo'}
          </h3>

          <Input label="Nome" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <Input
            label="URL base"
            placeholder="https://exemplo.com"
            value={form.base_url}
            onChange={(e) => setForm({ ...form, base_url: e.target.value })}
          />

          {type === 'vod' ? (
            <>
              <Input
                label="Template do player de filme"
                value={form.movie_path_template}
                onChange={(e) => setForm({ ...form, movie_path_template: e.target.value })}
              />
              <Input
                label="Template do player de série"
                value={form.series_path_template}
                onChange={(e) => setForm({ ...form, series_path_template: e.target.value })}
              />
              <p className="text-xs text-[var(--text-secondary)]">
                Use {'{id}'}, {'{season}'} e {'{episode}'} como marcadores.
              </p>
            </>
          ) : (
            <>
              <Input
                label="URL da lista de canais (JSON)"
                value={form.channels_url}
                onChange={(e) => setForm({ ...form, channels_url: e.target.value })}
              />
              <Input
                label="URL base do player por canal"
                placeholder="https://exemplo.com/player"
                value={form.player_base_url}
                onChange={(e) => setForm({ ...form, player_base_url: e.target.value })}
              />
            </>
          )}

          <Input label="Notas (opcional)" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={closeModals}>
              Cancelar
            </Button>
            <Button onClick={save} loading={saving}>
              Salvar
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

export function ProvidersPanel() {
  const [providers, setProviders] = useState<AdminProvider[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { showToast } = useToast();

  const load = async () => {
    try {
      const res = await fetch('/api/admin/providers');
      if (res.ok) {
        const data = await res.json();
        setProviders(data.providers || []);
      }
    } catch {
      showToast('Erro ao carregar provedores', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-4">
      <p className="text-sm text-[var(--text-secondary)] max-w-2xl">
        Os sites que fornecem os players mudam de domínio com frequência por causa de bloqueios. Cadastre quantos
        espelhos quiser - o sistema tenta em ordem de prioridade (topo da lista primeiro) e pula automaticamente para
        o próximo quando um está fora do ar.
      </p>
      {isLoading ? (
        <div className="text-[var(--text-secondary)]">Carregando provedores...</div>
      ) : (
        <>
          <ProviderGroup type="vod" title="Filmes e Séries" icon={<Film size={18} />} providers={providers} onChange={load} />
          <ProviderGroup type="tv" title="TV ao vivo" icon={<Radio size={18} />} providers={providers} onChange={load} />
        </>
      )}
    </div>
  );
}
