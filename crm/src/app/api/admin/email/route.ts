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
  const db = getDb();
  const url = new URL(req.url);
  let ids: number[] = [];
  const qpId = Number(url.searchParams.get('id') || '0');
  if (qpId) ids = [qpId];
  if (!qpId) {
    const body = await req.json().catch(() => null) as { ids?: number[] } | null;
    if (body && Array.isArray(body.ids)) ids = body.ids.map((n) => Number(n)).filter(Number.isFinite);
  }
  if (!ids.length) return jsonError('VALIDATION', { status: 400, message: 'No ids provided' });

  const rows = db.prepare(`SELECT id, message_id, imap_uid FROM mail_messages WHERE id IN (${ids.map(()=>'?').join(',')})`).all(...ids) as Array<{ id: number; message_id?: string|null; imap_uid?: number|null }>;
  if (!rows.length) return jsonOk();

  // Delete from local table
  db.prepare(`DELETE FROM mail_messages WHERE id IN (${ids.map(()=>'?').join(',')})`).run(...ids);

  // Record as deleted to suppress re-download
  const now = new Date().toISOString();
  const ins = db.prepare(`INSERT OR IGNORE INTO mail_deleted (message_id, imap_uid, deleted_at) VALUES (?, ?, ?)`);
  for (const r of rows) ins.run(r.message_id || null, r.imap_uid || null, now);

  // Attempt IMAP delete in one session for all UIDs
  const uids = rows.map(r => r.imap_uid).filter((u): u is number => Number.isFinite(u as any));
  if (uids.length) {
    try {
      const { ImapFlow } = await import('imapflow');
      const cfg = db.prepare(`SELECT imap_host, imap_port, imap_secure, imap_username, imap_password FROM email_settings WHERE id = 1`).get() as any;
      if (cfg && cfg.imap_host && cfg.imap_username && cfg.imap_password) {
        const client = new ImapFlow({ host: cfg.imap_host, port: Number(cfg.imap_port || 993), secure: !!cfg.imap_secure, auth: { user: cfg.imap_username, pass: cfg.imap_password }, logger: false });
        await client.connect();
        await client.mailboxOpen('INBOX', { readOnly: false });
        for (const uid of uids) {
          try { await client.messageDelete(Number(uid), { uid: true }); } catch {}
        }
        await client.logout();
      }
    } catch {}
  }

  return jsonOk();
}

export function PUT() { return methodNotAllowed(['GET','POST','DELETE']); }


