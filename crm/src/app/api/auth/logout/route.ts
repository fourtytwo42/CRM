import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { createHash } from 'crypto';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const db = getDb();
  const body = await req.json().catch(() => null);
  const provided = String(body?.refreshToken || '');
  if (!provided) {
    return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
  }
  const hash = createHash('sha256').update(provided).digest('hex');
  const record = db.prepare('SELECT id FROM refresh_tokens WHERE token_hash = ?').get(hash) as any;
  if (record) {
    db.prepare('UPDATE refresh_tokens SET revoked_at = ? WHERE id = ?').run(new Date().toISOString(), record.id);
  }
  return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
}

export function GET() {
  return NextResponse.json({ ok: false, error: { code: 'METHOD_NOT_ALLOWED' } }, { status: 405, headers: { 'Allow': 'POST', 'Cache-Control': 'no-store' } });
}


