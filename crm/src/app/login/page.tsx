"use client";
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Input from '@/components/ui/Input';
import Button from '@/components/ui/Button';

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    const res = await fetch('/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username, password }) });
    const json = await res.json();
    if (!json.ok) {
      const code: string | undefined = json.error?.code;
      const message: string | undefined = json.error?.message;
      setError(message || 'Login failed');
      if (code === 'EMAIL_UNVERIFIED') {
        setInfo('Email unverified. You can resend the verification link.');
      }
      return;
    }
    localStorage.setItem('auth.refreshToken', json.data.refreshToken);
    localStorage.setItem('auth.user', JSON.stringify(json.data.user));
    try { new BroadcastChannel('auth').postMessage({ type: 'login' }); } catch {}
    router.push('/');
  }

  return (
    <main className="container-hero py-10">
      <div className="max-w-md mx-auto">
        <h1 className="text-2xl font-semibold mb-4">Sign In</h1>
        {error && <div className="mb-3 text-sm text-red-600">{error}</div>}
        {info && (
          <div className="mb-3 text-sm">
            <span className="mr-2">{info}</span>
            <button
              type="button"
              className="underline"
              onClick={async () => {
                setError(null);
                setInfo(null);
                const ident = username.includes('@') ? { email: username } : { username };
                const res = await fetch('/api/auth/verify', {
                  method: 'POST',
                  headers: { 'content-type': 'application/json' },
                  body: JSON.stringify(ident),
                });
                const j = await res.json().catch(() => ({ ok: false }));
                if (j?.ok) setInfo('Verification email sent (if eligible).');
                else setError('Could not resend verification right now.');
              }}
            >
              Resend verification email
            </button>
          </div>
        )}
        <div className="mb-4 text-sm border rounded-2xl p-3 bg-white/60 dark:bg-white/5 border-black/10 dark:border-white/10 backdrop-blur">
          <div className="font-medium mb-2">Quick test accounts</div>
          <ul className="space-y-1">
            <li className="flex items-center justify-between">
              <span>admin / Password123!</span>
              <button type="button" className="underline" onClick={() => { setUsername('admin'); setPassword('Password123!'); }}>Fill</button>
            </li>
            <li className="flex items-center justify-between">
              <span>power / Password123!</span>
              <button type="button" className="underline" onClick={() => { setUsername('power'); setPassword('Password123!'); }}>Fill</button>
            </li>
            <li className="flex items-center justify-between">
              <span>user / Password123!</span>
              <button type="button" className="underline" onClick={() => { setUsername('user'); setPassword('Password123!'); }}>Fill</button>
            </li>
          </ul>
        </div>
        <form onSubmit={onSubmit} className="space-y-3">
          <Input value={username} onChange={e => setUsername(e.target.value)} placeholder="Username" />
          <Input value={password} onChange={e => setPassword(e.target.value)} type="password" placeholder="Password" />
          <Button className="w-full">Sign In</Button>
        </form>
      </div>
    </main>
  );
}


