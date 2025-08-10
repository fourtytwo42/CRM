import { NextRequest } from 'next/server';
import { getDb } from '@/lib/db';
import { requireAuth } from '@/lib/guard';
import { jsonOk, jsonError, methodNotAllowed } from '@/lib/http';

export const runtime = 'nodejs';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const me = await requireAuth(req);
  if (me.status !== 'active') return jsonError('FORBIDDEN', { status: 403 });
  const db = getDb();
  const id = Number(params.id);
  const info = db.prepare('SELECT id, username, email, role, status FROM users WHERE id = ?').get(id) as any;
  if (!info) return jsonError('NOT_FOUND', { status: 404 });
  const tasks = db.prepare('SELECT id, title, status, priority, due_date FROM tasks WHERE assigned_to_user_id = ? ORDER BY created_at DESC LIMIT 100').all(id);
  const notes = db.prepare(`
    SELECT n.id, n.body, n.created_at, u.username as createdBy
    FROM notes n JOIN users u ON u.id = n.created_by_user_id
    WHERE n.agent_user_id = ? ORDER BY n.created_at DESC LIMIT 100
  `).all(id);
  const campaigns = db.prepare(`
    SELECT c.id, c.name, v.name as vertical
    FROM agent_campaigns ac JOIN campaigns c ON c.id = ac.campaign_id
    LEFT JOIN verticals v ON v.id = c.vertical_id
    WHERE ac.agent_user_id = ? ORDER BY v.name, c.name
  `).all(id);
  return jsonOk({ info, tasks, notes, campaigns });
}

export function PUT() { return methodNotAllowed(['GET']); }
export function POST() { return methodNotAllowed(['GET']); }
export function DELETE() { return methodNotAllowed(['GET']); }
import { NextRequest } from 'next/server';
import { getDb } from '@/lib/db';
import { jsonOk, jsonError } from '@/lib/http';
import { requireAuth } from '@/lib/guard';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const me = await requireAuth(req);
  if (me.status !== 'active') return jsonError('FORBIDDEN', { status: 403 });
  const db = getDb();
  const id = Number(params.id);
  const info = db.prepare(`SELECT id, username, email, role, status, created_at, last_login_at, last_seen_at FROM users WHERE id = ?`).get(id);
  if (!info) return jsonError('NOT_FOUND', { status: 404 });
  const campaigns = db.prepare(`SELECT c.id, c.name, v.name as vertical FROM campaigns c JOIN verticals v ON v.id = c.vertical_id JOIN agent_campaigns ac ON ac.campaign_id = c.id WHERE ac.agent_user_id = ? ORDER BY v.name, c.name`).all(id);
  const tasks = db.prepare(`SELECT * FROM tasks WHERE assigned_to_user_id = ? ORDER BY due_date ASC LIMIT 200`).all(id);
  const notes = db.prepare(`SELECT n.*, u.username as createdBy FROM notes n JOIN users u ON u.id = n.created_by_user_id WHERE n.agent_user_id = ? ORDER BY n.created_at DESC LIMIT 200`).all(id);
  return jsonOk({ info, campaigns, tasks, notes });
}


