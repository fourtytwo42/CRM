import { NextRequest } from 'next/server';
import { getDb } from '@/lib/db';
import { jsonOk, jsonError } from '@/lib/http';
import { requireAuth } from '@/lib/guard';
import { chatWithFailover, ChatMessage } from '@/lib/ai';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const me = await requireAuth(req);
  if (me.status !== 'active') return jsonError('FORBIDDEN', { status: 403 });
  let body: any; try { body = await req.json(); } catch { body = {}; }
  const customerId = Number(body?.customerId || 0) || null;
  const toEmail = typeof body?.to === 'string' ? String(body.to).trim() : '';

  const db = getDb();
  // Find last inbound email body for context
  let lastInbound: { subject?: string|null; body?: string|null } | null = null;
  let customerName: string = '';
  if (customerId) {
    const info = db.prepare(`SELECT full_name, email FROM customers WHERE id = ?`).get(customerId) as any;
    if (info) customerName = info.full_name || info.email || '';
    lastInbound = db.prepare(`SELECT subject, body FROM communications WHERE customer_id = ? AND type='email' AND direction='in' ORDER BY created_at DESC LIMIT 1`).get(customerId) as any || null;
  } else if (toEmail) {
    const info = db.prepare(`SELECT id, full_name FROM customers WHERE email = ?`).get(toEmail) as any;
    if (info) { customerName = info.full_name || toEmail; }
    if (info?.id) lastInbound = db.prepare(`SELECT subject, body FROM communications WHERE customer_id = ? AND type='email' AND direction='in' ORDER BY created_at DESC LIMIT 1`).get(info.id) as any || null;
  }

  // Build AI prompt
  const sys: ChatMessage = {
    role: 'system',
    content: 'You write professional, friendly customer emails. Reply ONLY with strict JSON like {"subject":"...","body":"..."}. Do not include markdown or extra commentary.'
  };
  const user: ChatMessage = {
    role: 'user',
    content: `Generate an email subject and body.
Customer: ${customerName || toEmail || 'Unknown'}
Last message from customer:
${(lastInbound?.body || '').slice(0, 4000)}
`,
  };

  // Load enabled AI providers
  const rows = db.prepare(`
    SELECT provider, api_key, base_url, model, enabled, timeout_ms, priority, max_tokens, settings
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
    maxTokens: r.max_tokens || undefined,
    settings: r.settings ? safeJsonParse(r.settings) : undefined 
  }));
  if (configs.length === 0) return jsonError('NO_PROVIDERS', { status: 400, message: 'No enabled AI providers' });

  const result = await chatWithFailover(configs as any, [sys, user]);
  if (!result.ok) {
    return jsonError(result.error?.code || 'AI_FAILED', { status: 400, message: result.error?.message || 'AI failed', details: { tried: result.tried } });
  }

  const content = String(result.content || '').trim();
  let subject = '';
  let bodyText = '';
  try {
    const parsed = JSON.parse(content);
    subject = String(parsed.subject || '').trim();
    bodyText = String(parsed.body || '').trim();
  } catch {
    // Attempt to extract JSON blob
    try {
      const m = content.match(/\{[\s\S]*\}/);
      if (m) {
        const parsed = JSON.parse(m[0]);
        subject = String(parsed.subject || '').trim();
        bodyText = String(parsed.body || '').trim();
      }
    } catch {}
  }
  if (!subject && !bodyText) return jsonError('BAD_AI_OUTPUT', { status: 400, message: 'AI did not return valid JSON with subject/body' });
  return jsonOk({ subject, body: bodyText });
}

function safeJsonParse(s?: string | null): any { if (!s) return null; try { return JSON.parse(s); } catch { return null; } }


