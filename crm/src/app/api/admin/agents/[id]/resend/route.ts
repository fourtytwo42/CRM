import { NextRequest } from 'next/server';
import { jsonOk, jsonError, methodNotAllowed } from '@/lib/http';
import { getDb } from '@/lib/db';
import { requireAuth } from '@/lib/guard';
import { randomUUID } from 'crypto';
import { maybeSendEmail } from '@/lib/email';

export const runtime = 'nodejs';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const me = await requireAuth(req);
  if (!(me.role === 'admin' || me.role === 'power')) return jsonError('FORBIDDEN', { status: 403 });
  const userId = Number(params.id);
  if (!Number.isFinite(userId) || userId <= 0) return jsonError('VALIDATION', { status: 400, message: 'Invalid id' });
  const db = getDb();
  const user = db.prepare('SELECT id, email, email_verification_code, status FROM users WHERE id = ?').get(userId) as { id: number; email?: string | null; email_verification_code?: string | null; status: string } | undefined;
  if (!user) return jsonError('NOT_FOUND', { status: 404, message: 'User not found' });
  const email = (user.email || '').trim();
  if (!email) return jsonError('VALIDATION', { status: 400, message: 'User has no email' });
  const now = new Date().toISOString();
  // Always generate a fresh code to avoid stale/expired codes
  const code = randomUUID().replace(/-/g, '');
  db.prepare('UPDATE users SET email_verification_code = ?, email_verification_sent_at = ?, updated_at = ? WHERE id = ?').run(code, now, now, userId);

  try {
    const url = new URL('/api/auth/invite', req.url);
    url.searchParams.set('code', code);
    const html = `<p>You have been invited. Click to verify and complete your account:</p><p><a href="${url.toString()}">${url.toString()}</a></p>`;
    const sent = await maybeSendEmail(
      email,
      'You are invited — complete your account',
      `Finish setup: ${url.toString()}`,
      html
    );
    try { db.prepare(`CREATE TABLE IF NOT EXISTS email_outbox (id INTEGER PRIMARY KEY AUTOINCREMENT, to_email TEXT, subject TEXT, body TEXT, created_at TEXT NOT NULL, sent INTEGER)`).run(); } catch {}
    try { db.prepare(`ALTER TABLE email_outbox ADD COLUMN sent INTEGER`).run(); } catch {}
    db.prepare(`INSERT INTO email_outbox (to_email, subject, body, created_at, sent) VALUES (?, ?, ?, ?, ?)`)
      .run(email, 'You are invited — complete your account', html, new Date().toISOString(), sent ? 1 : 0);
    return jsonOk({ sent });
  } catch (e: any) {
    return jsonError('SEND_FAILED', { status: 500, message: e?.message || 'Failed to send invite' });
  }
}

export function GET() {
  return methodNotAllowed(['POST']);
}


