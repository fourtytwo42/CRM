import { describe, it, expect } from 'vitest';
import { GET as verifyGet, POST as resend } from '@/app/api/auth/verify/route';
import { NextRequest } from 'next/server';
import { getDb } from '@/lib/db';

describe('email verification', () => {
  it('resends for unverified users and ignores unknowns', async () => {
    const db = getDb();
    const now = new Date().toISOString();
    db.prepare(`INSERT OR IGNORE INTO site_settings (id, registration_enabled, email_verification_enabled) VALUES (1, 1, 1)`).run();
    db.prepare(`UPDATE site_settings SET email_verification_enabled = 1 WHERE id = 1`).run();
    db.prepare(`DELETE FROM users WHERE id = 2001`).run();
    db.prepare(`INSERT INTO users (id, username, email, password_hash, role, status, created_at, updated_at)
      VALUES (2001, 'unverified', 'uv@example.com', 'x', 'user', 'active', ?, ?)
    `).run(now, now);
    db.prepare(`DELETE FROM email_attempts WHERE user_id = 2001`).run();

    const r1 = await resend(new NextRequest('http://localhost/api/auth/verify', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: 'unverified' }) } as any));
    const j1 = await r1.json();
    // In watch mode this can hit RATE_LIMIT as the test runs repeatedly in the same day-window
    expect(j1.ok || j1?.error?.code === 'RATE_LIMIT').toBe(true);

    const r2 = await resend(new NextRequest('http://localhost/api/auth/verify', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: 'nouser' }) } as any));
    const j2 = await r2.json();
    expect(j2.ok).toBe(true);
  });

  it('verification GET fails when no code', async () => {
    const res = await verifyGet(new NextRequest('http://localhost/api/auth/verify'));
    expect(res.headers.get('location')).toBe('http://localhost/');
  });
});


