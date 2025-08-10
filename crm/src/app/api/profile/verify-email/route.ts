import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code = (searchParams.get('code') || '').trim();
  if (!code) {
    const res = NextResponse.redirect(new URL('/profile?verified=0', req.url));
    res.headers.set('Cache-Control', 'no-store');
    return res;
  }
  const db = getDb();
  const user = db.prepare('SELECT id, new_email, new_email_verification_sent_at FROM users WHERE new_email_verification_code = ?')
    .get(code) as { id: number; new_email?: string|null; new_email_verification_sent_at?: string|null } | undefined;
  if (!user || !user.new_email) {
    const res = NextResponse.redirect(new URL('/profile?verified=0', req.url));
    res.headers.set('Cache-Control', 'no-store');
    return res;
  }
  // Enforce expiration for verification codes (24h TTL)
  const TTL_MS = 24 * 60 * 60 * 1000;
  const sentAtMs = user.new_email_verification_sent_at ? new Date(user.new_email_verification_sent_at).getTime() : 0;
  if (!Number.isFinite(sentAtMs) || Date.now() - sentAtMs > TTL_MS) {
    const expiredUrl = new URL('/profile?verified=0&expired=1', req.url);
    const res = NextResponse.redirect(expiredUrl);
    res.headers.set('Cache-Control', 'no-store');
    return res;
  }
  const now = new Date().toISOString();
  // Mark email as verified when confirming the new address. Do not bump token_version to preserve sessions.
  db.prepare('UPDATE users SET email = new_email, email_verified_at = ?, new_email = NULL, new_email_verification_code = NULL, new_email_verification_sent_at = NULL, updated_at = ? WHERE id = ?')
    .run(now, now, user.id);
  // Broadcast to any open tabs to update profile display
  const response = NextResponse.redirect(new URL('/profile?verified=1', req.url));
  response.headers.set('Cache-Control', 'no-store');
  return response;
}


