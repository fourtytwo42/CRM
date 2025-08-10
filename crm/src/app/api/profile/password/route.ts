import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/guard';
import { getDb } from '@/lib/db';
import bcrypt from 'bcryptjs';
import { jsonOk, jsonError, methodNotAllowed } from '@/lib/http';
import { createAccessToken } from '@/lib/auth';
import { createHash, randomUUID } from 'crypto';
import { env } from '@/lib/env';

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
    const hasExisting = typeof full.password_hash === 'string' && full.password_hash.length > 0;
    if (hasExisting) {
      const ok = await bcrypt.compare(String(body?.currentPassword || ''), full.password_hash);
      if (!ok) return jsonError('INVALID_CURRENT', { status: 400 });
    }
    const hash = await bcrypt.hash(newPassword, 10);
    const nowIso = new Date().toISOString();
    db.prepare('UPDATE users SET password_hash = ?, token_version = token_version + 1, updated_at = ? WHERE id = ?').run(hash, nowIso, user.id);
    // Revoke all existing refresh tokens for this user to prevent session continuation
    db.prepare('UPDATE refresh_tokens SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL').run(nowIso, user.id);
    // Issue new refresh + access token to keep user signed in
    const refreshToken = randomUUID() + randomUUID();
    const refreshHash = createHash('sha256').update(refreshToken).digest('hex');
    const now = new Date();
    const expiresAt = new Date(now.getTime() + env.refreshTokenDays * 24 * 60 * 60 * 1000);
    db.prepare(`INSERT INTO refresh_tokens (user_id, token_hash, created_at, expires_at) VALUES (?, ?, ?, ?)`)
      .run(user.id, refreshHash, now.toISOString(), expiresAt.toISOString());
    const profile = db.prepare('SELECT id, username, email, role, status, avatar_url, theme_preference, token_version FROM users WHERE id = ?').get(user.id) as any;
    const accessToken = await createAccessToken({
      sub: String(profile.id),
      username: profile.username,
      role: profile.role,
      status: profile.status,
      ver: profile.token_version,
      jti: randomUUID(),
    });
    return jsonOk({ accessToken, refreshToken, user: profile });
  } catch (e: any) {
    return jsonError(e?.message || 'UNAUTHORIZED', { status: 401 });
  }
}

export function GET() {
  return methodNotAllowed(['PUT']);
}


