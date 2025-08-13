import { NextRequest } from 'next/server';
import { requireAdmin } from '@/lib/guard';
import { jsonOk, jsonError } from '@/lib/http';
import { getEmailSettings, createTransporterFromSettings } from '@/lib/email';
import { getDb } from '@/lib/db';

export async function POST(req: NextRequest) {
  try { await requireAdmin(req); } catch { return jsonError('FORBIDDEN', { status: 403 }); }
  const body = await req.json().catch(() => null) as { to?: string; subject?: string; body?: string };
  const to = String(body?.to || '').trim();
  const subject = String(body?.subject || '').trim();
  const text = String(body?.body || '').trim();
  if (!to || !subject || !text) return jsonError('VALIDATION', { status: 400, message: 'to, subject, body required' });
  const cfg = getEmailSettings();
  if (!cfg) return jsonError('MISSING', { status: 400, message: 'SMTP not configured' });
  try {
    const transporter = createTransporterFromSettings(cfg);
    const info = await transporter.sendMail({ from: cfg.from_name ? `${cfg.from_name} <${cfg.from_email}>` : cfg.from_email, to, bcc: cfg.from_email, subject, text });
    const messageId = (info as any)?.messageId as string | undefined;
    const db = getDb();
    db.prepare(`INSERT INTO mail_messages (direction, from_email, to_email, subject, body, message_id, created_at, seen) VALUES ('out', ?, ?, ?, ?, ?, ?, 1)`).run(
      cfg.from_email,
      to,
      subject,
      text,
      messageId || null,
      new Date().toISOString(),
    );
    return jsonOk({ messageId });
  } catch (e: any) {
    return jsonError('SMTP_ERROR', { status: 400, message: e?.message || 'Failed to send' });
  }
}


