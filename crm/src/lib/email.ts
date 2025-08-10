import { getDb } from '@/lib/db';
import nodemailer, { Transporter } from 'nodemailer';
import { env } from './env';

export type EmailSettings = {
  host: string;
  port: number;
  secure: number;
  username?: string | null;
  password?: string | null;
  from_email: string;
  from_name?: string | null;
};

export function getEmailSettings(): EmailSettings | null {
  const db = getDb();
  const row = db
    .prepare(
      'SELECT host, port, secure, username, password, from_email, from_name FROM email_settings WHERE id = 1'
    )
    .get() as EmailSettings | undefined;
  if (!row || !row.host || !row.from_email) return null;
  return row;
}

export function createTransporterFromSettings(settings: EmailSettings): Transporter {
  // Fallback to from_email as SMTP username when explicit username is blank
  const user = (settings.username && String(settings.username).trim().length > 0)
    ? String(settings.username)
    : String(settings.from_email);
  const pass = settings.password || '';
  const useAuth = user && pass.length > 0;
  return nodemailer.createTransport({
    host: settings.host,
    port: Number(settings.port || 465),
    secure: settings.secure ? true : false,
    auth: useAuth ? { user, pass } : undefined,
    requireTLS: !(settings.secure ? true : false),
    connectionTimeout: env.smtpConnectionTimeoutMs,
    greetingTimeout: env.smtpGreetingTimeoutMs,
    socketTimeout: env.smtpSocketTimeoutMs,
    tls: { minVersion: 'TLSv1.2' },
  });
}

export async function maybeSendEmail(
  to: string,
  subject: string,
  text: string,
  html?: string
): Promise<boolean> {
  try {
    const cfg = getEmailSettings();
    if (!cfg) {
      // eslint-disable-next-line no-console
      console.warn('[email] not configured (missing host or from_email)');
      return false;
    }
    const transporter = createTransporterFromSettings(cfg);
    const info = await transporter.sendMail({
      from: cfg.from_name ? `${cfg.from_name} <${cfg.from_email}>` : cfg.from_email,
      to,
      subject,
      text,
      html,
    });
    // eslint-disable-next-line no-console
    console.log('[email] sent', {
      to,
      subject,
      messageId: (info as any)?.messageId,
      accepted: (info as any)?.accepted,
      rejected: (info as any)?.rejected,
      response: (info as any)?.response,
    });
    return true;
  } catch (e: any) {
    // eslint-disable-next-line no-console
    console.error('[email] sendMail failed', {
      message: e?.message || String(e),
      code: e?.code,
      command: e?.command,
      response: e?.response,
      responseCode: e?.responseCode,
      to,
      subject,
    });
    return false;
  }
}


