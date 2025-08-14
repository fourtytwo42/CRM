import { NextRequest } from 'next/server';
import { getDb } from '@/lib/db';
import { jsonOk, jsonError, methodNotAllowed } from '@/lib/http';
import { requireAuth } from '@/lib/guard';

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const me = await requireAuth(req);
  if (!(me.role === 'admin' || me.role === 'power' || me.role === 'manager' || me.role === 'lead')) return jsonError('FORBIDDEN', { status: 403 });
  const body = await req.json().catch(() => null) as { campaign_ids?: number[] };
  if (!body || !Array.isArray(body.campaign_ids)) return jsonError('VALIDATION', { status: 400, message: 'campaign_ids required' });
  const db = getDb();
  const agentId = Number(params.id);
  const arr = body.campaign_ids.map((n: any) => Number(n)).filter((n: any) => Number.isFinite(n));
  const ids: number[] = [];
  for (const n of arr) { if (!ids.includes(n)) ids.push(n); }
  const now = new Date().toISOString();
  const tx = db.transaction(() => {
    db.prepare(`DELETE FROM agent_campaigns WHERE agent_user_id = ?`).run(agentId);
    const ins = db.prepare(`INSERT OR IGNORE INTO agent_campaigns (agent_user_id, campaign_id, assigned_at) VALUES (?, ?, ?)`);
    ids.forEach(cid => ins.run(agentId, cid, now));
  });
  tx();
  return jsonOk();
}

export function GET() { return methodNotAllowed(['PUT']); }
export function POST() { return methodNotAllowed(['PUT']); }
export function DELETE() { return methodNotAllowed(['PUT']); }


