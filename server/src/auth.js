// Email-code login.
//   1. POST /api/auth/request { email } -> 6-digit code, emailed (dev: console + devCode)
//   2. POST /api/auth/verify { email, code } -> stateless bearer token (JWT-like)
// Tokens are signed (token.js), users persist in db.js.

import { randomInt } from 'node:crypto';
import { config } from './config.js';
import { setLoginCode, checkLoginCode } from './store.js';
import { getOrCreateUser } from './db.js';
import { signToken } from './token.js';
import { sendLoginCode } from './mailer.js';

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

function genCode() {
  return String(randomInt(0, 1_000_000)).padStart(6, '0');
}

export async function requestCode(req, res) {
  const email = String(req.body?.email || '').trim().toLowerCase();
  if (!EMAIL_RE.test(email)) return res.status(400).json({ ok: false, error: '邮箱格式不正确。' });
  const code = genCode();
  setLoginCode(email, code);
  const { delivered } = await sendLoginCode(email, code);
  const payload = { ok: true, delivered };
  if (config.isDev && !delivered) payload.devCode = code; // dev convenience only
  res.json(payload);
}

export async function verifyCode(req, res) {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const code = String(req.body?.code || '').trim();
  if (!EMAIL_RE.test(email) || !code) {
    return res.status(400).json({ ok: false, error: '请填写邮箱与验证码。' });
  }
  if (!checkLoginCode(email, code)) {
    return res.status(401).json({ ok: false, error: '验证码错误或已过期。' });
  }
  const user = await getOrCreateUser(email);
  const token = signToken(email);
  res.json({ ok: true, token, account: user.account });
}

export function logout(_req, res) {
  // Stateless tokens — nothing to revoke server-side. Client drops the token.
  res.json({ ok: true });
}
