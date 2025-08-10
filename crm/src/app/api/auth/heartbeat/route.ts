import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { requireAuth } from '@/lib/guard';
import { jsonOk, jsonError } from '@/lib/http';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth(req);
    const db = getDb();
    const now = new Date().toISOString();
    db.prepare('UPDATE users SET last_seen_at = ?, updated_at = ? WHERE id = ?').run(now, now, user.id);
    return jsonOk(undefined, { varyAuth: true });
  } catch {
    return jsonError('UNAUTHORIZED', { status: 401, varyAuth: true });
  }
}


