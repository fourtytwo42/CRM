import { describe, it, expect } from 'vitest';
import { POST as login } from '@/app/api/auth/login/route';
import { NextRequest } from 'next/server';
import { getDb } from '@/lib/db';
import bcrypt from 'bcryptjs';

function makeReq(body: any) {
  return new NextRequest('http://localhost/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  } as any);
}

describe('login API', () => {
  it('rejects invalid input', async () => {
    const res = await login(makeReq({ username: 'x', password: '1' }));
    const json = await res.json();
    expect(res.status).toBe(400);
    expect(json.ok).toBe(false);
    expect(json.error.code).toBe('VALIDATION');
  });

  it('accepts correct credentials', async () => {
    const db = getDb();
    const now = new Date().toISOString();
    // Ensure email verification is not enforced for this test
    db.prepare(`INSERT OR IGNORE INTO site_settings (id, registration_enabled, email_verification_enabled) VALUES (1, 1, 0)`).run();
    db.prepare(`UPDATE site_settings SET email_verification_enabled = 0 WHERE id = 1`).run();
    const hash = await bcrypt.hash('Password123!', 10);
    db.prepare(`INSERT OR REPLACE INTO users (id, username, email, password_hash, role, status, email_verified_at, created_at, updated_at)
      VALUES (1001, 'loginuser', 'login@example.com', ?, 'user', 'active', ?, ?, ?)
    `).run(hash, now, now, now);
    const res = await login(makeReq({ username: 'loginuser', password: 'Password123!' }));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.data.accessToken).toBeTruthy();
    expect(json.data.refreshToken).toBeTruthy();
    expect(json.data.user.username).toBe('loginuser');
  });
});


