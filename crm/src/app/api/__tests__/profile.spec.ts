import { describe, it, expect } from 'vitest';
import { PUT as changePassword } from '@/app/api/profile/password/route';
import { NextRequest } from 'next/server';
import { createAccessToken } from '@/lib/auth';
import { getDb } from '@/lib/db';
import bcrypt from 'bcryptjs';

function authedReq(url: string, method: string, token: string, body: any) {
  return new NextRequest(url, {
    method,
    headers: { 'content-type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  } as any);
}

describe('profile password route', () => {
  it('rejects weak password', async () => {
    const db = getDb();
    const now = new Date().toISOString();
    const hash = await bcrypt.hash('Password123!', 10);
    db.prepare(`INSERT OR IGNORE INTO users (id, username, email, password_hash, role, status, created_at, updated_at)
      VALUES (3001, 'changepwd', 'cp@example.com', ?, 'user', 'active', ?, ?)`).run(hash, now, now);
    const token = await createAccessToken({ sub: '3001', username: 'changepwd', role: 'user', status: 'active', ver: 0, jti: 'x' });
    const res = await changePassword(authedReq('http://localhost/api/profile/password', 'PUT', token, { currentPassword: 'Password123!', newPassword: 'short' }));
    const j = await res.json();
    expect(res.status).toBe(400);
    expect(j.error.code).toBe('WEAK_PASSWORD');
  });
});


