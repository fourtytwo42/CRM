import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { requireAdmin } from '@/lib/guard';
import { jsonOk, jsonError, methodNotAllowed } from '@/lib/http';

export const runtime = 'nodejs';

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requireAdmin(req);
  } catch {
    return jsonError('FORBIDDEN', { status: 403 });
  }

  const body = await req.json().catch(() => null) as { role?: string };
  const role = body?.role;
  if (!role || !['admin','power','user'].includes(role)) return jsonError('VALIDATION', { status: 400, message: 'Invalid role' });

  const db = getDb();
  const user = db.prepare('SELECT id, role FROM users WHERE id = ?').get(Number(params.id)) as any;
  if (!user) return jsonError('NOT_FOUND', { status: 404, message: 'User not found' });

  // Prevent demoting the last admin
  if (user.role === 'admin' && role !== 'admin') {
    const adminCount = db.prepare("SELECT COUNT(*) as c FROM users WHERE role = 'admin'").get() as { c: number };
    if (adminCount.c <= 1) {
      return jsonError('LAST_ADMIN', { status: 400, message: 'Cannot demote the last admin.' });
    }
  }

  const nowIso = new Date().toISOString();
  db.prepare('UPDATE users SET role = ?, token_version = token_version + 1, updated_at = ? WHERE id = ?').run(role, nowIso, Number(params.id));
  // Revoke existing refresh tokens on privilege change
  db.prepare('UPDATE refresh_tokens SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL').run(nowIso, Number(params.id));
  return jsonOk();
}

export function GET() {
  return methodNotAllowed(['PUT']);
}


