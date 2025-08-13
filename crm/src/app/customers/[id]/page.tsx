"use client";
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";

export default function CustomerDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = Number(params?.id);
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [allCampaigns, setAllCampaigns] = useState<Array<{ id:number; name:string; vertical?: string|null }>>([]);
  const [campaignIds, setCampaignIds] = useState<number[]>([]);
  const [saving, setSaving] = useState(false);
  const [composer, setComposer] = useState<{ to: string; subject: string; body: string; in_reply_to: string | null; references: string[] }>({ to: '', subject: '', body: '', in_reply_to: null, references: [] });

  async function reloadCustomer() {
    const token = await getAccessToken();
    if (!token) return;
    const res = await fetch(`/api/crm/customers/${id}`, { headers: { authorization: `Bearer ${token}` } });
    const json = await res.json().catch(() => null);
    if (!json || !json.ok) { setError('Not authorized or not found'); return; }
    setData(json.data);
    setCampaignIds((json.data.campaigns || []).map((c: any) => c.id));
    setComposer((c) => ({ ...c, to: (json.data.info?.email || '') }));
  }

  useEffect(() => {
    (async () => {
      await reloadCustomer();
      // Load all campaigns user can see (overview endpoint returns list filtered by role)
      try {
        const token = await getAccessToken();
        if (!token) return;
        const resOv = await fetch('/api/crm/overview', { headers: { authorization: `Bearer ${token}` }, cache: 'no-store' });
        const jo = await resOv.json().catch(() => null);
        if (jo && jo.ok) {
          setAllCampaigns((jo.data.campaigns || []).map((c: any) => ({ id: c.id, name: c.name, vertical: c.vertical })));
        }
      } catch {}
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (!data) return <main className="container-hero py-8">{error ? error : 'Loading…'}</main>;

  return (
    <main className="container-hero py-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{data.info.full_name}</h1>
          <p className="opacity-70">{data.info.email} · {data.info.phone}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={() => router.back()}>Back</Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader title="Email" />
            <CardBody>
              <CustomerEmailPane data={data} onUpdate={(d:any)=>setData(d)} customerId={id} setComposer={setComposer} />
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Notes" />
            <CardBody>
              <div className="space-y-3 text-sm">
                {(data.notes || []).map((n: any) => (
                  <div key={n.id} className="p-3 rounded-lg border border-black/5 dark:border-white/10">
                    <div className="opacity-70 text-xs">by {n.createdBy} · {new Date(n.created_at).toLocaleString()}</div>
                    <div>{n.body}</div>
                  </div>
                ))}
              </div>
            </CardBody>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Details" />
            <CardBody>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="opacity-70">Company</div>
                <div>{data.info.company || '—'}</div>
                <div className="opacity-70">Title</div>
                <div>{data.info.title || '—'}</div>
                <div className="opacity-70">Status</div>
                <div>{data.info.status}</div>
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Send Email" />
            <CardBody>
              <EmailComposer customerId={id} email={data.info.email} composer={composer} setComposer={setComposer} onSent={reloadCustomer} />
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Cases" />
            <CardBody>
              <div className="rounded-xl border border-black/10 dark:border-white/10 max-h-[360px] overflow-auto">
                {(!data.cases || data.cases.length === 0) ? (
                  <div className="p-3 text-sm opacity-70">No cases yet.</div>
                ) : (
                  <ul className="divide-y divide-black/5 dark:divide-white/10 text-sm">
                    {data.cases.map((c:any) => (
                      <li key={c.id} className="px-3 py-2 flex items-center justify-between">
                        <div>
                          <div className="font-medium">{c.case_number}</div>
                          <div className="opacity-70 text-xs">{c.title} · {c.stage} · {new Date(c.created_at).toLocaleString()}</div>
                        </div>
                        <a className="underline" href={`/cases/${c.id}`}>Open</a>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Campaign Assignments" />
            <CardBody>
              <div className="space-y-3 text-sm">
                <div>
                  <div className="text-xs opacity-70 mb-1">Select one or more campaigns</div>
                  <div className="grid grid-cols-1 gap-2 max-h-64 overflow-auto p-2 rounded-lg border border-black/10 dark:border-white/10">
                    {allCampaigns.map(c => (
                      <label key={c.id} className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          className="size-4"
                          checked={campaignIds.includes(c.id)}
                          onChange={(e) => {
                            setCampaignIds(prev => e.target.checked ? Array.from(new Set([...prev, c.id])) : prev.filter(x => x !== c.id));
                          }}
                        />
                        <span>{c.name}{c.vertical ? ` · ${c.vertical}` : ''}</span>
                      </label>
                    ))}
                  </div>
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="secondary" onClick={() => setCampaignIds((data.campaigns || []).map((c:any)=>c.id))} disabled={saving}>Reset</Button>
                  <Button onClick={async () => {
                    setSaving(true);
                    const token = await getAccessToken();
                    if (!token) { setSaving(false); return; }
                    try {
                      const res = await fetch(`/api/crm/customers/${id}/campaigns`, {
                        method: 'PUT',
                        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
                        body: JSON.stringify({ campaign_ids: campaignIds })
                      });
                      const j = await res.json().catch(() => null);
                      if (!j || !j.ok) alert(j?.error?.message || 'Failed to save');
                      else alert('Saved');
                    } catch {
                      alert('Failed to save');
                    } finally {
                      setSaving(false);
                    }
                  }} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
                </div>
              </div>
            </CardBody>
          </Card>
        </div>
      </div>
    </main>
  );
}

function CustomerEmailPane({ data, onUpdate, customerId, setComposer }: { data: any; onUpdate: (d:any)=>void; customerId: number; setComposer: (c: { to: string; subject: string; body: string; in_reply_to: string | null; references: string[] }) => void }) {
  const emails = useMemo(() => (data.comms || []).filter((m: any) => m.type === 'email'), [data]);
  const [items, setItems] = useState<any[]>(emails);
  const [selected, setSelected] = useState<any | null>(emails[0] || null);
  const [checkedIds, setCheckedIds] = useState<number[]>([]);
  const allChecked = items.length > 0 && checkedIds.length === items.length;

  useEffect(() => {
    setItems(emails);
    if (emails.length && !emails.find((x:any)=>x.id===selected?.id)) setSelected(emails[0]);
    setCheckedIds((prev)=>prev.filter((id)=>emails.some((x:any)=>x.id===id)));
  }, [emails]);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
      <div className="rounded-xl border border-black/10 dark:border-white/10 max-h-[520px] overflow-auto">
        {items.length === 0 ? (
          <div className="p-4 opacity-70">No emails.</div>
        ) : (
          <ul className="divide-y divide-black/5 dark:divide-white/10">
            <li className="px-3 py-2 flex items-center gap-3 sticky top-0 bg-white/80 dark:bg-black/40 backdrop-blur z-10">
              <input type="checkbox" className="size-4" checked={allChecked} onChange={(e)=> setCheckedIds(e.target.checked ? items.map((x)=>x.id) : [])} />
              {checkedIds.length > 0 && (
                <Button size="sm" variant="destructive" onClick={async ()=>{
                  if (!confirm(`Delete ${checkedIds.length} selected email(s)?`)) return;
                  const token = await getAccessToken();
                  if (!token) return;
                  await fetch(`/api/crm/customers/${customerId}/communications`, { method: 'DELETE', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify({ ids: checkedIds }) });
                  const next = items.filter((x)=>!checkedIds.includes(x.id));
                  setItems(next);
                  onUpdate({ ...data, comms: (data.comms || []).filter((x:any)=>!checkedIds.includes(x.id)) });
                  if (selected && checkedIds.includes(selected.id)) setSelected(null);
                  setCheckedIds([]);
                }}>Delete selected</Button>
              )}
            </li>
            {items.map((m) => (
              <li key={m.id} className="px-3 py-2 cursor-pointer" onClick={() => setSelected(m)}>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-3 min-w-0">
                    <input type="checkbox" className="size-4" checked={checkedIds.includes(m.id)} onChange={(e)=>{ e.stopPropagation(); setCheckedIds((prev)=> e.target.checked ? Array.from(new Set([...prev, m.id])) : prev.filter((id)=>id!==m.id)); }} />
                    <div className="truncate">{m.direction === 'in' ? data.info.email : 'Me'}</div>
                  </div>
                  <div className="opacity-60 text-xs">{new Date(m.created_at).toLocaleString()}</div>
                </div>
                <div className="truncate font-medium">{m.subject || '(no subject)'}</div>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="rounded-xl border border-black/10 dark:border-white/10 min-h-[520px]">
        {!selected ? (
          <div className="p-4 opacity-70">Select an email to preview.</div>
        ) : (
          <div className="p-4 space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-medium">{selected.subject || '(no subject)'}</div>
                <div className="opacity-60 text-xs">{selected.direction==='in' ? data.info.email : 'Me'} · {new Date(selected.created_at).toLocaleString()}</div>
              </div>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="secondary" onClick={() => {
                  const quoted = `\n\nOn ${new Date(selected.created_at).toLocaleString()}, they wrote:\n> ` + String(selected.body || '').split('\n').map((l: string) => l ? `> ${l}` : '>' ).join('\n');
                  const subj = selected.subject?.startsWith('Re:') ? selected.subject : `Re: ${selected.subject || ''}`;
                  setComposer({ to: data.info.email || '', subject: subj, body: quoted, in_reply_to: selected.message_id || null, references: selected.references_header ? selected.references_header.split(/\s+/) : [] });
                }}>Reply</Button>
                <button className="text-red-600" title="Delete" onClick={async ()=>{
                  if (!confirm('Delete this email?')) return;
                  const token = await getAccessToken();
                  if (!token) return;
                  await fetch(`/api/crm/customers/${customerId}/communications`, { method: 'DELETE', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify({ ids: [selected.id] }) });
                  const next = items.filter((x)=>x.id!==selected.id);
                  setItems(next);
                  onUpdate({ ...data, comms: (data.comms || []).filter((x:any)=>x.id!==selected.id) });
                  setSelected(null);
                }}>🗑️</button>
              </div>
            </div>
            <div className="whitespace-pre-wrap border-t pt-3 border-black/10 dark:border-white/10">{selected.body || ''}</div>
          </div>
        )}
      </div>
    </div>
  );
}

function EmailComposer({ customerId, email, composer, setComposer, onSent }: { customerId: number; email?: string|null; composer: { to: string; subject: string; body: string; in_reply_to: string | null; references: string[] }; setComposer: (c: { to: string; subject: string; body: string; in_reply_to: string | null; references: string[] }) => void; onSent?: () => void }) {
  const [sending, setSending] = useState(false);
  const [aiBusy, setAiBusy] = useState<'idle'|'generating'>('idle');
  const [aiError, setAiError] = useState<string | null>(null);
  return (
    <div className="space-y-2">
      <Input placeholder="To" value={composer.to} onChange={(e) => setComposer({ ...composer, to: e.target.value })} />
      <div className="grid grid-cols-[1fr_auto] gap-2 items-center">
        <Input placeholder="Subject" value={composer.subject} onChange={(e) => setComposer({ ...composer, subject: e.target.value })} />
        <Button variant="secondary" onClick={async () => {
          setAiError(null); setAiBusy('generating');
          try {
            const token = await getAccessToken(); if (!token) { setAiBusy('idle'); return; }
            const res = await fetch('/api/crm/ai/email-draft', { method: 'POST', headers: { 'content-type':'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify({ customerId, to: composer.to }) });
            const j = await res.json().catch(()=>null);
            if (!j || !j.ok) { setAiError(j?.error?.message || 'Failed to generate'); }
            else { setComposer((c)=>({ ...c, subject: j.data.subject || c.subject, body: j.data.body || c.body })); }
          } catch (e: any) {
            setAiError(e?.message || 'Failed');
          } finally { setAiBusy('idle'); }
        }}>{aiBusy==='generating' ? 'AI…' : 'AI Draft'}</Button>
      </div>
      {aiError && <div className="text-xs text-red-600">{aiError}</div>}
      <textarea className="w-full min-h-28 rounded-lg border px-3 py-2 bg-white dark:bg-gray-900 text-black dark:text-white border-black/10 dark:border-white/10" placeholder="Message" value={composer.body} onChange={(e) => setComposer({ ...composer, body: e.target.value })} />
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={() => { setComposer({ to: email || '', subject: '', body: '', in_reply_to: null, references: [] }); }} disabled={sending}>Clear</Button>
        <Button onClick={async () => {
          setSending(true);
          const token = await getAccessToken();
          if (!token) { setSending(false); return; }
          try {
            const res = await fetch(`/api/crm/customers/${customerId}/email`, {
              method: 'POST',
              headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
              body: JSON.stringify({ to: composer.to, subject: composer.subject, body: composer.body, in_reply_to: composer.in_reply_to, references: composer.references })
            });
            const j = await res.json().catch(() => null);
            if (!j || !j.ok) alert(j?.error?.message || 'Failed to send');
            else { alert('Sent'); onSent && onSent(); }
          } catch {
            alert('Failed to send');
          } finally {
            setSending(false);
          }
        }} disabled={sending}>{sending ? 'Sending…' : 'Send'}</Button>
      </div>
    </div>
  );
}

async function getAccessToken(): Promise<string> {
  const refresh = typeof window !== 'undefined' ? localStorage.getItem('auth.refreshToken') : null;
  if (!refresh) return '';
  const res = await fetch('/api/auth/refresh', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ refreshToken: refresh }) });
  const json = await res.json().catch(() => null);
  if (!json || !json.ok) return '';
  try { localStorage.setItem('auth.refreshToken', json.data.refreshToken); localStorage.setItem('auth.user', JSON.stringify(json.data.user)); } catch {}
  return json.data.accessToken as string;
}


