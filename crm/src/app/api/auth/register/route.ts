import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getDb } from '@/lib/db';
import bcrypt from 'bcryptjs';
import { ensureUploadDir, ensureUploadDirAsync } from '@/lib/fs';
import path from 'path';
import fs from 'fs';
import { processAvatarUpload, saveAvatarBuffer } from '@/lib/image';
import { randomUUID } from 'crypto';
import nodemailer from 'nodemailer';
import { maybeSendEmail } from '@/lib/email';
import { jsonOk, jsonError, methodNotAllowed } from '@/lib/http';

export const runtime = 'nodejs';

const MAX_AVATAR_BYTES = 5 * 1024 * 1024; // 5MB

const RegisterSchema = z.object({
  username: z.string().min(3).max(20).regex(/^[a-z0-9_]+$/),
  email: z.string().email().max(120),
  password: z.string().min(8),
});

export async function POST(req: NextRequest) {
  const db = getDb();

  const settings = db.prepare('SELECT registration_enabled FROM site_settings WHERE id = 1').get() as { registration_enabled: number };
    if (!settings || settings.registration_enabled !== 1) {
      return jsonError('REGISTRATION_DISABLED', { status: 403, message: 'Registration is currently disabled.' });
    }

  const contentType = req.headers.get('content-type') || '';
  if (contentType.includes('multipart/form-data')) {
    const formData = await req.formData();
    const username = String(formData.get('username') || '').toLowerCase().trim();
    const email = String(formData.get('email') || '').toLowerCase().trim();
    const password = String(formData.get('password') || '');
    const parsed = RegisterSchema.safeParse({ username, email, password });
    if (!parsed.success) return jsonError('VALIDATION', { status: 400, message: 'Invalid input.' });

    const existing = db.prepare('SELECT id FROM users WHERE username = ? OR email = ?').get(username, email) as { id: number } | undefined;
    if (existing) return jsonError('UNIQUENESS', { status: 409, message: 'Username or email already exists.' });

    let avatarUrl: string | null = null;
    const file = formData.get('avatar');
    if (file && typeof file === 'object' && 'arrayBuffer' in file) {
      const blob = file as unknown as File;
      if (blob.size > 0) {
        if (blob.size > MAX_AVATAR_BYTES) {
          return jsonError('AVATAR_TOO_LARGE', { status: 413, message: 'Avatar must be <= 5MB.' });
        }
        const raw = Buffer.from(await blob.arrayBuffer());
        const processed = await processAvatarUpload(raw);
        if (!processed) return jsonError('INVALID_AVATAR', { status: 400, message: 'Unsupported avatar file type.' });
        const saved = await saveAvatarBuffer(processed.buffer, processed.ext);
        avatarUrl = saved.avatarUrl;
      }
    }

    const password_hash = await bcrypt.hash(parsed.data.password, 10);
    const now = new Date().toISOString();
    const v = db.prepare('SELECT email_verification_enabled FROM site_settings WHERE id = 1').get() as { email_verification_enabled?: number } | undefined;
    const needsVerification = !!(v && v.email_verification_enabled === 1);
    if (needsVerification) {
      const code = randomUUID().replace(/-/g, '');
      db.prepare(`
        INSERT INTO users (username, email, password_hash, role, status, avatar_url, email_verification_code, email_verification_sent_at, created_at, updated_at)
        VALUES (?, ?, ?, 'user', 'suspended', ?, ?, ?, ?, ?)
      `).run(parsed.data.username, parsed.data.email, password_hash, avatarUrl, code, now, now, now);
      try {
        const url = new URL('/api/auth/verify', req.url);
        url.searchParams.set('code', code);
        await maybeSendEmail(
          parsed.data.email,
          'Verify your email',
          `Click to verify: ${url.toString()}`,
          `<p>Click to verify your account:</p><p><a href=\"${url.toString()}\">${url.toString()}</a></p>`
        );
      } catch {}
    } else {
      db.prepare(`
        INSERT INTO users (username, email, password_hash, role, status, avatar_url, email_verified_at, created_at, updated_at)
        VALUES (?, ?, ?, 'user', 'active', ?, ?, ?, ?)
      `).run(parsed.data.username, parsed.data.email, password_hash, avatarUrl, now, now, now);
    }

    return jsonOk();
  }

  // JSON fallback
  const body = await req.json().catch(() => null);
  const username = String(body?.username || '').toLowerCase().trim();
  const email = String(body?.email || '').toLowerCase().trim();
  const password = String(body?.password || '');
  const parsed = RegisterSchema.safeParse({ username, email, password });
  if (!parsed.success) return jsonError('VALIDATION', { status: 400, message: 'Invalid input.' });
  const existing = db.prepare('SELECT id FROM users WHERE username = ? OR email = ?').get(username, email) as { id: number } | undefined;
  if (existing) return jsonError('UNIQUENESS', { status: 409, message: 'Username or email already exists.' });
  const password_hash = await bcrypt.hash(parsed.data.password, 10);
  const now = new Date().toISOString();
  const v = db.prepare('SELECT email_verification_enabled FROM site_settings WHERE id = 1').get() as { email_verification_enabled?: number } | undefined;
  const needsVerification = !!(v && v.email_verification_enabled === 1);
  if (needsVerification) {
    const code = randomUUID().replace(/-/g, '');
    db.prepare(`
      INSERT INTO users (username, email, password_hash, role, status, email_verification_code, email_verification_sent_at, created_at, updated_at)
      VALUES (?, ?, ?, 'user', 'suspended', ?, ?, ?, ?)
    `).run(parsed.data.username, parsed.data.email, password_hash, code, now, now, now);
    try {
      const url = new URL('/api/auth/verify', req.url);
      url.searchParams.set('code', code);
      await maybeSendEmail(
        parsed.data.email,
        'Verify your email',
        `Click to verify: ${url.toString()}`,
        `<p>Click to verify your account:</p><p><a href=\"${url.toString()}\">${url.toString()}</a></p>`
      );
    } catch {}
  } else {
    db.prepare(`
      INSERT INTO users (username, email, password_hash, role, status, email_verified_at, created_at, updated_at)
      VALUES (?, ?, ?, 'user', 'active', ?, ?, ?)
    `).run(parsed.data.username, parsed.data.email, password_hash, now, now, now);
  }
  return jsonOk();
}


