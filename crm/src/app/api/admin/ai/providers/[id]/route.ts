import { NextRequest } from 'next/server';
import { getDb } from '@/lib/db';
import { requireAdmin } from '@/lib/guard';
import { jsonOk, jsonError, methodNotAllowed } from '@/lib/http';

export const runtime = 'nodejs';

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requireAdmin(req);
  } catch {
    return jsonError('FORBIDDEN', { status: 403 });
  }
  const id = Number(params.id);
  if (!Number.isFinite(id)) return jsonError('BAD_REQUEST', { status: 400 });
  let body: any; try { body = await req.json(); } catch { body = {}; }
  const fields: string[] = [];
  const values: any[] = [];
  const allowed = new Set(['label','baseUrl','apiKey','model','enabled','timeoutMs','priority','settings']);
  for (const key of Object.keys(body || {})) {
    if (!allowed.has(key)) continue;
    switch (key) {
      case 'label': fields.push('label = ?'); values.push(body[key]); break;
      case 'baseUrl': fields.push('base_url = ?'); values.push(body[key]); break;
      case 'apiKey':
        // Only update when provided; allow clearing with explicit null
        if (Object.prototype.hasOwnProperty.call(body, 'apiKey')) {
          fields.push('api_key = ?'); values.push(body[key] ?? null);
        }
        break;
      case 'model': fields.push('model = ?'); values.push(body[key] || null); break;
      case 'enabled': fields.push('enabled = ?'); values.push(body[key] ? 1 : 0); break;
      case 'timeoutMs': fields.push('timeout_ms = ?'); values.push(Number.isFinite(Number(body[key])) ? Number(body[key]) : null); break;
      case 'priority': fields.push('priority = ?'); values.push(Number.isFinite(Number(body[key])) ? Number(body[key]) : 1000); break;
      case 'settings': fields.push('settings = ?'); values.push(body[key] ? JSON.stringify(body[key]) : null); break;
    }
  }
  if (fields.length === 0) return jsonError('BAD_REQUEST', { status: 400, message: 'no fields' });
  fields.push('updated_at = ?'); values.push(new Date().toISOString());
  values.push(id);
  const db = getDb();
  const info = db.prepare(`UPDATE ai_providers SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  if (info.changes === 0) return jsonError('NOT_FOUND', { status: 404 });
  const row = db.prepare(`SELECT id, provider, label, api_key, base_url, model, enabled, timeout_ms, priority, settings, created_at, updated_at FROM ai_providers WHERE id = ?`).get(id) as any;
  return jsonOk({
    id: row.id,
    provider: row.provider,
    label: row.label || null,
    baseUrl: row.base_url || null,
    model: row.model || null,
    enabled: !!row.enabled,
    timeoutMs: row.timeout_ms ?? null,
    priority: row.priority,
    settings: row.settings ? safeJsonParse(row.settings) : null,
    hasApiKey: !!(row.api_key && String(row.api_key).length > 0),
    created_at: row.created_at,
    updated_at: row.updated_at,
  });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requireAdmin(req);
  } catch {
    return jsonError('FORBIDDEN', { status: 403 });
  }
  const id = Number(params.id);
  if (!Number.isFinite(id)) return jsonError('BAD_REQUEST', { status: 400 });
  const db = getDb();
  const info = db.prepare(`DELETE FROM ai_providers WHERE id = ?`).run(id);
  if (info.changes === 0) return jsonError('NOT_FOUND', { status: 404 });
  return jsonOk({ deleted: true });
}

export function GET() { return methodNotAllowed(['PUT','DELETE']); }
export function POST() { return methodNotAllowed(['PUT','DELETE']); }

function safeJsonParse(s?: string | null): any {
  if (!s) return null;
  try { return JSON.parse(s); } catch { return null; }
}


