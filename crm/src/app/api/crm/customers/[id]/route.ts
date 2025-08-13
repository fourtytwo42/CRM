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
  if (!(me.role === 'admin' || me.role === 'power')) {
    const row = db.prepare(`SELECT 1 FROM customer_campaigns cc JOIN agent_campaigns ac ON ac.campaign_id = cc.campaign_id WHERE cc.customer_id = ? AND ac.agent_user_id = ?`).get(id, me.id);
    if (!row) return jsonError('FORBIDDEN', { status: 403 });
  }
  const campaigns = db.prepare(`SELECT c.id, c.name, v.name as vertical FROM campaigns c LEFT JOIN verticals v ON v.id = c.vertical_id JOIN customer_campaigns cc ON cc.campaign_id = c.id WHERE cc.customer_id = ? ORDER BY v.name, c.name`).all(id);
  const tasks = db.prepare(`SELECT * FROM tasks WHERE customer_id = ? ORDER BY due_date ASC LIMIT 200`).all(id);
  const notes = db.prepare(`SELECT n.*, u.username as createdBy FROM notes n JOIN users u ON u.id = n.created_by_user_id WHERE n.customer_id = ? ORDER BY n.created_at DESC LIMIT 200`).all(id);
  const comms = db.prepare(`SELECT id, type, direction, subject, body, created_at, agent_user_id, campaign_id, message_id, in_reply_to, references_header FROM communications WHERE customer_id = ? ORDER BY created_at DESC LIMIT 200`).all(id);
  return jsonOk({ info, campaigns, tasks, notes, comms });
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


