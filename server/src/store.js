// Login codes only. These are short-lived (10 min) and low-stakes, so keeping
// them in memory is fine even in production — a restart just makes the user
// request a new code. Users/quota live in db.js; tokens are stateless (token.js).

const codes = new Map(); // email -> { code, expires }
const CODE_TTL_MS = 10 * 60 * 1000;

export function setLoginCode(email, code) {
  codes.set(email, { code, expires: Date.now() + CODE_TTL_MS });
}

export function checkLoginCode(email, code) {
  const rec = codes.get(email);
  if (!rec) return false;
  if (Date.now() > rec.expires) {
    codes.delete(email);
    return false;
  }
  const ok = rec.code === String(code).trim();
  if (ok) codes.delete(email);
  return ok;
}
