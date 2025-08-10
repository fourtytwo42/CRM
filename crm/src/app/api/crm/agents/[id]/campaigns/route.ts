import { NextRequest } from 'next/server';
import { requireAuth } from '@/lib/guard';
import { getDb } from '@/lib/db';
import { jsonOk, jsonError, methodNotAllowed } from '@/lib/http';

export const runtime = 'nodejs';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const me = await requireAuth(req);
  if (!(me.role === 'admin' || me.role === 'power' || me.role === 'manager' || me.role === 'lead')) return jsonError('FORBIDDEN', { status: 403 });
  const body = await req.json().catch(() => null) as { campaign_id?: number };
  const cid = Number(body?.campaign_id || 0);
  if (!cid) return jsonError('VALIDATION', { status: 400, message: 'campaign_id required' });
  const db = getDb();
  const now = new Date().toISOString();
  db.prepare('INSERT OR IGNORE INTO agent_campaigns (agent_user_id, campaign_id, assigned_at) VALUES (?, ?, ?)')
    .run(Number(params.id), cid, now);
  return jsonOk();
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const me = await requireAuth(req);
  if (!(me.role === 'admin' || me.role === 'power' || me.role === 'manager' || me.role === 'lead')) return jsonError('FORBIDDEN', { status: 403 });
  const { searchParams } = new URL(req.url);
  const cid = Number(searchParams.get('campaign_id') || 0);
  if (!cid) return jsonError('VALIDATION', { status: 400, message: 'campaign_id required' });
  const db = getDb();
  db.prepare('DELETE FROM agent_campaigns WHERE agent_user_id = ? AND campaign_id = ?').run(Number(params.id), cid);
  return jsonOk();
}

export function GET() { return methodNotAllowed(['POST','DELETE']); }

