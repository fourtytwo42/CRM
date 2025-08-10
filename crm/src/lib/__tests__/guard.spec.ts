import { describe, it, expect } from 'vitest';
import { NextRequest } from 'next/server';
import { createAccessToken } from '@/lib/auth';
import { requireAuth } from '@/lib/guard';
import { getDb } from '@/lib/db';

function makeReq(headers: Record<string, string>) {
  return new NextRequest('http://localhost/test', { headers });
}

describe('requireAuth', () => {
  it('rejects when no token', async () => {
    await expect(requireAuth(makeReq({}))).rejects.toBeTruthy();
  });

  it('accepts a valid token with matching user and version', async () => {
    const db = getDb();
    const now = new Date().toISOString();
    db.prepare(`INSERT OR IGNORE INTO users (id, username, password_hash, role, status, created_at, updated_at)
      VALUES (999, 'tester', '$2b$10$abcdefghijklmnopqrstuv', 'admin', 'active', ?, ?)`
    ).run(now, now);
    const token = await createAccessToken({ sub: '999', username: 'tester', role: 'admin', status: 'active', ver: 0, jti: 't' });
    const req = makeReq({ Authorization: `Bearer ${token}` });
    const user = await requireAuth(req);
    expect(user.id).toBe(999);
    expect(user.role).toBe('admin');
  });
});


