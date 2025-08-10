import { NextRequest } from 'next/server';
import { getDb } from '@/lib/db';
import { jsonOk, jsonError } from '@/lib/http';
import { requireAuth } from '@/lib/guard';

export async function GET(req: NextRequest) {
  const me = await requireAuth(req);
  if (me.status !== 'active') return jsonError('FORBIDDEN', { status: 403 });
  const db = getDb();
  const url = new URL(req.url);
  const assigned = url.searchParams.get('assigned') || 'me'; // me|all
  const sql = assigned === 'all'
    ? `SELECT t.*, u.username as assignedTo FROM tasks t JOIN users u ON u.id = t.assigned_to_user_id ORDER BY t.due_date ASC LIMIT 200`
    : `SELECT t.*, u.username as assignedTo FROM tasks t JOIN users u ON u.id = t.assigned_to_user_id WHERE t.assigned_to_user_id = ? ORDER BY t.due_date ASC LIMIT 200`;
  const rows = assigned === 'all' ? db.prepare(sql).all() : db.prepare(sql).all(me.id);
  return jsonOk({ tasks: rows });
}

export async function POST(req: NextRequest) {
  const me = await requireAuth(req);
  if (!(me.role === 'admin' || me.role === 'power')) return jsonError('FORBIDDEN', { status: 403 });
  const db = getDb();
  const body = await req.json().catch(() => null);
  if (!body || !body.title || !body.assigned_to_user_id) return jsonError('VALIDATION', { status: 400 });
  const now = new Date().toISOString();
  const stmt = db.prepare(`INSERT INTO tasks (title, description, status, priority, due_date, created_at, created_by_user_id, assigned_to_user_id, campaign_id, customer_id) VALUES (?, ?, 'open', 'normal', ?, ?, ?, ?, ?, ?)`);
  const info = stmt.run(body.title, body.description || null, body.due_date || null, now, me.id, Number(body.assigned_to_user_id), body.campaign_id || null, body.customer_id || null);
  return jsonOk({ id: info.lastInsertRowid });
}


