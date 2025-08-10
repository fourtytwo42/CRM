"use client";
import { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';

type SessionUser = {
  id: number;
  username: string;
  role: 'admin'|'power'|'user';
  status: 'active'|'suspended'|'banned';
  avatar_url?: string|null;
  theme_preference?: 'light'|'dark'|'system';
};

const SessionContext = createContext<{ user: SessionUser | null } | null>(null);
export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used within SessionProvider');
  return ctx;
}

async function getAccessToken(): Promise<string | null> {
  const refresh = localStorage.getItem('auth.refreshToken');
  if (!refresh) return null;
  try {
    const res = await fetch('/api/auth/refresh', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ refreshToken: refresh })
    });
    const json = await res.json();
    if (!json.ok) return null;
    localStorage.setItem('auth.refreshToken', json.data.refreshToken);
    localStorage.setItem('auth.user', JSON.stringify(json.data.user));
    return json.data.accessToken as string;
  } catch {
    return null;
  }
}

export default function SessionProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const tokenRef = useRef<string | null>(null);
  const heartbeatRef = useRef<any>(null);
  const bcRef = useRef<BroadcastChannel | null>(null);

  const startHeartbeat = useCallback(() => {
    stopHeartbeat();
    if (!tokenRef.current) return;
    heartbeatRef.current = setInterval(async () => {
      if (document.hidden) return;
      // Reuse current token; only attempt refresh when server indicates 401
      const token = tokenRef.current;
      if (!token) return;
      tokenRef.current = token;
      try {
        const res = await fetch('/api/auth/heartbeat', { method: 'POST', headers: { authorization: `Bearer ${token}` } });
        if (res.status === 401) {
          const refreshed = await getAccessToken();
          if (refreshed) {
            tokenRef.current = refreshed;
            await fetch('/api/auth/heartbeat', { method: 'POST', headers: { authorization: `Bearer ${refreshed}` } }).catch(() => {});
          }
        }
      } catch {}
    }, 45000);
  }, []);

  function stopHeartbeat() {
    if (heartbeatRef.current) clearInterval(heartbeatRef.current);
    heartbeatRef.current = null;
  }

  useEffect(() => {
    // Apply theme on first paint
    const pref = localStorage.getItem('ui.theme') as 'light'|'dark'|'system' | null;
    if (pref) {
      const systemDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
      const isDark = pref === 'dark' || (pref === 'system' && systemDark);
      document.documentElement.classList.toggle('dark', isDark);
    }

    const init = async () => {
      // seed user from storage
      try {
        const stored = localStorage.getItem('auth.user');
        if (stored) setUser(JSON.parse(stored));
      } catch {}
      // always refresh on load to hydrate access token
      tokenRef.current = await getAccessToken();
      // after refresh, load updated user snapshot
      try {
        const storedAfter = localStorage.getItem('auth.user');
        if (storedAfter) setUser(JSON.parse(storedAfter));
      } catch {}
      startHeartbeat();
    };
    init();

    const onVisibility = () => {
      if (document.visibilityState === 'visible') startHeartbeat();
      else stopHeartbeat();
    };
    document.addEventListener('visibilitychange', onVisibility);

    const onStorage = (e: StorageEvent) => {
      if (e.key === 'auth.refreshToken' && !e.newValue) {
        stopHeartbeat();
        setUser(null);
      }
      if (e.key === 'auth.user' && e.newValue) {
        try { setUser(JSON.parse(e.newValue)); } catch {}
      }
    };
    window.addEventListener('storage', onStorage);

    // Cross-component/tab auth updates
    bcRef.current = new BroadcastChannel('auth');
    bcRef.current.onmessage = (ev) => {
      const t = ev.data?.type;
      if (t === 'login' || t === 'profile') {
        try {
          const stored = localStorage.getItem('auth.user');
          if (stored) setUser(JSON.parse(stored));
        } catch {}
      }
      if (t === 'logout') {
        stopHeartbeat();
        setUser(null);
      }
      if (t === 'request-state') {
        try {
          const refreshToken = localStorage.getItem('auth.refreshToken');
          const stored = localStorage.getItem('auth.user');
          const userObj = stored ? JSON.parse(stored) : null;
          // Reuse the existing channel to avoid resource leaks
          if (bcRef.current) {
            bcRef.current.postMessage({ type: 'state', refreshToken, user: userObj });
          }
        } catch {}
      }
    };

    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('storage', onStorage);
      stopHeartbeat();
      if (bcRef.current) bcRef.current.close();
    };
  }, [startHeartbeat]);

  return <SessionContext.Provider value={{ user }}>{children}</SessionContext.Provider>;
}


