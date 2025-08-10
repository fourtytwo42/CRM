import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { createAccessToken } from '@/lib/auth';
import { env } from '@/lib/env';
import { createHash, randomUUID } from 'crypto';
import { jsonOk, jsonError, getClientIp, methodNotAllowed } from '@/lib/http';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const db = getDb();
  const body = await req.json().catch(() => null);
  const provided = String(body?.refreshToken || '');
  if (!provided) {
    return NextResponse.json(
      { ok: false, error: { code: 'NO_REFRESH', message: 'Missing refresh token.' } },
      { status: 400, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  const hash = createHash('sha256').update(provided).digest('hex');
  // Basic rate limit on refresh attempts per token_hash+ip per 5 minutes
  const nowMs = Date.now();
  const WINDOW_MS = 5 * 60 * 1000;
  const windowStart = nowMs - (nowMs % WINDOW_MS);
  const ip = getClientIp(req);
  try {
    db.prepare(`
      INSERT INTO refresh_attempts (token_hash, ip_address, window_start_ms, attempts, last_attempt_ms)
      VALUES (?, ?, ?, 1, ?)
      ON CONFLICT(token_hash, ip_address, window_start_ms) DO UPDATE SET attempts = attempts + 1, last_attempt_ms = excluded.last_attempt_ms
    `).run(hash, ip, windowStart, nowMs);
    const attempts = db.prepare('SELECT attempts FROM refresh_attempts WHERE token_hash = ? AND ip_address = ? AND window_start_ms = ?')
      .get(hash, ip, windowStart) as { attempts: number } | undefined;
    const MAX_ATTEMPTS = 30;
    if ((attempts?.attempts || 0) > MAX_ATTEMPTS) {
      const seconds = Math.max(1, Math.ceil((windowStart + WINDOW_MS - nowMs) / 1000));
      return jsonError('RATE_LIMIT', { status: 429, details: { seconds } });
    }
  } catch {}
  const record = db
    .prepare('SELECT id, user_id, expires_at, revoked_at FROM refresh_tokens WHERE token_hash = ?')
    .get(hash) as { id: number; user_id: number; expires_at: string; revoked_at?: string | null } | undefined;
  if (!record) {
    return jsonError('INVALID_REFRESH', { status: 401, message: 'Invalid refresh token.' });
  }
  if (record.revoked_at) {
    // Suspected token reuse; revoke entire session chain defensively
    db.prepare('UPDATE refresh_tokens SET revoked_at = COALESCE(revoked_at, ?) WHERE id = ? OR replaced_by_token_id = ?')
      .run(new Date().toISOString(), record.id, record.id);
    return jsonError('REVOKED', { status: 401, message: 'Refresh token revoked.' });
  }
  if (new Date(record.expires_at).getTime() < Date.now()) {
    return jsonError('EXPIRED', { status: 401, message: 'Refresh token expired.' });
  }

  const user = db
    .prepare('SELECT id, username, role, status, token_version, email, avatar_url, theme_preference FROM users WHERE id = ?')
    .get(record.user_id) as any;
  if (!user) {
    return jsonError('UNKNOWN_USER', { status: 401, message: 'User not found.' });
  }
  if (user.status === 'banned') {
    return jsonError('BANNED', { status: 403, message: 'Your account is banned.' });
  }
  if (user.status === 'suspended') {
    return jsonError('SUSPENDED', { status: 403, message: 'Your account is suspended.' });
  }

  const accessToken = await createAccessToken({
    sub: String(user.id),
    username: user.username,
    role: user.role,
    status: user.status,
    ver: user.token_version,
    jti: randomUUID(),
  });

  const newRefresh = randomUUID() + randomUUID(); // 64-char token
  const newHash = createHash('sha256').update(newRefresh).digest('hex');
  const now = new Date();
  const expiresAt = new Date(now.getTime() + env.refreshTokenDays * 24 * 60 * 60 * 1000);

  // Rotate
  const insert = db.prepare(`INSERT INTO refresh_tokens (user_id, token_hash, created_at, expires_at, user_agent, ip_address) VALUES (?, ?, ?, ?, ?, ?)`);
  const info = insert.run(
    user.id,
    newHash,
    now.toISOString(),
    expiresAt.toISOString(),
    req.headers.get('user-agent') || null,
    (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || null
  );
  // Mark last_used_at on the old token since it was just used
  db.prepare('UPDATE refresh_tokens SET last_used_at = ? WHERE id = ?').run(now.toISOString(), record.id);
  db.prepare('UPDATE refresh_tokens SET revoked_at = ?, replaced_by_token_id = ? WHERE id = ?').run(now.toISOString(), info.lastInsertRowid, record.id);

  // Update presence without bumping token_version to avoid unnecessary token churn
  db.prepare('UPDATE users SET last_seen_at = ?, updated_at = ? WHERE id = ?')
    .run(now.toISOString(), now.toISOString(), user.id);

  const profile = {
    id: user.id,
    username: user.username,
    email: user.email,
    email_verified_at: user.email_verified_at,
    role: user.role,
    status: user.status,
    avatar_url: user.avatar_url,
    theme_preference: user.theme_preference,
  };

  return jsonOk({ accessToken, refreshToken: newRefresh, user: profile });
}

export function GET() {
  return methodNotAllowed(['POST']);
}


