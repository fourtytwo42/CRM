import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export const runtime = 'nodejs';

function normalizePhone(n: string): string {
  const d = (n || '').replace(/[^0-9+]/g, '');
  return d.startsWith('+') ? d : (d ? `+${d}` : '');
}

export async function POST(req: NextRequest) {
  const db = getDb();
  const url = new URL(req.url);
  const token = (url.searchParams.get('token') || '').trim();
  const row = db.prepare('SELECT inbound_token FROM telephony_settings WHERE id = 1').get() as { inbound_token?: string | null } | undefined;
  if (!row?.inbound_token || token !== row.inbound_token) {
    return new NextResponse('forbidden', { status: 403, headers: { 'Cache-Control': 'no-store' } });
  }

  let body: any = null;
  let contentType = req.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    body = await req.json().catch(() => null);
  } else if (contentType.includes('application/x-www-form-urlencoded') || contentType.includes('multipart/form-data')) {
    const form = await req.formData();
    body = Object.fromEntries(Array.from(form.entries()).map(([k, v]) => [k, typeof v === 'string' ? v : String(v)]));
  }
  if (!body) return new NextResponse('bad request', { status: 400, headers: { 'Cache-Control': 'no-store' } });

  // Support BulkVS-style keys: fromDID/toDID/body  and Twilio-style: From/To/Body
  const from = normalizePhone(body.fromDID || body.From || body.from || '');
  const to = normalizePhone(body.toDID || body.To || body.to || '');
  const text = String(body.body || body.Body || '').trim();
  if (!from || !text) return new NextResponse('ok', { status: 200, headers: { 'Cache-Control': 'no-store' } });

  const nowIso = new Date().toISOString();
  // Find or create customer by phone
  let customer = db.prepare('SELECT id FROM customers WHERE phone = ?').get(from) as { id: number } | undefined;
  if (!customer) {
    const stmt = db.prepare(`INSERT INTO customers (first_name, last_name, full_name, email, phone, street1, street2, city, state, zip, company, title, notes, status, preferred_contact, created_at, updated_at)
      VALUES (NULL, NULL, ?, NULL, ?, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'Inbound auto-created', 'lead', 'phone', ?, ?)`);
    const info = stmt.run(from, from, nowIso, nowIso);
    customer = { id: Number(info.lastInsertRowid) };
  }

  db.prepare(`INSERT INTO communications (type, direction, subject, body, customer_id, agent_user_id, campaign_id, created_at)
    VALUES ('message', 'in', ?, ?, ?, NULL, NULL, ?)`)
    .run(to ? `SMS to ${to}` : 'SMS', text, customer.id, nowIso);

  return new NextResponse('ok', { status: 200, headers: { 'Cache-Control': 'no-store' } });
}

export function GET() { return new NextResponse('method not allowed', { status: 405 }); }


