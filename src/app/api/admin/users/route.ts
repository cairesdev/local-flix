import { NextRequest, NextResponse } from 'next/server';
import { sql, isOfflineMode, inMemoryData } from '@/lib/db';
import { getCurrentUser, hashPassword } from '@/lib/auth';

interface CountRow {
  total?: string;
}

function generateTempPassword(): string {
  // Senha temporária legível, forte o suficiente para uso único (o admin
  // deve orientar o usuário a trocá-la no primeiro acesso).
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  return Array.from({ length: 12 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user || !user.isAdmin) {
      return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const search = searchParams.get('search') || '';
    const offset = (page - 1) * limit;

    if (isOfflineMode) {
      let users = [...inMemoryData.users];

      if (search) {
        const searchLower = search.toLowerCase();
        users = users.filter(
          (u) =>
            u.email.toLowerCase().includes(searchLower) ||
            u.name.toLowerCase().includes(searchLower)
        );
      }

      const total = users.length;
      const paginatedUsers = users
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        .slice(offset, offset + limit)
        .map((u) => ({
          id: u.id,
          email: u.email,
          name: u.name,
          is_admin: u.is_admin,
          status: u.status,
          last_login: u.last_login,
          created_at: u.created_at,
        }));

      return NextResponse.json({
        users: paginatedUsers,
        total,
        page,
        totalPages: Math.ceil(total / limit),
      });
    }

    let result;
    let countResult;

    if (search) {
      result = await sql`
        SELECT id, email, name, is_admin, status, last_login, created_at
        FROM users
        WHERE email ILIKE ${'%' + search + '%'} OR name ILIKE ${'%' + search + '%'}
        ORDER BY created_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `;
      countResult = await sql`
        SELECT COUNT(*) as total FROM users
        WHERE email ILIKE ${'%' + search + '%'} OR name ILIKE ${'%' + search + '%'}
      `;
    } else {
      result = await sql`
        SELECT id, email, name, is_admin, status, last_login, created_at
        FROM users
        ORDER BY created_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `;
      countResult = await sql`SELECT COUNT(*) as total FROM users`;
    }

    const countRow = countResult.rows[0] as CountRow | undefined;
    const total = parseInt(countRow?.total || '0');

    return NextResponse.json({
      users: result.rows,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error) {
    console.error('Get users error:', error);
    return NextResponse.json({ error: 'Erro ao buscar usuários' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user || !user.isAdmin) {
      return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
    }

    const { userId, action, data } = await request.json();

    if (!userId || !action) {
      return NextResponse.json({ error: 'userId e action são obrigatórios' }, { status: 400 });
    }

    if (isOfflineMode) {
      const userIndex = inMemoryData.users.findIndex((u) => u.id === userId);
      if (userIndex < 0) {
        return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 });
      }

      let tempPassword: string | undefined;

      switch (action) {
        case 'ban':
          inMemoryData.users[userIndex].status = 'banned';
          break;
        case 'unban':
          inMemoryData.users[userIndex].status = 'active';
          break;
        case 'makeAdmin':
          inMemoryData.users[userIndex].is_admin = true;
          break;
        case 'removeAdmin':
          if (userId === user.userId) {
            return NextResponse.json(
              { error: 'Você não pode remover seu próprio acesso de administrador' },
              { status: 400 }
            );
          }
          inMemoryData.users[userIndex].is_admin = false;
          break;
        case 'update':
          if (data?.name) inMemoryData.users[userIndex].name = data.name;
          break;
        case 'resetPassword':
          tempPassword = generateTempPassword();
          inMemoryData.users[userIndex].password_hash = await hashPassword(tempPassword);
          break;
      }

      return NextResponse.json({
        message: 'Usuário atualizado com sucesso',
        user: inMemoryData.users[userIndex],
        tempPassword,
      });
    }

    let result;
    let tempPassword: string | undefined;

    switch (action) {
      case 'ban':
        result = await sql`
          UPDATE users SET status = 'banned', updated_at = CURRENT_TIMESTAMP
          WHERE id = ${userId} RETURNING *
        `;
        break;
      case 'unban':
        result = await sql`
          UPDATE users SET status = 'active', updated_at = CURRENT_TIMESTAMP
          WHERE id = ${userId} RETURNING *
        `;
        break;
      case 'makeAdmin':
        result = await sql`
          UPDATE users SET is_admin = true, updated_at = CURRENT_TIMESTAMP
          WHERE id = ${userId} RETURNING *
        `;
        break;
      case 'removeAdmin':
        if (userId === user.userId) {
          return NextResponse.json(
            { error: 'Você não pode remover seu próprio acesso de administrador' },
            { status: 400 }
          );
        }
        result = await sql`
          UPDATE users SET is_admin = false, updated_at = CURRENT_TIMESTAMP
          WHERE id = ${userId} RETURNING *
        `;
        break;
      case 'update':
        if (data?.name) {
          result = await sql`
            UPDATE users SET name = ${data.name}, updated_at = CURRENT_TIMESTAMP
            WHERE id = ${userId} RETURNING *
          `;
        }
        break;
      case 'resetPassword':
        tempPassword = generateTempPassword();
        result = await sql`
          UPDATE users SET password_hash = ${await hashPassword(tempPassword)}, updated_at = CURRENT_TIMESTAMP
          WHERE id = ${userId} RETURNING *
        `;
        break;
      default:
        return NextResponse.json({ error: 'Ação inválida' }, { status: 400 });
    }

    if (!result || result.rows.length === 0) {
      return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 });
    }

    // Log admin action (nunca loga a senha temporária)
    await sql`
      INSERT INTO admin_logs (admin_id, action, target_type, target_id, details)
      VALUES (${user.userId}, ${action}, 'user', ${userId}, ${JSON.stringify(action === 'resetPassword' ? {} : data || {})})
    `;

    return NextResponse.json({
      message: 'Usuário atualizado com sucesso',
      user: result.rows[0],
      tempPassword,
    });
  } catch (error) {
    console.error('Update user error:', error);
    return NextResponse.json({ error: 'Erro ao atualizar usuário' }, { status: 500 });
  }
}

/** Admin cria uma conta manualmente (site fechado: sem registro público). */
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user || !user.isAdmin) {
      return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
    }

    const { email, name, password, isAdmin } = await request.json();

    if (!email || !/\S+@\S+\.\S+/.test(email)) {
      return NextResponse.json({ error: 'E-mail inválido' }, { status: 400 });
    }

    const finalPassword: string = password && password.length >= 6 ? password : generateTempPassword();
    const passwordHash = await hashPassword(finalPassword);
    const userName = name || email.split('@')[0];

    if (isOfflineMode) {
      if (inMemoryData.users.some((u) => u.email === email)) {
        return NextResponse.json({ error: 'Email já cadastrado' }, { status: 400 });
      }
      const nextId = Math.max(0, ...inMemoryData.users.map((u) => u.id)) + 1;
      const newUser = {
        id: nextId,
        email,
        name: userName,
        password_hash: passwordHash,
        is_admin: !!isAdmin,
        status: 'active',
        last_login: null,
        created_at: new Date(),
        updated_at: new Date(),
      };
      inMemoryData.users.push(newUser);
      return NextResponse.json({
        message: 'Usuário criado com sucesso',
        user: { ...newUser, password_hash: undefined },
        tempPassword: password ? undefined : finalPassword,
      });
    }

    const existing = await sql`SELECT id FROM users WHERE email = ${email}`;
    if (existing.rows.length > 0) {
      return NextResponse.json({ error: 'Email já cadastrado' }, { status: 400 });
    }

    const result = await sql`
      INSERT INTO users (email, name, password_hash, is_admin, status)
      VALUES (${email}, ${userName}, ${passwordHash}, ${!!isAdmin}, 'active')
      RETURNING id, email, name, is_admin, status, created_at
    `;

    await sql`
      INSERT INTO admin_logs (admin_id, action, target_type, target_id, details)
      VALUES (${user.userId}, 'create_user', 'user', ${result.rows[0] && (result.rows[0] as { id: number }).id}, ${JSON.stringify({ email })})
    `;

    return NextResponse.json({
      message: 'Usuário criado com sucesso',
      user: result.rows[0],
      tempPassword: password ? undefined : finalPassword,
    });
  } catch (error) {
    console.error('Create user error:', error);
    return NextResponse.json({ error: 'Erro ao criar usuário' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user || !user.isAdmin) {
      return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
    }

    const userId = Number(request.nextUrl.searchParams.get('userId'));
    if (!userId) {
      return NextResponse.json({ error: 'userId é obrigatório' }, { status: 400 });
    }
    if (userId === user.userId) {
      return NextResponse.json({ error: 'Você não pode excluir sua própria conta' }, { status: 400 });
    }

    if (isOfflineMode) {
      const idx = inMemoryData.users.findIndex((u) => u.id === userId);
      if (idx < 0) return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 });
      inMemoryData.users.splice(idx, 1);
      return NextResponse.json({ message: 'Usuário excluído com sucesso' });
    }

    const result = await sql`DELETE FROM users WHERE id = ${userId} RETURNING id`;
    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 });
    }

    await sql`
      INSERT INTO admin_logs (admin_id, action, target_type, target_id)
      VALUES (${user.userId}, 'delete_user', 'user', ${userId})
    `;

    return NextResponse.json({ message: 'Usuário excluído com sucesso' });
  } catch (error) {
    console.error('Delete user error:', error);
    return NextResponse.json({ error: 'Erro ao excluir usuário' }, { status: 500 });
  }
}