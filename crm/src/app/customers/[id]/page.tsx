"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";

export default function CustomerDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = Number(params?.id);
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const token = await getAccessToken();
      if (!token) return;
      const res = await fetch(`/api/crm/customers/${id}`, { headers: { authorization: `Bearer ${token}` } });
      const json = await res.json().catch(() => null);
      if (!json || !json.ok) { setError('Not authorized or not found'); return; }
      setData(json.data);
    })();
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
            <CardHeader title="Communications" />
            <CardBody>
              <div className="space-y-3 text-sm">
                {(data.comms || []).map((m: any) => (
                  <div key={m.id} className="p-3 rounded-lg border border-black/5 dark:border-white/10">
                    <div className="opacity-70 text-xs">{m.type} · {m.direction} · {new Date(m.created_at).toLocaleString()}</div>
                    <div className="font-medium">{m.subject || '(no subject)'}</div>
                    <div className="opacity-80 whitespace-pre-wrap">{m.body || ''}</div>
                  </div>
                ))}
              </div>
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
              <div className="space-y-2">
                <Input placeholder="Subject" />
                <textarea className="w-full min-h-28 rounded-lg border px-3 py-2 bg-white dark:bg-gray-900 text-black dark:text-white border-black/10 dark:border-white/10" placeholder="Message" />
                <div className="flex justify-end"><Button>Send</Button></div>
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


