import { NextRequest } from 'next/server';
import { requireAdmin } from '@/lib/guard';
import { jsonError, jsonOk, methodNotAllowed } from '@/lib/http';
import { env } from '@/lib/env';
import { getDb } from '@/lib/db';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    await requireAdmin(req);
  } catch {
    return jsonError('FORBIDDEN', { status: 403 });
  }
  const db = getDb();
  const ts = db.prepare('SELECT bulkvs_base_url as baseUrl, bulkvs_basic_auth as basicAuth, bulkvs_from_did as fromDid FROM telephony_settings WHERE id = 1').get() as { baseUrl?: string; basicAuth?: string; fromDid?: string } | undefined;
  const defaultFrom = (ts?.fromDid || env.bulkvsDefaultFromDid || '').trim();
  const body = await req.json().catch(() => ({} as any)) as { to?: string; from?: string; body?: string; mediaUrl?: string };
  const to = String(body?.to || '').trim();
  const from = String((body?.from || defaultFrom || '')).trim();
  const text = String(body?.body || '').trim();
  const mediaUrl = String(body?.mediaUrl || '').trim();
  if (!to || !text) return jsonError('BAD_REQUEST', { status: 400, message: 'to and body are required' });

  // If Twilio is configured, prefer Twilio for outbound SMS
  if (env.twilioAccountSid && env.twilioAuthToken && (env.twilioMessagingServiceSid || from || env.twilioFromNumber)) {
    const accountSid = env.twilioAccountSid;
    const auth = Buffer.from(`${accountSid}:${env.twilioAuthToken}`).toString('base64');
    const params = new URLSearchParams();
    if (env.twilioMessagingServiceSid) params.set('MessagingServiceSid', env.twilioMessagingServiceSid);
    if (!env.twilioMessagingServiceSid) params.set('From', from || env.twilioFromNumber);
    params.set('To', to);
    params.set('Body', text);
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', authorization: `Basic ${auth}` },
      body: params.toString(),
    });
    const json: any = await res.json().catch(() => null);
    if (!res.ok) return jsonError('TWILIO_FAILED', { status: 502, message: json?.message || `HTTP ${res.status}`, details: json });
    return jsonOk({ sid: json?.sid || null });
  }

  // Else use BulkVS when Twilio not configured
  const baseUrl = (ts?.baseUrl || env.bulkvsBaseUrl || '').trim();
  const basicAuthRaw = (ts?.basicAuth || env.bulkvsBasicAuth || '').trim();
  const basicAuth = basicAuthRaw.replace(/^basic\s+/i, '');
  if (!baseUrl || !basicAuth) return jsonError('NOT_CONFIGURED', { status: 400, message: 'No SMS provider configured' });

  const payload: any = { from: from.replace(/^\+/, ''), to: [to.replace(/^\+/, '')], message: text };
  if (mediaUrl) { payload.messageType = 'MMS'; payload.attachmentUrl = mediaUrl; }
  const res = await fetch(`${baseUrl}/messageSend`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Basic ${basicAuth}` }, body: JSON.stringify(payload), cache: 'no-store' });
  const json: any = await res.json().catch(() => null);
  if (!res.ok || !json) return jsonError('BULKVS_FAILED', { status: 502, message: `HTTP ${res.status}`, details: json });
  return jsonOk(json);
}

export function GET() { return methodNotAllowed(['POST']); }
export function PUT() { return methodNotAllowed(['POST']); }
export function DELETE() { return methodNotAllowed(['POST']); }


