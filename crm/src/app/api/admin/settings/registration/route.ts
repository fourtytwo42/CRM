import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { requireAdmin } from '@/lib/guard';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  try {
    await requireAdmin(req);
  } catch {
    return NextResponse.json({ ok: false }, { status: 403, headers: { 'Cache-Control': 'no-store' } });
  }
  const db = getDb();
  const settings = db.prepare('SELECT registration_enabled, email_verification_enabled FROM site_settings WHERE id = 1').get() as { registration_enabled: number, email_verification_enabled: number };
  return NextResponse.json({ ok: true, data: { registrationEnabled: settings?.registration_enabled === 1, emailVerificationEnabled: settings?.email_verification_enabled === 1 } }, { headers: { 'Cache-Control': 'no-store' } });
}

export function POST() {
  return NextResponse.json({ ok: false, error: { code: 'METHOD_NOT_ALLOWED' } }, { status: 405, headers: { 'Allow': 'GET, PUT', 'Cache-Control': 'no-store' } });
}

export async function PUT(req: NextRequest) {
  try {
    await requireAdmin(req);
  } catch {
    return NextResponse.json({ ok: false }, { status: 403, headers: { 'Cache-Control': 'no-store' } });
  }
  const body = await req.json().catch(() => null) as { enabled?: boolean, emailVerificationEnabled?: boolean };
  const db = getDb();
  db.prepare('INSERT OR IGNORE INTO site_settings (id, registration_enabled) VALUES (1, 1)').run();
  const current = db.prepare('SELECT registration_enabled, email_verification_enabled FROM site_settings WHERE id = 1').get() as { registration_enabled: number; email_verification_enabled: number };
  const newRegistrationEnabled = body?.enabled === undefined ? (current?.registration_enabled === 1) : !!body.enabled;
  const newEmailVerificationEnabled = body?.emailVerificationEnabled === undefined ? (current?.email_verification_enabled === 1) : !!body.emailVerificationEnabled;
  db.prepare('UPDATE site_settings SET registration_enabled = ?, email_verification_enabled = ? WHERE id = 1')
    .run(newRegistrationEnabled ? 1 : 0, newEmailVerificationEnabled ? 1 : 0);
  return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
}


