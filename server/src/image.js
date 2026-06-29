// Image generation adapter for an OpenAI-compatible gateway (e.g. AI充电站 /
// aidraw365). Two paths:
//   - text-to-image  -> POST {base}/images/generations  (JSON, IMAGE_MODEL)
//   - image-to-image -> POST {base}/images/edits        (multipart, IMAGE_EDIT_MODEL)
// The gateway returns OpenAI-shaped { data: [{ b64_json | url }] }.
//
// "mix" produces 4 takes. With a reference image they map to the UI's four
// labels via prompt presets (weak ref / style-only / C4D / line art).

import { config, imageConfigured } from './config.js';

const MIX_PRESETS = [
  '', // 1: faithful / weak reference
  '，仅参考其风格与配色，重新构图', // 2: style only
  '，转换为 C4D 立体渲染风格', // 3: C4D
  '，转换为黑白线稿', // 4: line art
];

export function imageCountFor(mode) {
  return mode === 'mix' ? 4 : 1;
}

function dataUrlToBlob(dataUrl) {
  const m = String(dataUrl).match(/^data:(image\/[a-z.+-]+);base64,(.+)$/i);
  if (!m) return null;
  return { blob: new Blob([Buffer.from(m[2], 'base64')], { type: m[1] }), mime: m[1] };
}

function parseImages(data) {
  const items = Array.isArray(data?.data) ? data.data : [];
  return items
    .map((it) => (it?.b64_json ? `data:image/png;base64,${it.b64_json}` : it?.url))
    .filter(Boolean);
}

async function textToImage(prompt, n, size) {
  const res = await fetch(`${config.image.baseUrl}/images/generations`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.image.apiKey}`,
    },
    body: JSON.stringify({ model: config.image.model, prompt, n, size, response_format: 'b64_json' }),
  });
  if (!res.ok) {
    const err = new Error(`文生图失败（${res.status}）。`);
    err.status = 502;
    throw err;
  }
  return parseImages(await res.json());
}

async function imageToImage(prompt, refImage, size) {
  const parsed = dataUrlToBlob(refImage);
  if (!parsed) {
    const err = new Error('参考图格式无效，应为 data:image/...;base64 数据。');
    err.status = 400;
    throw err;
  }
  const form = new FormData();
  form.append('model', config.image.editModel);
  form.append('prompt', prompt);
  form.append('n', '1');
  form.append('size', size);
  form.append('response_format', 'b64_json');
  form.append('image', parsed.blob, 'reference.png');
  const res = await fetch(`${config.image.baseUrl}/images/edits`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.image.apiKey}` },
    body: form,
  });
  if (!res.ok) {
    const err = new Error(`图生图失败（${res.status}）。`);
    err.status = 502;
    throw err;
  }
  return parseImages(await res.json());
}

export async function generateImages(prompt, mode = 'single', refImage = '', size = '1024x1024') {
  if (!imageConfigured()) {
    const err = new Error('图片服务未配置：请在 .env 填写 IMAGE_BASE_URL / IMAGE_API_KEY（或复用 LLM_*）。');
    err.status = 501;
    throw err;
  }
  const hasRef = Boolean(refImage);
  const count = imageCountFor(mode);

  let images = [];
  try {
    if (hasRef) {
      // image-to-image: one call per take so each can carry its own preset.
      const presets = mode === 'mix' ? MIX_PRESETS : [''];
      const results = await Promise.all(
        presets.map((p) => imageToImage(prompt + p, refImage, size)),
      );
      images = results.flat();
    } else if (mode === 'mix') {
      images = await textToImage(prompt, 4, size);
    } else {
      images = await textToImage(prompt, count, size);
    }
  } catch (e) {
    if (e.status) throw e;
    const err = new Error('无法连接图片服务，请检查 Base URL 或网络。');
    err.status = 502;
    throw err;
  }

  if (!images.length) {
    const err = new Error('图片服务未返回图像。');
    err.status = 502;
    throw err;
  }
  return images;
}
