import { NextRequest } from 'next/server';
import { getDb } from '@/lib/db';
import { requireAdmin } from '@/lib/guard';
import { jsonOk, jsonError } from '@/lib/http';
import { chatWithFailover, ChatMessage } from '@/lib/ai';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    await requireAdmin(req);
  } catch {
    return jsonError('FORBIDDEN', { status: 403 });
  }
  let body: any; try { body = await req.json(); } catch { body = {}; }
  const messages: ChatMessage[] = Array.isArray(body?.messages) ? body.messages : [];
  if (messages.length === 0) return jsonError('BAD_REQUEST', { status: 400, message: 'messages required' });
  const db = getDb();
  const rows = db.prepare(`
    SELECT provider, api_key, base_url, model, enabled, timeout_ms, priority, settings
    FROM ai_providers
    WHERE enabled = 1
    ORDER BY priority ASC, id ASC
  `).all() as Array<any>;
  const configs = rows.map((r) => ({
    provider: r.provider,
    apiKey: r.api_key || undefined,
    baseUrl: r.base_url || undefined,
    model: r.model || undefined,
    timeoutMs: r.timeout_ms || undefined,
    settings: r.settings ? safeJsonParse(r.settings) : undefined,
  }));
  if (configs.length === 0) return jsonError('NO_PROVIDERS', { status: 400, message: 'No enabled providers' });
  const result = await chatWithFailover(configs as any, messages);
  if (!result.ok) {
    // Attach more diagnostics for debugging and log on server
    const details = {
      tried: result.tried,
      providers: configs.map((c) => ({ provider: c.provider, model: c.model, baseUrl: c.baseUrl ? redactUrl(c.baseUrl) : null })),
      messageCount: messages.length,
      roles: messages.map((m) => m.role),
    };
    try {
      // eslint-disable-next-line no-console
      console.error('[ai-chat] failure', {
        code: result.error?.code,
        message: result.error?.message,
        ...details,
      });
    } catch {}
    return jsonError(result.error?.code || 'FAILED', {
      status: 400,
      message: result.error?.message,
      details,
    });
  }
  return jsonOk({ content: result.content, provider: result.provider, model: result.model, tried: result.tried });
}

export function GET() { return jsonError('METHOD_NOT_ALLOWED', { status: 405 }); }
export function PUT() { return jsonError('METHOD_NOT_ALLOWED', { status: 405 }); }
export function DELETE() { return jsonError('METHOD_NOT_ALLOWED', { status: 405 }); }

function safeJsonParse(s?: string | null): any {
  if (!s) return null; try { return JSON.parse(s); } catch { return null; }
}

function redactUrl(u: string): string {
  try { const url = new URL(u); url.username = ''; url.password = ''; return url.toString(); } catch { return u; }
}


