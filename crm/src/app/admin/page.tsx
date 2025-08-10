"use client";
import { useCallback, useEffect, useRef, useState } from 'react';
import Input from '@/components/ui/Input';
import Button from '@/components/ui/Button';

type User = { id: number; username: string; email?: string; role: 'admin'|'power'|'user'; status: 'active'|'suspended'|'banned'; avatar_url?: string|null; created_at?: string; last_login_at?: string; last_seen_at?: string };

export default function AdminPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<'username'|'role'|'status'|'created_at'|'last_login_at'|'last_seen_at'>('created_at');
  const [dir, setDir] = useState<'asc'|'desc'>('desc');
  const [cursor, setCursor] = useState<string | null>(null);
  const cursorRef = useRef<string | null>(null);
  const loadingRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [emailCfg, setEmailCfg] = useState<{ host: string; port: number; secure: boolean; username?: string|null; password?: string|null; from_email: string; from_name?: string|null }>(
    { host: '', port: 465, secure: true, username: '', password: '', from_email: '', from_name: '' }
  );
  const [testTo, setTestTo] = useState('');
  const [emailBusy, setEmailBusy] = useState<'idle'|'saving'|'testing'>('idle');
  const [emailMsg, setEmailMsg] = useState<string | null>(null);
  const [regEnabled, setRegEnabled] = useState<boolean>(true);
  const [emailVerificationEnabled, setEmailVerificationEnabled] = useState<boolean>(false);

  const fetchUsers = useCallback(async (reset = false) => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    setError(null);
    const token = await getAccessToken();
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    params.set('sort', sort);
    params.set('dir', dir);
    params.set('limit', '25');
    if (!reset && cursorRef.current) params.set('cursor', cursorRef.current);
    const res = await fetch(`/api/admin/users?${params.toString()}`, { headers: { authorization: `Bearer ${token}` } });
    const json = await res.json();
    if (!json.ok) { setError('Not authorized'); loadingRef.current = false; return; }
    setCursor(json.data.nextCursor || null);
    setUsers(prev => reset ? json.data.users : [...prev, ...json.data.users]);
    loadingRef.current = false;
  }, [q, sort, dir]);

  useEffect(() => { cursorRef.current = cursor; }, [cursor]);

  useEffect(() => {
    setUsers([]); setCursor(null);
    fetchUsers(true);
    const id = setInterval(() => fetchUsers(true), 30000);
    const bc = new BroadcastChannel('admin');
    bc.onmessage = (ev) => {
      if (ev.data?.type === 'user-updated') fetchUsers(true);
    };
    return () => { clearInterval(id); bc.close(); };
  }, [fetchUsers]);

  useEffect(() => {
    // Load email settings with a couple of retries to avoid token rotation races
    let cancelled = false;
    let attempts = 0;
    const load = async () => {
      attempts += 1;
      const token = await getAccessToken();
      if (!token) {
        if (attempts < 3) { setTimeout(load, 300); }
        return;
      }
      try {
        const res = await fetch('/api/admin/settings/email', { headers: { authorization: `Bearer ${token}` }, cache: 'no-store' });
        const json = await res.json();
        if (!cancelled && json.ok) {
          setEmailCfg({
            host: json.data?.host || '',
            port: Number(json.data?.port || 587),
            secure: !!json.data?.secure,
            username: json.data?.username || '',
            password: json.data?.password || '',
            from_email: json.data?.from_email || '',
            from_name: json.data?.from_name || '',
          });
        }
      } catch {}
    };
    load();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    // Load registration + email verification toggles
    (async () => {
      try {
        const token = await getAccessToken();
        if (!token) return;
        const res = await fetch('/api/admin/settings/registration', { headers: { authorization: `Bearer ${token}` }, cache: 'no-store' });
        const json = await res.json();
        if (json.ok) {
          setRegEnabled(!!json.data?.registrationEnabled);
          setEmailVerificationEnabled(!!json.data?.emailVerificationEnabled);
        }
      } catch {}
    })();
  }, []);

  return (
    <main className="container-hero py-8">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-semibold">Admin Console</h1>
        <div className="text-sm opacity-70">{users.length} users</div>
      </div>
      {error && <div className="mb-3 text-sm text-red-600">{error}</div>}
      <div className="mb-4 grid grid-cols-1 md:grid-cols-2 gap-3">
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search username" className="w-full rounded-lg border px-3 py-2 bg-white dark:bg-gray-900 text-black dark:text-white border-black/10 dark:border-white/10" />
      </div>
      <div className="overflow-x-auto rounded-2xl border border-black/10 dark:border-white/10 bg-white/60 dark:bg-white/5 backdrop-blur" style={{ maxHeight: 520, overflowY: 'auto' }} onScroll={(e) => {
        const el = e.currentTarget as HTMLDivElement;
        if (el.scrollTop + el.clientHeight >= el.scrollHeight - 40 && cursor) fetchUsers();
      }}>
        <table className="min-w-full text-sm">
          <thead>
            <tr className="bg-black/5 dark:bg-white/10">
              <SortableTH label="User" field="username" sort={sort} dir={dir} setSort={setSort} setDir={setDir} />
              <SortableTH label="Email" field="email" sort={sort} dir={dir} setSort={setSort} setDir={setDir} />
              <SortableTH label="Role" field="role" sort={sort} dir={dir} setSort={setSort} setDir={setDir} />
              <SortableTH label="Status" field="status" sort={sort} dir={dir} setSort={setSort} setDir={setDir} />
              <SortableTH label="Presence" field="last_seen_at" sort={sort} dir={dir} setSort={setSort} setDir={setDir} />
              <th className="text-left px-3 py-2 hidden sm:table-cell">Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map(u => (
              <tr key={u.id} className="border-t border-black/5 dark:border-white/5">
                <td className="px-3 py-2 flex items-center gap-2">
                  <span className={`inline-block size-2 rounded-full ${isOnline(u.last_seen_at) ? 'bg-green-500' : 'bg-gray-400'}`} />
                  {u.username}
                </td>
                <td className="px-3 py-2 truncate max-w-[200px]">{u.email}</td>
                <td className="px-3 py-2">{u.role}</td>
                <td className="px-3 py-2">{u.status}</td>
                <td className="px-3 py-2">{isOnline(u.last_seen_at) ? 'Online' : (u.last_seen_at ? `Offline (${lastSeen(u.last_seen_at)})` : 'Offline')}</td>
                <td className="px-3 py-2 space-x-3 hidden sm:table-cell">
                  <button className="underline" onClick={() => changeRole(u.id, nextRole(u.role))}>Set {nextRole(u.role)}</button>
                  <button className="underline" onClick={() => changeStatus(u.id, u.status === 'banned' ? 'active' : 'banned')}>{u.status === 'banned' ? 'Unban' : 'Ban'}</button>
                  <button className="underline" onClick={() => changeStatus(u.id, u.status === 'suspended' ? 'active' : 'suspended')}>{u.status === 'suspended' ? 'Unsuspend' : 'Suspend'}</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Registration & Email Verification Settings */}
      <div className="mt-8 rounded-2xl border border-black/10 dark:border-white/10 bg-white/60 dark:bg-white/5 backdrop-blur p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold">User Sign-up Settings</h2>
        </div>
        <div className="grid gap-3 text-sm">
          <label className="flex items-center justify-between gap-3">
            <span>Allow new user registration</span>
            <input type="checkbox" checked={regEnabled} onChange={e => setRegEnabled(e.target.checked)} />
          </label>
          <label className="flex items-center justify-between gap-3">
            <span>Require email verification</span>
            <input type="checkbox" checked={emailVerificationEnabled} onChange={e => setEmailVerificationEnabled(e.target.checked)} />
          </label>
          <div className="flex items-center justify-end">
            <Button variant="primary" onClick={async () => {
              const token = await getAccessToken();
              if (!token) return;
              await fetch('/api/admin/settings/registration', { method: 'PUT', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify({ enabled: regEnabled, emailVerificationEnabled }) });
            }}>Save</Button>
          </div>
          <p className="text-xs opacity-70">If verification is disabled, new users are created as active and email changes apply immediately.</p>
        </div>
      </div>

      {/* Email Settings */}
      <div className="mt-8 rounded-2xl border border-black/10 dark:border-white/10 bg-white/60 dark:bg-white/5 backdrop-blur p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold">Email (SMTP) Settings</h2>
          {emailBusy !== 'idle' && (
            <span className="text-xs opacity-70 inline-flex items-center gap-1">
              <span className="inline-block size-2 rounded-full animate-pulse bg-blue-500" />
              {emailBusy === 'saving' ? 'Saving…' : 'Testing…'}
            </span>
          )}
        </div>
        {emailMsg && <div className="mb-3 text-xs">{emailMsg}</div>}
        <div className="text-sm opacity-70 mb-4">Configure your SMTP provider (e.g., Namecheap, Gmail). Save, then test the connection. After that, you can send a test email below.</div>
        <form className="grid grid-cols-1 md:grid-cols-2 gap-3" onSubmit={async (e) => {
            e.preventDefault();
            setEmailBusy('saving'); setEmailMsg(null);
            const token = await getAccessToken();
            if (!token) { setEmailBusy('idle'); setEmailMsg('Not authorized. Please sign in again.'); return; }
            const payload = { ...emailCfg } as any;
            if ((emailCfg.password || '').length === 0) payload.password = null; // explicitly clear if empty
            const res = await fetch('/api/admin/settings/email', { method: 'PUT', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify(payload) });
            const json = await res.json();
            setEmailBusy('idle');
            setEmailMsg(json.ok ? 'Saved.' : 'Failed to save');
          }}>
            <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-3">
              <Input placeholder="From Email" type="email" value={emailCfg.from_email} onChange={e => setEmailCfg({ ...(emailCfg as any), from_email: e.target.value })} />
              <Input placeholder="From Name (optional)" value={emailCfg.from_name || ''} onChange={e => setEmailCfg({ ...(emailCfg as any), from_name: e.target.value })} />
            </div>
            <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-3 gap-3">
              <Input placeholder="SMTP host" value={emailCfg.host} onChange={e => setEmailCfg({ ...(emailCfg as any), host: e.target.value })} />
              <div className="grid grid-cols-[1fr_auto] gap-3">
                <Input placeholder="Port" type="number" value={emailCfg.port} onChange={e => setEmailCfg({ ...(emailCfg as any), port: Number(e.target.value || 0) })} />
                <select className="rounded-lg border px-3 py-2 bg-white dark:bg-gray-900 text-black dark:text-white border-black/10 dark:border-white/10" value={emailCfg.secure ? 'true' : 'false'} onChange={e => setEmailCfg({ ...(emailCfg as any), secure: e.target.value === 'true' })}>
                  <option value="false">STARTTLS</option>
                  <option value="true">TLS</option>
                </select>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <Input placeholder="Username (optional)" value={emailCfg.username || ''} onChange={e => setEmailCfg({ ...(emailCfg as any), username: e.target.value })} />
                <Input placeholder="Password (optional)" value={emailCfg.password || ''} onChange={e => setEmailCfg({ ...(emailCfg as any), password: e.target.value })} />
              </div>
            </div>
            <div className="md:col-span-2 flex items-center justify-end gap-2">
              <Button type="button" variant="secondary" onClick={async () => {
                setEmailBusy('testing'); setEmailMsg('Testing connection…');
                const token = await getAccessToken();
                if (!token) { setEmailBusy('idle'); setEmailMsg('Not authorized. Please sign in again.'); return; }
                try {
                  const res = await fetch('/api/admin/settings/email', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify(emailCfg) });
                  const json = await res.json();
                  setEmailBusy('idle');
                  if (json.ok) {
                    setEmailMsg('Connection successful.');
                  } else {
                    const detail = json?.error?.details ? ` (code: ${json.error.details.code || 'n/a'}${json.error.details.responseCode ? ', rc: ' + json.error.details.responseCode : ''})` : '';
                    setEmailMsg(`Failed: ${json?.error?.message || 'Unknown error'}${detail}`);
                  }
                } catch (err: any) {
                  setEmailBusy('idle');
                  setEmailMsg(`Failed: ${err?.message || 'Network error'}`);
                }
              }}>Test Connection</Button>
              <Button type="submit" variant="primary">Save</Button>
            </div>
          </form>

        {/* Divider and send test section */}
        <div className="h-px bg-black/10 dark:bg-white/10 my-5" />
        <div className="space-y-2">
          <h3 className="font-medium">Send Test Email</h3>
          <p className="text-sm opacity-70">After saving and testing your connection, send a test email to confirm delivery.</p>
          <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-2">
            <Input placeholder="Recipient email" value={testTo} onChange={e => setTestTo(e.target.value)} />
            <Button type="button" variant="ghost" onClick={async () => {
              setEmailBusy('testing'); setEmailMsg('Sending test email…');
              const token = await getAccessToken();
              if (!token) { setEmailBusy('idle'); setEmailMsg('Not authorized. Please sign in again.'); return; }
              try {
                const res = await fetch('/api/admin/settings/email/send', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify({ to: testTo }) });
                const json = await res.json();
                setEmailBusy('idle');
                setEmailMsg(json.ok ? 'Email sent.' : `Failed to send: ${json?.error?.message || 'Unknown error'}`);
              } catch (err: any) {
                setEmailBusy('idle');
                setEmailMsg(`Failed to send: ${err?.message || 'Network error'}`);
              }
            }}>Send Test Email</Button>
          </div>
        </div>
      </div>
    </main>
  );

  function isOnline(lastSeen?: string | null) {
    if (!lastSeen) return false;
    return Date.now() - new Date(lastSeen).getTime() < 60_000;
  }
  function lastSeen(ts?: string | null) {
    if (!ts) return 'unknown';
    const diff = Math.floor((Date.now() - new Date(ts).getTime()) / 1000);
    if (diff < 60) return `${diff}s ago`;
    const m = Math.floor(diff / 60);
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    return `${h}h ago`;
  }
  function nextRole(role: 'admin'|'power'|'user'): 'admin'|'power'|'user' {
    if (role === 'user') return 'power';
    if (role === 'power') return 'admin';
    return 'user';
  }
}

function SortableTH({ label, field, sort, dir, setSort, setDir }: { label: string; field: any; sort: any; dir: 'asc'|'desc'; setSort: (s: any) => void; setDir: (d: 'asc'|'desc') => void }) {
  const active = sort === field;
  const nextDir = active && dir === 'asc' ? 'desc' : 'asc';
  return (
    <th className="text-left px-3 py-2 select-none cursor-pointer" onClick={() => { setSort(field); setDir(nextDir); }}>
      <span className="inline-flex items-center gap-1">
        {label}
        {active && <span className="opacity-60 text-xs">{dir === 'asc' ? '▲' : '▼'}</span>}
      </span>
    </th>
  );
}

async function getAccessToken(): Promise<string> {
  // Obtain new access token via refresh to keep it in memory only
  const refresh = localStorage.getItem('auth.refreshToken');
  if (!refresh) return '';
  const res = await fetch('/api/auth/refresh', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ refreshToken: refresh }) });
  const json = await res.json();
  if (!json.ok) return '';
  localStorage.setItem('auth.refreshToken', json.data.refreshToken);
  localStorage.setItem('auth.user', JSON.stringify(json.data.user));
  return json.data.accessToken as string;
}

async function changeRole(id: number, role: 'admin'|'power'|'user') {
  const token = await getAccessToken();
  await fetch(`/api/admin/users/${id}/role`, { method: 'PUT', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify({ role }) });
  try { new BroadcastChannel('admin').postMessage({ type: 'user-updated' }); } catch {}
}

async function changeStatus(id: number, status: 'active'|'suspended'|'banned') {
  const token = await getAccessToken();
  await fetch(`/api/admin/users/${id}/status`, { method: 'PUT', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify({ status }) });
  try { new BroadcastChannel('admin').postMessage({ type: 'user-updated' }); } catch {}
}


