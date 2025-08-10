import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { NextRequest } from 'next/server';
import { requireAdmin } from '@/lib/guard';
import { jsonOk } from '@/lib/http';

export const runtime = 'nodejs';

export async function GET() {
  const db = getDb();
  const settings = db.prepare('SELECT registration_enabled FROM site_settings WHERE id = 1').get() as { registration_enabled: number } | undefined;
  const enabled = settings ? settings.registration_enabled === 1 : true;
  return NextResponse.json(
    { ok: true, data: { registrationEnabled: enabled } },
    { headers: { 'Cache-Control': 'public, max-age=300, stale-while-revalidate=300' } }
  );
}

// Public GET for client header (no admin required) remains above.
// Add admin-protected GET/PUT under /api/admin/settings/registration (already implemented).


