// 虎皮椒 (xunhupay) 聚合支付 —— 个人可用，接微信/支付宝，免营业执照。
// 签名：参数（除 hash）按 key 升序拼成 k=v&k=v...，末尾直接接 appsecret，再 MD5。

import { createHash, randomUUID } from 'node:crypto';
import { config, payEnabled, TIERS } from './config.js';

function sign(params) {
  const keys = Object.keys(params)
    .filter((k) => k !== 'hash' && params[k] !== '' && params[k] != null)
    .sort();
  const str = keys.map((k) => `${k}=${params[k]}`).join('&') + config.xunhu.appsecret;
  return createHash('md5').update(str, 'utf8').digest('hex');
}

export function verifyNotify(body) {
  const got = body.hash;
  const expect = sign(body);
  return Boolean(got) && got === expect;
}

// Create a payment order; returns { tradeOrderId, url } where url is the
// xunhupay payment page (shows 微信/支付宝). Throws on failure.
export async function createPayment(tierKey) {
  if (!payEnabled()) {
    const e = new Error('支付未配置：请在 .env 填写 XUNHU_APPID / XUNHU_APPSECRET。');
    e.status = 501;
    throw e;
  }
  const tier = TIERS[tierKey];
  if (!tier) {
    const e = new Error('无效的充值档位。');
    e.status = 400;
    throw e;
  }
  const tradeOrderId = 'mpc' + Date.now() + randomUUID().replace(/-/g, '').slice(0, 8);
  const params = {
    version: '1.1',
    appid: config.xunhu.appid,
    trade_order_id: tradeOrderId,
    total_fee: tier.fee,
    title: `Moon PromptCard ${tier.label}`,
    time: String(Math.floor(Date.now() / 1000)),
    notify_url: `${config.publicBaseUrl}/api/billing/notify`,
    nonce_str: randomUUID().replace(/-/g, ''),
    type: 'WAP',
    wap_url: config.publicBaseUrl,
    wap_name: 'Moon PromptCard',
  };
  params.hash = sign(params);

  let res;
  try {
    res = await fetch(config.xunhu.gateway, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(params).toString(),
    });
  } catch {
    const e = new Error('无法连接支付网关。');
    e.status = 502;
    throw e;
  }
  const data = await res.json().catch(() => ({}));
  if (String(data.errcode) !== '0' || !data.url) {
    const e = new Error(`下单失败：${data.errmsg || '支付网关返回异常'}`);
    e.status = 502;
    throw e;
  }
  return { tradeOrderId, url: data.url, credits: tier.credits };
}
