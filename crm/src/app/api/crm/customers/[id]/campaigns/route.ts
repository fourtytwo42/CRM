import { NextRequest } from 'next/server';
import { getDb } from '@/lib/db';
import { jsonOk, jsonError, methodNotAllowed } from '@/lib/http';
import { requireAuth } from '@/lib/guard';

export const runtime = 'nodejs';

function canManage(role: string) {
  return role === 'admin' || role === 'power' || role === 'manager' || role === 'lead' || role === 'agent';
}

// Replace all campaign assignments for a customer
export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const me = await requireAuth(req);
  if (!canManage(me.role)) return jsonError('FORBIDDEN', { status: 403 });
  const db = getDb();
  const body = await req.json().catch(() => null) as { campaign_ids?: number[] };
  if (!body || !Array.isArray(body.campaign_ids)) return jsonError('VALIDATION', { status: 400, message: 'campaign_ids required' });
  const customerId = Number(params.id);
  const ids = Array.from(
    new Set(
      body.campaign_ids
        .map((n: any) => Number(n))
        .filter((n: any) => Number.isFinite(n))
    )
  );

  // If non-elevated agent, ensure they only assign campaigns they belong to
  const isElevated = me.role === 'admin' || me.role === 'power' || me.role === 'manager' || me.role === 'lead';
  if (!isElevated && ids.length) {
    const rows = db.prepare(`SELECT campaign_id FROM agent_campaigns WHERE agent_user_id = ? AND campaign_id IN (${ids.map(() => '?').join(',')})`).all(me.id, ...ids) as Array<{ campaign_id: number }>;
    const allowed = new Set(rows.map(r => r.campaign_id));
    if (!ids.every(id => allowed.has(id))) return jsonError('FORBIDDEN', { status: 403 });
  }

  const now = new Date().toISOString();
  const tx = db.transaction(() => {
    db.prepare(`DELETE FROM customer_campaigns WHERE customer_id = ?`).run(customerId);
    const insert = db.prepare(`INSERT OR IGNORE INTO customer_campaigns (customer_id, campaign_id, assigned_at) VALUES (?, ?, ?)`);
    ids.forEach((cid) => insert.run(customerId, cid, now));
  });
  tx();
  return jsonOk();
}

export function GET() { return methodNotAllowed(['PUT']); }
export function POST() { return methodNotAllowed(['PUT']); }
export function DELETE() { return methodNotAllowed(['PUT']); }


