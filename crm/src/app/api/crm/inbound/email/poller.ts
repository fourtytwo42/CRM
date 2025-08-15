import { getDb } from '@/lib/db';
import { env } from '@/lib/env';
import { getEmailSettings, createTransporterFromSettings } from '@/lib/email';
import { chatWithFailover, type AiProviderConfig } from '@/lib/ai';

type PollerState = {
  timer: NodeJS.Timeout | null;
  running: boolean;
  intervalSec: number;
  nextRunAtMs: number | null;
  listeners: Set<(event: 'email-processed' | 'poller-status', data?: any) => void>;
};

const g = globalThis as any;
if (!g.__imapPoller) {
  g.__imapPoller = { timer: null, running: false, intervalSec: 60, nextRunAtMs: null, listeners: new Set() } as PollerState;
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
      state.intervalSec = intervalSec;
      state.nextRunAtMs = null;
      return;
    }
    
    // If interval changed, restart the timer
    if (state.timer && state.intervalSec !== intervalSec) {
      clearInterval(state.timer);
      state.timer = null;
    }
    
    if (state.timer) return; // already scheduled with correct interval
    
    state.intervalSec = intervalSec;
    state.running = true;
    
    // Start with immediate run, then schedule regular intervals
    const scheduleNext = () => {
      if (state.timer) clearInterval(state.timer);
      state.nextRunAtMs = Date.now() + state.intervalSec * 1000;
      state.timer = setInterval(() => {
        runOnce().catch(() => {}).finally(() => {
          // Update next run time for the following interval
          if (state.running && state.timer) {
            state.nextRunAtMs = Date.now() + state.intervalSec * 1000;
          }
        });
      }, state.intervalSec * 1000);
    };
    
    // Run immediately first, then start the regular timer
    runOnce().catch(() => {}).finally(() => {
      scheduleNext();
    });
  } catch {
    // ignore
  }
}

export async function runImapPollOnce(): Promise<number> {
  return runOnce();
}

export function getImapPollerStatus(): { enabled: boolean; intervalSec: number; nextRunAtMs: number | null; remainingSec: number } {
  try {
    const db = getDb();
    const row = db.prepare(`SELECT imap_enabled, imap_poll_seconds FROM email_settings WHERE id = 1`).get() as any;
    const enabled = !!(row && row.imap_enabled);
    const intervalSec = Math.max(15, Math.min(3600, Number(row?.imap_poll_seconds || state.intervalSec || 60)));
    const nextMs = state.nextRunAtMs;
    const remainingSec = nextMs ? Math.max(0, Math.ceil((nextMs - Date.now()) / 1000)) : intervalSec;
    return { enabled, intervalSec, nextRunAtMs: nextMs, remainingSec };
  } catch {
    return { enabled: false, intervalSec: state.intervalSec || 60, nextRunAtMs: null, remainingSec: state.intervalSec || 60 };
  }
}

export function resetImapPollCountdown(): void {
  // After a manual run, restart the automatic timer from now
  if (state.timer) {
    clearInterval(state.timer);
    state.timer = null;
  }
  
  if (state.running) {
    state.nextRunAtMs = Date.now() + state.intervalSec * 1000;
    state.timer = setInterval(() => {
      runOnce().catch(() => {}).finally(() => {
        // Update next run time for the following interval
        if (state.running && state.timer) {
          state.nextRunAtMs = Date.now() + state.intervalSec * 1000;
        }
      });
    }, state.intervalSec * 1000);
  }
}

// Event system for real-time updates
export function addPollerListener(listener: (event: 'email-processed' | 'poller-status', data?: any) => void): () => void {
  state.listeners.add(listener);
  return () => state.listeners.delete(listener);
}

export function emitPollerEvent(event: 'email-processed' | 'poller-status', data?: any): void {
  state.listeners.forEach(listener => {
    try {
      listener(event, data);
    } catch (error) {
      console.error('[poller] Error in event listener:', error);
    }
  });
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
    // Determine our service email to avoid self-loops (replying to or ticketing ourselves)
    let ourEmailLower: string | null = null;
    try {
      const fromCfg = db.prepare(`SELECT from_email FROM email_settings WHERE id = 1`).get() as any;
      if (fromCfg && fromCfg.from_email) ourEmailLower = String(fromCfg.from_email).toLowerCase();
    } catch {}
    const lastUid = Number(row.imap_last_uid || 0);
    
    // Get current mailbox status to understand UID validity
    const mailboxStatus = await client.status('INBOX', { uidNext: true, uidValidity: true });
    const currentUidNext = Number(mailboxStatus.uidNext || 1);
    
    // Build explicit UID range; on first run fetch 1:*
    // For better reliability, also check a small overlap to catch timing issues
    const range = lastUid > 0 ? `${Math.max(1, lastUid - 2)}:*` : '1:*';
    let processed = 0;
    const uids: number[] = [];
    
    // Only fetch if there are potentially new messages
    if (currentUidNext > lastUid + 1) {
      for await (const msg of client.fetch(range, { uid: true }, { uid: true })) { uids.push(Number(msg.uid)); }
    }
    
    // eslint-disable-next-line no-console
    console.log('[imap] fetch range', { lastUid, range, count: uids.length, min: uids[0], max: uids[uids.length - 1], uidNext: currentUidNext });
    
    // Filter out UIDs we've already processed to avoid duplicates
    const newUids = uids.filter(uid => uid > lastUid);
    newUids.sort((a,b) => a - b);
    
    // Process only new UIDs to avoid duplicates
    for (const uid of newUids) {
      const it = client.fetchOne(uid, { uid: true, envelope: true, bodyStructure: true, source: true, flags: true }, { uid: true });
      const msg: any = await it;
      const msgUid = Number(msg.uid);
      const env = msg.envelope as any;
      const from = (env?.from && env.from[0] && (env.from[0].address || (env.from[0].mailbox && env.from[0].host ? `${env.from[0].mailbox}@${env.from[0].host}` : ''))) || '';
      const to = (env?.to && env.to[0] && (env.to[0].address || (env.to[0].mailbox && env.to[0].host ? `${env.to[0].mailbox}@${env.to[0].host}` : ''))) || '';
      const subject = (env?.subject || '').toString();
      const msgDate: string = env?.date ? new Date(env.date).toISOString() : new Date().toISOString();
      const source = msg.source as Buffer;
      // Parse plain text quickly (could use mailparser for HTML/attachments)
      const raw = source.toString('utf8');
      const text = extractPlainText(raw);
      const mid = extractHeader(raw, 'Message-Id');
      // Skip if explicitly deleted earlier
      const del = db.prepare(`SELECT 1 FROM mail_deleted WHERE (message_id IS NOT NULL AND message_id = ?) OR (imap_uid IS NOT NULL AND imap_uid = ?)`)
        .get(mid || null, msgUid) as any;
      if (del) { continue; }
      const exists = db.prepare(`SELECT id FROM mail_messages WHERE imap_uid = ? OR (message_id IS NOT NULL AND message_id = ?)`)
        .get(msgUid, mid || null) as any;
      if (!exists) {
        db.prepare(`INSERT INTO mail_messages (direction, from_email, to_email, subject, body, message_id, imap_uid, created_at) VALUES ('in', ?, ?, ?, ?, ?, ?, ?)`).run(
          from || null,
          to || null,
          subject || null,
          text || null,
          mid || null,
          msgUid,
          msgDate,
        );
        // If message is from or to our own service address, do not create cases/customers or auto-reply
        const fromLower = String(from || '').toLowerCase();
        const toLower = String(to || '').toLowerCase();
        // Only skip auto-processing if the sender is ourselves; messages addressed to us are expected
        const isSelfSender = !!(ourEmailLower && fromLower === ourEmailLower);
        if (!isSelfSender) {
          // Link or create customer
          let cust = fromLower ? db.prepare(`SELECT id FROM customers WHERE LOWER(email) = ?`).get(fromLower) as any : null;
          if (!cust && fromLower) {
            const now = new Date().toISOString();
            const name = fromLower.split('@')[0];
            const info = db.prepare(`INSERT INTO customers (first_name, last_name, full_name, email, phone, street1, street2, city, state, zip, status, preferred_contact, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'lead', 'email', ?, ?)`).run(null, null, name, fromLower, null, null, null, null, null, null, now, now);
            cust = { id: Number(info.lastInsertRowid) };
          }
          if (cust && cust.id) {
            // Ensure customer has a campaign; if not, assign to default
            try {
              const settings = db.prepare(`SELECT default_campaign_id FROM site_settings WHERE id = 1`).get() as any;
              const assigned = db.prepare(`SELECT 1 FROM customer_campaigns WHERE customer_id = ? LIMIT 1`).get(Number(cust.id)) as any;
              if ((!assigned || !Object.keys(assigned).length) && settings && settings.default_campaign_id) {
                db.prepare(`INSERT OR IGNORE INTO customer_campaigns (customer_id, campaign_id, assigned_at) VALUES (?, ?, ?)`).run(Number(cust.id), Number(settings.default_campaign_id), new Date().toISOString());
              }
            } catch {}
            const existsComm = mid ? db.prepare(`SELECT id FROM communications WHERE message_id = ? AND customer_id = ?`).get(mid, Number(cust.id)) as any : null;
            if (!existsComm) {
              // Link to an existing open/in-progress case, or create a new one if none
              let caseId: number | null = null;
              const caseMatch = subject.match(/\[(CS-[A-Z0-9]{6})\]/);
              if (caseMatch && caseMatch[1]) {
                const rowCase = db.prepare(`SELECT id, stage FROM cases WHERE case_number = ?`).get(caseMatch[1]) as any;
                if (rowCase) {
                  caseId = Number(rowCase.id);
                  // If case was previously closed, reopen it to continue the thread
                  if (rowCase.stage && rowCase.stage === 'closed') {
                    const nowReopen = new Date().toISOString();
                    db.prepare(`UPDATE cases SET stage = 'in-progress', updated_at = ? WHERE id = ?`).run(nowReopen, caseId);
                    try {
                      const maxV = (db.prepare(`SELECT MAX(version_no) AS v FROM case_versions WHERE case_id = ?`).get(caseId) as any)?.v || 1;
                      db.prepare(`INSERT INTO case_versions (case_id, version_no, data, created_at, created_by_user_id) VALUES (?, ?, ?, ?, NULL)`).run(caseId, maxV + 1, JSON.stringify({ stage: 'in-progress' }), nowReopen);
                    } catch {}
                  }
                }
              }
              if (!caseId) {
                const current = db.prepare(`SELECT id FROM cases WHERE customer_id = ? AND stage IN ('new','in-progress') ORDER BY created_at DESC LIMIT 1`).get(Number(cust.id)) as any;
                if (current && current.id) {
                  caseId = Number(current.id);
                } else {
                  const gen = () => 'CS-' + Math.random().toString(36).slice(2, 8).toUpperCase();
                  let code = gen();
                  while (db.prepare(`SELECT 1 FROM cases WHERE case_number = ?`).get(code)) code = gen();
                  const now = new Date().toISOString();
                  const info = db.prepare(`INSERT INTO cases (case_number, title, stage, customer_id, campaign_id, agent_user_id, created_at, updated_at) VALUES (?, ?, 'new', ?, NULL, NULL, ?, ?)`).run(code, code, Number(cust.id), now, now);
                  caseId = Number(info.lastInsertRowid);
                  try { db.prepare(`INSERT OR IGNORE INTO case_versions (case_id, version_no, data, created_at, created_by_user_id) VALUES (?, 1, ?, ?, NULL)`).run(caseId, JSON.stringify({ title: code, stage: 'new' }), now); } catch {}
                }
              }
              // Link campaign_id from default if available
              const defaultCamp = (() => { try { const s = db.prepare(`SELECT default_campaign_id FROM site_settings WHERE id = 1`).get() as any; return s?.default_campaign_id || null; } catch { return null; } })();
              db.prepare(`INSERT INTO communications (type, direction, subject, body, customer_id, agent_user_id, campaign_id, case_id, message_id, created_at) VALUES ('email','in',?,?,?,?,?,?,?,?)`).run(
                subject || null,
                text || null,
                Number(cust.id),
                null,
                defaultCamp,
                caseId,
                mid,
                msgDate,
              );
              try { maybeAutoReplyAi(db, Number(cust.id), Number(caseId)).catch(() => {}); } catch {}
            }
          }
        }
      }
      // After processing, delete from server to avoid re-pulling in future runs.
      try {
        // Mark deleted to avoid re-pulling in future runs
        await client.messageDelete(msgUid, { uid: true });
        try {
          const nowIso = new Date().toISOString();
          db.prepare(`INSERT OR IGNORE INTO mail_deleted (message_id, imap_uid, deleted_at) VALUES (?, ?, ?)`)
            .run(mid || null, msgUid, nowIso);
        } catch {}
      } catch {
        // If deletion fails, at least mark as seen to minimize duplicates
        try { await client.messageFlagsAdd(msgUid, ['\\Seen']); } catch {}
      }
      db.prepare(`UPDATE email_settings SET imap_last_uid = ? WHERE id = 1`).run(msgUid);
      processed += 1;
    }
    try {
      // As a final safety, ensure all deleted messages are processed
    } finally {
      await client.logout();
    }
    // eslint-disable-next-line no-console
    console.log('[imap] processed', { processed, newEmails: newUids.length, lastUid: (newUids.length ? newUids[newUids.length - 1] : lastUid) });
    
    // Emit event for real-time updates if new emails were processed
    if (processed > 0) {
      try {
        const { emitPollerEvent } = await import('./poller');
        emitPollerEvent('email-processed', { 
          processed, 
          newEmails: newUids.length, 
          lastUid: (newUids.length ? newUids[newUids.length - 1] : lastUid),
          timestamp: Date.now()
        });
      } catch (error) {
        console.error('[imap] Failed to emit email-processed event:', error);
      }
    }
    
    // If poller is running, ensure countdown reflects next run
    if (state.running) state.nextRunAtMs = Date.now() + state.intervalSec * 1000;
    return processed;
  } catch (e: any) {
    // eslint-disable-next-line no-console
    console.error('[imap] error', { message: e?.message || String(e) });
    return 0;
  }
}

async function maybeAutoReplyAi(db: any, customerId: number, caseId: number): Promise<void> {
  try {
    // Find any AI agent assigned to the campaign of this communication or default campaign
    const comm = db.prepare(`SELECT campaign_id FROM communications WHERE case_id = ? AND customer_id = ? ORDER BY created_at DESC LIMIT 1`).get(caseId, customerId) as any;
    const campaignId = comm?.campaign_id || (db.prepare(`SELECT default_campaign_id FROM site_settings WHERE id = 1`).get() as any)?.default_campaign_id || null;
    if (!campaignId) return;
    const aiAgent = db.prepare(`
      SELECT u.id FROM users u
      JOIN agent_campaigns ac ON ac.agent_user_id = u.id
      WHERE ac.campaign_id = ? AND u.is_ai = 1 AND u.status = 'active'
      ORDER BY u.id ASC LIMIT 1
    `).get(Number(campaignId)) as any;
    if (!aiAgent || !aiAgent.id) return;
    // Check if already auto replied to the latest inbound for this case
    const latestIn = db.prepare(`SELECT id, subject, body, created_at FROM communications WHERE case_id = ? AND customer_id = ? AND direction = 'in' ORDER BY created_at DESC LIMIT 1`).get(caseId, customerId) as any;
    if (!latestIn) return;
    const already = db.prepare(`SELECT 1 FROM communications WHERE case_id = ? AND customer_id = ? AND direction = 'out' AND agent_user_id = ? AND message_id = ('AI:' || ?) LIMIT 1`).get(caseId, customerId, Number(aiAgent.id), String(latestIn.id)) as any;
    if (already) return;
    // Build prompt from thread summary
    const thread = db.prepare(`SELECT direction, subject, body, created_at FROM communications WHERE customer_id = ? ORDER BY created_at ASC`).all(customerId) as Array<any>;
    const history = thread.map(m => `${m.direction === 'in' ? 'Customer' : 'Us'} @ ${m.created_at}: ${m.subject || ''}\n${m.body || ''}`).join('\n\n');
    // Build AI persona from the assigned AI agent's username and personality, if available
    const aiUser = db.prepare(`SELECT username, ai_personality FROM users WHERE id = ?`).get(Number(aiAgent.id)) as any;
    const agentName = (aiUser?.username || 'Agent').replace(/[_-]+/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase());
    const personality = (aiUser?.ai_personality || '').trim();
    const personaLine = personality ? `${personality}\n\n` : '';
    const system = `${personaLine}You are ${agentName}, a professional support assistant for our company. Always sign emails with your name as "${agentName}". Reply to the customer's most recent email in a helpful, concise, and friendly tone. Do not disclose that you are an AI or internal system. Keep it short unless the customer asked for details.`;
    const user = `Context (entire email thread, oldest to newest):\n\n${history}\n\nTask: Write a direct plain-text reply to the latest customer email.`;
    // Load enabled AI providers from DB for failover
    const rows = db.prepare(`SELECT id, provider, api_key, base_url, model, enabled, timeout_ms, priority, max_tokens FROM ai_providers WHERE enabled = 1 ORDER BY priority ASC`).all() as Array<any>;
    const providers: AiProviderConfig[] = rows.map((r) => ({
      id: r.id,
      provider: (r.provider || 'openai') as any,
      apiKey: r.api_key || undefined,
      baseUrl: r.base_url || undefined,
      model: r.model || undefined,
      timeoutMs: r.timeout_ms || undefined,
      maxTokens: r.max_tokens || undefined,
    }));
    let reply = `Thank you for your email. We will follow up shortly.`;
    if (providers.length > 0) {
      const res = await chatWithFailover(providers, [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ]);
      if (res.ok && res.content) reply = res.content;
    }
    // Send email
    const cfg = getEmailSettings(); if (!cfg) return;
    // Do not send to ourselves
    const ourEmail = String(cfg.from_email || '').toLowerCase();
    const cs = db.prepare(`SELECT case_number, customer_id FROM cases WHERE id = ?`).get(caseId) as any;
    const cust = db.prepare(`SELECT email FROM customers WHERE id = ?`).get(Number(cs.customer_id)) as any;
    if (!cust || !cust.email) return;
    const custEmail = String(cust.email).toLowerCase();
    if (custEmail === ourEmail) return; // never email ourselves
    const transporter = createTransporterFromSettings(cfg);
    const tag = `[${cs.case_number}]`;
    let subject = String(latestIn.subject || 'Re:').trim();
    if (!subject.includes(tag)) subject = `${subject} ${tag}`.trim();
    const info = await transporter.sendMail({ from: cfg.from_name ? `${cfg.from_name} <${cfg.from_email}>` : cfg.from_email, to: cust.email, subject, text: reply });
    const sentMessageId = (info as any)?.messageId as string | undefined;
    // Record outbound as AI-generated: mark message_id as synthetic 'AI:<inbound id>' and agent_user_id as AI agent
    db.prepare(`INSERT INTO communications (type, direction, subject, body, customer_id, agent_user_id, campaign_id, case_id, message_id, created_at) VALUES ('email','out',?,?,?,?,?,?,?, ? )`).run(
      subject,
      reply,
      Number(cs.customer_id),
      Number(aiAgent.id),
      campaignId,
      caseId,
      `AI:${latestIn.id}`,
      new Date().toISOString(),
    );
    // Also record in admin Sent mailbox
    try {
      db.prepare(`
        INSERT INTO mail_messages (direction, from_email, to_email, subject, body, message_id, created_at, seen)
        VALUES ('out', ?, ?, ?, ?, ?, ?, 1)
      `).run(
        cfg.from_email,
        cust.email,
        subject,
        reply,
        sentMessageId || null,
        new Date().toISOString(),
      );
    } catch {}
    // Immediately close the case to avoid collision
    const now = new Date().toISOString();
    db.prepare(`UPDATE cases SET stage = 'closed', updated_at = ? WHERE id = ?`).run(now, caseId);
    try {
      const maxV = (db.prepare(`SELECT MAX(version_no) AS v FROM case_versions WHERE case_id = ?`).get(caseId) as any)?.v || 1;
      db.prepare(`INSERT INTO case_versions (case_id, version_no, data, created_at, created_by_user_id) VALUES (?, ?, ?, ?, NULL)`).run(caseId, maxV + 1, JSON.stringify({ stage: 'closed' }), now);
    } catch {}
  } catch {}
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


