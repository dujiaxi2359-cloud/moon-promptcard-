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
  await pool.query(`
    CREATE TABLE IF NOT EXISTS orders (
      trade_order_id TEXT PRIMARY KEY,
      email   TEXT NOT NULL,
      credits INTEGER NOT NULL,
      status  TEXT NOT NULL DEFAULT 'pending',
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

// ---- orders ----
const memOrders = new Map();

export async function createOrder(tradeOrderId, email, credits) {
  if (!pool) {
    memOrders.set(tradeOrderId, { tradeOrderId, email, credits, status: 'pending' });
    return;
  }
  await pool.query(
    `INSERT INTO orders (trade_order_id, email, credits) VALUES ($1, $2, $3)
     ON CONFLICT (trade_order_id) DO NOTHING`,
    [tradeOrderId, email, credits],
  );
}

export async function getOrder(tradeOrderId) {
  if (!pool) return memOrders.get(tradeOrderId) || null;
  const { rows } = await pool.query(
    `SELECT trade_order_id, email, credits, status FROM orders WHERE trade_order_id = $1`,
    [tradeOrderId],
  );
  const r = rows[0];
  return r ? { tradeOrderId: r.trade_order_id, email: r.email, credits: r.credits, status: r.status } : null;
}

// Mark paid and credit quota exactly once. Returns true if it credited now.
export async function markOrderPaidOnce(tradeOrderId) {
  if (!pool) {
    const o = memOrders.get(tradeOrderId);
    if (!o || o.status === 'paid') return false;
    o.status = 'paid';
    await addQuota(o.email, o.credits);
    return true;
  }
  const { rows } = await pool.query(
    `UPDATE orders SET status = 'paid' WHERE trade_order_id = $1 AND status <> 'paid'
     RETURNING email, credits`,
    [tradeOrderId],
  );
  if (!rows[0]) return false;
  await addQuota(rows[0].email, rows[0].credits);
  return true;
}
