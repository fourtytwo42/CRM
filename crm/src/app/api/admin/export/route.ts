import { NextRequest } from 'next/server';
import { getDb } from '@/lib/db';
import { requireAuth } from '@/lib/guard';
import { jsonOk, jsonError, methodNotAllowed } from '@/lib/http';

export async function GET(req: NextRequest) {
  const me = await requireAuth(req);
  if (me.role !== 'admin' && me.role !== 'power') return jsonError('FORBIDDEN', { status: 403 });
  const url = new URL(req.url);
  const type = (url.searchParams.get('type') || '').toLowerCase();
  const db = getDb();
  switch (type) {
    case 'customers': {
      const rows = db.prepare(`
        SELECT c.first_name, c.last_name, c.full_name, c.email, c.phone,
               c.street1, c.street2, c.city, c.state, c.zip,
               c.company, c.title, c.status,
          COALESCE(
            (
              SELECT GROUP_CONCAT(name, ';') FROM (
                SELECT DISTINCT v.name AS name
                FROM customer_campaigns cc
                JOIN campaigns cp ON cp.id = cc.campaign_id
                LEFT JOIN verticals v ON v.id = cp.vertical_id
                WHERE cc.customer_id = c.id
              )
            ),
            ''
          ) AS vertical,
          COALESCE(
            (
              SELECT GROUP_CONCAT(cp.name, ';')
              FROM customer_campaigns cc
              JOIN campaigns cp ON cp.id = cc.campaign_id
              WHERE cc.customer_id = c.id
            ),
            ''
          ) AS campaign
        FROM customers c
        ORDER BY c.id ASC
      `).all();
      const csv = toCsv(['first_name','last_name','full_name','email','phone','street1','street2','city','state','zip','company','title','status','vertical','campaign'], rows);
      return new Response(csv, { headers: { 'content-type': 'text/csv' } });
    }
    case 'agents': {
      const rows = db.prepare(`
        SELECT u.id, u.username, u.email, u.role, u.status,
          COALESCE(
            (
              SELECT GROUP_CONCAT(v.name || '>' || c.name, ';')
              FROM agent_campaigns ac
              JOIN campaigns c ON c.id = ac.campaign_id
              LEFT JOIN verticals v ON v.id = c.vertical_id
              WHERE ac.agent_user_id = u.id
            ),
            ''
          ) AS campaigns
        FROM users u
        WHERE role IN ('agent','lead','manager','power','admin')
        ORDER BY u.id ASC
      `).all();
      const csv = toCsv(['id','username','email','role','status','campaigns'], rows);
      return new Response(csv, { headers: { 'content-type': 'text/csv' } });
    }
    case 'verticals': {
      const rows = db.prepare(`SELECT id, name FROM verticals ORDER BY id ASC`).all();
      const csv = toCsv(['id','name'], rows);
      return new Response(csv, { headers: { 'content-type': 'text/csv' } });
    }
    case 'campaigns': {
      const rows = db.prepare(`SELECT id, name, vertical_id FROM campaigns ORDER BY id ASC`).all();
      const csv = toCsv(['id','name','vertical_id'], rows);
      return new Response(csv, { headers: { 'content-type': 'text/csv' } });
    }
    case 'settings': {
      const email = db.prepare(`SELECT host, port, secure, username, from_email, from_name, imap_host, imap_port, imap_secure, imap_username, imap_enabled, imap_poll_seconds FROM email_settings WHERE id = 1`).get();
      const ai = db.prepare(`SELECT provider, label, base_url as baseUrl, model, enabled, timeout_ms as timeoutMs, priority FROM ai_providers`).all();
      const tele = db.prepare(`SELECT provider, bulkvs_base_url, bulkvs_from_did, twilio_account_sid, twilio_from_number, twilio_messaging_service_sid FROM telephony_settings WHERE id = 1`).get();
      return jsonOk({ email, ai, tele });
    }
    case 'emails': {
      const msgs = db.prepare(`SELECT id, direction, from_email, to_email, subject, body, message_id, imap_uid, in_reply_to, references_header, seen, created_at FROM mail_messages ORDER BY created_at ASC`).all();
      const deleted = db.prepare(`SELECT message_id, imap_uid, deleted_at FROM mail_deleted`).all();
      return new Response(JSON.stringify({ messages: msgs, deleted }), { headers: { 'content-type': 'application/json' } });
    }
    default:
      return jsonError('VALIDATION', { status: 400, message: 'type required' });
  }
}

function toCsv(headers: string[], rows: any[]): string {
  const esc = (v: any) => {
    const s = v == null ? '' : String(v);
    if (/[",\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
    return s;
  };
  return [headers.join(','), ...rows.map(r => headers.map(h => esc((r as any)[h])).join(','))].join('\n');
}

export function POST() { return methodNotAllowed(['GET']); }
export function PUT() { return methodNotAllowed(['GET']); }
export function DELETE() { return methodNotAllowed(['GET']); }


