import { NextRequest } from 'next/server';
import { requireAdmin } from '@/lib/guard';
import { getDb } from '@/lib/db';
import { jsonOk, jsonError, methodNotAllowed } from '@/lib/http';

export async function GET(req: NextRequest) {
  await requireAdmin(req);
  const db = getDb();
  const row = db.prepare(`SELECT registration_enabled AS registrationEnabled, email_verification_enabled AS emailVerificationEnabled, default_campaign_id AS defaultCampaignId FROM site_settings WHERE id = 1`).get() as any;
  return jsonOk({
    registrationEnabled: !!(row && row.registrationEnabled),
    emailVerificationEnabled: !!(row && row.emailVerificationEnabled),
    defaultCampaignId: row ? row.defaultCampaignId || null : null,
  });
}

export async function PUT(req: NextRequest) {
  await requireAdmin(req);
  const db = getDb();
  const body = await req.json().catch(()=>null) as { defaultCampaignId?: number|null } | null;
  if (!body || (body.defaultCampaignId !== null && !Number.isFinite(Number(body.defaultCampaignId)))) {
    return jsonError('VALIDATION', { status: 400 });
  }
  db.prepare(`UPDATE site_settings SET default_campaign_id = ? WHERE id = 1`).run(body.defaultCampaignId == null ? null : Number(body.defaultCampaignId));
  return jsonOk();
}

export function POST() { return methodNotAllowed(['GET','PUT']); }
export function DELETE() { return methodNotAllowed(['GET','PUT']); }


