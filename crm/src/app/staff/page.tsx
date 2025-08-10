"use client";
import { useEffect, useMemo, useState } from "react";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import { IconUsers, IconBriefcase, IconFilter, IconSearch, IconListCheck, IconCalendarEvent, IconDownload, IconUpload, IconReportAnalytics, IconCircleCheck, IconAlertCircle } from "@tabler/icons-react";
import Dialog, { DialogActions } from "@/components/ui/Dialog";

type Customer = {
  id: number;
  name: string;
  email?: string;
  phone?: string;
  vertical: string;
  campaign: string;
  agentId?: number;
  status: "lead" | "active" | "inactive" | "archived";
};

type Agent = {
  id: number;
  name: string;
  title: string;
};
type AgentRow = { id: number; username: string; email?: string; role: string; status: string; campaigns?: string[] };

type Case = {
  id: number;
  title: string;
  customerId: number;
  agentId: number;
  stage: "new" | "in-progress" | "won" | "lost";
};

type Task = {
  id: number;
  title: string;
  for: "customer" | "campaign" | "agent";
  refId: number;
  due: string;
  assignedTo: number;
  completed: boolean;
};

type Campaign = { id: number; name: string; vertical: string; users: number; agents: number };

const MOCK_AGENTS: Agent[] = [];

const MOCK_CUSTOMERS: Customer[] = [];

const MOCK_CAMPAIGNS: Campaign[] = [];

const MOCK_CASES: Case[] = [];

const MOCK_TASKS: Task[] = [];

export default function AgentPage() {
  const [query, setQuery] = useState("");
  const [vertical, setVertical] = useState("");
  const [campaign, setCampaign] = useState("");
  const [agent, setAgent] = useState<number | "">("");

  const [uniqueVerticals, setUniqueVerticals] = useState<string[]>([]);
  const [uniqueCampaigns, setUniqueCampaigns] = useState<string[]>([]);
  const [rows, setRows] = useState<Customer[]>([]);
  const [agents, setAgents] = useState<AgentRow[]>([]);
  const [agentQ, setAgentQ] = useState('');
  const [managerId, setManagerId] = useState<string>('');
  const [leadId, setLeadId] = useState<string>('');
  const [managers, setManagers] = useState<Array<{ id:number; username:string }>>([]);
  const [leads, setLeads] = useState<Array<{ id:number; username:string }>>([]);
  const [agentSort, setAgentSort] = useState<{ col: 'username'|'email'|'status'; dir: 'asc'|'desc' }>({ col: 'username', dir: 'asc' });

  const filtered = useMemo(() => {
    return rows.filter((c) => {
      const byQ = !query || c.name.toLowerCase().includes(query.toLowerCase());
      const byV = !vertical || c.vertical === vertical;
      const byC = !campaign || c.campaign === campaign;
      const byA = !agent || c.agentId === agent;
      return byQ && byV && byC && byA;
    });
  }, [query, vertical, campaign, agent]);

  const [counts, setCounts] = useState({ usersByCampaign: [] as Array<{ name: string; count: number }>, activeCasesByAgent: [] as Array<{ name: string; count: number }>, tasks: { overdue: 0, completed: 0 } });
  const [addOpen, setAddOpen] = useState(false);
  const [addForm, setAddForm] = useState({ full_name: '', email: '', phone: '', company: '', title: '', notes: '', campaign_id: '' });
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'agent'|'manager'|'lead'>('agent');
  const [verticals, setVerticals] = useState<Array<{ id:number; name:string }>>([]);
  const [campaigns, setCampaigns] = useState<Array<{ id:number; name:string; vertical_id: number|null; status: string }>>([]);
  // Dialogs for adding verticals/campaigns
  const [addVerticalOpen, setAddVerticalOpen] = useState(false);
  const [addVerticalName, setAddVerticalName] = useState('');
  const [addVerticalError, setAddVerticalError] = useState<string | null>(null);
  const [addCampaignOpen, setAddCampaignOpen] = useState(false);
  const [addCampaignName, setAddCampaignName] = useState('');
  const [addCampaignVerticalId, setAddCampaignVerticalId] = useState<string>('');
  const [addCampaignError, setAddCampaignError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const token = await getAccessToken();
      if (!token) return;
      const res = await fetch('/api/crm/overview', { cache: 'no-store', headers: { authorization: `Bearer ${token}` } });
      let json: any = null;
      try { json = await res.json(); } catch {}
      if (json && json.ok) {
        setCounts({ usersByCampaign: json.data.usersByCampaign || [], activeCasesByAgent: json.data.activeCasesByAgent || [], tasks: json.data.tasks || { overdue: 0, completed: 0 } });
        setRows(json.data.customers || []);
        setUniqueVerticals(Array.from(new Set((json.data.campaigns || []).map((c: any) => c.vertical))));
        setUniqueCampaigns(Array.from(new Set((json.data.campaigns || []).map((c: any) => c.name))));
        setManagers(json.data.managers || []);
        setLeads(json.data.leads || []);
      }
      const qs = new URLSearchParams();
      if (agentQ) qs.set('q', agentQ);
      const resAgents = await fetch(`/api/admin/agents?sort=${agentSort.col}&dir=${agentSort.dir}&${qs.toString()}`, { headers: { authorization: `Bearer ${token}` } });
      const ja = await resAgents.json().catch(() => null);
      if (ja && ja.ok) setAgents(ja.data.agents || []);
      // Load verticals & campaigns for admin/manager
      try {
        const vres = await fetch('/api/admin/verticals', { headers: { authorization: `Bearer ${token}` }, cache: 'no-store' });
        const vj = await vres.json().catch(() => null);
        if (vj && vj.ok) setVerticals(vj.data.verticals || []);
      } catch {}
      try {
        const cres = await fetch('/api/admin/campaigns', { headers: { authorization: `Bearer ${token}` }, cache: 'no-store' });
        const cj = await cres.json().catch(() => null);
        if (cj && cj.ok) setCampaigns(cj.data.campaigns || []);
      } catch {}
    })();
  }, [agentSort, agentQ]);

  return (
    <main className="container-hero py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold">Agent CRM</h1>
          <p className="opacity-70">Multi-vertical campaigns, agent tracking, calendar, and reporting</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary"><IconUpload size={18} className="mr-2" />Import CSV</Button>
          <Button variant="secondary"><IconDownload size={18} className="mr-2" />Export</Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <Card>
          <CardBody>
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-300"><IconUsers /></div>
              <div>
                <div className="text-sm opacity-70">Active users (top campaign)</div>
                <div className="text-2xl font-semibold">{counts.usersByCampaign[0]?.count ?? 0}</div>
              </div>
            </div>
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-green-50 dark:bg-green-500/10 text-green-600 dark:text-green-300"><IconBriefcase /></div>
              <div>
                <div className="text-sm opacity-70">Active cases per agent (avg)</div>
                <div className="text-2xl font-semibold">{Math.round((counts.activeCasesByAgent.reduce((a, b) => a + b.count, 0) / counts.activeCasesByAgent.length) || 0)}</div>
              </div>
            </div>
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-300"><IconListCheck /></div>
              <div>
                <div className="text-sm opacity-70">Tasks overdue / completed</div>
                <div className="text-2xl font-semibold">{counts.tasks.overdue} / {counts.tasks.completed}</div>
              </div>
            </div>
          </CardBody>
        </Card>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Left: Customers & Filters */}
        <div className="xl:col-span-2 space-y-6">
          {/* Agents table (admin/power) */}
          <Card>
            <CardHeader title="Agents" subtitle="Manage and browse agents" actions={
              <div className="hidden md:flex items-center gap-2">
                <Button variant="primary" onClick={() => setInviteOpen(true)}>Invite Agent</Button>
              </div>
            } />
            <CardBody>
              <div className="grid grid-cols-1 md:grid-cols-12 gap-3 mb-4">
                <div className="md:col-span-4"><Input placeholder="Search by username" value={agentQ} onChange={(e) => setAgentQ(e.target.value)} /></div>
                <div className="md:col-span-4">
                  <Select value={managerId} onChange={(e) => setManagerId(e.target.value)}>
                    <option value="">All Managers</option>
                    {managers.map(m => <option key={m.id} value={String(m.id)}>{m.username}</option>)}
                  </Select>
                </div>
                <div className="md:col-span-4">
                  <Select value={leadId} onChange={(e) => setLeadId(e.target.value)}>
                    <option value="">All Leads</option>
                    {leads.map(l => <option key={l.id} value={String(l.id)}>{l.username}</option>)}
                  </Select>
                </div>
              </div>
              <div className="overflow-auto -mx-6">
                <table className="min-w-full table-auto text-sm">
                  <thead className="sticky top-0 bg-white/80 dark:bg-black/60 backdrop-blur">
                    <tr className="text-left">
                      <th className="px-6 py-3 font-medium cursor-pointer" onClick={() => setAgentSort(s => ({ col: 'username', dir: s.col==='username' && s.dir==='asc' ? 'desc' : 'asc' }))}>Username</th>
                      <th className="px-3 py-3 font-medium cursor-pointer" onClick={() => setAgentSort(s => ({ col: 'email', dir: s.col==='email' && s.dir==='asc' ? 'desc' : 'asc' }))}>Email</th>
                      <th className="px-3 py-3 font-medium">Role</th>
                      <th className="px-3 py-3 font-medium">Campaigns</th>
                      <th className="px-3 py-3 font-medium cursor-pointer" onClick={() => setAgentSort(s => ({ col: 'status', dir: s.col==='status' && s.dir==='asc' ? 'desc' : 'asc' }))}>Status</th>
                      <th className="px-3 py-3 font-medium text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {agents.map((a) => (
                      <tr key={a.id} className="border-t border-black/5 dark:border-white/5 hover:bg-black/5 dark:hover:bg-white/5">
                        <td className="px-6 py-3">{a.username}</td>
                        <td className="px-3 py-3">{a.email}</td>
                        <td className="px-3 py-3">{a.role}</td>
                        <td className="px-3 py-3">
                          {(a.campaigns && a.campaigns.length) ? (
                            <div className="flex flex-wrap gap-1">
                              {a.campaigns.slice(0, 3).map((c) => (
                                <span key={c} className="inline-flex items-center text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300">{c}</span>
                              ))}
                              {a.campaigns.length > 3 && (
                                <span className="text-xs opacity-70">+{a.campaigns.length - 3} more</span>
                              )}
                            </div>
                          ) : (
                            <span className="opacity-60">—</span>
                          )}
                        </td>
                        <td className="px-3 py-3">{a.status}</td>
                        <td className="px-3 py-3 text-right">
                          <a href={`/agent/${a.id}`} className="underline">Open</a>
                          {a.status === 'suspended' && (
                            <button
                              className="underline ml-2"
                              onClick={async () => {
                                const token = await getAccessToken();
                                if (!token) return;
                                try {
                                  const res = await fetch(`/api/admin/agents/${a.id}/resend`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` } });
                                  const j = await res.json().catch(() => null);
                                  if (j && j.ok) {
                                    alert(j.data?.sent ? 'Invite email sent.' : 'Invite queued (no SMTP). Check outbox.');
                                  } else {
                                    alert('Failed to resend invite.');
                                  }
                                } catch {
                                  alert('Failed to resend invite.');
                                }
                              }}
                            >
                              Resend Invite
                            </button>
                          )}
                          <button
                            className="underline ml-2 text-red-600"
                            onClick={async () => {
                              if (!confirm('Delete this user? This cannot be undone.')) return;
                              const token = await getAccessToken();
                              if (!token) return;
                              await fetch(`/api/admin/agents/${a.id}?force=1`, { method: 'DELETE', headers: { authorization: `Bearer ${token}` } });
                              // Refresh agents list
                              try {
                                const qs = new URLSearchParams();
                                if (agentQ) qs.set('q', agentQ);
                                const resAgents = await fetch(`/api/admin/agents?sort=${agentSort.col}&dir=${agentSort.dir}&${qs.toString()}`, { headers: { authorization: `Bearer ${token}` } });
                                const ja = await resAgents.json().catch(() => null);
                                if (ja && ja.ok) setAgents(ja.data.agents || []);
                              } catch {}
                            }}
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardBody>
          </Card>

          {/* Verticals management */}
          <Card>
            <CardHeader title="Verticals" subtitle="Create, rename, or delete verticals" actions={
              <div className="hidden md:flex items-center gap-2">
                <Button variant="primary" onClick={() => { setAddVerticalName(''); setAddVerticalError(null); setAddVerticalOpen(true); }}>Add</Button>
              </div>
            } />
            <CardBody>
              <table className="min-w-full table-auto text-sm">
                <thead><tr className="text-left"><th className="px-6 py-3">Name</th><th className="px-3 py-3 text-right">Actions</th></tr></thead>
                <tbody>
                  {verticals.map(v => (
                    <tr key={v.id} className="border-t border-black/5 dark:border-white/5">
                      <td className="px-6 py-3">{v.name}</td>
                      <td className="px-3 py-3 text-right">
                        <button className="underline mr-2" onClick={async () => {
                          const val = prompt('Rename vertical', v.name) || ''; if (!val.trim()) return;
                          const token = await getAccessToken(); if (!token) return;
                          await fetch(`/api/admin/verticals/${v.id}`, { method: 'PUT', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify({ name: val.trim() }) });
                          const vres = await fetch('/api/admin/verticals', { headers: { authorization: `Bearer ${token}` }, cache: 'no-store' });
                          const vj = await vres.json().catch(() => null); if (vj && vj.ok) setVerticals(vj.data.verticals || []);
                        }}>Rename</button>
                        <button className="underline text-red-600" onClick={async () => {
                          if (!confirm('Delete this vertical?')) return; const token = await getAccessToken(); if (!token) return;
                          await fetch(`/api/admin/verticals/${v.id}`, { method: 'DELETE', headers: { authorization: `Bearer ${token}` } });
                          const vres = await fetch('/api/admin/verticals', { headers: { authorization: `Bearer ${token}` }, cache: 'no-store' });
                          const vj = await vres.json().catch(() => null); if (vj && vj.ok) setVerticals(vj.data.verticals || []);
                        }}>Delete</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardBody>
          </Card>

          {/* Campaigns management */}
          <Card>
            <CardHeader title="Campaigns" subtitle="Create, reassign vertical, rename, or delete" actions={
              <div className="hidden md:flex items-center gap-2">
                <Button variant="primary" onClick={() => { setAddCampaignName(''); setAddCampaignVerticalId(''); setAddCampaignError(null); setAddCampaignOpen(true); }}>Add</Button>
              </div>
            } />
            <CardBody>
              <table className="min-w-full table-auto text-sm">
                <thead><tr className="text-left"><th className="px-6 py-3">Name</th><th className="px-3 py-3">Vertical</th><th className="px-3 py-3">Status</th><th className="px-3 py-3 text-right">Actions</th></tr></thead>
                <tbody>
                  {campaigns.map(c => (
                    <tr key={c.id} className="border-t border-black/5 dark:border-white/5">
                      <td className="px-6 py-3">{c.name}</td>
                      <td className="px-3 py-3">{verticals.find(v => v.id === c.vertical_id)?.name || '—'}</td>
                      <td className="px-3 py-3">{c.status}</td>
                      <td className="px-3 py-3 text-right">
                        <button className="underline mr-2" onClick={async () => {
                          const nm = prompt('Rename campaign', c.name) || ''; if (!nm.trim()) return;
                          const token = await getAccessToken(); if (!token) return;
                          await fetch(`/api/admin/campaigns/${c.id}`, { method: 'PUT', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify({ name: nm.trim() }) });
                          const cres = await fetch('/api/admin/campaigns', { headers: { authorization: `Bearer ${token}` }, cache: 'no-store' });
                          const cj = await cres.json().catch(() => null); if (cj && cj.ok) setCampaigns(cj.data.campaigns || []);
                        }}>Rename</button>
                        <button className="underline mr-2" onClick={async () => {
                          const vid = prompt('Set vertical id (blank for none)', c.vertical_id ? String(c.vertical_id) : '') || '';
                          const token = await getAccessToken(); if (!token) return;
                          await fetch(`/api/admin/campaigns/${c.id}`, { method: 'PUT', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify({ vertical_id: vid ? Number(vid) : null }) });
                          const cres = await fetch('/api/admin/campaigns', { headers: { authorization: `Bearer ${token}` }, cache: 'no-store' });
                          const cj = await cres.json().catch(() => null); if (cj && cj.ok) setCampaigns(cj.data.campaigns || []);
                        }}>Set Vertical</button>
                        <button className="underline text-red-600" onClick={async () => {
                          if (!confirm('Delete this campaign?')) return; const token = await getAccessToken(); if (!token) return;
                          await fetch(`/api/admin/campaigns/${c.id}`, { method: 'DELETE', headers: { authorization: `Bearer ${token}` } });
                          const cres = await fetch('/api/admin/campaigns', { headers: { authorization: `Bearer ${token}` }, cache: 'no-store' });
                          const cj = await cres.json().catch(() => null); if (cj && cj.ok) setCampaigns(cj.data.campaigns || []);
                        }}>Delete</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardBody>
          </Card>

          {/* Add Vertical Dialog */}
          <Dialog open={addVerticalOpen} onOpenChange={setAddVerticalOpen} title="Add vertical">
            <div className="space-y-3">
              {addVerticalError && <div className="text-sm text-red-600">{addVerticalError}</div>}
              <Input placeholder="Vertical name" value={addVerticalName} onChange={(e) => setAddVerticalName(e.target.value)} />
            </div>
            <DialogActions>
              <Button variant="secondary" onClick={() => setAddVerticalOpen(false)}>Cancel</Button>
              <Button onClick={async () => {
                setAddVerticalError(null);
                const name = addVerticalName.trim(); if (!name) { setAddVerticalError('Name required'); return; }
                const token = await getAccessToken(); if (!token) { setAddVerticalError('Not authorized'); return; }
                const res = await fetch('/api/admin/verticals', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify({ name }) });
                const j = await res.json().catch(() => ({ ok: false }));
                if (!j.ok) { setAddVerticalError(j?.error?.message || 'Failed to add'); return; }
                const vres = await fetch('/api/admin/verticals', { headers: { authorization: `Bearer ${token}` }, cache: 'no-store' });
                const vj = await vres.json().catch(() => null); if (vj && vj.ok) setVerticals(vj.data.verticals || []);
                setAddVerticalOpen(false);
              }}>Save</Button>
            </DialogActions>
          </Dialog>

          {/* Add Campaign Dialog */}
          <Dialog open={addCampaignOpen} onOpenChange={setAddCampaignOpen} title="Add campaign">
            <div className="space-y-3">
              {addCampaignError && <div className="text-sm text-red-600">{addCampaignError}</div>}
              <Input placeholder="Campaign name" value={addCampaignName} onChange={(e) => setAddCampaignName(e.target.value)} />
              <label className="text-sm block">
                <span className="text-xs opacity-70">Vertical (optional)</span>
                <Select value={addCampaignVerticalId} onChange={(e) => setAddCampaignVerticalId(e.target.value)}>
                  <option value="">No vertical</option>
                  {verticals.map(v => <option key={v.id} value={String(v.id)}>{v.name}</option>)}
                </Select>
              </label>
            </div>
            <DialogActions>
              <Button variant="secondary" onClick={() => setAddCampaignOpen(false)}>Cancel</Button>
              <Button onClick={async () => {
                setAddCampaignError(null);
                const name = addCampaignName.trim(); if (!name) { setAddCampaignError('Name required'); return; }
                const token = await getAccessToken(); if (!token) { setAddCampaignError('Not authorized'); return; }
                const payload: any = { name };
                if (addCampaignVerticalId) payload.vertical_id = Number(addCampaignVerticalId);
                const res = await fetch('/api/admin/campaigns', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify(payload) });
                const j = await res.json().catch(() => ({ ok: false }));
                if (!j.ok) { setAddCampaignError(j?.error?.message || 'Failed to add'); return; }
                const cres = await fetch('/api/admin/campaigns', { headers: { authorization: `Bearer ${token}` }, cache: 'no-store' });
                const cj = await cres.json().catch(() => null); if (cj && cj.ok) setCampaigns(cj.data.campaigns || []);
                setAddCampaignOpen(false);
              }}>Save</Button>
            </DialogActions>
          </Dialog>
          <Card>
            <CardHeader title="Customers" subtitle="Search and filter by vertical, campaign, or agent; Admins can add customers" actions={
              <div className="hidden md:flex items-center gap-2">
                <Button variant="secondary"><IconFilter size={18} className="mr-2" />Filters</Button>
                <Button><IconSearch size={18} className="mr-2" />Search</Button>
                <Button variant="primary" onClick={() => setAddOpen(true)}>Add Customer</Button>
                
              </div>
            } />
            <CardBody>
              <div className="grid grid-cols-1 md:grid-cols-12 gap-3 mb-4">
                <div className="md:col-span-4"><Input placeholder="Search by name" value={query} onChange={(e) => setQuery(e.target.value)} /></div>
                <div className="md:col-span-3">
                  <Select value={vertical} onChange={(e) => setVertical(e.target.value)}>
                    <option value="">All Verticals</option>
                    {uniqueVerticals.map((v) => <option key={v} value={v}>{v}</option>)}
                  </Select>
                </div>
                <div className="md:col-span-3">
                  <Select value={campaign} onChange={(e) => setCampaign(e.target.value)}>
                    <option value="">All Campaigns</option>
                    {uniqueCampaigns.map((v) => <option key={v} value={v}>{v}</option>)}
                  </Select>
                </div>
                <div className="md:col-span-2">
                  <Select value={agent as any} onChange={(e) => setAgent(e.target.value ? Number(e.target.value) : "") as any}>
                    <option value="">All Agents</option>
                    {MOCK_AGENTS.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </Select>
                </div>
              </div>

              <div className="overflow-auto -mx-6">
                <table className="min-w-full table-auto text-sm">
                  <thead className="sticky top-0 bg-white/80 dark:bg-black/60 backdrop-blur">
                    <tr className="text-left">
                      <th className="px-6 py-3 font-medium">Name</th>
                      <th className="px-3 py-3 font-medium">Contact</th>
                      <th className="px-3 py-3 font-medium">Vertical</th>
                      <th className="px-3 py-3 font-medium">Campaign</th>
                      <th className="px-3 py-3 font-medium">Agent</th>
                      <th className="px-3 py-3 font-medium">Status</th>
                      <th className="px-3 py-3 font-medium text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((c) => (
                      <tr key={c.id} className="border-t border-black/5 dark:border-white/5 hover:bg-black/5 dark:hover:bg-white/5">
                        <td className="px-6 py-3"><a className="underline" href={`/customers/${c.id}`}>{c.name}</a></td>
                        <td className="px-3 py-3">
                          <div className="opacity-80">{c.email}</div>
                          <div className="opacity-60 text-xs">{c.phone}</div>
                        </td>
                        <td className="px-3 py-3">{c.vertical}</td>
                        <td className="px-3 py-3">{c.campaign}</td>
                        <td className="px-3 py-3">{agents.find((a) => a.id === c.agentId)?.username || '-'}</td>
                        <td className="px-3 py-3">
                          <span className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full ${
                            c.status === 'active' ? 'bg-green-100 text-green-700 dark:bg-green-500/10 dark:text-green-300' :
                            c.status === 'lead' ? 'bg-blue-100 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300' :
                            c.status === 'inactive' ? 'bg-amber-100 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300' :
                            'bg-gray-200 text-gray-700 dark:bg-white/10 dark:text-white/70'
                          }`}>
                            {c.status === 'active' ? <IconCircleCheck size={14} /> : <IconAlertCircle size={14} />}
                            {c.status}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-right">
                          <a className="underline" href={`/customers/${c.id}`}>View</a>
                          <a className="underline ml-2" href={`/customers/${c.id}`}>Open</a>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardBody>
          </Card>

          {/* Add Customer Dialog */}
          <Dialog open={addOpen} onOpenChange={setAddOpen} title="Add Customer">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              <Input placeholder="Full name" value={addForm.full_name} onChange={(e) => setAddForm({ ...addForm, full_name: e.target.value })} />
              <Input placeholder="Email" type="email" value={addForm.email} onChange={(e) => setAddForm({ ...addForm, email: e.target.value })} />
              <Input placeholder="Phone" value={addForm.phone} onChange={(e) => setAddForm({ ...addForm, phone: e.target.value })} />
              <Input placeholder="Company" value={addForm.company} onChange={(e) => setAddForm({ ...addForm, company: e.target.value })} />
              <Input placeholder="Title" value={addForm.title} onChange={(e) => setAddForm({ ...addForm, title: e.target.value })} />
              <Select value={addForm.campaign_id} onChange={(e) => setAddForm({ ...addForm, campaign_id: e.target.value })}>
                <option value="">Select campaign…</option>
                {uniqueCampaigns.map((name) => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </Select>
              <textarea className="md:col-span-2 w-full min-h-24 rounded-lg border px-3 py-2 bg-white dark:bg-gray-900 text-black dark:text-white border-black/10 dark:border-white/10" placeholder="Notes" value={addForm.notes} onChange={(e) => setAddForm({ ...addForm, notes: e.target.value })} />
            </div>
            <DialogActions>
              <Button variant="secondary" onClick={() => setAddOpen(false)}>Cancel</Button>
              <Button onClick={async () => {
                const token = await getAccessToken();
                if (!token) { setAddOpen(false); return; }
                if (!addForm.full_name.trim()) { alert('Full name is required'); return; }
                if (!addForm.campaign_id) { alert('Please select a campaign'); return; }
                // resolve campaign name -> id via overview campaigns list call
                const resCamps = await fetch('/api/crm/overview', { headers: { authorization: `Bearer ${token}` }, cache: 'no-store' });
                const jc = await resCamps.json().catch(() => null);
                const campId = jc && jc.ok ? (jc.data.campaigns.find((c: any) => c.name === addForm.campaign_id)?.id || null) : null;
                await fetch('/api/crm/customers/new', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify({ ...addForm, campaign_id: campId }) });
                setAddOpen(false);
                // Refresh overview lists
                try {
                  const res = await fetch('/api/crm/overview', { cache: 'no-store', headers: { authorization: `Bearer ${token}` } });
                  const json = await res.json().catch(() => null);
                  if (json && json.ok) {
                    setCounts({ usersByCampaign: json.data.usersByCampaign || [], activeCasesByAgent: json.data.activeCasesByAgent || [], tasks: json.data.tasks || { overdue: 0, completed: 0 } });
                    setRows(json.data.customers || []);
                    setUniqueVerticals(Array.from(new Set((json.data.campaigns || []).map((c: any) => c.vertical))));
                    setUniqueCampaigns(Array.from(new Set((json.data.campaigns || []).map((c: any) => c.name))));
                  }
                } catch {}
              }}>Save</Button>
            </DialogActions>
          </Dialog>

          {/* Invite Agent Dialog */}
          <Dialog open={inviteOpen} onOpenChange={setInviteOpen} title="Invite Agent">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              <Input placeholder="Agent email" type="email" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} />
              <Select value={inviteRole} onChange={(e) => setInviteRole(e.target.value as any)}>
                <option value="agent">Agent</option>
                <option value="manager">Manager</option>
                <option value="lead">Lead</option>
              </Select>
            </div>
            <DialogActions>
              <Button variant="secondary" onClick={() => setInviteOpen(false)}>Cancel</Button>
              <Button onClick={async () => {
                const token = await getAccessToken();
                if (!token || !inviteEmail) { setInviteOpen(false); return; }
                await fetch('/api/admin/agents/invite', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify({ email: inviteEmail, role: inviteRole }) });
                setInviteOpen(false);
                setInviteEmail('');
                setInviteRole('agent');
              }}>Send Invite</Button>
            </DialogActions>
          </Dialog>

          <Card>
            <CardHeader title="Tasks & Activities" subtitle="Assign to agents, campaigns, or users" actions={<Button size="sm">New Task</Button>} />
            <CardBody>
              <div className="space-y-3">
                {MOCK_TASKS.map((t) => (
                  <div key={t.id} className="flex items-center justify-between p-3 rounded-lg border border-black/5 dark:border-white/5">
                    <div className="flex items-center gap-3">
                      <span className={`size-2 rounded-full ${t.completed ? 'bg-green-500' : 'bg-amber-500'}`} />
                      <div>
                        <div className="font-medium">{t.title}</div>
                        <div className="text-xs opacity-70">Due {t.due} · Assigned to {MOCK_AGENTS.find((a) => a.id === t.assignedTo)?.name}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button size="sm" variant="secondary">Mark Done</Button>
                      <Button size="sm">Open</Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardBody>
          </Card>
        </div>

        {/* Right: Calendar, Campaigns, Reporting */}
        <div className="space-y-6">
          <Card>
            <CardHeader title="Calendar" subtitle="Internal events only" actions={<Button size="sm" variant="secondary"><IconCalendarEvent size={16} className="mr-1" />New Event</Button>} />
            <CardBody>
              <div className="grid grid-cols-7 gap-2 text-center text-xs">
                {[...Array(28)].map((_, i) => (
                  <div key={i} className={`aspect-square rounded-lg border border-black/5 dark:border-white/5 flex items-center justify-center ${i % 7 === 1 ? 'bg-blue-50 dark:bg-blue-500/10' : ''}`}>
                    {i + 1}
                  </div>
                ))}
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Campaigns" subtitle="Active counts by users and agents" />
            <CardBody>
              <div className="space-y-3">
                {MOCK_CAMPAIGNS.map((c) => (
                  <div key={c.id} className="flex items-center justify-between">
                    <div>
                      <div className="font-medium">{c.name}</div>
                      <div className="text-xs opacity-70">{c.vertical}</div>
                    </div>
                    <div className="text-sm opacity-80">{c.users} users · {c.agents} agents</div>
                  </div>
                ))}
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Reports" subtitle="Quick KPIs and filters" actions={<Button size="sm" variant="secondary"><IconReportAnalytics size={16} className="mr-1" />Open</Button>} />
            <CardBody>
              <div className="grid grid-cols-2 gap-3 text-sm">
                {counts.usersByCampaign.map((r) => (
                  <div key={r.name} className="p-3 rounded-lg border border-black/5 dark:border-white/5">
                    <div className="opacity-70">{r.name}</div>
                    <div className="text-xl font-semibold">{r.count}</div>
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
  // Obtain new access token via refresh to keep it in memory only
  const refresh = typeof window !== 'undefined' ? localStorage.getItem('auth.refreshToken') : null;
  if (!refresh) return '';
  const res = await fetch('/api/auth/refresh', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ refreshToken: refresh }) });
  const json = await res.json().catch(() => null);
  if (!json || !json.ok) return '';
  try {
    localStorage.setItem('auth.refreshToken', json.data.refreshToken);
    localStorage.setItem('auth.user', JSON.stringify(json.data.user));
  } catch {}
  return json.data.accessToken as string;
}


