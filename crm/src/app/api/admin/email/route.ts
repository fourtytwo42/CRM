import { NextRequest } from 'next/server';
import { getDb } from '@/lib/db';
import { jsonOk, jsonError, methodNotAllowed } from '@/lib/http';
import { requireAdmin } from '@/lib/guard';

export async function GET(req: NextRequest) {
  try { await requireAdmin(req); } catch { return jsonError('FORBIDDEN', { status: 403 }); }
  const url = new URL(req.url);
  const box = (url.searchParams.get('box') || 'inbox').toLowerCase();
  const page = Math.max(1, Number(url.searchParams.get('page') || '1'));
  const pageSize = Math.min(200, Math.max(10, Number(url.searchParams.get('pageSize') || '50')));
  const offset = (page - 1) * pageSize;
  const db = getDb();
  const where = box === 'sent' ? `direction = 'out'` : `direction = 'in'`;
  const total = (db.prepare(`SELECT COUNT(*) as n FROM mail_messages WHERE ${where}`).get() as any).n as number;
  const rows = db.prepare(`SELECT id, direction, from_email, to_email, subject, seen, created_at, body FROM mail_messages WHERE ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`).all(pageSize, offset);
  const stats = db.prepare(`SELECT 
    SUM(CASE WHEN direction='in' THEN 1 ELSE 0 END) as inbox,
    SUM(CASE WHEN direction='out' THEN 1 ELSE 0 END) as sent,
    SUM(CASE WHEN direction='in' AND seen=1 THEN 1 ELSE 0 END) as read_in,
    SUM(CASE WHEN direction='in' AND seen=0 THEN 1 ELSE 0 END) as unread_in
  FROM mail_messages`).get() as any;
  return jsonOk({ items: rows, total, page, pageSize, stats });
}

export async function POST(req: NextRequest) {
  try { await requireAdmin(req); } catch { return jsonError('FORBIDDEN', { status: 403 }); }
  const db = getDb();
  const body = await req.json().catch(() => null) as { id?: number };
  if (!body || !body.id) return jsonError('VALIDATION', { status: 400 });
  db.prepare(`UPDATE mail_messages SET seen = 1 WHERE id = ?`).run(Number(body.id));
  return jsonOk();
}

export async function DELETE(req: NextRequest) {
  try { await requireAdmin(req); } catch { return jsonError('FORBIDDEN', { status: 403 }); }
  const url = new URL(req.url);
  const id = Number(url.searchParams.get('id') || '0');
  if (!id) return jsonError('VALIDATION', { status: 400 });
  const db = getDb();
  const row = db.prepare(`SELECT imap_uid FROM mail_messages WHERE id = ?`).get(id) as any;
  db.prepare(`DELETE FROM mail_messages WHERE id = ?`).run(id);
  // Optionally also delete from IMAP by UID if available
  if (row && row.imap_uid) {
    try {
      const { ImapFlow } = await import('imapflow');
      const cfg = db.prepare(`SELECT imap_host, imap_port, imap_secure, imap_username, imap_password FROM email_settings WHERE id = 1`).get() as any;
      if (cfg && cfg.imap_host && cfg.imap_username && cfg.imap_password) {
        const client = new ImapFlow({ host: cfg.imap_host, port: Number(cfg.imap_port || 993), secure: !!cfg.imap_secure, auth: { user: cfg.imap_username, pass: cfg.imap_password }, logger: false });
        await client.connect();
        await client.mailboxOpen('INBOX', { readOnly: false });
        await client.messageDelete(Number(row.imap_uid), { uid: true });
        await client.logout();
      }
    } catch {}
  }
  return jsonOk();
}

export function PUT() { return methodNotAllowed(['GET','POST','DELETE']); }


