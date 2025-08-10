import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { jsonError } from '@/lib/http';

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
  // Direct to onboarding (profile) to choose username/avatar/password
  const res = NextResponse.redirect(new URL('/profile?onboarding=1', req.url));
  res.headers.set('Cache-Control', 'no-store');
  return res;
}


