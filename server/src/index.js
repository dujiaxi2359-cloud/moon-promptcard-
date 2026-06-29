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
import { initDb, decrementQuota, getOrCreateUser, createOrder, markOrderPaidOnce } from './db.js';
import { signToken } from './token.js';
import { TIERS } from './config.js';
import { createPayment, verifyNotify } from './billing.js';

const app = express();
app.use(express.json({ limit: '12mb' })); // images are sent as base64 data URLs

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

// 落地页（给支付渠道审核用，体现真实业务内容）
app.get('/', (_req, res) => {
  res
    .type('html')
    .send(`<!doctype html><html lang="zh"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Moon PromptCard · 提示词分析与图片助手</title>
<style>
body{margin:0;background:#0B0C0E;color:#EAE6DD;font-family:system-ui,-apple-system,"PingFang SC",sans-serif;-webkit-font-smoothing:antialiased}
.wrap{max-width:760px;margin:0 auto;padding:64px 24px}
.eyebrow{letter-spacing:.18em;font-size:12px;color:#FF5A1F;font-weight:600}
h1{font-size:34px;margin:8px 0 12px}
p{line-height:1.8;color:rgba(234,230,221,.72)}
.card{background:#15161A;border:1px solid rgba(234,230,221,.1);border-radius:16px;padding:20px;margin-top:20px}
.card h2{font-size:16px;margin:0 0 8px}
a{color:#FF6B33}
.tiers{display:flex;gap:12px;flex-wrap:wrap;margin-top:8px}
.tier{flex:1;min-width:120px;background:#101114;border:1px solid rgba(234,230,221,.1);border-radius:12px;padding:14px;text-align:center}
.tier b{font-size:22px}
.foot{margin-top:28px;font-size:12px;color:rgba(234,230,221,.4)}
</style></head><body><div class="wrap">
<div class="eyebrow">MOON PROMPTCARD</div>
<h1>提示词分析与图片助手</h1>
<p>Moon PromptCard 是一款浏览器扩展，帮助 AIGC 创作者对提示词进行评分、问题诊断与一键优化，并支持把图片转成提示词、按需生成图片。本站为其提供后端分析与充值服务。</p>
<div class="card"><h2>功能</h2><p>提示词评分与优化 · 图片转提示词 · 文生图 / 图生图 · 多模型适配（Veo、Sora、Kling、Midjourney、SD 等）。</p></div>
<div class="card"><h2>充值次数（永久有效）</h2>
<div class="tiers">
<div class="tier"><b>50</b><div>¥5</div></div>
<div class="tier"><b>120</b><div>¥10</div></div>
<div class="tier"><b>300</b><div>¥20</div></div>
</div></div>
<div class="card"><h2>隐私</h2><p>仅在用户主动操作时读取所选文本/图片；自定义模式下数据只发往用户自配接口。详见 <a href="https://github.com/dujiaxi2359-cloud/moon-promptcard-/blob/main/moon-promptcard/PRIVACY.md">隐私政策</a>。</p></div>
<p class="foot">联系：dujiaxi2359@gmail.com · © Moon PromptCard</p>
</div></body></html>`);
});

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

// ── billing (虎皮椒 聚合支付) ──────────────────────────────────────────
app.get(
  '/api/billing/tiers',
  wrap((_req, res) =>
    res.json({
      ok: true,
      tiers: Object.entries(TIERS).map(([key, t]) => ({
        key,
        credits: t.credits,
        price: t.price,
        label: t.label,
        badge: t.badge ?? null,
      })),
    }),
  ),
);

app.post(
  '/api/billing/checkout',
  bearer(),
  wrap(async (req, res) => {
    const tier = String(req.body?.tier || '');
    const { tradeOrderId, url, credits } = await createPayment(tier);
    await createOrder(tradeOrderId, req.email, credits);
    res.json({ ok: true, url, tradeOrderId });
  }),
);

// 支付回调（虎皮椒服务器异步通知，无需登录）
app.post(
  '/api/billing/notify',
  express.urlencoded({ extended: false }),
  wrap(async (req, res) => {
    const body = req.body || {};
    if (!verifyNotify(body)) return res.status(400).send('sign error');
    const status = String(body.status || '').toUpperCase();
    if (status === 'OD' && body.trade_order_id) {
      await markOrderPaidOnce(String(body.trade_order_id)); // 幂等加次数
    }
    res.send('success');
  }),
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
