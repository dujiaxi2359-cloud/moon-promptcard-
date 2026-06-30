import { useCallback, useEffect, useRef, useState } from 'react';
import type { AnalysisResult, ImagePrompt, Lang, Settings } from '@/lib/types';
import { getSettings, onSettingsChanged, saveSettings } from '@/lib/storage';
import { t } from '@/lib/i18n';
import { ResultBody } from '@/components/ResultBody';
import { LoadingDots, StateBlock } from '@/components/ui';
import { ChevronDownIcon, CloseIcon, CopyIcon, MoonIcon, RefreshIcon, SparkIcon } from '@/components/icons';
import { readPromptSource, replacePrompt, trackEditable } from './editable';

type CardState = 'hidden' | 'open' | 'collapsed';
type ExtractState =
  | { state: 'hidden' }
  | { state: 'loading' }
  | { state: 'done'; prompt: ImagePrompt }
  | { state: 'error'; error: string };

export function FloatingApp() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [barVisible, setBarVisible] = useState(true);
  const [hasSelection, setHasSelection] = useState(false);
  const [card, setCard] = useState<CardState>('hidden');
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [replaced, setReplaced] = useState(false);
  const [extract, setExtract] = useState<ExtractState>({ state: 'hidden' });

  const lang: Lang = settings?.lang ?? 'zh';

  // load + subscribe to settings
  useEffect(() => {
    getSettings().then((s) => {
      setSettings(s);
      setEnabled(s.floatingEnabled);
    });
    return onSettingsChanged((s) => {
      setSettings(s);
      setEnabled(s.floatingEnabled);
    });
  }, []);

  // track which editable the user touched + selection presence (only when on)
  useEffect(() => {
    if (!enabled) return;
    const onFocusIn = (e: Event) => trackEditable(e.target);
    const onSelect = () => {
      const sel = window.getSelection?.();
      setHasSelection(!!sel && sel.toString().trim().length > 0);
    };
    document.addEventListener('focusin', onFocusIn, true);
    document.addEventListener('selectionchange', onSelect);
    return () => {
      document.removeEventListener('focusin', onFocusIn, true);
      document.removeEventListener('selectionchange', onSelect);
    };
  }, [enabled]);

  // listen for context-menu driven analysis from the service worker
  useEffect(() => {
    const handler = (msg: any) => {
      if (msg?.type === 'ANALYZE_SELECTION' && msg.text) {
        runAnalyze(msg.text);
      }
      if (msg?.type === 'IMAGE_TO_PROMPT_SRC' && msg.src) {
        extractPrompt(msg.src);
      }
      if (msg?.type === 'ANALYZE_EDITABLE') {
        const { text } = readPromptSource();
        runAnalyze(text);
      }
    };
    chrome.runtime.onMessage.addListener(handler);
    return () => chrome.runtime.onMessage.removeListener(handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const extractPrompt = useCallback((src: string) => {
    setExtract({ state: 'loading' });
    chrome.runtime.sendMessage({ type: 'IMAGE_TO_PROMPT', image: src }, (r) => {
      if (r?.ok && r.prompt) setExtract({ state: 'done', prompt: r.prompt });
      else setExtract({ state: 'error', error: r?.error ?? '图片转提示词失败。' });
    });
  }, []);

  const runAnalyze = useCallback(
    (prompt: string) => {
      const text = prompt.trim();
      if (!text) {
        setError(t(lang, 'emptyPrompt'));
        setCard('open');
        setResult(null);
        return;
      }
      setLoading(true);
      setError(null);
      setCard('open');
      chrome.runtime.sendMessage({ type: 'ANALYZE', prompt: text }, (r) => {
        setLoading(false);
        if (r?.ok && r.result) {
          setResult(r.result);
        } else {
          setError(r?.error ?? t(lang, 'emptyPrompt'));
        }
      });
    },
    [lang],
  );

  const onAnalyzeClick = () => {
    const { text } = readPromptSource();
    runAnalyze(text);
  };

  const toggleEnabled = async (v: boolean) => {
    setEnabled(v);
    const next = await saveSettings({ floatingEnabled: v });
    setSettings(next);
    if (!v) setCard('hidden');
  };

  if (!settings) return null;

  return (
    <>
      {/* page-side capsule bar */}
      {barVisible && (
        <FloatingBar
          lang={lang}
          enabled={enabled}
          hasSelection={hasSelection}
          onToggle={toggleEnabled}
          onAnalyze={onAnalyzeClick}
          onClose={() => setBarVisible(false)}
        />
      )}

      {/* result card */}
      {card !== 'hidden' && (
        <ResultCard
          lang={lang}
          state={card}
          loading={loading}
          error={error}
          result={result}
          copied={copied}
          replaced={replaced}
          onCollapse={() => setCard(card === 'collapsed' ? 'open' : 'collapsed')}
          onClose={() => setCard('hidden')}
          onCopy={() => {
            if (!result) return;
            navigator.clipboard.writeText(result.optimizedPrompt);
            setCopied(true);
            setTimeout(() => setCopied(false), 1400);
          }}
          onReplace={() => {
            if (!result) return;
            const ok = replacePrompt(result.optimizedPrompt);
            if (ok) {
              setReplaced(true);
              setTimeout(() => setReplaced(false), 1400);
            }
          }}
          onRegenerate={() => result && runAnalyze(result.source)}
        />
      )}

      {/* image → prompt card */}
      {extract.state !== 'hidden' && (
        <ExtractCard lang={lang} data={extract} onClose={() => setExtract({ state: 'hidden' })} />
      )}
    </>
  );
}

function ExtractCard({
  lang,
  data,
  onClose,
}: {
  lang: Lang;
  data: Exclude<ExtractState, { state: 'hidden' }>;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState<'zh' | 'en' | null>(null);
  const [pos, setPos] = useState({ x: Math.max(8, window.innerWidth - 440), y: 110 });
  const drag = useRef<{ dx: number; dy: number } | null>(null);
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!drag.current) return;
      setPos({
        x: Math.max(8, Math.min(window.innerWidth - 80, e.clientX - drag.current.dx)),
        y: Math.max(8, Math.min(window.innerHeight - 60, e.clientY - drag.current.dy)),
      });
    };
    const onUp = () => (drag.current = null);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, []);
  const copy = (which: 'zh' | 'en', text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(which);
    setTimeout(() => setCopied(null), 1400);
  };
  const zh = lang === 'zh';

  return (
    <div
      className="mpc-pop mpc-glass fixed z-[2147483647] w-[400px] max-w-[92vw] overflow-hidden rounded-card"
      style={{ left: pos.x, top: pos.y }}
    >
      <div
        onMouseDown={(e) => (drag.current = { dx: e.clientX - pos.x, dy: e.clientY - pos.y })}
        className="flex cursor-grab items-center justify-between gap-2 border-b border-black/[0.06] px-4 py-3 active:cursor-grabbing"
      >
        <div className="flex items-center gap-2">
          <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-[#15161A] text-paper">
            <SparkIcon className="h-3.5 w-3.5" />
          </div>
          <span className="text-[13px] font-semibold text-neutral-800">
            {zh ? '图片转提示词' : 'Image → prompt'}
          </span>
        </div>
        <button
          onClick={onClose}
          className="flex h-7 w-7 items-center justify-center rounded-lg text-neutral-500 hover:bg-black/[0.06]"
          aria-label={t(lang, 'close')}
        >
          <CloseIcon className="h-4 w-4" />
        </button>
      </div>

      <div className="p-4">
        {data.state === 'loading' ? (
          <div className="flex flex-col items-center justify-center gap-4 py-12">
            <LoadingDots />
            <span className="text-[13px] text-neutral-500">{zh ? '正在读图…' : 'Reading image…'}</span>
          </div>
        ) : data.state === 'error' ? (
          <StateBlock tone="error" icon={<CloseIcon className="h-5 w-5" />} body={data.error} />
        ) : (
          <div className="space-y-3">
            {([['zh', '中文提示词', data.prompt.zh], ['en', 'English prompt', data.prompt.en]] as const)
              .filter(([, , v]) => v)
              .map(([key, label, value]) => (
                <div key={key} className="rounded-2xl bg-white/70 p-3 ring-1 ring-black/5">
                  <div className="mb-1.5 flex items-center justify-between">
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
                      {label}
                    </span>
                    <button
                      onClick={() => copy(key, value)}
                      className="inline-flex items-center gap-1 rounded-lg bg-black/[0.05] px-2 py-1 text-[11px] font-medium text-neutral-700 hover:bg-black/[0.09]"
                    >
                      <CopyIcon className="h-3.5 w-3.5" />
                      {copied === key ? t(lang, 'copied') : t(lang, 'copy')}
                    </button>
                  </div>
                  <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-neutral-800">
                    {value}
                  </p>
                </div>
              ))}
          </div>
        )}
      </div>
    </div>
  );
}

function FloatingBar({
  lang,
  enabled,
  hasSelection,
  onToggle,
  onAnalyze,
  onClose,
}: {
  lang: Lang;
  enabled: boolean;
  hasSelection: boolean;
  onToggle: (v: boolean) => void;
  onAnalyze: () => void;
  onClose: () => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [pos, setPos] = useState({ x: 20, y: typeof window !== 'undefined' ? window.innerHeight - 96 : 600 });
  const drag = useRef<{ dx: number; dy: number; moved: boolean } | null>(null);
  const zh = lang === 'zh';
  const shadow = '0 22px 60px -16px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.14)';

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!drag.current) return;
      drag.current.moved = true;
      setPos({
        x: Math.max(8, Math.min(window.innerWidth - 90, e.clientX - drag.current.dx)),
        y: Math.max(8, Math.min(window.innerHeight - 60, e.clientY - drag.current.dy)),
      });
    };
    const onUp = () => (drag.current = null);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, []);

  const startDrag = (e: React.MouseEvent) => {
    drag.current = { dx: e.clientX - pos.x, dy: e.clientY - pos.y, moved: false };
  };

  if (collapsed) {
    return (
      <div className="z-[2147483647] fixed" style={{ left: pos.x, top: pos.y, fontFamily: 'inherit' }}>
        <button
          onMouseDown={startDrag}
          onClick={() => !drag.current?.moved && setCollapsed(false)}
          className="relative flex h-14 w-14 cursor-grab items-center justify-center rounded-full border border-white/15 bg-[rgba(16,17,20,0.85)] text-paper backdrop-blur-xl transition hover:brightness-110 active:cursor-grabbing"
          style={{ boxShadow: shadow }}
          aria-label={zh ? '展开悬浮分析' : 'Expand'}
        >
          <MoonIcon className="h-6 w-6" />
          {enabled && (
            <span className="absolute right-1.5 top-1.5 h-2.5 w-2.5 rounded-full bg-brand shadow-[0_0_8px_rgba(255,90,31,0.9)]" />
          )}
        </button>
      </div>
    );
  }

  return (
    <div className="z-[2147483647] fixed" style={{ left: pos.x, top: pos.y, fontFamily: 'inherit' }}>
      <div
        className="flex items-center gap-2.5 rounded-[20px] border border-white/15 bg-[rgba(16,17,20,0.85)] py-2 pl-2.5 pr-2 backdrop-blur-2xl"
        style={{ boxShadow: shadow }}
      >
        {/* drag handle: logo + label */}
        <div onMouseDown={startDrag} className="flex cursor-grab items-center gap-2.5 pr-1 active:cursor-grabbing select-none">
          <div className="relative flex h-9 w-9 items-center justify-center rounded-xl border border-line-strong bg-card text-paper">
            <MoonIcon className="h-[18px] w-[18px]" />
            <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-brand shadow-[0_0_6px_rgba(255,90,31,0.9)]" />
          </div>
          <span className="text-[14px] font-semibold tracking-tight text-white/90">
            {zh ? '悬浮与分析' : 'Float & analyze'}
          </span>
        </div>

        {/* toggle switch */}
        <button
          role="switch"
          aria-checked={enabled}
          onClick={() => onToggle(!enabled)}
          className={`relative h-7 w-[52px] shrink-0 rounded-full transition-colors ${
            enabled ? 'bg-brand shadow-[0_2px_10px_-2px_rgba(255,90,31,0.7)]' : 'bg-white/20'
          }`}
          title={t(lang, 'floatingAnalyze')}
        >
          <span
            className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow-[0_1px_3px_rgba(0,0,0,0.4)] transition-all duration-200 ${
              enabled ? 'left-[26px]' : 'left-1'
            }`}
          />
        </button>

        {enabled && (
          <button
            onClick={onAnalyze}
            className="mpc-glow-btn flex h-9 items-center gap-1.5 rounded-xl bg-gradient-to-b from-brand-bright to-brand-deep px-3.5 text-[13px] font-medium text-white shadow-ember transition hover:brightness-[1.07] active:scale-95"
            title={hasSelection ? t(lang, 'analyzeSelection') : t(lang, 'analyzeInput')}
          >
            <SparkIcon className="h-4 w-4" />
            {hasSelection ? (zh ? '分析选中' : 'Selection') : zh ? '分析' : 'Analyze'}
          </button>
        )}

        <button
          onClick={onClose}
          className="flex h-9 w-9 items-center justify-center rounded-xl bg-red-500/85 text-white transition hover:bg-red-500 active:scale-95"
          aria-label={t(lang, 'close')}
          title={t(lang, 'close')}
        >
          <CloseIcon className="h-[18px] w-[18px]" />
        </button>

        <button
          onClick={() => setCollapsed(true)}
          className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/10 text-white/70 transition hover:bg-white/20 hover:text-white active:scale-95"
          aria-label={t(lang, 'collapse')}
          title={t(lang, 'collapse')}
        >
          <ChevronDownIcon className="h-[18px] w-[18px]" />
        </button>
      </div>
    </div>
  );
}

function ResultCard({
  lang,
  state,
  loading,
  error,
  result,
  copied,
  replaced,
  onCollapse,
  onClose,
  onCopy,
  onReplace,
  onRegenerate,
}: {
  lang: Lang;
  state: CardState;
  loading: boolean;
  error: string | null;
  result: AnalysisResult | null;
  copied: boolean;
  replaced: boolean;
  onCollapse: () => void;
  onClose: () => void;
  onCopy: () => void;
  onReplace: () => void;
  onRegenerate: () => void;
}) {
  const [pos, setPos] = useState({ x: window.innerWidth - 440, y: 90 });
  const drag = useRef<{ dx: number; dy: number } | null>(null);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!drag.current) return;
      setPos({
        x: Math.max(8, Math.min(window.innerWidth - 80, e.clientX - drag.current.dx)),
        y: Math.max(8, Math.min(window.innerHeight - 60, e.clientY - drag.current.dy)),
      });
    };
    const onUp = () => (drag.current = null);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, []);

  const startDrag = (e: React.MouseEvent) => {
    drag.current = { dx: e.clientX - pos.x, dy: e.clientY - pos.y };
  };

  if (state === 'collapsed') {
    return (
      <button
        onClick={onCollapse}
        className="mpc-pop mpc-glass fixed z-[2147483647] flex items-center gap-2 rounded-full px-4 py-2.5 text-[13px] font-medium text-neutral-700 transition hover:brightness-[1.02] active:scale-[0.98]"
        style={{ left: pos.x, top: pos.y }}
      >
        <SparkIcon className="h-4 w-4 text-brand" />
        {t(lang, 'analysisResult')}
        {result && (
          <span className="rounded-md bg-brand/15 px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-brand-deep">
            {result.score}
          </span>
        )}
      </button>
    );
  }

  return (
    <div
      className="mpc-pop mpc-glass fixed z-[2147483647] w-[400px] max-w-[92vw] overflow-hidden rounded-card"
      style={{ left: pos.x, top: pos.y }}
    >
      {/* header (drag handle) */}
      <div
        onMouseDown={startDrag}
        className="flex cursor-grab items-center justify-between gap-2 border-b border-black/[0.06] px-4 py-3 active:cursor-grabbing"
      >
        <div className="flex items-center gap-2">
          <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-[#15161A] text-paper shadow-[inset_0_1px_0_rgba(234,230,221,0.2)]">
            <MoonIcon className="h-3.5 w-3.5" />
          </div>
          <span className="text-[12px] font-bold tracking-eyebrow text-neutral-700">
            {t(lang, 'appName')}
          </span>
          <span className="rounded-md bg-black/[0.06] px-1.5 py-px text-[10px] font-semibold tracking-wide text-neutral-500 ring-1 ring-black/5">
            V1.3.0
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={onCollapse}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-neutral-500 hover:bg-black/[0.06]"
            aria-label={t(lang, 'collapse')}
            title={t(lang, 'collapse')}
          >
            <ChevronDownIcon className="h-4 w-4" />
          </button>
          <button
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-neutral-500 hover:bg-black/[0.06]"
            aria-label={t(lang, 'close')}
            title={t(lang, 'close')}
          >
            <CloseIcon className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="p-4">
        <h3 className="mb-3 text-[15px] font-semibold text-neutral-800">
          {t(lang, 'analysisResult')}
        </h3>

        {loading ? (
          <div className="flex flex-col items-center justify-center gap-4 py-12">
            <LoadingDots />
            <span className="text-[13px] text-neutral-500">{t(lang, 'analyzing')}</span>
          </div>
        ) : error ? (
          <StateBlock
            tone="error"
            icon={<CloseIcon className="h-5 w-5" />}
            body={error}
            action={
              <button
                onClick={onRegenerate}
                className="mpc-glow-btn inline-flex items-center gap-2 rounded-xl bg-gradient-to-b from-brand-bright to-brand-deep px-4 py-2 text-[13px] font-medium text-white shadow-ember transition hover:brightness-[1.07]"
              >
                <RefreshIcon className="h-4 w-4" /> {t(lang, 'regenerate')}
              </button>
            }
          />
        ) : result ? (
          <ResultBody
            result={result}
            lang={lang}
            loading={loading}
            copied={copied}
            replaced={replaced}
            showReplace
            actions={{ onCopy, onReplace, onRegenerate }}
          />
        ) : (
          <StateBlock
            icon={<SparkIcon className="h-5 w-5" />}
            body={t(lang, 'noResult')}
          />
        )}
      </div>
    </div>
  );
}
