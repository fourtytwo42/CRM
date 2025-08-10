import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/guard';
import { getDb } from '@/lib/db';
import bcrypt from 'bcryptjs';
import { jsonOk, jsonError, methodNotAllowed } from '@/lib/http';

export const runtime = 'nodejs';

export async function PUT(req: NextRequest) {
  try {
    const user = await requireAuth(req);
    if (user.status === 'suspended') return jsonError('SUSPENDED', { status: 403, message: 'Account suspended; cannot change password.' });
    const body = await req.json().catch(() => null) as { currentPassword?: string; newPassword?: string };
    const newPassword = String(body?.newPassword || '');
    // Enforce minimum strength server-side
    if (newPassword.length < 8 || !/[A-Za-z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
      return jsonError('WEAK_PASSWORD', { status: 400, message: 'Password must be at least 8 characters and include letters and numbers.' });
    }
    const db = getDb();
    const full = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(user.id) as { password_hash: string } | undefined;
    if (!full) return jsonError('UNKNOWN_USER', { status: 400 });
    const ok = await bcrypt.compare(String(body?.currentPassword || ''), full.password_hash);
    if (!ok) return jsonError('INVALID_CURRENT', { status: 400 });
    const hash = await bcrypt.hash(newPassword, 10);
    const nowIso = new Date().toISOString();
    db.prepare('UPDATE users SET password_hash = ?, token_version = token_version + 1, updated_at = ? WHERE id = ?').run(hash, nowIso, user.id);
    // Revoke all existing refresh tokens for this user to prevent session continuation
    db.prepare('UPDATE refresh_tokens SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL').run(nowIso, user.id);
    return jsonOk();
  } catch (e: any) {
    return jsonError(e?.message || 'UNAUTHORIZED', { status: 401 });
  }
}

export function GET() {
  return methodNotAllowed(['PUT']);
}


