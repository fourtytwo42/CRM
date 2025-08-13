import { getDb } from '@/lib/db';
import { env } from '@/lib/env';

type PollerState = {
  timer: NodeJS.Timeout | null;
  running: boolean;
};

const g = globalThis as any;
if (!g.__imapPoller) {
  g.__imapPoller = { timer: null, running: false } as PollerState;
}
const state: PollerState = g.__imapPoller;

export function ensureImapPollerRunning(): void {
  try {
    const db = getDb();
    const row = db.prepare(`SELECT imap_enabled, imap_poll_seconds FROM email_settings WHERE id = 1`).get() as any;
    const enabled = !!(row && row.imap_enabled);
    const intervalSec = Math.max(15, Math.min(3600, Number(row?.imap_poll_seconds || 60)));
    if (!enabled) {
      if (state.timer) { clearInterval(state.timer); state.timer = null; }
      state.running = false;
      return;
    }
    if (state.timer) return; // already scheduled
    state.timer = setInterval(() => { runOnce().catch(() => {}); }, intervalSec * 1000);
    state.running = true;
    // Kick immediate
    runOnce().catch(() => {});
  } catch {
    // ignore
  }
}

export async function runImapPollOnce(): Promise<number> {
  return runOnce();
}

async function runOnce(): Promise<number> {
  try {
    const db = getDb();
    const row = db.prepare(`SELECT imap_enabled, imap_host, imap_port, imap_secure, imap_username, imap_password, imap_last_uid FROM email_settings WHERE id = 1`).get() as any;
    if (!row || !row.imap_enabled) return 0;
    const host = row.imap_host; const port = Number(row.imap_port || 993); const secure = !!row.imap_secure; const user = row.imap_username; const pass = row.imap_password;
    if (!host || !user || !pass) return 0;
    // Dynamically import to avoid bundling if unused
    const { ImapFlow } = await import('imapflow');
    const client = new ImapFlow({ host, port, secure, auth: { user, pass }, logger: false });
    await client.connect();
    await client.mailboxOpen('INBOX', { readOnly: false });
    const lastUid = Number(row.imap_last_uid || 0);
    const searchCriteria = lastUid > 0 ? { uid: `${lastUid + 1}:*` } : { seen: false } as any;
    let processed = 0;
    for await (const msg of client.fetch(searchCriteria, { uid: true, envelope: true, bodyStructure: true, source: true, flags: true })) {
      const uid = Number(msg.uid);
      const env = msg.envelope as any;
      const from = (env.from && env.from[0] && (env.from[0].address || env.from[0].mailbox + '@' + env.from[0].host)) || '';
      const to = (env.to && env.to[0] && (env.to[0].address || env.to[0].mailbox + '@' + env.to[0].host)) || '';
      const subject = env.subject || '';
      const source = msg.source as Buffer;
      // Parse plain text quickly (could use mailparser for HTML/attachments)
      const raw = source.toString('utf8');
      const text = extractPlainText(raw);
      db.prepare(`INSERT INTO mail_messages (direction, from_email, to_email, subject, body, message_id, created_at) VALUES ('in', ?, ?, ?, ?, ?, ?)`).run(
        from || null,
        to || null,
        subject || null,
        text || null,
        extractHeader(raw, 'Message-Id'),
        new Date().toISOString(),
      );
      // Link or create customer
      const fromLower = String(from || '').toLowerCase();
      let cust = fromLower ? db.prepare(`SELECT id FROM customers WHERE LOWER(email) = ?`).get(fromLower) as any : null;
      if (!cust && fromLower) {
        const now = new Date().toISOString();
        const name = fromLower.split('@')[0];
        const info = db.prepare(`INSERT INTO customers (first_name, last_name, full_name, email, status, preferred_contact, created_at, updated_at) VALUES (?, ?, ?, ?, 'lead', 'email', ?, ?)`).run(null, null, name, fromLower, now, now);
        cust = { id: Number(info.lastInsertRowid) };
      }
      if (cust && cust.id) {
        db.prepare(`INSERT INTO communications (type, direction, subject, body, customer_id, agent_user_id, campaign_id, message_id, created_at) VALUES ('email','in',?,?,?,?,?,?,?)`).run(
          subject || null,
          text || null,
          Number(cust.id),
          null,
          null,
          extractHeader(raw, 'Message-Id') || null,
          new Date().toISOString(),
        );
      }
      // mark seen and update last
      await client.messageFlagsAdd(uid, ['\\Seen']);
      db.prepare(`UPDATE email_settings SET imap_last_uid = ? WHERE id = 1`).run(uid);
      processed += 1;
    }
    await client.logout();
    return processed;
  } catch {
    // ignore
    return 0;
  }
}

function extractHeader(raw: string, name: string): string | null {
  const re = new RegExp(`^${name}:(.*)$`, 'gmi');
  const m = re.exec(raw);
  if (!m) return null;
  return m[1].trim();
}

function extractPlainText(raw: string): string {
  // Very simple plain text extraction: prefer text/plain part if present
  const boundaryMatch = raw.match(/boundary="([^"]+)"/i);
  if (boundaryMatch) {
    const boundary = boundaryMatch[1];
    const parts = raw.split(`--${boundary}`);
    for (const p of parts) {
      if (/Content-Type:\s*text\/plain/i.test(p)) {
        const idx = p.indexOf('\r\n\r\n');
        if (idx >= 0) return p.slice(idx + 4).trim();
      }
    }
  }
  // Fallback: strip headers
  const i = raw.indexOf('\r\n\r\n');
  return i >= 0 ? raw.slice(i + 4).trim() : raw;
}


