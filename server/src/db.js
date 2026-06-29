// User store. Uses Postgres when DATABASE_URL is set (production), otherwise an
// in-memory Map (local dev — data resets on restart). Same async interface both
// ways, so the rest of the server doesn't care which is active.

import { config, dbEnabled } from './config.js';

let pool = null;

export async function initDb() {
  if (!dbEnabled()) {
    console.log('  存储: 内存（未设 DATABASE_URL；重启会清空，仅适合本地）');
    return;
  }
  const { default: pg } = await import('pg');
  pool = new pg.Pool({
    connectionString: config.db.url,
    ssl: { rejectUnauthorized: false }, // Render/Railway managed PG need SSL
  });
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      email    TEXT PRIMARY KEY,
      account  TEXT NOT NULL,
      plan     TEXT NOT NULL DEFAULT 'Free',
      remaining INTEGER NOT NULL DEFAULT ${config.freeQuota},
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  console.log('  存储: Postgres（已连接）');
}

// ---- in-memory fallback ----
const mem = new Map();
function memUser(email) {
  let u = mem.get(email);
  if (!u) {
    u = { email, account: email.split('@')[0], plan: 'Free', remaining: config.freeQuota };
    mem.set(email, u);
  }
  return u;
}

export async function getOrCreateUser(email) {
  if (!pool) return memUser(email);
  const account = email.split('@')[0];
  const { rows } = await pool.query(
    `INSERT INTO users (email, account, remaining) VALUES ($1, $2, $3)
     ON CONFLICT (email) DO UPDATE SET email = EXCLUDED.email
     RETURNING email, account, plan, remaining`,
    [email, account, config.freeQuota],
  );
  return rows[0];
}

export async function getUser(email) {
  if (!pool) return mem.get(email) || null;
  const { rows } = await pool.query(
    `SELECT email, account, plan, remaining FROM users WHERE email = $1`,
    [email],
  );
  return rows[0] || null;
}

export async function decrementQuota(email, by = 1) {
  if (!pool) {
    const u = memUser(email);
    u.remaining = Math.max(0, u.remaining - by);
    return u.remaining;
  }
  const { rows } = await pool.query(
    `UPDATE users SET remaining = GREATEST(0, remaining - $2) WHERE email = $1 RETURNING remaining`,
    [email, by],
  );
  return rows[0]?.remaining ?? 0;
}

export async function addQuota(email, by) {
  if (!pool) {
    const u = memUser(email);
    u.remaining += by;
    return u.remaining;
  }
  const { rows } = await pool.query(
    `UPDATE users SET remaining = remaining + $2 WHERE email = $1 RETURNING remaining`,
    [email, by],
  );
  return rows[0]?.remaining ?? 0;
}
