import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { z } from 'zod';
import { jsonOk, jsonError, getClientIp } from '@/lib/http';
import { maybeSendEmail } from '@/lib/email';
import { randomUUID } from 'crypto';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code = (searchParams.get('code') || '').trim();
  if (!code) {
    const res = NextResponse.redirect(new URL('/', req.url));
    res.headers.set('Cache-Control', 'no-store');
    return res;
  }
  const db = getDb();
  const user = db.prepare('SELECT id, status, email_verification_sent_at FROM users WHERE email_verification_code = ?')
    .get(code) as { id: number; status: string; email_verification_sent_at?: string|null } | undefined;
  if (!user) {
    const res = NextResponse.redirect(new URL('/?verified=0', req.url));
    res.headers.set('Cache-Control', 'no-store');
    return res;
  }
  // Enforce expiration for verification codes (24h TTL)
  const TTL_MS = 24 * 60 * 60 * 1000;
  const sentAtMs = user.email_verification_sent_at ? new Date(user.email_verification_sent_at).getTime() : 0;
  if (!Number.isFinite(sentAtMs) || Date.now() - sentAtMs > TTL_MS) {
    const res = NextResponse.redirect(new URL('/?verified=0&expired=1', req.url));
    res.headers.set('Cache-Control', 'no-store');
    return res;
  }
  const now = new Date().toISOString();
  const newStatus = user.status === 'suspended' ? 'active' : user.status;
  // Do not bump token_version to avoid logging out existing sessions.
  db.prepare('UPDATE users SET email_verified_at = ?, email_verification_code = NULL, updated_at = ?, status = ? WHERE id = ?')
    .run(now, now, newStatus, user.id);
  {
    const res = NextResponse.redirect(new URL('/?verified=1', req.url));
    res.headers.set('Cache-Control', 'no-store');
    return res;
  }
}

// Resend initial account verification email (pre-login). Accepts username or email.
export async function POST(req: NextRequest) {
  const db = getDb();
  const site = db.prepare('SELECT email_verification_enabled FROM site_settings WHERE id = 1').get() as { email_verification_enabled?: number } | undefined;
  const verificationEnabled = !!(site && site.email_verification_enabled === 1);
  if (!verificationEnabled) return jsonError('DISABLED', { status: 400 });

  const Body = z.union([
    z.object({ username: z.string().min(3).max(20).regex(/^[a-z0-9_]+$/) }),
    z.object({ email: z.string().email().max(120) }),
  ]);
  const body = await req.json().catch(() => null);
  const parsed = Body.safeParse(body);
  if (!parsed.success) return jsonError('VALIDATION', { status: 400 });

  // Resolve user by username or email; avoid enumeration via generic success on miss/already verified
  const username = (parsed.data as any).username ? String((parsed.data as any).username).toLowerCase().trim() : null;
  const email = (parsed.data as any).email ? String((parsed.data as any).email).toLowerCase().trim() : null;
  const user = username
    ? (db.prepare('SELECT id, email, email_verified_at FROM users WHERE username = ?').get(username) as { id: number; email?: string | null; email_verified_at?: string | null } | undefined)
    : (db.prepare('SELECT id, email, email_verified_at FROM users WHERE email = ?').get(email) as { id: number; email?: string | null; email_verified_at?: string | null } | undefined);

  if (!user || user.email_verified_at) {
    // Generic success to avoid leaking existence/verification status
    return jsonOk();
  }

  const nowMs = Date.now();
  const DAY_MS = 24 * 60 * 60 * 1000;
  const windowStart = nowMs - (nowMs % DAY_MS);
  const ip = getClientIp(req);
  try {
    db.prepare(`
      INSERT INTO email_attempts (user_id, ip_address, window_start_ms, attempts, last_attempt_ms)
      VALUES (?, ?, ?, 1, ?)
      ON CONFLICT(user_id, ip_address, window_start_ms) DO UPDATE SET attempts = attempts + 1, last_attempt_ms = excluded.last_attempt_ms
    `).run(user.id, ip, windowStart, nowMs);
    const rowAttempts = db.prepare('SELECT attempts FROM email_attempts WHERE user_id = ? AND ip_address = ? AND window_start_ms = ?')
      .get(user.id, ip, windowStart) as { attempts: number } | undefined;
    const MAX_PER_DAY = 5;
    if ((rowAttempts?.attempts || 0) > MAX_PER_DAY) {
      const seconds = Math.max(1, Math.ceil((windowStart + DAY_MS - nowMs) / 1000));
      return jsonError('RATE_LIMIT', { status: 429, details: { seconds } });
    }
  } catch {}

  const code = randomUUID().replace(/-/g, '');
  const nowIso = new Date(nowMs).toISOString();
  db.prepare('UPDATE users SET email_verification_code = ?, email_verification_sent_at = ?, updated_at = ? WHERE id = ?')
    .run(code, nowIso, nowIso, user.id);

  try {
    const url = new URL('/api/auth/verify', req.url);
    url.searchParams.set('code', code);
    await maybeSendEmail(
      user.email || '',
      'Verify your email',
      `Click to verify: ${url.toString()}`,
      `<p>Click to verify your account:</p><p><a href="${url.toString()}">${url.toString()}</a></p>`
    );
  } catch {}

  return jsonOk();
}


