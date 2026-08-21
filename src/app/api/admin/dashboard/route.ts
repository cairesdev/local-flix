import { NextRequest, NextResponse } from 'next/server';
import { sql, isOfflineMode, inMemoryData } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';

interface StatsRow {
  total?: string;
  active?: string;
  new_last_7_days?: string;
}

/**
 * Estatísticas do painel administrativo. Os nomes dos campos aqui casam
 * com `AdminDashboard` em src/types/api.ts - antes havia uma divergência
 * (a UI esperava `newUsersLast7Days`/`watchesToday` mas a API devolvia
 * `newUsersToday`/`totalWatchHistory`), o que fazia os cards mostrarem
 * sempre "0". Corrigido para os dois lados baterem.
 */
export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user || !user.isAdmin) {
      return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
    }

    if (isOfflineMode) {
      const totalUsers = inMemoryData.users.length;
      const activeUsers = inMemoryData.users.filter((u) => u.status === 'active').length;

      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      const newUsersLast7Days = inMemoryData.users.filter(
        (u) => new Date(u.created_at) >= sevenDaysAgo
      ).length;

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const watchesToday = inMemoryData.watchHistory.filter(
        (w) => new Date(w.watched_at) >= today
      ).length;

      return NextResponse.json({
        totalUsers,
        activeUsers,
        newUsersLast7Days,
        watchesToday,
        recentUsers: inMemoryData.users.slice(-10).reverse(),
      });
    }

    const [usersStats, watchesTodayStats, recentUsers] = await Promise.all([
      sql`
        SELECT
          COUNT(*) as total,
          COUNT(*) FILTER (WHERE status = 'active') as active,
          COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE - INTERVAL '7 days') as new_last_7_days
        FROM users
      `,
      sql`SELECT COUNT(*) as total FROM watch_history WHERE watched_at >= CURRENT_DATE`,
      sql`
        SELECT id, email, name, is_admin, status, created_at, last_login
        FROM users
        ORDER BY created_at DESC
        LIMIT 10
      `,
    ]);

    const statsRow = usersStats.rows[0] as StatsRow | undefined;
    const watchesRow = watchesTodayStats.rows[0] as StatsRow | undefined;

    return NextResponse.json({
      totalUsers: parseInt(statsRow?.total || '0'),
      activeUsers: parseInt(statsRow?.active || '0'),
      newUsersLast7Days: parseInt(statsRow?.new_last_7_days || '0'),
      watchesToday: parseInt(watchesRow?.total || '0'),
      recentUsers: recentUsers.rows,
    });
  } catch (error) {
    console.error('Dashboard error:', error);
    return NextResponse.json({ error: 'Erro ao carregar dashboard' }, { status: 500 });
  }
}
