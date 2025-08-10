import { NextRequest } from 'next/server';
import { getDb } from '@/lib/db';
import { jsonOk, jsonError } from '@/lib/http';
import { requireAuth } from '@/lib/guard';

export async function GET(req: NextRequest) {
  const me = await requireAuth(req);
  if (me.status !== 'active') return jsonError('FORBIDDEN', { status: 403 });
  const db = getDb();
  const url = new URL(req.url);
  const q = (url.searchParams.get('q') || '').toLowerCase();
  const vertical = url.searchParams.get('vertical') || '';
  const campaign = url.searchParams.get('campaign') || '';
  const agentId = url.searchParams.get('agentId') || '';
  const sort = url.searchParams.get('sort') || 'name';
  const dir = (url.searchParams.get('dir') || 'asc').toLowerCase() === 'desc' ? 'DESC' : 'ASC';
  const mine = (url.searchParams.get('mine') || '').toLowerCase() === 'true';
  const isElevated = me.role === 'admin' || me.role === 'power';

  const sortMap: any = { name: 'cu.full_name', email: 'cu.email', vertical: 'v.name', campaign: 'c.name', status: 'cu.status' };
  const sortCol = sortMap[sort] || 'cu.full_name';

  const base = `
    SELECT cu.id, cu.full_name as name, cu.email, cu.phone, cu.status,
           v.name as vertical, c.name as campaign,
           (
             SELECT ac.agent_user_id
             FROM agent_campaigns ac
             WHERE ac.campaign_id = c.id
             ORDER BY ac.agent_user_id ASC
             LIMIT 1
           ) as agentId
    FROM customers cu
    JOIN customer_campaigns cc ON cc.customer_id = cu.id
    JOIN campaigns c ON c.id = cc.campaign_id
    JOIN verticals v ON v.id = c.vertical_id
  `;

  const where: string[] = [];
  const params: any[] = [];
  if (q) { where.push('(LOWER(cu.full_name) LIKE ? OR LOWER(COALESCE(cu.email, "")) LIKE ?)'); params.push(`%${q}%`, `%${q}%`); }
  if (vertical) { where.push('v.name = ?'); params.push(vertical); }
  if (campaign) { where.push('c.name = ?'); params.push(campaign); }
  if (agentId) { where.push('EXISTS (SELECT 1 FROM agent_campaigns ac WHERE ac.campaign_id = c.id AND ac.agent_user_id = ?)'); params.push(Number(agentId)); }
  if (!isElevated) { where.push('EXISTS (SELECT 1 FROM agent_campaigns ac WHERE ac.campaign_id = c.id AND ac.agent_user_id = ?)'); params.push(me.id); }
  if (mine && !isElevated) {
    // Default agent view: customers they interacted with or in campaigns they belong to
    where.push("(EXISTS (SELECT 1 FROM communications cm WHERE cm.customer_id = cu.id AND cm.agent_user_id = ?) OR EXISTS (SELECT 1 FROM agent_campaigns ac2 WHERE ac2.campaign_id = c.id AND ac2.agent_user_id = ?))");
    params.push(me.id, me.id);
  }

  const sql = `${base} ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY ${sortCol} ${dir} LIMIT 200`;
  const rows = db.prepare(sql).all(...params);
  return jsonOk({ customers: rows });
}


