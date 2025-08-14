"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Input from '@/components/ui/Input';
import Button from '@/components/ui/Button';
import Select from '@/components/ui/Select';
import Dialog, { DialogActions } from '@/components/ui/Dialog';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';

type User = { id: number; username: string; email?: string; role: 'admin'|'power'|'user'; status: 'active'|'suspended'|'banned'; avatar_url?: string|null; created_at?: string; last_login_at?: string; last_seen_at?: string };

type AiCatalogItem = { id: string; name: string; defaultBaseUrl?: string; notes?: string };
type AiProviderRow = {
  id: number;
  provider: string;
  label?: string | null;
  baseUrl?: string | null;
  model?: string | null;
  enabled: boolean;
  timeoutMs?: number | null;
  priority: number;
  settings?: any;
  hasApiKey: boolean;
  created_at: string;
  updated_at: string;
};

export default function AdminPage() {
  const [activeTab, setActiveTab] = useState<'users'|'ai'|'telephony'|'email'>('users');
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
  const [smtpHasPassword, setSmtpHasPassword] = useState(false);
  const [smtpClearPassword, setSmtpClearPassword] = useState(false);
  const [testTo, setTestTo] = useState('');
  const [emailBusy, setEmailBusy] = useState<'idle'|'saving'|'testing'>('idle');
  const [emailMsg, setEmailMsg] = useState<string | null>(null);
  const [regEnabled, setRegEnabled] = useState<boolean>(true);
  const [emailVerificationEnabled, setEmailVerificationEnabled] = useState<boolean>(false);
  // IMAP inbound polling settings
  const [imapEnabled, setImapEnabled] = useState(false);
  const [imapHost, setImapHost] = useState('');
  const [imapPort, setImapPort] = useState<number | ''>('');
  const [imapSecure, setImapSecure] = useState(true);
  const [imapUsername, setImapUsername] = useState('');
  const [imapHasPassword, setImapHasPassword] = useState(false);
  const [imapPassword, setImapPassword] = useState('');
  const [imapPollSeconds, setImapPollSeconds] = useState<number | ''>('');

  // AI tab state
  const [aiLoading, setAiLoading] = useState<boolean>(false);
  const [aiProviders, setAiProviders] = useState<AiProviderRow[]>([]);
  const [aiCatalog, setAiCatalog] = useState<AiCatalogItem[]>([]);
  const [addProviderId, setAddProviderId] = useState<string>('');
  const [addBusy, setAddBusy] = useState<boolean>(false);
  const [editOpenForId, setEditOpenForId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<{ label: string; baseUrl: string; apiKey: string; model: string; timeoutMs: number | '' ; priority: number | '' }|null>(null);
  const [editModels, setEditModels] = useState<string[]>([]);
  const [editModelsError, setEditModelsError] = useState<string | null>(null);
  const editingProviderHasKey = useMemo(() => aiProviders.find(x => x.id === editOpenForId)?.hasApiKey || false, [editOpenForId, aiProviders]);
  const [chatMessages, setChatMessages] = useState<Array<{ role: 'user'|'assistant'|'system'; content: string }>>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatSystem, setChatSystem] = useState('');
  const [chatBusy, setChatBusy] = useState<'idle'|'sending'>('idle');
  const [chatMeta, setChatMeta] = useState<{ provider?: string; model?: string; tried?: Array<{ provider: string; code: string; message: string }>; details?: any } | null>(null);
  // Telephony tab state is local to subcomponents

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
            // Never load password from server; only track presence via hasPassword
            password: '',
            from_email: json.data?.from_email || '',
            from_name: json.data?.from_name || '',
          });
          setSmtpHasPassword(!!json.data?.hasPassword);
          setSmtpClearPassword(false);
          // IMAP
          setImapEnabled(!!json.data?.imap_enabled);
          setImapHost(json.data?.imap_host || '');
          setImapPort(Number(json.data?.imap_port || 993));
          setImapSecure(!!json.data?.imap_secure);
          setImapUsername(json.data?.imap_username || '');
          setImapHasPassword(!!json.data?.imapHasPassword);
          setImapPassword('');
          setImapPollSeconds(Number(json.data?.imap_poll_seconds || 60));
        }
      } catch {}
    };
    load();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    // Load registration + email verification toggles with a couple retries to avoid token races
    let cancelled = false;
    let attempts = 0;
    const load = async () => {
      attempts += 1;
      try {
        const token = await getAccessToken();
        if (!token) {
          if (attempts < 3) setTimeout(load, 300);
          return;
        }
        const res = await fetch('/api/admin/settings/registration', { headers: { authorization: `Bearer ${token}` }, cache: 'no-store' });
        const json = await res.json().catch(() => ({ ok: false }));
        if (!cancelled && json.ok) {
          setRegEnabled(!!json.data?.registrationEnabled);
          setEmailVerificationEnabled(!!json.data?.emailVerificationEnabled);
        } else if (!cancelled && attempts < 3) {
          setTimeout(load, 300);
        }
      } catch {
        if (!cancelled && attempts < 3) setTimeout(load, 300);
      }
    };
    load();
    return () => { cancelled = true; };
  }, []);

  // Auto-load AI providers when switching to AI tab
  useEffect(() => {
    if (activeTab !== 'ai') return;
    (async () => {
      setAiLoading(true);
      try {
        const token = await getAccessToken();
        if (!token) return;
        const res = await fetch('/api/admin/ai/providers', { headers: { authorization: `Bearer ${token}` }, cache: 'no-store' });
        const json = await res.json();
        if (json.ok) {
          setAiProviders(json.data?.providers || []);
          setAiCatalog(json.data?.catalog || []);
        }
      } finally {
        setAiLoading(false);
      }
    })();
  }, [activeTab]);

  return (
    <main className="container-hero py-8">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-semibold">Admin</h1>
        <div className="flex items-center gap-2">
          {activeTab === 'email' ? (
            <>
              <Button variant="secondary" onClick={async ()=>{
                const token = await getAccessToken(); if (!token) return;
                const res = await fetch('/api/admin/export?type=emails', { headers: { authorization: `Bearer ${token}` } });
                if (!res.ok) { alert('Export failed'); return; }
                const blob = await res.blob(); const url = URL.createObjectURL(blob);
                const a = document.createElement('a'); a.href = url; a.download = `emails-${new Date().toISOString().slice(0,19).replace(/[:T]/g,'-')}.json`; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
              }}>Export Email</Button>
              <Button variant="secondary" onClick={async ()=>{
                const input = document.createElement('input'); input.type = 'file'; input.accept = '.json,application/json';
                input.onchange = async () => {
                  const file = (input.files && input.files[0]) || null; if (!file) return;
                  const token = await getAccessToken(); if (!token) return;
                  const text = await file.text();
                  const res = await fetch('/api/admin/import?type=emails', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: text });
                  const j = await res.json().catch(()=>null); if (!j || !j.ok) alert(j?.error?.message || 'Import failed'); else alert('Import complete');
                };
                input.click();
              }}>Import Email</Button>
            </>
          ) : activeTab === 'users' || activeTab === 'ai' || activeTab === 'telephony' ? (
            <>
              <Button variant="secondary" onClick={async ()=>{
                const token = await getAccessToken(); if (!token) return;
                const res = await fetch('/api/admin/export?type=settings', { headers: { authorization: `Bearer ${token}` } });
                if (!res.ok) { alert('Export failed'); return; }
                const blob = await res.blob(); const url = URL.createObjectURL(blob);
                const a = document.createElement('a'); a.href = url; a.download = `settings-${new Date().toISOString().slice(0,19).replace(/[:T]/g,'-')}.json`; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
              }}>Export Settings</Button>
              <Button variant="secondary" onClick={async ()=>{
                const input = document.createElement('input'); input.type = 'file'; input.accept = '.json,application/json';
                input.onchange = async () => {
                  const file = (input.files && input.files[0]) || null; if (!file) return;
                  const token = await getAccessToken(); if (!token) return;
                  const text = await file.text();
                  const res = await fetch('/api/admin/import?type=settings', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: text });
                  const j = await res.json().catch(()=>null); if (!j || !j.ok) alert(j?.error?.message || 'Import failed'); else alert('Import complete');
                };
                input.click();
              }}>Import Settings</Button>
            </>
          ) : null}
        </div>
      </div>
      <div className="mb-4 flex items-center gap-2">
        <Button variant={activeTab === 'users' ? 'primary' : 'secondary'} onClick={() => setActiveTab('users')}>Users</Button>
        <Button variant={activeTab === 'ai' ? 'primary' : 'secondary'} onClick={() => setActiveTab('ai')}>AI</Button>
        <Button variant={activeTab === 'telephony' ? 'primary' : 'secondary'} onClick={() => setActiveTab('telephony')}>Call/SMS</Button>
        <Button variant={activeTab === 'email' ? 'primary' : 'secondary'} onClick={() => setActiveTab('email')}>Email</Button>
      </div>
      {activeTab === 'users' ? (
        <>
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
                   // Re-fetch after save to ensure UI reflects persisted values
                   try {
                     const res = await fetch('/api/admin/settings/registration', { headers: { authorization: `Bearer ${token}` }, cache: 'no-store' });
                     const json = await res.json();
                     if (json.ok) {
                       setRegEnabled(!!json.data?.registrationEnabled);
                       setEmailVerificationEnabled(!!json.data?.emailVerificationEnabled);
                     }
                   } catch {}
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
                const payload: any = { ...emailCfg, imap_enabled: imapEnabled, imap_host: imapHost, imap_port: imapPort || 993, imap_secure: imapSecure, imap_username: imapUsername, imap_poll_seconds: imapPollSeconds || 60 };
                // Apply password intent:
                // - If Clear is checked, set to null (remove from DB)
                // - Else if user typed a new password, send it
                // - Else omit the field to preserve stored value
                if (smtpClearPassword) {
                  payload.password = null;
                } else if ((emailCfg.password || '').length > 0) {
                  payload.password = emailCfg.password;
                } else {
                  delete payload.password;
                }
                if ((imapPassword || '').length > 0) payload.imap_password = imapPassword; else payload.imap_password = undefined;
                const res = await fetch('/api/admin/settings/email', { method: 'PUT', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify(payload) });
                const json = await res.json();
                setEmailBusy('idle');
                setEmailMsg(json.ok ? 'Saved.' : 'Failed to save');
                if (json.ok) {
                  if (smtpClearPassword) {
                    setSmtpHasPassword(false);
                  } else if ((emailCfg.password || '').length > 0) {
                    setSmtpHasPassword(true);
                  }
                  setEmailCfg((cfg) => ({ ...cfg, password: '' }));
                  setSmtpClearPassword(false);
                  setImapPassword('');
                  // Refresh from server to reflect saved IMAP settings + password presence
                  try {
                    const res2 = await fetch('/api/admin/settings/email', { headers: { authorization: `Bearer ${token}` }, cache: 'no-store' });
                    const j2 = await res2.json();
                    if (j2.ok) {
                      setImapEnabled(!!j2.data?.imap_enabled);
                      setImapHost(j2.data?.imap_host || '');
                      setImapPort(Number(j2.data?.imap_port || 993));
                      setImapSecure(!!j2.data?.imap_secure);
                      setImapUsername(j2.data?.imap_username || '');
                      setImapHasPassword(!!j2.data?.imapHasPassword);
                      setImapPollSeconds(Number(j2.data?.imap_poll_seconds || 60));
                    }
                  } catch {}
                }
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
                    <Input placeholder={smtpHasPassword ? '•••••• (stored)' : 'Password (optional)'} value={emailCfg.password || ''} onChange={e => setEmailCfg({ ...(emailCfg as any), password: e.target.value })} />
                  </div>
                  <label className="md:col-span-2 text-xs flex items-center gap-2">
                    <input type="checkbox" checked={smtpClearPassword} onChange={(e) => setSmtpClearPassword(e.target.checked)} />
                    Clear saved SMTP password
                  </label>
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

            {/* IMAP inbound poller settings */}
            <div className="h-px bg-black/10 dark:bg-white/10 my-5" />
            <div className="space-y-2">
              <h3 className="font-medium">Inbound Email (IMAP poller)</h3>
              <p className="text-sm opacity-70">Enable polling your mailbox every N seconds to ingest incoming emails into customer communications.</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <label className="text-sm flex items-center gap-2">
                  <input type="checkbox" checked={imapEnabled} onChange={(e) => setImapEnabled(e.target.checked)} /> Enable IMAP polling
                </label>
                <div />
                <Input placeholder="IMAP host" value={imapHost} onChange={(e) => setImapHost(e.target.value)} />
                <div className="grid grid-cols-[1fr_auto] gap-3">
                  <Input placeholder="Port" type="number" value={imapPort as any} onChange={(e) => setImapPort(e.target.value ? Number(e.target.value) : '')} />
                  <select className="rounded-lg border px-3 py-2 bg-white dark:bg-gray-900 text-black dark:text-white border-black/10 dark:border-white/10" value={imapSecure ? 'true' : 'false'} onChange={(e) => setImapSecure(e.target.value === 'true')}>
                    <option value="true">TLS</option>
                    <option value="false">STARTTLS</option>
                  </select>
                </div>
                <Input placeholder="IMAP username" value={imapUsername} onChange={(e) => setImapUsername(e.target.value)} />
                <Input placeholder={imapHasPassword ? '•••••• (stored)' : 'IMAP password'} value={imapPassword} onChange={(e) => setImapPassword(e.target.value)} />
                <Input placeholder="Poll interval seconds (15–3600)" type="number" value={imapPollSeconds as any} onChange={(e) => setImapPollSeconds(e.target.value ? Number(e.target.value) : '')} />
              </div>
            </div>

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
        </>
      ) : activeTab === 'ai' ? (
        <>
          {/* AI Providers Management */}
          <div className="rounded-2xl border border-black/10 dark:border-white/10 bg-white/60 dark:bg-white/5 backdrop-blur p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-semibold">AI Providers</h2>
              {aiLoading && (
                <span className="text-xs opacity-70 inline-flex items-center gap-1">
                  <span className="inline-block size-2 rounded-full animate-pulse bg-blue-500" /> Loading…
                </span>
              )}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-2 mb-4">
              <Select value={addProviderId} onChange={(e) => setAddProviderId(e.target.value)}>
                <option value="">Choose provider…</option>
                {aiCatalog.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </Select>
              <Button disabled={!addProviderId || addBusy} onClick={handleAddProvider}>{addBusy ? 'Adding…' : 'Add provider'}</Button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {aiProviders.map((p) => (
                <Card key={p.id}>
                  <CardHeader
                    title={`${displayProviderName(p.provider)}${p.label ? ` — ${p.label}` : ''}`}
                    subtitle={p.baseUrl || ''}
                    actions={
                      <div className="flex items-center gap-3">
                        <label className="text-xs flex items-center gap-2">
                          <input type="checkbox" checked={p.enabled} onChange={(e) => handleToggleProvider(p.id, e.target.checked)} /> Enabled
                        </label>
                        <Button size="sm" variant="secondary" onClick={() => openEdit(p)}>Edit</Button>
                        <Button size="sm" variant="destructive" onClick={() => handleDeleteProvider(p.id)}>Delete</Button>
                      </div>
                    }
                  />
                  <CardBody>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div>
                        <div className="opacity-70 text-xs">Model</div>
                        <div className="font-medium truncate">{p.model || '—'}</div>
                      </div>
                      <div>
                        <div className="opacity-70 text-xs">Priority</div>
                        <div className="font-medium">{p.priority}</div>
                      </div>
                      <div>
                        <div className="opacity-70 text-xs">Timeout</div>
                        <div className="font-medium">{p.timeoutMs ? `${p.timeoutMs} ms` : 'Default'}</div>
                      </div>
                      <div>
                        <div className="opacity-70 text-xs">API Key</div>
                        <div className="font-medium">{p.hasApiKey ? 'Set' : '—'}</div>
                      </div>
                    </div>
                  </CardBody>
                </Card>
              ))}
            </div>
          </div>

          {/* Chat test interface */}
          <div className="mt-8 rounded-2xl border border-black/10 dark:border-white/10 bg-white/60 dark:bg-white/5 backdrop-blur p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-semibold">AI Chat Test</h2>
              {chatBusy !== 'idle' && <span className="text-xs opacity-70">Sending…</span>}
            </div>
            <div className="grid gap-3">
              <Input placeholder="System prompt (optional)" value={chatSystem} onChange={(e) => setChatSystem(e.target.value)} />
              <div className="rounded-xl border border-black/10 dark:border-white/10 bg-white/70 dark:bg-white/5 p-3 max-h-[320px] overflow-y-auto text-sm">
                {chatMessages.length === 0 ? (
                  <div className="opacity-60">No messages yet. Your enabled providers will be used in order of priority; failures will automatically fail over.</div>
                ) : (
                  <div className="space-y-3">
                    {chatMessages.map((m, i) => (
                      <div key={i} className={m.role === 'assistant' ? 'text-blue-700 dark:text-blue-300' : (m.role === 'system' ? 'text-purple-700 dark:text-purple-300' : '')}>
                        <span className="font-semibold mr-2">{m.role}:</span>
                        <span className="whitespace-pre-wrap">{m.content}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              {chatMeta && (
                <div className="text-xs opacity-70">
                  {chatMeta.provider ? (
                    <>Replied by {displayProviderName(chatMeta.provider || '')} {chatMeta.model ? `(${chatMeta.model})` : ''}</>
                  ) : (
                    <>No reply</>
                  )}
                  {chatMeta.tried && chatMeta.tried.length ? `; tried: ${chatMeta.tried.map(t => `${t.provider}(${t.code})`).join(' → ')}` : ''}
                  {chatMeta.details?.providers ? `; providers: ${chatMeta.details.providers.map((p: any) => `${p.provider}${p.model ? '(' + p.model + ')' : ''}`).join(', ')}` : ''}
                </div>
              )}
              <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-2">
                <Input placeholder="Type a message…" value={chatInput} onChange={(e) => setChatInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendChat(); } }} />
                <Button onClick={handleSendChat} disabled={!chatInput || chatBusy !== 'idle'}>Send</Button>
              </div>
            </div>
          </div>

          {/* Edit provider dialog */}
          <Dialog open={!!editOpenForId} onOpenChange={(o) => setEditOpenForId(o ? editOpenForId : null)} title="Configure provider">
            {editForm && (
              <div className="space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <label className="text-sm block">
                    <span className="text-xs opacity-70">Label</span>
                    <Input value={editForm.label} onChange={(e) => setEditForm({ ...(editForm as any), label: e.target.value })} placeholder="Optional display label" />
                  </label>
                  <label className="text-sm block">
                    <span className="text-xs opacity-70">Base URL</span>
                    <Input value={editForm.baseUrl} onChange={(e) => setEditForm({ ...(editForm as any), baseUrl: e.target.value })} placeholder="https://…" />
                  </label>
                </div>
                <label className="text-sm block">
                  <span className="text-xs opacity-70">API Key</span>
                  <Input value={editForm.apiKey} onChange={(e) => setEditForm({ ...(editForm as any), apiKey: e.target.value })} placeholder={editingProviderHasKey ? '•••••• (stored)' : 'sk-…'} />
                  <div className="mt-1 text-xs opacity-70">For security, the saved key is not shown. Leave blank to keep existing; enter a new key to update.</div>
                </label>
                <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-2">
                  <label className="text-sm block">
                    <span className="text-xs opacity-70">Model</span>
                    <Select value={editForm.model} onChange={(e) => setEditForm({ ...(editForm as any), model: e.target.value })}>
                      <option value="">Select…</option>
                      {editModels.map((m) => (
                        <option key={m} value={m}>{m}</option>
                      ))}
                    </Select>
                  </label>
                  <Button variant="secondary" onClick={handleFetchModels}>Fetch models</Button>
                </div>
                {editModelsError && <div className="text-xs text-red-600">{editModelsError}</div>}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <label className="text-sm block">
                    <span className="text-xs opacity-70">Timeout (ms)</span>
                    <Input type="number" value={editForm.timeoutMs as any} onChange={(e) => setEditForm({ ...(editForm as any), timeoutMs: e.target.value ? Number(e.target.value) : '' })} placeholder="Default" />
                  </label>
                  <label className="text-sm block">
                    <span className="text-xs opacity-70">Priority</span>
                    <Input type="number" value={editForm.priority as any} onChange={(e) => setEditForm({ ...(editForm as any), priority: e.target.value ? Number(e.target.value) : '' })} />
                  </label>
                </div>
              </div>
            )}
            <DialogActions>
              <Button variant="secondary" onClick={() => setEditOpenForId(null)}>Cancel</Button>
              <Button onClick={handleSaveProvider}>Save</Button>
            </DialogActions>
          </Dialog>
        </>
      ) : activeTab === 'email' ? (
        <AdminEmailClient />
      ) : (
        <>
          {/* Telephony: SMS and Call ring-through */}
          <div className="rounded-2xl border border-black/10 dark:border-white/10 bg-white/60 dark:bg-white/5 backdrop-blur p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-semibold">Send SMS</h2>
            </div>
            <TelephonySettingsBlock />
            <div className="h-px bg-black/10 dark:bg-white/10 my-5" />
            <TelephonySendSmsForm />
          </div>

          <div className="mt-8 rounded-2xl border border-black/10 dark:border-white/10 bg-white/60 dark:bg-white/5 backdrop-blur p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-semibold">Ring-through Call</h2>
              <span className="text-xs opacity-70">Rings target and hangs up on answer (placeholder)</span>
            </div>
            <TelephonyCallRingForm />
          </div>
        </>
      )}
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

  function displayProviderName(id: string): string {
    const found = aiCatalog.find((p) => p.id === id);
    return found?.name || id;
  }

  async function handleAddProvider() {
    if (!addProviderId) return;
    setAddBusy(true);
    try {
      const token = await getAccessToken();
      if (!token) return;
      const res = await fetch('/api/admin/ai/providers', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({ provider: addProviderId }),
      });
      const json = await res.json();
      if (json.ok) {
        setAiProviders((prev) => [...prev, json.data]);
        setAddProviderId('');
      }
    } finally {
      setAddBusy(false);
    }
  }

  function openEdit(p: AiProviderRow) {
    setEditOpenForId(p.id);
    setEditModels([]);
    setEditForm({
      label: p.label || '',
      baseUrl: p.baseUrl || '',
      apiKey: '',
      model: p.model || '',
      timeoutMs: p.timeoutMs || '',
      priority: p.priority,
    });
  }

  async function handleFetchModels() {
    if (!editOpenForId || !editForm) return;
    const p = aiProviders.find((x) => x.id === editOpenForId);
    if (!p) return;
    try {
      const token = await getAccessToken();
      if (!token) return;
      // Prefer using override so API key/baseUrl typed but unsaved can be used
      const res = await fetch('/api/admin/ai/models', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({ id: p.id, provider: p.provider, apiKey: editForm.apiKey || undefined, baseUrl: editForm.baseUrl || undefined, timeoutMs: editForm.timeoutMs || undefined }),
      });
      const json = await res.json();
      if (json.ok) {
        setEditModelsError(null);
        setEditModels(json.data?.models || []);
      } else {
        setEditModels([]);
        setEditModelsError(json?.error?.message || 'Failed to fetch models');
      }
    } catch (e: any) {
      setEditModels([]);
      setEditModelsError(e?.message || 'Failed to fetch models');
    }
  }

  async function handleSaveProvider() {
    if (!editOpenForId || !editForm) return;
    try {
      const token = await getAccessToken();
      if (!token) return;
      const payload: any = {
        label: editForm.label || null,
        baseUrl: editForm.baseUrl || null,
        // Only include apiKey when user entered a value; blank means don't change
        model: editForm.model || null,
        timeoutMs: editForm.timeoutMs || null,
        priority: editForm.priority || 1000,
      };
      if ((editForm.apiKey || '').trim().length > 0) payload.apiKey = editForm.apiKey;
      const res = await fetch(`/api/admin/ai/providers/${editOpenForId}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (json.ok) {
        setAiProviders((prev) => prev.map((x) => (x.id === json.data.id ? json.data : x)));
        setEditOpenForId(null);
      }
    } catch {}
  }

  async function handleToggleProvider(id: number, enabled: boolean) {
    try {
      const token = await getAccessToken();
      if (!token) return;
      const res = await fetch(`/api/admin/ai/providers/${id}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({ enabled }),
      });
      const json = await res.json();
      if (json.ok) setAiProviders((prev) => prev.map((x) => (x.id === id ? json.data : x)));
    } catch {}
  }

  async function handleDeleteProvider(id: number) {
    if (!confirm('Delete this provider configuration?')) return;
    try {
      const token = await getAccessToken();
      if (!token) return;
      const res = await fetch(`/api/admin/ai/providers/${id}`, { method: 'DELETE', headers: { authorization: `Bearer ${token}` } });
      const json = await res.json();
      if (json.ok) setAiProviders((prev) => prev.filter((x) => x.id !== id));
    } catch {}
  }

  async function handleSendChat() {
    const content = chatInput.trim();
    if (!content) return;
    setChatBusy('sending');
    setChatMeta(null);
    setChatMessages((prev) => {
      const sys = chatSystem.trim();
      const base = prev.length === 0 && sys ? [{ role: 'system' as const, content: sys }] : [];
      return [...base, ...prev, { role: 'user' as const, content }];
    });
    setChatInput('');
    try {
      const token = await getAccessToken();
      if (!token) return;
      const msgs = [...(chatSystem.trim() ? [{ role: 'system', content: chatSystem.trim() }] : []), ...chatMessages.filter(m => m.role !== 'system'), { role: 'user', content }];
      const res = await fetch('/api/admin/ai/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({ messages: msgs }),
      });
      const json = await res.json();
      if (json.ok) {
        setChatMessages((prev) => [...prev, { role: 'assistant', content: json.data?.content || '' }]);
        setChatMeta({ provider: json.data?.provider, model: json.data?.model, tried: json.data?.tried, details: null });
      } else {
        const details = json?.error?.details;
        let extra = '';
        if (details?.tried && Array.isArray(details.tried)) extra = ` Tried: ${details.tried.map((t: any) => `${t.provider}(${t.code})`).join(' → ')}`;
        setChatMessages((prev) => [...prev, { role: 'assistant', content: `Error: ${json?.error?.message || 'Failed'}.${extra}` }]);
        setChatMeta({ provider: undefined, model: undefined, tried: details?.tried || [], details });
      }
    } catch (e: any) {
      setChatMessages((prev) => [...prev, { role: 'assistant', content: `Error: ${e?.message || 'Network error'}` }]);
    } finally {
      setChatBusy('idle');
    }
  }
}

// Standalone Admin email client with bulk delete and reduced flashing
function AdminEmailClient() {
  const [box, setBox] = useState<'inbox'|'sent'>('inbox');
  const [items, setItems] = useState<Array<any>>([]);
  const [stats, setStats] = useState<{ inbox: number; sent: number; read_in: number; unread_in: number }>({ inbox: 0, sent: 0, read_in: 0, unread_in: 0 });
  const [selected, setSelected] = useState<any | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(50);
  const [total, setTotal] = useState(0);
  const [busy, setBusy] = useState<'idle'|'loading'|'sending'>('idle');
  const [composeOpen, setComposeOpen] = useState(false);
  const [compose, setCompose] = useState<{ to: string; subject: string; body: string }>({ to: '', subject: '', body: '' });
  const [checkedIds, setCheckedIds] = useState<number[]>([]);
  // Poller countdown UI state (server is source of truth)
  const [pollRemaining, setPollRemaining] = useState<number | null>(null);
  const [pollIntervalSec, setPollIntervalSec] = useState<number | null>(null);
  const allChecked = items.length > 0 && checkedIds.length === items.length;

  useEffect(() => { (async () => {
    setBusy('loading');
    try {
      const token = await getAccessToken();
      if (!token) return;
      const res = await fetch(`/api/admin/email?box=${box}&page=${page}&pageSize=${pageSize}`, { headers: { authorization: `Bearer ${token}` }, cache: 'no-store' });
      const json = await res.json();
      if (json.ok) {
        const nextItems = json.data.items || [];
        const sameLength = nextItems.length === items.length;
        const sameIds = sameLength && nextItems.every((n: any, i: number) => items[i]?.id === n.id && items[i]?.seen === n.seen);
        if (!sameIds) setItems(nextItems);
        setTotal(json.data.total || 0);
        setStats(json.data.stats || { inbox: 0, sent: 0, read_in: 0, unread_in: 0 });
        if (selected) {
          const still = nextItems.find((x: any) => x.id === selected.id);
          setSelected(still || null);
        }
        setCheckedIds((prev) => prev.filter((id) => nextItems.some((x: any) => x.id === id)));
      }
    } finally { setBusy('idle'); }
  })(); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [box, page, pageSize]);

  // Fetch current poller status from server and keep a live ticking countdown
  useEffect(() => {
    let cancelled = false;
    let tickId: any = null;
    let syncId: any = null;
    (async () => {
      try {
        const token = await getAccessToken();
        if (!token) return;
        // Ask server for current poller status (interval + remaining)
        const res = await fetch('/api/crm/inbound/email/poll', { method: 'GET', headers: { authorization: `Bearer ${token}` }, cache: 'no-store' });
        const j = await res.json().catch(() => null);
        if (!cancelled && j && j.ok !== false && j.poller) {
          setPollIntervalSec(Number(j.poller.intervalSec || 60));
          setPollRemaining(Number(j.poller.remainingSec || j.poller.intervalSec || 60));
        } else if (!cancelled) {
          // Fallback: fetch settings to get interval and initialize countdown
          try {
            const res2 = await fetch('/api/admin/settings/email', { headers: { authorization: `Bearer ${token}` }, cache: 'no-store' });
            const j2 = await res2.json().catch(() => null);
            if (j2 && j2.ok) {
              const sec = Number(j2.data?.imap_poll_seconds || 60);
              setPollIntervalSec(sec);
              setPollRemaining((prev) => (typeof prev === 'number' ? prev : sec));
            }
          } catch {}
        }
      } catch {}
    })();
    // Instead of relying on a dedicated status endpoint, recompute countdown locally and refresh from server periodically
    const loadStatus = async () => {
      try {
        const token = await getAccessToken();
        if (!token) return;
        const res = await fetch('/api/crm/inbound/email/poll', { method: 'GET', headers: { authorization: `Bearer ${token}` }, cache: 'no-store' });
        const j = await res.json().catch(() => null);
        if (!cancelled && j && j.ok !== false && j.poller) {
          setPollIntervalSec(Number(j.poller.intervalSec || 60));
          // Only update remaining if our local has drifted too far or is null
          setPollRemaining((prev) => {
            const serverRem = Number(j.poller.remainingSec || j.poller.intervalSec || 60);
            if (prev === null) return serverRem;
            if (Math.abs(serverRem - prev) >= 3) return serverRem;
            return prev;
          });
        }
      } catch {}
      // Ask the poll endpoint for status without running a poll by issuing a GET, which returns 405 today. We'll ignore and let local timer tick.
    };
    loadStatus();
    tickId = setInterval(() => {
      setPollRemaining((prev) => {
        if (typeof prev === 'number') return Math.max(0, prev - 1);
        if (typeof pollIntervalSec === 'number') return Math.max(0, (pollIntervalSec as number) - 1);
        return prev;
      });
    }, 1000);
    syncId = setInterval(() => { loadStatus(); }, 15000);
    return () => { cancelled = true; if (tickId) clearInterval(tickId); if (syncId) clearInterval(syncId); };
  }, []);

  return (
    <div className="rounded-2xl border border-black/10 dark:border-white/10 bg-white/60 dark:bg-white/5 backdrop-blur p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-semibold">Email</h2>
        <div className="text-xs opacity-70">Inbox: {stats.inbox} ({stats.unread_in} unread) · Sent: {stats.sent}</div>
      </div>
      <div className="flex items-center gap-2 mb-3">
        <Button variant={box==='inbox'?'primary':'secondary'} onClick={() => { setBox('inbox'); setPage(1); }}>Inbox</Button>
        <Button variant={box==='sent'?'primary':'secondary'} onClick={() => { setBox('sent'); setPage(1); }}>Sent</Button>
        <Button onClick={() => setComposeOpen(true)}>New</Button>
        {checkedIds.length > 0 && (
          <Button variant="destructive" onClick={async () => {
            if (!confirm(`Delete ${checkedIds.length} selected email(s)?`)) return;
            const token = await getAccessToken();
            if (!token) return;
            await fetch(`/api/admin/email`, { method: 'DELETE', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify({ ids: checkedIds }) });
            setItems((prev) => prev.filter((x) => !checkedIds.includes(x.id)));
            if (selected && checkedIds.includes(selected.id)) setSelected(null);
            setCheckedIds([]);
          }}>Delete selected</Button>
        )}
        <Button variant="secondary" onClick={async () => {
          setBusy('loading');
          try {
            const token = await getAccessToken();
            if (!token) return;
            const res = await fetch('/api/crm/inbound/email/poll', { method: 'POST', headers: { authorization: `Bearer ${token}` } });
            const j = await res.json();
            // eslint-disable-next-line no-console
            console.log('Check Now:', j);
            // Reset countdown based on server-reported status
            if (j?.ok !== false && j?.poller) {
              const nextInterval = Number(j.poller.intervalSec || 60);
              const nextRemaining = Number(j.poller.remainingSec ?? nextInterval);
              setPollIntervalSec(nextInterval);
              // If server reports 0/1s (race), show full interval immediately after manual check
              setPollRemaining(nextRemaining <= 1 ? nextInterval : nextRemaining);
            } else if (pollIntervalSec) {
              setPollRemaining(pollIntervalSec);
            }
            const res2 = await fetch(`/api/admin/email?box=${box}&page=${page}&pageSize=${pageSize}`, { headers: { authorization: `Bearer ${token}` }, cache: 'no-store' });
            const json2 = await res2.json();
            if (json2.ok) { setItems(json2.data.items || []); setTotal(json2.data.total || 0); setStats(json2.data.stats || stats); }
          } finally { setBusy('idle'); }
        }}>{(() => {
          const rem = typeof pollRemaining === 'number' ? pollRemaining : (pollIntervalSec || 60);
          return rem > 0 ? `Check Now (${rem}s)` : 'Check Now';
        })()}</Button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="rounded-xl border border-black/10 dark:border-white/10 max-h-[520px] overflow-auto">
          {items.length === 0 ? (
            <div className="p-4 text-sm opacity-70">No messages.</div>
          ) : (
            <ul className="divide-y divide-black/5 dark:divide-white/10 text-sm">
              <li className="px-3 py-2 flex items-center gap-3 sticky top-0 bg-white/80 dark:bg-black/40 backdrop-blur z-10">
                <input type="checkbox" className="size-4" checked={allChecked} onChange={(e) => {
                  setCheckedIds(e.target.checked ? items.map((x) => x.id) : []);
                }} />
                <span className="text-xs opacity-70">Select all</span>
              </li>
              {items.map((m) => (
                <li key={m.id} className={`px-3 py-2 cursor-pointer ${box==='inbox' && !m.seen ? 'bg-black/5 dark:bg-white/10' : ''}`} onClick={async () => {
                  setSelected(m);
                  if (box==='inbox' && !m.seen) {
                    const token = await getAccessToken();
                    await fetch('/api/admin/email', { method: 'POST', headers: { 'content-type':'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify({ id: m.id }) });
                    setItems((prev) => prev.map(x => x.id===m.id ? { ...x, seen: 1 } : x));
                  }
                }}>
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-3 min-w-0">
                      <input type="checkbox" className="size-4" checked={checkedIds.includes(m.id)} onChange={(e) => {
                        e.stopPropagation();
                        setCheckedIds((prev) => e.target.checked ? Array.from(new Set([...prev, m.id])) : prev.filter((id) => id !== m.id));
                      }} />
                      <div className="truncate">{box==='inbox' ? m.from_email : m.to_email}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="opacity-60 text-xs">{new Date(m.created_at).toLocaleString()}</div>
                      <button title="Delete" className="text-red-600" onClick={async (e) => {
                        e.stopPropagation();
                        if (!confirm('Delete this email?')) return;
                        const token = await getAccessToken();
                        await fetch(`/api/admin/email?id=${m.id}`, { method: 'DELETE', headers: { authorization: `Bearer ${token}` } });
                        setItems(prev => prev.filter(x => x.id !== m.id));
                        setCheckedIds((prev) => prev.filter((id) => id !== m.id));
                        if (selected && selected.id === m.id) setSelected(null);
                      }}>
                        🗑️
                      </button>
                    </div>
                  </div>
                  <div className="truncate font-medium">{m.subject || '(no subject)'}</div>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="rounded-xl border border-black/10 dark:border-white/10 min-h-[520px]">
          {!selected ? (
            <div className="p-4 text-sm opacity-70">Select an email to preview.</div>
          ) : (
            <div className="p-4 text-sm space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium">{selected.subject || '(no subject)'}</div>
                  <div className="opacity-60 text-xs">{box==='inbox' ? selected.from_email : selected.to_email} · {new Date(selected.created_at).toLocaleString()}</div>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      setCompose({
                        to: box === 'inbox' ? selected.from_email : (selected.to_email || ''),
                        subject: `Re: ${selected.subject || ''}`,
                        body: `\n\nOn ${new Date(selected.created_at).toLocaleString()}, they wrote:\n> ${String(selected.body || '').split('\n').map((l:string)=>l?'> '+l:'>').join('\n')}`,
                      });
                      setComposeOpen(true);
                    }}
                  >
                    Reply
                  </Button>
                  <button title="Delete" className="text-red-600" onClick={async () => {
                    if (!confirm('Delete this email?')) return;
                    const token = await getAccessToken();
                    await fetch(`/api/admin/email?id=${selected.id}`, { method: 'DELETE', headers: { authorization: `Bearer ${token}` } });
                    setItems(prev => prev.filter(x => x.id !== selected.id));
                    setCheckedIds((prev) => prev.filter((id) => id !== selected.id));
                    setSelected(null);
                  }}>
                    🗑️
                  </button>
                </div>
              </div>
              <div className="whitespace-pre-wrap border-t pt-3 border-black/10 dark:border-white/10">{selected.body || ''}</div>
            </div>
          )}
        </div>
      </div>
      <Dialog open={composeOpen} onOpenChange={setComposeOpen} title="Compose Email">
        <div className="space-y-2">
          <Input placeholder="To" value={compose.to} onChange={(e) => setCompose({ ...compose, to: e.target.value })} />
          <Input placeholder="Subject" value={compose.subject} onChange={(e) => setCompose({ ...compose, subject: e.target.value })} />
          <textarea className="rounded-lg border px-3 py-2 bg-white dark:bg-gray-900 text-black dark:text-white border-black/10 dark:border-white/10 min-h-[160px]" placeholder="Message" value={compose.body} onChange={(e) => setCompose({ ...compose, body: e.target.value })} />
        </div>
        <DialogActions>
          <Button variant="secondary" onClick={() => setComposeOpen(false)}>Cancel</Button>
          <Button onClick={async () => {
            setBusy('sending');
            try {
              const token = await getAccessToken();
              if (!token) return;
              const res = await fetch(`/api/admin/email/send`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify({ to: compose.to, subject: compose.subject, body: compose.body }) });
              const j = await res.json();
              if (!j.ok) alert(j?.error?.message || 'Failed'); else { setComposeOpen(false); setBox('sent'); setPage(1); }
            } finally { setBusy('idle'); }
          }}>Send</Button>
        </DialogActions>
      </Dialog>
    </div>
  );
}
function TelephonySettingsBlock() {
  const [provider, setProvider] = useState<'bulkvs'>('bulkvs');
  const [baseUrl, setBaseUrl] = useState('');
  const [fromDid, setFromDid] = useState('');
  const [hasBasicAuth, setHasBasicAuth] = useState(false);
  const [basicAuthInput, setBasicAuthInput] = useState('');
  const [clearAuth, setClearAuth] = useState(false);
  const [busy, setBusy] = useState<'idle'|'loading'|'saving'>('idle');
  const [msg, setMsg] = useState<string | null>(null);
  const [twilioSid, setTwilioSid] = useState('');
  const [twilioFrom, setTwilioFrom] = useState('');
  const [twilioHasAuth, setTwilioHasAuth] = useState(false);
  const [twilioAuthInput, setTwilioAuthInput] = useState('');
  const [twilioSvcSid, setTwilioSvcSid] = useState('');
  const [hasToken, setHasToken] = useState(false);
  const [webhookSmsUrl, setWebhookSmsUrl] = useState<string | null>(null);
  const [webhookVoiceUrl, setWebhookVoiceUrl] = useState<string | null>(null);
  useEffect(() => {
    (async () => {
      setBusy('loading'); setMsg(null);
      const token = await getAccessToken();
      if (!token) { setBusy('idle'); setMsg('Not authorized'); return; }
      try {
        const res = await fetch('/api/admin/telephony/settings', { headers: { authorization: `Bearer ${token}` }, cache: 'no-store' });
        const json = await res.json();
        if (json.ok && json.data) {
          setProvider(json.data.provider || 'bulkvs');
          setBaseUrl(json.data.baseUrl || '');
          setFromDid(json.data.fromDid || '');
          setHasBasicAuth(!!json.data.hasBasicAuth);
          setTwilioSid(json.data.twilioAccountSid || '');
          setTwilioFrom(json.data.twilioFrom || '');
          setTwilioHasAuth(!!json.data.hasTwilioAuth);
          setTwilioSvcSid(json.data.twilioMessagingServiceSid || '');
          setHasToken(!!json.data.hasToken);
          setWebhookSmsUrl(json.data.webhookSmsUrl || null);
          setWebhookVoiceUrl(json.data.webhookVoiceUrl || null);
        }
      } catch {}
      setBusy('idle');
    })();
  }, []);
  return (
    <div className="grid gap-3">
      <div className="flex items-center justify-between">
        <h3 className="font-medium">BulkVS Settings</h3>
        {busy !== 'idle' && <span className="text-xs opacity-70">{busy === 'loading' ? 'Loading…' : 'Saving…'}</span>}
      </div>
      {msg && <div className="text-xs">{msg}</div>}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Input placeholder="Base URL" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} />
        <Input placeholder="Default From DID (optional)" value={fromDid} onChange={(e) => setFromDid(e.target.value)} />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Input placeholder={hasBasicAuth ? 'Basic Auth (stored)' : 'Basic Auth (username:token base64)'} value={basicAuthInput} onChange={(e) => setBasicAuthInput(e.target.value)} />
        <label className="text-xs flex items-center gap-2">
          <input type="checkbox" checked={clearAuth} onChange={(e) => setClearAuth(e.target.checked)} />
          Clear saved Basic Auth
        </label>
      </div>
      <div className="h-px bg-black/10 dark:bg-white/10" />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Input placeholder="Twilio Account SID (optional)" value={twilioSid} onChange={(e) => setTwilioSid(e.target.value)} />
        <Input placeholder={twilioHasAuth ? 'Twilio Auth Token (stored)' : 'Twilio Auth Token'} value={twilioAuthInput} onChange={(e) => setTwilioAuthInput(e.target.value)} />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Input placeholder="Twilio From Number (e.g., +14147100420)" value={twilioFrom} onChange={(e) => setTwilioFrom(e.target.value)} />
        <Input placeholder="Twilio Messaging Service SID (optional)" value={twilioSvcSid} onChange={(e) => setTwilioSvcSid(e.target.value)} />
      </div>
      <div className="flex items-center justify-between gap-3">
        <div className="text-xs opacity-80">
          <div>Inbound SMS Webhook: {webhookSmsUrl ? <a className="underline" href={webhookSmsUrl} target="_blank" rel="noreferrer">{webhookSmsUrl}</a> : 'Set PUBLIC_BASE_URL to view'}</div>
          <div>Inbound Voice Webhook: {webhookVoiceUrl ? <a className="underline" href={webhookVoiceUrl} target="_blank" rel="noreferrer">{webhookVoiceUrl}</a> : 'Set PUBLIC_BASE_URL to view'}</div>
          <div>Inbound Token: {hasToken ? 'Configured' : 'Not set'} <button className="underline ml-2" onClick={async () => {
            setBusy('saving'); setMsg(null);
            const token = await getAccessToken();
            if (!token) { setBusy('idle'); setMsg('Not authorized'); return; }
            try {
              const res = await fetch('/api/admin/telephony/settings', { method: 'PUT', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify({ regenToken: true }) });
              const json = await res.json();
              if (json.ok) {
                setHasToken(!!json.data?.hasToken);
                try {
                  const res2 = await fetch('/api/admin/telephony/settings', { headers: { authorization: `Bearer ${token}` }, cache: 'no-store' });
                  const j2 = await res2.json();
                  if (j2.ok) { setWebhookSmsUrl(j2.data?.webhookSmsUrl || null); setWebhookVoiceUrl(j2.data?.webhookVoiceUrl || null); }
                } catch {}
                setMsg('Token regenerated.');
              } else {
                setMsg(json?.error?.message || 'Failed to regenerate');
              }
            } catch (e: any) { setMsg(e?.message || 'Network error'); }
            setBusy('idle');
          }}>Regenerate</button></div>
        </div>
        <div>
          <Button disabled={busy !== 'idle'} onClick={async () => {
            setBusy('saving'); setMsg(null);
            const token = await getAccessToken();
            if (!token) { setBusy('idle'); setMsg('Not authorized'); return; }
            const payload: any = { provider, baseUrl, fromDid };
            if (clearAuth) payload.basicAuth = null; else if ((basicAuthInput || '').trim().length > 0) payload.basicAuth = basicAuthInput.trim();
            // Twilio fields
            if ((twilioSid || '').length >= 1) payload.twilioAccountSid = twilioSid.trim();
            if ((twilioAuthInput || '').length >= 1) payload.twilioAuthToken = twilioAuthInput.trim();
            if ((twilioFrom || '').length >= 1) payload.twilioFrom = twilioFrom.trim();
            if ((twilioSvcSid || '').length >= 1) payload.twilioMessagingServiceSid = twilioSvcSid.trim();
            try {
              const res = await fetch('/api/admin/telephony/settings', { method: 'PUT', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify(payload) });
              const json = await res.json();
              if (json.ok) {
                setMsg('Saved.');
                setHasBasicAuth(!!json.data?.hasBasicAuth);
                setTwilioHasAuth(!!json.data?.hasTwilioAuth);
                setHasToken(!!json.data?.hasToken || hasToken);
                setBasicAuthInput('');
                setClearAuth(false);
                setTwilioAuthInput('');
              } else {
                setMsg(json?.error?.message || 'Failed to save');
              }
            } catch (e: any) {
              setMsg(e?.message || 'Network error');
            }
            setBusy('idle');
          }}>Save</Button>
        </div>
      </div>
      <p className="text-xs opacity-70">Basic Auth should be the base64 of username:token without the leading &quot;Basic &quot;. Example: Authorization: Basic [value]</p>
    </div>
  );
}
function TelephonySendSmsForm() {
  const [to, setTo] = useState('');
  const [from, setFrom] = useState('');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState<'idle'|'sending'>('idle');
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <div className="grid gap-3">
      {msg && <div className="text-xs">{msg}</div>}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Input placeholder="To (E.164)" value={to} onChange={(e) => setTo(e.target.value)} />
        <Input placeholder="From (optional DID)" value={from} onChange={(e) => setFrom(e.target.value)} />
      </div>
      <textarea className="rounded-lg border px-3 py-2 bg-white dark:bg-gray-900 text-black dark:text-white border-black/10 dark:border-white/10 min-h-[100px]" placeholder="Message" value={text} onChange={(e) => setText(e.target.value)} />
      <div className="flex items-center justify-end">
        <Button disabled={!to || !text || busy !== 'idle'} onClick={async () => {
          setBusy('sending'); setMsg(null);
          const token = await getAccessToken();
          if (!token) { setBusy('idle'); setMsg('Not authorized'); return; }
          try {
            const res = await fetch('/api/admin/telephony/sms', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify({ to, from: from || undefined, body: text }) });
            const json = await res.json();
            setMsg(json.ok ? 'Sent.' : `Failed: ${json?.error?.message || 'Unknown error'}`);
          } catch (e: any) {
            setMsg(`Failed: ${e?.message || 'Network error'}`);
          } finally {
            setBusy('idle');
          }
        }}>{busy === 'idle' ? 'Send SMS' : 'Sending…'}</Button>
      </div>
    </div>
  );
}

function TelephonyCallRingForm() {
  const [to, setTo] = useState('');
  const [from, setFrom] = useState('');
  const [busy, setBusy] = useState<'idle'|'sending'>('idle');
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <div className="grid gap-3">
      {msg && <div className="text-xs">{msg}</div>}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Input placeholder="To (E.164)" value={to} onChange={(e) => setTo(e.target.value)} />
        <Input placeholder="From (optional DID)" value={from} onChange={(e) => setFrom(e.target.value)} />
      </div>
      <div className="flex items-center justify-end">
        <Button disabled={!to || busy !== 'idle'} onClick={async () => {
          setBusy('sending'); setMsg(null);
          const token = await getAccessToken();
          if (!token) { setBusy('idle'); setMsg('Not authorized'); return; }
          try {
            const res = await fetch('/api/admin/telephony/call', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify({ to, from: from || undefined }) });
            const json = await res.json();
            setMsg(json.ok ? 'Initiated.' : `Failed: ${json?.error?.message || 'Unknown error'}`);
          } catch (e: any) {
            setMsg(`Failed: ${e?.message || 'Network error'}`);
          } finally {
            setBusy('idle');
          }
        }}>{busy === 'idle' ? 'Ring Number' : 'Requesting…'}</Button>
      </div>
    </div>
  );
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


