// Bearer-token gate. Verifies the stateless token, loads the user from db,
// attaches req.user / req.email.

import { verifyToken } from './token.js';
import { getUser } from './db.js';

export function bearer(required = true) {
  return async (req, res, next) => {
    const h = req.headers.authorization || '';
    const m = h.match(/^Bearer\s+(.+)$/i);
    const email = m ? verifyToken(m[1].trim()) : null;
    req.email = email;
    try {
      req.user = email ? await getUser(email) : null;
    } catch {
      return res.status(500).json({ ok: false, error: '服务器存储错误。' });
    }
    if (required && !req.user) {
      return res.status(401).json({ ok: false, error: '未登录或登录已失效。' });
    }
    next();
  };
}
