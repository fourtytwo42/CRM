"use client";
import { useEffect, useMemo, useState } from "react";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import {
  IconUsers,
  IconBriefcase,
  IconFilter,
  IconSearch,
  IconListCheck,
  IconCalendarEvent,
  IconDownload,
  IconUpload,
  IconReportAnalytics,
  IconCircleCheck,
  IconAlertCircle,
  IconChevronRight,
} from "@tabler/icons-react";

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
      }
    })();
  }, []);

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
          <Card>
            <CardHeader title="Customers" subtitle="Search and filter by vertical, campaign, or agent" actions={
              <div className="hidden md:flex items-center gap-2">
                <Button variant="secondary"><IconFilter size={18} className="mr-2" />Filters</Button>
                <Button><IconSearch size={18} className="mr-2" />Search</Button>
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
                        <td className="px-6 py-3">{c.name}</td>
                        <td className="px-3 py-3">
                          <div className="opacity-80">{c.email}</div>
                          <div className="opacity-60 text-xs">{c.phone}</div>
                        </td>
                        <td className="px-3 py-3">{c.vertical}</td>
                        <td className="px-3 py-3">{c.campaign}</td>
                        <td className="px-3 py-3">{MOCK_AGENTS.find((a) => a.id === c.agentId)?.name || '-'}</td>
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
                          <Button size="sm" variant="secondary">View</Button>
                          <Button size="sm" className="ml-2">Open<IconChevronRight size={16} className="ml-1" /></Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardBody>
          </Card>

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


