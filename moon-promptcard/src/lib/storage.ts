// Thin, typed wrapper around chrome.storage.local.
// Builtin token and custom API key are stored under separate keys so they can
// be cleared independently. Nothing here ever leaves the device on its own.

import type { AnalysisResult, Settings } from './types';

const KEYS = {
  settings: 'mpc:settings',
  lastResult: 'mpc:lastResult',
  history: 'mpc:history',
} as const;

export const DEFAULT_CUSTOM_API = {
  baseUrl: '',
  apiKey: '',
  model: 'qwen-vl-plus',
  imageModel: 'gpt-image-2',
  editModel: 'nanobanana-2',
  imageSize: '1024x1024',
  imageCount: 1,
};

export const DEFAULT_SETTINGS: Settings = {
  serviceMode: 'custom',
  lang: 'zh',
  theme: 'dark',
  floatingEnabled: false,
  customApi: { ...DEFAULT_CUSTOM_API },
  builtin: { token: null, account: null },
};

const HISTORY_LIMIT = 20;

function area(): chrome.storage.StorageArea {
  return chrome.storage.local;
}

export async function getSettings(): Promise<Settings> {
  const raw = await area().get(KEYS.settings);
  const stored = (raw[KEYS.settings] as Partial<Settings> | undefined) ?? {};
  return {
    ...DEFAULT_SETTINGS,
    ...stored,
    customApi: { ...DEFAULT_SETTINGS.customApi, ...stored.customApi },
    builtin: { ...DEFAULT_SETTINGS.builtin, ...stored.builtin },
  };
}

export async function saveSettings(patch: Partial<Settings>): Promise<Settings> {
  const current = await getSettings();
  const next: Settings = {
    ...current,
    ...patch,
    customApi: { ...current.customApi, ...patch.customApi },
    builtin: { ...current.builtin, ...patch.builtin },
  };
  await area().set({ [KEYS.settings]: next });
  return next;
}

export async function clearBuiltinAuth(): Promise<void> {
  await saveSettings({ builtin: { token: null, account: null } });
}

export async function clearCustomApi(): Promise<void> {
  await saveSettings({ customApi: { ...DEFAULT_CUSTOM_API } });
}

export async function getLastResult(): Promise<AnalysisResult | null> {
  const raw = await area().get(KEYS.lastResult);
  return (raw[KEYS.lastResult] as AnalysisResult | undefined) ?? null;
}

export async function setLastResult(result: AnalysisResult): Promise<void> {
  await area().set({ [KEYS.lastResult]: result });
  const history = await getHistory();
  const next = [result, ...history].slice(0, HISTORY_LIMIT);
  await area().set({ [KEYS.history]: next });
}

export async function getHistory(): Promise<AnalysisResult[]> {
  const raw = await area().get(KEYS.history);
  return (raw[KEYS.history] as AnalysisResult[] | undefined) ?? [];
}

export async function clearHistory(): Promise<void> {
  await area().set({ [KEYS.history]: [], [KEYS.lastResult]: null });
}

export function onSettingsChanged(cb: (s: Settings) => void): () => void {
  const listener = (
    changes: { [k: string]: chrome.storage.StorageChange },
    areaName: string,
  ) => {
    if (areaName === 'local' && changes[KEYS.settings]) {
      getSettings().then(cb);
    }
  };
  chrome.storage.onChanged.addListener(listener);
  return () => chrome.storage.onChanged.removeListener(listener);
}

export const STORAGE_KEYS = KEYS;
