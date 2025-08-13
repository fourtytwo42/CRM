import { NextRequest } from 'next/server';
import { getDb } from '@/lib/db';
import { requireAuth } from '@/lib/guard';
import { jsonOk, jsonError, methodNotAllowed } from '@/lib/http';

export const runtime = 'nodejs';

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const me = await requireAuth(req);
  if (!(me.role === 'admin' || me.role === 'power' || me.role === 'manager' || me.role === 'lead')) return jsonError('FORBIDDEN', { status: 403 });
  const db = getDb();
  const id = Number(params.id);
  const body = await req.json().catch(()=>null) as { personality?: string; status?: 'active'|'suspended'|'banned'; username?: string } | null;
  if (!body) return jsonError('VALIDATION', { status: 400 });
  const now = new Date().toISOString();
  const u = db.prepare(`SELECT id, is_ai FROM users WHERE id = ?`).get(id) as any;
  if (!u || !u.is_ai) return jsonError('NOT_FOUND', { status: 404 });
  if (typeof body.username === 'string' && body.username.trim()) {
    const uname = body.username.trim().toLowerCase();
    const exists = db.prepare(`SELECT id FROM users WHERE username = ? AND id != ?`).get(uname, id) as any;
    if (exists) return jsonError('VALIDATION', { status: 400, message: 'Username taken' });
    db.prepare(`UPDATE users SET username = ?, updated_at = ? WHERE id = ?`).run(uname, now, id);
  }
  if (typeof body.personality === 'string') {
    db.prepare(`UPDATE users SET ai_personality = ?, updated_at = ? WHERE id = ?`).run(body.personality, now, id);
  }
  if (body.status === 'active' || body.status === 'suspended' || body.status === 'banned') {
    db.prepare(`UPDATE users SET status = ?, updated_at = ? WHERE id = ?`).run(body.status, now, id);
  }
  return jsonOk();
}

export function GET() { return methodNotAllowed(['PUT']); }
export function POST() { return methodNotAllowed(['PUT']); }
export function DELETE() { return methodNotAllowed(['PUT']); }


