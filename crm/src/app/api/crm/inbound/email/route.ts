import { NextRequest } from 'next/server';
import { getDb } from '@/lib/db';
import { jsonOk, jsonError, methodNotAllowed } from '@/lib/http';

// Basic webhook for inbound emails (e.g., via a gateway that POSTs JSON)
// Expected body: { from: string, to: string, subject: string, text: string, html?: string, messageId?: string, inReplyTo?: string, references?: string[] }
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null) as any;
  if (!body || !body.from || !body.to) return jsonError('VALIDATION', { status: 400 });
  const db = getDb();
  const rawFrom = String(body.from).trim();
  const fromEmail = (rawFrom.match(/<([^>]+)>/)?.[1] || rawFrom).toLowerCase();
  const toEmail = String(body.to).trim();
  // Insert site-wide mail record
  db.prepare(`INSERT INTO mail_messages (direction, from_email, to_email, subject, body, message_id, in_reply_to, references_header, seen, created_at) VALUES ('in', ?, ?, ?, ?, ?, ?, ?, 0, ?)`)
    .run(fromEmail || null, toEmail || null, String(body.subject || ''), String(body.text || ''), body.messageId || null, body.inReplyTo || null, Array.isArray(body.references) ? body.references.join(' ') : null, new Date().toISOString());
  // Lookup or create customer by from email
  let customer = db.prepare(`SELECT id FROM customers WHERE LOWER(email) = ?`).get(fromEmail) as any;
  if (!customer) {
    const now = new Date().toISOString();
    const fullName = fromEmail.includes('@') ? fromEmail.split('@')[0] : fromEmail;
    const info = db.prepare(`INSERT INTO customers (first_name, last_name, full_name, email, phone, street1, street2, city, state, zip, status, preferred_contact, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'lead', 'email', ?, ?)`).run(null, null, fullName, fromEmail, null, null, null, null, null, null, now, now);
    customer = { id: Number(info.lastInsertRowid) };
  }
  db.prepare(`INSERT INTO communications (type, direction, subject, body, customer_id, agent_user_id, campaign_id, message_id, in_reply_to, references_header, created_at) VALUES ('email','in',?,?,?,?,?,?,?, ?, ?)`)
    .run(
      String(body.subject || ''),
      String(body.text || ''),
      Number(customer.id),
      null,
      null,
      body.messageId || null,
      body.inReplyTo || null,
      Array.isArray(body.references) ? body.references.join(' ') : null,
      new Date().toISOString(),
    );
  return jsonOk();
}

export function GET() { return methodNotAllowed(['POST']); }
export function PUT() { return methodNotAllowed(['POST']); }
export function DELETE() { return methodNotAllowed(['POST']); }


