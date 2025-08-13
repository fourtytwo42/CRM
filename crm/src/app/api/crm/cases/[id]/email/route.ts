import { NextRequest } from 'next/server';
import { getDb } from '@/lib/db';
import { requireAuth } from '@/lib/guard';
import { jsonOk, jsonError, methodNotAllowed } from '@/lib/http';
import { getEmailSettings, createTransporterFromSettings } from '@/lib/email';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const me = await requireAuth(req);
  if (me.status !== 'active') return jsonError('FORBIDDEN', { status: 403 });
  const db = getDb();
  const body = await req.json().catch(()=>null) as { to?: string; subject?: string; body?: string } | null;
  const to = String(body?.to || '').trim();
  let subject = String(body?.subject || '').trim();
  const text = String(body?.body || '').trim();
  if (!to || !subject || !text) return jsonError('VALIDATION', { status: 400, message: 'to, subject, body required' });
  const cs = db.prepare(`SELECT case_number, customer_id FROM cases WHERE id = ?`).get(Number(params.id)) as any;
  if (!cs) return jsonError('NOT_FOUND', { status: 404 });
  const tag = `[${cs.case_number}]`;
  if (!subject.includes(tag)) subject = `${subject} ${tag}`.trim();
  const cfg = getEmailSettings(); if (!cfg) return jsonError('MISSING', { status: 400, message: 'SMTP not configured' });
  const transporter = createTransporterFromSettings(cfg);
  const info = await transporter.sendMail({ from: cfg.from_name ? `${cfg.from_name} <${cfg.from_email}>` : cfg.from_email, to, bcc: cfg.from_email, subject, text });
  const messageId = (info as any)?.messageId as string | undefined;
  db.prepare(`INSERT INTO communications (type, direction, subject, body, customer_id, agent_user_id, campaign_id, case_id, message_id, created_at) VALUES ('email','out',?,?,?,?,?,?,?, ? )`).run(
    subject,
    text,
    Number(cs.customer_id),
    me.id,
    null,
    Number(params.id),
    messageId || null,
    new Date().toISOString(),
  );
  return jsonOk({ messageId });
}

export function GET() { return methodNotAllowed(['POST']); }
export function PUT() { return methodNotAllowed(['POST']); }
export function DELETE() { return methodNotAllowed(['POST']); }


