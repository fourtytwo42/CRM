// Update demo users (admin, power, user) to use a known password: Password123!
// Usage: node scripts/update-demo-passwords.js

const path = require('path');
const Database = require('better-sqlite3');

const DB_PATH = path.resolve(process.cwd(), './data/app.db');
const db = new Database(DB_PATH);

const hash = '$2b$10$bXBuSBR2nXrDPPobCPBQ2.bLZoPipUoH4vGLiMvVaYBw6omgjEtVC'; // bcrypt for Password123!
const now = new Date().toISOString();
['admin', 'power', 'user'].forEach((u) => {
  db.prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE username = ?').run(hash, now, u);
});

const rows = db
  .prepare("SELECT username, password_hash FROM users WHERE username IN ('admin','power','user')")
  .all();
console.log('Updated demo users:', rows);


