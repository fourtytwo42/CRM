import { NextRequest } from 'next/server';
import { getDb } from '@/lib/db';
import { jsonOk, jsonError } from '@/lib/http';
import { requireAuth } from '@/lib/guard';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const me = await requireAuth(req);
  if (!(me.role === 'admin' || me.role === 'power')) return jsonError('FORBIDDEN', { status: 403 });
  const db = getDb();
  const body = await req.json().catch(() => null);
  if (!body || !body.title) return jsonError('VALIDATION', { status: 400 });
  const now = new Date().toISOString();
  const assignedId = Number(params.id);
  const stmt = db.prepare(`INSERT INTO tasks (title, description, status, priority, due_date, created_at, created_by_user_id, assigned_to_user_id, campaign_id, customer_id) VALUES (?, ?, 'open', 'normal', ?, ?, ?, ?, ?, ?)`);
  const info = stmt.run(body.title, body.description || null, body.due_date || null, now, me.id, assignedId, body.campaign_id || null, body.customer_id || null);
  return jsonOk({ id: info.lastInsertRowid });
}


