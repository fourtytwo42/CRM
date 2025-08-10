import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { requireAdmin } from '@/lib/guard';
import { jsonOk, jsonError, methodNotAllowed } from '@/lib/http';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  try {
    await requireAdmin(req);
  } catch {
    return jsonError('FORBIDDEN', { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const q = (searchParams.get('q') || '').toLowerCase();
  // Robust limit parsing to avoid NaN propagating into SQL LIMIT
  const rawLimit = searchParams.get('limit');
  const parsedLimit = rawLimit !== null ? parseInt(String(rawLimit), 10) : 25;
  const limit = Number.isFinite(parsedLimit) && parsedLimit > 0
    ? Math.min(parsedLimit, 100)
    : 25;
  const cursor = searchParams.get('cursor');
  const sort = (searchParams.get('sort') || 'created_at').replace(/[^a-z_]/g, '');
  const dir = (searchParams.get('dir') || 'desc').toLowerCase() === 'asc' ? 'ASC' : 'DESC';

  const sortColumns = new Set(['username','role','status','created_at','last_login_at','last_seen_at']);
  const sortCol = sortColumns.has(sort) ? sort : 'created_at';

  const db = getDb();
  const clauses: string[] = [];
  const params: any[] = [];
  if (q) {
    clauses.push('LOWER(username) LIKE ?');
    params.push(`%${q}%`);
  }
  if (cursor) {
    // Cursor is the last seen sort value and id to disambiguate ties, in JSON: {v: value, id}
    try {
      const c = JSON.parse(cursor);
      if (dir === 'DESC') {
        clauses.push(`(${sortCol} < ? OR (${sortCol} = ? AND id < ?))`);
      } else {
        clauses.push(`(${sortCol} > ? OR (${sortCol} = ? AND id > ?))`);
      }
      params.push(c.v, c.v, c.id);
    } catch {}
  }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const rows = db.prepare(`
    SELECT id, username, email, role, status, avatar_url, theme_preference, created_at, last_login_at, last_seen_at
    FROM users
    ${where}
    ORDER BY ${sortCol} ${dir}, id ${dir}
    LIMIT ?
  `).all(...params, limit) as Array<any>;
  let nextCursor: string | null = null;
  if (rows.length === limit) {
    const last = rows[rows.length - 1] as any;
    nextCursor = JSON.stringify({ v: last[sortCol], id: last.id });
  }
  return jsonOk({ users: rows, nextCursor });
}

export function POST() {
  return methodNotAllowed(['GET']);
}


