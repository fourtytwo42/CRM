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
  const sort = url.searchParams.get('sort') || 'username';
  const dir = (url.searchParams.get('dir') || 'asc').toLowerCase() === 'desc' ? 'DESC' : 'ASC';
  const isElevated = me.role === 'admin' || me.role === 'power' || me.role === 'manager' || me.role === 'lead';

  const base = `
    SELECT DISTINCT u.id, u.username, u.email, u.role, u.status,
           v.name as vertical, c.name as campaign
    FROM users u
    JOIN agent_campaigns ac ON ac.agent_user_id = u.id
    JOIN campaigns c ON c.id = ac.campaign_id
    JOIN verticals v ON v.id = c.vertical_id
    WHERE u.role IN ('power','manager','lead','agent')
  `;

  const where: string[] = [];
  const params: any[] = [];
  if (q) { where.push('(LOWER(u.username) LIKE ? OR LOWER(COALESCE(u.email, "")) LIKE ?)'); params.push(`%${q}%`, `%${q}%`); }
  if (vertical) { where.push('v.name = ?'); params.push(vertical); }
  if (campaign) { where.push('c.name = ?'); params.push(campaign); }
  if (!isElevated) { where.push('u.id IN (SELECT agent_user_id FROM agent_campaigns WHERE agent_user_id = ?)'); params.push(me.id); }

  const sortCol = ['username','email','status'].includes(sort) ? `u.${sort}` : 'u.username';
  const sql = `${base} ${where.length ? 'AND ' + where.join(' AND ') : ''} ORDER BY ${sortCol} ${dir} LIMIT 200`;
  const rows = db.prepare(sql).all(...params);
  return jsonOk({ agents: rows });
}


