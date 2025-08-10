"use client";
import { useEffect, useState } from 'react';
import Input from '@/components/ui/Input';
import Button from '@/components/ui/Button';

export default function RegisterPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [email, setEmail] = useState('');
  const [avatar, setAvatar] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [disabled, setDisabled] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/settings/registration').then(r => r.json()).then(json => {
      if (json.data) setDisabled(!json.data.registrationEnabled);
    }).catch(() => {});
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const form = new FormData();
    form.set('username', username);
    form.set('email', email);
    form.set('password', password);
    if (avatar) form.set('avatar', avatar);
    const res = await fetch('/api/auth/register', { method: 'POST', body: form });
    const json = await res.json();
    if (!json.ok) {
      setError(json.error?.message || 'Registration failed');
      return;
    }
    setMessage('Registration successful. You may now sign in.');
    try { new BroadcastChannel('auth').postMessage({ type: 'profile' }); } catch {}
  }

  return (
    <main className="container-hero py-10">
      <div className="max-w-md mx-auto">
        <h1 className="text-2xl font-semibold mb-4">Register</h1>
        {disabled && <div className="mb-3 text-sm text-yellow-700">Registration is currently disabled by the administrator.</div>}
        {message && <div className="mb-3 text-sm text-green-700">{message}</div>}
        {error && <div className="mb-3 text-sm text-red-600">{error}</div>}
        <form onSubmit={onSubmit} className="space-y-3">
          <Input value={username} onChange={e => setUsername(e.target.value)} placeholder="Username" />
          <Input value={email} onChange={e => setEmail(e.target.value)} placeholder="Email" type="email" />
          <Input value={password} onChange={e => setPassword(e.target.value)} type="password" placeholder="Password" />
          <input onChange={e => setAvatar(e.target.files?.[0] || null)} type="file" accept="image/png,image/jpeg,image/webp" className="w-full text-black dark:text-white" />
          <Button disabled={disabled} className="w-full">Create account</Button>
        </form>
      </div>
    </main>
  );
}


