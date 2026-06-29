// promptAnalyzer.ts
//
// Two responsibilities:
//  1. buildAnalysisMessages(): construct the system + user messages sent to any
//     OpenAI-compatible chat model so it returns the strict JSON schema.
//  2. heuristicAnalyze(): a fully local, no-network fallback used by the Mock
//     builtin service and whenever a model is unavailable. It applies the
//     prompt-quality rules from the spec so the extension is useful offline.

import type { AnalysisResult, Lang, PromptIssue } from './types';

export const ANALYSIS_JSON_SHAPE = `{
  "score": number (0-100),
  "level": "优秀" | "可优化" | "较弱",
  "summary": string,
  "issues": [{ "title": string, "detail": string, "severity": "high"|"medium"|"low" }],
  "suggestions": string[],
  "optimizedPrompt": string,
  "negativePrompt": string,
  "tags": string[]
}`;

export function buildSystemPrompt(lang: Lang): string {
  const langLine =
    lang === 'en'
      ? 'Respond in English. The optimizedPrompt must also be in English.'
      : '使用中文回答。optimizedPrompt 也必须是中文。';
  return [
    'You are a senior prompt engineer specialised in image and video generation prompts',
    '(Veo, Seedance, Kling, Omni, GPT Image, Gemini Image, Midjourney, Stable Diffusion).',
    'Analyse the user prompt against these checks: subject clarity, scene, action,',
    'camera language, style consistency, aspect ratio / duration, fixed character or product',
    'requirements, model-stability risk, target model fit, conflicting words, missing negative',
    'constraints, and whether it is directly generatable.',
    langLine,
    'Return ONLY a JSON object, no markdown fences, no commentary. Schema:',
    ANALYSIS_JSON_SHAPE,
  ].join('\n');
}

export function buildAnalysisMessages(prompt: string, lang: Lang) {
  return [
    { role: 'system', content: buildSystemPrompt(lang) },
    { role: 'user', content: `Prompt to analyse:\n"""\n${prompt}\n"""` },
  ];
}

// ---- Local heuristic fallback ------------------------------------------------

interface Rule {
  test: RegExp | ((p: string) => boolean);
  weight: number;
  issue: Omit<PromptIssue, 'severity'> & { severity: PromptIssue['severity'] };
  suggestion: string;
}

const RULES: Rule[] = [
  {
    test: (p) => p.length < 12,
    weight: 18,
    issue: {
      title: '提示词过短',
      detail: '内容过少，模型缺乏可参考的信息，结果随机性高。',
      severity: 'high',
    },
    suggestion: '补充主体、场景与画面目标，至少描述清楚“谁、在哪、做什么”。',
  },
  {
    test: /(镜头|运镜|推近|拉远|环绕|俯拍|仰拍|特写|远景|camera|close[- ]?up|wide shot|dolly|pan)/i,
    weight: 12,
    issue: {
      title: '缺少镜头语言',
      detail: '没有说明镜头景别或运动方式，视频模型容易自由发挥导致不稳定。',
      severity: 'medium',
    },
    suggestion: '补充镜头运动与景别，例如“缓慢推近的中景特写”。',
  },
  {
    test: /(比例|画幅|时长|秒|aspect|ratio|16:9|9:16|1:1|duration|seconds)/i,
    weight: 10,
    issue: {
      title: '缺少画幅或时长',
      detail: '未指定画幅比例或时长，输出尺寸不可控。',
      severity: 'medium',
    },
    suggestion: '补充画幅与时长，例如“9:16 竖屏，时长 5 秒”。',
  },
  {
    test: /(风格|style|cinematic|写实|赛博|插画|3d|渲染|photoreal|anime)/i,
    weight: 10,
    issue: {
      title: '风格不明确',
      detail: '没有统一的视觉风格描述，画面观感不稳定。',
      severity: 'medium',
    },
    suggestion: '补充统一风格，例如“电影质感、写实光影、暖色调”。',
  },
  {
    test: /(保持一致|固定|同一|不变|consistent|same (character|product)|keep)/i,
    weight: 8,
    issue: {
      title: '主体一致性未约束',
      detail: '若需要角色或产品在多帧保持一致，应明确说明，否则容易变脸或变形。',
      severity: 'medium',
    },
    suggestion: '补充固定主体描述，例如“全程保持同一人物外貌与服装”。',
  },
  {
    test: /(避免|不要|negative|no |without|不出现)/i,
    weight: 8,
    issue: {
      title: '缺少负面限制',
      detail: '没有负面约束，容易出现多指、文字乱码、变形等常见缺陷。',
      severity: 'low',
    },
    suggestion: '补充负面提示，例如“避免变脸、避免多余手指、避免文字乱码”。',
  },
];

const POSITIVE_NEGATIVE_DEFAULT =
  '避免变脸、避免产品变形、避免文字乱码、避免多余手指、避免画面崩坏、避免风格突变';

function levelFor(score: number): string {
  if (score >= 80) return '优秀';
  if (score >= 55) return '可优化';
  return '较弱';
}

export function heuristicAnalyze(prompt: string, lang: Lang = 'zh'): AnalysisResult {
  const text = prompt.trim();
  let score = 100;
  const issues: PromptIssue[] = [];
  const suggestions: string[] = [];

  for (const rule of RULES) {
    const present =
      typeof rule.test === 'function' ? rule.test(text) : rule.test.test(text);
    // For "missing X" rules the trigger is the ABSENCE of the pattern; only the
    // "too short" rule triggers on presence of the condition.
    const isShortRule = typeof rule.test === 'function';
    const triggered = isShortRule ? present : !present;
    if (triggered) {
      score -= rule.weight;
      issues.push(rule.issue);
      suggestions.push(rule.suggestion);
    }
  }

  score = Math.max(8, Math.min(100, score));

  const tags: string[] = [];
  if (/视频|video|veo|kling|seedance|omni/i.test(text)) tags.push('视频提示词');
  if (/图像|image|midjourney|sd|gpt image|gemini/i.test(text)) tags.push('图像提示词');
  if (/广告|电商|产品|product|ad/i.test(text)) tags.push('电商广告');
  if (/角色|人物|character|主体/i.test(text)) tags.push('角色稳定');
  if (tags.length === 0) tags.push('通用提示词');

  const summary =
    issues.length === 0
      ? '提示词结构完整，可直接用于生成。'
      : `主要问题：${issues[0].title}。共发现 ${issues.length} 处可改进点。`;

  const optimizedPrompt = buildOptimizedPrompt(text, issues);

  return {
    score,
    level: levelFor(score),
    summary,
    issues,
    suggestions: suggestions.length ? suggestions : ['提示词已较完整，可尝试补充更精细的光影与情绪描述。'],
    optimizedPrompt,
    negativePrompt: POSITIVE_NEGATIVE_DEFAULT,
    tags,
    createdAt: new Date().toISOString(),
    source: prompt,
    ...(lang === 'en' ? {} : {}),
  };
}

function buildOptimizedPrompt(text: string, issues: PromptIssue[]): string {
  const additions: string[] = [];
  const has = (t: string) => issues.some((i) => i.title.includes(t));
  if (has('镜头')) additions.push('镜头：缓慢推近的中景，稳定运镜');
  if (has('画幅')) additions.push('画幅：16:9，时长 5 秒');
  if (has('风格')) additions.push('风格：电影质感，写实光影，统一色调');
  if (has('一致')) additions.push('主体：全程保持同一人物/产品的外观一致');
  const base = text.length < 12 ? `${text}（请补充主体、场景与动作）` : text;
  const tail = additions.length ? `\n\n增强要素：\n- ${additions.join('\n- ')}` : '';
  return `${base}${tail}`;
}
