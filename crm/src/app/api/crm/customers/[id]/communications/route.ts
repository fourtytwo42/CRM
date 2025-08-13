import { NextRequest } from 'next/server';
import { getDb } from '@/lib/db';
import { jsonOk, jsonError } from '@/lib/http';
import { requireAuth } from '@/lib/guard';

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const me = await requireAuth(req);
  if (me.status !== 'active') return jsonError('FORBIDDEN', { status: 403 });
  const db = getDb();
  const customerId = Number(params.id);
  if (!customerId) return jsonError('VALIDATION', { status: 400 });
  const body = await req.json().catch(() => null) as { ids?: number[] } | null;
  const ids = Array.from(new Set((body?.ids || []).map(Number).filter(Number.isFinite)));
  if (!ids.length) return jsonError('VALIDATION', { status: 400, message: 'No ids' });

  // Access control: if not elevated, ensure agent has access to this customer via campaigns
  if (!(me.role === 'admin' || me.role === 'power')) {
    const row = db.prepare(`
      SELECT 1 FROM customer_campaigns cc
      JOIN agent_campaigns ac ON ac.campaign_id = cc.campaign_id
      WHERE cc.customer_id = ? AND ac.agent_user_id = ?
    `).get(customerId, me.id);
    if (!row) return jsonError('FORBIDDEN', { status: 403 });
  }

  // Restrict deletion to this customer and email communications only
  const existing = db.prepare(`SELECT id FROM communications WHERE customer_id = ? AND type = 'email' AND id IN (${ids.map(()=>'?').join(',')})`).all(customerId, ...ids) as Array<{ id: number }>;
  if (!existing.length) return jsonOk();
  const idsToDelete = existing.map(x => x.id);
  db.prepare(`DELETE FROM communications WHERE id IN (${idsToDelete.map(()=>'?').join(',')})`).run(...idsToDelete);
  return jsonOk({ deleted: idsToDelete.length });
}


