import { NextRequest } from 'next/server';
import { getDb } from '@/lib/db';
import { requireAuth } from '@/lib/guard';
import { jsonOk, jsonError, methodNotAllowed } from '@/lib/http';
import { getEmailSettings, createTransporterFromSettings } from '@/lib/email';

export const runtime = 'nodejs';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const me = await requireAuth(req);
  if (me.status !== 'active') return jsonError('FORBIDDEN', { status: 403 });
  const body = await req.json().catch(() => null) as { to?: string; subject?: string; body?: string; in_reply_to?: string | null; references?: string[] | null };
  const to = String(body?.to || '').trim();
  let subject = String(body?.subject || '').trim();
  const text = String(body?.body || '').trim();
  const inReplyTo = body?.in_reply_to ? String(body.in_reply_to) : undefined;
  const references = Array.isArray(body?.references) ? body!.references!.map(String) : undefined;
  if (!to || !subject || !text) return jsonError('VALIDATION', { status: 400, message: 'to, subject, body required' });

  const cfg = getEmailSettings();
  if (!cfg) return jsonError('MISSING', { status: 400, message: 'SMTP not configured' });
  const transporter = createTransporterFromSettings(cfg);

  // Build headers for threading
  const headers: Record<string,string> = {};
  if (inReplyTo) headers['In-Reply-To'] = inReplyTo;
  if (references && references.length) headers['References'] = references.join(' ');

  try {
    // If a case exists for this customer and in-reply context is not provided, tag with latest case number
    try {
      const db = getDb();
      const row = db.prepare(`SELECT case_number FROM cases WHERE customer_id = ? ORDER BY created_at DESC LIMIT 1`).get(Number(params.id)) as any;
      if (row && row.case_number) {
        const tag = `[${row.case_number}]`;
        if (!subject.includes(tag)) subject = `${subject} ${tag}`.trim();
        if (!subject || /^re:\s*$/i.test(subject)) subject = `${tag}`;
      }
    } catch {}
    const info = await transporter.sendMail({
      from: cfg.from_name ? `${cfg.from_name} <${cfg.from_email}>` : cfg.from_email,
      to,
      bcc: cfg.from_email,
      subject,
      text,
      headers,
    });
    const messageId = (info as any)?.messageId as string | undefined;
    // eslint-disable-next-line no-console
    console.log('[email:crm] sent', {
      to,
      subject,
      messageId,
      accepted: (info as any)?.accepted,
      rejected: (info as any)?.rejected,
      response: (info as any)?.response,
    });
    const db = getDb();
    db.prepare(`INSERT INTO communications (type, direction, subject, body, customer_id, agent_user_id, campaign_id, message_id, in_reply_to, references_header, created_at) VALUES ('email','out',?,?,?,?,?,?,?, ?, ?)`).run(
      subject,
      text,
      Number(params.id),
      me.id,
      null,
      messageId || null,
      inReplyTo || null,
      references ? references.join(' ') : null,
      new Date().toISOString(),
    );
    // Also record in site-wide mail_messages so it appears in Admin Sent mailbox
    try {
      db.prepare(`
        INSERT INTO mail_messages (direction, from_email, to_email, subject, body, message_id, in_reply_to, references_header, created_at, seen)
        VALUES ('out', ?, ?, ?, ?, ?, ?, ?, ?, 1)
      `).run(
        cfg.from_email,
        to,
        subject,
        text,
        messageId || null,
        inReplyTo || null,
        references ? references.join(' ') : null,
        new Date().toISOString(),
      );
    } catch {}
    return jsonOk({ messageId });
  } catch (e: any) {
    return jsonError('SMTP_ERROR', { status: 400, message: e?.message || 'Failed to send' });
  }
}

export function GET() { return methodNotAllowed(['POST']); }
export function PUT() { return methodNotAllowed(['POST']); }
export function DELETE() { return methodNotAllowed(['POST']); }


