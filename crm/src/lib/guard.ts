import { NextRequest } from 'next/server';
import { verifyAccessToken } from './auth';
import { getDb } from './db';

export type AuthenticatedUser = {
  id: number;
  username: string;
  role: 'admin'|'power'|'user';
  status: 'active'|'suspended'|'banned';
  avatar_url?: string|null;
  theme_preference: 'light'|'dark'|'system';
  token_version: number;
};

export async function requireAuth(req: NextRequest): Promise<AuthenticatedUser> {
  const lower = req.headers.get('authorization');
  const upper = req.headers.get('Authorization');
  const xlower = req.headers.get('x-access-token');
  const xupper = req.headers.get('X-Access-Token');
  const raw = lower || upper || xlower || xupper || '';
  const hasBearer = raw.startsWith('Bearer ');
  const token = hasBearer ? raw.slice(7) : raw;
  // Avoid noisy logging on the hot path; rely on error logs below when verification fails
  if (!token) throw new Error('NO_TOKEN');
  let claims;
  try {
    claims = await verifyAccessToken(token);
  } catch (e: any) {
    // eslint-disable-next-line no-console
    console.error('[guard] verifyAccessToken failed', e?.message || e);
    throw e;
  }
  const db = getDb();
  const user = db.prepare('SELECT id, username, role, status, avatar_url, theme_preference, token_version FROM users WHERE id = ?').get(Number(claims.sub)) as AuthenticatedUser | undefined;
  if (!user) throw new Error('UNKNOWN_USER');
  if (user.token_version !== claims.ver) throw new Error('TOKEN_VERSION_MISMATCH');
  if (user.status === 'banned') throw new Error('BANNED');
  return user;
}

export async function requireAdmin(req: NextRequest): Promise<AuthenticatedUser> {
  const user = await requireAuth(req);
  if (user.role !== 'admin') throw new Error('FORBIDDEN');
  if (user.status === 'suspended') throw new Error('SUSPENDED');
  return user;
}


