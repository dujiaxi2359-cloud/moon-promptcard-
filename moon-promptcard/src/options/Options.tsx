import { useEffect, useState } from 'react';
import type { CustomApiConfig, Lang, Settings, Theme } from '@/lib/types';
import { clearBuiltinAuth, getSettings, saveSettings } from '@/lib/storage';
import { t } from '@/lib/i18n';
import { Button, Spinner } from '@/components/ui';
import { ChevronLeftIcon, EyeIcon, EyeOffIcon, MoonIcon, RefreshIcon } from '@/components/icons';

const GATEWAYS: { label: string; baseUrl: string }[] = [
  { label: '千问 DashScope', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1' },
  { label: 'AI充电站 (aidraw365)', baseUrl: 'https://aidraw365.com/v1' },
  { label: '自定义', baseUrl: '' },
];

const SIZES = ['1024x1024', '1024x1536', '1536x1024', '768x1024', '1024x768', '512x512'];
const COUNTS = [1, 2, 4];

export function Options() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [draft, setDraft] = useState<CustomApiConfig | null>(null);
  const [saved, setSaved] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [busy, setBusy] = useState<'text' | 'image' | 'models' | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [models, setModels] = useState<string[]>([]);

  useEffect(() => {
    getSettings().then((s) => {
      setSettings(s);
      setDraft(s.customApi);
    });
  }, []);

  if (!settings || !draft) return <div className="min-h-screen bg-ink" />;
  const lang = settings.lang;
  const zh = lang === 'zh';
  const configured = Boolean(draft.baseUrl && draft.apiKey);

  const setField = (patch: Partial<CustomApiConfig>) => setDraft({ ...draft, ...patch });

  const showToast = (m: string) => {
    setToast(m);
    setTimeout(() => setToast(null), 2200);
  };

  const updatePref = async (patch: Partial<Settings>) => {
    const next = await saveSettings(patch);
    setSettings(next);
  };

  const saveAll = async () => {
    const next = await saveSettings({ customApi: draft });
    setSettings(next);
    setSaved(true);
    setTimeout(() => setSaved(false), 1400);
  };

  const test = (kind: 'text' | 'image') => {
    setBusy(kind);
    const type = kind === 'text' ? 'TEST_CUSTOM_API' : 'TEST_IMAGE_API';
    chrome.runtime.sendMessage({ type, config: draft }, (r) => {
      setBusy(null);
      showToast(r?.message ?? (zh ? '测试失败' : 'Test failed'));
    });
  };

  const refreshModels = () => {
    setBusy('models');
    chrome.runtime.sendMessage({ type: 'LIST_MODELS', config: draft }, (r) => {
      setBusy(null);
      if (r?.ok) {
        setModels(r.models ?? []);
        showToast(zh ? `已获取 ${r.models?.length ?? 0} 个模型` : `Got ${r.models?.length ?? 0} models`);
      } else {
        showToast(r?.error ?? (zh ? '获取失败' : 'Failed'));
      }
    });
  };

  return (
    <div className="relative min-h-screen bg-ink font-sans text-paper">
      <div className="mpc-aura" style={{ top: 0, left: '50%', width: 560, height: 280, marginLeft: -280 }} />
      <div className="relative mx-auto max-w-[640px] px-5 py-9">
        <Header lang={lang} saved={saved} configured={configured} zh={zh} onBack={() => window.close()} />

        <DataList id="mpc-models" options={models} />

        {/* 模型网关 */}
        <Section title={zh ? '当前模型网关' : 'Gateway'} desc={zh ? '选择网关并填入 Key 与 Base URL。' : 'Pick a gateway, fill Key and Base URL.'}>
          <Field label={zh ? '网关' : 'Gateway'}>
            <select
              value={GATEWAYS.find((g) => g.baseUrl === draft.baseUrl)?.label ?? '自定义'}
              onChange={(e) => {
                const g = GATEWAYS.find((x) => x.label === e.target.value);
                if (g && g.baseUrl) setField({ baseUrl: g.baseUrl });
              }}
              className="mpc-select"
            >
              {GATEWAYS.map((g) => (
                <option key={g.label} value={g.label} className="bg-card text-paper">{g.label}</option>
              ))}
            </select>
          </Field>
          <Field label="Base URL">
            <input
              value={draft.baseUrl}
              onChange={(e) => setField({ baseUrl: e.target.value })}
              placeholder="https://aidraw365.com/v1"
              className="mpc-input" spellCheck={false} autoComplete="off"
            />
          </Field>
          <Field label="API Key">
            <div className="relative">
              <input
                value={draft.apiKey}
                onChange={(e) => setField({ apiKey: e.target.value })}
                type={showKey ? 'text' : 'password'}
                placeholder="sk-..."
                className="mpc-input pr-10" spellCheck={false} autoComplete="off"
              />
              <button onClick={() => setShowKey((v) => !v)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-paper/40 hover:text-paper/70" aria-label={showKey ? 'hide' : 'show'}>
                {showKey ? <EyeOffIcon /> : <EyeIcon />}
              </button>
            </div>
          </Field>
        </Section>

        {/* 文本 / 提示词模型 */}
        <Section title={zh ? '文本 / 提示词模型' : 'Text / prompt model'} desc={zh ? '走 /chat/completions，用于提示词分析与图片转提示词（读图）。' : 'Uses /chat/completions for analysis and image→prompt.'}>
          <Field label={zh ? 'Chat 模型' : 'Chat model'}>
            <input list="mpc-models" value={draft.model} onChange={(e) => setField({ model: e.target.value })} placeholder="qwen-vl-plus" className="mpc-input" spellCheck={false} />
          </Field>
        </Section>

        {/* 图片模型 */}
        <Section title={zh ? '图片模型' : 'Image models'} desc={zh ? '文生图走 /images/generations，图生图走 /images/edits。' : 'Text-to-image and image-to-image endpoints.'}>
          <Field label={zh ? '文生图模型' : 'Text-to-image'}>
            <input list="mpc-models" value={draft.imageModel} onChange={(e) => setField({ imageModel: e.target.value })} placeholder="gpt-image-2" className="mpc-input" spellCheck={false} />
          </Field>
          <Field label={zh ? '图生图模型' : 'Image-to-image'}>
            <input list="mpc-models" value={draft.editModel} onChange={(e) => setField({ editModel: e.target.value })} placeholder="nanobanana-2" className="mpc-input" spellCheck={false} />
          </Field>
        </Section>

        {/* 生成参数 */}
        <Section title={zh ? '生成参数' : 'Generation'} desc={zh ? '默认输出尺寸与一次生成张数。' : 'Default output size and image count.'}>
          <div className="grid grid-cols-2 gap-3">
            <Field label={zh ? '默认图片尺寸' : 'Default size'}>
              <select value={draft.imageSize} onChange={(e) => setField({ imageSize: e.target.value })} className="mpc-select">
                {SIZES.map((s) => <option key={s} value={s} className="bg-card text-paper">{s}</option>)}
              </select>
            </Field>
            <Field label={zh ? '默认生成数量' : 'Default count'}>
              <select value={String(draft.imageCount)} onChange={(e) => setField({ imageCount: Number(e.target.value) })} className="mpc-select">
                {COUNTS.map((c) => <option key={c} value={c} className="bg-card text-paper">{zh ? `${c} 张` : `${c}`}</option>)}
              </select>
            </Field>
          </div>
        </Section>

        {/* 操作 */}
        <div className="mt-4 flex flex-wrap gap-2">
          <Button variant="primary" className="px-5 py-2.5" onClick={saveAll}>{zh ? '保存全部配置' : 'Save all'}</Button>
          <Button variant="ghost" className="px-4 py-2.5" onClick={refreshModels} disabled={busy === 'models'}>
            {busy === 'models' ? <Spinner /> : <RefreshIcon />} {zh ? '刷新模型列表' : 'Refresh models'}
          </Button>
          <Button variant="ghost" className="px-4 py-2.5" onClick={() => test('text')} disabled={busy === 'text'}>
            {busy === 'text' ? <Spinner /> : null} {zh ? '测试文本模型' : 'Test text'}
          </Button>
          <Button variant="ghost" className="px-4 py-2.5" onClick={() => test('image')} disabled={busy === 'image'}>
            {busy === 'image' ? <Spinner /> : null} {zh ? '测试文生图' : 'Test image'}
          </Button>
        </div>

        <p className="mt-3 px-1 text-[11px] leading-relaxed text-paper/35">
          {zh ? 'API Key 仅保存在本地浏览器（chrome.storage.local），只发往你填写的网关，绝不上传到我们的服务器。' : 'Your API key is stored locally and only sent to your configured gateway, never to us.'}
        </p>

        {/* 偏好 */}
        <div className="mpc-card mt-6 divide-y divide-white/[0.06] px-4">
          <Row title={zh ? '界面和提示词语言' : 'Language'}>
            <Select<Lang> value={lang} onChange={(v) => updatePref({ lang: v })} options={[{ value: 'zh', label: '中文' }, { value: 'en', label: 'English' }]} />
          </Row>
          <Row title={t(lang, 'theme')}>
            <Select<Theme> value={settings.theme} onChange={(v) => updatePref({ theme: v })} options={[{ value: 'dark', label: t(lang, 'themeDark') }, { value: 'light', label: t(lang, 'themeLight') }, { value: 'system', label: t(lang, 'themeSystem') }]} />
          </Row>
          <Row title={t(lang, 'floatingSwitch')}>
            <Switch checked={settings.floatingEnabled} onChange={(v) => updatePref({ floatingEnabled: v })} />
          </Row>
        </div>

        <div className="mt-6">
          <Button variant="ghost" className="w-full border-red-500/20 bg-red-500/[0.06] py-3 text-red-300 hover:border-red-500/35 hover:bg-red-500/[0.1]" onClick={async () => { await clearBuiltinAuth(); setSettings(await getSettings()); }}>
            {t(lang, 'logout')}
          </Button>
        </div>

        <p className="mt-7 text-center text-[11px] tracking-wide text-paper/30">Moon PromptCard · V1.3.0</p>
      </div>

      {toast && (
        <div className="pointer-events-none fixed bottom-6 left-1/2 -translate-x-1/2 rounded-xl bg-black/85 px-3.5 py-2 text-xs text-white shadow-float ring-1 ring-white/10">
          {toast}
        </div>
      )}
    </div>
  );
}

function Header({ lang, saved, configured, zh, onBack }: { lang: Lang; saved: boolean; configured: boolean; zh: boolean; onBack: () => void }) {
  return (
    <div className="mb-7 flex items-center gap-3">
      <button onClick={onBack} className="flex h-9 w-9 items-center justify-center rounded-xl border border-line bg-white/[0.04] text-paper/70 transition hover:border-line-strong hover:bg-white/[0.08] active:scale-95" aria-label={t(lang, 'back')}>
        <ChevronLeftIcon />
      </button>
      <div className="flex items-center gap-2.5">
        <div className="relative flex h-9 w-9 items-center justify-center rounded-xl border border-line-strong bg-card text-paper shadow-card">
          <MoonIcon className="h-[18px] w-[18px]" />
          <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-brand shadow-[0_0_8px_rgba(255,90,31,0.8)]" />
        </div>
        <div className="leading-tight">
          <h1 className="text-[17px] font-semibold tracking-tight">{zh ? '设置中心' : 'Settings'}</h1>
          <span className="mpc-eyebrow">Moon PromptCard</span>
        </div>
      </div>
      <span className={`ml-auto flex items-center gap-1.5 rounded-lg px-2 py-1 text-[11px] font-medium ${configured ? 'bg-emerald-500/15 text-emerald-300' : 'bg-white/[0.06] text-paper/45'}`}>
        <span className={`h-1.5 w-1.5 rounded-full ${configured ? 'bg-emerald-400' : 'bg-red-400'}`} />
        {saved ? (zh ? '已保存' : 'Saved') : configured ? (zh ? '已配置' : 'Ready') : zh ? '未配置' : 'Not set'}
      </span>
    </div>
  );
}

function Section({ title, desc, children }: { title: string; desc?: string; children: React.ReactNode }) {
  return (
    <div className="mpc-card mt-4 p-4">
      <h2 className="text-[15px] font-semibold">{title}</h2>
      {desc && <p className="mt-1 text-[12px] leading-relaxed text-paper/45">{desc}</p>}
      <div className="mt-3 space-y-3">{children}</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mpc-eyebrow mb-1.5 block px-0.5">{label}</span>
      {children}
    </label>
  );
}

function DataList({ id, options }: { id: string; options: string[] }) {
  return <datalist id={id}>{options.map((o) => <option key={o} value={o} />)}</datalist>;
}

function Row({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-3.5">
      <span className="text-[14px] text-paper/85">{title}</span>
      {children}
    </div>
  );
}

function Select<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value as T)} className="mpc-select h-10 w-auto">
      {options.map((o) => <option key={o.value} value={o.value} className="bg-card text-paper">{o.label}</option>)}
    </select>
  );
}

function Switch({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button role="switch" aria-checked={checked} onClick={() => onChange(!checked)} className={`relative h-7 w-12 rounded-full transition-colors ${checked ? 'bg-brand shadow-[0_2px_10px_-2px_rgba(255,90,31,0.6),inset_0_1px_0_rgba(255,255,255,0.3)]' : 'bg-white/15'}`}>
      <span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow-[0_1px_3px_rgba(0,0,0,0.4)] transition-all duration-200 ${checked ? 'left-6' : 'left-1'}`} />
    </button>
  );
}
