'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { Button } from '@safi/ui';
import { ErrorText, Field, Input } from '@/components/form';
import { errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth-store';

export default function LoginPage() {
  const router = useRouter();
  const status = useAuth((s) => s.status);
  const login = useAuth((s) => s.login);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (status === 'authenticated') router.replace('/');
  }, [status, router]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await login(email.trim(), password);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="text-4xl">🍽️</div>
          <h1 className="mt-3 text-2xl font-bold text-green-400">
            Chat<span className="text-orange-500">Plate</span>
          </h1>
          <p className="mt-1 text-sm text-gray-400">Your restaurant, on WhatsApp. Sign in to the dashboard</p>
        </div>

        <form onSubmit={onSubmit} className="space-y-4 rounded-xl border border-gray-800 bg-gray-900 p-6">
          <Field label="Email">
            <Input
              type="email"
              autoComplete="username"
              required
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="owner@safi.pk"
            />
          </Field>
          <Field label="Password">
            <Input
              type="password"
              autoComplete="current-password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>
          <ErrorText>{error}</ErrorText>
          <Button type="submit" className="w-full justify-center" disabled={submitting}>
            {submitting && <Loader2 size={16} className="animate-spin" />}
            Sign in
          </Button>
        </form>
        <p className="mt-4 text-center text-xs text-gray-500">Cashiers and kitchen staff sign in on the POS with their PIN.</p>
      </div>
    </main>
  );
}
