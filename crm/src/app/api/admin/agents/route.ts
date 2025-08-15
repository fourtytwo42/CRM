import { NextRequest } from 'next/server';
import { jsonOk, jsonError } from '@/lib/http';
import { requireAuth } from '@/lib/guard';
import { getDb } from '@/lib/db';

export async function GET(req: NextRequest) {
  const me = await requireAuth(req);
  if (me.status !== 'active') return jsonError('FORBIDDEN', { status: 403 });
  // Only leads, managers, power users, and admins can view agents
  if (!(me.role === 'lead' || me.role === 'manager' || me.role === 'power' || me.role === 'admin')) {
    return jsonError('FORBIDDEN', { status: 403 });
  }
  const db = getDb();
  const url = new URL(req.url);
  const q = (url.searchParams.get('q') || '').toLowerCase();
  const sort = url.searchParams.get('sort') || 'username';
  const dir = (url.searchParams.get('dir') || 'asc').toLowerCase() === 'desc' ? 'DESC' : 'ASC';

  const allowedSort = new Set(['username','created_at','last_login_at','last_seen_at']);
  const sortCol = allowedSort.has(sort) ? sort : 'username';

  const rows = db.prepare(`
    SELECT id, username, email, role, status, created_at, last_login_at, last_seen_at, is_ai
    FROM users
    WHERE role IN ('power','manager','lead','agent','ai_manager','ai_lead','ai_agent')
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

export async function POST(req: NextRequest) {
  const me = await requireAuth(req);
  if (me.role !== 'admin' && me.role !== 'power') return jsonError('FORBIDDEN', { status: 403 });
  const db = getDb();
  const body = await req.json().catch(() => null) as any;
  const now = new Date().toISOString();
  if (!body || !body.action) return jsonError('VALIDATION', { status: 400 });
  try {
    switch (body.action) {
             case 'createAiAgent': {
         const role = (['ai_agent','ai_lead','ai_manager'].includes(String(body.role)) ? String(body.role) : 'ai_agent');
         const name = String(body.name || '').trim();
         const campaignId = body.campaign_id;
         if (!name) return jsonError('VALIDATION', { status: 400, message: 'Name is required' });
         
         // Use the name directly as username, with simple cleanup
         const baseUsername = name.toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 20) || 'aiagent';
         let username = baseUsername;
         let counter = 1;
         
         // Ensure username is unique and at least 3 characters
         while (username.length < 3 || db.prepare(`SELECT id FROM users WHERE username = ?`).get(username)) {
           if (username.length < 3) {
             username = `${baseUsername}ai${counter}`;
           } else {
             username = `${baseUsername}${counter}`;
           }
           counter++;
           if (counter > 999) break; // Safety break
         }
         
         try {
           const result = db.prepare(`INSERT INTO users (username, email, password_hash, role, status, is_ai, ai_personality, created_at, updated_at) VALUES (?, NULL, '', ?, 'active', 1, ?, ?, ?)`)
             .run(username, role, String(body.personality || ''), now, now);
           const userId = result.lastInsertRowid as number;
           
           // If campaign_id is provided, assign the AI agent to that campaign
           if (campaignId && userId) {
             try {
               db.prepare(`
                 INSERT INTO agent_campaigns (agent_user_id, campaign_id, assigned_at)
                 VALUES (?, ?, ?)
               `).run(userId, campaignId, now);
             } catch (error) {
               console.error('Failed to assign AI agent to campaign:', error);
             }
           }
           
           return jsonOk({ id: userId });
         } catch (error) {
           console.error('Failed to create AI agent:', error);
           return jsonError('DATABASE_ERROR', { status: 500, message: 'Failed to create AI agent' });
         }
       }
      case 'assignSupervisor': {
        const { agent_user_id, supervisor_user_id, kind } = body;
        if (!agent_user_id || !supervisor_user_id || (kind !== 'manager' && kind !== 'lead')) return jsonError('VALIDATION', { status: 400 });
        db.prepare(`INSERT OR IGNORE INTO agent_supervisors (agent_user_id, supervisor_user_id, kind, assigned_at) VALUES (?, ?, ?, ?)`)
          .run(agent_user_id, supervisor_user_id, kind, now);
        return jsonOk({});
      }
      default:
        return jsonError('NOT_IMPLEMENTED', { status: 400 });
    }
  } catch (e) {
    return jsonError('FAILED', { status: 500 });
  }
}


