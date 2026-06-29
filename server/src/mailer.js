// Email delivery. Real SMTP when SMTP_URL is set (production); otherwise dev
// mode logs the code to the console and the auth route also returns devCode.

import { config, mailEnabled } from './config.js';

let transport = null;

async function getTransport() {
  if (transport) return transport;
  const { default: nodemailer } = await import('nodemailer');
  transport = nodemailer.createTransport(config.mail.smtpUrl);
  return transport;
}

export async function sendLoginCode(email, code) {
  if (!mailEnabled()) {
    console.log(`[auth] 验证码 for ${email}: ${code} (dev 模式，未真正发邮件)`);
    return { delivered: false };
  }
  const t = await getTransport();
  await t.sendMail({
    from: config.mail.from,
    to: email,
    subject: 'Moon PromptCard 登录验证码',
    text: `你的验证码是 ${code}，10 分钟内有效。如果不是你本人操作，请忽略本邮件。`,
  });
  return { delivered: true };
}
