import { useState } from 'react';
import type { AnalysisResult, Lang, Severity } from '@/lib/types';
import { t } from '@/lib/i18n';
import { Button, Spinner } from './ui';
import { CopyIcon, ReplaceIcon, RefreshIcon } from './icons';

// Tuned for the light glass surface — darker text keeps badges legible.
const SEV_COLOR: Record<Severity, string> = {
  high: 'bg-red-500/12 text-red-600 ring-red-500/25',
  medium: 'bg-amber-500/14 text-amber-700 ring-amber-500/25',
  low: 'bg-sky-500/12 text-sky-700 ring-sky-500/25',
};

function ScoreRing({ score }: { score: number }) {
  const r = 26;
  const c = 2 * Math.PI * r;
  const offset = c - (score / 100) * c;
  const hue = score >= 80 ? '#1bbf6b' : score >= 55 ? '#FF5A1F' : '#e23a5e';
  return (
    <div className="relative h-[68px] w-[68px] shrink-0">
      <svg viewBox="0 0 64 64" className="h-full w-full -rotate-90">
        <circle cx="32" cy="32" r={r} fill="none" stroke="rgba(0,0,0,0.08)" strokeWidth="6" />
        <circle
          cx="32"
          cy="32"
          r={r}
          fill="none"
          stroke={hue}
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 0.6s ease' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-[19px] font-bold leading-none tabular-nums text-neutral-900">
          {score}
        </span>
      </div>
    </div>
  );
}

export interface ResultCardActions {
  onCopy: () => void;
  onReplace?: () => void;
  onRegenerate: () => void;
}

export function ResultBody({
  result,
  lang,
  actions,
  loading,
  copied,
  replaced,
  showReplace = true,
}: {
  result: AnalysisResult;
  lang: Lang;
  actions: ResultCardActions;
  loading?: boolean;
  copied?: boolean;
  replaced?: boolean;
  showReplace?: boolean;
}) {
  const [tab, setTab] = useState<'opt' | 'detail'>('opt');
  const sevLabel = (s: Severity) =>
    s === 'high'
      ? t(lang, 'severityHigh')
      : s === 'medium'
        ? t(lang, 'severityMedium')
        : t(lang, 'severityLow');

  return (
    <div className="space-y-3">
      {/* score header */}
      <div className="flex items-center gap-3 rounded-2xl bg-black/[0.04] p-3 ring-1 ring-black/5">
        <ScoreRing score={result.score} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-neutral-800">{t(lang, 'score')}</span>
            <span className="rounded-md bg-brand/12 px-1.5 py-0.5 text-[11px] font-semibold text-brand-deep">
              {result.level}
            </span>
          </div>
          <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-neutral-600">
            {result.summary}
          </p>
        </div>
      </div>

      {/* tags */}
      {result.tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {result.tags.map((tg) => (
            <span
              key={tg}
              className="rounded-lg bg-black/[0.05] px-2 py-1 text-[11px] font-medium text-neutral-600"
            >
              {tg}
            </span>
          ))}
        </div>
      )}

      {/* tab switch */}
      <div className="flex gap-1 rounded-xl bg-black/[0.05] p-1 text-xs font-medium">
        <button
          onClick={() => setTab('opt')}
          className={`flex-1 rounded-lg py-1.5 transition ${
            tab === 'opt' ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-500'
          }`}
        >
          {t(lang, 'optimized')}
        </button>
        <button
          onClick={() => setTab('detail')}
          className={`flex-1 rounded-lg py-1.5 transition ${
            tab === 'detail' ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-500'
          }`}
        >
          {t(lang, 'diagnosis')}
        </button>
      </div>

      <div className="mpc-scroll max-h-[230px] space-y-3 overflow-y-auto pr-0.5">
        {tab === 'opt' ? (
          <>
            <div className="rounded-2xl bg-white/70 p-3 ring-1 ring-black/5">
              <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-neutral-800">
                {result.optimizedPrompt}
              </p>
            </div>
            {result.negativePrompt && (
              <div className="rounded-2xl bg-red-500/[0.06] p-3 ring-1 ring-red-500/10">
                <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-red-500/80">
                  {t(lang, 'negative')}
                </p>
                <p className="text-[12px] leading-relaxed text-neutral-600">
                  {result.negativePrompt}
                </p>
              </div>
            )}
          </>
        ) : (
          <>
            {result.issues.map((issue, i) => (
              <div key={i} className="rounded-2xl bg-white/70 p-3 ring-1 ring-black/5">
                <div className="mb-1 flex items-center justify-between gap-2">
                  <span className="text-[13px] font-semibold text-neutral-800">
                    {issue.title}
                  </span>
                  <span
                    className={`rounded-md px-1.5 py-0.5 text-[10px] font-semibold ring-1 ${SEV_COLOR[issue.severity]}`}
                  >
                    {sevLabel(issue.severity)}
                  </span>
                </div>
                <p className="text-[12px] leading-relaxed text-neutral-600">{issue.detail}</p>
              </div>
            ))}
            {result.suggestions.length > 0 && (
              <div className="rounded-2xl bg-brand/[0.06] p-3 ring-1 ring-brand/10">
                <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-brand-deep">
                  {t(lang, 'suggestions')}
                </p>
                <ul className="space-y-1">
                  {result.suggestions.map((s, i) => (
                    <li key={i} className="flex gap-1.5 text-[12px] leading-relaxed text-neutral-700">
                      <span className="mt-[2px] text-brand">•</span>
                      <span>{s}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </div>

      {/* actions */}
      <div className="flex gap-2 pt-1">
        <Button
          variant="ember"
          className="flex-1 py-2.5"
          onClick={actions.onCopy}
          style={{ borderRadius: 14 }}
        >
          <CopyIcon /> {copied ? t(lang, 'copied') : t(lang, 'copy')}
        </Button>
        {showReplace && actions.onReplace && (
          <Button
            variant="ghost"
            className="flex-1 border-black/10 bg-black/[0.04] py-2.5 text-neutral-700 hover:bg-black/[0.07]"
            onClick={actions.onReplace}
            style={{ borderRadius: 14 }}
          >
            <ReplaceIcon /> {replaced ? t(lang, 'replaced') : t(lang, 'replace')}
          </Button>
        )}
        <Button
          variant="ghost"
          className="border-black/10 bg-black/[0.04] px-3 py-2.5 text-neutral-700 hover:bg-black/[0.07]"
          onClick={actions.onRegenerate}
          disabled={loading}
          style={{ borderRadius: 14 }}
        >
          {loading ? <Spinner className="border-neutral-400/40 border-t-neutral-600" /> : <RefreshIcon />}
        </Button>
      </div>
    </div>
  );
}
