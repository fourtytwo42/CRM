import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/guard';
import { getDb } from '@/lib/db';
import { ensureUploadDirAsync } from '@/lib/fs';
import { env } from '@/lib/env';
import { processAvatarUpload, saveAvatarBuffer, MAX_AVATAR_BYTES as AVATAR_MAX_BYTES } from '@/lib/image';
import path from 'path';
import fs from 'fs';
import { jsonOk, jsonError, methodNotAllowed } from '@/lib/http';
import { maybeSendEmail } from '@/lib/email';

export const runtime = 'nodejs';

const MAX_AVATAR_BYTES = AVATAR_MAX_BYTES; // local alias for readability

export async function GET(req: NextRequest) {
  try {
    const authed = await requireAuth(req);
    const db = getDb();
    const user = db.prepare(
      'SELECT id, username, email, email_verified_at, new_email, new_email_verification_sent_at, avatar_url, theme_preference FROM users WHERE id = ?'
    ).get(authed.id) as any;
    return jsonOk({ user });
  } catch (e: any) {
    return jsonError(e?.message || 'UNAUTHORIZED', { status: 401 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const user = await requireAuth(req);
    if (user.status === 'suspended') return jsonError('SUSPENDED', { status: 403, message: 'Account suspended; profile updates are disabled.' });
    const contentType = req.headers.get('content-type') || '';
    const db = getDb();
    const now = new Date().toISOString();
    const site = db.prepare('SELECT email_verification_enabled FROM site_settings WHERE id = 1').get() as { email_verification_enabled?: number } | undefined;
    const verificationEnabled = !!(site && site.email_verification_enabled === 1);

    if (contentType.includes('multipart/form-data')) {
      const formData = await req.formData();
      const username = String(formData.get('username') || '').toLowerCase().trim();
      const theme = String(formData.get('theme_preference') || '');
      const email = String(formData.get('email') || '').toLowerCase().trim();
      if (username) {
        // validate username and ensure uniqueness
        if (!/^[a-z0-9_]{3,20}$/.test(username)) return jsonError('VALIDATION', { status: 400, message: 'Invalid username' });
        const exists = db.prepare('SELECT id FROM users WHERE username = ? AND id <> ?').get(username, user.id) as { id: number } | undefined;
        if (exists) return jsonError('USERNAME_TAKEN', { status: 409, message: 'Username already exists.' });
        db.prepare('UPDATE users SET username = ?, updated_at = ? WHERE id = ?').run(username, now, user.id);
      }
      if (['light','dark','system'].includes(theme)) db.prepare('UPDATE users SET theme_preference = ?, updated_at = ? WHERE id = ?').run(theme, now, user.id);

      // Email change request (respect site setting)
      if (email) {
        const exists = db.prepare('SELECT id FROM users WHERE email = ? AND id <> ?').get(email, user.id) as { id: number } | undefined;
        if (exists) return jsonError('EMAIL_TAKEN', { status: 409 });
        if (!verificationEnabled) {
          db.prepare('UPDATE users SET email = ?, email_verified_at = COALESCE(email_verified_at, ?), new_email = NULL, new_email_verification_code = NULL, new_email_verification_sent_at = NULL, updated_at = ? WHERE id = ?')
            .run(email, now, now, user.id);
          return jsonOk({ immediate: true, email });
        } else {
          const code = (await import('crypto')).randomUUID().replace(/-/g, '');
          db.prepare('UPDATE users SET new_email = ?, new_email_verification_code = ?, new_email_verification_sent_at = ?, updated_at = ? WHERE id = ?')
            .run(email, code, now, now, user.id);
          // Send email using stored SMTP settings
          try {
            const url = new URL('/api/profile/verify-email', req.url);
            url.searchParams.set('code', code);
            await maybeSendEmail(
              email,
              'Verify your new email',
              `Click to verify: ${url.toString()}`,
              `<p>Click to verify your new email:</p><p><a href="${url.toString()}">${url.toString()}</a></p>`
            );
          } catch {}
        }
      }

      const file = formData.get('avatar');
      if (file && typeof file === 'object' && 'arrayBuffer' in file) {
        const avatarFile = file as File;
        if (avatarFile.size > MAX_AVATAR_BYTES) return jsonError('AVATAR_TOO_LARGE', { status: 413, message: 'Avatar must be <= 5MB.' });
        const raw = Buffer.from(await avatarFile.arrayBuffer());
        const processed = await processAvatarUpload(raw);
        if (!processed) return jsonError('INVALID_AVATAR', { status: 400 });
        const saved = await saveAvatarBuffer(processed.buffer, processed.ext);
        const avatarUrl = saved.avatarUrl;
        db.prepare('UPDATE users SET avatar_url = ?, updated_at = ? WHERE id = ?').run(avatarUrl, now, user.id);
        // Avoid noisy logs in normal operation
        return jsonOk({ avatar_url: avatarUrl });
      }
      return jsonOk();
    }

    const body = await req.json().catch(() => null) as { username?: string; theme_preference?: 'light'|'dark'|'system'; email?: string };
    if (body?.username) {
      const newUsername = String(body.username).toLowerCase().trim();
      if (!/^[a-z0-9_]{3,20}$/.test(newUsername)) return jsonError('VALIDATION', { status: 400, message: 'Invalid username' });
      const exists = db.prepare('SELECT id FROM users WHERE username = ? AND id <> ?').get(newUsername, user.id) as { id: number } | undefined;
      if (exists) return jsonError('USERNAME_TAKEN', { status: 409, message: 'Username already exists.' });
      db.prepare('UPDATE users SET username = ?, updated_at = ? WHERE id = ?').run(newUsername, now, user.id);
    }
    if (body?.email) {
      const email = String(body.email).toLowerCase().trim();
      const exists = db.prepare('SELECT id FROM users WHERE email = ? AND id <> ?').get(email, user.id) as { id: number } | undefined;
      if (exists) return jsonError('EMAIL_TAKEN', { status: 409 });
      if (!verificationEnabled) {
        db.prepare('UPDATE users SET email = ?, email_verified_at = COALESCE(email_verified_at, ?), new_email = NULL, new_email_verification_code = NULL, new_email_verification_sent_at = NULL, updated_at = ? WHERE id = ?')
          .run(email, now, now, user.id);
        return jsonOk({ immediate: true, email });
      } else {
        const code = (await import('crypto')).randomUUID().replace(/-/g, '');
        db.prepare('UPDATE users SET new_email = ?, new_email_verification_code = ?, new_email_verification_sent_at = ?, updated_at = ? WHERE id = ?')
          .run(email, code, now, now, user.id);
        try {
          const url = new URL('/api/profile/verify-email', req.url);
          url.searchParams.set('code', code);
          await maybeSendEmail(
            email,
            'Verify your new email',
            `Click to verify: ${url.toString()}`,
            `<p>Click to verify your new email:</p><p><a href=\"${url.toString()}\">${url.toString()}</a></p>`
          );
        } catch {}
      }
    }

    if (body?.theme_preference && ['light','dark','system'].includes(body.theme_preference)) db.prepare('UPDATE users SET theme_preference = ?, updated_at = ? WHERE id = ?').run(body.theme_preference, now, user.id);
    return jsonOk();
  } catch (e: any) {
    // eslint-disable-next-line no-console
    console.error('[profile][PUT] error', e?.message || e);
    return jsonError(e?.message || 'UNAUTHORIZED', { status: 401 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const user = await requireAuth(req);
    const db = getDb();
    const row = db.prepare('SELECT avatar_url FROM users WHERE id = ?').get(user.id) as { avatar_url?: string|null } | undefined;
    const now = new Date().toISOString();
    db.prepare('UPDATE users SET avatar_url = NULL, updated_at = ? WHERE id = ?').run(now, user.id);
    try {
      if (row?.avatar_url) {
        const relative = row.avatar_url.replace(/^\//, '');
        const baseDir = path.join(process.cwd(), 'public', 'uploads', 'avatars');
        const abs = path.join(process.cwd(), 'public', relative);
        const normalized = path.normalize(abs);
        if (normalized.startsWith(path.normalize(baseDir + path.sep))) {
          if (fs.existsSync(normalized)) {
            try { await fs.promises.unlink(normalized); } catch {}
          }
        }
      }
    } catch {}
    return jsonOk();
  } catch (e: any) {
    return jsonError(e?.message || 'UNAUTHORIZED', { status: 401 });
  }
}


