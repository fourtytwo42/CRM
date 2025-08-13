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
  const info = db.prepare(`SELECT id, username, email, role, status, is_ai, ai_personality, created_at, last_login_at, last_seen_at FROM users WHERE id = ?`).get(id);
  if (!info) return jsonError('NOT_FOUND', { status: 404 });
  const campaigns = db.prepare(`
    SELECT c.id, c.name, v.name as vertical
    FROM agent_campaigns ac JOIN campaigns c ON c.id = ac.campaign_id
    LEFT JOIN verticals v ON v.id = c.vertical_id
    WHERE ac.agent_user_id = ? ORDER BY v.name, c.name
  `).all(id);
  const verticals = db.prepare(`
    SELECT v.id, v.name
    FROM agent_verticals av JOIN verticals v ON v.id = av.vertical_id
    WHERE av.agent_user_id = ? ORDER BY v.name
  `).all(id);
  const tasks = db.prepare(`SELECT id, title, status, priority, due_date FROM tasks WHERE assigned_to_user_id = ? ORDER BY created_at DESC LIMIT 200`).all(id);
  const notes = db.prepare(`SELECT n.id, n.body, n.created_at, u.username as createdBy FROM notes n JOIN users u ON u.id = n.created_by_user_id WHERE n.agent_user_id = ? ORDER BY n.created_at DESC LIMIT 200`).all(id);
  return jsonOk({ info, campaigns, verticals, tasks, notes });
}

export function PUT() { return methodNotAllowed(['GET']); }
export function POST() { return methodNotAllowed(['GET']); }
export function DELETE() { return methodNotAllowed(['GET']); }


