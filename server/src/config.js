// Loads .env (no dependency) and exposes typed config.
// Secrets live only in process.env / .env — never hard-coded, never logged.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadDotEnv() {
  try {
    const raw = readFileSync(join(__dirname, '..', '.env'), 'utf8');
    for (const line of raw.split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
      if (!m) continue;
      const key = m[1];
      let val = m[2];
      // strip surrounding quotes, ignore inline comments only when unquoted
      if (/^".*"$/.test(val) || /^'.*'$/.test(val)) val = val.slice(1, -1);
      else val = val.replace(/\s+#.*$/, '').trim();
      if (process.env[key] === undefined) process.env[key] = val;
    }
  } catch {
    // no .env file — rely on real environment variables
  }
}

loadDotEnv();

const env = process.env;

export const config = {
  port: Number(env.PORT) || 8787,
  corsOrigins: (env.CORS_ORIGINS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  llm: {
    // OpenAI-compatible endpoint (DashScope: .../compatible-mode/v1).
    baseUrl: (env.LLM_BASE_URL || '').replace(/\/+$/, ''),
    apiKey: env.LLM_API_KEY || '',
    // Routed by whether a reference image is attached. Defaults mirror the
    // AI充电站 gateway (qwen-vl-plus handles both). Set LLM_TEXT_MODEL to a
    // cheaper text-only model (e.g. qwen-plus) if your gateway offers it.
    textModel: env.LLM_TEXT_MODEL || env.LLM_MODEL || 'qwen-vl-plus',
    visionModel: env.LLM_VISION_MODEL || 'qwen-vl-plus',
  },
  image: {
    // OpenAI-compatible image endpoints (same gateway as the chat model).
    // Shares LLM base/key unless overridden.
    baseUrl: (env.IMAGE_BASE_URL || env.LLM_BASE_URL || '').replace(/\/+$/, ''),
    apiKey: env.IMAGE_API_KEY || env.LLM_API_KEY || '',
    model: env.IMAGE_MODEL || 'gpt-image-2', // text-to-image  -> /images/generations
    editModel: env.IMAGE_EDIT_MODEL || 'nanobanana-2', // image-to-image -> /images/edits
  },
  freeQuota: Number(env.FREE_QUOTA) || 20,
  checkoutUrl: env.CHECKOUT_URL || 'https://example.com/moon-promptcard/checkout',
  db: {
    // Postgres connection string (Render/Railway provide DATABASE_URL).
    url: env.DATABASE_URL || '',
  },
  auth: {
    // MUST be set in production so tokens stay valid across restarts/instances.
    jwtSecret: env.JWT_SECRET || 'dev-insecure-secret-change-me',
  },
  mail: {
    smtpUrl: env.SMTP_URL || '', // e.g. smtps://user:pass@smtp.host:465
    from: env.MAIL_FROM || 'Moon PromptCard <no-reply@example.com>',
  },
  isDev: (env.NODE_ENV || 'development') !== 'production',
};

// True once the operator has wired a real model endpoint + key.
export const llmConfigured = () => Boolean(config.llm.baseUrl && config.llm.apiKey);
export const imageConfigured = () => Boolean(config.image.baseUrl && config.image.apiKey);
export const llmModelFor = (hasImage) =>
  hasImage ? config.llm.visionModel : config.llm.textModel;
export const dbEnabled = () => Boolean(config.db.url);
export const mailEnabled = () => Boolean(config.mail.smtpUrl);
