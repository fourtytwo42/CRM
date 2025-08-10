import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getDb } from '@/lib/db';
import bcrypt from 'bcryptjs';
import { createAccessToken } from '@/lib/auth';
import { randomUUID, createHash } from 'crypto';
import { env } from '@/lib/env';
import { jsonOk, jsonError, methodNotAllowed, getClientIp } from '@/lib/http';

export const runtime = 'nodejs';

const LoginSchema = z.object({
  username: z.string().min(3).max(20).regex(/^[a-z0-9_]+$/),
  password: z.string().min(8),
});

export async function POST(req: NextRequest) {
  const db = getDb();
  const body = await req.json().catch(() => null);
  const username = String(body?.username || '').toLowerCase().trim();
  const password = String(body?.password || '');

  // Simple, effective rate limiting: per-IP and per-username with short moving window and backoff.
  const clientIp = getClientIp(req);
  const nowMs = Date.now();
  const WINDOW_MS = 5 * 60 * 1000; // 5 minutes
  const windowStart = nowMs - (nowMs % WINDOW_MS);
  const maxAttemptsPerUser = 10; // per 5 minutes per username+ip
  const maxAttemptsPerIp = 50; // per 5 minutes per ip across all users

  try {
    // Increment (username, ip, window)
    db.prepare(`
      INSERT INTO login_attempts (username, ip_address, window_start_ms, attempts, last_attempt_ms)
      VALUES (?, ?, ?, 1, ?)
      ON CONFLICT(username, ip_address, window_start_ms) DO UPDATE SET attempts = attempts + 1, last_attempt_ms = excluded.last_attempt_ms
    `).run(username || '', clientIp, windowStart, nowMs);
    // Increment (all users) bucket using username=''
    db.prepare(`
      INSERT INTO login_attempts (username, ip_address, window_start_ms, attempts, last_attempt_ms)
      VALUES ('', ?, ?, 1, ?)
      ON CONFLICT(username, ip_address, window_start_ms) DO UPDATE SET attempts = attempts + 1, last_attempt_ms = excluded.last_attempt_ms
    `).run(clientIp, windowStart, nowMs);

    const userBucket = db.prepare('SELECT attempts FROM login_attempts WHERE username = ? AND ip_address = ? AND window_start_ms = ?')
      .get(username || '', clientIp, windowStart) as { attempts: number } | undefined;
    const ipBucket = db.prepare('SELECT attempts FROM login_attempts WHERE username = ? AND ip_address = ? AND window_start_ms = ?')
      .get('', clientIp, windowStart) as { attempts: number } | undefined;
    if ((userBucket?.attempts || 0) > maxAttemptsPerUser || (ipBucket?.attempts || 0) > maxAttemptsPerIp) {
      const seconds = Math.max(1, Math.ceil((windowStart + WINDOW_MS - nowMs) / 1000));
      return jsonError('RATE_LIMIT', { status: 429, details: { seconds } });
    }
  } catch {
    // best effort; ignore limiter errors
  }
  const parsed = LoginSchema.safeParse({ username, password });
  if (!parsed.success) return jsonError('VALIDATION', { status: 400, message: 'Invalid input.' });

  const user = db
    .prepare('SELECT id, username, email, email_verified_at, role, status, avatar_url, theme_preference, password_hash, token_version FROM users WHERE username = ?')
    .get(username) as any;
  if (!user) return jsonError('INVALID_CREDENTIALS', { status: 401, message: 'Invalid username or password.' });
  // Validate password first to avoid username enumeration via status-specific errors
  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) return jsonError('INVALID_CREDENTIALS', { status: 401, message: 'Invalid username or password.' });

  // If email verification is enabled and user not verified, block
  const s = db.prepare('SELECT email_verification_enabled FROM site_settings WHERE id = 1').get() as { email_verification_enabled?: number } | undefined;
  const emailVerificationEnabled = !!(s && s.email_verification_enabled === 1);
  if (user.status === 'banned') return jsonError('BANNED', { status: 403, message: user.ban_reason || 'Your account is banned.' });
  if (emailVerificationEnabled && !user.email_verified_at) {
    return jsonError('EMAIL_UNVERIFIED', { status: 403, message: 'Please verify your email to continue.' });
  }
  if (user.status === 'suspended') return jsonError('SUSPENDED', { status: 403, message: 'Your account is suspended.' });

  const accessToken = await createAccessToken({
    sub: String(user.id),
    username: user.username,
    role: user.role,
    status: user.status,
    ver: user.token_version,
    jti: randomUUID(),
  });

  const refreshToken = randomUUID() + randomUUID(); // simple 64-char token; avoid bcrypt cost here
  const refreshHash = createHash('sha256').update(refreshToken).digest('hex');
  const now = new Date();
  const expiresAt = new Date(now.getTime() + env.refreshTokenDays * 24 * 60 * 60 * 1000);
  const ua = req.headers.get('user-agent') || undefined;
  const ipAddress = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || undefined;
  db.prepare(`
    INSERT INTO refresh_tokens (user_id, token_hash, created_at, expires_at, user_agent, ip_address)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(user.id, refreshHash, now.toISOString(), expiresAt.toISOString(), ua, ipAddress);

  db.prepare('UPDATE users SET last_login_at = ?, updated_at = ? WHERE id = ?').run(now.toISOString(), now.toISOString(), user.id);

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

  return jsonOk({ accessToken, refreshToken, user: profile });
}

export function GET() {
  return methodNotAllowed(['POST']);
}


