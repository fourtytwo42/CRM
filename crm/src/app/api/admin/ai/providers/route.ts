import { NextRequest } from 'next/server';
import { getDb } from '@/lib/db';
import { requireAdmin } from '@/lib/guard';
import { jsonOk, jsonError, methodNotAllowed } from '@/lib/http';
import { providerCatalog } from '@/lib/ai';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  try {
    await requireAdmin(req);
  } catch {
    return jsonError('FORBIDDEN', { status: 403 });
  }
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT id, provider, label, api_key, base_url, model, enabled, timeout_ms, priority, settings, created_at, updated_at FROM ai_providers ORDER BY priority ASC, id ASC`
    )
    .all() as Array<any>;
  const providers = rows.map((r) => ({
    id: r.id,
    provider: r.provider,
    label: r.label || null,
    baseUrl: r.base_url || null,
    model: r.model || null,
    enabled: !!r.enabled,
    timeoutMs: r.timeout_ms ?? null,
    priority: r.priority,
    settings: r.settings ? safeJsonParse(r.settings) : null,
    hasApiKey: !!(r.api_key && String(r.api_key).length > 0),
    created_at: r.created_at,
    updated_at: r.updated_at,
  }));
  return jsonOk({ providers, catalog: providerCatalog() });
}

export async function POST(req: NextRequest) {
  try {
    await requireAdmin(req);
  } catch {
    return jsonError('FORBIDDEN', { status: 403 });
  }
  let body: any;
  try { body = await req.json(); } catch { body = {}; }
  const provider: string = (body?.provider || '').toLowerCase();
  const label: string | null = body?.label || null;
  const baseUrl: string | null = body?.baseUrl || null;
  const priority: number = Number.isFinite(Number(body?.priority)) ? Number(body?.priority) : 1000;
  if (!provider) return jsonError('BAD_REQUEST', { status: 400, message: 'provider required' });
  const allowed = new Set(providerCatalog().map((p) => p.id));
  if (!allowed.has(provider as any)) return jsonError('BAD_PROVIDER', { status: 400, message: 'Unknown provider' });
  const db = getDb();
  const now = new Date().toISOString();
  const stmt = db.prepare(
    `INSERT INTO ai_providers (provider, label, api_key, base_url, model, enabled, timeout_ms, priority, settings, created_at, updated_at)
     VALUES (?, ?, NULL, ?, NULL, 0, NULL, ?, NULL, ?, ?)`
  );
  const info = stmt.run(provider, label, baseUrl, priority, now, now);
  const id = Number(info.lastInsertRowid);
  return jsonOk({
    id,
    provider,
    label,
    baseUrl,
    model: null,
    enabled: false,
    timeoutMs: null,
    priority,
    settings: null,
    hasApiKey: false,
    created_at: now,
    updated_at: now,
  }, { status: 201 });
}

export function PUT() { return methodNotAllowed(['GET','POST']); }
export function DELETE() { return methodNotAllowed(['GET','POST']); }

function safeJsonParse(s?: string | null): any {
  if (!s) return null;
  try { return JSON.parse(s); } catch { return null; }
}


