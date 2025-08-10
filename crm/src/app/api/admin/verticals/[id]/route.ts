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
  const body = await req.json().catch(() => null) as { name?: string };
  const name = String(body?.name || '').trim();
  if (!name) return jsonError('VALIDATION', { status: 400, message: 'Name required' });
  const db = getDb();
  const now = new Date().toISOString();
  db.prepare('UPDATE verticals SET name = ?, updated_at = ? WHERE id = ?').run(name, now, Number(params.id));
  return jsonOk();
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const me = await requireAuth(req);
  if (!canManage(me.role)) return jsonError('FORBIDDEN', { status: 403 });
  const db = getDb();
  db.prepare('DELETE FROM verticals WHERE id = ?').run(Number(params.id));
  return jsonOk();
}

export function GET() { return methodNotAllowed(['PUT','DELETE']); }

