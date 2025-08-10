"use client";
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useSession } from '@/components/SessionProvider';

type User = { id: number; username: string; role: 'admin'|'power'|'user'; status: 'active'|'suspended'|'banned'; avatar_url?: string|null };
// email is used on admin, but header session user type can omit it

export default function Header() {
  const { user } = useSession() as { user: User | null };
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [registrationEnabled, setRegistrationEnabled] = useState<boolean | null>(null);
  const [theme, setTheme] = useState<'light'|'dark'|'system'>(
    (typeof window !== 'undefined' && (localStorage.getItem('ui.theme') as any)) || 'system'
  );

  useEffect(() => {
    // Close menu when user changes (e.g., after login/logout)
    setOpen(false);
  }, [user]);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!open) return;
      const target = e.target as Node;
      if (menuRef.current && !menuRef.current.contains(target)) {
        setOpen(false);
      }
    }
    document.addEventListener('click', onDocClick);
    return () => document.removeEventListener('click', onDocClick);
  }, [open]);

  useEffect(() => {
    // fetch registration toggle to hide Register when disabled
    fetch('/api/settings/registration', { cache: 'force-cache' })
      .then(r => r.json())
      .then(json => setRegistrationEnabled(!!json?.data?.registrationEnabled))
      .catch(() => setRegistrationEnabled(true));
  }, []);

  useEffect(() => {
    const systemDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    const isDark = theme === 'dark' || (theme === 'system' && systemDark);
    document.documentElement.classList.toggle('dark', isDark);
    localStorage.setItem('ui.theme', theme);
  }, [theme]);

  const initial = user?.username?.[0]?.toUpperCase() || '';

  return (
    <header className="relative z-[100] w-full border-b border-black/10 dark:border-white/10 bg-white/80 dark:bg-black/60 backdrop-blur supports-[backdrop-filter]:bg-white/60 supports-[backdrop-filter]:dark:bg-black/40">
      <div className="mx-auto max-w-6xl px-4 h-14 flex items-center justify-between text-black dark:text-white">
        <Link href="/" className="font-semibold">Website Name</Link>
        <div className="flex items-center gap-3">
          <select value={theme} onChange={e => setTheme(e.target.value as any)} className="hidden md:block text-xs rounded border px-2 py-1 bg-white dark:bg-gray-900 text-black dark:text-white border-black/10 dark:border-white/10">
            <option value="system">System</option>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
          {user ? (
            <div className="flex items-center gap-4">
              {user.role === 'admin' && (
                <Link href="/admin" className="text-sm opacity-80 hover:opacity-100">Admin</Link>
              )}
              <div className="relative" ref={menuRef}>
                <button onClick={() => setOpen(v => !v)} className="w-9 h-9 shrink-0 aspect-square rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center overflow-hidden">
                  {user.avatar_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={user.avatar_url} alt="avatar" className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-sm font-medium">{initial}</span>
                  )}
                </button>
                {open && (
                  <div className="absolute right-0 mt-2 z-[9999] bg-white dark:bg-gray-900 text-black dark:text-white border border-black/10 dark:border-white/10 rounded shadow-lg min-w-40">
                    <Link href="/profile" className="block px-3 py-2 text-sm hover:bg-black/5 dark:hover:bg-white/10">Profile</Link>
                    <Link href="/settings" className="block px-3 py-2 text-sm hover:bg-black/5 dark:hover:bg-white/10">Settings</Link>
                    <button onClick={() => {
                      const refresh = localStorage.getItem('auth.refreshToken');
                      fetch('/api/auth/logout', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ refreshToken: refresh }) }).finally(() => {
                        localStorage.removeItem('auth.refreshToken');
                        localStorage.removeItem('auth.user');
                        setOpen(false);
                        window.location.href = '/';
                      });
                    }} className="block w-full text-left px-3 py-2 text-sm hover:bg-black/5 dark:hover:bg-white/10">Logout</button>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Link href="/login" className="text-sm">Sign In</Link>
              {registrationEnabled !== false && <Link href="/register" className="text-sm">Register</Link>}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}


