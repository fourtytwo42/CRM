import { NextRequest } from 'next/server';
import { getDb } from '@/lib/db';
import { jsonOk, jsonError } from '@/lib/http';
import { requireAuth } from '@/lib/guard';

export async function GET(req: NextRequest) {
  const me = await requireAuth(req);
  if (me.status !== 'active') return jsonError('FORBIDDEN', { status: 403 });
  const db = getDb();

  // Campaigns I can see (if admin/power: all; if user(agent): only assigned)
  const isElevated = me.role === 'admin' || me.role === 'power';
  const campaigns = isElevated
    ? db.prepare(`SELECT c.id, c.name, c.status, v.name as vertical FROM campaigns c JOIN verticals v ON v.id = c.vertical_id ORDER BY v.name, c.name`).all()
    : db.prepare(`SELECT c.id, c.name, c.status, v.name as vertical FROM campaigns c JOIN verticals v ON v.id = c.vertical_id JOIN agent_campaigns ac ON ac.campaign_id = c.id WHERE ac.agent_user_id = ? ORDER BY v.name, c.name`).all(me.id);

  // Counts
  const usersByCampaign = campaigns.map((c: any) => {
    const count = db.prepare(`SELECT COUNT(*) as n FROM customer_campaigns WHERE campaign_id = ?`).get(c.id) as { n: number };
    return { name: c.name, count: count.n };
  });
  const activeCasesByAgent = db.prepare(`
    SELECT u.username as name, COUNT(*) as count
    FROM cases k JOIN users u ON u.id = k.agent_user_id
    WHERE k.stage != 'lost'
    GROUP BY k.agent_user_id
  `).all();
  const overdueTasks = db.prepare(`SELECT COUNT(*) as n FROM tasks WHERE status != 'done'`).get() as { n: number };
  const completedTasks = db.prepare(`SELECT COUNT(*) as n FROM tasks WHERE status = 'done'`).get() as { n: number };

  // Customers listing (limited for agent)
  const customers = isElevated
    ? db.prepare(`
        SELECT cu.id, cu.full_name as name, cu.email, cu.phone,
               v.name as vertical, c.name as campaign,
               (SELECT ac.agent_user_id FROM agent_campaigns ac WHERE ac.campaign_id = cc.campaign_id LIMIT 1) as agentId,
               cu.status
        FROM customers cu
        LEFT JOIN customer_campaigns cc ON cc.customer_id = cu.id
        LEFT JOIN campaigns c ON c.id = cc.campaign_id
        LEFT JOIN verticals v ON v.id = c.vertical_id
        LIMIT 100
      `).all()
    : db.prepare(`
        SELECT cu.id, cu.full_name as name, cu.email, cu.phone,
               v.name as vertical, c.name as campaign,
               (SELECT ac.agent_user_id FROM agent_campaigns ac WHERE ac.campaign_id = cc.campaign_id LIMIT 1) as agentId,
               cu.status
        FROM customers cu
        JOIN customer_campaigns cc ON cc.customer_id = cu.id
        JOIN campaigns c ON c.id = cc.campaign_id
        JOIN verticals v ON v.id = c.vertical_id
        JOIN agent_campaigns ac ON ac.campaign_id = c.id AND ac.agent_user_id = ?
        LIMIT 100
      `).all(me.id);

  // Managers and Leads lists
  const managers = db.prepare(`SELECT id, username FROM users WHERE role = 'manager' ORDER BY username ASC`).all();
  const leads = db.prepare(`SELECT id, username FROM users WHERE role = 'lead' ORDER BY username ASC`).all();

  return jsonOk({ campaigns, usersByCampaign, activeCasesByAgent, tasks: { overdue: overdueTasks.n, completed: completedTasks.n }, customers, managers, leads });
}


