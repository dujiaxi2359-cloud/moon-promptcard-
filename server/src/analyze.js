// Prompt-analysis logic. Calls an OpenAI-compatible chat endpoint (works with
// Gemini's OpenAI-compatible URL) and coerces the reply into the strict schema
// the extension expects. Mirrors the frontend's prompt engineer system prompt.

import { config, llmConfigured, llmModelFor } from './config.js';

const JSON_SHAPE = `{
  "score": number (0-100),
  "level": "优秀" | "可优化" | "较弱",
  "summary": string,
  "issues": [{ "title": string, "detail": string, "severity": "high"|"medium"|"low" }],
  "suggestions": string[],
  "optimizedPrompt": string,
  "negativePrompt": string,
  "tags": string[]
}`;

function systemPrompt(lang) {
  const langLine =
    lang === 'en'
      ? 'Respond in English. optimizedPrompt must also be English.'
      : '使用中文回答。optimizedPrompt 也必须是中文。';
  return [
    'You are a senior prompt engineer for image and video generation',
    '(Veo, Seedance, Kling, Omni, Sora, GPT Image, Gemini Image, Midjourney, Stable Diffusion).',
    'Judge the prompt on: subject clarity, fixed product/character, scene, action,',
    'camera language, style consistency, aspect ratio, duration, target-model fit,',
    'conflicting words, missing negative constraints, face/product/text-glitch risk,',
    'and whether it is directly generatable.',
    langLine,
    'Return ONLY a JSON object, no markdown fences, no commentary. Schema:',
    JSON_SHAPE,
  ].join('\n');
}

function clampScore(v) {
  const n = Number(v);
  if (Number.isNaN(n)) return 60;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function coerce(obj, source) {
  return {
    score: clampScore(obj?.score),
    level: typeof obj?.level === 'string' ? obj.level : '可优化',
    summary: typeof obj?.summary === 'string' ? obj.summary : '已生成分析结果。',
    issues: Array.isArray(obj?.issues)
      ? obj.issues.map((i) => ({
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

function extractJson(text) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('no json');
  return JSON.parse(candidate.slice(start, end + 1));
}

// Local heuristic fallback so the server is useful even before a key is wired,
// and if the model returns something unparseable.
export function heuristic(prompt, lang = 'zh') {
  const text = String(prompt || '').trim();
  const checks = [
    { re: /(镜头|运镜|推近|拉远|环绕|俯拍|仰拍|特写|远景|camera|close[- ]?up|wide shot|dolly|pan)/i, w: 12, title: '缺少镜头语言', detail: '没有说明镜头景别或运动方式，视频模型容易自由发挥。', sev: 'medium', sug: '补充镜头运动与景别，例如“缓慢推近的中景特写”。' },
    { re: /(比例|画幅|时长|秒|aspect|ratio|16:9|9:16|1:1|duration|seconds)/i, w: 10, title: '缺少画幅或时长', detail: '未指定画幅比例或时长，输出尺寸不可控。', sev: 'medium', sug: '补充画幅与时长，例如“9:16 竖屏，时长 5 秒”。' },
    { re: /(风格|style|cinematic|写实|赛博|插画|3d|渲染|photoreal|anime)/i, w: 10, title: '风格不明确', detail: '没有统一的视觉风格描述，画面观感不稳定。', sev: 'medium', sug: '补充统一风格，例如“电影质感、写实光影、暖色调”。' },
    { re: /(保持一致|固定|同一|不变|consistent|same (character|product)|keep)/i, w: 8, title: '主体一致性未约束', detail: '需要角色或产品保持一致时应明确说明，否则容易变脸或变形。', sev: 'medium', sug: '补充固定主体描述，例如“全程保持同一人物外貌与服装”。' },
    { re: /(避免|不要|negative|no |without|不出现)/i, w: 8, title: '缺少负面限制', detail: '没有负面约束，容易出现多指、文字乱码、变形等缺陷。', sev: 'low', sug: '补充负面提示，例如“避免变脸、多余手指、文字乱码”。' },
  ];
  let score = 100;
  const issues = [];
  const suggestions = [];
  if (text.length < 12) {
    score -= 18;
    issues.push({ title: '提示词过短', detail: '信息太少，结果随机性高。', severity: 'high' });
    suggestions.push('补充主体、场景与画面目标，至少说清“谁、在哪、做什么”。');
  }
  for (const c of checks) {
    if (!c.re.test(text)) {
      score -= c.w;
      issues.push({ title: c.title, detail: c.detail, severity: c.sev });
      suggestions.push(c.sug);
    }
  }
  score = Math.max(8, Math.min(100, score));
  const level = score >= 80 ? '优秀' : score >= 55 ? '可优化' : '较弱';
  const tags = [];
  if (/视频|video|veo|kling|seedance|omni|sora/i.test(text)) tags.push('视频提示词');
  if (/图像|image|midjourney|sd|gpt image|gemini/i.test(text)) tags.push('图像提示词');
  if (tags.length === 0) tags.push('通用提示词');
  return {
    score,
    level,
    summary: issues.length ? `主要问题：${issues[0].title}，共 ${issues.length} 处可改进。` : '提示词结构完整，可直接用于生成。',
    issues,
    suggestions: suggestions.length ? suggestions : ['可尝试补充更精细的光影与情绪描述。'],
    optimizedPrompt: text,
    negativePrompt: '避免变脸、避免产品变形、避免文字乱码、避免多余手指、避免画面崩坏、避免风格突变',
    tags,
    createdAt: new Date().toISOString(),
    source: prompt,
  };
}

// `image` (optional) is a data URL or http(s) URL of a reference picture.
// When present we route to the vision model and build a multimodal message;
// vision models often reject response_format:json_object, so we omit it then
// and rely on extractJson + heuristic fallback.
// Image → bilingual prompt. Always uses the vision model.
export async function describeImage(image, lang = 'zh') {
  if (!llmConfigured()) {
    const err = new Error('分析服务未配置。');
    err.status = 501;
    throw err;
  }
  const sys =
    'You are an elite AIGC reverse-prompt engineer. Study the image VERY carefully, then write ' +
    'ONE precise, ready-to-paste text-to-image prompt that would faithfully reproduce it. ' +
    'Structure it as rich, comma-separated descriptors (the way pro Midjourney / Stable ' +
    'Diffusion users write), ordered as: [main subject + concrete attributes: appearance, ' +
    'pose, clothing, expression] , [secondary elements] , [scene / background] , [composition ' +
    '& framing] , [camera: angle, shot type, lens / focal length] , [lighting: type, direction, ' +
    'intensity] , [exact color palette] , [art style / medium / render: e.g. product ' +
    'photography, octane 3D render, cinematic film still, flat illustration, anime, poster ' +
    'design] , [mood / atmosphere] , [quality boosters: e.g. ultra-detailed, sharp focus, 8k, ' +
    'high dynamic range] , [aspect ratio if obvious]. If there is visible text in the image, ' +
    'quote it EXACTLY in quotes. Rules: be concrete and faithful — only what is actually ' +
    'visible, never invent; no vague words like "beautiful/amazing"; do NOT write a narrative ' +
    'sentence, write descriptor phrases. Return ONLY JSON {"zh": string, "en": string} — zh is ' +
    'the Chinese version, en the English version, each a single ready-to-paste line. No markdown.';
  let res;
  try {
    res = await fetch(`${config.llm.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.llm.apiKey}` },
      body: JSON.stringify({
        model: config.llm.visionModel,
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
    const err = new Error('无法连接模型服务。');
    err.status = 502;
    throw err;
  }
  if (!res.ok) {
    const err = new Error(`读图失败（${res.status}）。`);
    err.status = 502;
    throw err;
  }
  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content || '';
  try {
    const obj = extractJson(content);
    return { zh: String(obj?.zh ?? ''), en: String(obj?.en ?? '') };
  } catch {
    return lang === 'en' ? { zh: '', en: content } : { zh: content, en: '' };
  }
}

export async function analyze(prompt, lang = 'zh', image = '') {
  if (!llmConfigured()) return heuristic(prompt, lang);
  const hasImage = Boolean(image);
  const model = llmModelFor(hasImage);

  const userContent = hasImage
    ? [
        { type: 'text', text: `Prompt to analyse:\n"""\n${prompt}\n"""\nUse the reference image to judge subject, style and feasibility.` },
        { type: 'image_url', image_url: { url: image } },
      ]
    : `Prompt to analyse:\n"""\n${prompt}\n"""`;

  const body = {
    model,
    messages: [
      { role: 'system', content: systemPrompt(lang) },
      { role: 'user', content: userContent },
    ],
    temperature: 0.4,
  };
  if (!hasImage) body.response_format = { type: 'json_object' };

  let res;
  try {
    res = await fetch(`${config.llm.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.llm.apiKey}`,
      },
      body: JSON.stringify(body),
    });
  } catch {
    return heuristic(prompt, lang);
  }
  if (!res.ok) {
    const err = new Error('upstream model error');
    err.status = res.status === 401 || res.status === 403 ? 502 : 502;
    throw err;
  }
  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content) return heuristic(prompt, lang);
  try {
    return coerce(extractJson(content), prompt);
  } catch {
    return heuristic(prompt, lang);
  }
}
