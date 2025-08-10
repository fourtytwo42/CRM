"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import Button from "@/components/ui/Button";

export default function AgentDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = Number(params?.id);
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [newTask, setNewTask] = useState<{ title: string; priority: 'low'|'normal'|'high'|'urgent'; due_date: string }>({ title: '', priority: 'normal', due_date: '' });
  const [newNote, setNewNote] = useState<string>('');
  const [assignCampaignId, setAssignCampaignId] = useState<string>('');
  const [allCampaigns, setAllCampaigns] = useState<Array<{ id:number; name:string }>>([]);

  useEffect(() => {
    (async () => {
      const token = await getAccessToken();
      if (!token) return;
      const res = await fetch(`/api/crm/agents/${id}`, { headers: { authorization: `Bearer ${token}` } });
      const json = await res.json().catch(() => null);
      if (!json || !json.ok) { setError('Not authorized or not found'); return; }
      setData(json.data);
      try { const cr = await fetch('/api/admin/campaigns', { headers: { authorization: `Bearer ${token}` } }); const cj = await cr.json().catch(() => null); if (cj && cj.ok) setAllCampaigns((cj.data.campaigns || []).map((c:any)=>({ id:c.id, name:c.name }))); } catch {}
    })();
  }, [id]);

  if (!data) return <main className="container-hero py-8">{error ? error : 'Loading…'}</main>;

  return (
    <main className="container-hero py-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Agent: {data.info.username}</h1>
          <p className="opacity-70">{data.info.email} · {data.info.status}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={() => router.back()}>Back</Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader title="Tasks" />
            <CardBody>
              <div className="mb-3 grid grid-cols-1 md:grid-cols-[1fr_auto_auto] gap-2">
                <Input placeholder="New task title" value={newTask.title} onChange={(e) => setNewTask({ ...newTask, title: e.target.value })} />
                <select className="rounded-lg border px-3 py-2 text-sm" value={newTask.priority} onChange={(e) => setNewTask({ ...newTask, priority: e.target.value as any })}>
                  <option value="low">Low</option>
                  <option value="normal">Normal</option>
                  <option value="high">High</option>
                  <option value="urgent">Urgent</option>
                </select>
                <div className="flex items-center gap-2">
                  <Input type="datetime-local" value={newTask.due_date} onChange={(e) => setNewTask({ ...newTask, due_date: e.target.value })} />
                  <Button onClick={async () => {
                    const token = await getAccessToken(); if (!token || !newTask.title.trim()) return;
                    const res = await fetch(`/api/crm/agents/${id}/tasks`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify({ ...newTask }) });
                    const j = await res.json().catch(() => ({ ok: false })); if (!j.ok) return;
                    setNewTask({ title: '', priority: 'normal', due_date: '' });
                    const r = await fetch(`/api/crm/agents/${id}`, { headers: { authorization: `Bearer ${token}` } }); const jj = await r.json().catch(()=>null); if (jj && jj.ok) setData(jj.data);
                  }}>Add</Button>
                </div>
              </div>
              <div className="space-y-3 text-sm">
                {(data.tasks || []).map((t: any) => (
                  <div key={t.id} className="p-3 rounded-lg border border-black/5 dark:border-white/10">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-medium">{t.title}</div>
                        <div className="opacity-70 text-xs">{t.status} · due {t.due_date ? new Date(t.due_date).toLocaleString() : 'n/a'}</div>
                      </div>
                      <div className="text-xs opacity-70">Priority: {t.priority}</div>
                    </div>
                  </div>
                ))}
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Notes" />
            <CardBody>
              <div className="mb-3 grid grid-cols-1 md:grid-cols-[1fr_auto] gap-2">
                <Input placeholder="Add a note" value={newNote} onChange={(e) => setNewNote(e.target.value)} />
                <Button onClick={async () => {
                  const token = await getAccessToken(); if (!token || !newNote.trim()) return;
                  const res = await fetch(`/api/crm/agents/${id}/notes`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify({ body: newNote }) });
                  const j = await res.json().catch(() => ({ ok: false })); if (!j.ok) return;
                  setNewNote('');
                  const r = await fetch(`/api/crm/agents/${id}`, { headers: { authorization: `Bearer ${token}` } }); const jj = await r.json().catch(()=>null); if (jj && jj.ok) setData(jj.data);
                }}>Add</Button>
              </div>
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
            <CardHeader title="Campaigns" />
            <CardBody>
              <div className="mb-3 grid grid-cols-1 md:grid-cols-[1fr_auto] gap-2">
                <select className="rounded-lg border px-3 py-2 text-sm" value={assignCampaignId} onChange={(e) => setAssignCampaignId(e.target.value)}>
                  <option value="">Select campaign…</option>
                  {allCampaigns.map(c => <option key={c.id} value={String(c.id)}>{c.name}</option>)}
                </select>
                <Button onClick={async () => {
                  const token = await getAccessToken(); if (!token || !assignCampaignId) return;
                  await fetch(`/api/crm/agents/${id}/campaigns`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify({ campaign_id: Number(assignCampaignId) }) });
                  setAssignCampaignId('');
                  const r = await fetch(`/api/crm/agents/${id}`, { headers: { authorization: `Bearer ${token}` } }); const jj = await r.json().catch(()=>null); if (jj && jj.ok) setData(jj.data);
                }}>Assign</Button>
              </div>
              <div className="space-y-2 text-sm">
                {(data.campaigns || []).map((c: any) => (
                  <div key={c.id} className="flex items-center justify-between">
                    <div className="font-medium">{c.name}</div>
                    <div className="opacity-70">{c.vertical}</div>
                  </div>
                ))}
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


