import type { ButtonHTMLAttributes, ReactNode } from 'react';

export function Spinner({ className = '' }: { className?: string }) {
  return (
    <span
      className={`mpc-spin inline-block h-4 w-4 rounded-full border-2 border-white/30 border-t-white ${className}`}
      aria-hidden
    />
  );
}

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'ember' | 'ghost' | 'soft';
  children: ReactNode;
};

export function Button({ variant = 'soft', className = '', children, ...rest }: BtnProps) {
  const base =
    'mpc-glow-btn inline-flex items-center justify-center gap-2 rounded-2xl text-sm font-medium transition active:scale-[0.98] disabled:opacity-50 disabled:active:scale-100';
  const styles: Record<string, string> = {
    // Eclipse: the primary action is ivory, not ember — restraint is the look.
    primary:
      'bg-paper text-[#15161A] shadow-btn hover:brightness-[1.04] active:brightness-95',
    // Ember accent button — reserved for the single page-level action.
    ember:
      'bg-gradient-to-b from-brand-bright to-brand-deep text-white shadow-ember hover:brightness-[1.07] active:brightness-95',
    ghost:
      'border border-line bg-paper/[0.03] text-paper/90 hover:border-line-strong hover:bg-paper/[0.07]',
    soft: 'bg-paper/[0.06] text-paper/90 hover:bg-paper/[0.1]',
  };
  return (
    <button
      className={`${base} ${styles[variant]} ${className}`}
      onMouseMove={(e) => {
        const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
        e.currentTarget.style.setProperty('--mx', `${e.clientX - r.left}px`);
        e.currentTarget.style.setProperty('--my', `${e.clientY - r.top}px`);
      }}
      {...rest}
    >
      {children}
    </button>
  );
}

export function IconButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick?: () => void;
  children: ReactNode;
}) {
  return (
    <button
      aria-label={label}
      title={label}
      onClick={onClick}
      className="flex h-8 w-8 items-center justify-center rounded-xl border border-line bg-paper/[0.04] text-paper/70 transition hover:border-line-strong hover:bg-paper/[0.09] hover:text-paper active:scale-95"
    >
      {children}
    </button>
  );
}

export function SegmentToggle<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string; badge?: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex gap-1 rounded-2xl border border-line bg-surface p-1">
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            onClick={() => onChange(opt.value)}
            className={`relative flex-1 rounded-xl px-3 py-2.5 text-sm font-medium transition-all ${
              active
                ? 'bg-gradient-to-b from-paper/[0.13] to-paper/[0.05] text-paper shadow-[inset_0_0_0_1px_rgba(234,230,221,0.12),0_1px_2px_rgba(0,0,0,0.3)]'
                : 'text-paper/50 hover:text-paper/80'
            }`}
          >
            {opt.label}
            {opt.badge && active && (
              <span className="ml-1.5 rounded-md bg-brand px-1.5 py-0.5 text-[10px] font-semibold text-white shadow-[0_2px_8px_-2px_rgba(255,90,31,0.6)]">
                {opt.badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Three small dots that breathe — a calmer "working" signal than a spinner on
 * the light glass card. Used for the analysis loading state.
 */
export function LoadingDots({ className = '' }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`} aria-hidden>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="h-2 w-2 rounded-full bg-brand"
          style={{ animation: `mpc-breathe 1.1s ease-in-out ${i * 0.16}s infinite` }}
        />
      ))}
    </span>
  );
}

/**
 * Shared dark-surface state block. `tone` swaps the accent: neutral for empty,
 * red for error. Keeps every empty / error moment visually identical.
 */
export function StateBlock({
  icon,
  title,
  body,
  tone = 'neutral',
  action,
}: {
  icon?: ReactNode;
  title?: string;
  body: string;
  tone?: 'neutral' | 'error';
  action?: ReactNode;
}) {
  const ring =
    tone === 'error' ? 'ring-red-500/15 bg-red-500/[0.04]' : 'ring-black/5 bg-white/70';
  const iconWrap =
    tone === 'error' ? 'bg-red-500/12 text-red-500' : 'bg-brand/12 text-brand';
  return (
    <div className={`rounded-2xl p-5 text-center ring-1 ${ring}`}>
      {icon && (
        <div
          className={`mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-xl ${iconWrap}`}
        >
          {icon}
        </div>
      )}
      {title && <p className="mb-1 text-[13px] font-semibold text-neutral-800">{title}</p>}
      <p className="text-[12.5px] leading-relaxed text-neutral-600">{body}</p>
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}
