import { NextRequest } from 'next/server';
import { getDb } from '@/lib/db';
import { requireAuth } from '@/lib/guard';
import { jsonOk, jsonError, methodNotAllowed } from '@/lib/http';

export const runtime = 'nodejs';

function canManage(role: string) {
  return role === 'admin' || role === 'power' || role === 'manager';
}

export async function GET(req: NextRequest) {
  const me = await requireAuth(req);
  if (me.status !== 'active') return jsonError('FORBIDDEN', { status: 403 });
  const db = getDb();
  const rows = db.prepare('SELECT id, name, created_at, updated_at FROM verticals ORDER BY name ASC').all();
  const campaigns = db.prepare(`SELECT id, name, vertical_id FROM campaigns`).all();
  const agentVerticals = db.prepare(`SELECT agent_user_id as user_id, vertical_id FROM agent_verticals`).all();
  const managers = db.prepare(`SELECT id FROM users WHERE role='manager'`).all();
  const leads = db.prepare(`SELECT id FROM users WHERE role='lead'`).all();
  const agents = db.prepare(`SELECT id FROM users WHERE role='agent'`).all();
  return jsonOk({ verticals: rows, meta: { campaigns, agent_verticals: agentVerticals, managers, leads, agents } });
}

export async function POST(req: NextRequest) {
  const me = await requireAuth(req);
  if (!canManage(me.role)) return jsonError('FORBIDDEN', { status: 403 });
  const body = await req.json().catch(() => null) as { name?: string };
  const name = String(body?.name || '').trim();
  if (!name) return jsonError('VALIDATION', { status: 400, message: 'Name required' });
  const db = getDb();
  const now = new Date().toISOString();
  try {
    db.prepare('INSERT INTO verticals (name, created_at, updated_at) VALUES (?, ?, ?)').run(name, now, now);
  } catch (e: any) {
    return jsonError('UNIQUENESS', { status: 409, message: 'Vertical already exists' });
  }
  return jsonOk();
}

export function PUT() { return methodNotAllowed(['GET','POST']); }
export function DELETE() { return methodNotAllowed(['GET','POST']); }

