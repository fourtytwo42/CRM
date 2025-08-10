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
  const rows = db.prepare('SELECT id, vertical_id, name, status, created_at, updated_at FROM campaigns ORDER BY name ASC').all();
  return jsonOk({ campaigns: rows });
}

export async function POST(req: NextRequest) {
  const me = await requireAuth(req);
  if (!canManage(me.role)) return jsonError('FORBIDDEN', { status: 403 });
  const body = await req.json().catch(() => null) as { name?: string; vertical_id?: number|null };
  const name = String(body?.name || '').trim();
  const verticalId = body?.vertical_id == null ? null : Number(body.vertical_id);
  if (!name) return jsonError('VALIDATION', { status: 400, message: 'Name required' });
  const db = getDb();
  const now = new Date().toISOString();
  db.prepare('INSERT INTO campaigns (vertical_id, name, status, created_at, updated_at) VALUES (?, ?, "active", ?, ?)').run(verticalId, name, now, now);
  return jsonOk();
}

export function PUT() { return methodNotAllowed(['GET','POST']); }
export function DELETE() { return methodNotAllowed(['GET','POST']); }

