import { NextRequest } from 'next/server';
import { getDb } from '@/lib/db';
import { jsonOk, jsonError, methodNotAllowed } from '@/lib/http';
import { requireAdmin } from '@/lib/guard';
import { env } from '@/lib/env';

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
  // TODO: Implement IMAP polling via a library like imapflow; here we stub the shape
  // This endpoint is a placeholder to wire up admin UI and DB settings.
  return jsonOk({ ok: true });
}

export function GET() { return methodNotAllowed(['POST']); }
export function PUT() { return methodNotAllowed(['POST']); }
export function DELETE() { return methodNotAllowed(['POST']); }


