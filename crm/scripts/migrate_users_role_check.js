// One-off migration to update users.role CHECK constraint to include agent/manager/lead/user
const Database = require('better-sqlite3');

function columnExists(db, table, name) {
  try {
    const cols = db.prepare(`PRAGMA table_info(${table})`).all();
    return Array.isArray(cols) && cols.some(c => c.name === name);
  } catch { return false; }
}

const db = new Database('./data/app.db');
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = OFF');

try {
  const info = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='users'").get();
  const ddl = info && info.sql ? String(info.sql) : '';
  const hasNewRoles = ddl.includes("'manager'") && ddl.includes("'lead'") && ddl.includes("'agent'");
  if (hasNewRoles) {
    console.log('Users table already has updated role CHECK. Skipping.');
  } else {
    console.log('Upgrading users table role CHECK constraint...');
    const hasEmail = columnExists(db, 'users', 'email');
    const hasNewEmailCols = ['email_verified_at','email_verification_code','email_verification_sent_at','new_email','new_email_verification_code','new_email_verification_sent_at'].every(n => columnExists(db, 'users', n));
    db.exec('BEGIN');
    db.exec(`
      CREATE TABLE IF NOT EXISTS users_tmp (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL UNIQUE,
        email TEXT,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL CHECK (role IN ('admin','power','manager','lead','agent','user')),
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
    `);
    if (hasEmail && hasNewEmailCols) {
      db.exec(`
        INSERT INTO users_tmp (
          id, username, email, password_hash, role, status, ban_reason, avatar_url, theme_preference, token_version,
          email_verified_at, email_verification_code, email_verification_sent_at, new_email, new_email_verification_code, new_email_verification_sent_at,
          last_login_at, last_seen_at, created_at, updated_at
        )
        SELECT
          id, username, email, password_hash, role, status, ban_reason, avatar_url, theme_preference, token_version,
          email_verified_at, email_verification_code, email_verification_sent_at, new_email, new_email_verification_code, new_email_verification_sent_at,
          last_login_at, last_seen_at, created_at, updated_at
        FROM users;
      `);
    } else if (hasEmail) {
      db.exec(`
        INSERT INTO users_tmp (
          id, username, email, password_hash, role, status, ban_reason, avatar_url, theme_preference, token_version,
          last_login_at, last_seen_at, created_at, updated_at
        )
        SELECT id, username, email, password_hash, role, status, ban_reason, avatar_url, theme_preference, token_version,
               last_login_at, last_seen_at, created_at, updated_at
        FROM users;
      `);
    } else {
      db.exec(`
        INSERT INTO users_tmp (
          id, username, email, password_hash, role, status, ban_reason, avatar_url, theme_preference, token_version,
          last_login_at, last_seen_at, created_at, updated_at
        )
        SELECT id, username, NULL as email, password_hash, role, status, ban_reason, avatar_url, theme_preference, token_version,
               last_login_at, last_seen_at, created_at, updated_at
        FROM users;
      `);
    }
    db.exec('DROP TABLE users;');
    db.exec('ALTER TABLE users_tmp RENAME TO users;');
    db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username_unique ON users(username);');
    db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_unique ON users(email) WHERE email IS NOT NULL;');
    db.pragma('user_version = 5');
    db.exec('COMMIT');
    console.log('Users table upgraded.');
  }
  const ver = db.pragma('user_version', { simple: true });
  console.log('user_version:', ver);
} catch (e) {
  try { db.exec('ROLLBACK'); } catch {}
  console.error(e);
  process.exit(1);
} finally {
  try { db.pragma('foreign_keys = ON'); } catch {}
  db.close();
}


