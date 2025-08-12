import { NextRequest } from 'next/server';
import { env } from '@/lib/env';
import { randomUUID } from 'crypto';
import { requireAdmin } from '@/lib/guard';
import { getDb } from '@/lib/db';
import { jsonError, jsonOk, methodNotAllowed } from '@/lib/http';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  try {
    await requireAdmin(req);
  } catch {
    return jsonError('FORBIDDEN', { status: 403 });
  }
  const db = getDb();
  const row = db.prepare("SELECT provider, bulkvs_base_url as baseUrl, (bulkvs_basic_auth IS NOT NULL AND bulkvs_basic_auth != '') as hasBasicAuth, bulkvs_from_did as fromDid, (inbound_token IS NOT NULL AND inbound_token != '') as hasToken, inbound_token as token, twilio_account_sid as twilioAccountSid, (twilio_auth_token IS NOT NULL AND twilio_auth_token != '') as hasTwilioAuth, twilio_from_number as twilioFrom, twilio_messaging_service_sid as twilioMessagingServiceSid, updated_at FROM telephony_settings WHERE id = 1").get() as any;
  // Build webhook URLs if possible
  let base = (env.publicBaseUrl || '').trim();
  if (!base) {
    try { const u = new URL(req.url); base = `${u.protocol}//${u.host}`; } catch {}
  }
  const smsUrl = base ? `${base}/api/telephony/inbound/sms${row?.token ? `?token=${row.token}` : ''}` : null;
  const voiceUrl = base ? `${base}/api/telephony/inbound/voice${row?.token ? `?token=${row.token}` : ''}` : null;
  if (row) delete row.token; // do not expose raw token by default
  return jsonOk({ ...(row || null), webhookSmsUrl: smsUrl, webhookVoiceUrl: voiceUrl });
}

export async function PUT(req: NextRequest) {
  try {
    await requireAdmin(req);
  } catch {
    return jsonError('FORBIDDEN', { status: 403 });
  }
  const db = getDb();
  const body = await req.json().catch(() => ({} as any)) as { provider?: string; baseUrl?: string; basicAuth?: string | null; fromDid?: string | null; regenToken?: boolean; clearToken?: boolean; twilioAccountSid?: string | null; twilioAuthToken?: string | null; twilioFrom?: string | null; twilioMessagingServiceSid?: string | null };
  const now = new Date().toISOString();
  const current = db.prepare('SELECT provider, bulkvs_base_url, bulkvs_basic_auth, bulkvs_from_did, inbound_token, twilio_account_sid, twilio_auth_token, twilio_from_number, twilio_messaging_service_sid FROM telephony_settings WHERE id = 1').get() as any;
  const provider = (body?.provider ?? current?.provider ?? 'bulkvs');
  const baseUrl = (body?.baseUrl ?? current?.bulkvs_base_url ?? 'https://portal.bulkvs.com/api/v1.0');
  // For security: if basicAuth field is omitted, do not change. If null, clear it. If non-empty string, set it.
  const hasBasicAuthField = Object.prototype.hasOwnProperty.call(body || {}, 'basicAuth');
  const basicAuth = hasBasicAuthField ? (body?.basicAuth ?? null) : (current?.bulkvs_basic_auth ?? null);
  const fromDid = (Object.prototype.hasOwnProperty.call(body || {}, 'fromDid') ? (body?.fromDid ?? null) : (current?.bulkvs_from_did ?? null));
  let inboundToken: string | null | undefined = current?.inbound_token ?? null;
  if (body?.regenToken) inboundToken = randomUUID().replace(/-/g, '');
  if (body?.clearToken) inboundToken = null;
  // Twilio fields (do not echo secrets)
  const twilioAccountSid = (Object.prototype.hasOwnProperty.call(body || {}, 'twilioAccountSid') ? (body?.twilioAccountSid ?? null) : (current?.twilio_account_sid ?? null));
  const hasTwilioAuthField = Object.prototype.hasOwnProperty.call(body || {}, 'twilioAuthToken');
  const twilioAuthToken = hasTwilioAuthField ? (body?.twilioAuthToken ?? null) : (current?.twilio_auth_token ?? null);
  const twilioFrom = (Object.prototype.hasOwnProperty.call(body || {}, 'twilioFrom') ? (body?.twilioFrom ?? null) : (current?.twilio_from_number ?? null));
  const twilioMessagingServiceSid = (Object.prototype.hasOwnProperty.call(body || {}, 'twilioMessagingServiceSid') ? (body?.twilioMessagingServiceSid ?? null) : (current?.twilio_messaging_service_sid ?? null));

  db.prepare('INSERT OR IGNORE INTO telephony_settings (id, provider, bulkvs_base_url, bulkvs_basic_auth, bulkvs_from_did, inbound_token, twilio_account_sid, twilio_auth_token, twilio_from_number, twilio_messaging_service_sid, updated_at) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run(provider, baseUrl, basicAuth, fromDid, inboundToken, twilioAccountSid, twilioAuthToken, twilioFrom, twilioMessagingServiceSid, now);
  db.prepare('UPDATE telephony_settings SET provider = ?, bulkvs_base_url = ?, bulkvs_basic_auth = ?, bulkvs_from_did = ?, inbound_token = ?, twilio_account_sid = ?, twilio_auth_token = ?, twilio_from_number = ?, twilio_messaging_service_sid = ?, updated_at = ? WHERE id = 1')
    .run(provider, baseUrl, basicAuth, fromDid, inboundToken, twilioAccountSid, twilioAuthToken, twilioFrom, twilioMessagingServiceSid, now);
  const out = db.prepare("SELECT provider, bulkvs_base_url as baseUrl, (bulkvs_basic_auth IS NOT NULL AND bulkvs_basic_auth != '') as hasBasicAuth, bulkvs_from_did as fromDid, (inbound_token IS NOT NULL AND inbound_token != '') as hasToken, (twilio_auth_token IS NOT NULL AND twilio_auth_token != '') as hasTwilioAuth, updated_at FROM telephony_settings WHERE id = 1").get();
  return jsonOk(out);
}

export function POST() { return methodNotAllowed(['GET','PUT']); }
export function DELETE() { return methodNotAllowed(['GET','PUT']); }


