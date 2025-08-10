import { NextRequest } from 'next/server';
import { requireAdmin } from '@/lib/guard';
import { getDb } from '@/lib/db';
import { jsonOk, jsonError, methodNotAllowed } from '@/lib/http';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  try {
    await requireAdmin(req);
  } catch {
    return jsonError('FORBIDDEN', { status: 403 });
  }
  const db = getDb();
  try { db.prepare(`CREATE TABLE IF NOT EXISTS email_outbox (id INTEGER PRIMARY KEY AUTOINCREMENT, to_email TEXT, subject TEXT, body TEXT, created_at TEXT NOT NULL, sent INTEGER)`).run(); } catch {}
  const rows = db.prepare(`SELECT id, to_email, subject, body, created_at, COALESCE(sent,0) as sent FROM email_outbox ORDER BY id DESC LIMIT 100`).all();
  return jsonOk({ outbox: rows });
}

export function POST() {
  return methodNotAllowed(['GET', 'DELETE']);
}

export async function DELETE(req: NextRequest) {
  try {
    await requireAdmin(req);
  } catch {
    return jsonError('FORBIDDEN', { status: 403 });
  }
  const db = getDb();
  const { searchParams } = new URL(req.url);
  const id = Number(searchParams.get('id') || 0);
  try { db.prepare(`CREATE TABLE IF NOT EXISTS email_outbox (id INTEGER PRIMARY KEY AUTOINCREMENT, to_email TEXT, subject TEXT, body TEXT, created_at TEXT NOT NULL)`).run(); } catch {}
  if (id > 0) {
    db.prepare('DELETE FROM email_outbox WHERE id = ?').run(id);
  } else {
    db.prepare('DELETE FROM email_outbox').run();
  }
  return jsonOk();
}


