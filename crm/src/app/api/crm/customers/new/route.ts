import { NextRequest } from 'next/server';
import { getDb } from '@/lib/db';
import { jsonOk, jsonError } from '@/lib/http';
import { requireAuth } from '@/lib/guard';

export async function POST(req: NextRequest) {
  const me = await requireAuth(req);
  const isElevated = me.role === 'admin' || me.role === 'power';
  const db = getDb();
  const body = await req.json().catch(() => null);
  if (!body) return jsonError('VALIDATION', { status: 400 });
  const first_name = (body.first_name || '').trim() || null;
  const last_name = (body.last_name || '').trim() || null;
  const email = (body.email || '').trim() || null;
  const phone = (body.phone || '').trim() || null;
  const street1 = (body.street1 || '').trim() || null;
  const street2 = (body.street2 || '').trim() || null;
  const city = (body.city || '').trim() || null;
  const state = (body.state || '').trim() || null;
  const zip = (body.zip || '').trim() || null;
  // Require at least one contact method for creation
  if (!email && !phone) return jsonError('VALIDATION', { status: 400, message: 'Email or phone is required.' });
  let full_name = (body.full_name || '').trim();
  if (!full_name && (first_name || last_name)) full_name = [first_name, last_name].filter(Boolean).join(' ').trim();
  if (!full_name && email) full_name = email.split('@')[0];
  if (!full_name && phone) full_name = phone;
  const now = new Date().toISOString();
  const preferred = email ? 'email' : 'phone';
  const stmt = db.prepare(`INSERT INTO customers (first_name, last_name, full_name, email, phone, street1, street2, city, state, zip, company, title, notes, status, preferred_contact, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'lead', ?, ?, ?)`);
  const info = stmt.run(
    first_name,
    last_name,
    full_name || null,
    email,
    phone,
    street1,
    street2,
    city,
    state,
    zip,
    body.company || null,
    body.title || null,
    body.notes || null,
    preferred,
    now,
    now
  );
  const customerId = Number(info.lastInsertRowid);
  if (!customerId) return jsonError('FAILED', { status: 500 });
  // Assign to a campaign
  const campaignId = Number(body.campaign_id);
  if (campaignId) {
    // If agent, ensure they are part of the campaign
    if (!isElevated) {
      const can = db.prepare(`SELECT 1 FROM agent_campaigns WHERE agent_user_id = ? AND campaign_id = ?`).get(me.id, campaignId);
      if (!can) return jsonError('FORBIDDEN', { status: 403 });
    }
    db.prepare(`INSERT OR IGNORE INTO customer_campaigns (customer_id, campaign_id, assigned_at) VALUES (?, ?, ?)`).run(customerId, campaignId, now);
  }
  return jsonOk({ id: customerId });
}


