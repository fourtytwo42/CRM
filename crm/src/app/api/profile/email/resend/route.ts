import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/guard';
import { getDb } from '@/lib/db';
import { randomUUID } from 'crypto';
import { jsonOk, jsonError, methodNotAllowed, getClientIp } from '@/lib/http';
import { maybeSendEmail } from '@/lib/email';

export const runtime = 'nodejs';

const COOLDOWN_MS = 10 * 60 * 1000; // 10 minutes

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth(req);
    const db = getDb();
    const site = db.prepare('SELECT email_verification_enabled FROM site_settings WHERE id = 1').get() as { email_verification_enabled?: number } | undefined;
    const verificationEnabled = !!(site && site.email_verification_enabled === 1);
    if (!verificationEnabled) return jsonError('DISABLED', { status: 400 });
    const row = db.prepare('SELECT email, new_email, new_email_verification_code, new_email_verification_sent_at FROM users WHERE id = ?')
      .get(user.id) as { email?: string|null; new_email?: string|null; new_email_verification_code?: string|null; new_email_verification_sent_at?: string|null } | undefined;
    if (!row?.new_email) return jsonError('NO_PENDING', { status: 400 });
    const parsedLast = row.new_email_verification_sent_at ? new Date(row.new_email_verification_sent_at).getTime() : 0;
    const lastSent = Number.isFinite(parsedLast) ? parsedLast : 0;
    const now = Date.now();
    const remain = lastSent > 0 ? lastSent + COOLDOWN_MS - now : 0;
    if (remain > 0) {
      const seconds = Math.max(1, Math.ceil(remain / 1000));
      return jsonError('COOLDOWN', { status: 429, details: { seconds } });
    }
    // Global and per-user resend limits (24h window)
    const nowMs = Date.now();
    const DAY_MS = 24 * 60 * 60 * 1000;
    const windowStart = nowMs - (nowMs % DAY_MS);
    const ip = getClientIp(req);
    try {
      db.prepare(`
        INSERT INTO email_attempts (user_id, ip_address, window_start_ms, attempts, last_attempt_ms)
        VALUES (?, ?, ?, 1, ?)
        ON CONFLICT(user_id, ip_address, window_start_ms) DO UPDATE SET attempts = attempts + 1, last_attempt_ms = excluded.last_attempt_ms
      `).run(user.id, ip, windowStart, nowMs);
      const rowAttempts = db.prepare('SELECT attempts FROM email_attempts WHERE user_id = ? AND ip_address = ? AND window_start_ms = ?')
        .get(user.id, ip, windowStart) as { attempts: number } | undefined;
      const MAX_PER_DAY = 5;
      if ((rowAttempts?.attempts || 0) > MAX_PER_DAY) {
        const seconds = Math.max(1, Math.ceil((windowStart + DAY_MS - nowMs) / 1000));
        return jsonError('RATE_LIMIT', { status: 429, details: { seconds } });
      }
    } catch {}

    const code = randomUUID().replace(/-/g, '');
    db.prepare('UPDATE users SET new_email_verification_code = ?, new_email_verification_sent_at = ?, updated_at = ? WHERE id = ?')
      .run(code, new Date(now).toISOString(), new Date(now).toISOString(), user.id);

    try {
      const url = new URL('/api/profile/verify-email', req.url);
      url.searchParams.set('code', code);
      await maybeSendEmail(
        row.new_email!,
        'Verify your new email',
        `Click to verify: ${url.toString()}`,
        `<p>Click to verify your new email:</p><p><a href=\"${url.toString()}\">${url.toString()}</a></p>`
      );
    } catch {}

    return jsonOk();
  } catch (e: any) {
    return jsonError(e?.message || 'UNAUTHORIZED', { status: 401 });
  }
}

export function GET() {
  return methodNotAllowed(['POST']);
}


