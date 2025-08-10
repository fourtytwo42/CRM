import { NextRequest } from 'next/server';
import { getDb } from '@/lib/db';
import { requireAdmin } from '@/lib/guard';
import { jsonOk, jsonError } from '@/lib/http';
import { fetchModels } from '@/lib/ai';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    await requireAdmin(req);
  } catch {
    return jsonError('FORBIDDEN', { status: 403 });
  }
  let body: any; try { body = await req.json(); } catch { body = {}; }
  const id = Number(body?.id);
  const providerOverride: string | undefined = body?.provider;
  if (!Number.isFinite(id) && !providerOverride) return jsonError('BAD_REQUEST', { status: 400, message: 'id or provider required' });
  const db = getDb();
  let cfg: any;
  if (Number.isFinite(id)) {
    cfg = db.prepare(`SELECT provider, api_key, base_url, timeout_ms FROM ai_providers WHERE id = ?`).get(id) as any;
    if (!cfg) return jsonError('NOT_FOUND', { status: 404 });
  } else {
    cfg = { provider: providerOverride, api_key: body?.apiKey || null, base_url: body?.baseUrl || null, timeout_ms: body?.timeoutMs || null };
  }
  try {
    const models = await fetchModels({
      provider: cfg.provider,
      // Prefer explicit overrides from request body; fall back to stored config
      apiKey: body?.apiKey || cfg.api_key || null,
      baseUrl: body?.baseUrl || cfg.base_url || null,
      timeoutMs: body?.timeoutMs || cfg.timeout_ms || null,
    } as any);
    return jsonOk({ models });
  } catch (e: any) {
    return jsonError('FETCH_MODELS_FAILED', { status: 400, message: e?.message || 'failed' });
  }
}

export function GET() { return jsonError('METHOD_NOT_ALLOWED', { status: 405 }); }
export function PUT() { return jsonError('METHOD_NOT_ALLOWED', { status: 405 }); }
export function DELETE() { return jsonError('METHOD_NOT_ALLOWED', { status: 405 }); }


