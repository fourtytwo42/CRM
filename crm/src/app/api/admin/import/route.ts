import { NextRequest } from 'next/server';
import { getDb } from '@/lib/db';
import { requireAuth } from '@/lib/guard';
import { jsonOk, jsonError, methodNotAllowed } from '@/lib/http';

export async function POST(req: NextRequest) {
  const me = await requireAuth(req);
  if (me.role !== 'admin' && me.role !== 'power') return jsonError('FORBIDDEN', { status: 403 });
  const url = new URL(req.url);
  const type = (url.searchParams.get('type') || '').toLowerCase();
  const text = await req.text();
  const db = getDb();
  if (type === 'settings') {
    try {
      const json = JSON.parse(text);
      if (json.email) {
        const e = json.email;
        db.prepare(`UPDATE email_settings SET host=?, port=?, secure=?, username=?, from_email=?, from_name=?, imap_host=?, imap_port=?, imap_secure=?, imap_username=?, imap_enabled=?, imap_poll_seconds=?, updated_at=? WHERE id=1`)
          .run(e.host||'', Number(e.port||465), e.secure?1:0, e.username||null, e.from_email||'', e.from_name||null, e.imap_host||null, e.imap_port||null, e.imap_secure?1:0, e.imap_username||null, e.imap_enabled?1:0, e.imap_poll_seconds||60, new Date().toISOString());
      }
      if (Array.isArray(json.ai)) {
        const del = db.prepare(`DELETE FROM ai_providers`); del.run();
        const ins = db.prepare(`INSERT INTO ai_providers (provider,label,base_url,model,enabled,timeout_ms,priority,created_at,updated_at) VALUES (?,?,?,?,?,?,?, ?, ?)`);
        const now = new Date().toISOString();
        json.ai.forEach((p: any) => ins.run(p.provider, p.label||null, p.baseUrl||null, p.model||null, p.enabled?1:0, p.timeoutMs||null, p.priority||1000, now, now));
      }
      if (json.tele) {
        const t = json.tele;
        db.prepare(`UPDATE telephony_settings SET provider=?, bulkvs_base_url=?, bulkvs_from_did=?, twilio_account_sid=?, twilio_from_number=?, twilio_messaging_service_sid=?, updated_at=? WHERE id=1`)
          .run(t.provider||'bulkvs', t.bulkvs_base_url||'https://portal.bulkvs.com/api/v1.0', t.bulkvs_from_did||null, t.twilio_account_sid||null, t.twilio_from_number||null, t.twilio_messaging_service_sid||null, new Date().toISOString());
      }
      return jsonOk();
    } catch {
      return jsonError('VALIDATION', { status: 400, message: 'invalid json' });
    }
  }
  if (type === 'emails') {
    try {
      const json = JSON.parse(text) as { messages?: any[]; deleted?: any[] };
      const msgs = Array.isArray(json.messages) ? json.messages : [];
      const dels = Array.isArray(json.deleted) ? json.deleted : [];
      const now = new Date().toISOString();
      // Import deleted map first
      const insDel = db.prepare(`INSERT OR IGNORE INTO mail_deleted (message_id, imap_uid, deleted_at) VALUES (?, ?, ?)`);
      dels.forEach((d: any) => insDel.run(d.message_id || null, Number(d.imap_uid || 0) || null, d.deleted_at || now));
      // Import messages (avoid duplicates by message_id or imap_uid)
      const insMsg = db.prepare(`INSERT OR IGNORE INTO mail_messages (id, direction, from_email, to_email, subject, body, message_id, imap_uid, in_reply_to, references_header, seen, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
      msgs.forEach((m: any) => {
        insMsg.run(Number(m.id)||undefined, m.direction, m.from_email||null, m.to_email||null, m.subject||null, m.body||null, m.message_id||null, m.imap_uid||null, m.in_reply_to||null, m.references_header||null, Number(m.seen||0), m.created_at||now);
      });
      return jsonOk();
    } catch {
      return jsonError('VALIDATION', { status: 400, message: 'invalid json' });
    }
  }
  // CSV imports
  const lines = text.split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return jsonError('VALIDATION', { status: 400, message: 'empty csv' });
  const headers = lines[0].split(',').map(h => h.trim());
  const parse = (line: string) => {
    // basic CSV parser to handle quoted values and commas
    const out: string[] = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQuotes) {
        if (ch === '"') {
          if (line[i+1] === '"') { cur += '"'; i++; } else { inQuotes = false; }
        } else { cur += ch; }
      } else {
        if (ch === ',') { out.push(cur); cur = ''; }
        else if (ch === '"') { inQuotes = true; }
        else { cur += ch; }
      }
    }
    out.push(cur);
    return out.map(s => s.trim());
  };
  const rows = lines.slice(1).map(parse);
  const now = new Date().toISOString();
  switch (type) {
    case 'customers': {
      const idx: any = Object.fromEntries(headers.map((h, i) => [h, i]));
      const insNew = db.prepare(`INSERT INTO customers (full_name, email, phone, company, title, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
      const updByEmail = db.prepare(`UPDATE customers SET full_name=?, phone=?, company=?, title=?, status=?, updated_at=? WHERE email = ?`);
      const findByEmail = db.prepare(`SELECT id FROM customers WHERE email = ?`);
      const insCc = db.prepare(`INSERT OR IGNORE INTO customer_campaigns (customer_id, campaign_id, assigned_at) VALUES (?, ?, ?)`);
      const clearCc = db.prepare(`DELETE FROM customer_campaigns WHERE customer_id = ?`);
      const ensureCamp = db.prepare(`INSERT OR IGNORE INTO campaigns (vertical_id, name, status, created_at, updated_at) VALUES (NULL, ?, 'active', ?, ?)`);
      const findCampByName = db.prepare(`SELECT id FROM campaigns WHERE name = ? ORDER BY id LIMIT 1`);
      rows.forEach((r) => {
        const full_name = r[idx.full_name];
        const email = (r[idx.email] || '').trim() || null;
        const phone = r[idx.phone] || null;
        const company = r[idx.company] || null;
        const title = r[idx.title] || null;
        const status = r[idx.status] || 'active';
        let customerId: number | null = null;
        if (email) {
          const ex = findByEmail.get(email) as any;
          if (ex && ex.id) {
            updByEmail.run(full_name, phone, company, title, status, now, email);
            customerId = ex.id as number;
          } else {
            insNew.run(full_name, email, phone, company, title, status, now, now);
            const nx = findByEmail.get(email) as any; customerId = nx?.id || null;
          }
        } else {
          insNew.run(full_name, null, phone, company, title, status, now, now);
          const nx = db.prepare(`SELECT id FROM customers ORDER BY id DESC LIMIT 1`).get() as any; customerId = nx?.id || null;
        }
        if (!customerId) return;
        // Overwrite campaign assignments
        clearCc.run(customerId);
        const campaignField = (r[idx.campaign] || '').trim();
        const campaigns = campaignField.split(';').map((s: string) => s.trim()).filter(Boolean);
        campaigns.forEach((campName) => {
          if (!campName) return;
          ensureCamp.run(campName, now, now);
          const crow = findCampByName.get(campName) as any;
          if (crow && crow.id) insCc.run(customerId, crow.id, now);
        });
      });
      return jsonOk();
    }
    case 'agents': {
      const idx: any = Object.fromEntries(headers.map((h, i) => [h, i]));
      const ins = db.prepare(`INSERT INTO users (id, username, email, password_hash, role, status, created_at, updated_at) VALUES (?, ?, ?, COALESCE((SELECT password_hash FROM users WHERE id=?), ''), ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET username=excluded.username, email=excluded.email, role=excluded.role, status=excluded.status, updated_at=excluded.updated_at`);
      const insAc = db.prepare(`INSERT OR IGNORE INTO agent_campaigns (agent_user_id, campaign_id, assigned_at) VALUES (?, ?, ?)`);
      const ensureVert = db.prepare(`INSERT OR IGNORE INTO verticals (name, created_at, updated_at) VALUES (?, ?, ?)`);
      const ensureCamp = db.prepare(`INSERT OR IGNORE INTO campaigns (vertical_id, name, status, created_at, updated_at) VALUES (?, ?, 'active', ?, ?)`);
      const findVertId = db.prepare(`SELECT id FROM verticals WHERE name = ?`);
      const findCampId = db.prepare(`SELECT c.id FROM campaigns c LEFT JOIN verticals v ON v.id = c.vertical_id WHERE c.name = ? AND (v.name = ? OR (? IS NULL AND v.id IS NULL))`);
      rows.forEach((r) => {
        const id = Number(r[idx.id]);
        const role = (['agent','lead','manager'].includes(r[idx.role])? r[idx.role] : 'agent');
        ins.run(id, r[idx.username], r[idx.email]||null, id, role, r[idx.status]||'active', now, now);
        const camps = (r[idx.campaigns] || '').split(';').map((s: string) => s.trim()).filter(Boolean);
        camps.forEach((pair: string) => {
          const [vertNameRaw, campNameRaw] = pair.split('>');
          const vertName = (vertNameRaw || '').trim();
          const campName = (campNameRaw || vertNameRaw || '').trim();
          let vid: number | null = null;
          if (vertName) { ensureVert.run(vertName, now, now); const vrow = findVertId.get(vertName) as any; vid = vrow?.id || null; }
          if (campName) { ensureCamp.run(vid, campName, now, now); const crow = findCampId.get(campName, vertName || null, vertName || null) as any; const cid = crow?.id; if (cid) insAc.run(id, cid, now); }
        });
      });
      return jsonOk();
    }
    case 'verticals': {
      const idx: any = Object.fromEntries(headers.map((h, i) => [h, i]));
      const ins = db.prepare(`INSERT INTO verticals (id, name, created_at, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET name=excluded.name, updated_at=excluded.updated_at`);
      rows.forEach((r) => ins.run(Number(r[idx.id]), r[idx.name], now, now));
      return jsonOk();
    }
    case 'campaigns': {
      const idx: any = Object.fromEntries(headers.map((h, i) => [h, i]));
      const ins = db.prepare(`INSERT INTO campaigns (id, name, vertical_id, status, created_at, updated_at) VALUES (?, ?, ?, 'active', ?, ?) ON CONFLICT(id) DO UPDATE SET name=excluded.name, vertical_id=excluded.vertical_id, updated_at=excluded.updated_at`);
      rows.forEach((r) => ins.run(Number(r[idx.id]), r[idx.name], r[idx.vertical_id]? Number(r[idx.vertical_id]) : null, now, now));
      return jsonOk();
    }
    default:
      return jsonError('VALIDATION', { status: 400, message: 'type required' });
  }
}

export function GET() { return methodNotAllowed(['POST']); }
export function PUT() { return methodNotAllowed(['POST']); }
export function DELETE() { return methodNotAllowed(['POST']); }


