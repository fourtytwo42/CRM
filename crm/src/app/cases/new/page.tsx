"use client";
import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";

export default function NewCasePage() {
  const params = useSearchParams();
  const router = useRouter();
  const customerId = Number(params.get('customer') || '0') || 0;
  const [customer, setCustomer] = useState<any>(null);
  const [title, setTitle] = useState('New Case');
  const [saving, setSaving] = useState<'idle'|'saving'>('idle');
  useEffect(() => { (async () => {
    if (!customerId) return;
    const token = await getAccessToken(); if (!token) return;
    const res = await fetch(`/api/crm/customers/${customerId}`, { headers: { authorization: `Bearer ${token}` } });
    const j = await res.json().catch(()=>null); if (j && j.ok) setCustomer(j.data.info || null);
  })(); }, [customerId]);
  return (
    <main className="container-hero py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">New Case</h1>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader title="Case Details" />
            <CardBody>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                <label className="text-sm block">
                  <span className="text-xs opacity-70">Title</span>
                  <Input value={title} onChange={(e)=>setTitle(e.target.value)} />
                </label>
                <label className="text-sm block">
                  <span className="text-xs opacity-70">Customer</span>
                  <Input value={customer ? `${customer.full_name} · ${customer.email || ''}` : ''} disabled />
                </label>
              </div>
              <div className="mt-4 flex justify-end">
                <Button disabled={saving!=='idle' || !customerId} onClick={async ()=>{
                  setSaving('saving');
                  try {
                    const token = await getAccessToken(); if (!token) return;
                    const res = await fetch('/api/crm/cases', { method: 'POST', headers: { 'content-type':'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify({ customer_id: customerId, title }) });
                    const j = await res.json().catch(()=>null);
                    if (!j || !j.ok) { alert(j?.error?.message || 'Failed'); return; }
                    router.push(`/cases/${j.data.id}`);
                  } finally { setSaving('idle'); }
                }}>{saving==='saving' ? 'Creating…' : 'Create Case'}</Button>
              </div>
            </CardBody>
          </Card>
        </div>
        <div className="space-y-6">
          <Card>
            <CardHeader title="Customer (readonly)" />
            <CardBody>
              {!customer ? (
                <div className="text-sm opacity-70">Loading…</div>
              ) : (
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="opacity-70">Name</div>
                  <div>{customer.full_name}</div>
                  <div className="opacity-70">Email</div>
                  <div>{customer.email || '—'}</div>
                  <div className="opacity-70">Phone</div>
                  <div>{customer.phone || '—'}</div>
                </div>
              )}
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


