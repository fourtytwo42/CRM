import { NextRequest } from 'next/server';
import { getDb } from '@/lib/db';
import { requireAuth } from '@/lib/guard';
import { jsonOk, jsonError, methodNotAllowed } from '@/lib/http';

export const runtime = 'nodejs';

function canManage(role: string) {
  return role === 'admin' || role === 'power' || role === 'manager';
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const me = await requireAuth(req);
  if (!canManage(me.role)) return jsonError('FORBIDDEN', { status: 403 });
  const body = await req.json().catch(() => null) as { name?: string; status?: 'active'|'paused'|'archived'; vertical_id?: number|null };
  const name = (body?.name || '').trim();
  const status = body?.status;
  const verticalId = body?.vertical_id == null ? null : Number(body.vertical_id);
  if (!name && !status && body?.vertical_id === undefined) return jsonError('VALIDATION', { status: 400, message: 'Nothing to update' });
  const db = getDb();
  const now = new Date().toISOString();
  const sets: string[] = []; const args: any[] = [];
  if (name) { sets.push('name = ?'); args.push(name); }
  if (status && ['active','paused','archived'].includes(status)) { sets.push('status = ?'); args.push(status); }
  if (body?.vertical_id !== undefined) { sets.push('vertical_id = ?'); args.push(verticalId); }
  sets.push('updated_at = ?'); args.push(now, Number(params.id));
  db.prepare(`UPDATE campaigns SET ${sets.join(', ')} WHERE id = ?`).run(...args);
  return jsonOk();
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const me = await requireAuth(req);
  if (!canManage(me.role)) return jsonError('FORBIDDEN', { status: 403 });
  const db = getDb();
  db.prepare('DELETE FROM campaigns WHERE id = ?').run(Number(params.id));
  return jsonOk();
}

export function GET() { return methodNotAllowed(['PUT','DELETE']); }

