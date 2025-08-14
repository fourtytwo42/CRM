"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import { IconDownload, IconUpload } from "@tabler/icons-react";
import Dialog, { DialogActions } from "@/components/ui/Dialog";
import CaseDetail from "@/app/cases/CaseDetail";

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

// Props interface for CustomersPane
interface CustomersPaneProps {
  query: string;
  setQuery: (q: string) => void;
  vertical: string;
  setVertical: (v: string) => void;
  campaign: string;
  setCampaign: (c: string) => void;
  uniqueVerticals: string[];
  uniqueCampaigns: string[];
  filtered: Customer[];
  agents: AgentRow[];
  verticals: Array<{ id:number; name:string }>;
  campaigns: Array<{ id:number; name:string; vertical_id: number|null; status: string }>;
  addOpen: boolean;
  setAddOpen: (open: boolean) => void;
  addForm: any;
  setAddForm: (form: any) => void;
  setCounts: (counts: any) => void;
  setRows: (rows: Customer[]) => void;
  setUniqueVerticals: (verticals: string[]) => void;
  setUniqueCampaigns: (campaigns: string[]) => void;
  getAccessToken: () => Promise<string>;
  openCaseForCustomer: (customerId: number) => Promise<void>;
}

// CustomersPane component moved outside to avoid JSX nesting issues
function CustomersPane({
  query, setQuery, vertical, setVertical, campaign, setCampaign,
  uniqueVerticals, uniqueCampaigns, filtered, agents, verticals, campaigns,
  addOpen, setAddOpen, addForm, setAddForm, setCounts, setRows,
  setUniqueVerticals, setUniqueCampaigns, getAccessToken, openCaseForCustomer
}: CustomersPaneProps) {
  const [selectedCustomerIds, setSelectedCustomerIds] = useState<number[]>([]);
  const [customerBulkVerticalId, setCustomerBulkVerticalId] = useState<string>('');
  const [customerBulkCampaignId, setCustomerBulkCampaignId] = useState<string>('');
  const [customerSort, setCustomerSort] = useState<{ col: 'name'|'contact'|'vertical'|'campaign'; dir: 'asc'|'desc' }>({ col: 'name', dir: 'asc' });
	const [customersPage, setCustomersPage] = useState(1);
	const customersPageSize = 25;
  const sortedCustomers = useMemo(() => {
    const arr = [...filtered];
    const dir = customerSort.dir === 'asc' ? 1 : -1;
    arr.sort((a, b) => {
      const val = ((): number => {
        switch (customerSort.col) {
          case 'name': return (a.name||'').localeCompare(b.name||'');
          case 'contact': {
            const av = (a.email || a.phone || '').toLowerCase();
            const bv = (b.email || b.phone || '').toLowerCase();
            return av.localeCompare(bv);
          }
          case 'vertical': return (a.vertical||'').localeCompare(b.vertical||'');
          case 'campaign': return (a.campaign||'').localeCompare(b.campaign||'');
          default: return 0;
        }
      })();
      return val * dir;
    });
    return arr;
  }, [filtered, customerSort]);
  const displayCustomers = useMemo(() => {
    const start = (customersPage - 1) * customersPageSize;
    return sortedCustomers.slice(start, start + customersPageSize);
  }, [sortedCustomers, customersPage]);
	useEffect(() => { setCustomersPage(1); }, [query, vertical, campaign, filtered.length]);
  return (
    <>
      <Card>
        <CardHeader
          title="Customers"
          subtitle="Search and filter by vertical, campaign, or agent; Admins can add customers"
          actions={
            <div className="hidden md:flex items-center gap-2">
              <Button variant="primary" onClick={() => setAddOpen(true)}>Add Customer</Button>
            </div>
          }
        />
        <CardBody>
          <div className="grid grid-cols-1 md:grid-cols-12 gap-3 mb-4">
            <div className="md:col-span-4"><Input placeholder="Search by name" value={query} onChange={(e) => setQuery(e.target.value)} /></div>
            <div className="md:col-span-3">
              <Select value={vertical} onChange={(e) => setVertical(e.target.value)}>
                <option value="">All Verticals</option>
                {uniqueVerticals.map((v) => <option key={v} value={v}>{v}</option>)}
                <option value="__unassigned__">Unassigned</option>
              </Select>
            </div>
            <div className="md:col-span-3">
              <Select value={campaign} onChange={(e) => setCampaign(e.target.value)}>
                <option value="">All Campaigns</option>
                {uniqueCampaigns.map((v) => <option key={v} value={v}>{v}</option>)}
                <option value="__unassigned__">Unassigned</option>
              </Select>
            </div>
          </div>

				<div className="rounded-xl border border-black/10 dark:border-white/10 max-h-[420px] overflow-auto -mx-6">
            {selectedCustomerIds.length > 0 && (
              <div className="px-6 py-3 flex items-center gap-3 text-sm">
                <span>{selectedCustomerIds.length} selected</span>
                <Button variant="destructive" onClick={async () => {
                  if (!confirm('Delete selected customers?')) return;
                  const token = await getAccessToken(); if (!token) return;
                  await Promise.allSettled(selectedCustomerIds.map(id => fetch(`/api/crm/customers/${id}`, { method: 'DELETE', headers: { authorization: `Bearer ${token}` } })));
                  setRows(((p: Customer[]) => p.filter((x: Customer) => !selectedCustomerIds.includes(x.id))) as any);
                  setSelectedCustomerIds([]);
                }}>Delete</Button>
                <Select value={customerBulkVerticalId} onChange={(e) => setCustomerBulkVerticalId(e.target.value)}>
                  <option value="">Vertical (optional)</option>
                  {verticals.map(v => <option key={v.id} value={String(v.id)}>{v.name}</option>)}
                </Select>
                <Select value={customerBulkCampaignId} onChange={(e) => setCustomerBulkCampaignId(e.target.value)}>
                  <option value="">Campaign (optional)</option>
                  {(campaigns.filter(c => customerBulkVerticalId ? String(c.vertical_id||'')===customerBulkVerticalId : true)).map(c => (
                    <option key={c.id} value={String(c.id)}>{c.name}</option>
                  ))}
                </Select>
                <Button onClick={async () => {
                  const token = await getAccessToken(); if (!token) return;
                  const cid = customerBulkCampaignId ? Number(customerBulkCampaignId) : null;
                  if (!cid) { alert('Choose a campaign'); return; }
                  await Promise.allSettled(selectedCustomerIds.map(id => fetch(`/api/crm/customers/${id}/campaigns`, { method: 'PUT', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify({ campaign_ids: [cid] }) })));
                  setSelectedCustomerIds([]);
                  try {
                    const res = await fetch('/api/crm/overview', { cache: 'no-store', headers: { authorization: `Bearer ${token}` } });
                    const json = await res.json().catch(() => null);
                    if (json && json.ok) { setRows(json.data.customers || []); }
                  } catch {}
                }}>Set Campaign</Button>
              </div>
            )}
					<table className="min-w-full table-auto text-sm">
              <thead className="sticky top-0 bg-white/80 dark:bg-black/60 backdrop-blur">
                <tr className="text-left">
								<th className="px-3 py-3"><input type="checkbox" checked={displayCustomers.length > 0 && displayCustomers.every(r => selectedCustomerIds.includes(r.id))} onChange={(e) => setSelectedCustomerIds(e.target.checked ? Array.from(new Set([...selectedCustomerIds, ...displayCustomers.map(x => x.id)])) : selectedCustomerIds.filter(id => !displayCustomers.some(x => x.id === id)))} /></th>
                  <th className="px-6 py-3 font-medium cursor-pointer" onClick={() => setCustomerSort(s => ({ col: 'name', dir: s.col==='name' && s.dir==='asc' ? 'desc' : 'asc' }))}>Name</th>
                  <th className="px-3 py-3 font-medium cursor-pointer" onClick={() => setCustomerSort(s => ({ col: 'contact', dir: s.col==='contact' && s.dir==='asc' ? 'desc' : 'asc' }))}>Contact</th>
                  <th className="px-3 py-3 font-medium cursor-pointer" onClick={() => setCustomerSort(s => ({ col: 'vertical', dir: s.col==='vertical' && s.dir==='asc' ? 'desc' : 'asc' }))}>Vertical</th>
                  <th className="px-3 py-3 font-medium cursor-pointer" onClick={() => setCustomerSort(s => ({ col: 'campaign', dir: s.col==='campaign' && s.dir==='asc' ? 'desc' : 'asc' }))}>Campaign</th>
                  <th className="px-3 py-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
							{displayCustomers.map((c) => (
                  <tr key={c.id} className="border-t border-black/5 dark:border-white/5 hover:bg-black/5 dark:hover:bg-white/5">
                    <td className="px-3 py-3"><input type="checkbox" checked={selectedCustomerIds.includes(c.id)} onChange={(e) => setSelectedCustomerIds(e.target.checked ? Array.from(new Set([...selectedCustomerIds, c.id])) : selectedCustomerIds.filter(id => id !== c.id))} /></td>
                    <td className="px-6 py-3"><a className="underline" href={`/customers/${c.id}`}>{c.name}</a></td>
                    <td className="px-3 py-3">
                      <div className="opacity-80">{c.email}</div>
                      <div className="opacity-60 text-xs">{c.phone}</div>
                    </td>
                    <td className="px-3 py-3">{c.vertical}</td>
                    <td className="px-3 py-3">{c.campaign}</td>
                    <td className="px-3 py-3 text-right">
                      <a className="ml-2" title="View" href={`/customers/${c.id}`}>🔍</a>
                      <button className="ml-2" title="Open Case" onClick={async (e) => {
                        e.preventDefault();
                        await openCaseForCustomer(c.id);
                      }}>📁</button>
                      <button className="ml-2" title="Delete" onClick={async (e) => {
                        e.preventDefault();
                        if (!confirm('Delete this customer?')) return;
                        const token = await getAccessToken();
                        if (!token) return;
                        await fetch(`/api/crm/customers/${c.id}`, { method: 'DELETE', headers: { authorization: `Bearer ${token}` } });
                        setRows(((p: Customer[]) => p.filter((x: Customer) => x.id !== c.id)) as any);
                      }}>🗑️</button>
                    </td>
                  </tr>
                ))}
              </tbody>
					</table>
          </div>
				<div className="mt-2 flex items-center justify-between text-xs">
					<div>Showing {Math.min((customersPage - 1) * customersPageSize + 1, filtered.length)}–{Math.min(customersPage * customersPageSize, filtered.length)} of {filtered.length}</div>
					<div className="flex items-center gap-2">
						<Button variant="secondary" onClick={() => setCustomersPage(p => Math.max(1, p - 1))} disabled={customersPage === 1}>Prev</Button>
						<Button variant="secondary" onClick={() => setCustomersPage(p => (p * customersPageSize < filtered.length ? p + 1 : p))} disabled={customersPage * customersPageSize >= filtered.length}>Next</Button>
					</div>
				</div>
        </CardBody>
      </Card>

      {/* Add Customer Dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen} title="Add Customer">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          <Input placeholder="First name" value={addForm.first_name} onChange={(e) => setAddForm({ ...addForm, first_name: e.target.value })} />
          <Input placeholder="Last name" value={addForm.last_name} onChange={(e) => setAddForm({ ...addForm, last_name: e.target.value })} />
          <Input placeholder="Email" type="email" value={addForm.email} onChange={(e) => setAddForm({ ...addForm, email: e.target.value })} />
          <Input placeholder="Phone" value={addForm.phone} onChange={(e) => setAddForm({ ...addForm, phone: e.target.value })} />
          <Input placeholder="Street address (line 1)" value={addForm.street1} onChange={(e) => setAddForm({ ...addForm, street1: e.target.value })} />
          <Input placeholder="Street address (line 2)" value={addForm.street2} onChange={(e) => setAddForm({ ...addForm, street2: e.target.value })} />
          <Input placeholder="City" value={addForm.city} onChange={(e) => setAddForm({ ...addForm, city: e.target.value })} />
          <Input placeholder="State" value={addForm.state} onChange={(e) => setAddForm({ ...addForm, state: e.target.value })} />
          <Input placeholder="ZIP" value={addForm.zip} onChange={(e) => setAddForm({ ...addForm, zip: e.target.value })} />
          <Input placeholder="Company" value={addForm.company} onChange={(e) => setAddForm({ ...addForm, company: e.target.value })} />
          <Input placeholder="Title" value={addForm.title} onChange={(e) => setAddForm({ ...addForm, title: e.target.value })} />
          <Select value={addForm.campaign_id} onChange={(e) => setAddForm({ ...addForm, campaign_id: e.target.value })}>
            <option value="">Select campaign…</option>
            {uniqueCampaigns.map((name) => (
              <option key={name} value={name}>{name}</option>
            ))}
          </Select>
          <textarea className="md:col-span-2 w-full min-h-24 rounded-lg border px-3 py-2 bg-white dark:bg-gray-900 text-black dark:text-white border-black/10 dark:border-white/10" placeholder="Notes" value={addForm.notes} onChange={(e) => setAddForm({ ...addForm, notes: e.target.value })} />
          <div className="md:col-span-2 text-xs opacity-70">At least one contact method is required (email or phone).</div>
        </div>
        <DialogActions>
          <Button variant="secondary" onClick={() => setAddOpen(false)}>Cancel</Button>
          <Button onClick={async () => {
            const token = await getAccessToken();
            if (!token) { setAddOpen(false); return; }
            if (!String(addForm.email||'').trim() && !String(addForm.phone||'').trim()) { alert('Email or phone is required'); return; }
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
                setCounts({ usersByCampaign: json.data.usersByCampaign || [], activeCasesByAgent: json.data.activeCasesByAgent || [], tasks: { overdue: 0, completed: 0 } });
                setRows(json.data.customers || []);
                setUniqueVerticals(Array.from(new Set((json.data.campaigns || []).map((c: any) => c.vertical))));
                setUniqueCampaigns(Array.from(new Set((json.data.campaigns || []).map((c: any) => c.name))));
              }
            } catch {}
          }}>Save</Button>
        </DialogActions>
      </Dialog>
    </>
  );
}

export default function AgentPage() {
  const initialSavedTabs: Array<{ id:number; case_number:string }> = (typeof window !== 'undefined') ? (() => {
    try {
      const raw = localStorage.getItem('staff.openCaseTabs');
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed.filter((t:any) => t && typeof t.id === 'number' && typeof t.case_number === 'string') : [];
    } catch { return []; }
  })() : [];
  const [activeTab, setActiveTab] = useState<'Verticals'|'Campaigns'|'Agents'|'Customers'|'Cases'>(initialSavedTabs.length > 0 ? 'Cases' : 'Customers');
  const [query, setQuery] = useState("");
  const [vertical, setVertical] = useState("");
  const [campaign, setCampaign] = useState("");
  const [agent, setAgent] = useState<number | "">("");

  const [uniqueVerticals, setUniqueVerticals] = useState<string[]>([]);
  const [uniqueCampaigns, setUniqueCampaigns] = useState<string[]>([]);
  const [rows, setRows] = useState<Customer[]>([]);
  const [agents, setAgents] = useState<AgentRow[]>([]);
  const [agentQ, setAgentQ] = useState('');
  const [roleFilter, setRoleFilter] = useState<'all'|'manager'|'lead'|'agent'>('all');
  const [agentSort, setAgentSort] = useState<{ col: 'username'|'email'|'status'; dir: 'asc'|'desc' }>({ col: 'username', dir: 'asc' });
  const [selectedAgentIds, setSelectedAgentIds] = useState<number[]>([]);
  const [agentsPage, setAgentsPage] = useState(1);
  const agentsPageSize = 25;
  const [bulkRole, setBulkRole] = useState<'agent'|'lead'|'manager'>('agent');
  const [agentBulkOpen, setAgentBulkOpen] = useState(false);
  const [agentBulkVerticalId, setAgentBulkVerticalId] = useState<string>('');
  const [agentBulkCampaignIds, setAgentBulkCampaignIds] = useState<number[]>([]);

  const filtered = useMemo(() => {
    return rows.filter((c) => {
      const q = (query || '').toLowerCase();
      const byQ = !q || c.name.toLowerCase().includes(q) || (c.email ? c.email.toLowerCase().includes(q) : false);
      const isUnassignedVertical = !c.vertical;
      const isUnassignedCampaign = !c.campaign;
      const byV = !vertical || (vertical === '__unassigned__' ? isUnassignedVertical : c.vertical === vertical);
      const byC = !campaign || (campaign === '__unassigned__' ? isUnassignedCampaign : c.campaign === campaign);
      const byA = !agent || c.agentId === agent;
      return byQ && byV && byC && byA;
    });
  }, [rows, query, vertical, campaign, agent]);

  // Agents pagination/sorting
  const agentsFiltered = useMemo(() => agents.filter(a => roleFilter === 'all' ? true : a.role === roleFilter), [agents, roleFilter]);
  const agentsSorted = useMemo(() => {
    const arr = [...agentsFiltered];
    const dir = agentSort.dir === 'asc' ? 1 : -1;
    if (agentSort.col === 'username') arr.sort((a,b)=> (a.username||'').localeCompare(b.username||'') * dir);
    if (agentSort.col === 'email') arr.sort((a,b)=> (a.email||'').localeCompare(b.email||'') * dir);
    if (agentSort.col === 'status') arr.sort((a,b)=> (a.status||'').localeCompare(b.status||'') * dir);
    return arr;
  }, [agentsFiltered, agentSort]);
  const agentsDisplay = useMemo(() => {
    const start = (agentsPage - 1) * agentsPageSize; return agentsSorted.slice(start, start + agentsPageSize);
  }, [agentsSorted, agentsPage]);
  useEffect(() => { setAgentsPage(1); }, [roleFilter, agentQ, agents.length]);

  const [counts, setCounts] = useState({ usersByCampaign: [] as Array<{ name: string; count: number }>, activeCasesByAgent: [] as Array<{ name: string; count: number }>, tasks: { overdue: 0, completed: 0 } });
  const [addOpen, setAddOpen] = useState(false);
  const [addForm, setAddForm] = useState({ first_name: '', last_name: '', email: '', phone: '', street1: '', street2: '', city: '', state: '', zip: '', company: '', title: '', notes: '', campaign_id: '' });
  const [selectedCustomerIds, setSelectedCustomerIds] = useState<number[]>([]);
  const [customerBulkVerticalId, setCustomerBulkVerticalId] = useState<string>('');
  const [customerBulkCampaignId, setCustomerBulkCampaignId] = useState<string>('');
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'agent'|'manager'|'lead'>('agent');
  const [aiOpen, setAiOpen] = useState(false);
  const [aiUsername, setAiUsername] = useState('');
  const [aiRole, setAiRole] = useState<'agent'|'manager'|'lead'>('agent');
  const [aiPersonality, setAiPersonality] = useState('');
  const [aiBusy, setAiBusy] = useState<'idle'|'saving'>('idle');
  const [aiError, setAiError] = useState<string | null>(null);
  const [verticals, setVerticals] = useState<Array<{ id:number; name:string }>>([]);
  const [campaigns, setCampaigns] = useState<Array<{ id:number; name:string; vertical_id: number|null; status: string }>>([]);
  const [verticalSort, setVerticalSort] = useState<{ col: 'name'; dir: 'asc'|'desc' }>({ col: 'name', dir: 'asc' });
  const [campaignSort, setCampaignSort] = useState<{ col: 'name'|'vertical'; dir: 'asc'|'desc' }>({ col: 'name', dir: 'asc' });
  const [graph, setGraph] = useState<any>(null);
  // Cases tab state
  const [casesRows, setCasesRows] = useState<Array<{ id:number; case_number:string; title:string; stage:string; created_at:string; customer_name:string; customer_email?:string|null; customer_phone?:string|null; campaign_name?:string|null; vertical_name?:string|null }>>([]);
  const [casesQ, setCasesQ] = useState('');
  const [casesVertical, setCasesVertical] = useState('');
  const [casesCampaign, setCasesCampaign] = useState('');
  const [casesPage, setCasesPage] = useState(1);
  const casesPageSize = 25;
  const [casesSort, setCasesSort] = useState<{ col: 'case_number'|'title'|'customer_name'|'campaign_name'|'vertical_name'|'stage'|'created_at'; dir: 'asc'|'desc' }>({ col: 'created_at', dir: 'desc' });
  const [openCaseTabs, setOpenCaseTabs] = useState<Array<{ id:number; case_number:string }>>(initialSavedTabs);
  const [activeCaseTabId, setActiveCaseTabId] = useState<number | null>(() => {
    if (typeof window === 'undefined') return null;
    try {
      const rawActive = localStorage.getItem('staff.activeCaseTabId');
      const stored = rawActive ? Number(rawActive) : NaN;
      const found = initialSavedTabs.find(t => t.id === stored);
      return found ? found.id : (initialSavedTabs[0]?.id ?? null);
    } catch { return null; }
  });
  const tabsScrollRef = useRef<HTMLDivElement|null>(null);
  // Persist tabs and active tab id
  useEffect(() => {
    try { if (typeof window !== 'undefined') localStorage.setItem('staff.openCaseTabs', JSON.stringify(openCaseTabs)); } catch {}
  }, [openCaseTabs]);
  useEffect(() => {
    try { if (typeof window !== 'undefined') localStorage.setItem('staff.activeCaseTabId', activeCaseTabId != null ? String(activeCaseTabId) : ''); } catch {}
  }, [activeCaseTabId]);
  // Dialogs for adding verticals/campaigns
  const [addVerticalOpen, setAddVerticalOpen] = useState(false);
  const [addVerticalName, setAddVerticalName] = useState('');
  const [addVerticalError, setAddVerticalError] = useState<string | null>(null);
  const [addCampaignOpen, setAddCampaignOpen] = useState(false);
  const [addCampaignName, setAddCampaignName] = useState('');
  const [addCampaignVerticalId, setAddCampaignVerticalId] = useState<string>('');
  const [addCampaignNewVerticalName, setAddCampaignNewVerticalName] = useState('');
  const [addCampaignError, setAddCampaignError] = useState<string | null>(null);

  // Dialog: set vertical for a campaign
  const [setVerticalOpenForCampaignId, setSetVerticalOpenForCampaignId] = useState<number | null>(null);
  const [setVerticalSelect, setSetVerticalSelect] = useState<string>('');
  const [setVerticalNewName, setSetVerticalNewName] = useState('');
  const [setVerticalError, setSetVerticalError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const token = await getAccessToken();
      if (!token) return;
      const res = await fetch('/api/crm/overview', { cache: 'no-store', headers: { authorization: `Bearer ${token}` } });
      let json: any = null;
      try { json = await res.json(); } catch {}
      if (json && json.ok) {
        setRows(json.data.customers || []);
        // Build unique verticals/campaigns including blanks if no assignment
        const allVerts = (json.data.campaigns || []).map((c: any) => c.vertical).filter(Boolean) as string[];
        const allCamps = (json.data.campaigns || []).map((c: any) => c.name).filter(Boolean) as string[];
        setUniqueVerticals(Array.from(new Set<string>(allVerts)).sort());
        setUniqueCampaigns(Array.from(new Set<string>(allCamps)).sort());
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
      // Load CRM graph for relationships across tabs
      try {
        // Compose graph from existing endpoints
        const [vres2, cres2] = await Promise.all([
          fetch('/api/admin/verticals', { headers: { authorization: `Bearer ${token}` }, cache: 'no-store' }),
          fetch('/api/admin/campaigns', { headers: { authorization: `Bearer ${token}` }, cache: 'no-store' }),
        ]);
        const [vj2, cj2] = await Promise.all([vres2.json().catch(() => null), cres2.json().catch(() => null)]);
        if (vj2 && vj2.ok && cj2 && cj2.ok) {
          setGraph({
            agent_verticals: vj2.meta?.agent_verticals || [],
            managers: vj2.meta?.managers || [],
            leads: vj2.meta?.leads || [],
            agents: vj2.meta?.agents || [],
            agent_campaigns: cj2.meta?.agent_campaigns || [],
            customer_campaigns: cj2.meta?.customer_campaigns || [],
          });
        }
      } catch {}
      // Load cases for Cases tab (reuse token)
      try {
        const qs = new URLSearchParams(); if (casesQ) qs.set('q', casesQ); if (casesVertical) qs.set('vertical', casesVertical); if (casesCampaign) qs.set('campaign', casesCampaign);
        const rcases = await fetch(`/api/crm/cases?${qs.toString()}`, { headers: { authorization: `Bearer ${token}` }, cache: 'no-store' });
        const jc = await rcases.json().catch(()=>null); if (jc && jc.ok) setCasesRows(jc.data.cases || []);
      } catch {}
    })();
  }, [agentSort, agentQ, casesQ, casesVertical, casesCampaign]);

  const casesSorted = useMemo(() => {
    const arr = [...casesRows]; const dir = casesSort.dir === 'asc' ? 1 : -1;
    arr.sort((a,b) => {
      const av = (a[casesSort.col] || '').toString().toLowerCase();
      const bv = (b[casesSort.col] || '').toString().toLowerCase();
      if (casesSort.col === 'created_at') return (new Date(a.created_at).getTime() - new Date(b.created_at).getTime()) * dir;
      return av.localeCompare(bv) * dir;
    });
    return arr;
  }, [casesRows, casesSort]);
  const casesDisplay = useMemo(() => {
    const start = (casesPage - 1) * casesPageSize; return casesSorted.slice(start, start + casesPageSize);
  }, [casesSorted, casesPage]);
  useEffect(() => { setCasesPage(1); }, [casesQ, casesVertical, casesCampaign, casesRows.length]);

  return (
    <main className="container-hero py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold">Agent CRM</h1>
          <p className="opacity-70">Manage agents, campaigns, verticals, and customers</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={async () => {
            const token = await getAccessToken(); if (!token) return;
            const type = activeTab.toLowerCase();
            const res = await fetch(`/api/admin/export?type=${type}`, { headers: { authorization: `Bearer ${token}` } });
            if (!res.ok) { alert('Export failed'); return; }
            const blob = await res.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${type}-${new Date().toISOString().slice(0,19).replace(/[:T]/g,'-')}.${type==='settings'?'json':(type==='emails'?'json':'csv')}`;
            document.body.appendChild(a); a.click(); a.remove();
            URL.revokeObjectURL(url);
          }}><IconDownload size={18} className="mr-2" />Export</Button>
          <Button variant="secondary" onClick={async () => {
            const type = activeTab.toLowerCase();
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = (type==='settings' || type==='emails') ? '.json,application/json' : '.csv,text/csv';
            input.onchange = async () => {
              const file = (input.files && input.files[0]) || null; if (!file) return;
              const token = await getAccessToken(); if (!token) return;
              const text = await file.text();
              const res = await fetch(`/api/admin/import?type=${type}`, { method: 'POST', headers: { 'content-type': (type==='settings' || type==='emails') ? 'application/json' : 'text/plain', authorization: `Bearer ${token}` }, body: text });
              const j = await res.json().catch(()=>null);
              if (!j || !j.ok) alert(j?.error?.message || 'Import failed'); else alert('Import complete');
            };
            input.click();
          }}><IconUpload size={18} className="mr-2" />Import</Button>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="mb-4 flex flex-wrap gap-2">
        {(['Verticals','Campaigns','Agents','Customers','Cases'] as const).map(tab => (
          <button
            key={tab}
            className={`px-3 py-1.5 rounded-lg text-sm border ${activeTab===tab ? 'bg-black text-white dark:bg-white dark:text-black' : 'bg-transparent'} border-black/10 dark:border-white/10`}
            onClick={() => setActiveTab(tab)}
          >{tab}</button>
        ))}
      </div>

      <div className="space-y-6">
        {/* Agents */}
        {activeTab === 'Agents' && (
          <Card>
            <CardHeader title="Agents" subtitle="Manage and browse agents" actions={
              <div className="hidden md:flex items-center gap-2">
                <Button variant="primary" onClick={() => setInviteOpen(true)}>Invite Agent</Button>
                <Button variant="secondary" onClick={() => { setAiUsername(''); setAiRole('agent'); setAiPersonality(''); setAiError(null); setAiOpen(true); }}>Create AI Agent</Button>
              </div>
            } />
            <CardBody>
              <div className="grid grid-cols-1 md:grid-cols-12 gap-3 mb-4">
                <div className="md:col-span-4"><Input placeholder="Search by username or email" value={agentQ} onChange={(e) => setAgentQ(e.target.value)} /></div>
                <div className="md:col-span-4">
                  <Select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value as any)}>
                    <option value="all">All Roles</option>
                    <option value="manager">Managers</option>
                    <option value="lead">Team Leads</option>
                    <option value="agent">Agents</option>
                  </Select>
                </div>
              </div>
              <div className="rounded-xl border border-black/10 dark:border-white/10 max-h-[420px] overflow-auto -mx-6">
                {selectedAgentIds.length > 0 && (
                  <div className="px-6 py-3 flex items-center gap-3 text-sm">
                    <span>{selectedAgentIds.length} selected</span>
                    <Button variant="destructive" onClick={async () => {
                      if (!confirm('Delete selected agents?')) return;
                      const token = await getAccessToken(); if (!token) return;
                      await Promise.allSettled(selectedAgentIds.map(id => fetch(`/api/admin/agents/${id}?force=1`, { method: 'DELETE', headers: { authorization: `Bearer ${token}` } })));
                      // Reload agents
                      try {
                        const qs = new URLSearchParams(); if (agentQ) qs.set('q', agentQ);
                        const resAgents = await fetch(`/api/admin/agents?sort=${agentSort.col}&dir=${agentSort.dir}&${qs.toString()}`, { headers: { authorization: `Bearer ${token}` } });
                        const ja = await resAgents.json().catch(() => null);
                        if (ja && ja.ok) setAgents(ja.data.agents || []);
                      } catch {}
                      setSelectedAgentIds([]);
                    }}>Delete</Button>
                    <Select value={bulkRole} onChange={(e) => setBulkRole(e.target.value as any)}>
                      <option value="agent">Agent</option>
                      <option value="lead">Team Lead</option>
                      <option value="manager">Manager</option>
                    </Select>
                    <Button variant="secondary" onClick={async () => {
                      if (!confirm(`Set role to ${bulkRole} for ${selectedAgentIds.length} agents?`)) return;
                      const token = await getAccessToken(); if (!token) return;
                      await Promise.allSettled(selectedAgentIds.map(id => fetch(`/api/admin/users/${id}/role`, { method: 'PUT', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify({ role: bulkRole }) })));
                      // Reload agents
                      try {
                        const qs = new URLSearchParams(); if (agentQ) qs.set('q', agentQ);
                        const resAgents = await fetch(`/api/admin/agents?sort=${agentSort.col}&dir=${agentSort.dir}&${qs.toString()}`, { headers: { authorization: `Bearer ${token}` } });
                        const ja = await resAgents.json().catch(() => null);
                        if (ja && ja.ok) setAgents(ja.data.agents || []);
                      } catch {}
                      setSelectedAgentIds([]);
                    }}>Set Role</Button>
                    <Button onClick={() => { setAgentBulkVerticalId(''); setAgentBulkCampaignIds([]); setAgentBulkOpen(true); }}>Set Campaigns</Button>
                  </div>
                )}
                <table className="min-w-full table-auto text-sm">
                  <thead className="sticky top-0 bg-white/80 dark:bg-black/60 backdrop-blur">
                    <tr className="text-left">
                      <th className="px-3 py-3">
                        <input type="checkbox" checked={agentsDisplay.length > 0 && agentsDisplay.every(a => selectedAgentIds.includes(a.id))} onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedAgentIds(prev => Array.from(new Set([...prev, ...agentsDisplay.map(a=>a.id)])));
                          } else {
                            setSelectedAgentIds(prev => prev.filter(id => !agentsDisplay.some(a => a.id === id)));
                          }
                        }} />
                      </th>
                      <th className="px-6 py-3 font-medium cursor-pointer" onClick={() => setAgentSort(s => ({ col: 'username', dir: s.col==='username' && s.dir==='asc' ? 'desc' : 'asc' }))}>Username</th>
                      <th className="px-3 py-3 font-medium cursor-pointer" onClick={() => setAgentSort(s => ({ col: 'email', dir: s.col==='email' && s.dir==='asc' ? 'desc' : 'asc' }))}>Email</th>
                      <th className="px-3 py-3 font-medium">Role</th>
                      <th className="px-3 py-3 font-medium">Campaigns</th>
                      <th className="px-3 py-3 font-medium cursor-pointer" onClick={() => setAgentSort(s => ({ col: 'status', dir: s.col==='status' && s.dir==='asc' ? 'desc' : 'asc' }))}>Status</th>
                      <th className="px-3 py-3 font-medium text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {agentsDisplay.map((a) => (
                      <tr key={a.id} className="border-t border-black/5 dark:border-white/5 hover:bg-black/5 dark:hover:bg-white/5">
                        <td className="px-3 py-3"><input type="checkbox" checked={selectedAgentIds.includes(a.id)} onChange={(e) => {
                          setSelectedAgentIds(prev => e.target.checked ? Array.from(new Set([...prev, a.id])) : prev.filter(id => id !== a.id));
                        }} /></td>
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
              <div className="mt-2 flex items-center justify-between text-xs">
                <div>Showing {Math.min((agentsPage - 1) * agentsPageSize + 1, agentsSorted.length)}–{Math.min(agentsPage * agentsPageSize, agentsSorted.length)} of {agentsSorted.length}</div>
                <div className="flex items-center gap-2">
                  <Button variant="secondary" onClick={() => setAgentsPage(p => Math.max(1, p - 1))} disabled={agentsPage === 1}>Prev</Button>
                  <Button variant="secondary" onClick={() => setAgentsPage(p => (p * agentsPageSize < agentsSorted.length ? p + 1 : p))} disabled={agentsPage * agentsPageSize >= agentsSorted.length}>Next</Button>
                </div>
              </div>
            </CardBody>
          </Card>
        )}

        {/* Cases */}
        {activeTab === 'Cases' && (
          <Card>
            <CardHeader title="Cases" subtitle="Search and filter by vertical or campaign" />
            <CardBody>
              <div className="grid grid-cols-1 md:grid-cols-12 gap-3 mb-4">
                <div className="md:col-span-4"><Input placeholder="Search by case #, customer, contact, or campaign" value={casesQ} onChange={(e)=>setCasesQ(e.target.value)} /></div>
                <div className="md:col-span-3">
                  <Select value={casesVertical} onChange={(e)=>setCasesVertical(e.target.value)}>
                    <option value="">All Verticals</option>
                    {uniqueVerticals.map(v => <option key={v} value={v}>{v}</option>)}
                  </Select>
                </div>
                <div className="md:col-span-3">
                  <Select value={casesCampaign} onChange={(e)=>setCasesCampaign(e.target.value)}>
                    <option value="">All Campaigns</option>
                    {uniqueCampaigns.map(v => <option key={v} value={v}>{v}</option>)}
                  </Select>
                </div>
              </div>
              <div className="rounded-xl border border-black/10 dark:border-white/10 max-h-[420px] overflow-auto -mx-6">
                <table className="min-w-full table-auto text-sm">
                  <thead className="sticky top-0 bg-white/80 dark:bg-black/60 backdrop-blur">
                    <tr className="text-left">
                      <th className="px-6 py-3 font-medium cursor-pointer" onClick={() => setCasesSort(s => ({ col: 'case_number', dir: s.col==='case_number' && s.dir==='asc' ? 'desc' : 'asc' }))}>Case #</th>
                      <th className="px-3 py-3 font-medium cursor-pointer" onClick={() => setCasesSort(s => ({ col: 'title', dir: s.col==='title' && s.dir==='asc' ? 'desc' : 'asc' }))}>Title</th>
                      <th className="px-3 py-3 font-medium cursor-pointer" onClick={() => setCasesSort(s => ({ col: 'customer_name', dir: s.col==='customer_name' && s.dir==='asc' ? 'desc' : 'asc' }))}>Customer</th>
                      <th className="px-3 py-3 font-medium cursor-pointer" onClick={() => setCasesSort(s => ({ col: 'campaign_name', dir: s.col==='campaign_name' && s.dir==='asc' ? 'desc' : 'asc' }))}>Campaign</th>
                      <th className="px-3 py-3 font-medium cursor-pointer" onClick={() => setCasesSort(s => ({ col: 'vertical_name', dir: s.col==='vertical_name' && s.dir==='asc' ? 'desc' : 'asc' }))}>Vertical</th>
                      <th className="px-3 py-3 font-medium cursor-pointer" onClick={() => setCasesSort(s => ({ col: 'stage', dir: s.col==='stage' && s.dir==='asc' ? 'desc' : 'asc' }))}>Stage</th>
                      <th className="px-3 py-3 font-medium cursor-pointer" onClick={() => setCasesSort(s => ({ col: 'created_at', dir: s.col==='created_at' && s.dir==='asc' ? 'desc' : 'asc' }))}>Created</th>
                      <th className="px-3 py-3 font-medium text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {casesDisplay.map(cs => (
                      <tr key={cs.id} className="border-t border-black/5 dark:border-white/5 hover:bg-black/5 dark:hover:bg-white/5">
                        <td className="px-6 py-3">
                          <a className="underline cursor-pointer" href={`/cases/${cs.id}`} onClick={(e)=>{ e.preventDefault(); setActiveTab('Cases'); setOpenCaseTabs(prev => prev.some(t=>t.id===cs.id) ? prev : [...prev, { id: cs.id, case_number: cs.case_number }]); setActiveCaseTabId(cs.id); }}>
                            {cs.case_number}
                          </a>
                        </td>
                        <td className="px-3 py-3 truncate max-w-[280px]" title={cs.title}>{cs.title}</td>
                        <td className="px-3 py-3">
                          <div className="font-medium truncate max-w-[240px]" title={cs.customer_name}>{cs.customer_name}</div>
                          <div className="opacity-60 text-xs truncate max-w-[240px]" title={cs.customer_email || cs.customer_phone || ''}>{cs.customer_email || cs.customer_phone || '—'}</div>
                        </td>
                        <td className="px-3 py-3">{cs.campaign_name || '—'}</td>
                        <td className="px-3 py-3">{cs.vertical_name || '—'}</td>
                        <td className="px-3 py-3">{cs.stage}</td>
                        <td className="px-3 py-3">{new Date(cs.created_at).toLocaleString()}</td>
                        <td className="px-3 py-3 text-right">
                          <button className="underline" onClick={(e)=>{ e.preventDefault(); setActiveTab('Cases'); setOpenCaseTabs(prev => prev.some(t=>t.id===cs.id) ? prev : [...prev, { id: cs.id, case_number: cs.case_number }]); setActiveCaseTabId(cs.id); }}>Open</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-2 flex items-center justify-between text-xs">
                <div>Showing {Math.min((casesPage - 1) * casesPageSize + 1, casesRows.length)}–{Math.min(casesPage * casesPageSize, casesRows.length)} of {casesRows.length}</div>
                <div className="flex items-center gap-2">
                  <Button variant="secondary" onClick={() => setCasesPage(p => Math.max(1, p - 1))} disabled={casesPage === 1}>Prev</Button>
                  <Button variant="secondary" onClick={() => setCasesPage(p => (p * casesPageSize < casesRows.length ? p + 1 : p))} disabled={casesPage * casesPageSize >= casesRows.length}>Next</Button>
                </div>
              </div>

              {openCaseTabs.length > 0 && (
                <div className="mt-4">
                  <div className="relative">
                    <button aria-label="Scroll left" className="absolute left-0 top-1/2 -translate-y-1/2 z-10 p-1 rounded-full border border-black/10 dark:border-white/10 bg-white dark:bg-black hidden md:block" onClick={()=> tabsScrollRef.current?.scrollBy({ left: -200, behavior: 'smooth' })}>
                      ◀
                    </button>
                    <div ref={tabsScrollRef} className="mx-8 md:mx-10 overflow-x-auto no-scrollbar">
                      <div className="flex items-center gap-2 min-w-max">
                        {openCaseTabs.map(tab => (
                          <div key={tab.id} className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border ${activeCaseTabId===tab.id ? 'bg-black text-white dark:bg-white dark:text-black' : 'bg-transparent'} border-black/10 dark:border-white/10`}> 
                            <button onClick={()=> setActiveCaseTabId(tab.id)} className="font-medium whitespace-nowrap">{tab.case_number}</button>
                            <button aria-label="Close" onClick={()=>{
                              setOpenCaseTabs(prev => prev.filter(t => t.id !== tab.id));
                              setActiveCaseTabId(prev => (prev===tab.id ? (openCaseTabs.filter(t=>t.id!==tab.id)[0]?.id ?? null) : prev));
                            }}>✕</button>
                          </div>
                        ))}
                      </div>
                    </div>
                    <button aria-label="Scroll right" className="absolute right-0 top-1/2 -translate-y-1/2 z-10 p-1 rounded-full border border-black/10 dark:border-white/10 bg-white dark:bg-black hidden md:block" onClick={()=> tabsScrollRef.current?.scrollBy({ left: 200, behavior: 'smooth' })}>
                      ▶
                    </button>
                  </div>
                  <div className="mt-3 rounded-xl border border-black/10 dark:border-white/10">
                    {activeCaseTabId != null ? (
                      <CaseDetail caseId={activeCaseTabId} embedded />
                    ) : (
                      <div className="p-4 text-sm opacity-70">Select a case tab to view details.</div>
                    )}
                  </div>
                </div>
              )}
            </CardBody>
          </Card>
        )}

        {/* Agent bulk set campaigns dialog */}
        <Dialog open={agentBulkOpen} onOpenChange={setAgentBulkOpen} title="Set campaigns for selected agents">
          <div className="space-y-3 text-sm">
            <label className="text-sm block">
              <span className="text-xs opacity-70">Filter by vertical (optional)</span>
              <Select value={agentBulkVerticalId} onChange={(e) => setAgentBulkVerticalId(e.target.value)}>
                <option value="">All</option>
                {verticals.map(v => <option key={v.id} value={String(v.id)}>{v.name}</option>)}
              </Select>
            </label>
            <div>
              <div className="text-xs opacity-70 mb-1">Select campaigns</div>
              <div className="max-h-48 overflow-auto rounded-lg border border-black/10 dark:border-white/10 p-2">
                {(campaigns.filter(c => agentBulkVerticalId ? String(c.vertical_id||'')===agentBulkVerticalId : true)).map(c => (
                  <label key={c.id} className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={agentBulkCampaignIds.includes(c.id)} onChange={(e) => setAgentBulkCampaignIds(prev => e.target.checked ? Array.from(new Set([...prev, c.id])) : prev.filter(id => id !== c.id))} />
                    <span>{c.name}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
          <DialogActions>
            <Button variant="secondary" onClick={() => setAgentBulkOpen(false)}>Cancel</Button>
            <Button onClick={async () => {
              const token = await getAccessToken(); if (!token) return;
              await Promise.allSettled(selectedAgentIds.map(id => fetch(`/api/admin/agents/${id}/campaigns`, { method: 'PUT', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify({ campaign_ids: agentBulkCampaignIds }) })));
              setAgentBulkOpen(false); setSelectedAgentIds([]);
            }}>Save</Button>
          </DialogActions>
        </Dialog>

        {/* Verticals management */}
        {activeTab === 'Verticals' && (
          <Card>
            <CardHeader title="Verticals" subtitle="Create, rename, or delete verticals" actions={
              <div className="hidden md:flex items-center gap-2">
                <Button variant="primary" onClick={() => { setAddVerticalName(''); setAddVerticalError(null); setAddVerticalOpen(true); }}>Add</Button>
              </div>
            } />
            <CardBody>
              <div className="rounded-xl border border-black/10 dark:border-white/10 max-h-[420px] overflow-auto">
              <table className="min-w-full table-auto text-sm">
                <thead>
                  <tr className="text-left">
                    <th className="px-6 py-3 font-medium cursor-pointer" onClick={() => setVerticalSort(s => ({ col: 'name', dir: s.dir==='asc' ? 'desc' : 'asc' }))}>Name</th>
                    <th className="px-3 py-3 text-right font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {([...verticals].sort((a,b)=> (a.name||'').localeCompare(b.name||'') * (verticalSort.dir==='asc'?1:-1))).slice(0, 1000).map(v => (
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
              </div>
            </CardBody>
          </Card>
        )}

        {/* Campaigns management */}
        {activeTab === 'Campaigns' && (
          <Card>
            <CardHeader title="Campaigns" subtitle="Create, reassign vertical, rename, or delete" actions={
              <div className="hidden md:flex items-center gap-2">
                <Button variant="primary" onClick={() => { setAddCampaignName(''); setAddCampaignVerticalId(''); setAddCampaignError(null); setAddCampaignOpen(true); }}>Add</Button>
              </div>
            } />
            <CardBody>
              <div className="rounded-xl border border-black/10 dark:border-white/10 max-h-[420px] overflow-auto">
              <table className="min-w-full table-auto text-sm">
                <thead>
                  <tr className="text-left">
                    <th className="px-6 py-3 font-medium cursor-pointer" onClick={() => setCampaignSort(s => ({ col: 'name', dir: s.col==='name' && s.dir==='asc' ? 'desc' : 'asc' }))}>Name</th>
                    <th className="px-3 py-3 font-medium cursor-pointer" onClick={() => setCampaignSort(s => ({ col: 'vertical', dir: s.col==='vertical' && s.dir==='asc' ? 'desc' : 'asc' }))}>Vertical</th>
                    <th className="px-3 py-3 text-right font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {([...campaigns].sort((a,b)=>{
                      if (campaignSort.col==='name') return (a.name||'').localeCompare(b.name||'') * (campaignSort.dir==='asc'?1:-1);
                      const av = (verticals.find(v=>v.id===a.vertical_id)?.name || '').toLowerCase();
                      const bv = (verticals.find(v=>v.id===b.vertical_id)?.name || '').toLowerCase();
                      return av.localeCompare(bv) * (campaignSort.dir==='asc'?1:-1);
                    })).slice(0, 1000).map(c => (
                    <tr key={c.id} className="border-t border-black/5 dark:border-white/5">
                      <td className="px-6 py-3">{c.name}</td>
                      <td className="px-3 py-3">{verticals.find(v => v.id === c.vertical_id)?.name || '—'}</td>
                      <td className="px-3 py-3 text-right">
                        <button className="underline mr-2" onClick={async () => {
                          const nm = prompt('Rename campaign', c.name) || ''; if (!nm.trim()) return;
                          const token = await getAccessToken(); if (!token) return;
                          await fetch(`/api/admin/campaigns/${c.id}`, { method: 'PUT', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify({ name: nm.trim() }) });
                          const cres = await fetch('/api/admin/campaigns', { headers: { authorization: `Bearer ${token}` }, cache: 'no-store' });
                          const cj = await cres.json().catch(() => null); if (cj && cj.ok) setCampaigns(cj.data.campaigns || []);
                        }}>Rename</button>
                        <button className="underline mr-2" onClick={() => { setSetVerticalOpenForCampaignId(c.id); setSetVerticalSelect(c.vertical_id ? String(c.vertical_id) : ''); setSetVerticalNewName(''); setSetVerticalError(null); }}>Set Vertical</button>
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
              </div>
            </CardBody>
          </Card>
        )}

        {/* Set Campaign Vertical Dialog */}
          <Dialog open={!!setVerticalOpenForCampaignId} onOpenChange={(o) => setSetVerticalOpenForCampaignId(o ? setVerticalOpenForCampaignId : null)} title="Set campaign vertical">
            <div className="space-y-3">
              {setVerticalError && <div className="text-sm text-red-600">{setVerticalError}</div>}
              <label className="text-sm block">
                <span className="text-xs opacity-70">Choose existing vertical</span>
                <Select value={setVerticalSelect} onChange={(e) => setSetVerticalSelect(e.target.value)}>
                  <option value="">No vertical</option>
                  {verticals.map(v => <option key={v.id} value={String(v.id)}>{v.name}</option>)}
                </Select>
              </label>
              <div className="text-xs opacity-70">Or create a new vertical</div>
              <Input placeholder="New vertical name (optional)" value={setVerticalNewName} onChange={(e) => setSetVerticalNewName(e.target.value)} />
            </div>
            <DialogActions>
              <Button variant="secondary" onClick={() => setSetVerticalOpenForCampaignId(null)}>Cancel</Button>
              <Button onClick={async () => {
                setSetVerticalError(null);
                const token = await getAccessToken(); if (!token) { setSetVerticalError('Not authorized'); return; }
                let verticalId: number | null = setVerticalSelect ? Number(setVerticalSelect) : null;
                const newName = setVerticalNewName.trim();
                try {
                  if (newName) {
                    const res = await fetch('/api/admin/verticals', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify({ name: newName }) });
                    const j = await res.json().catch(() => ({ ok: false }));
                    if (!j.ok) { setSetVerticalError(j?.error?.message || 'Failed to create vertical'); return; }
                    // refresh verticals list
                    const vres = await fetch('/api/admin/verticals', { headers: { authorization: `Bearer ${token}` }, cache: 'no-store' });
                    const vj = await vres.json().catch(() => null); if (vj && vj.ok) setVerticals(vj.data.verticals || []);
                    // find created id
                    const created = (vj?.data?.verticals || []).find((v: any) => v.name === newName);
                    verticalId = created ? Number(created.id) : verticalId;
                  }
                  if (setVerticalOpenForCampaignId != null) {
                    await fetch(`/api/admin/campaigns/${setVerticalOpenForCampaignId}`, { method: 'PUT', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify({ vertical_id: verticalId }) });
                    const cres = await fetch('/api/admin/campaigns', { headers: { authorization: `Bearer ${token}` }, cache: 'no-store' });
                    const cj = await cres.json().catch(() => null); if (cj && cj.ok) setCampaigns(cj.data.campaigns || []);
                  }
                  setSetVerticalOpenForCampaignId(null);
                } catch {
                  setSetVerticalError('Failed to save');
                }
              }}>Save</Button>
            </DialogActions>
        </Dialog>

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
              <div className="text-xs opacity-70">Or create a new vertical</div>
              <Input placeholder="New vertical name (optional)" value={addCampaignNewVerticalName} onChange={(e) => setAddCampaignNewVerticalName(e.target.value)} />
            </div>
            <DialogActions>
              <Button variant="secondary" onClick={() => setAddCampaignOpen(false)}>Cancel</Button>
              <Button onClick={async () => {
                setAddCampaignError(null);
                const name = addCampaignName.trim(); if (!name) { setAddCampaignError('Name required'); return; }
                const token = await getAccessToken(); if (!token) { setAddCampaignError('Not authorized'); return; }
                let verticalId: number | undefined = undefined;
                try {
                  const newName = addCampaignNewVerticalName.trim();
                  if (newName) {
                    const resV = await fetch('/api/admin/verticals', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify({ name: newName }) });
                    const jv = await resV.json().catch(() => ({ ok: false }));
                    if (!jv.ok) { setAddCampaignError(jv?.error?.message || 'Failed to create vertical'); return; }
                    const vres = await fetch('/api/admin/verticals', { headers: { authorization: `Bearer ${token}` }, cache: 'no-store' });
                    const vj = await vres.json().catch(() => null);
                    if (vj && vj.ok) setVerticals(vj.data.verticals || []);
                    const created = (vj?.data?.verticals || []).find((v: any) => v.name === newName);
                    verticalId = created ? Number(created.id) : undefined;
                  } else if (addCampaignVerticalId) {
                    verticalId = Number(addCampaignVerticalId);
                  }
                  const payload: any = { name };
                  if (verticalId !== undefined) payload.vertical_id = verticalId;
                  const res = await fetch('/api/admin/campaigns', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify(payload) });
                  const j = await res.json().catch(() => ({ ok: false }));
                  if (!j.ok) { setAddCampaignError(j?.error?.message || 'Failed to add'); return; }
                } catch {
                  setAddCampaignError('Failed to save'); return;
                }
                const cres = await fetch('/api/admin/campaigns', { headers: { authorization: `Bearer ${token}` }, cache: 'no-store' });
                const cj = await cres.json().catch(() => null); if (cj && cj.ok) setCampaigns(cj.data.campaigns || []);
                setAddCampaignOpen(false);
              }}>Save</Button>
            </DialogActions>
        </Dialog>

        {/* Customers Pane */}
        {activeTab === 'Customers' && (
            <CustomersPane
              query={query}
              setQuery={setQuery}
              vertical={vertical}
              setVertical={setVertical}
              campaign={campaign}
              setCampaign={setCampaign}
              uniqueVerticals={uniqueVerticals}
              uniqueCampaigns={uniqueCampaigns}
              filtered={filtered}
              agents={agents}
              verticals={verticals}
              campaigns={campaigns}
              addOpen={addOpen}
              setAddOpen={setAddOpen}
              addForm={addForm}
              setAddForm={setAddForm}
              setCounts={setCounts}
              setRows={setRows}
              setUniqueVerticals={setUniqueVerticals}
              setUniqueCampaigns={setUniqueCampaigns}
              getAccessToken={getAccessToken}
              openCaseForCustomer={async (customerId: number) => {
                const token = await getAccessToken(); if (!token) return;
                try {
                  const res = await fetch('/api/crm/cases', { method: 'POST', headers: { 'content-type':'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify({ customer_id: customerId }) });
                  const j = await res.json().catch(()=>null);
                  if (!j || !j.ok) { alert(j?.error?.message || 'Failed to create case'); return; }
                  setActiveTab('Cases');
                  setOpenCaseTabs(prev => prev.some((t:any)=>t.id===j.data.id) ? prev : [...prev, { id: j.data.id, case_number: j.data.case_number }]);
                  setActiveCaseTabId(j.data.id);
                } catch { alert('Failed to create case'); }
              }}
            />
        )}

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

        {/* Create AI Agent Dialog */}
        <Dialog open={aiOpen} onOpenChange={setAiOpen} title="Create AI Agent">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {aiError && <div className="md:col-span-2 text-sm text-red-600">{aiError}</div>}
            <Input placeholder="Username (a-z0-9_)" value={aiUsername} onChange={(e) => setAiUsername(e.target.value)} />
            <Select value={aiRole} onChange={(e) => setAiRole(e.target.value as any)}>
              <option value="agent">Agent</option>
              <option value="manager">Manager</option>
              <option value="lead">Lead</option>
            </Select>
            <textarea className="md:col-span-2 rounded-lg border px-3 py-2 bg-white dark:bg-gray-900 text-black dark:text-white border-black/10 dark:border-white/10 min-h-[120px]" placeholder="AI personality/system message" value={aiPersonality} onChange={(e)=>setAiPersonality(e.target.value)} />
          </div>
          <DialogActions>
            <Button variant="secondary" onClick={() => setAiOpen(false)}>Cancel</Button>
            <Button disabled={aiBusy!=='idle'} onClick={async () => {
              setAiError(null);
              const uname = aiUsername.trim().toLowerCase();
              if (!/^[a-z0-9_]{3,20}$/.test(uname)) { setAiError('Username must be 3-20 chars (a-z, 0-9, _)'); return; }
              setAiBusy('saving');
              try {
                const token = await getAccessToken(); if (!token) { setAiError('Not authorized'); return; }
                const res = await fetch('/api/admin/agents', { method: 'POST', headers: { 'content-type':'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify({ action: 'createAiAgent', username: uname, role: aiRole, personality: aiPersonality }) });
                const j = await res.json().catch(()=>null);
                if (!j || !j.ok) { setAiError(j?.error?.message || 'Failed to create AI agent'); return; }
                // reload agents
                try {
                  const qs = new URLSearchParams(); if (agentQ) qs.set('q', agentQ);
                  const resAgents = await fetch(`/api/admin/agents?sort=${agentSort.col}&dir=${agentSort.dir}&${qs.toString()}`, { headers: { authorization: `Bearer ${token}` } });
                  const ja = await resAgents.json().catch(() => null);
                  if (ja && ja.ok) setAgents(ja.data.agents || []);
                } catch {}
                setAiOpen(false);
              } finally { setAiBusy('idle'); }
            }}>{aiBusy==='saving' ? 'Creating…' : 'Create'}</Button>
          </DialogActions>
        </Dialog>

        {activeTab === 'Agents' && (
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
        )}
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