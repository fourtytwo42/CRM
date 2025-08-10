import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { jsonError } from '@/lib/http';
import { env } from '@/lib/env';
import { randomUUID, createHash } from 'crypto';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code = (searchParams.get('code') || '').trim();
  if (!code) return NextResponse.redirect(new URL('/?verified=0', req.url));
  const db = getDb();
  const user = db.prepare('SELECT id, email, status FROM users WHERE email_verification_code = ?').get(code) as { id: number; email?: string; status: string } | undefined;
  if (!user) return NextResponse.redirect(new URL('/?verified=0', req.url));
  const now = new Date().toISOString();
  db.prepare('UPDATE users SET email_verified_at = ?, email_verification_code = NULL, status = ? WHERE id = ?').run(now, user.status === 'suspended' ? 'active' : user.status, user.id);
  // Create a refresh token so the onboarding page can authenticate automatically
  try {
    const refreshToken = randomUUID() + randomUUID();
    const refreshHash = createHash('sha256').update(refreshToken).digest('hex');
    const nowDate = new Date();
    const expiresAt = new Date(nowDate.getTime() + env.refreshTokenDays * 24 * 60 * 60 * 1000);
    const db2 = getDb();
    db2.prepare(`INSERT INTO refresh_tokens (user_id, token_hash, created_at, expires_at) VALUES (?, ?, ?, ?)`)
      .run(user.id, refreshHash, nowDate.toISOString(), expiresAt.toISOString());
    // Direct to onboarding (profile) with refresh token param to seed session
    const baseUrl = (process.env.PUBLIC_BASE_URL || '').trim() || req.url;
    const u = new URL('/profile', baseUrl);
    u.searchParams.set('onboarding', '1');
    u.searchParams.set('rt', refreshToken);
    const res = NextResponse.redirect(u);
    res.headers.set('Cache-Control', 'no-store');
    return res;
  } catch {}
  // Fallback redirect without token
  const res = NextResponse.redirect(new URL('/profile?onboarding=1', req.url));
  res.headers.set('Cache-Control', 'no-store');
  return res;
}


