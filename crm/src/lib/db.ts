import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';
import { env } from './env';

let dbInstance: Database.Database | null = null;

function ensureDirectoryExists(directoryPath: string): void {
  if (!fs.existsSync(directoryPath)) {
    fs.mkdirSync(directoryPath, { recursive: true });
  }
}

function getDb(): Database.Database {
  if (dbInstance) return dbInstance;

  const dbFilePath = path.resolve(process.cwd(), env.databasePath);
  ensureDirectoryExists(path.dirname(dbFilePath));

  const isNewDb = !fs.existsSync(dbFilePath);
  dbInstance = new Database(dbFilePath);
  dbInstance.pragma('journal_mode = WAL');
  // Performance/durability tuned pragmas
  dbInstance.pragma('synchronous = NORMAL');
  dbInstance.pragma('temp_store = MEMORY');
  dbInstance.pragma('mmap_size = 268435456'); // 256MB

  if (isNewDb) {
    migrate(dbInstance);
    seed(dbInstance);
  } else {
    migrate(dbInstance);
  }

  // Ensure demo users exist only when explicitly enabled via env.seedDemo in non-production
  try {
    if (process.env.NODE_ENV !== 'production' && env.seedDemo) {
      ensureDemoUsers(dbInstance);
    }
  } catch {}

  return dbInstance;
}

function migrate(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      email TEXT,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('admin','power','user')),
      status TEXT NOT NULL CHECK (status IN ('active','suspended','banned')),
      ban_reason TEXT,
      avatar_url TEXT,
      theme_preference TEXT NOT NULL DEFAULT 'system' CHECK (theme_preference IN ('light','dark','system')),
      token_version INTEGER NOT NULL DEFAULT 0,
      email_verified_at TEXT,
      email_verification_code TEXT,
      email_verification_sent_at TEXT,
      new_email TEXT,
      new_email_verification_code TEXT,
      new_email_verification_sent_at TEXT,
      last_login_at TEXT,
      last_seen_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS site_settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      registration_enabled INTEGER NOT NULL DEFAULT 1,
      email_verification_enabled INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS refresh_tokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      token_hash TEXT NOT NULL,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      last_used_at TEXT,
      revoked_at TEXT,
      replaced_by_token_id INTEGER,
      user_agent TEXT,
      ip_address TEXT,
      FOREIGN KEY(user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      actor_user_id INTEGER,
      target_user_id INTEGER,
      action TEXT NOT NULL,
      metadata TEXT,
      created_at TEXT NOT NULL,
      ip_address TEXT,
      user_agent TEXT,
      FOREIGN KEY(actor_user_id) REFERENCES users(id),
      FOREIGN KEY(target_user_id) REFERENCES users(id)
    );

    CREATE INDEX IF NOT EXISTS idx_users_last_seen_at ON users(last_seen_at);
    CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id ON refresh_tokens(user_id);
    CREATE INDEX IF NOT EXISTS idx_refresh_tokens_token_hash ON refresh_tokens(token_hash);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username_unique ON users(username);
  `);

  // Helpful indexes for admin listing sorts
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_users_created_at ON users(created_at);
    CREATE INDEX IF NOT EXISTS idx_users_last_login_at ON users(last_login_at);
    CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
    CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);
  `);

  // AI provider settings
  db.exec(`
    CREATE TABLE IF NOT EXISTS ai_providers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      provider TEXT NOT NULL,
      label TEXT,
      api_key TEXT,
      base_url TEXT,
      model TEXT,
      enabled INTEGER NOT NULL DEFAULT 0,
      timeout_ms INTEGER,
      priority INTEGER NOT NULL DEFAULT 1000,
      settings TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_ai_providers_enabled ON ai_providers(enabled);
    CREATE INDEX IF NOT EXISTS idx_ai_providers_priority ON ai_providers(priority);
  `);

  // Email settings table (single row id=1)
  db.exec(`
    CREATE TABLE IF NOT EXISTS email_settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      host TEXT NOT NULL DEFAULT '',
      port INTEGER NOT NULL DEFAULT 465,
      secure INTEGER NOT NULL DEFAULT 1,
      username TEXT,
      password TEXT,
      from_email TEXT NOT NULL DEFAULT '',
      from_name TEXT,
      updated_at TEXT NOT NULL
    );
  `);

  // Login rate limit buckets per (username, ip, window)
  db.exec(`
    CREATE TABLE IF NOT EXISTS login_attempts (
      username TEXT,
      ip_address TEXT,
      window_start_ms INTEGER NOT NULL,
      attempts INTEGER NOT NULL,
      last_attempt_ms INTEGER NOT NULL,
      PRIMARY KEY (username, ip_address, window_start_ms)
    );
    CREATE INDEX IF NOT EXISTS idx_login_attempts_ip_window ON login_attempts(ip_address, window_start_ms);
    CREATE INDEX IF NOT EXISTS idx_login_attempts_user_window ON login_attempts(username, window_start_ms);
  `);

  // Email verification resend rate-limit buckets per (user_id, ip, day-window)
  db.exec(`
    CREATE TABLE IF NOT EXISTS email_attempts (
      user_id INTEGER NOT NULL,
      ip_address TEXT,
      window_start_ms INTEGER NOT NULL,
      attempts INTEGER NOT NULL,
      last_attempt_ms INTEGER NOT NULL,
      PRIMARY KEY (user_id, ip_address, window_start_ms)
    );
    CREATE INDEX IF NOT EXISTS idx_email_attempts_ip_window ON email_attempts(ip_address, window_start_ms);
    CREATE INDEX IF NOT EXISTS idx_email_attempts_user_window ON email_attempts(user_id, window_start_ms);
  `);

  // Refresh attempts limiter per (token_hash, ip, window)
  db.exec(`
    CREATE TABLE IF NOT EXISTS refresh_attempts (
      token_hash TEXT,
      ip_address TEXT,
      window_start_ms INTEGER NOT NULL,
      attempts INTEGER NOT NULL,
      last_attempt_ms INTEGER NOT NULL,
      PRIMARY KEY (token_hash, ip_address, window_start_ms)
    );
    CREATE INDEX IF NOT EXISTS idx_refresh_attempts_ip_window ON refresh_attempts(ip_address, window_start_ms);
    CREATE INDEX IF NOT EXISTS idx_refresh_attempts_token_window ON refresh_attempts(token_hash, window_start_ms);
  `);
  db.prepare(`
    INSERT OR IGNORE INTO email_settings (id, host, port, secure, username, password, from_email, from_name, updated_at)
    VALUES (1, '', 465, 1, NULL, NULL, '', NULL, ?)
  `).run(new Date().toISOString());

  // Backfill migration for email column and unique index on existing databases
  try {
    const cols = db.prepare(`PRAGMA table_info(users)`).all() as Array<{ name: string }>;
    const hasEmail = cols.some(c => c.name === 'email');
    if (!hasEmail) {
      db.exec(`ALTER TABLE users ADD COLUMN email TEXT`);
    }
    if (!cols.some(c => c.name === 'email_verified_at')) {
      db.exec(`ALTER TABLE users ADD COLUMN email_verified_at TEXT`);
    }
    if (!cols.some(c => c.name === 'email_verification_code')) {
      db.exec(`ALTER TABLE users ADD COLUMN email_verification_code TEXT`);
    }
    if (!cols.some(c => c.name === 'email_verification_sent_at')) {
      db.exec(`ALTER TABLE users ADD COLUMN email_verification_sent_at TEXT`);
    }
    if (!cols.some(c => c.name === 'new_email')) {
      db.exec(`ALTER TABLE users ADD COLUMN new_email TEXT`);
    }
    if (!cols.some(c => c.name === 'new_email_verification_code')) {
      db.exec(`ALTER TABLE users ADD COLUMN new_email_verification_code TEXT`);
    }
    if (!cols.some(c => c.name === 'new_email_verification_sent_at')) {
      db.exec(`ALTER TABLE users ADD COLUMN new_email_verification_sent_at TEXT`);
    }
  } catch {}
  // Ensure unique index on email when present (nullable allowed)
  db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_unique ON users(email) WHERE email IS NOT NULL`);

  // Backfill for site_settings new column
  try {
    const cols = db.prepare(`PRAGMA table_info(site_settings)`).all() as Array<{ name: string }>;
    if (!cols.some(c => c.name === 'email_verification_enabled')) {
      db.exec(`ALTER TABLE site_settings ADD COLUMN email_verification_enabled INTEGER NOT NULL DEFAULT 0`);
    }
  } catch {}
}

function seed(db: Database.Database): void {
  const now = new Date().toISOString();

  // In production, never create default users with known credentials.
  // Only ensure baseline settings row exists; administrators must create accounts explicitly.
  if (process.env.NODE_ENV === 'production') {
    db.prepare(`INSERT OR IGNORE INTO site_settings (id, registration_enabled) VALUES (1, 0)`).run();
    db.prepare(`UPDATE site_settings SET email_verification_enabled = COALESCE(email_verification_enabled, 0) WHERE id = 1`).run();
    return;
  }

  // Development seeding: create convenient demo users with a known password hash.
  const insertUser = db.prepare(`
    INSERT OR IGNORE INTO users (username, email, password_hash, role, status, created_at, updated_at)
    VALUES (@username, @email, @password_hash, @role, 'active', @created_at, @updated_at)
  `);

  // Placeholder bcrypt hash for 'Password123!'. Do not use in production.
  const defaultHash = '$2b$10$bXBuSBR2nXrDPPobCPBQ2.bLZoPipUoH4vGLiMvVaYBw6omgjEtVC';

  insertUser.run({ username: 'admin', email: 'admin@example.com', password_hash: defaultHash, role: 'admin', created_at: now, updated_at: now });
  insertUser.run({ username: 'power', email: 'power@example.com', password_hash: defaultHash, role: 'power', created_at: now, updated_at: now });
  insertUser.run({ username: 'user', email: 'user@example.com', password_hash: defaultHash, role: 'user', created_at: now, updated_at: now });

  // Default settings for development
  db.prepare(`INSERT OR IGNORE INTO site_settings (id, registration_enabled) VALUES (1, 1)`).run();
  db.prepare(`UPDATE site_settings SET email_verification_enabled = COALESCE(email_verification_enabled, 0) WHERE id = 1`).run();
}

function ensureDemoUsers(db: Database.Database): void {
  const now = new Date().toISOString();
  const hash = '$2b$10$bXBuSBR2nXrDPPobCPBQ2.bLZoPipUoH4vGLiMvVaYBw6omgjEtVC'; // Password123!
  const insert = db.prepare(`
    INSERT OR IGNORE INTO users (username, email, password_hash, role, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, 'active', ?, ?)
  `);
  insert.run('admin', 'admin@example.com', hash, 'admin', now, now);
  insert.run('power', 'power@example.com', hash, 'power', now, now);
  insert.run('user', 'user@example.com', hash, 'user', now, now);

  const updatePwd = db.prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE username = ?');
  updatePwd.run(hash, now, 'admin');
  updatePwd.run(hash, now, 'power');
  updatePwd.run(hash, now, 'user');

  const updateEmail = db.prepare('UPDATE users SET email = ?, updated_at = ? WHERE username = ? AND (email IS NULL OR email = "")');
  updateEmail.run('admin@example.com', now, 'admin');
  updateEmail.run('power@example.com', now, 'power');
  updateEmail.run('user@example.com', now, 'user');
}

export { getDb };

