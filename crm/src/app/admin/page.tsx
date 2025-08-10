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
  const [activeTab, setActiveTab] = useState<'users'|'ai'>('users');
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
        <h1 className="text-2xl font-semibold">Admin Console</h1>
        <div className="text-sm opacity-70">{activeTab === 'users' ? `${users.length} users` : `${aiProviders.length} AI configs`}</div>
      </div>
      <div className="mb-4 flex items-center gap-2">
        <Button variant={activeTab === 'users' ? 'primary' : 'secondary'} onClick={() => setActiveTab('users')}>Users</Button>
        <Button variant={activeTab === 'ai' ? 'primary' : 'secondary'} onClick={() => setActiveTab('ai')}>AI</Button>
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
        </>
      ) : (
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


