import { NextRequest } from 'next/server';
import { getDb } from '@/lib/db';
import { requireAuth } from '@/lib/guard';
import { jsonOk, jsonError, methodNotAllowed } from '@/lib/http';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const me = await requireAuth(req);
  if (me.status !== 'active') return jsonError('FORBIDDEN', { status: 403 });
  const db = getDb();
  // Defensive: ensure new columns exist on older DBs
  try { db.prepare(`SELECT case_id FROM notes LIMIT 1`).get(); } catch { try { db.exec(`ALTER TABLE notes ADD COLUMN case_id INTEGER`); db.exec(`CREATE INDEX IF NOT EXISTS idx_notes_case ON notes(case_id)`); } catch {} }
  try { db.prepare(`SELECT case_id FROM communications LIMIT 1`).get(); } catch { try { db.exec(`ALTER TABLE communications ADD COLUMN case_id INTEGER`); db.exec(`CREATE INDEX IF NOT EXISTS idx_comms_case ON communications(case_id)`); } catch {} }
  const id = Number(params.id);
  // Enrich case with campaign and vertical names
  const cs = db.prepare(`
    SELECT cs.*, camp.name AS campaign_name, v.name AS vertical_name
    FROM cases cs
    LEFT JOIN campaigns camp ON camp.id = cs.campaign_id
    LEFT JOIN verticals v ON v.id = camp.vertical_id
    WHERE cs.id = ?
  `).get(id) as any;
  if (!cs) return jsonError('NOT_FOUND', { status: 404 });
  const customer = db.prepare(`SELECT id, full_name, email, phone, company, title FROM customers WHERE id = ?`).get(cs.customer_id);
  const otherCases = db.prepare(`
    SELECT id, case_number, title, stage, created_at
    FROM cases
    WHERE customer_id = ?
    ORDER BY created_at DESC
  `).all(cs.customer_id);
  const notes = db.prepare(`SELECT n.id, n.body, n.created_at, u.username AS createdBy FROM notes n JOIN users u ON u.id = n.created_by_user_id WHERE n.customer_id = ? ORDER BY n.created_at DESC`).all(cs.customer_id);
  const emails = db.prepare(`
    SELECT c.id, c.direction, c.subject, c.body, c.agent_user_id, u.username AS agent_username, c.created_at
    FROM communications c
    LEFT JOIN users u ON u.id = c.agent_user_id
    WHERE c.customer_id = ? AND c.type = 'email'
    ORDER BY c.created_at DESC
  `).all(cs.customer_id);
  // All communications for related tab
  const commsAll = db.prepare(`
    SELECT c.id, c.type, c.direction, c.subject, c.body, c.agent_user_id, u.username AS agent_username, c.created_at
    FROM communications c
    LEFT JOIN users u ON u.id = c.agent_user_id
    WHERE c.customer_id = ?
    ORDER BY c.created_at DESC
  `).all(cs.customer_id);
  // Tasks related to this customer (no explicit case linkage in schema)
  const tasks = db.prepare(`
    SELECT id, title, description, status, priority, due_date, assigned_to_user_id
    FROM tasks
    WHERE customer_id = ?
    ORDER BY COALESCE(due_date, created_at) ASC
  `).all(cs.customer_id);
  // Versions
  let versions: Array<{ version_no: number; created_at: string; createdBy?: string|null } & { data: any }> = [];
  try {
    versions = (db.prepare(`
      SELECT v.version_no, v.data, v.created_at, u.username AS createdBy
      FROM case_versions v
      LEFT JOIN users u ON u.id = v.created_by_user_id
      WHERE v.case_id = ?
      ORDER BY v.version_no DESC
    `).all(id) as any[]).map((r) => ({ version_no: r.version_no, created_at: r.created_at, createdBy: r.createdBy || null, data: safeJson(r.data) }));
  } catch {}
  return jsonOk({ info: cs, customer, notes, emails, communications: commsAll, tasks, versions, otherCases });
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const me = await requireAuth(req);
  if (me.status !== 'active') return jsonError('FORBIDDEN', { status: 403 });
  const db = getDb();
  const id = Number(params.id);
  const body = await req.json().catch(()=>null) as any;
  const now = new Date().toISOString();
  const cs = db.prepare(`SELECT * FROM cases WHERE id = ?`).get(id) as any;
  if (!cs) return jsonError('NOT_FOUND', { status: 404 });
  // Only title/stage editable here; campaign_id/customer_id controlled elsewhere
  // Title is internal; keep as case_number mirror
  const title = cs.case_number as string;
  const stage = ['new','in-progress','won','lost','closed'].includes(body?.stage) ? body.stage : cs.stage;
  const campaignId = (body?.campaign_id != null && Number.isFinite(Number(body.campaign_id))) ? Number(body.campaign_id) : cs.campaign_id;
  db.prepare(`UPDATE cases SET title = ?, stage = ?, campaign_id = ?, updated_at = ? WHERE id = ?`).run(title, stage, campaignId, now, id);
  // Version snapshot
  const maxV = (db.prepare(`SELECT MAX(version_no) AS v FROM case_versions WHERE case_id = ?`).get(id) as any)?.v || 1;
  db.prepare(`INSERT INTO case_versions (case_id, version_no, data, created_at, created_by_user_id) VALUES (?, ?, ?, ?, ?)`)
    .run(id, maxV + 1, JSON.stringify({ title, stage, campaign_id: campaignId }), now, me.id);
  return jsonOk();
}

function safeJson(s: string): any { try { return JSON.parse(s); } catch { return s; } }

export function POST() { return methodNotAllowed(['GET','PUT']); }
export function DELETE() { return methodNotAllowed(['GET','PUT']); }


