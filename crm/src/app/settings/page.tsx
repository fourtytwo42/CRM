"use client";
import { useEffect, useState } from 'react';
import Select from '@/components/ui/Select';

export default function SettingsPage() {
  const [theme, setTheme] = useState<'light'|'dark'|'system'>('system');

  useEffect(() => {
    const stored = localStorage.getItem('ui.theme');
    if (stored === 'light' || stored === 'dark' || stored === 'system') setTheme(stored);
  }, []);

  useEffect(() => {
    applyTheme(theme);
    localStorage.setItem('ui.theme', theme);
    // Also store on user profile cache for consistency; actual persistence would be via API
    try {
      const u = localStorage.getItem('auth.user');
      if (u) {
        const parsed = JSON.parse(u);
        parsed.theme_preference = theme;
        localStorage.setItem('auth.user', JSON.stringify(parsed));
      }
    } catch {}
  }, [theme]);

  return (
    <main className="container-hero py-10">
      <div className="max-w-2xl">
        <h1 className="text-2xl font-semibold mb-4">Settings</h1>
        <div className="rounded-2xl border border-black/10 dark:border-white/10 bg-white/60 dark:bg-white/5 backdrop-blur p-6 space-y-4">
          <div>
            <label className="block text-sm mb-2 opacity-70">Theme</label>
            <Select value={theme} onChange={e => setTheme(e.target.value as any)}>
              <option value="light">Light</option>
              <option value="dark">Dark</option>
              <option value="system">System</option>
            </Select>
          </div>
          <p className="text-sm opacity-70">Your preference is remembered and applied across pages and sessions.</p>
        </div>
      </div>
    </main>
  );
}

function applyTheme(mode: 'light'|'dark'|'system') {
  const root = document.documentElement;
  const systemDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  const isDark = mode === 'dark' || (mode === 'system' && systemDark);
  root.classList.toggle('dark', isDark);
}


