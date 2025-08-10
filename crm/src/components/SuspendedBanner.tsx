"use client";
import { useEffect, useState } from 'react';

export default function SuspendedBanner() {
  const [suspended, setSuspended] = useState(false);
  useEffect(() => {
    const u = localStorage.getItem('auth.user');
    if (u) {
      try {
        const parsed = JSON.parse(u);
        setSuspended(parsed?.status === 'suspended');
      } catch {}
    }
    const bc = new BroadcastChannel('auth');
    bc.onmessage = (ev) => {
      const t = ev.data?.type;
      if (t === 'profile' || t === 'login') {
        try {
          const stored = localStorage.getItem('auth.user');
          if (stored) setSuspended(JSON.parse(stored)?.status === 'suspended');
        } catch {}
      }
      if (t === 'logout') setSuspended(false);
    };
    return () => bc.close();
  }, []);
  if (!suspended) return null;
  return (
    <div className="bg-yellow-100 text-yellow-800 text-sm px-4 py-2 text-center">Your account is suspended; you have read-only access.</div>
  );
}


