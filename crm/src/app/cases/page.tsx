"use client";
import { useEffect, useMemo, useState } from "react";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";

export default function CasesIndexPage() {
  const [q, setQ] = useState('');
  const [rows, setRows] = useState<any[]>([]);
  const [checkedIds, setCheckedIds] = useState<number[]>([]);
  const [selected, setSelected] = useState<any | null>(null);
  
  useEffect(() => { (async () => {
    const token = await getAccessToken(); if (!token) return;
    const params = new URLSearchParams(); if (q) params.set('q', q);
    const res = await fetch(`/api/crm/cases?${params.toString()}`, { headers: { authorization: `Bearer ${token}` }, cache: 'no-store' });
    const j = await res.json().catch(()=>null); if (j && j.ok) setRows(j.data.cases || []);
  })(); }, [q]);

  const filtered = useMemo(() => rows, [rows]);
  const allChecked = rows.length > 0 && checkedIds.length === rows.length;

  const handleDeleteCase = async (caseId: number) => {
    if (!confirm('Are you sure you want to delete this case?')) return;
    
    const token = await getAccessToken();
    if (!token) return;
    
    try {
      const res = await fetch(`/api/crm/cases/${caseId}`, { 
        method: 'DELETE', 
        headers: { authorization: `Bearer ${token}` } 
      });
      
      if (res.ok) {
        setRows(prev => prev.filter(r => r.id !== caseId));
        setCheckedIds(prev => prev.filter(id => id !== caseId));
        if (selected && selected.id === caseId) setSelected(null);
      } else {
        alert('Failed to delete case');
      }
    } catch (error) {
      alert('Error deleting case');
    }
  };

  const handleBulkDelete = async () => {
    if (!confirm(`Are you sure you want to delete ${checkedIds.length} selected case(s)?`)) return;
    
    const token = await getAccessToken();
    if (!token) return;
    
    try {
      const res = await fetch('/api/crm/cases', { 
        method: 'DELETE', 
        headers: { 
          'content-type': 'application/json', 
          authorization: `Bearer ${token}` 
        }, 
        body: JSON.stringify({ ids: checkedIds }) 
      });
      
      if (res.ok) {
        setRows(prev => prev.filter(r => !checkedIds.includes(r.id)));
        if (selected && checkedIds.includes(selected.id)) setSelected(null);
        setCheckedIds([]);
      } else {
        alert('Failed to delete cases');
      }
    } catch (error) {
      alert('Error deleting cases');
    }
  };

  return (
    <main className="container-hero py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Cases</h1>
      </div>
      <Card>
        <CardHeader title="Search Cases" />
        <CardBody>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
            <Input placeholder="Search by case number, name, email, phone, campaign" value={q} onChange={(e)=>setQ(e.target.value)} />
          </div>
          
          {/* Bulk actions */}
          {checkedIds.length > 0 && (
            <div className="mb-4 flex items-center gap-2">
              <Button variant="destructive" onClick={handleBulkDelete}>
                Delete {checkedIds.length} selected
              </Button>
            </div>
          )}
          
          <div className="overflow-auto -mx-6">
            <table className="min-w-full table-auto text-sm">
              <thead className="sticky top-0 bg-white/80 dark:bg-black/60 backdrop-blur">
                <tr className="text-left">
                  <th className="px-6 py-3">
                    <input 
                      type="checkbox" 
                      className="size-4" 
                      checked={allChecked} 
                      onChange={(e) => {
                        setCheckedIds(e.target.checked ? rows.map((r) => r.id) : []);
                      }} 
                    />
                  </th>
                  <th className="px-3 py-3 font-medium">Case #</th>
                  <th className="px-3 py-3 font-medium">Stage</th>
                  <th className="px-3 py-3 font-medium">Customer</th>
                  <th className="px-3 py-3 font-medium">Campaign</th>
                  <th className="px-3 py-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r:any) => (
                  <tr key={r.id} className="border-t border-black/5 dark:border-white/5 hover:bg-black/5 dark:hover:bg-white/5">
                    <td className="px-6 py-3">
                      <input 
                        type="checkbox" 
                        className="size-4" 
                        checked={checkedIds.includes(r.id)} 
                        onChange={(e) => {
                          setCheckedIds(prev => 
                            e.target.checked 
                              ? [...prev, r.id]
                              : prev.filter(id => id !== r.id)
                          );
                        }} 
                      />
                    </td>
                    <td className="px-3 py-3">
                      <a 
                        href={`/cases/${r.id}`} 
                        className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 underline"
                      >
                        {r.case_number}
                      </a>
                    </td>
                    <td className="px-3 py-3">{r.stage}</td>
                    <td className="px-3 py-3">{r.customer_name} · {r.customer_email}</td>
                    <td className="px-3 py-3">{r.campaign_name || '—'}</td>
                    <td className="px-3 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <a 
                          className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300" 
                          title="Open case" 
                          href={`/cases/${r.id}`}
                        >
                          🔍
                        </a>
                        <button 
                          className="text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300" 
                          title="Delete case"
                          onClick={() => handleDeleteCase(r.id)}
                        >
                          🗑️
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardBody>
      </Card>
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


