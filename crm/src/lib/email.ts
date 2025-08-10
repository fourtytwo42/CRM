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
  return nodemailer.createTransport({
    host: settings.host,
    port: Number(settings.port || 465),
    secure: settings.secure ? true : false,
    auth: settings.username ? { user: settings.username, pass: settings.password || '' } : undefined,
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
    if (!cfg) return false;
    const transporter = createTransporterFromSettings(cfg);
    await transporter.sendMail({
      from: cfg.from_name ? `${cfg.from_name} <${cfg.from_email}>` : cfg.from_email,
      to,
      subject,
      text,
      html,
    });
    return true;
  } catch {
    return false;
  }
}


