"use client";
import { useEffect, useMemo, useState } from "react";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";

export default function CasesIndexPage() {
  const [q, setQ] = useState('');
  const [rows, setRows] = useState<any[]>([]);
  useEffect(() => { (async () => {
    const token = await getAccessToken(); if (!token) return;
    const params = new URLSearchParams(); if (q) params.set('q', q);
    const res = await fetch(`/api/crm/cases?${params.toString()}`, { headers: { authorization: `Bearer ${token}` }, cache: 'no-store' });
    const j = await res.json().catch(()=>null); if (j && j.ok) setRows(j.data.cases || []);
  })(); }, [q]);

  const filtered = useMemo(() => rows, [rows]);

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
          <div className="overflow-auto -mx-6">
            <table className="min-w-full table-auto text-sm">
              <thead className="sticky top-0 bg-white/80 dark:bg-black/60 backdrop-blur">
                <tr className="text-left">
                  <th className="px-6 py-3 font-medium">Case #</th>
                  <th className="px-3 py-3 font-medium">Title</th>
                  <th className="px-3 py-3 font-medium">Stage</th>
                  <th className="px-3 py-3 font-medium">Customer</th>
                  <th className="px-3 py-3 font-medium">Campaign</th>
                  <th className="px-3 py-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r:any) => (
                  <tr key={r.id} className="border-t border-black/5 dark:border-white/5 hover:bg-black/5 dark:hover:bg-white/5">
                    <td className="px-6 py-3">{r.case_number}</td>
                    <td className="px-3 py-3">{r.title}</td>
                    <td className="px-3 py-3">{r.stage}</td>
                    <td className="px-3 py-3">{r.customer_name} · {r.customer_email}</td>
                    <td className="px-3 py-3">{r.campaign_name || '—'}</td>
                    <td className="px-3 py-3 text-right">
                      <a className="ml-2" title="Open" href={`/cases/${r.id}`}>🔍</a>
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


