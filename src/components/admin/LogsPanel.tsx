'use client';

import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import type { AdminLog } from '@/types/api';

export function LogsPanel() {
  const [logs, setLogs] = useState<AdminLog[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    setIsLoading(true);
    fetch(`/api/admin/logs?page=${page}&limit=25`)
      .then((res) => res.json())
      .then((data) => {
        setLogs(data.logs || []);
        setTotalPages(data.totalPages || 1);
      })
      .finally(() => setIsLoading(false));
  }, [page]);

  return (
    <div className="space-y-4">
      <div className="bg-[var(--bg-secondary)] rounded-xl border border-[var(--border-color)] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-[var(--bg-tertiary)]">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-medium text-[var(--text-secondary)]">Quando</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-[var(--text-secondary)]">Admin</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-[var(--text-secondary)]">Ação</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-[var(--text-secondary)]">Alvo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-color)]">
              {logs.map((log) => (
                <tr key={log.id} className="hover:bg-[var(--bg-tertiary)]/50">
                  <td className="px-4 py-3 text-sm text-[var(--text-secondary)] whitespace-nowrap">
                    {new Date(log.created_at).toLocaleString('pt-BR')}
                  </td>
                  <td className="px-4 py-3 text-sm text-[var(--text-primary)]">{log.admin_email || `#${log.admin_id}`}</td>
                  <td className="px-4 py-3">
                    <Badge variant="default">{log.action}</Badge>
                  </td>
                  <td className="px-4 py-3 text-sm text-[var(--text-secondary)]">
                    {log.target_type ? `${log.target_type}${log.target_id ? ` #${log.target_id}` : ''}` : '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!isLoading && logs.length === 0 && (
          <div className="p-10 text-center text-[var(--text-secondary)]">Nenhum registro ainda.</div>
        )}
        {isLoading && <div className="p-10 text-center text-[var(--text-secondary)]">Carregando...</div>}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3">
          <Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            Anterior
          </Button>
          <span className="text-sm text-[var(--text-secondary)]">
            Página {page} de {totalPages}
          </span>
          <Button size="sm" variant="secondary" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
            Próxima
          </Button>
        </div>
      )}
    </div>
  );
}
