'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase/browser';

export function AdminLoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    const { error: signInError } = await supabaseBrowser().auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (signInError) {
      // Mensagem genérica: não revelamos se o e-mail existe.
      setError('E-mail ou senha inválidos.');
      setLoading(false);
      return;
    }

    router.push('/admin');
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <label className="block">
        <span className="field-label">E-mail</span>
        <input
          className="field-input"
          type="email"
          value={email}
          autoComplete="username"
          onChange={(e) => setEmail(e.target.value)}
          required
        />
      </label>

      <label className="block">
        <span className="field-label">Senha</span>
        <input
          className="field-input"
          type="password"
          value={password}
          autoComplete="current-password"
          onChange={(e) => setPassword(e.target.value)}
          required
        />
      </label>

      {error ? (
        <p role="alert" className="text-sm text-wine-700">
          {error}
        </p>
      ) : null}

      <button type="submit" className="btn-primary w-full" disabled={loading}>
        {loading ? 'Entrando…' : 'Entrar'}
      </button>
    </form>
  );
}
