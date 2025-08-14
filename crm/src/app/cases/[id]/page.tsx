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
  const [composerOpen, setComposerOpen] = useState(false);
  
  async function saveCase(partial: { stage?: 'new'|'in-progress'|'won'|'lost'|'closed'; campaign_id?: number|null }) {
    setSaving('saving');
    try {
      const token = await getAccessToken(); if (!token) return;
      const res = await fetch(`/api/crm/cases/${caseId}`, {
        method: 'PUT',
        headers: { 'content-type':'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({ title, stage: partial.stage ?? stage, campaign_id: partial.campaign_id ?? (campaignId ? Number(campaignId) : null) })
      });
      const j = await res.json().catch(()=>null);
      if (!j || !j.ok) { alert(j?.error?.message || 'Failed'); return; }
    } finally { setSaving('idle'); }
  }

  async function reloadCase() {
    const token = await getAccessToken(); if (!token) return;
    const res = await fetch(`/api/crm/cases/${caseId}`, { headers: { authorization: `Bearer ${token}` } });
    const j = await res.json().catch(()=>null);
    if (!j || !j.ok) return;
    setData(j.data);
    setStage(j.data.info?.stage || 'new');
    setCampaignId(j.data.info?.campaign_id ? String(j.data.info.campaign_id) : '');
    setCompose((c)=>({ ...c, to: j.data.customer?.email || '' }));
  }

  useEffect(() => { (async () => {
    const token = await getAccessToken(); if (!token) return;
    const res = await fetch(`/api/crm/cases/${caseId}`, { headers: { authorization: `Bearer ${token}` } });
    const j = await res.json().catch(()=>null);
    if (!j || !j.ok) { setError('Not authorized or not found'); return; }
    setData(j.data);
    setTitle(j.data.info?.case_number || '');
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

  // Ensure hooks are called on every render (even before data loads)
  const [viewTab, setViewTab] = useState<'Activity'|'Details'|'Related'>('Activity');

  if (!data) return <main className="container-hero py-8">{error || 'Loading…'}</main>;

  return (
    <main className="container-hero py-6">
      {/* Header with highlights */}
      <div className="mb-4 flex items-center justify-between">
        <div className="min-w-0">
          <div className="text-xs opacity-70">Case</div>
          <div className="flex items-center gap-3 min-w-0">
            <h1 className="text-2xl font-bold truncate">{data.info.case_number}</h1>
            <span className="inline-block text-xs px-2 py-0.5 rounded-full border border-black/10 dark:border-white/10 whitespace-nowrap">{data.info.stage}</span>
          </div>
          <div className="opacity-70 text-xs mt-1 truncate">{data.customer.full_name} · {data.info.campaign_name || 'No campaign'} · {data.info.vertical_name || 'No vertical'}</div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={()=>router.back()}>Back</Button>
        </div>
      </div>

      {/* Stage path */}
      <div className="mb-4 flex items-center gap-2 text-xs">
        {(['new','in-progress','won','lost','closed'] as const).map((st, idx) => {
          const activeIdx = ['new','in-progress','won','lost','closed'].indexOf(data.info.stage);
          const isDone = idx < activeIdx;
          const isActive = idx === activeIdx;
          return (
            <div key={st} className={`flex items-center gap-2 ${idx>0?'pl-2':''}`}>
              {idx>0 && <div className="w-4 h-[1px] bg-black/10 dark:bg-white/20" />}
              <button onClick={async ()=>{ setStage(st); await saveCase({ stage: st }); await reloadCase(); }} className={`px-2 py-1 rounded-full border ${isActive ? 'bg-black text-white dark:bg-white dark:text-black' : (isDone ? 'bg-black/5 dark:bg-white/10 text-black dark:text-white' : 'bg-transparent text-black dark:text-white')} border-black/10 dark:border-white/10`}>{st}</button>
            </div>
          );
        })}
      </div>

      {/* Campaign quick edit */}
      <div className="mb-4 max-w-sm">
        <div className="text-xs opacity-70 mb-1">Campaign</div>
        <select className="rounded-lg border px-3 py-2 bg-white dark:bg-gray-900 text-black dark:text-white border-black/10 dark:border-white/10 w-full" value={campaignId} onChange={async (e)=>{
          const val = e.target.value;
          setCampaignId(val);
          await saveCase({ campaign_id: val ? Number(val) : null });
          await reloadCase();
        }}>
          <option value="">(none)</option>
          {campaigns.map(c => <option key={c.id} value={String(c.id)}>{c.name}</option>)}
        </select>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-4 text-sm">
        <div className="p-3 rounded-lg border border-black/10 dark:border-white/10">
          <div className="opacity-60 text-xs">Customer</div>
          <div className="font-medium truncate">{data.customer.full_name}</div>
          <div className="opacity-70 truncate text-xs">{data.customer.email || data.customer.phone || '—'}</div>
        </div>
        <div className="p-3 rounded-lg border border-black/10 dark:border-white/10">
          <div className="opacity-60 text-xs">Campaign</div>
          <div className="font-medium truncate">{data.info.campaign_name || '—'}</div>
        </div>
        <div className="p-3 rounded-lg border border-black/10 dark:border-white/10">
          <div className="opacity-60 text-xs">Vertical</div>
          <div className="font-medium truncate">{data.info.vertical_name || '—'}</div>
        </div>
        <div className="p-3 rounded-lg border border-black/10 dark:border-white/10">
          <div className="opacity-60 text-xs">Created</div>
          <div className="font-medium">{new Date(data.info.created_at).toLocaleString()}</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="mb-3 flex items-center gap-2 text-sm">
        {(['Activity','Details','Related'] as const).map(t => (
          <button key={t} className={`px-3 py-1.5 rounded-lg border ${viewTab===t ? 'bg-black text-white dark:bg-white dark:text-black' : 'bg-transparent'} border-black/10 dark:border-white/10`} onClick={()=>setViewTab(t)}>{t}</button>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Left content area */}
        <div className="xl:col-span-2 space-y-6">
          {viewTab === 'Activity' && (
            <>
              <Card>
                <CardHeader title="Email" actions={<Button onClick={() => setComposerOpen(true)}>New Email</Button>} />
                <CardBody>
                  <MailTabs emails={data.emails || []} customerEmail={data.customer.email || ''} onReply={(subj, body)=>{
                    setCompose({ to: data.customer.email || '', subject: subj, body, in_reply_to: null, references: [] }); setComposerOpen(true);
                  }} />
                </CardBody>
              </Card>

          <Card>
                <CardHeader title="Notes" />
            <CardBody>
                  <div className="space-y-3 text-sm">
                    {(data.notes || []).map((n:any) => (
                      <div key={n.id} className="p-3 rounded-lg border border-black/10 dark:border-white/10">
                        <div className="opacity-70 text-xs">by {n.createdBy} · {new Date(n.created_at).toLocaleString()}</div>
                        <div>{n.body}</div>
                      </div>
                    ))}
                    <div className="grid grid-cols-1 gap-2 mt-2">
                      <textarea id="new-note" placeholder="Add note" className="rounded-lg border px-3 py-2 bg-white dark:bg-gray-900 text-black dark:text-white border-black/10 dark:border-white/10 min-h-[120px]" />
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

              {/* Email composer dialog */}
              {composerOpen && (
                <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
                  <div className="w-full max-w-2xl rounded-xl border border-black/10 dark:border-white/10 bg-white dark:bg-black p-4">
                    <div className="flex items-center justify-between mb-2">
                      <div className="text-lg font-semibold">New Email</div>
                      <button onClick={()=>setComposerOpen(false)}>✕</button>
                    </div>
                    <div className="space-y-2">
                      <Input placeholder="To" value={compose.to} onChange={(e)=>setCompose({ ...compose, to: e.target.value })} />
                      <div className="grid grid-cols-[1fr_auto] gap-2 items-center">
                        <Input placeholder="Subject" value={compose.subject} onChange={(e)=>setCompose({ ...compose, subject: e.target.value })} />
                        <Button variant="secondary" onClick={async () => {
                          setAiError(null); setAiBusy('generating');
                          try {
                            const token = await getAccessToken(); if (!token) { setAiBusy('idle'); return; }
                            const res = await fetch('/api/crm/ai/email-draft', { method: 'POST', headers: { 'content-type':'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify({ customerId: data.customer.id, to: compose.to || data.customer.email }) });
                            const j = await res.json().catch(()=>null);
                            if (!j || !j.ok) { setAiError(j?.error?.message || 'Failed to generate'); }
                            else { setCompose((c)=>({ ...c, subject: j.data.subject || c.subject, body: j.data.body || c.body })); }
                          } catch (e: any) { setAiError(e?.message || 'Failed'); } finally { setAiBusy('idle'); }
                        }}>{aiBusy==='generating' ? 'AI…' : 'AI Draft'}</Button>
                      </div>
                      {aiError && <div className="text-xs text-red-600">{aiError}</div>}
                      <textarea className="rounded-lg border px-3 py-2 bg-white dark:bg-gray-900 text-black dark:text-white border-black/10 dark:border-white/10 min-h-[200px]" value={compose.body} onChange={(e)=>setCompose({ ...compose, body: e.target.value })} />
                      <div className="flex justify-end gap-2">
                        <Button variant="secondary" onClick={()=>setComposerOpen(false)}>Cancel</Button>
                        <Button onClick={async ()=>{
                          const token = await getAccessToken(); if (!token) return;
                          const res = await fetch(`/api/crm/cases/${caseId}/email`, { method: 'POST', headers: { 'content-type':'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify({ to: compose.to || data.customer.email, subject: compose.subject, body: compose.body }) });
                          const j = await res.json().catch(()=>null);
                          setComposerOpen(false);
                          if (!j || !j.ok) { alert(j?.error?.message || 'Failed to send'); return; }
                          const r = await fetch(`/api/crm/cases/${caseId}`, { headers: { authorization: `Bearer ${token}` } });
                          const jj = await r.json().catch(()=>null); if (jj && jj.ok) setData(jj.data);
                        }}>Send</Button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}

          {viewTab === 'Details' && (
            <>
              <Card>
                <CardHeader title="Case Details" />
                <CardBody>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
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
                    <div className="text-right md:col-span-1">
                      <Button disabled={saving!=='idle'} onClick={()=> saveCase({})}>{saving==='saving' ? 'Saving…' : 'Save'}</Button>
                </div>
              </div>
            </CardBody>
          </Card>

          {Array.isArray(data.versions) && data.versions.length > 0 && (
            <Card>
              <CardHeader title="Version History" />
              <CardBody>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
                  {data.versions.map((v:any) => (
                        <div key={v.version_no} className="p-3 rounded-lg border border-black/10 dark:border-white/10">
                      <div className="font-medium">Version {v.version_no}</div>
                      <div className="opacity-70 text-xs">{new Date(v.created_at).toLocaleString()} {v.createdBy ? `· by ${v.createdBy}` : ''}</div>
                      <div className="opacity-80 mt-1">{v.data?.title ? `Title: ${v.data.title}` : ''} {v.data?.stage ? `· Stage: ${v.data.stage}` : ''}</div>
                    </div>
                  ))}
                </div>
              </CardBody>
            </Card>
          )}
            </>
          )}

          {viewTab === 'Related' && (
            <>
          <Card>
                <CardHeader title="Other Cases for Customer" />
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
            </>
          )}
        </div>

        {/* Right: customer panel (Details tab only) */}
        {viewTab === 'Details' && (
          <div className="xl:col-span-1 space-y-6">
            <Card>
              <CardHeader title="Customer" />
              <CardBody>
                <CaseCustomerEdit customer={data.customer} caseId={caseId} onSaved={async ()=>{ await reloadCase(); }} />
              </CardBody>
            </Card>
          </div>
        )}
      </div>
    </main>
  );
}

function CaseCustomerEdit({ customer, caseId, onSaved }: { customer: any; caseId: number; onSaved: () => void }) {
  const [form, setForm] = useState<any>({
    first_name: customer.first_name || '',
    last_name: customer.last_name || '',
    email: customer.email || '',
    phone: customer.phone || '',
    street1: customer.street1 || '',
    street2: customer.street2 || '',
    city: customer.city || '',
    state: customer.state || '',
    zip: customer.zip || '',
    company: customer.company || '',
    title: customer.title || '',
    notes: customer.notes || '',
    status: customer.status || 'active',
  });
  const [busy, setBusy] = useState<'idle'|'saving'>('idle');
  return (
    <div className="space-y-3 text-sm">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        <Input placeholder="First name" value={form.first_name} onChange={(e)=>setForm({ ...form, first_name: e.target.value })} />
        <Input placeholder="Last name" value={form.last_name} onChange={(e)=>setForm({ ...form, last_name: e.target.value })} />
        <Input placeholder="Email" value={form.email} onChange={(e)=>setForm({ ...form, email: e.target.value })} />
        <Input placeholder="Phone" value={form.phone} onChange={(e)=>setForm({ ...form, phone: e.target.value })} />
        <Input placeholder="Street (line 1)" value={form.street1} onChange={(e)=>setForm({ ...form, street1: e.target.value })} />
        <Input placeholder="Street (line 2)" value={form.street2} onChange={(e)=>setForm({ ...form, street2: e.target.value })} />
        <Input placeholder="City" value={form.city} onChange={(e)=>setForm({ ...form, city: e.target.value })} />
        <Input placeholder="State" value={form.state} onChange={(e)=>setForm({ ...form, state: e.target.value })} />
        <Input placeholder="ZIP" value={form.zip} onChange={(e)=>setForm({ ...form, zip: e.target.value })} />
        <Input placeholder="Company" value={form.company} onChange={(e)=>setForm({ ...form, company: e.target.value })} />
        <Input placeholder="Title" value={form.title} onChange={(e)=>setForm({ ...form, title: e.target.value })} />
        <select className="rounded-lg border px-3 py-2 bg-white dark:bg-gray-900 text-black dark:text-white border-black/10 dark:border-white/10" value={form.status} onChange={(e)=>setForm({ ...form, status: e.target.value })}>
          <option value="lead">Lead</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
          <option value="archived">Archived</option>
        </select>
      </div>
      <textarea className="w-full min-h-24 rounded-lg border px-3 py-2 bg-white dark:bg-gray-900 text-black dark:text-white border-black/10 dark:border-white/10" placeholder="Notes" value={form.notes} onChange={(e)=>setForm({ ...form, notes: e.target.value })} />
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={() => setForm({
          first_name: customer.first_name || '',
          last_name: customer.last_name || '',
          email: customer.email || '',
          phone: customer.phone || '',
          street1: customer.street1 || '',
          street2: customer.street2 || '',
          city: customer.city || '',
          state: customer.state || '',
          zip: customer.zip || '',
          company: customer.company || '',
          title: customer.title || '',
          notes: customer.notes || '',
          status: customer.status || 'active',
        })} disabled={busy!=='idle'}>Reset</Button>
        <Button disabled={busy!=='idle'} onClick={async ()=>{
          if (!form.email && !form.phone) { alert('Email or phone is required'); return; }
          setBusy('saving');
          try {
            const token = await getAccessToken(); if (!token) return;
            const res = await fetch(`/api/crm/customers/${customer.id}`, { method: 'PUT', headers: { 'content-type':'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify(form) });
            const j = await res.json().catch(()=>null);
            if (!j || !j.ok) { alert(j?.error?.message || 'Failed to save'); return; }
            onSaved();
          } finally { setBusy('idle'); }
        }}>{busy==='saving' ? 'Saving…' : 'Save'}</Button>
      </div>
    </div>
  );
}

function CaseEmailPane({ emails, customerId, onReply }: { emails: Array<any>; customerId: number; onReply: (subject: string, body: string) => void }) {
  const [items, setItems] = useState<Array<any>>(emails || []);
  const [selected, setSelected] = useState<any | null>((emails || [])[0] || null);
  useEffect(() => {
    setItems(emails || []);
    if (emails && emails.length > 0) {
      if (!selected || !emails.find((x: any) => x.id === selected.id)) {
        setSelected(emails[0]);
      }
    } else {
      setSelected(null);
    }
  }, [emails, selected?.id]);
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
      <div className="rounded-xl border border-black/10 dark:border-white/10 max-h-[520px] overflow-auto">
        {items.length === 0 ? (
          <div className="p-4 opacity-70">No emails.</div>
        ) : (
          <ul className="divide-y divide-black/5 dark:divide-white/10">
            {items.map((m) => (
              <li key={m.id} className={`px-3 py-2 cursor-pointer ${selected && selected.id === m.id ? 'bg-black/5 dark:bg-white/5' : ''}`} onClick={() => setSelected(m)}>
                <div className="flex items-center justify-between gap-2">
                  <div className="truncate font-medium">{m.subject || '(no subject)'}</div>
                  <div className="opacity-60 text-xs">{new Date(m.created_at).toLocaleString()}</div>
                </div>
                <div className="truncate opacity-70">{(m.body || '').slice(0, 120)}</div>
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
                <div className="opacity-60 text-xs">{new Date(selected.created_at).toLocaleString()}</div>
              </div>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="secondary" onClick={() => {
                  const quoted = `\n\nOn ${new Date(selected.created_at).toLocaleString()}, they wrote:\n> ` + String(selected.body || '').split('\n').map((l: string) => l ? `> ${l}` : '>').join('\n');
                  const subj = selected.subject?.startsWith('Re:') ? selected.subject : `Re: ${selected.subject || ''}`;
                  onReply(subj, quoted);
                }}>Reply</Button>
              </div>
            </div>
            <div className="whitespace-pre-wrap border-t pt-3 border-black/10 dark:border-white/10">{selected.body || ''}</div>
          </div>
        )}
      </div>
    </div>
  );
}

function MailTabs({ emails, customerEmail, onReply }: { emails: Array<any>; customerEmail: string; onReply: (subject: string, body: string) => void }) {
  const inbox = (emails || []).filter((m:any)=>m.direction==='in');
  const sent = (emails || []).filter((m:any)=>m.direction==='out');
  const [tab, setTab] = useState<'in'|'out'>('in');
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-xs">
        <button className={`px-2 py-1 rounded border ${tab==='in'?'bg-black text-white dark:bg-white dark:text-black':''} border-black/10 dark:border-white/10`} onClick={()=>setTab('in')}>Inbox</button>
        <button className={`px-2 py-1 rounded border ${tab==='out'?'bg-black text-white dark:bg-white dark:text-black':''} border-black/10 dark:border-white/10`} onClick={()=>setTab('out')}>Sent</button>
      </div>
      <CaseEmailPane emails={tab==='in'? inbox : sent} customerId={0} onReply={onReply} />
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


