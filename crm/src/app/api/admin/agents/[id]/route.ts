import { NextRequest } from 'next/server';
import { jsonOk, jsonError, methodNotAllowed } from '@/lib/http';
import { getDb } from '@/lib/db';
import { requireAuth } from '@/lib/guard';

export const runtime = 'nodejs';

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const me = await requireAuth(req);
  if (!(me.role === 'admin' || me.role === 'power')) return jsonError('FORBIDDEN', { status: 403 });

  const db = getDb();
  const userId = Number(params.id);
  if (!Number.isFinite(userId) || userId <= 0) return jsonError('VALIDATION', { status: 400, message: 'Invalid id' });
  const user = db.prepare('SELECT id, role FROM users WHERE id = ?').get(userId) as { id: number; role: string } | undefined;
  if (!user) return jsonError('NOT_FOUND', { status: 404, message: 'User not found' });
  if (user.role === 'admin' || user.role === 'power') return jsonError('FORBIDDEN', { status: 403, message: 'Cannot delete admin/power users' });
  if (!['agent','manager','lead'].includes(user.role)) return jsonError('FORBIDDEN', { status: 403, message: 'Only agents/managers/leads can be deleted' });

  const url = new URL(req.url);
  const force = url.searchParams.get('force') === '1' || url.searchParams.get('force') === 'true';

  // Count references
  const count = (sql: string) => (db.prepare(sql).get(userId) as { n: number } | undefined)?.n || 0;
  const refs = {
    tasksAssigned: count('SELECT COUNT(*) as n FROM tasks WHERE assigned_to_user_id = ?'),
    tasksCreated: count('SELECT COUNT(*) as n FROM tasks WHERE created_by_user_id = ?'),
    casesOwned: count('SELECT COUNT(*) as n FROM cases WHERE agent_user_id = ?'),
    notesTagged: count('SELECT COUNT(*) as n FROM notes WHERE agent_user_id = ?'),
    commsTagged: count('SELECT COUNT(*) as n FROM communications WHERE agent_user_id = ?'),
    agentCampaigns: count('SELECT COUNT(*) as n FROM agent_campaigns WHERE agent_user_id = ?'),
    agentVerticals: count('SELECT COUNT(*) as n FROM agent_verticals WHERE agent_user_id = ?'),
    asSupervisor: count('SELECT COUNT(*) as n FROM agent_supervisors WHERE supervisor_user_id = ?'),
    refreshTokens: count('SELECT COUNT(*) as n FROM refresh_tokens WHERE user_id = ?'),
    auditActor: count('SELECT COUNT(*) as n FROM audit_logs WHERE actor_user_id = ?'),
    auditTarget: count('SELECT COUNT(*) as n FROM audit_logs WHERE target_user_id = ?'),
  };

  const blocking = refs.tasksAssigned + refs.tasksCreated + refs.casesOwned + refs.asSupervisor;
  if (!force && blocking > 0) {
    return jsonError('CONFLICT', {
      status: 409,
      message: 'User has related records. Use force=1 to delete and cleanup.',
      details: refs,
    });
  }

  db.exec('BEGIN');
  try {
    // Remove associations
    db.prepare('DELETE FROM agent_campaigns WHERE agent_user_id = ?').run(userId);
    db.prepare('DELETE FROM agent_verticals WHERE agent_user_id = ?').run(userId);
    db.prepare('DELETE FROM agent_supervisors WHERE agent_user_id = ? OR supervisor_user_id = ?').run(userId, userId);

    // Null out optional links
    db.prepare('UPDATE notes SET agent_user_id = NULL WHERE agent_user_id = ?').run(userId);
    db.prepare('UPDATE communications SET agent_user_id = NULL WHERE agent_user_id = ?').run(userId);
    db.prepare('UPDATE cases SET agent_user_id = NULL WHERE agent_user_id = ?').run(userId);

    // Tasks: delete assigned, reassign created_by to deleter
    db.prepare('DELETE FROM tasks WHERE assigned_to_user_id = ?').run(userId);
    db.prepare('UPDATE tasks SET created_by_user_id = ? WHERE created_by_user_id = ?').run(me.id, userId);

    // Tokens and audit logs
    db.prepare('DELETE FROM refresh_tokens WHERE user_id = ?').run(userId);
    db.prepare('DELETE FROM audit_logs WHERE actor_user_id = ? OR target_user_id = ?').run(userId, userId);

    // Finally, delete the user
    db.prepare('DELETE FROM users WHERE id = ?').run(userId);
    db.exec('COMMIT');
    try { new BroadcastChannel('admin').postMessage({ type: 'user-updated' }); } catch {}
    return jsonOk();
  } catch (e: any) {
    try { db.exec('ROLLBACK'); } catch {}
    return jsonError('DELETE_FAILED', { status: 500, message: e?.message || 'Failed to delete user' });
  }
}

export function GET() {
  return methodNotAllowed(['DELETE']);
}


