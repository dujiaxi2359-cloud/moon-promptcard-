import { useCallback, useEffect, useRef, useState } from 'react';
import type { AnalysisResult, CustomApiConfig, ImagePrompt, ServiceMode, Settings } from '@/lib/types';
import { getLastResult, getSettings, saveSettings } from '@/lib/storage';
import { t } from '@/lib/i18n';
import { Button, IconButton, LoadingDots, SegmentToggle, Spinner, StateBlock } from '@/components/ui';
import { ResultBody } from '@/components/ResultBody';
import {
  ChevronDownIcon,
  CloseIcon,
  CopyIcon,
  DownloadIcon,
  EyeIcon,
  EyeOffIcon,
  HistoryIcon,
  ImageIcon,
  MoonIcon,
  RefreshIcon,
  SettingsIcon,
  SparkIcon,
} from '@/components/icons';

type View = 'home' | 'result' | 'generate' | 'extract';

export function Popup() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [account, setAccount] = useState<string>('—');
  const [remaining, setRemaining] = useState<number>(0);
  const [lastResult, setLast] = useState<AnalysisResult | null>(null);
  const [view, setView] = useState<View>('home');
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [imgPrompt, setImgPrompt] = useState<ImagePrompt | null>(null);
  const [imgLoading, setImgLoading] = useState(false);
  const [imgError, setImgError] = useState<string | null>(null);

  const lang = settings?.lang ?? 'zh';

  const refresh = useCallback(async () => {
    const s = await getSettings();
    setSettings(s);
    setLast(await getLastResult());
    if (s.serviceMode === 'builtin') {
      chrome.runtime.sendMessage({ type: 'GET_ME' }, (r) => r?.account && setAccount(r.account));
      chrome.runtime.sendMessage({ type: 'GET_QUOTA' }, (r) =>
        r?.quota && setRemaining(r.quota.remaining),
      );
    } else {
      setAccount(s.builtin.account ?? '本地模式');
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 1600);
  };

  const update = async (patch: Partial<Settings>) => {
    const next = await saveSettings(patch);
    setSettings(next);
    if (patch.serviceMode) refresh();
  };

  const regenerate = async () => {
    if (!lastResult) return;
    setLoading(true);
    chrome.runtime.sendMessage({ type: 'ANALYZE', prompt: lastResult.source }, (r) => {
      setLoading(false);
      if (r?.ok && r.result) {
        setLast(r.result);
      } else {
        showToast(r?.error ?? '分析失败');
      }
    });
  };

  const onBuy = () =>
    showToast(lang === 'zh' ? '购买功能即将开放，敬请期待。' : 'Purchasing is coming soon.');

  const uploadImage = (dataUrl: string) => {
    setView('extract');
    setImgLoading(true);
    setImgError(null);
    setImgPrompt(null);
    chrome.runtime.sendMessage({ type: 'IMAGE_TO_PROMPT', image: dataUrl }, (r) => {
      setImgLoading(false);
      if (r?.ok && r.prompt) setImgPrompt(r.prompt);
      else setImgError(r?.error ?? (lang === 'zh' ? '图片转提示词失败' : 'Failed'));
    });
  };

  if (!settings) {
    return (
      <div className="relative flex h-[420px] w-[372px] items-center justify-center overflow-hidden bg-ink">
        <div className="mpc-aura" style={{ top: '50%', left: '50%', marginTop: -80, marginLeft: -120 }} />
        <Spinner className="h-5 w-5 border-brand/30 border-t-brand" />
      </div>
    );
  }

  return (
    <div className="mpc-pop relative flex max-h-[600px] w-[372px] flex-col overflow-hidden bg-ink font-sans text-paper">
      <div className="mpc-aura" />
      <Header
        lang={lang}
        account={account}
        onGenerate={() => setView('generate')}
        onHistory={() => setView('result')}
        onRefresh={refresh}
        onSettings={() => chrome.runtime.openOptionsPage()}
      />

      <div className="mpc-scroll flex-1 overflow-y-auto px-4 pb-4">
        {view === 'home' ? (
          <HomeView
            settings={settings}
            lang={lang}
            remaining={remaining}
            hasResult={!!lastResult}
            onMode={(m) => update({ serviceMode: m })}
            onCustomChange={(c) => update({ customApi: c })}
            onTest={() => {}}
            onBuy={onBuy}
            onOpenResult={() => setView('result')}
            onUploadImage={uploadImage}
            onRefresh={refresh}
            showToast={showToast}
          />
        ) : view === 'generate' ? (
          <GenerateView lang={lang} config={settings.customApi} onBack={() => setView('home')} />
        ) : view === 'extract' ? (
          <ExtractView
            lang={lang}
            prompt={imgPrompt}
            loading={imgLoading}
            error={imgError}
            onBack={() => setView('home')}
          />
        ) : (
          <ResultView
            lang={lang}
            result={lastResult}
            loading={loading}
            copied={copied}
            onBack={() => setView('home')}
            onCopy={() => {
              if (!lastResult) return;
              navigator.clipboard.writeText(lastResult.optimizedPrompt);
              setCopied(true);
              setTimeout(() => setCopied(false), 1400);
            }}
            onRegenerate={regenerate}
          />
        )}
      </div>

      {toast && (
        <div className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 rounded-xl bg-black/80 px-3 py-2 text-xs text-white shadow-float ring-1 ring-white/10">
          {toast}
        </div>
      )}
    </div>
  );
}

function Header({
  lang,
  account,
  onGenerate,
  onHistory,
  onRefresh,
  onSettings,
}: {
  lang: 'zh' | 'en';
  account: string;
  onGenerate: () => void;
  onHistory: () => void;
  onRefresh: () => void;
  onSettings: () => void;
}) {
  return (
    <div className="relative flex items-center justify-between gap-2 px-4 pb-3 pt-4">
      <div className="flex items-center gap-2.5">
        <div className="relative flex h-9 w-9 items-center justify-center rounded-xl border border-line-strong bg-card text-paper shadow-card">
          <MoonIcon className="h-[18px] w-[18px]" />
          <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-brand shadow-[0_0_8px_rgba(255,90,31,0.8)]" />
        </div>
        <div className="leading-tight">
          <div className="flex items-center gap-1.5">
            <span className="text-[13px] font-bold tracking-eyebrow">{t(lang, 'appName')}</span>
            <span className="rounded-md border border-line bg-paper/[0.05] px-1.5 py-px text-[10px] font-semibold tracking-wide text-paper/60">
              V1.3.0
            </span>
          </div>
          <span className="text-[11px] text-paper/45">{account}</span>
        </div>
      </div>
      <div className="flex items-center gap-1.5">
        <IconButton label={lang === 'zh' ? '生成图片' : 'Generate'} onClick={onGenerate}>
          <ImageIcon />
        </IconButton>
        <IconButton label={t(lang, 'history')} onClick={onHistory}>
          <HistoryIcon />
        </IconButton>
        <IconButton label={t(lang, 'refresh')} onClick={onRefresh}>
          <RefreshIcon />
        </IconButton>
        <IconButton label={t(lang, 'settings')} onClick={onSettings}>
          <SettingsIcon />
        </IconButton>
      </div>
    </div>
  );
}

function HomeView({
  settings,
  lang,
  remaining,
  hasResult,
  onMode,
  onCustomChange,
  onBuy,
  onOpenResult,
  onUploadImage,
  onRefresh,
  showToast,
}: {
  settings: Settings;
  lang: 'zh' | 'en';
  remaining: number;
  hasResult: boolean;
  onMode: (m: ServiceMode) => void;
  onCustomChange: (c: CustomApiConfig) => void;
  onTest: () => void;
  onBuy: () => void;
  onOpenResult: () => void;
  onUploadImage: (dataUrl: string) => void;
  onRefresh: () => void;
  showToast: (m: string) => void;
}) {
  return (
    <div className="space-y-3">
      <SegmentToggle<ServiceMode>
        value={settings.serviceMode}
        onChange={onMode}
        options={[
          { value: 'builtin', label: t(lang, 'builtin') },
          { value: 'custom', label: t(lang, 'custom'), badge: t(lang, 'inUse') },
        ]}
      />

      {settings.serviceMode === 'builtin' ? (
        <BuiltinPanel
          lang={lang}
          loggedIn={!!settings.builtin.token}
          account={settings.builtin.account}
          remaining={remaining}
          hasResult={hasResult}
          onBuy={onBuy}
          onOpenResult={onOpenResult}
          onUploadImage={onUploadImage}
          onAuthed={onRefresh}
          showToast={showToast}
        />
      ) : (
        <CustomPanel
          lang={lang}
          config={settings.customApi}
          onChange={onCustomChange}
          showToast={showToast}
        />
      )}
    </div>
  );
}

function BuiltinPanel({
  lang,
  loggedIn,
  account,
  remaining,
  hasResult,
  onBuy,
  onOpenResult,
  onUploadImage,
  onAuthed,
  showToast,
}: {
  lang: 'zh' | 'en';
  loggedIn: boolean;
  account: string | null;
  remaining: number;
  hasResult: boolean;
  onBuy: () => void;
  onOpenResult: () => void;
  onUploadImage: (dataUrl: string) => void;
  onAuthed: () => void;
  showToast: (m: string) => void;
}) {
  const uploadRef = useRef<HTMLInputElement>(null);
  const pick = (f: File | undefined) => {
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => onUploadImage(String(reader.result));
    reader.readAsDataURL(f);
  };
  if (!loggedIn) return <LoginPanel lang={lang} onAuthed={onAuthed} showToast={showToast} />;

  return (
    <div className="space-y-3">
      <div className="mpc-card p-4">
        <div className="mb-3 flex items-center justify-between">
          <span className="text-[12px] text-paper/55">{account ?? '—'}</span>
          <button
            onClick={() => chrome.runtime.sendMessage({ type: 'LOGOUT' }, onAuthed)}
            className="text-[11px] text-paper/40 underline-offset-2 hover:text-paper/70 hover:underline"
          >
            {t(lang, 'logout')}
          </button>
        </div>
        <div className="flex items-end justify-between">
          <div>
            <p className="mpc-eyebrow">{t(lang, 'remaining')}</p>
            <p className="mt-1.5 flex items-baseline gap-1">
              <span className="text-[34px] font-bold leading-none tabular-nums text-paper">{remaining}</span>
              <span className="text-sm text-white/45">{t(lang, 'times')}</span>
            </p>
          </div>
          <Button variant="primary" className="px-5 py-2.5" onClick={onBuy}>
            {t(lang, 'buy')}
          </Button>
        </div>
      </div>

      <button
        onClick={onOpenResult}
        className="group flex w-full items-center justify-between rounded-2xl border border-line bg-white/[0.03] p-4 text-left transition hover:border-line-strong hover:bg-white/[0.06]"
      >
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand/12 text-brand">
            <SparkIcon />
          </div>
          <span className="text-sm font-medium text-white/85">{t(lang, 'bestResult')}</span>
        </div>
        <span className="text-[12px] text-white/40 transition group-hover:translate-x-0.5 group-hover:text-white/70">
          {hasResult ? '→' : t(lang, 'noResult').slice(0, 8) + '…'}
        </span>
      </button>

      <input ref={uploadRef} type="file" accept="image/*" className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
      <Button variant="ghost" className="w-full py-3" onClick={() => uploadRef.current?.click()}>
        <ImageIcon /> {lang === 'zh' ? '上传图片分析' : 'Analyze an image'}
      </Button>
    </div>
  );
}

function ExtractView({
  lang,
  prompt,
  loading,
  error,
  onBack,
}: {
  lang: 'zh' | 'en';
  prompt: ImagePrompt | null;
  loading: boolean;
  error: string | null;
  onBack: () => void;
}) {
  const zh = lang === 'zh';
  const [copied, setCopied] = useState<'zh' | 'en' | null>(null);
  const copy = (which: 'zh' | 'en', text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(which);
    setTimeout(() => setCopied(null), 1400);
  };
  return (
    <div className="space-y-3">
      <button onClick={onBack} className="flex items-center gap-1 text-[12px] text-paper/50 hover:text-paper/80">
        <ChevronDownIcon className="rotate-90" /> {zh ? '图片转提示词' : 'Image → prompt'}
      </button>

      {loading ? (
        <div className="flex flex-col items-center gap-4 py-12">
          <LoadingDots />
          <span className="text-[12px] text-paper/45">{zh ? '正在读图…' : 'Reading image…'}</span>
        </div>
      ) : error ? (
        <div className="rounded-card bg-[rgba(247,247,248,0.97)] p-3 shadow-float ring-1 ring-black/5">
          <StateBlock tone="error" icon={<CloseIcon className="h-5 w-5" />} body={error} />
        </div>
      ) : prompt ? (
        <div className="space-y-3">
          {([['zh', '中文提示词', prompt.zh], ['en', 'English prompt', prompt.en]] as const)
            .filter(([, , v]) => v)
            .map(([key, label, value]) => (
              <div key={key} className="mpc-card p-3.5">
                <div className="mb-1.5 flex items-center justify-between">
                  <span className="mpc-eyebrow">{label}</span>
                  <button
                    onClick={() => copy(key, value)}
                    className="inline-flex items-center gap-1 rounded-lg bg-white/[0.06] px-2 py-1 text-[11px] font-medium text-paper/80 hover:bg-white/[0.1]"
                  >
                    <CopyIcon className="h-3.5 w-3.5" /> {copied === key ? t(lang, 'copied') : t(lang, 'copy')}
                  </button>
                </div>
                <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-paper/90">{value}</p>
              </div>
            ))}
        </div>
      ) : null}
    </div>
  );
}

function LoginPanel({
  lang,
  onAuthed,
  showToast,
}: {
  lang: 'zh' | 'en';
  onAuthed: () => void;
  showToast: (m: string) => void;
}) {
  const zh = lang === 'zh';
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [busy, setBusy] = useState(false);

  const request = () => {
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      showToast(zh ? '请输入有效邮箱' : 'Enter a valid email');
      return;
    }
    setBusy(true);
    chrome.runtime.sendMessage({ type: 'AUTH_REQUEST', email }, (r) => {
      setBusy(false);
      if (r?.ok) {
        setStep('code');
        showToast(r.devCode ? (zh ? `验证码(开发): ${r.devCode}` : `Dev code: ${r.devCode}`) : zh ? '验证码已发送' : 'Code sent');
      } else showToast(r?.error ?? (zh ? '发送失败' : 'Failed'));
    });
  };

  const verify = () => {
    if (!code.trim()) return;
    setBusy(true);
    chrome.runtime.sendMessage({ type: 'AUTH_VERIFY', email, code }, (r) => {
      setBusy(false);
      if (r?.ok) onAuthed();
      else showToast(r?.error ?? (zh ? '验证失败' : 'Failed'));
    });
  };

  return (
    <div className="mpc-card space-y-3 p-4">
      <div>
        <h3 className="text-[15px] font-semibold text-paper">{zh ? '登录内置服务' : 'Sign in'}</h3>
        <p className="mt-1 text-[12px] leading-relaxed text-paper/45">
          {zh ? '用邮箱验证码登录，即可使用内置提示词分析与图片转提示词。' : 'Email-code sign-in to use built-in analysis.'}
        </p>
      </div>
      <input
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        type="email"
        placeholder={zh ? '邮箱地址' : 'Email'}
        className="mpc-input"
        spellCheck={false}
        autoComplete="off"
      />
      {step === 'code' && (
        <input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder={zh ? '6 位验证码' : '6-digit code'}
          inputMode="numeric"
          className="mpc-input tracking-[0.3em]"
          spellCheck={false}
          autoComplete="off"
        />
      )}
      {step === 'email' ? (
        <Button variant="primary" className="h-[50px] w-full text-[15px]" onClick={request} disabled={busy}>
          {busy ? <Spinner className="border-[#15161A]/30 border-t-[#15161A]" /> : null}
          {zh ? '发送验证码' : 'Send code'}
        </Button>
      ) : (
        <div className="flex gap-2">
          <Button variant="ghost" className="px-4 py-3" onClick={() => setStep('email')}>
            {t(lang, 'back')}
          </Button>
          <Button variant="primary" className="h-[50px] flex-1 text-[15px]" onClick={verify} disabled={busy}>
            {busy ? <Spinner className="border-[#15161A]/30 border-t-[#15161A]" /> : null}
            {zh ? '登录' : 'Sign in'}
          </Button>
        </div>
      )}
    </div>
  );
}

function CustomPanel({
  lang,
  config,
  onChange,
  showToast,
}: {
  lang: 'zh' | 'en';
  config: CustomApiConfig;
  onChange: (c: CustomApiConfig) => void;
  showToast: (m: string) => void;
}) {
  const [showKey, setShowKey] = useState(false);
  const [testing, setTesting] = useState(false);

  const test = () => {
    setTesting(true);
    chrome.runtime.sendMessage({ type: 'TEST_CUSTOM_API', config }, (r) => {
      setTesting(false);
      showToast(r?.message ?? '测试失败');
    });
  };

  return (
    <div className="space-y-3">
      <Field label={t(lang, 'baseUrl')}>
        <input
          value={config.baseUrl}
          onChange={(e) => onChange({ ...config, baseUrl: e.target.value })}
          placeholder="https://api.example.com/v1"
          className="mpc-input"
          spellCheck={false}
          autoComplete="off"
        />
      </Field>

      <Field label={t(lang, 'apiKey')}>
        <div className="relative">
          <input
            value={config.apiKey}
            onChange={(e) => onChange({ ...config, apiKey: e.target.value })}
            type={showKey ? 'text' : 'password'}
            placeholder="sk-..."
            className="mpc-input pr-10"
            spellCheck={false}
            autoComplete="off"
          />
          <button
            onClick={() => setShowKey((v) => !v)}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/70"
            aria-label={showKey ? 'hide' : 'show'}
          >
            {showKey ? <EyeOffIcon /> : <EyeIcon />}
          </button>
        </div>
      </Field>

      <Field label={t(lang, 'model')}>
        <input
          value={config.model}
          onChange={(e) => onChange({ ...config, model: e.target.value })}
          placeholder="gpt-4o-mini"
          className="mpc-input"
          spellCheck={false}
          autoComplete="off"
        />
      </Field>

      <Button
        variant="primary"
        className="h-[52px] w-full text-[15px]"
        onClick={test}
        disabled={testing}
      >
        {testing ? <Spinner /> : null}
        {testing ? t(lang, 'testing') : t(lang, 'testApi')}
      </Button>

      <p className="px-1 text-[11px] leading-relaxed text-white/35">
        {lang === 'zh'
          ? 'API Key 仅保存在本地浏览器，不会上传到我们的服务器。'
          : 'Your API key is stored locally and never sent to our servers.'}
      </p>
    </div>
  );
}

function ResultView({
  lang,
  result,
  loading,
  copied,
  onBack,
  onCopy,
  onRegenerate,
}: {
  lang: 'zh' | 'en';
  result: AnalysisResult | null;
  loading: boolean;
  copied: boolean;
  onBack: () => void;
  onCopy: () => void;
  onRegenerate: () => void;
}) {
  return (
    <div className="space-y-3">
      <button
        onClick={onBack}
        className="flex items-center gap-1 text-[12px] text-white/50 hover:text-white/80"
      >
        <ChevronDownIcon className="rotate-90" /> {t(lang, 'analysisResult')}
      </button>

      {!result ? (
        <div className="mpc-card flex flex-col items-center p-7 text-center">
          <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-brand/12 text-brand">
            <SparkIcon className="h-5 w-5" />
          </div>
          <p className="text-[13px] leading-relaxed text-white/55">{t(lang, 'noResult')}</p>
          <Button variant="ghost" className="mt-4 px-4 py-2" onClick={onBack}>
            <RefreshIcon /> {t(lang, 'regenerate')}
          </Button>
        </div>
      ) : (
        <div className="rounded-card bg-[rgba(247,247,248,0.97)] p-3.5 shadow-float ring-1 ring-black/5">
          <ResultBody
            result={result}
            lang={lang}
            loading={loading}
            copied={copied}
            showReplace={false}
            actions={{ onCopy, onRegenerate, onReplace: undefined }}
          />
        </div>
      )}
    </div>
  );
}

function GenerateView({
  lang,
  config,
  onBack,
}: {
  lang: 'zh' | 'en';
  config: CustomApiConfig;
  onBack: () => void;
}) {
  const zh = lang === 'zh';
  const [prompt, setPrompt] = useState('');
  const [ref, setRef] = useState<string>('');
  const [mode, setMode] = useState<'single' | 'mix'>('single');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [images, setImages] = useState<string[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const configured = Boolean(config.baseUrl && config.apiKey);

  const pickFile = (f: File | undefined) => {
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => setRef(String(reader.result));
    reader.readAsDataURL(f);
  };

  const generate = () => {
    if (!prompt.trim()) {
      setError(zh ? '请先输入提示词。' : 'Enter a prompt first.');
      return;
    }
    setLoading(true);
    setError(null);
    setImages([]);
    const msg = ref
      ? { type: 'IMAGE_TO_IMAGE', prompt, refImage: ref, mode }
      : { type: 'TEXT_TO_IMAGE', prompt };
    chrome.runtime.sendMessage(msg, (r) => {
      setLoading(false);
      if (r?.ok && r.images) setImages(r.images);
      else setError(r?.error ?? (zh ? '生成失败' : 'Generation failed'));
    });
  };

  return (
    <div className="space-y-3">
      <button onClick={onBack} className="flex items-center gap-1 text-[12px] text-paper/50 hover:text-paper/80">
        <ChevronDownIcon className="rotate-90" /> {zh ? '生成图片' : 'Generate image'}
      </button>

      {!configured && (
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/[0.07] px-3 py-2 text-[12px] leading-relaxed text-amber-200/90">
          {zh ? '尚未配置网关，请先到设置中心填写 Key 与 Base URL。' : 'No gateway configured — set Key and Base URL in Settings first.'}
        </div>
      )}

      <textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        placeholder={zh ? '描述你想生成的画面…' : 'Describe the image to generate…'}
        rows={3}
        className="mpc-input h-auto resize-none py-3 leading-relaxed"
        spellCheck={false}
      />

      <div className="flex items-center gap-2">
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => pickFile(e.target.files?.[0])} />
        {ref ? (
          <div className="relative">
            <img src={ref} alt="ref" className="h-14 w-14 rounded-xl object-cover ring-1 ring-line-strong" />
            <button onClick={() => setRef('')} className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-black/80 text-white ring-1 ring-white/20" aria-label="remove">
              <CloseIcon className="h-3 w-3" />
            </button>
          </div>
        ) : (
          <Button variant="ghost" className="px-3 py-2.5 text-[13px]" onClick={() => fileRef.current?.click()}>
            <ImageIcon /> {zh ? '上传参考图' : 'Reference'}
          </Button>
        )}
        {ref && (
          <SegmentToggle<'single' | 'mix'>
            value={mode}
            onChange={setMode}
            options={[
              { value: 'single', label: zh ? '单张' : 'Single' },
              { value: 'mix', label: zh ? '混合4张' : 'Mix ×4' },
            ]}
          />
        )}
      </div>

      <Button variant="primary" className="h-[50px] w-full text-[15px]" onClick={generate} disabled={loading}>
        {loading ? <Spinner className="border-[#15161A]/30 border-t-[#15161A]" /> : <SparkIcon className="h-4 w-4" />}
        {loading ? (zh ? '生成中…' : 'Generating…') : ref ? (zh ? '参考图生成' : 'Generate from ref') : zh ? '生成图片' : 'Generate'}
      </Button>

      {loading && (
        <div className="flex flex-col items-center gap-3 py-8">
          <LoadingDots />
          <span className="text-[12px] text-paper/45">{zh ? '图片任务可能耗时较长…' : 'This can take a while…'}</span>
        </div>
      )}

      {error && (
        <div className="rounded-card bg-[rgba(247,247,248,0.97)] p-3 shadow-float ring-1 ring-black/5">
          <StateBlock tone="error" icon={<CloseIcon className="h-5 w-5" />} body={error} />
        </div>
      )}

      {images.length > 0 && (
        <div className="grid grid-cols-2 gap-2">
          {images.map((src, i) => (
            <div key={i} className="group relative overflow-hidden rounded-xl ring-1 ring-line-strong">
              <img src={src} alt={`result ${i + 1}`} className="aspect-square w-full object-cover" />
              <a
                href={src}
                download={`moon-promptcard-${Date.now()}-${i + 1}.png`}
                className="absolute bottom-1.5 right-1.5 flex h-7 w-7 items-center justify-center rounded-lg bg-black/70 text-white opacity-0 transition group-hover:opacity-100"
                aria-label={zh ? '下载' : 'Download'}
              >
                <DownloadIcon className="h-4 w-4" />
              </a>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mpc-eyebrow mb-1.5 block px-1">{label}</span>
      {children}
    </label>
  );
}
