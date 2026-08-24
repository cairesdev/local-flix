'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Badge } from '@/components/ui/Badge';
import { useToast } from '@/context/ToastContext';
import { Search, Plus, KeyRound, Shield, ShieldOff, Ban, CheckCircle2, Trash2 } from 'lucide-react';
import type { AdminUser } from '@/types/api';

export function UsersPanel({ currentUserId }: { currentUserId?: number }) {
  const { showToast } = useToast();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [search, setSearch] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);

  const [newEmail, setNewEmail] = useState('');
  const [newName, setNewName] = useState('');
  const [newIsAdmin, setNewIsAdmin] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  const load = async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/admin/users?limit=100${search ? `&search=${encodeURIComponent(search)}` : ''}`);
      if (res.ok) {
        const data = await res.json();
        setUsers(data.users || []);
      }
    } catch {
      showToast('Erro ao carregar usuários', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(load, 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const runAction = async (userId: number, action: string) => {
    setBusyId(userId);
    try {
      const res = await fetch('/api/admin/users', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, action }),
      });
      const data = await res.json();
      if (!res.ok) {
        showToast(data.error || 'Erro ao atualizar usuário', 'error');
        return;
      }
      if (action === 'resetPassword' && data.tempPassword) {
        showToast(`Senha temporária: ${data.tempPassword} (copie agora, não será mostrada de novo)`, 'success');
      } else {
        showToast('Usuário atualizado', 'success');
      }
      load();
    } catch {
      showToast('Erro ao atualizar usuário', 'error');
    } finally {
      setBusyId(null);
    }
  };

  const removeUser = async (userId: number) => {
    if (!confirm('Excluir este usuário permanentemente? Esta ação não pode ser desfeita.')) return;
    setBusyId(userId);
    try {
      const res = await fetch(`/api/admin/users?userId=${userId}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) {
        showToast(data.error || 'Erro ao excluir usuário', 'error');
        return;
      }
      showToast('Usuário excluído', 'success');
      load();
    } catch {
      showToast('Erro ao excluir usuário', 'error');
    } finally {
      setBusyId(null);
    }
  };

  const createUser = async () => {
    if (!newEmail) {
      showToast('Informe um e-mail', 'error');
      return;
    }
    setIsCreating(true);
    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: newEmail, name: newName, isAdmin: newIsAdmin }),
      });
      const data = await res.json();
      if (!res.ok) {
        showToast(data.error || 'Erro ao criar usuário', 'error');
        return;
      }
      showToast(
        data.tempPassword
          ? `Usuário criado. Senha temporária: ${data.tempPassword}`
          : 'Usuário criado com sucesso',
        'success'
      );
      setShowCreate(false);
      setNewEmail('');
      setNewName('');
      setNewIsAdmin(false);
      load();
    } catch {
      showToast('Erro ao criar usuário', 'error');
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
        <Input
          placeholder="Buscar por nome ou e-mail..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          icon={<Search size={18} />}
          className="max-w-sm"
        />
        <Button onClick={() => setShowCreate(true)} className="gap-2">
          <Plus size={16} />
          Novo usuário
        </Button>
      </div>

      <div className="bg-[var(--bg-secondary)] rounded-xl overflow-hidden border border-[var(--border-color)]">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-[var(--bg-tertiary)]">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-medium text-[var(--text-secondary)]">Usuário</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-[var(--text-secondary)]">Status</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-[var(--text-secondary)]">Admin</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-[var(--text-secondary)]">Criado em</th>
                <th className="px-4 py-3 text-right text-sm font-medium text-[var(--text-secondary)]">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-color)]">
              {users.map((u) => {
                const isSelf = u.id === currentUserId;
                const isBusy = busyId === u.id;
                return (
                  <tr key={u.id} className="hover:bg-[var(--bg-tertiary)]/50">
                    <td className="px-4 py-3">
                      <p className="font-medium text-[var(--text-primary)]">{u.name || 'Sem nome'}</p>
                      <p className="text-sm text-[var(--text-secondary)]">{u.email}</p>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={u.status === 'active' ? 'success' : 'danger'}>
                        {u.status === 'active' ? 'Ativo' : 'Bloqueado'}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      {u.is_admin ? <Badge variant="primary">Admin</Badge> : <span className="text-[var(--text-secondary)] text-sm">Não</span>}
                    </td>
                    <td className="px-4 py-3 text-sm text-[var(--text-secondary)]">
                      {new Date(u.created_at).toLocaleDateString('pt-BR')}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          title={u.status === 'active' ? 'Bloquear' : 'Ativar'}
                          disabled={isBusy || isSelf}
                          onClick={() => runAction(u.id, u.status === 'active' ? 'ban' : 'unban')}
                          className="p-2 rounded-lg text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] disabled:opacity-30 transition-colors"
                        >
                          {u.status === 'active' ? <Ban size={16} /> : <CheckCircle2 size={16} />}
                        </button>
                        <button
                          title={u.is_admin ? 'Remover admin' : 'Tornar admin'}
                          disabled={isBusy || isSelf}
                          onClick={() => runAction(u.id, u.is_admin ? 'removeAdmin' : 'makeAdmin')}
                          className="p-2 rounded-lg text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] disabled:opacity-30 transition-colors"
                        >
                          {u.is_admin ? <ShieldOff size={16} /> : <Shield size={16} />}
                        </button>
                        <button
                          title="Redefinir senha"
                          disabled={isBusy}
                          onClick={() => runAction(u.id, 'resetPassword')}
                          className="p-2 rounded-lg text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] disabled:opacity-30 transition-colors"
                        >
                          <KeyRound size={16} />
                        </button>
                        <button
                          title="Excluir"
                          disabled={isBusy || isSelf}
                          onClick={() => removeUser(u.id)}
                          className="p-2 rounded-lg text-[var(--live-accent)] hover:opacity-80 hover:bg-[var(--live-accent)]/10 disabled:opacity-30 transition-colors"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {!isLoading && users.length === 0 && (
          <div className="p-10 text-center text-[var(--text-secondary)]">Nenhum usuário encontrado</div>
        )}
        {isLoading && <div className="p-10 text-center text-[var(--text-secondary)]">Carregando...</div>}
      </div>

      <Modal isOpen={showCreate} onClose={() => setShowCreate(false)} size="sm">
        <div className="p-6 space-y-4">
          <h3 className="text-lg font-semibold text-[var(--text-primary)]">Criar usuário</h3>
          <p className="text-sm text-[var(--text-secondary)]">
            O site é fechado: contas são criadas apenas pelo administrador. Deixe a senha em branco para gerar uma
            temporária automaticamente.
          </p>
          <Input label="E-mail" type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} />
          <Input label="Nome" value={newName} onChange={(e) => setNewName(e.target.value)} />
          <label className="flex items-center gap-2 text-sm text-[var(--text-primary)]">
            <input type="checkbox" checked={newIsAdmin} onChange={(e) => setNewIsAdmin(e.target.checked)} />
            Conceder acesso de administrador
          </label>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setShowCreate(false)}>
              Cancelar
            </Button>
            <Button onClick={createUser} loading={isCreating}>
              Criar
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
