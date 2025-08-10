import { NextRequest } from 'next/server';
import { jsonOk, jsonError } from '@/lib/http';
import { getDb } from '@/lib/db';
import { requireAuth } from '@/lib/guard';
import { randomUUID } from 'crypto';
import bcrypt from 'bcryptjs';
import { maybeSendEmail } from '@/lib/email';

export async function POST(req: NextRequest) {
  const me = await requireAuth(req);
  if (!(me.role === 'admin' || me.role === 'power')) return jsonError('FORBIDDEN', { status: 403 });
  const db = getDb();
  const body = await req.json().catch(() => null) as { email?: string; role?: 'agent'|'manager'|'lead' } | null;
  const email = String(body?.email || '').toLowerCase().trim();
  const role = (body?.role || 'agent');
  if (!email) return jsonError('VALIDATION', { status: 400, message: 'Email required' });
  if (!['agent','manager','lead'].includes(role)) return jsonError('VALIDATION', { status: 400, message: 'Invalid role' });

  const exists = db.prepare('SELECT id FROM users WHERE email = ?').get(email) as { id: number } | undefined;
  if (exists) return jsonError('EMAIL_TAKEN', { status: 409, message: 'An account with that email already exists.' });

  const code = randomUUID().replace(/-/g, '');
  const now = new Date().toISOString();
  const placeholderUsername = `agent_${code.slice(0, 8)}`;
  const placeholderHash = await bcrypt.hash('Temporary123!'+code.slice(0, 6), 10);

  db.prepare(`
    INSERT INTO users (username, email, password_hash, role, status, email_verification_code, email_verification_sent_at, created_at, updated_at)
    VALUES (?, ?, ?, ?, 'suspended', ?, ?, ?, ?)
  `).run(placeholderUsername, email, placeholderHash, role, code, now, now, now);

  const url = new URL('/api/auth/invite', req.url);
  url.searchParams.set('code', code);
  const html = `<p>You have been invited. Click to verify and complete your account:</p><p><a href="${url.toString()}">${url.toString()}</a></p>`;
  const ok = await maybeSendEmail(
    email,
    'You are invited — complete your account',
    `Finish setup: ${url.toString()}`,
    html
  );
  try {
    // Always store an outbox record for visibility
    try { db.prepare(`CREATE TABLE IF NOT EXISTS email_outbox (id INTEGER PRIMARY KEY AUTOINCREMENT, to_email TEXT, subject TEXT, body TEXT, created_at TEXT NOT NULL, sent INTEGER)`).run(); } catch {}
    try { db.prepare(`ALTER TABLE email_outbox ADD COLUMN sent INTEGER`).run(); } catch {}
    db.prepare(`INSERT INTO email_outbox (to_email, subject, body, created_at, sent) VALUES (?, ?, ?, ?, ?)`)
      .run(email, 'You are invited — complete your account', html, new Date().toISOString(), ok ? 1 : 0);
  } catch {}

  return jsonOk({ sent: ok });
}


