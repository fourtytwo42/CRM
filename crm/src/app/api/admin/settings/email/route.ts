import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { requireAdmin } from '@/lib/guard';
import { z } from 'zod';
import nodemailer from 'nodemailer';
import { createTransporterFromSettings, getEmailSettings } from '@/lib/email';
import { jsonOk, jsonError, methodNotAllowed } from '@/lib/http';

export const runtime = 'nodejs';

const EmailSchema = z.object({
  host: z.string().min(1),
  // Coerce common string inputs from forms into numbers/booleans
  port: z.coerce.number().int().min(1).max(65535).default(465),
  secure: z.coerce.boolean().default(true),
  username: z.string().nullable().optional(),
  password: z.string().nullable().optional(),
  from_email: z.string().email(),
  from_name: z.string().nullable().optional(),
});

export async function GET(req: NextRequest) {
  try {
    await requireAdmin(req);
  } catch {
    return jsonError('FORBIDDEN', { status: 403 });
  }
  const db = getDb();
  const row = db.prepare('SELECT host, port, secure, username, from_email, from_name FROM email_settings WHERE id = 1').get() as any;
  if (row) {
    row.port = Number(row.port || 0);
    row.secure = !!row.secure;
  }
  return jsonOk(row || null);
}

export function DELETE() {
  return NextResponse.json({ ok: false, error: { code: 'METHOD_NOT_ALLOWED' } }, { status: 405, headers: { 'Allow': 'GET, PUT, POST', 'Cache-Control': 'no-store' } });
}

export async function PUT(req: NextRequest) {
  try {
    await requireAdmin(req);
  } catch {
    return jsonError('FORBIDDEN', { status: 403 });
  }
  const body = await req.json().catch(() => null);
  const parsed = EmailSchema.safeParse(body);
  if (!parsed.success) return jsonError('VALIDATION', { status: 400 });
  const { host, port, secure, username, password, from_email, from_name } = parsed.data;
  const db = getDb();
  db.prepare('UPDATE email_settings SET host = ?, port = ?, secure = ?, username = ?, from_email = ?, from_name = ?, updated_at = ? WHERE id = 1')
    .run(host, Number(port), secure ? 1 : 0, username ?? null, from_email, from_name ?? null, new Date().toISOString());
  if (password === null) {
    db.prepare('UPDATE email_settings SET password = NULL, updated_at = ? WHERE id = 1')
      .run(new Date().toISOString());
  } else if (typeof password === 'string' && password.length > 0) {
    db.prepare('UPDATE email_settings SET password = ?, updated_at = ? WHERE id = 1')
      .run(password, new Date().toISOString());
  }
  return jsonOk();
}

export async function POST(req: NextRequest) {
  // Test connection using settings persisted in DB only (ignores request body)
  try {
    await requireAdmin(req);
  } catch {
    return jsonError('FORBIDDEN', { status: 403 });
  }
  try {
    const cfg = getEmailSettings();
    if (!cfg) return jsonError('MISSING', { status: 400, message: 'SMTP host not configured.' });
    const transporter = createTransporterFromSettings(cfg);
    await transporter.verify();
    return jsonOk();
  } catch (e: any) {
    const details = { code: e?.code, command: e?.command, response: e?.response, responseCode: e?.responseCode };
    return jsonError('SMTP_ERROR', { status: 400, message: e?.message || 'Failed to connect.', details });
  }
}


