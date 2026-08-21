'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import type { User } from '@/types/user';

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name?: string) => Promise<void>;
  logout: () => Promise<void>;
  updateProfile: (name: string) => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Sessão vive no cookie httpOnly (setado pelo servidor no login/register).
  // Nada de token em localStorage: um script de terceiro rodando dentro de
  // um iframe proxy (players de vídeo, ex.: TV ao vivo) nunca tem acesso a
  // um cookie httpOnly, mas teria acesso total ao localStorage do nosso
  // domínio se o token estivesse lá. Ao montar, só perguntamos ao servidor
  // quem é o usuário atual - o cookie vai junto automaticamente.
  useEffect(() => {
    let cancelled = false;

    fetch('/api/auth/me')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled) return;
        if (data) {
          setUser({
            id: data.id,
            email: data.email,
            name: data.name,
            isAdmin: data.isAdmin,
            status: data.status,
            createdAt: data.createdAt,
          });
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const login = async (email: string, password: string) => {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Erro ao fazer login');
    }

    // O cookie httpOnly já foi setado pelo servidor na resposta.
    setUser(data.user);
  };

  const register = async (email: string, password: string, name?: string) => {
    const response = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, name }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Erro ao criar conta');
    }

    setUser(data.user);
  };

  const logout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch (error) {
      console.error('Error clearing auth cookie:', error);
    }
    setUser(null);
  };

  const updateProfile = async (name: string) => {
    if (!user) throw new Error('Não autenticado');

    const response = await fetch('/api/auth/profile', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Erro ao atualizar perfil');
    }

    setUser((prev) => (prev ? { ...prev, name } : prev));
  };

  const refreshUser = async () => {
    try {
      const response = await fetch('/api/auth/me');

      if (response.ok) {
        const data = await response.json();
        setUser({
          id: data.id,
          email: data.email,
          name: data.name,
          isAdmin: data.isAdmin,
          status: data.status,
          createdAt: data.createdAt,
        });
      } else {
        // Cookie inválido/expirado, fazer logout
        setUser(null);
      }
    } catch (error) {
      console.error('Error refreshing user:', error);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isAuthenticated: !!user,
        login,
        register,
        logout,
        updateProfile,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
