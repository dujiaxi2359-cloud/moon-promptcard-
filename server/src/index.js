// Moon PromptCard reference backend.
//
// Endpoints (all JSON):
//   POST /api/auth/request   { email }            -> { ok, delivered, devCode? }
//   POST /api/auth/verify    { email, code }      -> { ok, token, account }
//   POST /api/auth/logout    (bearer)             -> { ok }
//   GET  /api/me             (bearer)             -> { ok, account, plan }
//   GET  /api/quota          (bearer)             -> { ok, quota:{ remaining, plan } }
//   POST /api/analyze        (bearer) { prompt, lang }       -> AnalysisResult
//   POST /api/image/generate (bearer) { prompt, mode }       -> { ok, images:[...] }
//   POST /api/billing/checkout (bearer)           -> { ok, url }
//   GET  /api/health                              -> { ok, llm, image }
//
// The official model key lives only in .env on this server. It is never sent to
// or stored in the extension.

import express from 'express';
import cors from 'cors';
import { config, llmConfigured, imageConfigured } from './config.js';
import { requestCode, verifyCode, logout } from './auth.js';
import { bearer } from './middleware.js';
import { analyze, describeImage } from './analyze.js';
import { generateImages } from './image.js';
import { initDb, decrementQuota, getOrCreateUser } from './db.js';
import { signToken } from './token.js';

const app = express();
app.use(express.json({ limit: '256kb' }));

app.use(
  cors({
    origin: config.corsOrigins.length ? config.corsOrigins : true,
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  }),
);

const wrap = (fn) => (req, res) =>
  Promise.resolve(fn(req, res)).catch((e) => {
    const status = e?.status || 500;
    // Never leak stack traces or upstream secrets to the client.
    res.status(status).json({ ok: false, error: e?.message || '服务器内部错误。' });
  });

app.get('/api/health', (_req, res) =>
  res.json({ ok: true, llm: llmConfigured(), image: imageConfigured() }),
);

// ── auth ──────────────────────────────────────────────────────────────
app.post('/api/auth/request', wrap(requestCode));
app.post('/api/auth/verify', wrap(verifyCode));
app.post('/api/auth/logout', bearer(false), wrap(logout));

// Google one-click login: client sends a Google access token; we verify it with
// Google's userinfo endpoint, then issue our own session token.
app.post(
  '/api/auth/google',
  wrap(async (req, res) => {
    const accessToken = String(req.body?.accessToken || '');
    if (!accessToken) return res.status(400).json({ ok: false, error: '缺少 Google 令牌。' });
    let info;
    try {
      const r = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!r.ok) return res.status(401).json({ ok: false, error: 'Google 登录校验失败。' });
      info = await r.json();
    } catch {
      return res.status(502).json({ ok: false, error: '无法连接 Google 校验服务。' });
    }
    const email = String(info?.email || '').toLowerCase();
    if (!email || info.email_verified === false) {
      return res.status(401).json({ ok: false, error: 'Google 账号无有效邮箱。' });
    }
    const user = await getOrCreateUser(email);
    res.json({ ok: true, token: signToken(email), account: user.account });
  }),
);

// ── account / quota ───────────────────────────────────────────────────
app.get(
  '/api/me',
  bearer(),
  wrap((req, res) => res.json({ ok: true, account: req.user.account, plan: req.user.plan })),
);

app.get(
  '/api/quota',
  bearer(),
  wrap((req, res) =>
    res.json({ ok: true, quota: { remaining: req.user.remaining, plan: req.user.plan } }),
  ),
);

// ── analyze ───────────────────────────────────────────────────────────
app.post(
  '/api/analyze',
  bearer(),
  wrap(async (req, res) => {
    const prompt = String(req.body?.prompt || '').trim();
    const lang = req.body?.lang === 'en' ? 'en' : 'zh';
    const image = typeof req.body?.image === 'string' ? req.body.image : '';
    if (!prompt && !image) return res.status(400).json({ ok: false, error: '提示词为空。' });
    if (req.user.remaining <= 0)
      return res.status(402).json({ ok: false, error: '剩余分析次数不足，请先购买。' });
    const result = await analyze(prompt, lang, image);
    const remaining = await decrementQuota(req.email, 1);
    res.json({ ok: true, result, remaining });
  }),
);

// ── image → prompt (built-in vision) ──────────────────────────────────
app.post(
  '/api/describe-image',
  bearer(),
  wrap(async (req, res) => {
    const image = typeof req.body?.image === 'string' ? req.body.image : '';
    const lang = req.body?.lang === 'en' ? 'en' : 'zh';
    if (!image) return res.status(400).json({ ok: false, error: '缺少图片。' });
    if (req.user.remaining <= 0)
      return res.status(402).json({ ok: false, error: '剩余次数不足，请先购买。' });
    const prompt = await describeImage(image, lang);
    const remaining = await decrementQuota(req.email, 1);
    res.json({ ok: true, prompt, remaining });
  }),
);

// ── image generation ──────────────────────────────────────────────────
app.post(
  '/api/image/generate',
  bearer(),
  wrap(async (req, res) => {
    const prompt = String(req.body?.prompt || '').trim();
    const mode = req.body?.mode === 'mix' ? 'mix' : 'single';
    const refImage = typeof req.body?.refImage === 'string' ? req.body.refImage : '';
    const size = typeof req.body?.size === 'string' ? req.body.size : '1024x1024';
    if (!prompt) return res.status(400).json({ ok: false, error: '提示词为空。' });
    const cost = mode === 'mix' ? 4 : 1;
    if (req.user.remaining < cost)
      return res.status(402).json({ ok: false, error: '剩余次数不足，请先购买。' });
    const images = await generateImages(prompt, mode, refImage, size);
    const remaining = await decrementQuota(req.email, cost);
    res.json({ ok: true, images, remaining });
  }),
);

// ── billing (placeholder) ─────────────────────────────────────────────
app.post(
  '/api/billing/checkout',
  bearer(),
  wrap((req, res) => res.json({ ok: true, url: config.checkoutUrl })),
);

app.use((_req, res) => res.status(404).json({ ok: false, error: 'not found' }));

initDb()
  .catch((e) => console.error('数据库初始化失败：', e.message))
  .finally(() => {
    app.listen(config.port, () => {
      console.log(`Moon PromptCard 后端已启动: http://localhost:${config.port}`);
      console.log(`  文本模型: ${llmConfigured() ? config.llm.textModel + ' / ' + config.llm.visionModel + ' (已配置)' : '未配置 → 启发式兜底'}`);
      console.log(`  邮件: ${config.mail.smtpUrl ? '已配置 SMTP' : 'dev（控制台打印验证码）'}`);
    });
  });
