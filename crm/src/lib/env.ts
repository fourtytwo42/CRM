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
  // AI request timeout (used as a default for failover)
  aiRequestTimeoutMs: toNumber(process.env.AI_REQUEST_TIMEOUT_MS, 20000),
};


