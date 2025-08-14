import { NextRequest } from 'next/server';
import { getDb } from '@/lib/db';
import { jsonOk, jsonError } from '@/lib/http';
import { requireAuth } from '@/lib/guard';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const me = await requireAuth(req);
  if (me.status !== 'active') return jsonError('FORBIDDEN', { status: 403 });
  const db = getDb();
  const id = Number(params.id);
  const info = db.prepare(`SELECT * FROM customers WHERE id = ?`).get(id);
  if (!info) return jsonError('NOT_FOUND', { status: 404 });
  // Access control: if agent, only customers in their campaigns
  if (!(me.role === 'admin' || me.role === 'power' || me.role === 'manager' || me.role === 'lead')) {
    const row = db.prepare(`SELECT 1 FROM customer_campaigns cc JOIN agent_campaigns ac ON ac.campaign_id = cc.campaign_id WHERE cc.customer_id = ? AND ac.agent_user_id = ?`).get(id, me.id);
    if (!row) return jsonError('FORBIDDEN', { status: 403 });
  }
  const campaigns = db.prepare(`SELECT c.id, c.name, v.name as vertical FROM campaigns c LEFT JOIN verticals v ON v.id = c.vertical_id JOIN customer_campaigns cc ON cc.campaign_id = c.id WHERE cc.customer_id = ? ORDER BY v.name, c.name`).all(id);
  const tasks = db.prepare(`SELECT * FROM tasks WHERE customer_id = ? ORDER BY due_date ASC LIMIT 200`).all(id);
  const notes = db.prepare(`SELECT n.*, u.username as createdBy FROM notes n JOIN users u ON u.id = n.created_by_user_id WHERE n.customer_id = ? ORDER BY n.created_at DESC LIMIT 200`).all(id);
  const comms = db.prepare(`SELECT id, type, direction, subject, body, created_at, agent_user_id, campaign_id, case_id, message_id, in_reply_to, references_header FROM communications WHERE customer_id = ? ORDER BY created_at DESC LIMIT 200`).all(id);
  const cases = db.prepare(`SELECT id, case_number, title, stage, created_at FROM cases WHERE customer_id = ? ORDER BY created_at DESC`).all(id);
  return jsonOk({ info, campaigns, tasks, notes, comms, cases });
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const me = await requireAuth(req);
  if (me.status !== 'active') return jsonError('FORBIDDEN', { status: 403 });
  // Allow admin, power, manager, lead; agents can only edit customers in their campaigns
  const db = getDb();
  const id = Number(params.id);
  const exists = db.prepare(`SELECT * FROM customers WHERE id = ?`).get(id) as any;
  if (!exists) return jsonError('NOT_FOUND', { status: 404 });
  if (!(me.role === 'admin' || me.role === 'power' || me.role === 'manager' || me.role === 'lead')) {
    const row = db.prepare(`SELECT 1 FROM customer_campaigns cc JOIN agent_campaigns ac ON ac.campaign_id = cc.campaign_id WHERE cc.customer_id = ? AND ac.agent_user_id = ?`).get(id, me.id);
    if (!row) return jsonError('FORBIDDEN', { status: 403 });
  }
  const body = await req.json().catch(() => null) as any;
  if (!body) return jsonError('VALIDATION', { status: 400 });
  const first_name = (body.first_name ?? '').toString().trim() || null;
  const last_name = (body.last_name ?? '').toString().trim() || null;
  const email = (body.email ?? '').toString().trim() || null;
  const phone = (body.phone ?? '').toString().trim() || null;
  const street1 = (body.street1 ?? '').toString().trim() || null;
  const street2 = (body.street2 ?? '').toString().trim() || null;
  const city = (body.city ?? '').toString().trim() || null;
  const state = (body.state ?? '').toString().trim() || null;
  const zip = (body.zip ?? '').toString().trim() || null;
  const company = (body.company ?? '').toString().trim() || null;
  const title = (body.title ?? '').toString().trim() || null;
  const notes = (body.notes ?? '').toString().trim() || null;
  const status = ['lead','active','inactive','archived'].includes(body?.status) ? body.status : exists.status;
  // Require at least one contact method
  if (!email && !phone) return jsonError('VALIDATION', { status: 400, message: 'Email or phone is required.' });
  let full_name = (body.full_name ?? '').toString().trim();
  if (!full_name && (first_name || last_name)) full_name = [first_name, last_name].filter(Boolean).join(' ').trim();
  if (!full_name && email) full_name = email.split('@')[0];
  if (!full_name && phone) full_name = phone;
  const preferred_contact = email ? 'email' : (phone ? 'phone' : 'none');
  const now = new Date().toISOString();
  try {
    db.prepare(`
      UPDATE customers SET
        first_name=?, last_name=?, full_name=?, email=?, phone=?,
        street1=?, street2=?, city=?, state=?, zip=?,
        company=?, title=?, notes=?, status=?, preferred_contact=?, updated_at=?
      WHERE id = ?
    `).run(
      first_name, last_name, full_name || null, email, phone,
      street1, street2, city, state, zip,
      company, title, notes, status, preferred_contact, now,
      id
    );
  } catch (e: any) {
    const msg = (e?.message || '').toLowerCase();
    if (msg.includes('unique') && msg.includes('customers') && msg.includes('email')) {
      return jsonError('UNIQUENESS', { status: 409, message: 'Email already used by another customer.' });
    }
    return jsonError('FAILED', { status: 500, message: 'Failed to update customer.' });
  }
  const info = db.prepare(`SELECT * FROM customers WHERE id = ?`).get(id);
  const campaigns = db.prepare(`SELECT c.id, c.name, v.name as vertical FROM campaigns c LEFT JOIN verticals v ON v.id = c.vertical_id JOIN customer_campaigns cc ON cc.campaign_id = c.id WHERE cc.customer_id = ? ORDER BY v.name, c.name`).all(id);
  const tasks = db.prepare(`SELECT * FROM tasks WHERE customer_id = ? ORDER BY due_date ASC LIMIT 200`).all(id);
  const notesRows = db.prepare(`SELECT n.*, u.username as createdBy FROM notes n JOIN users u ON u.id = n.created_by_user_id WHERE n.customer_id = ? ORDER BY n.created_at DESC LIMIT 200`).all(id);
  const comms = db.prepare(`SELECT id, type, direction, subject, body, created_at, agent_user_id, campaign_id, case_id, message_id, in_reply_to, references_header FROM communications WHERE customer_id = ? ORDER BY created_at DESC LIMIT 200`).all(id);
  const cases = db.prepare(`SELECT id, case_number, title, stage, created_at FROM cases WHERE customer_id = ? ORDER BY created_at DESC`).all(id);
  return jsonOk({ info, campaigns, tasks, notes: notesRows, comms, cases });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const me = await requireAuth(req);
  if (!(me.role === 'admin' || me.role === 'power')) return jsonError('FORBIDDEN', { status: 403 });
  const db = getDb();
  const id = Number(params.id);
  db.prepare(`DELETE FROM customer_campaigns WHERE customer_id = ?`).run(id);
  db.prepare(`DELETE FROM tasks WHERE customer_id = ?`).run(id);
  db.prepare(`DELETE FROM notes WHERE customer_id = ?`).run(id);
  db.prepare(`DELETE FROM communications WHERE customer_id = ?`).run(id);
  db.prepare(`DELETE FROM customers WHERE id = ?`).run(id);
  return jsonOk();
}


