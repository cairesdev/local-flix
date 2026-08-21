'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Mail, Lock, Eye, EyeOff, Radio } from 'lucide-react';
import { env } from '@/lib/env';

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { login } = useAuth();
  const { showToast } = useToast();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});

  const validate = () => {
    const newErrors: { email?: string; password?: string } = {};

    if (!email) {
      newErrors.email = 'E-mail é obrigatório';
    } else if (!/\S+@\S+\.\S+/.test(email)) {
      newErrors.email = 'E-mail inválido';
    }

    if (!password) {
      newErrors.password = 'Senha é obrigatória';
    } else if (password.length < 6) {
      newErrors.password = 'Senha deve ter pelo menos 6 caracteres';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validate()) return;

    setIsLoading(true);

    try {
      await login(email, password);
      showToast('Login realizado com sucesso!', 'success');
      // Volta para a página que o usuário tentou acessar antes do redirect
      // do middleware (site fechado exige login em qualquer rota).
      const redirectTo = searchParams.get('redirect');
      const isSafeRedirect = !!redirectTo && redirectTo.startsWith('/') && !redirectTo.startsWith('//');
      router.push(isSafeRedirect ? redirectTo : '/');
    } catch (error: any) {
      showToast(error.message || 'Erro ao fazer login', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="glass-card rounded-2xl p-8 shadow-lg">
      {/* Logo */}
      <div className="text-center mb-8">
        <Link href="/" className="inline-flex items-center gap-2">
          <Radio className="text-[var(--accent-primary)]" size={26} />
          <h1 className="text-3xl font-bold text-[var(--accent-primary)] tracking-tight">
            {env.site.name}
          </h1>
        </Link>
        <p className="text-[var(--text-secondary)] mt-2">
          Entre na sua conta para continuar
        </p>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          label="E-mail"
          type="email"
          placeholder="seu@email.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={errors.email}
          icon={<Mail size={18} />}
        />

        <div className="relative">
          <Input
            label="Senha"
            type={showPassword ? 'text' : 'password'}
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            error={errors.password}
            icon={<Lock size={18} />}
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-3 top-9 text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          >
            {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        </div>

        <Button type="submit" className="w-full" loading={isLoading}>
          Entrar
        </Button>
      </form>

      {/* Links */}
      <div className="mt-6 text-center text-sm">
        <p className="text-[var(--text-secondary)]">
          Não tem uma conta?{' '}
          <Link
            href={
              searchParams.get('redirect')
                ? `/register?redirect=${encodeURIComponent(searchParams.get('redirect')!)}`
                : '/register'
            }
            className="text-[var(--accent-primary)] hover:underline"
          >
            Criar conta
          </Link>
        </p>
      </div>
    </div>
  );
}
