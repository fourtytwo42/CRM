import { NextRequest } from 'next/server';
import { getDb } from '@/lib/db';
import { jsonOk, jsonError } from '@/lib/http';
import { requireAuth } from '@/lib/guard';

export async function POST(req: NextRequest) {
  const me = await requireAuth(req);
  const isElevated = me.role === 'admin' || me.role === 'power';
  const db = getDb();
  const body = await req.json().catch(() => null);
  if (!body || !body.full_name) return jsonError('VALIDATION', { status: 400 });
  const now = new Date().toISOString();
  const stmt = db.prepare(`INSERT INTO customers (first_name, last_name, full_name, email, phone, company, title, notes, status, preferred_contact, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'lead', 'email', ?, ?)`);
  const info = stmt.run(body.first_name || null, body.last_name || null, body.full_name, body.email || null, body.phone || null, body.company || null, body.title || null, body.notes || null, now, now);
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


