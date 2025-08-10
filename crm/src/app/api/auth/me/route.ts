import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { requireAuth } from '@/lib/guard';
import { jsonOk, jsonError, methodNotAllowed } from '@/lib/http';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  try {
    const authed = await requireAuth(req);
    const db = getDb();
    const user = db.prepare('SELECT id, username, email, email_verified_at, role, status, avatar_url, theme_preference FROM users WHERE id = ?').get(Number(authed.id)) as any;
    if (!user) return jsonError('UNKNOWN_USER', { status: 401, message: 'User not found', varyAuth: true });
    return jsonOk({ user }, { varyAuth: true });
  } catch (e: any) {
    return jsonError(e?.message || 'INVALID_TOKEN', { status: 401, message: 'Invalid token', varyAuth: true });
  }
}

export function POST() {
  return methodNotAllowed(['GET']);
}


