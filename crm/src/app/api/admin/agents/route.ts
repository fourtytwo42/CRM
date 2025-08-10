import { NextRequest } from 'next/server';
import { jsonOk, jsonError } from '@/lib/http';
import { requireAuth } from '@/lib/guard';
import { getDb } from '@/lib/db';

export async function GET(req: NextRequest) {
  const me = await requireAuth(req);
  if (me.status !== 'active') return jsonError('FORBIDDEN', { status: 403 });
  const db = getDb();
  const url = new URL(req.url);
  const q = (url.searchParams.get('q') || '').toLowerCase();
  const sort = url.searchParams.get('sort') || 'username';
  const dir = (url.searchParams.get('dir') || 'asc').toLowerCase() === 'desc' ? 'DESC' : 'ASC';

  const allowedSort = new Set(['username','created_at','last_login_at','last_seen_at']);
  const sortCol = allowedSort.has(sort) ? sort : 'username';

  const rows = db.prepare(`
    SELECT id, username, email, role, status, created_at, last_login_at, last_seen_at
    FROM users
    WHERE role IN ('power','manager','lead','agent')
      AND (LOWER(username) LIKE ? OR LOWER(COALESCE(email,'')) LIKE ?)
    ORDER BY ${sortCol} ${dir}
    LIMIT 200
  `).all(`%${q}%`, `%${q}%`);

  // Attach campaigns assigned to each agent for glance visibility
  const campaignRows = db.prepare(`
    SELECT ac.agent_user_id AS user_id, c.name AS campaign_name
    FROM agent_campaigns ac
    JOIN campaigns c ON c.id = ac.campaign_id
  `).all() as Array<{ user_id: number; campaign_name: string }>;
  const campaignsByUserId = new Map<number, string[]>();
  for (const r of campaignRows) {
    const list = campaignsByUserId.get(r.user_id) || [];
    list.push(r.campaign_name);
    campaignsByUserId.set(r.user_id, list);
  }
  const agents = rows.map((r: any) => ({ ...r, campaigns: campaignsByUserId.get(r.id) || [] }));

  return jsonOk({ agents });
}


