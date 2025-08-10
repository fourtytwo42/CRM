import { describe, it, expect } from 'vitest';
import { createAccessToken, verifyAccessToken } from '@/lib/auth';

describe('auth tokens', () => {
  it('creates and verifies an access token', async () => {
    const token = await createAccessToken({
      sub: '1',
      username: 'tester',
      role: 'admin',
      status: 'active',
      ver: 0,
      jti: 'jti-1',
    });
    const claims = await verifyAccessToken(token);
    expect(claims.sub).toBe('1');
    expect(claims.username).toBe('tester');
    expect(claims.role).toBe('admin');
  });
});


