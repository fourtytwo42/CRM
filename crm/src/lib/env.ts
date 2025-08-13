function toNumber(value: string | undefined, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export const env = {
  jwtSecret: process.env.JWT_SECRET || 'dev-secret-change-me',
  databasePath: process.env.DATABASE_PATH || './data/app.db',
  uploadDir: process.env.UPLOAD_DIR || './public/uploads/avatars',
  accessTokenMinutes: toNumber(process.env.ACCESS_TOKEN_MINUTES, 15),
  refreshTokenDays: toNumber(process.env.REFRESH_TOKEN_DAYS, 30),
  seedDemo: process.env.SEED_DEMO === 'true',
  smtpConnectionTimeoutMs: toNumber(process.env.SMTP_CONNECTION_TIMEOUT_MS, 10000),
  smtpGreetingTimeoutMs: toNumber(process.env.SMTP_GREETING_TIMEOUT_MS, 10000),
  smtpSocketTimeoutMs: toNumber(process.env.SMTP_SOCKET_TIMEOUT_MS, 15000),
  // IMAP (optional) for inbound email polling
  imapHost: process.env.IMAP_HOST || '',
  imapPort: toNumber(process.env.IMAP_PORT, 993),
  imapSecure: (process.env.IMAP_SECURE || 'true').toLowerCase() !== 'false',
  imapUsername: process.env.IMAP_USERNAME || '',
  imapPassword: process.env.IMAP_PASSWORD || '',
  // AI request timeout (used as a default for failover)
  aiRequestTimeoutMs: toNumber(process.env.AI_REQUEST_TIMEOUT_MS, 20000),
  // Public/base URL for links in emails (e.g., https://yourdomain.com)
  publicBaseUrl: process.env.PUBLIC_BASE_URL || '',
  // BulkVS (carrier) REST API configuration
  bulkvsBaseUrl: process.env.BULKVS_BASE_URL || 'https://portal.bulkvs.com/api/v1.0',
  // Basic auth token value only (without the leading 'Basic ' prefix)
  bulkvsBasicAuth: process.env.BULKVS_BASIC_AUTH || '',
  // Optional default outbound caller ID / messaging from DID
  bulkvsDefaultFromDid: process.env.BULKVS_DEFAULT_FROM_DID || '',
  // Optional Twilio for programmatic call originate
  twilioAccountSid: process.env.TWILIO_ACCOUNT_SID || '',
  twilioAuthToken: process.env.TWILIO_AUTH_TOKEN || '',
  twilioFromNumber: process.env.TWILIO_FROM_NUMBER || '',
  twilioMessagingServiceSid: process.env.TWILIO_MESSAGING_SERVICE_SID || '',
  // Optional Asterisk AMI for programmatic call originate via your PBX
  asteriskAmiHost: process.env.ASTERISK_AMI_HOST || '',
  asteriskAmiPort: toNumber(process.env.ASTERISK_AMI_PORT, 5038),
  asteriskAmiUsername: process.env.ASTERISK_AMI_USERNAME || '',
  asteriskAmiPassword: process.env.ASTERISK_AMI_PASSWORD || '',
  // Channel template, e.g., "PJSIP/${TO}@bulkvs" or "SIP/${TO}@bulkvs"; ${TO} will be replaced by destination digits
  asteriskChannelTemplate: process.env.ASTERISK_CHANNEL_TEMPLATE || '',
  // Application to run on answer; default Hangup for ring-through
  asteriskOriginateApplication: process.env.ASTERISK_ORIGINATE_APPLICATION || 'Hangup',
  // CallerID to present if not provided
  asteriskDefaultCallerId: process.env.ASTERISK_DEFAULT_CALLERID || '',
  asteriskOriginateTimeoutMs: toNumber(process.env.ASTERISK_ORIGINATE_TIMEOUT_MS, 30000),
};


