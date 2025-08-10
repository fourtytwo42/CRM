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

  const body = await req.json().catch(() => null) as { status?: 'active'|'suspended'|'banned', reason?: string };
  const status = body?.status;
  if (!status || !['active','suspended','banned'].includes(status)) return jsonError('VALIDATION', { status: 400, message: 'Invalid status' });

  const db = getDb();
  const user = db.prepare('SELECT id, role FROM users WHERE id = ?').get(Number(params.id)) as any;
  if (!user) return jsonError('NOT_FOUND', { status: 404, message: 'User not found' });

  // Prevent banning or suspending the last admin
  if (user.role === 'admin' && (status === 'banned' || status === 'suspended')) {
    const adminCount = db.prepare("SELECT COUNT(*) as c FROM users WHERE role = 'admin'").get() as { c: number };
    if (adminCount.c <= 1) {
      return jsonError('LAST_ADMIN', { status: 400, message: 'Cannot change status of the last admin.' });
    }
  }

  const nowIso = new Date().toISOString();
  db.prepare('UPDATE users SET status = ?, ban_reason = ?, token_version = token_version + 1, updated_at = ? WHERE id = ?')
    .run(status, status === 'banned' ? (body?.reason || null) : null, nowIso, Number(params.id));
  // Revoke all refresh tokens when status changes to suspended or banned
  if (status === 'suspended' || status === 'banned') {
    db.prepare('UPDATE refresh_tokens SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL').run(nowIso, Number(params.id));
  }
  return jsonOk();
}

export function GET() {
  return methodNotAllowed(['PUT']);
}


