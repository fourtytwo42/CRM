"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";

export default function CaseDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const caseId = Number(id);
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string|null>(null);
  const [title, setTitle] = useState('');
  const [stage, setStage] = useState<'new'|'in-progress'|'won'|'lost'|'closed'>('new');
  const [saving, setSaving] = useState<'idle'|'saving'>('idle');
  const [campaignId, setCampaignId] = useState<string>('');
  const [campaigns, setCampaigns] = useState<Array<{ id:number; name:string }>>([]);
  const [compose, setCompose] = useState<{ to: string; subject: string; body: string; in_reply_to: string | null; references: string[] }>({ to: '', subject: '', body: '', in_reply_to: null, references: [] });
  const [aiBusy, setAiBusy] = useState<'idle'|'generating'>('idle');
  const [aiError, setAiError] = useState<string | null>(null);

  useEffect(() => { (async () => {
    const token = await getAccessToken(); if (!token) return;
    const res = await fetch(`/api/crm/cases/${caseId}`, { headers: { authorization: `Bearer ${token}` } });
    const j = await res.json().catch(()=>null);
    if (!j || !j.ok) { setError('Not authorized or not found'); return; }
    setData(j.data);
    setTitle(j.data.info?.title || '');
    setStage(j.data.info?.stage || 'new');
    setCampaignId(j.data.info?.campaign_id ? String(j.data.info.campaign_id) : '');
    // load campaigns for dropdown
    try {
      const token2 = await getAccessToken(); if (!token2) return;
      const rc = await fetch('/api/admin/campaigns', { headers: { authorization: `Bearer ${token2}` } });
      const jc = await rc.json().catch(()=>null); if (jc && jc.ok) setCampaigns((jc.data.campaigns || []).map((c:any)=>({ id:c.id, name:c.name })));
    } catch {}
    setCompose((c)=>({ ...c, to: j.data.customer?.email || '' }));
  })(); }, [caseId]);

  if (!data) return <main className="container-hero py-8">{error || 'Loading…'}</main>;

  return (
    <main className="container-hero py-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <div className="text-xs opacity-70">Case</div>
          <h1 className="text-2xl font-bold">{data.info.case_number}</h1>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={()=>router.back()}>Back</Button>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
        {/* Left: case + compose */}
        <div className="xl:col-span-3 space-y-6">
          {/* Case header card */}
          <Card>
            <CardBody>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
                <div className="md:col-span-2">
                  <div className="text-xs opacity-70">Title</div>
                  <Input value={title} onChange={(e)=>setTitle(e.target.value)} />
                </div>
                <div>
                  <div className="text-xs opacity-70">Stage</div>
                  <select className="rounded-lg border px-3 py-2 bg-white dark:bg-gray-900 text-black dark:text-white border-black/10 dark:border-white/10 w-full" value={stage} onChange={(e)=>setStage(e.target.value as any)}>
                    <option value="new">New</option>
                    <option value="in-progress">In Progress</option>
                    <option value="won">Won</option>
                    <option value="lost">Lost</option>
                    <option value="closed">Closed</option>
                  </select>
                </div>
                <div>
                  <div className="text-xs opacity-70">Campaign</div>
                  <select className="rounded-lg border px-3 py-2 bg-white dark:bg-gray-900 text-black dark:text-white border-black/10 dark:border-white/10 w-full" value={campaignId} onChange={(e)=>setCampaignId(e.target.value)}>
                    <option value="">(none)</option>
                    {campaigns.map(c => <option key={c.id} value={String(c.id)}>{c.name}</option>)}
                  </select>
                </div>
                <div className="text-right">
                  <Button disabled={saving!=='idle'} onClick={async ()=>{
                    setSaving('saving');
                    try {
                      const token = await getAccessToken(); if (!token) return;
                      const res = await fetch(`/api/crm/cases/${caseId}`, { method: 'PUT', headers: { 'content-type':'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify({ title, stage, campaign_id: campaignId ? Number(campaignId) : null }) });
                      const j = await res.json().catch(()=>null);
                      if (!j || !j.ok) { alert(j?.error?.message || 'Failed'); return; }
                    } finally { setSaving('idle'); }
                  }}>{saving==='saving' ? 'Saving…' : 'Save'}</Button>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mt-4 text-sm">
                <div>
                  <div className="text-xs opacity-70">Customer</div>
                  <div className="font-medium">{data.customer.full_name}</div>
                  <div className="opacity-70">{data.customer.email || '—'}</div>
                </div>
                <div>
                  <div className="text-xs opacity-70">Vertical</div>
                  <div className="font-medium">{data.info.vertical_name || '—'}</div>
                </div>
                <div>
                  <div className="text-xs opacity-70">Campaign</div>
                  <div className="font-medium">{data.info.campaign_name || '—'}</div>
                </div>
                <div>
                  <div className="text-xs opacity-70">Created</div>
                  <div className="font-medium">{new Date(data.info.created_at).toLocaleString()}</div>
                </div>
              </div>
            </CardBody>
          </Card>

          {/* Compose + Emails */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="lg:col-span-2">
              <CardHeader title="Send Email" />
              <CardBody>
                <div className="space-y-2">
                  <div className="text-xs opacity-70">To</div>
                  <div className="rounded-lg border px-3 py-2 bg-white dark:bg-gray-900 text-black dark:text-white border-black/10 dark:border-white/10 text-sm">{data.customer.email || '—'}</div>
                  <div className="grid grid-cols-[1fr_auto] gap-2 items-center">
                    <Input placeholder="Subject" value={compose.subject} onChange={(e)=>setCompose({ ...compose, subject: e.target.value })} />
                    <Button variant="secondary" onClick={async () => {
                      setAiError(null); setAiBusy('generating');
                      try {
                        const token = await getAccessToken(); if (!token) { setAiBusy('idle'); return; }
                        const res = await fetch('/api/crm/ai/email-draft', { method: 'POST', headers: { 'content-type':'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify({ customerId: data.customer.id, to: data.customer.email }) });
                        const j = await res.json().catch(()=>null);
                        if (!j || !j.ok) { setAiError(j?.error?.message || 'Failed to generate'); }
                        else { setCompose((c)=>({ ...c, subject: j.data.subject || c.subject, body: j.data.body || c.body })); }
                      } catch (e: any) { setAiError(e?.message || 'Failed'); } finally { setAiBusy('idle'); }
                    }}>{aiBusy==='generating' ? 'AI…' : 'AI Draft'}</Button>
                  </div>
                  {aiError && <div className="text-xs text-red-600">{aiError}</div>}
                  <textarea className="rounded-lg border px-3 py-2 bg-white dark:bg-gray-900 text-black dark:text-white border-black/10 dark:border-white/10 min-h-[240px]" value={compose.body} onChange={(e)=>setCompose({ ...compose, body: e.target.value })} />
                  <div className="flex justify-end">
                    <Button onClick={async ()=>{
                      const token = await getAccessToken(); if (!token) return;
                      const res = await fetch(`/api/crm/cases/${caseId}/email`, { method: 'POST', headers: { 'content-type':'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify({ to: data.customer.email, subject: compose.subject, body: compose.body }) });
                      const j = await res.json().catch(()=>null);
                      if (!j || !j.ok) { alert(j?.error?.message || 'Failed to send'); return; }
                      const r = await fetch(`/api/crm/cases/${caseId}`, { headers: { authorization: `Bearer ${token}` } });
                      const jj = await r.json().catch(()=>null); if (jj && jj.ok) setData(jj.data);
                    }}>Send</Button>
                  </div>
                </div>
              </CardBody>
            </Card>

            <Card className="lg:col-span-2">
              <CardHeader title="Emails" />
              <CardBody>
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 text-sm">
                  {/* List */}
                  <div className="rounded-xl border border-black/10 dark:border-white/10 max-h-[520px] overflow-auto">
                    {(data.emails || []).length === 0 ? (
                      <div className="p-4 opacity-70">No emails.</div>
                    ) : (
                      <ul className="divide-y divide-black/5 dark:divide-white/10">
                        {(data.emails || []).map((m:any, idx:number) => (
                          <li key={m.id} className="px-3 py-2 cursor-pointer hover:bg-black/5 dark:hover:bg-white/10" onClick={()=>{
                            const area = document.getElementById('case-email-preview');
                            if (area) area.scrollIntoView({ behavior: 'smooth', block: 'start' });
                            setCompose((c)=>c); // noop to trigger re-render
                            (window as any).__case_preview = m;
                          }}>
                            <div className="flex items-center justify-between">
                              <div className="truncate font-medium">{m.subject || '(no subject)'}</div>
                              <div className="opacity-60 text-xs ml-2">{new Date(m.created_at).toLocaleString()}</div>
                            </div>
                            <div className="opacity-70 text-xs">{m.direction}{m.agent_username ? ` · by ${m.agent_username}` : ''}</div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  {/* Preview */}
                  <div id="case-email-preview" className="rounded-xl border border-black/10 dark:border-white/10 min-h-[240px] p-3">
                    {!(window as any).__case_preview ? (
                      <div className="opacity-70">Select an email to preview.</div>
                    ) : (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="font-medium">{((window as any).__case_preview?.subject) || '(no subject)'}</div>
                            <div className="opacity-60 text-xs">{new Date((window as any).__case_preview.created_at).toLocaleString()}</div>
                          </div>
                          {((window as any).__case_preview?.direction) === 'in' && (
                            <Button size="sm" variant="secondary" onClick={() => {
                              const m:any = (window as any).__case_preview;
                              const quoted = `\n\nOn ${new Date(m.created_at).toLocaleString()}, they wrote:\n> ` + String(m.body || '').split('\n').map((l: string) => l ? `> ${l}` : '>' ).join('\n');
                              const subj = m.subject?.startsWith('Re:') ? m.subject : `Re: ${m.subject || ''}`;
                              setCompose({ to: data.customer.email || '', subject: subj, body: quoted, in_reply_to: null, references: [] });
                            }}>Reply</Button>
                          )}
                        </div>
                        <div className="whitespace-pre-wrap">{((window as any).__case_preview?.body) || ''}</div>
                      </div>
                    )}
                  </div>
                </div>
              </CardBody>
            </Card>
          </div>

          {/* Versions */}
          {Array.isArray(data.versions) && data.versions.length > 0 && (
            <Card>
              <CardHeader title="Version History" />
              <CardBody>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
                  {data.versions.map((v:any) => (
                    <div key={v.version_no} className="p-3 rounded-lg border border-black/5 dark:border-white/10">
                      <div className="font-medium">Version {v.version_no}</div>
                      <div className="opacity-70 text-xs">{new Date(v.created_at).toLocaleString()} {v.createdBy ? `· by ${v.createdBy}` : ''}</div>
                      <div className="opacity-80 mt-1">{v.data?.title ? `Title: ${v.data.title}` : ''} {v.data?.stage ? `· Stage: ${v.data.stage}` : ''}</div>
                    </div>
                  ))}
                </div>
              </CardBody>
            </Card>
          )}
        </div>

        {/* Right: notes and customer */}
        <div className="xl:col-span-1 space-y-6">
          <Card>
            <CardHeader title="Notes" />
            <CardBody>
              <div className="space-y-3 text-sm">
                {(data.notes || []).map((n:any) => (
                  <div key={n.id} className="p-3 rounded-lg border border-black/5 dark:border-white/10">
                    <div className="opacity-70 text-xs">by {n.createdBy} · {new Date(n.created_at).toLocaleString()}</div>
                    <div>{n.body}</div>
                  </div>
                ))}
                <div className="grid grid-cols-1 gap-2 mt-2">
                  <textarea id="new-note" placeholder="Add note" className="rounded-lg border px-3 py-2 bg-white dark:bg-gray-900 text-black dark:text-white border-black/10 dark:border-white/10 min-h-[140px]" />
                  <div className="flex items-center justify-end">
                    <Button onClick={async ()=>{
                      const el = document.getElementById('new-note') as HTMLTextAreaElement | null; if (!el || !el.value.trim()) return;
                      const token = await getAccessToken(); if (!token) return;
                      const res = await fetch(`/api/crm/cases/${caseId}/notes`, { method: 'POST', headers: { 'content-type':'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify({ body: el.value }) });
                      const j = await res.json().catch(()=>null); if (!j || !j.ok) return;
                      el.value = '';
                      const r = await fetch(`/api/crm/cases/${caseId}`, { headers: { authorization: `Bearer ${token}` } }); const jj = await r.json().catch(()=>null); if (jj && jj.ok) setData(jj.data);
                    }}>Add</Button>
                  </div>
                </div>
              </div>
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="All Cases for Customer" />
            <CardBody>
              <div className="rounded-xl border border-black/10 dark:border-white/10 max-h-[360px] overflow-auto">
                {(!data.otherCases || data.otherCases.length === 0) ? (
                  <div className="p-3 text-sm opacity-70">No other cases.</div>
                ) : (
                  <ul className="divide-y divide-black/5 dark:divide-white/10 text-sm">
                    {data.otherCases.map((c:any) => (
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
            <CardHeader title="Customer" />
            <CardBody>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="opacity-70">Name</div><div>{data.customer.full_name}</div>
                <div className="opacity-70">Email</div><div>{data.customer.email || '—'}</div>
                <div className="opacity-70">Phone</div><div>{data.customer.phone || '—'}</div>
              </div>
            </CardBody>
          </Card>
        </div>
      </div>
    </main>
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


