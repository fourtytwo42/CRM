import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';
import { env } from './env';

// Persist DB handle and migration state across hot-reloads in dev
const g = globalThis as any;
let dbInstance: Database.Database | null = g.__dbInstance || null;
let migratedOnce = g.__dbMigratedOnce || false;

const SCHEMA_VERSION = 3; // bump when schema/backfills change

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
  // Wait up to 5s when the database file is busy (helps with dev hot-reload concurrent requests)
  try { dbInstance.pragma('busy_timeout = 5000'); } catch {}
  // Performance/durability tuned pragmas
  dbInstance.pragma('synchronous = NORMAL');
  dbInstance.pragma('temp_store = MEMORY');
  dbInstance.pragma('mmap_size = 268435456'); // 256MB

  if (isNewDb) {
    migrate(dbInstance);
    try { dbInstance.pragma(`user_version = ${SCHEMA_VERSION}`); } catch {}
    migratedOnce = true;
    seed(dbInstance);
  } else if (!migratedOnce) {
    const current = Number(dbInstance.pragma('user_version', { simple: true }));
    if (current < SCHEMA_VERSION) {
      migrate(dbInstance);
      try { dbInstance.pragma(`user_version = ${SCHEMA_VERSION}`); } catch {}
    }
    migratedOnce = true;
  }

  // Ensure demo users exist only when explicitly enabled via env.seedDemo in non-production
  try {
    if (process.env.NODE_ENV !== 'production' && env.seedDemo) {
      ensureDemoUsers(dbInstance);
    }
  } catch {}

  // Save in global for hot-reload reuse
  g.__dbInstance = dbInstance;
  g.__dbMigratedOnce = migratedOnce;
  return dbInstance;
}

function migrate(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
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

  // Customers (external contacts; no passwords)
  db.exec(`
    CREATE TABLE IF NOT EXISTS customers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      first_name TEXT,
      last_name TEXT,
      full_name TEXT,
      email TEXT,
      phone TEXT,
      company TEXT,
      title TEXT,
      notes TEXT,
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('lead','active','inactive','archived')),
      preferred_contact TEXT NOT NULL DEFAULT 'email' CHECK (preferred_contact IN ('email','phone','none')),
      email_verified_at TEXT,
      email_verification_code TEXT,
      email_verification_sent_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_customers_full_name ON customers(full_name);
    CREATE INDEX IF NOT EXISTS idx_customers_status ON customers(status);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_email_unique ON customers(email) WHERE email IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone);
  `);

  // Verticals (top-level accounts/segments)
  db.exec(`
    CREATE TABLE IF NOT EXISTS verticals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  // Campaigns (belong to a vertical)
  db.exec(`
    CREATE TABLE IF NOT EXISTS campaigns (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      vertical_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','archived')),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(vertical_id) REFERENCES verticals(id)
    );
    CREATE INDEX IF NOT EXISTS idx_campaigns_vertical_id ON campaigns(vertical_id);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_campaigns_unique ON campaigns(vertical_id, name);
  `);

  // Agent assignments to campaigns
  db.exec(`
    CREATE TABLE IF NOT EXISTS agent_campaigns (
      agent_user_id INTEGER NOT NULL,
      campaign_id INTEGER NOT NULL,
      assigned_at TEXT NOT NULL,
      PRIMARY KEY (agent_user_id, campaign_id),
      FOREIGN KEY(agent_user_id) REFERENCES users(id),
      FOREIGN KEY(campaign_id) REFERENCES campaigns(id)
    );
    CREATE INDEX IF NOT EXISTS idx_agent_campaigns_agent ON agent_campaigns(agent_user_id);
    CREATE INDEX IF NOT EXISTS idx_agent_campaigns_campaign ON agent_campaigns(campaign_id);
  `);

  // Agent assignments to verticals (many-to-many)
  db.exec(`
    CREATE TABLE IF NOT EXISTS agent_verticals (
      agent_user_id INTEGER NOT NULL,
      vertical_id INTEGER NOT NULL,
      assigned_at TEXT NOT NULL,
      PRIMARY KEY (agent_user_id, vertical_id),
      FOREIGN KEY(agent_user_id) REFERENCES users(id),
      FOREIGN KEY(vertical_id) REFERENCES verticals(id)
    );
    CREATE INDEX IF NOT EXISTS idx_agent_verticals_agent ON agent_verticals(agent_user_id);
    CREATE INDEX IF NOT EXISTS idx_agent_verticals_vertical ON agent_verticals(vertical_id);
  `);

  // Supervisor relations (manager/lead supervising an agent)
  db.exec(`
    CREATE TABLE IF NOT EXISTS agent_supervisors (
      agent_user_id INTEGER NOT NULL,
      supervisor_user_id INTEGER NOT NULL,
      kind TEXT NOT NULL CHECK (kind IN ('manager','lead')),
      assigned_at TEXT NOT NULL,
      PRIMARY KEY (agent_user_id, supervisor_user_id, kind),
      FOREIGN KEY(agent_user_id) REFERENCES users(id),
      FOREIGN KEY(supervisor_user_id) REFERENCES users(id)
    );
    CREATE INDEX IF NOT EXISTS idx_agent_supervisors_agent ON agent_supervisors(agent_user_id);
    CREATE INDEX IF NOT EXISTS idx_agent_supervisors_supervisor ON agent_supervisors(supervisor_user_id);
    CREATE INDEX IF NOT EXISTS idx_agent_supervisors_kind ON agent_supervisors(kind);
  `);

  // Customer assignments to campaigns
  db.exec(`
    CREATE TABLE IF NOT EXISTS customer_campaigns (
      customer_id INTEGER NOT NULL,
      campaign_id INTEGER NOT NULL,
      assigned_at TEXT NOT NULL,
      PRIMARY KEY (customer_id, campaign_id),
      FOREIGN KEY(customer_id) REFERENCES customers(id),
      FOREIGN KEY(campaign_id) REFERENCES campaigns(id)
    );
    CREATE INDEX IF NOT EXISTS idx_customer_campaigns_customer ON customer_campaigns(customer_id);
    CREATE INDEX IF NOT EXISTS idx_customer_campaigns_campaign ON customer_campaigns(campaign_id);
  `);

  // Tasks assigned to agents (optionally tied to a customer/campaign)
  db.exec(`
    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT,
      status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','in-progress','done','cancelled')),
      priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low','normal','high','urgent')),
      due_date TEXT,
      created_at TEXT NOT NULL,
      completed_at TEXT,
      created_by_user_id INTEGER NOT NULL,
      assigned_to_user_id INTEGER NOT NULL,
      campaign_id INTEGER,
      customer_id INTEGER,
      FOREIGN KEY(created_by_user_id) REFERENCES users(id),
      FOREIGN KEY(assigned_to_user_id) REFERENCES users(id),
      FOREIGN KEY(campaign_id) REFERENCES campaigns(id),
      FOREIGN KEY(customer_id) REFERENCES customers(id)
    );
    CREATE INDEX IF NOT EXISTS idx_tasks_assigned_to ON tasks(assigned_to_user_id);
    CREATE INDEX IF NOT EXISTS idx_tasks_campaign ON tasks(campaign_id);
    CREATE INDEX IF NOT EXISTS idx_tasks_customer ON tasks(customer_id);
    CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
  `);

  // Free-form notes
  db.exec(`
    CREATE TABLE IF NOT EXISTS notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      body TEXT NOT NULL,
      created_at TEXT NOT NULL,
      created_by_user_id INTEGER NOT NULL,
      agent_user_id INTEGER,
      customer_id INTEGER,
      campaign_id INTEGER,
      FOREIGN KEY(created_by_user_id) REFERENCES users(id),
      FOREIGN KEY(agent_user_id) REFERENCES users(id),
      FOREIGN KEY(customer_id) REFERENCES customers(id),
      FOREIGN KEY(campaign_id) REFERENCES campaigns(id)
    );
    CREATE INDEX IF NOT EXISTS idx_notes_customer ON notes(customer_id);
    CREATE INDEX IF NOT EXISTS idx_notes_agent ON notes(agent_user_id);
    CREATE INDEX IF NOT EXISTS idx_notes_campaign ON notes(campaign_id);
  `);

  // Communications (email/message/call) linked to customers and optionally agents/campaigns
  db.exec(`
    CREATE TABLE IF NOT EXISTS communications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL CHECK (type IN ('email','message','call')),
      direction TEXT NOT NULL CHECK (direction IN ('in','out')),
      subject TEXT,
      body TEXT,
      customer_id INTEGER NOT NULL,
      agent_user_id INTEGER,
      campaign_id INTEGER,
      created_at TEXT NOT NULL,
      FOREIGN KEY(customer_id) REFERENCES customers(id),
      FOREIGN KEY(agent_user_id) REFERENCES users(id),
      FOREIGN KEY(campaign_id) REFERENCES campaigns(id)
    );
    CREATE INDEX IF NOT EXISTS idx_comms_customer ON communications(customer_id);
    CREATE INDEX IF NOT EXISTS idx_comms_agent ON communications(agent_user_id);
    CREATE INDEX IF NOT EXISTS idx_comms_campaign ON communications(campaign_id);
  `);

  // Lightweight "cases" (deals/tickets/projects)
  db.exec(`
    CREATE TABLE IF NOT EXISTS cases (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      stage TEXT NOT NULL DEFAULT 'new' CHECK (stage IN ('new','in-progress','won','lost','closed')),
      customer_id INTEGER NOT NULL,
      campaign_id INTEGER,
      agent_user_id INTEGER,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(customer_id) REFERENCES customers(id),
      FOREIGN KEY(campaign_id) REFERENCES campaigns(id),
      FOREIGN KEY(agent_user_id) REFERENCES users(id)
    );
    CREATE INDEX IF NOT EXISTS idx_cases_customer ON cases(customer_id);
    CREATE INDEX IF NOT EXISTS idx_cases_campaign ON cases(campaign_id);
    CREATE INDEX IF NOT EXISTS idx_cases_agent ON cases(agent_user_id);
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

  // Backfill: upgrade role enum and map legacy 'user' -> 'agent'
  try {
    const info = db.prepare(`SELECT sql FROM sqlite_master WHERE type='table' AND name='users'`).get() as { sql?: string } | undefined;
    if (info && info.sql && !info.sql.includes("'manager'")) {
      db.exec('BEGIN');
      db.exec(`
        CREATE TABLE IF NOT EXISTS users_tmp (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          username TEXT NOT NULL UNIQUE,
          email TEXT,
          password_hash TEXT NOT NULL,
          role TEXT NOT NULL CHECK (role IN ('admin','power','manager','lead','agent')),
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
      db.exec(`
        INSERT INTO users_tmp (
          id, username, email, password_hash, role, status, ban_reason, avatar_url, theme_preference, token_version,
          email_verified_at, email_verification_code, email_verification_sent_at, new_email, new_email_verification_code, new_email_verification_sent_at,
          last_login_at, last_seen_at, created_at, updated_at
        )
        SELECT
          id, username, email, password_hash,
          CASE role WHEN 'user' THEN 'agent' ELSE role END,
          status, ban_reason, avatar_url, theme_preference, token_version,
          email_verified_at, email_verification_code, email_verification_sent_at, new_email, new_email_verification_code, new_email_verification_sent_at,
          last_login_at, last_seen_at, created_at, updated_at
        FROM users;
      `);
      db.exec(`DROP TABLE users;`);
      db.exec(`ALTER TABLE users_tmp RENAME TO users;`);
      db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username_unique ON users(username);`);
      db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_unique ON users(email) WHERE email IS NOT NULL`);
      db.exec('COMMIT');
    }
  } catch {}

  // Backfill for site_settings new column
  try {
    const cols = db.prepare(`PRAGMA table_info(site_settings)`).all() as Array<{ name: string }>;
    if (!cols.some(c => c.name === 'email_verification_enabled')) {
      db.exec(`ALTER TABLE site_settings ADD COLUMN email_verification_enabled INTEGER NOT NULL DEFAULT 0`);
    }
  } catch {}

  // Backfill: customers table columns if upgrading existing DBs
  try {
    const cols = db.prepare(`PRAGMA table_info(customers)`).all() as Array<{ name: string }>;
    if (cols && cols.length > 0) {
      const ensure = (name: string, ddl: string) => { if (!cols.some(c => c.name === name)) db.exec(ddl); };
      ensure('first_name', `ALTER TABLE customers ADD COLUMN first_name TEXT`);
      ensure('last_name', `ALTER TABLE customers ADD COLUMN last_name TEXT`);
      ensure('full_name', `ALTER TABLE customers ADD COLUMN full_name TEXT`);
      ensure('email', `ALTER TABLE customers ADD COLUMN email TEXT`);
      ensure('phone', `ALTER TABLE customers ADD COLUMN phone TEXT`);
      ensure('company', `ALTER TABLE customers ADD COLUMN company TEXT`);
      ensure('title', `ALTER TABLE customers ADD COLUMN title TEXT`);
      ensure('notes', `ALTER TABLE customers ADD COLUMN notes TEXT`);
      ensure('status', `ALTER TABLE customers ADD COLUMN status TEXT NOT NULL DEFAULT 'active'`);
      ensure('preferred_contact', `ALTER TABLE customers ADD COLUMN preferred_contact TEXT NOT NULL DEFAULT 'email'`);
      ensure('email_verified_at', `ALTER TABLE customers ADD COLUMN email_verified_at TEXT`);
      ensure('email_verification_code', `ALTER TABLE customers ADD COLUMN email_verification_code TEXT`);
      ensure('email_verification_sent_at', `ALTER TABLE customers ADD COLUMN email_verification_sent_at TEXT`);
      ensure('created_at', `ALTER TABLE customers ADD COLUMN created_at TEXT NOT NULL DEFAULT '${new Date().toISOString()}'`);
      ensure('updated_at', `ALTER TABLE customers ADD COLUMN updated_at TEXT NOT NULL DEFAULT '${new Date().toISOString()}'`);
      db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_email_unique ON customers(email) WHERE email IS NOT NULL`);
      db.exec(`CREATE INDEX IF NOT EXISTS idx_customers_full_name ON customers(full_name)`);
      db.exec(`CREATE INDEX IF NOT EXISTS idx_customers_status ON customers(status)`);
      db.exec(`CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone)`);
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
  insertUser.run({ username: 'manager', email: 'manager@example.com', password_hash: defaultHash, role: 'manager', created_at: now, updated_at: now });
  insertUser.run({ username: 'lead', email: 'lead@example.com', password_hash: defaultHash, role: 'lead', created_at: now, updated_at: now });
  insertUser.run({ username: 'agent', email: 'agent@example.com', password_hash: defaultHash, role: 'agent', created_at: now, updated_at: now });

  // Default settings for development
  db.prepare(`INSERT OR IGNORE INTO site_settings (id, registration_enabled) VALUES (1, 1)`).run();
  db.prepare(`UPDATE site_settings SET email_verification_enabled = COALESCE(email_verification_enabled, 0) WHERE id = 1`).run();

  // Seed a handful of customers for development
  try {
    const nowIso = new Date().toISOString();
    const insertCustomer = db.prepare(`
      INSERT OR IGNORE INTO customers (first_name, last_name, full_name, email, phone, company, title, notes, status, preferred_contact, created_at, updated_at)
      VALUES (@first_name, @last_name, @full_name, @email, @phone, @company, @title, @notes, @status, @preferred_contact, @created_at, @updated_at)
    `);
    const demoCustomers = [
      { first_name: 'Jane', last_name: 'Doe', email: 'jane.doe@example.com', phone: '+1 (415) 555-0199', company: 'Globex', title: 'VP Marketing', status: 'active' },
      { first_name: 'John', last_name: 'Smith', email: 'john.smith@example.com', phone: '+1 (212) 555-0134', company: 'Initech', title: 'CTO', status: 'lead' },
      { first_name: 'Ava', last_name: 'Patel', email: 'ava.patel@example.com', phone: '+44 20 7946 0958', company: 'Hooli', title: 'Head of Ops', status: 'active' },
      { first_name: 'Carlos', last_name: 'Ruiz', email: 'carlos.ruiz@example.com', phone: '+34 91 123 4567', company: 'Vandelay Industries', title: 'Procurement', status: 'inactive' },
      { first_name: 'Mia', last_name: 'Chen', email: 'mia.chen@example.com', phone: '+86 10 5555 8888', company: 'Pied Piper', title: 'Product Lead', status: 'lead' }
    ];
    for (const c of demoCustomers) {
      insertCustomer.run({
        first_name: c.first_name,
        last_name: c.last_name,
        full_name: `${c.first_name} ${c.last_name}`,
        email: c.email,
        phone: c.phone,
        company: c.company,
        title: c.title,
        notes: 'VIP prospect. Imported for demo.',
        status: c.status,
        preferred_contact: 'email',
        created_at: nowIso,
        updated_at: nowIso,
      });
    }
  } catch {}

  // Seed verticals, campaigns, assignments, and CRM data
  try {
    const nowIso = new Date().toISOString();
    const insertVertical = db.prepare(`INSERT OR IGNORE INTO verticals (name, created_at, updated_at) VALUES (?, ?, ?)`);
    const insertCampaign = db.prepare(`INSERT OR IGNORE INTO campaigns (vertical_id, name, status, created_at, updated_at) VALUES (?, ?, 'active', ?, ?)`);
    const insertAgentCampaign = db.prepare(`INSERT OR IGNORE INTO agent_campaigns (agent_user_id, campaign_id, assigned_at) VALUES (?, ?, ?)`);
    const insertCustomerCampaign = db.prepare(`INSERT OR IGNORE INTO customer_campaigns (customer_id, campaign_id, assigned_at) VALUES (?, ?, ?)`);
    const insertTask = db.prepare(`INSERT OR IGNORE INTO tasks (title, description, status, priority, due_date, created_at, created_by_user_id, assigned_to_user_id, campaign_id, customer_id) VALUES (@title, @description, @status, @priority, @due_date, @created_at, @created_by_user_id, @assigned_to_user_id, @campaign_id, @customer_id)`);
    const insertNote = db.prepare(`INSERT OR IGNORE INTO notes (body, created_at, created_by_user_id, agent_user_id, customer_id, campaign_id) VALUES (?, ?, ?, ?, ?, ?)`);
    const insertComm = db.prepare(`INSERT OR IGNORE INTO communications (type, direction, subject, body, customer_id, agent_user_id, campaign_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);

    // Ensure verticals exist
    const verticalNames = ["Dick's Sporting Goods", 'Acme Retail', 'Initech Healthcare'];
    verticalNames.forEach((vn) => insertVertical.run(vn, nowIso, nowIso));
    const getVerticalId = (name: string) => (db.prepare(`SELECT id FROM verticals WHERE name = ?`).get(name) as { id: number }).id;
    const vDicks = getVerticalId("Dick's Sporting Goods");
    const vAcme = getVerticalId('Acme Retail');
    const vInitech = getVerticalId('Initech Healthcare');

    // Ensure campaigns under each vertical
    const ensureCampaign = (verticalId: number, name: string) => {
      insertCampaign.run(verticalId, name, nowIso, nowIso);
      return (db.prepare(`SELECT id FROM campaigns WHERE vertical_id = ? AND name = ?`).get(verticalId, name) as { id: number }).id;
    };
    const cSellShoes = ensureCampaign(vDicks, 'Sell Shoes');
    const cSellHats = ensureCampaign(vDicks, 'Sell Hats');
    const cBackToSchool = ensureCampaign(vAcme, 'Back to School');
    const cQ4Expansion = ensureCampaign(vInitech, 'Q4 Expansion');

    // Map demo users to campaigns (treat 'user' and 'power' as agents)
    const uid = (u: string) => (db.prepare(`SELECT id FROM users WHERE username = ?`).get(u) as { id: number }).id;
    const adminId = uid('admin');
    const powerId = uid('power');
    const managerId = uid('manager');
    const leadId = uid('lead');
    const agentId = uid('agent');
    [cSellShoes, cSellHats].forEach((cid) => insertAgentCampaign.run(agentId, cid, nowIso));
    [cSellShoes, cSellHats, cBackToSchool, cQ4Expansion].forEach((cid) => insertAgentCampaign.run(powerId, cid, nowIso));
    // Optionally assign admin as observer
    [cQ4Expansion].forEach((cid) => insertAgentCampaign.run(adminId, cid, nowIso));

    // Assign manager/lead to verticals
    const insertAgentVertical = db.prepare(`INSERT OR IGNORE INTO agent_verticals (agent_user_id, vertical_id, assigned_at) VALUES (?, ?, ?)`);
    [vDicks, vAcme, vInitech].forEach((vid) => insertAgentVertical.run(managerId, vid, nowIso));
    [vDicks].forEach((vid) => insertAgentVertical.run(leadId, vid, nowIso));

    // Supervisors for agent
    const insertSupervisor = db.prepare(`INSERT OR IGNORE INTO agent_supervisors (agent_user_id, supervisor_user_id, kind, assigned_at) VALUES (?, ?, ?, ?)`);
    insertSupervisor.run(agentId, managerId, 'manager', nowIso);
    insertSupervisor.run(agentId, leadId, 'lead', nowIso);

    // Assign customers to campaigns
    const getCustomerIdByEmail = (email: string) => (db.prepare(`SELECT id FROM customers WHERE email = ?`).get(email) as { id: number } | undefined)?.id;
    const janeId = getCustomerIdByEmail('jane.doe@example.com');
    const johnId = getCustomerIdByEmail('john.smith@example.com');
    const avaId = getCustomerIdByEmail('ava.patel@example.com');
    const carlosId = getCustomerIdByEmail('carlos.ruiz@example.com');
    const miaId = getCustomerIdByEmail('mia.chen@example.com');
    const safeAssign = (cid?: number, camp?: number) => { if (cid && camp) insertCustomerCampaign.run(cid, camp, nowIso); };
    safeAssign(janeId, cSellShoes);
    safeAssign(johnId, cBackToSchool);
    safeAssign(avaId, cQ4Expansion);
    safeAssign(carlosId, cSellHats);
    safeAssign(miaId, cSellShoes);

    // Example tasks
    insertTask.run({ title: 'Follow up intro email', description: 'Send product overview', status: 'open', priority: 'normal', due_date: nowIso, created_at: nowIso, created_by_user_id: powerId, assigned_to_user_id: agentId, campaign_id: cSellShoes, customer_id: johnId || null });
    insertTask.run({ title: 'Prep demo deck', description: 'Include ROI slide', status: 'in-progress', priority: 'high', due_date: nowIso, created_at: nowIso, created_by_user_id: adminId, assigned_to_user_id: powerId, campaign_id: cQ4Expansion, customer_id: avaId || null });

    // Example notes
    if (janeId) insertNote.run('VIP prospect — prefers email in AM.', nowIso, powerId, null, janeId, cSellShoes);

    // Example communications
    if (janeId) insertComm.run('email', 'out', 'Welcome', 'Thanks for your interest — attaching brochure.', janeId, powerId, cSellShoes, nowIso);
  } catch {}
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

