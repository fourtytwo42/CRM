// Quick DB inspection to print user_version and users table DDL
const Database = require('better-sqlite3');
const db = new Database('./data/app.db');
try {
  const ver = db.pragma('user_version', { simple: true });
  const info = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='users'").get();
  console.log(JSON.stringify({ user_version: ver, users_sql: info && info.sql }, null, 2));
} catch (e) {
  console.error(e);
  process.exit(1);
}
db.close();


