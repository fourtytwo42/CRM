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
  // IMAP
  imap_host: z.string().nullable().optional(),
  imap_port: z.coerce.number().int().min(1).max(65535).nullable().optional(),
  imap_secure: z.coerce.boolean().nullable().optional(),
  imap_username: z.string().nullable().optional(),
  imap_password: z.string().nullable().optional(),
  imap_enabled: z.coerce.boolean().nullable().optional(),
  imap_poll_seconds: z.coerce.number().int().min(15).max(3600).nullable().optional(),
});

export async function GET(req: NextRequest) {
  try {
    await requireAdmin(req);
  } catch {
    return jsonError('FORBIDDEN', { status: 403 });
  }
  const db = getDb();
  const row = db.prepare('SELECT host, port, secure, username, password, from_email, from_name, imap_host, imap_port, imap_secure, imap_username, imap_password, imap_enabled, imap_poll_seconds FROM email_settings WHERE id = 1').get() as any;
  if (row) {
    row.port = Number(row.port || 0);
    row.secure = !!row.secure;
    row.hasPassword = !!(row.password && String(row.password).length > 0);
    row.imapHasPassword = !!(row.imap_password && String(row.imap_password).length > 0);
    row.imap_secure = !!row.imap_secure;
    row.imap_enabled = !!row.imap_enabled;
    delete row.password;
    delete row.imap_password;
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
  const { host, port, secure, username, password, from_email, from_name, imap_host, imap_port, imap_secure, imap_username, imap_password, imap_enabled, imap_poll_seconds } = parsed.data as any;
  const db = getDb();
  db.prepare('UPDATE email_settings SET host = ?, port = ?, secure = ?, username = ?, from_email = ?, from_name = ?, imap_host = ?, imap_port = ?, imap_secure = ?, imap_username = ?, imap_enabled = ?, imap_poll_seconds = ?, updated_at = ? WHERE id = 1')
    .run(host, Number(port), secure ? 1 : 0, username ?? null, from_email, from_name ?? null, imap_host ?? null, imap_port ?? null, imap_secure ? 1 : 0, imap_username ?? null, imap_enabled ? 1 : 0, imap_poll_seconds ?? 60, new Date().toISOString());
  if (password === null) {
    db.prepare('UPDATE email_settings SET password = NULL, updated_at = ? WHERE id = 1')
      .run(new Date().toISOString());
  } else if (typeof password === 'string' && password.length > 0) {
    db.prepare('UPDATE email_settings SET password = ?, updated_at = ? WHERE id = 1')
      .run(password, new Date().toISOString());
  }
  if (imap_password === null) {
    db.prepare('UPDATE email_settings SET imap_password = NULL, updated_at = ? WHERE id = 1')
      .run(new Date().toISOString());
  } else if (typeof imap_password === 'string' && imap_password.length > 0) {
    db.prepare('UPDATE email_settings SET imap_password = ?, updated_at = ? WHERE id = 1')
      .run(imap_password, new Date().toISOString());
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


