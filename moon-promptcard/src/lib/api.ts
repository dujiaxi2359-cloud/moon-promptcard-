// api.ts
//
// Network layer. Two providers:
//   - customApiAnalyze / testCustomApi: talk directly to a user-supplied
//     OpenAI-compatible endpoint. The key never leaves the device except to the
//     user's own configured host.
//   - builtin*: a MOCK of the future first-party backend. Swap BUILTIN_API_BASE_URL
//     and flip USE_MOCK_BUILTIN to false to hit the real server. The real server
//     holds the official model key — it is never shipped in this extension.

import type {
  AnalysisResult,
  CustomApiConfig,
  ImagePrompt,
  Lang,
  QuotaInfo,
} from './types';
import { buildAnalysisMessages, heuristicAnalyze } from './promptAnalyzer';

// First-party backend (holds the official 千问 key, does analysis + image→prompt).
// Dev default: the local reference server. Point this at your deployed host for
// production. When blank, the builtin service falls back to the local mock.
export const BUILTIN_API_BASE_URL = 'https://moon-promptcard-server.onrender.com';
const USE_MOCK_BUILTIN = false;

// Google OAuth Web client ID (fill after creating it in Google Cloud Console).
// Authorized redirect URI must be chrome.identity.getRedirectURL() of the
// extension, i.e. https://<extension-id>.chromiumapp.org/
export const GOOGLE_CLIENT_ID =
  '953512361686-rmec8r96jokkupi74i9kn2vkio3o6tbq.apps.googleusercontent.com';

class FriendlyError extends Error {}

function friendly(message: string): never {
  throw new FriendlyError(message);
}

function normaliseBaseUrl(raw: string): string {
  let url = raw.trim().replace(/\/+$/, '');
  if (!/^https?:\/\//i.test(url)) friendly('Base URL 需要以 http:// 或 https:// 开头。');
  return url;
}

function extractJson(text: string): unknown {
  // Models sometimes wrap JSON in ``` fences or add prose. Be forgiving.
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start === -1 || end === -1) friendly('模型未返回有效的 JSON 结果。');
  return JSON.parse(candidate.slice(start, end + 1));
}

function coerceResult(obj: any, source: string): AnalysisResult {
  return {
    score: clampScore(obj?.score),
    level: typeof obj?.level === 'string' ? obj.level : '可优化',
    summary: typeof obj?.summary === 'string' ? obj.summary : '已生成分析结果。',
    issues: Array.isArray(obj?.issues)
      ? obj.issues.map((i: any) => ({
          title: String(i?.title ?? '问题'),
          detail: String(i?.detail ?? ''),
          severity: ['high', 'medium', 'low'].includes(i?.severity) ? i.severity : 'medium',
        }))
      : [],
    suggestions: Array.isArray(obj?.suggestions) ? obj.suggestions.map(String) : [],
    optimizedPrompt: String(obj?.optimizedPrompt ?? source),
    negativePrompt: String(obj?.negativePrompt ?? ''),
    tags: Array.isArray(obj?.tags) ? obj.tags.map(String) : [],
    createdAt: new Date().toISOString(),
    source,
  };
}

function clampScore(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(v);
  if (Number.isNaN(n)) return 60;
  return Math.max(0, Math.min(100, Math.round(n)));
}

// ---- Custom OpenAI-compatible API -------------------------------------------

export async function customApiAnalyze(
  prompt: string,
  config: CustomApiConfig,
  lang: Lang,
  image?: string,
): Promise<AnalysisResult> {
  const base = normaliseBaseUrl(config.baseUrl);
  if (!config.apiKey) friendly('请先填写 API Key。');
  if (!config.model) friendly('请先填写模型名称。');

  const hasImage = Boolean(image);
  const messages = buildAnalysisMessages(prompt, lang) as any[];
  if (hasImage) {
    // Attach the reference image to the user turn (vision); drop json_object
    // since many vision models reject it — extractJson handles the reply.
    const last = messages[messages.length - 1];
    last.content = [
      { type: 'text', text: String(last.content) },
      { type: 'image_url', image_url: { url: image } },
    ];
  }

  // Note: we intentionally do NOT send response_format:json_object — vision
  // models (e.g. qwen-vl-plus, used as the single chat model) often reject it.
  // The system prompt enforces JSON and extractJson + heuristic handle parsing.
  const body: any = { model: config.model, messages, temperature: 0.4 };

  let res: Response;
  try {
    res = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify(body),
    });
  } catch {
    friendly('网络错误：无法连接到该 Base URL，请检查地址或网络。');
  }

  if (res.status === 401 || res.status === 403) friendly('API Key 无效或没有权限。');
  if (res.status === 404) friendly('接口或模型不存在，请检查 Base URL 与模型名称。');
  if (!res.ok) {
    const detail = await safeText(res);
    friendly(`请求失败（${res.status}）：${truncate(detail, 120)}`);
  }

  const data = await res.json();
  const content: string | undefined = data?.choices?.[0]?.message?.content;
  if (!content) friendly('模型返回为空，请更换模型或稍后再试。');
  try {
    return coerceResult(extractJson(content), prompt);
  } catch {
    // Last-ditch: never leave the user empty-handed.
    return heuristicAnalyze(prompt, lang);
  }
}

export async function testCustomApi(
  config: CustomApiConfig,
): Promise<{ ok: boolean; message: string }> {
  try {
    const base = normaliseBaseUrl(config.baseUrl);
    if (!config.apiKey) return { ok: false, message: '请填写 API Key。' };
    if (!config.model) return { ok: false, message: '请填写模型名称。' };

    let res: Response;
    try {
      res = await fetch(`${base}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify({
          model: config.model,
          messages: [{ role: 'user', content: 'ping' }],
          max_tokens: 1,
        }),
      });
    } catch {
      return {
        ok: false,
        message: '网络错误或 CORS / host 权限问题，无法访问该地址。',
      };
    }

    if (res.status === 401 || res.status === 403)
      return { ok: false, message: 'API Key 无效或没有权限。' };
    if (res.status === 404)
      return { ok: false, message: '模型或接口不存在，请检查模型名与 Base URL。' };
    if (!res.ok) {
      const detail = await safeText(res);
      return { ok: false, message: `连接失败（${res.status}）：${truncate(detail, 100)}` };
    }
    return { ok: true, message: 'API 连接成功' };
  } catch (e) {
    const message = e instanceof FriendlyError ? e.message : '未知错误，请稍后再试。';
    return { ok: false, message };
  }
}

// ---- Model list + image test ------------------------------------------------

export async function listModels(config: CustomApiConfig): Promise<string[]> {
  const base = normaliseBaseUrl(config.baseUrl);
  if (!config.apiKey) friendly('请先填写 API Key。');
  let res: Response;
  try {
    res = await fetch(`${base}/models`, {
      headers: { Authorization: `Bearer ${config.apiKey}` },
    });
  } catch {
    friendly('网络错误：无法获取模型列表。');
  }
  if (res.status === 401 || res.status === 403) friendly('API Key 无效或没有权限。');
  if (!res.ok) friendly(`获取模型列表失败（${res.status}）。`);
  const data = await res.json();
  const list = Array.isArray(data?.data) ? data.data : Array.isArray(data) ? data : [];
  return list.map((m: any) => String(m?.id ?? m)).filter(Boolean).sort();
}

export async function testImageApi(
  config: CustomApiConfig,
): Promise<{ ok: boolean; message: string }> {
  try {
    const base = normaliseBaseUrl(config.baseUrl);
    if (!config.apiKey) return { ok: false, message: '请填写 API Key。' };
    if (!config.imageModel) return { ok: false, message: '请填写文生图模型。' };
    let res: Response;
    try {
      res = await fetch(`${base}/images/generations`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify({
          model: config.imageModel,
          prompt: 'a small red dot on white background',
          n: 1,
          size: '256x256',
        }),
      });
    } catch {
      return { ok: false, message: '网络错误或 CORS / host 权限问题，无法访问该地址。' };
    }
    if (res.status === 401 || res.status === 403)
      return { ok: false, message: 'API Key 无效或没有权限。' };
    if (res.status === 404)
      return { ok: false, message: '文生图模型或接口不存在，请检查模型名与 Base URL。' };
    if (!res.ok) {
      const detail = await safeText(res);
      return { ok: false, message: `文生图测试失败（${res.status}）：${truncate(detail, 100)}` };
    }
    return { ok: true, message: '文生图连接成功' };
  } catch (e) {
    return { ok: false, message: e instanceof FriendlyError ? e.message : '未知错误。' };
  }
}

// ---- Image → prompt (vision) ------------------------------------------------

export async function imageToPrompt(
  image: string,
  config: CustomApiConfig,
  lang: Lang,
): Promise<ImagePrompt> {
  const base = normaliseBaseUrl(config.baseUrl);
  if (!config.apiKey) friendly('请先在设置中心填写 API Key。');
  if (!config.model) friendly('请先在设置中心填写 Chat 模型。');

  const sys =
    'You are an elite AIGC reverse-prompt engineer. Study the image carefully, then write ONE ' +
    'precise, ready-to-paste text-to-image prompt that would faithfully reproduce it, as rich ' +
    'comma-separated descriptors (pro Midjourney / Stable Diffusion style), ordered: ' +
    '[main subject + concrete attributes] , [secondary elements] , [scene/background] , ' +
    '[composition & framing] , [camera: angle, shot, lens] , [lighting: type/direction] , ' +
    '[exact color palette] , [art style / medium / render] , [mood] , [quality boosters: ' +
    'ultra-detailed, sharp focus, 8k] , [aspect ratio if obvious]. Quote any visible text ' +
    'EXACTLY. Be concrete and faithful — only what is visible, never invent; no vague words; ' +
    'descriptor phrases, NOT a narrative sentence. Return ONLY JSON {"zh": string, "en": string}, ' +
    'each a single ready-to-paste line. No markdown.';

  let res: Response;
  try {
    res = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        messages: [
          { role: 'system', content: sys },
          {
            role: 'user',
            content: [
              { type: 'text', text: lang === 'en' ? 'Describe this image as a prompt.' : '把这张图写成提示词。' },
              { type: 'image_url', image_url: { url: image } },
            ],
          },
        ],
        temperature: 0.5,
      }),
    });
  } catch {
    friendly('网络错误：无法连接到该 Base URL。');
  }
  if (res.status === 401 || res.status === 403) friendly('API Key 无效或没有权限。');
  if (res.status === 404) friendly('Chat 模型或接口不存在，请检查模型名与 Base URL。');
  if (!res.ok) {
    const detail = await safeText(res);
    friendly(`图片转提示词失败（${res.status}）：${truncate(detail, 120)}`);
  }
  const data = await res.json();
  const content: string | undefined = data?.choices?.[0]?.message?.content;
  if (!content) friendly('模型返回为空，请更换模型或稍后再试。');
  try {
    const obj = extractJson(content) as any;
    return { zh: String(obj?.zh ?? ''), en: String(obj?.en ?? '') };
  } catch {
    // Not JSON — treat the whole reply as a single prompt in the UI language.
    return lang === 'en' ? { zh: '', en: content } : { zh: content, en: '' };
  }
}

// ---- Image generation (text→image / image→image) ----------------------------

function parseImages(data: any): string[] {
  const items = Array.isArray(data?.data) ? data.data : [];
  return items
    .map((it: any) => (it?.b64_json ? `data:image/png;base64,${it.b64_json}` : it?.url))
    .filter(Boolean);
}

export async function textToImage(
  prompt: string,
  config: CustomApiConfig,
  size?: string,
  count?: number,
): Promise<string[]> {
  const base = normaliseBaseUrl(config.baseUrl);
  if (!config.apiKey) friendly('请先在设置中心填写 API Key。');
  if (!config.imageModel) friendly('请先在设置中心填写文生图模型。');
  let res: Response;
  try {
    res = await fetch(`${base}/images/generations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.imageModel,
        prompt,
        n: count ?? config.imageCount ?? 1,
        size: size ?? config.imageSize ?? '1024x1024',
      }),
    });
  } catch {
    friendly('网络错误：无法连接图片服务。');
  }
  if (res.status === 401 || res.status === 403) friendly('API Key 无效或没有权限。');
  if (!res.ok) {
    const detail = await safeText(res);
    friendly(`文生图失败（${res.status}）：${truncate(detail, 120)}`);
  }
  const images = parseImages(await res.json());
  if (!images.length) friendly('图片服务未返回图像。');
  return images;
}

const MIX_PRESETS = ['', '，仅参考其风格与配色，重新构图', '，转换为 C4D 立体渲染风格', '，转换为黑白线稿'];

function dataUrlToBlob(dataUrl: string): Blob {
  const m = dataUrl.match(/^data:(image\/[a-z.+-]+);base64,(.+)$/i);
  if (!m) friendly('参考图格式无效，请重新选择图片。');
  const bin = atob(m[2]);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: m[1] });
}

async function oneImageToImage(
  prompt: string,
  refImage: string,
  config: CustomApiConfig,
  size: string,
): Promise<string[]> {
  const base = normaliseBaseUrl(config.baseUrl);
  const form = new FormData();
  form.append('model', config.editModel);
  form.append('prompt', prompt);
  form.append('n', '1');
  form.append('size', size);
  form.append('image', dataUrlToBlob(refImage), 'reference.png');
  let res: Response;
  try {
    res = await fetch(`${base}/images/edits`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${config.apiKey}` },
      body: form,
    });
  } catch {
    friendly('网络错误：无法连接图片服务。');
  }
  if (res.status === 401 || res.status === 403) friendly('API Key 无效或没有权限。');
  if (!res.ok) {
    const detail = await safeText(res);
    friendly(`图生图失败（${res.status}）：${truncate(detail, 120)}`);
  }
  return parseImages(await res.json());
}

export async function imageToImage(
  prompt: string,
  refImage: string,
  config: CustomApiConfig,
  mode: 'single' | 'mix' = 'single',
  size?: string,
): Promise<string[]> {
  if (!config.apiKey) friendly('请先在设置中心填写 API Key。');
  if (!config.editModel) friendly('请先在设置中心填写图生图模型。');
  const sz = size ?? config.imageSize ?? '1024x1024';
  const presets = mode === 'mix' ? MIX_PRESETS : [''];
  const results = await Promise.all(
    presets.map((p) => oneImageToImage(prompt + p, refImage, config, sz)),
  );
  const images = results.flat();
  if (!images.length) friendly('图片服务未返回图像。');
  return images;
}

// ---- Builtin service (real backend; holds the official 千问 key) -------------

const useMock = () => USE_MOCK_BUILTIN || !BUILTIN_API_BASE_URL;

function authHeaders(token: string | null): Record<string, string> {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function builtinJson(path: string, init: RequestInit): Promise<any> {
  let res: Response;
  try {
    res = await fetch(`${BUILTIN_API_BASE_URL}${path}`, init);
  } catch {
    friendly('无法连接内置服务，请确认后端已启动或稍后再试。');
  }
  if (res.status === 401) friendly('登录已失效，请重新登录。');
  if (res.status === 402) friendly('剩余次数不足，请先购买。');
  const data = await res.json().catch(() => ({}));
  if (!res.ok) friendly(data?.error ?? '内置服务暂时不可用，请稍后再试。');
  return data;
}

export async function builtinRequestCode(email: string): Promise<{ devCode?: string }> {
  if (useMock()) return { devCode: '000000' };
  return builtinJson('/api/auth/request', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });
}

export async function builtinVerifyCode(
  email: string,
  code: string,
): Promise<{ token: string; account: string }> {
  if (useMock()) return { token: 'mock-token', account: email.split('@')[0] };
  const d = await builtinJson('/api/auth/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, code }),
  });
  return { token: d.token, account: d.account };
}

export async function builtinGoogleLogin(
  accessToken: string,
): Promise<{ token: string; account: string }> {
  if (useMock()) return { token: 'mock-token', account: 'google-user' };
  const d = await builtinJson('/api/auth/google', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ accessToken }),
  });
  return { token: d.token, account: d.account };
}

export async function builtinLogout(token: string | null): Promise<void> {
  if (useMock() || !token) return;
  try {
    await fetch(`${BUILTIN_API_BASE_URL}/api/auth/logout`, {
      method: 'POST',
      headers: authHeaders(token),
    });
  } catch {
    /* best effort */
  }
}

export async function builtinAnalyze(
  prompt: string,
  lang: Lang,
  token: string | null,
  image?: string,
): Promise<AnalysisResult> {
  if (useMock()) {
    await delay(600);
    return heuristicAnalyze(prompt, lang);
  }
  if (!token) friendly('请先登录内置服务。');
  const d = await builtinJson('/api/analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders(token) },
    body: JSON.stringify({ prompt, lang, image }),
  });
  return coerceResult(d.result ?? d, prompt);
}

export async function builtinDescribeImage(
  image: string,
  lang: Lang,
  token: string | null,
): Promise<ImagePrompt> {
  if (!token) friendly('请先登录内置服务。');
  const d = await builtinJson('/api/describe-image', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders(token) },
    body: JSON.stringify({ image, lang }),
  });
  return { zh: String(d.prompt?.zh ?? ''), en: String(d.prompt?.en ?? '') };
}

export async function builtinQuota(token: string | null): Promise<QuotaInfo> {
  if (useMock()) {
    await delay(200);
    return { remaining: 0, plan: 'Free' };
  }
  if (!token) return { remaining: 0, plan: 'Free' };
  const d = await builtinJson('/api/quota', { headers: authHeaders(token) });
  return d.quota ?? { remaining: 0, plan: 'Free' };
}

export async function builtinMe(token: string | null): Promise<{ account: string }> {
  if (useMock()) {
    await delay(150);
    return { account: 'mock' };
  }
  if (!token) friendly('未登录。');
  const d = await builtinJson('/api/me', { headers: authHeaders(token) });
  return { account: d.account };
}

export async function builtinCheckout(
  tier: string,
  token: string | null,
): Promise<{ url: string }> {
  if (!token) friendly('请先登录。');
  const d = await builtinJson('/api/billing/checkout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders(token) },
    body: JSON.stringify({ tier }),
  });
  return { url: d.url };
}

export function builtinCheckoutUrl(): string {
  return BUILTIN_API_BASE_URL
    ? `${BUILTIN_API_BASE_URL}/api/billing/checkout`
    : 'https://example.com/moon-promptcard/checkout';
}

// ---- helpers ----------------------------------------------------------------

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
async function safeText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return '';
  }
}
function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n)}…` : s;
}
