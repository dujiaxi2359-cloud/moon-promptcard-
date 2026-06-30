// service-worker.ts (MV3 background)
//
// Central message router. The content script and popup never call the network
// directly for analysis — they send a message here so a single place owns
// provider selection, persistence, and error formatting.

import {
  builtinAnalyze,
  builtinCheckout,
  builtinCheckoutUrl,
  builtinDescribeImage,
  builtinGoogleLogin,
  builtinLogout,
  builtinMe,
  builtinQuota,
  builtinRequestCode,
  builtinVerifyCode,
  customApiAnalyze,
  imageToImage,
  imageToPrompt,
  listModels,
  testCustomApi,
  testImageApi,
  textToImage,
} from '@/lib/api';
import { getSettings, saveSettings, setLastResult } from '@/lib/storage';
import type { RuntimeMessage } from '@/lib/types';

const MENU_ANALYZE = 'mpc-analyze';
const MENU_IMAGE = 'mpc-image-to-prompt';

function setupMenus() {
  // removeAll first so re-creation never hits a duplicate-id error.
  chrome.contextMenus.removeAll(() => {
    // Always available on any right-click (page/selection/input) — like the competitor.
    chrome.contextMenus.create({
      id: MENU_ANALYZE,
      title: 'Moon PromptCard：分析提示词（选中或输入框）',
      contexts: ['all'],
    });
    // Image-specific entry, shows additionally when right-clicking an image.
    chrome.contextMenus.create({
      id: MENU_IMAGE,
      title: 'Moon PromptCard：图片转提示词',
      contexts: ['image'],
    });
  });
}

// Create on install/update AND on every service-worker startup, so the menus
// survive reloads and SW sleep/wake.
chrome.runtime.onInstalled.addListener(setupMenus);
setupMenus();

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (!tab?.id) return;
  if (info.menuItemId === MENU_ANALYZE) {
    if (info.selectionText) {
      chrome.tabs.sendMessage(tab.id, { type: 'ANALYZE_SELECTION', text: info.selectionText });
    } else {
      chrome.tabs.sendMessage(tab.id, { type: 'ANALYZE_EDITABLE' });
    }
  }
  if (info.menuItemId === MENU_IMAGE && info.srcUrl) {
    chrome.tabs.sendMessage(tab.id, { type: 'IMAGE_TO_PROMPT_SRC', src: info.srcUrl });
  }
});

async function handleAnalyze(prompt: string, image?: string) {
  const settings = await getSettings();
  const trimmed = prompt.trim();
  if (!trimmed && !image) return { ok: false, error: '提示词为空。' };

  try {
    const result =
      settings.serviceMode === 'custom'
        ? await customApiAnalyze(trimmed, settings.customApi, settings.lang, image)
        : await builtinAnalyze(trimmed, settings.lang, settings.builtin.token, image);
    await setLastResult(result);
    return { ok: true, result };
  } catch (e) {
    const error = e instanceof Error ? e.message : '分析失败，请稍后再试。';
    return { ok: false, error };
  }
}

async function handleImageToPrompt(image: string) {
  const settings = await getSettings();
  try {
    const prompt =
      settings.serviceMode === 'custom'
        ? await imageToPrompt(image, settings.customApi, settings.lang)
        : await builtinDescribeImage(image, settings.lang, settings.builtin.token);
    // Save into the unified history so image→prompt results are browsable too.
    await setLastResult({
      score: 0,
      level: '图片转提示词',
      summary: (prompt.zh || prompt.en || '').slice(0, 70),
      issues: [],
      suggestions: [],
      optimizedPrompt: [prompt.zh, prompt.en].filter(Boolean).join('\n\n'),
      negativePrompt: '',
      tags: ['图片转提示词'],
      createdAt: new Date().toISOString(),
      source: '图片转提示词',
    });
    return { ok: true, prompt };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : '图片转提示词失败。' };
  }
}

const errMsg = (e: unknown) => (e instanceof Error ? e.message : '请求失败，请稍后再试。');

chrome.runtime.onMessage.addListener((message: RuntimeMessage, _sender, sendResponse) => {
  (async () => {
    switch (message.type) {
      case 'PING':
        sendResponse({ ok: true });
        break;
      case 'ANALYZE':
        sendResponse(await handleAnalyze(message.prompt, message.image));
        break;
      case 'TEST_CUSTOM_API':
        sendResponse(await testCustomApi(message.config));
        break;
      case 'TEST_IMAGE_API':
        sendResponse(await testImageApi(message.config));
        break;
      case 'LIST_MODELS':
        try {
          sendResponse({ ok: true, models: await listModels(message.config) });
        } catch (e) {
          sendResponse({ ok: false, error: errMsg(e) });
        }
        break;
      case 'IMAGE_TO_PROMPT':
        sendResponse(await handleImageToPrompt(message.image));
        break;
      case 'AUTH_REQUEST':
        try {
          sendResponse({ ok: true, ...(await builtinRequestCode(message.email)) });
        } catch (e) {
          sendResponse({ ok: false, error: errMsg(e) });
        }
        break;
      case 'AUTH_VERIFY':
        try {
          const { token, account } = await builtinVerifyCode(message.email, message.code);
          await saveSettings({ builtin: { token, account } });
          sendResponse({ ok: true, account });
        } catch (e) {
          sendResponse({ ok: false, error: errMsg(e) });
        }
        break;
      case 'AUTH_GOOGLE':
        try {
          const { token, account } = await builtinGoogleLogin(message.accessToken);
          await saveSettings({ builtin: { token, account } });
          sendResponse({ ok: true, account });
        } catch (e) {
          sendResponse({ ok: false, error: errMsg(e) });
        }
        break;
      case 'LOGOUT':
        try {
          const s = await getSettings();
          await builtinLogout(s.builtin.token);
          await saveSettings({ builtin: { token: null, account: null } });
          sendResponse({ ok: true });
        } catch (e) {
          sendResponse({ ok: false, error: errMsg(e) });
        }
        break;
      case 'TEXT_TO_IMAGE':
        try {
          const s = await getSettings();
          sendResponse({
            ok: true,
            images: await textToImage(message.prompt, s.customApi, message.size, message.count),
          });
        } catch (e) {
          sendResponse({ ok: false, error: errMsg(e) });
        }
        break;
      case 'IMAGE_TO_IMAGE':
        try {
          const s = await getSettings();
          sendResponse({
            ok: true,
            images: await imageToImage(
              message.prompt,
              message.refImage,
              s.customApi,
              message.mode ?? 'single',
              message.size,
            ),
          });
        } catch (e) {
          sendResponse({ ok: false, error: errMsg(e) });
        }
        break;
      case 'GET_QUOTA':
        try {
          const s = await getSettings();
          sendResponse({ ok: true, quota: await builtinQuota(s.builtin.token) });
        } catch (e) {
          sendResponse({ ok: false, error: (e as Error).message });
        }
        break;
      case 'GET_ME':
        try {
          const s = await getSettings();
          const me = await builtinMe(s.builtin.token);
          sendResponse({ ok: true, account: me.account });
        } catch (e) {
          sendResponse({ ok: false, error: (e as Error).message });
        }
        break;
      case 'OPEN_CHECKOUT':
        chrome.tabs.create({ url: builtinCheckoutUrl() });
        sendResponse({ ok: true });
        break;
      case 'CHECKOUT':
        try {
          const s = await getSettings();
          const { url } = await builtinCheckout(message.tier, s.builtin.token);
          chrome.tabs.create({ url });
          sendResponse({ ok: true });
        } catch (e) {
          sendResponse({ ok: false, error: errMsg(e) });
        }
        break;
      default:
        sendResponse({ ok: false, error: 'unknown message' });
    }
  })();
  return true; // keep the channel open for the async response
});
