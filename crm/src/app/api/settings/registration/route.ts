import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { NextRequest } from 'next/server';
import { requireAdmin } from '@/lib/guard';
import { jsonOk } from '@/lib/http';

export const runtime = 'nodejs';

export async function GET() {
  const db = getDb();
  const settings = db
    .prepare('SELECT registration_enabled, email_verification_enabled FROM site_settings WHERE id = 1')
    .get() as { registration_enabled: number; email_verification_enabled?: number } | undefined;
  const registrationEnabled = settings ? settings.registration_enabled === 1 : true;
  const emailVerificationEnabled = settings ? settings.email_verification_enabled === 1 : false;
  return NextResponse.json(
    { ok: true, data: { registrationEnabled, emailVerificationEnabled } },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}

// Public GET for client header (no admin required) remains above.
// Add admin-protected GET/PUT under /api/admin/settings/registration (already implemented).


