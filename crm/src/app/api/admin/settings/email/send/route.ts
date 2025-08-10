import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/guard';
import { z } from 'zod';
import nodemailer from 'nodemailer';
import { createTransporterFromSettings, getEmailSettings } from '@/lib/email';
import { getDb } from '@/lib/db';
import { jsonOk, jsonError, methodNotAllowed } from '@/lib/http';

export const runtime = 'nodejs';

const Schema = z.object({
  to: z.string().email(),
});

export async function POST(req: NextRequest) {
  try {
    await requireAdmin(req);
  } catch {
    return jsonError('FORBIDDEN', { status: 403 });
  }
  const body = await req.json().catch(() => null);
  const parsed = Schema.safeParse(body);
  if (!parsed.success) return jsonError('VALIDATION', { status: 400 });
  const { to } = parsed.data;
  try {
    // Always use stored settings from DB for sending
    const cfg = getEmailSettings();
    if (!cfg) return jsonError('MISSING', { status: 400, message: 'SMTP not configured.' });
    const transporter = createTransporterFromSettings(cfg);
    const info = await transporter.sendMail({
      from: cfg.from_name ? `${cfg.from_name} <${cfg.from_email}>` : cfg.from_email,
      to,
      subject: 'Test Email',
      text: 'This is a test email from your SMTP settings.',
    });
    return jsonOk({ messageId: info.messageId });
  } catch (e: any) {
    const details = { code: e?.code, command: e?.command, response: e?.response, responseCode: e?.responseCode };
    return jsonError('SMTP_ERROR', { status: 400, message: e?.message || 'Failed to send.', details });
  }
}

export function GET() {
  return methodNotAllowed(['POST']);
}


