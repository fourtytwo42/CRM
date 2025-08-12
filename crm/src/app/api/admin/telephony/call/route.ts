import { NextRequest } from 'next/server';
import { requireAdmin } from '@/lib/guard';
import { jsonError, methodNotAllowed } from '@/lib/http';
import { env } from '@/lib/env';
import net from 'net';

export const runtime = 'nodejs';

// Note: BulkVS REST docs do not explicitly show a "call originate" endpoint.
// For a ring-through (call then hang up on answer), options include:
// - Using SIP trunk to originate from your PBX
// - Using Twilio BYOC with /twilio and Twilio Programmable Voice
// Here we provide a placeholder POST that returns 501 until an originate path is chosen.
export async function POST(req: NextRequest) {
  try {
    await requireAdmin(req);
  } catch {
    return jsonError('FORBIDDEN', { status: 403 });
  }
  const body = await req.json().catch(() => ({} as any)) as { to?: string; from?: string };
  const to = String(body?.to || '').trim();
  const from = String((body?.from || env.bulkvsDefaultFromDid || '')).trim();
  if (!to) return jsonError('BAD_REQUEST', { status: 400, message: 'to is required' });

  // Attempt Twilio originate if configured
  if (env.twilioAccountSid && env.twilioAuthToken && (from || env.twilioFromNumber)) {
    const accountSid = env.twilioAccountSid;
    const authToken = env.twilioAuthToken;
    const basic = Buffer.from(`${accountSid}:${authToken}`).toString('base64');
    const fromNum = from || env.twilioFromNumber;
    const twimlUrl = `${env.publicBaseUrl || ''}/api/telephony/twiml/ringthrough`;
    if (!twimlUrl) {
      return jsonError('CONFIG_ERROR', { status: 500, message: 'PUBLIC_BASE_URL required for Twilio ring-through' });
    }
    const params = new URLSearchParams({ To: to, From: fromNum, Url: twimlUrl });
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Calls.json`, {
      method: 'POST',
      headers: {
        authorization: `Basic ${basic}`,
        'content-type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });
    let json: any = null;
    try { json = await res.json(); } catch {}
    if (!res.ok) {
      return jsonError('TWILIO_FAILED', { status: 502, message: json?.message || `HTTP ${res.status}`, details: json || null });
    }
    return new Response(JSON.stringify({ ok: true, data: { sid: json?.sid || null } }), { status: 200, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
  }

  // Attempt Asterisk AMI originate if configured
  if (env.asteriskAmiHost && env.asteriskAmiUsername && env.asteriskAmiPassword && env.asteriskChannelTemplate) {
    const host = env.asteriskAmiHost;
    const port = env.asteriskAmiPort || 5038;
    const username = env.asteriskAmiUsername;
    const password = env.asteriskAmiPassword;
    const channel = env.asteriskChannelTemplate.replace('${TO}', to.replace(/^\+/, ''));
    const callerId = (from || env.asteriskDefaultCallerId || '').replace(/^\+/, '');
    const app = env.asteriskOriginateApplication || 'Hangup';
    const timeoutMs = env.asteriskOriginateTimeoutMs || 30000;

    const actionId = `originate-${Date.now()}`;
    const socket = new net.Socket();
    const send = (s: string) => { socket.write(s + '\r\n'); };
    const onError = (e: any) => { try { socket.destroy(); } catch {}; };
    const result = await new Promise<{ ok: boolean; message?: string }>((resolve) => {
      let buffer = '';
      const timer = setTimeout(() => { try { socket.destroy(); } catch {}; resolve({ ok: false, message: 'TIMEOUT' }); }, timeoutMs);
      socket.on('data', (d) => {
        buffer += d.toString('utf8');
        if (buffer.includes('\n\n')) {
          // Continue reading events; resolve after sending originate
        }
      });
      socket.on('error', (e) => { clearTimeout(timer); resolve({ ok: false, message: e?.message || 'ERR' }); });
      socket.on('close', () => { clearTimeout(timer); resolve({ ok: true }); });
      socket.connect(port, host, () => {
        send(`Action: Login`);
        send(`Username: ${username}`);
        send(`Secret: ${password}`);
        send('');
        send(`Action: Originate`);
        send(`ActionID: ${actionId}`);
        send(`Channel: ${channel}`);
        send(`Application: ${app}`);
        if (callerId) send(`CallerID: ${callerId}`);
        send('');
        // Gracefully end; we don't need to keep AMI session open
        setTimeout(() => { try { socket.end(); } catch {} }, 300);
      });
    });
    if (!result.ok) {
      return jsonError('ASTERISK_FAILED', { status: 502, message: result.message || 'AMI originate failed' });
    }
    return new Response(JSON.stringify({ ok: true, data: { provider: 'asterisk' } }), { status: 200, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
  }

  return jsonError('NOT_IMPLEMENTED', { status: 501, message: 'No call originate provider configured' });
}

export function GET() { return methodNotAllowed(['POST']); }
export function PUT() { return methodNotAllowed(['POST']); }
export function DELETE() { return methodNotAllowed(['POST']); }


