// Stateless signed tokens (JWT-like, HMAC-SHA256) — survive restarts and scale
// across instances without a session store. Secret comes from JWT_SECRET.

import { createHmac, timingSafeEqual } from 'node:crypto';
import { config } from './config.js';

const TTL_SEC = 30 * 24 * 60 * 60; // 30 days

function b64url(buf) {
  return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function b64urlJson(obj) {
  return b64url(JSON.stringify(obj));
}
function sign(data) {
  return b64url(createHmac('sha256', config.auth.jwtSecret).update(data).digest());
}

export function signToken(email) {
  const payload = b64urlJson({ sub: email, exp: Math.floor(Date.now() / 1000) + TTL_SEC });
  return `${payload}.${sign(payload)}`;
}

export function verifyToken(token) {
  if (!token || typeof token !== 'string' || !token.includes('.')) return null;
  const [payload, sig] = token.split('.');
  const expected = sign(payload);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const obj = JSON.parse(Buffer.from(payload.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString());
    if (!obj?.sub || (obj.exp && Date.now() / 1000 > obj.exp)) return null;
    return obj.sub; // email
  } catch {
    return null;
  }
}
