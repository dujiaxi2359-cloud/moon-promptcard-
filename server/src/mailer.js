// Email delivery. Priority:
//   1. Brevo HTTP API (BREVO_API_KEY) — works on Render (uses HTTPS :443).
//      Render blocks outbound SMTP ports, so this is the recommended path.
//   2. SMTP (SMTP_URL) via nodemailer — only works on hosts that allow SMTP.
//   3. Dev mode — logs the code to console; the auth route also returns devCode.

import { config, mailEnabled } from './config.js';

function parseFrom(s) {
  const m = String(s).match(/^\s*(.*?)\s*<([^>]+)>\s*$/);
  if (m) return { name: m[1] || 'Moon PromptCard', email: m[2] };
  return { name: 'Moon PromptCard', email: String(s).trim() };
}

async function sendViaBrevo(to, code) {
  const from = parseFrom(config.mail.from);
  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'api-key': config.mail.brevoKey,
      'Content-Type': 'application/json',
      accept: 'application/json',
    },
    body: JSON.stringify({
      sender: from,
      to: [{ email: to }],
      subject: 'Moon PromptCard 登录验证码',
      textContent: `你的验证码是 ${code}，10 分钟内有效。如果不是你本人操作，请忽略本邮件。`,
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`邮件发送失败（${res.status}）：${detail.slice(0, 160)}`);
  }
  return { delivered: true };
}

let smtpTransport = null;
async function sendViaSmtp(to, code) {
  const { default: nodemailer } = await import('nodemailer');
  if (!smtpTransport) smtpTransport = nodemailer.createTransport(config.mail.smtpUrl);
  await smtpTransport.sendMail({
    from: config.mail.from,
    to,
    subject: 'Moon PromptCard 登录验证码',
    text: `你的验证码是 ${code}，10 分钟内有效。如果不是你本人操作，请忽略本邮件。`,
  });
  return { delivered: true };
}

export async function sendLoginCode(email, code) {
  if (!mailEnabled()) {
    console.log(`[auth] 验证码 for ${email}: ${code} (dev 模式，未真正发邮件)`);
    return { delivered: false };
  }
  if (config.mail.brevoKey) return sendViaBrevo(email, code);
  return sendViaSmtp(email, code);
}
