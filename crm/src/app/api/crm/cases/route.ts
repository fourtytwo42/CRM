import { NextRequest } from 'next/server';
import { getDb } from '@/lib/db';
import { requireAuth } from '@/lib/guard';
import { jsonOk, jsonError, methodNotAllowed } from '@/lib/http';

export async function GET(req: NextRequest) {
  const me = await requireAuth(req);
  if (me.status !== 'active') return jsonError('FORBIDDEN', { status: 403 });
  const db = getDb();
  // Ensure case_number exists even if backfill didn't run yet
  try { db.prepare(`SELECT case_number FROM cases LIMIT 1`).get(); } catch {
    try { db.exec(`ALTER TABLE cases ADD COLUMN case_number TEXT`); } catch {}
    try { db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_cases_case_number ON cases(case_number)`); } catch {}
  }
  const url = new URL(req.url);
  const q = (url.searchParams.get('q') || '').trim().toLowerCase();
  const vertical = (url.searchParams.get('vertical') || '').trim();
  const campaign = (url.searchParams.get('campaign') || '').trim();
  const rows = db.prepare(`
    SELECT cs.id, cs.case_number, cs.title, cs.stage, cs.created_at,
           c.full_name AS customer_name, c.email AS customer_email, c.phone AS customer_phone,
           camp.name AS campaign_name, v.name AS vertical_name
    FROM cases cs
    JOIN customers c ON c.id = cs.customer_id
    LEFT JOIN campaigns camp ON camp.id = cs.campaign_id
    LEFT JOIN verticals v ON v.id = camp.vertical_id
    WHERE
      (? = '' OR LOWER(cs.case_number) LIKE ?
        OR LOWER(c.full_name) LIKE ? OR LOWER(COALESCE(c.email,'')) LIKE ? OR LOWER(COALESCE(c.phone,'')) LIKE ?
        OR LOWER(COALESCE(camp.name,'')) LIKE ?)
      AND (? = '' OR COALESCE(v.name,'') = ?)
      AND (? = '' OR COALESCE(camp.name,'') = ?)
    ORDER BY cs.created_at DESC
    LIMIT 500
  `).all(q, `%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`, vertical, vertical, campaign, campaign);
  return jsonOk({ cases: rows });
}

export async function POST(req: NextRequest) {
  const me = await requireAuth(req);
  if (me.status !== 'active') return jsonError('FORBIDDEN', { status: 403 });
  const db = getDb();
  // Ensure case_number exists even if backfill didn't run yet
  try { db.prepare(`SELECT case_number FROM cases LIMIT 1`).get(); } catch {
    try { db.exec(`ALTER TABLE cases ADD COLUMN case_number TEXT`); } catch {}
    try { db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_cases_case_number ON cases(case_number)`); } catch {}
  }
  const body = await req.json().catch(()=>null) as { customer_id: number; campaign_id?: number|null } | null;
  if (!body || !body.customer_id) return jsonError('VALIDATION', { status: 400 });
  const now = new Date().toISOString();
  const gen = () => 'CS-' + Math.random().toString(36).slice(2, 8).toUpperCase();
  let code = gen();
  while (db.prepare(`SELECT 1 FROM cases WHERE case_number = ?`).get(code)) code = gen();
  // Title is not user-facing; store case_number as title to satisfy NOT NULL constraint
  const info = db.prepare(`INSERT INTO cases (case_number, title, stage, customer_id, campaign_id, agent_user_id, created_at, updated_at) VALUES (?, ?, 'new', ?, ?, ?, ?, ?)`)
    .run(code, code, body.customer_id, body.campaign_id || null, me.id, now, now);
  const id = Number(info.lastInsertRowid);
  // Ensure case_versions table exists
  try { db.prepare(`SELECT 1 FROM case_versions LIMIT 1`).get(); } catch {
    try {
      db.exec(`
        CREATE TABLE IF NOT EXISTS case_versions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          case_id INTEGER NOT NULL,
          version_no INTEGER NOT NULL,
          data TEXT NOT NULL,
          created_at TEXT NOT NULL,
          created_by_user_id INTEGER,
          FOREIGN KEY(case_id) REFERENCES cases(id),
          FOREIGN KEY(created_by_user_id) REFERENCES users(id),
          UNIQUE(case_id, version_no)
        );
        CREATE INDEX IF NOT EXISTS idx_case_versions_case ON case_versions(case_id);
      `);
    } catch {}
  }
  db.prepare(`INSERT OR IGNORE INTO case_versions (case_id, version_no, data, created_at, created_by_user_id) VALUES (?, 1, ?, ?, ?)`)
    .run(id, JSON.stringify({ title: code, stage: 'new' }), now, me.id);
  return jsonOk({ id, case_number: code });
}

export async function DELETE(req: NextRequest) {
  const me = await requireAuth(req);
  if (me.status !== 'active') return jsonError('FORBIDDEN', { status: 403 });
  const db = getDb();
  const url = new URL(req.url);
  let ids: number[] = [];
  const qpId = Number(url.searchParams.get('id') || '0');
  if (qpId) ids = [qpId];
  if (!qpId) {
    const body = await req.json().catch(() => null) as { ids?: number[] } | null;
    if (body && Array.isArray(body.ids)) ids = body.ids.map((n) => Number(n)).filter(Number.isFinite);
  }
  if (!ids.length) return jsonError('VALIDATION', { status: 400, message: 'No ids provided' });
  // Constrain to existing ids to produce a deterministic count
  const existing = db.prepare(`SELECT id FROM cases WHERE id IN (${ids.map(()=>'?').join(',')})`).all(...ids) as Array<{ id: number }>;
  if (!existing.length) return jsonOk({ deleted: 0 });
  const idList = existing.map(r => r.id);
  const placeholders = idList.map(()=>'?').join(',');
  // Delete dependents then cases
  db.prepare(`DELETE FROM case_versions WHERE case_id IN (${placeholders})`).run(...idList);
  try { db.prepare(`DELETE FROM communications WHERE case_id IN (${placeholders})`).run(...idList); } catch {}
  try { db.prepare(`DELETE FROM notes WHERE case_id IN (${placeholders})`).run(...idList); } catch {}
  const result = db.prepare(`DELETE FROM cases WHERE id IN (${placeholders})`).run(...idList);
  const changes = Number(result.changes || 0);
  return jsonOk({ deleted: changes });
}


