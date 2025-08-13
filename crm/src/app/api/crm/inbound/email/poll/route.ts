import { NextRequest } from 'next/server';
import { getDb } from '@/lib/db';
import { jsonOk, jsonError, methodNotAllowed } from '@/lib/http';
import { requireAdmin } from '@/lib/guard';
import { runImapPollOnce } from '../poller';

// Lightweight IMAP polling trigger endpoint (manual/cron). For production, run this on a cron schedule.
export async function POST(req: NextRequest) {
  try {
    await requireAdmin(req);
  } catch {
    return jsonError('FORBIDDEN', { status: 403 });
  }
  const db = getDb();
  const row = db.prepare(`SELECT imap_enabled, imap_host, imap_port, imap_secure, imap_username, imap_password FROM email_settings WHERE id = 1`).get() as any;
  if (!row || !row.imap_enabled) return jsonOk({ skipped: true });
  if (!row.imap_host || !row.imap_username || !row.imap_password) return jsonError('MISSING', { status: 400, message: 'IMAP not fully configured' });
  const n = await runImapPollOnce();
  // Return some recent head of inbox for debugging
  const rows = getDb().prepare(`SELECT id, imap_uid, subject, created_at FROM mail_messages WHERE direction='in' ORDER BY created_at DESC LIMIT 5`).all();
  return jsonOk({ processed: n, head: rows });
}

export function GET() { return methodNotAllowed(['POST']); }
export function PUT() { return methodNotAllowed(['POST']); }
export function DELETE() { return methodNotAllowed(['POST']); }


