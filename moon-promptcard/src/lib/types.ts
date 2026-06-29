// Shared domain types for Moon PromptCard.

export type ServiceMode = 'builtin' | 'custom';
export type Lang = 'zh' | 'en';
export type Theme = 'dark' | 'light' | 'system';
export type Severity = 'high' | 'medium' | 'low';

export interface PromptIssue {
  title: string;
  detail: string;
  severity: Severity;
}

export interface AnalysisResult {
  score: number;
  level: string;
  summary: string;
  issues: PromptIssue[];
  suggestions: string[];
  optimizedPrompt: string;
  negativePrompt: string;
  tags: string[];
  /** ISO timestamp of when this analysis was produced. */
  createdAt: string;
  /** The original prompt that was analyzed. */
  source: string;
}

export interface CustomApiConfig {
  baseUrl: string;
  apiKey: string;
  /** Chat model — handles both text prompt analysis and vision (image→prompt). */
  model: string;
  /** Text-to-image model -> POST /images/generations */
  imageModel: string;
  /** Image-to-image model -> POST /images/edits */
  editModel: string;
  /** Default output size, e.g. "1024x1024". */
  imageSize: string;
  /** Default number of images per generation (1/2/4). */
  imageCount: number;
}

/** A generated image, returned as a data URL or http(s) URL. */
export interface GeneratedImage {
  url: string;
  label?: string;
}

/** Bilingual prompt extracted from an image (image→prompt). */
export interface ImagePrompt {
  zh: string;
  en: string;
}

export interface BuiltinAuth {
  token: string | null;
  account: string | null;
}

export interface Settings {
  serviceMode: ServiceMode;
  lang: Lang;
  theme: Theme;
  floatingEnabled: boolean;
  customApi: CustomApiConfig;
  builtin: BuiltinAuth;
}

export interface QuotaInfo {
  remaining: number;
  plan: string;
}

// Messages exchanged between content script / popup and the service worker.
export type RuntimeMessage =
  | { type: 'ANALYZE'; prompt: string; image?: string }
  | { type: 'TEST_CUSTOM_API'; config: CustomApiConfig }
  | { type: 'TEST_IMAGE_API'; config: CustomApiConfig }
  | { type: 'LIST_MODELS'; config: CustomApiConfig }
  | { type: 'IMAGE_TO_PROMPT'; image: string }
  | { type: 'TEXT_TO_IMAGE'; prompt: string; size?: string; count?: number }
  | { type: 'IMAGE_TO_IMAGE'; prompt: string; refImage: string; mode?: 'single' | 'mix'; size?: string }
  | { type: 'AUTH_REQUEST'; email: string }
  | { type: 'AUTH_VERIFY'; email: string; code: string }
  | { type: 'AUTH_GOOGLE'; accessToken: string }
  | { type: 'LOGOUT' }
  | { type: 'GET_QUOTA' }
  | { type: 'GET_ME' }
  | { type: 'OPEN_CHECKOUT' }
  | { type: 'OPEN_LATEST_RESULT' }
  | { type: 'TOGGLE_FLOATING'; enabled: boolean }
  | { type: 'PING' };

export interface AnalyzeResponse {
  ok: boolean;
  result?: AnalysisResult;
  error?: string;
}

export interface TestApiResponse {
  ok: boolean;
  message: string;
}

export interface MeResponse {
  ok: boolean;
  account?: string;
  error?: string;
}
