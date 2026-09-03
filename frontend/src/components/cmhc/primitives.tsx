/**
 * Shared display primitives for the 4 CMHC underwriting sub-tabs. Uses this
 * app's page-level design tokens (card/input/text-muted/text-ink — see
 * index.css), matching AnalysisPage.tsx's convention, rather than
 * FinancingWorkbench's separate hardcoded-hex Swiss styling — this tool is a
 * sibling of AnalysisPage (a dedicated page), not a component embedded
 * inside PropertyPage.
 */
import clsx from 'clsx'
import { ShieldCheck, SlidersHorizontal } from 'lucide-react'
import type { ReactNode } from 'react'

export const fmt$ = (v: number | null | undefined, dec = 0): string => {
  if (v == null || Number.isNaN(v)) return '—'
  return new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: dec, minimumFractionDigits: dec }).format(v)
}
export const fmtPct = (v: number | null | undefined, dec = 2): string => {
  if (v == null || Number.isNaN(v)) return '—'
  return `${v.toFixed(dec)}%`
}
export const toNum = (s: string): number => parseFloat(s.replace(/[^0-9.\-]/g, '')) || 0
export const toNumOrNull = (s: string): number | null => (s.trim() === '' ? null : (parseFloat(s.replace(/[^0-9.\-]/g, '')) || 0))

export function SourceBadge({ kind, title }: { kind: 'listing' | 'input'; title: string }) {
  return kind === 'listing' ? (
    <span
      title={title}
      aria-label="From listing data"
      className="inline-flex shrink-0 items-center justify-center h-4 w-4 rounded-full bg-accent/10 text-accent"
    >
      <ShieldCheck size={11} strokeWidth={2.25} />
    </span>
  ) : (
    <span title={title} className="inline-flex shrink-0" aria-label="Broker input">
      <SlidersHorizontal size={12} strokeWidth={2} className="text-muted" />
    </span>
  )
}

export function Panel({ title, icon, aside, subtitle, children }: {
  title: string; icon?: ReactNode; aside?: ReactNode; subtitle?: ReactNode; children: ReactNode
}) {
  return (
    <section className="card !p-0 overflow-hidden transition-shadow duration-200 hover:shadow-card-hover">
      <div className="flex items-start justify-between gap-3 px-5 pt-4 pb-3 border-b border-surface-border bg-surface/40">
        <div>
          <h3 className="inline-flex items-center gap-2 text-sm font-bold text-ink">
            {icon && <span className="inline-flex items-center justify-center h-7 w-7 rounded-lg bg-accent/10 text-accent">{icon}</span>}
            {title}
          </h3>
          {subtitle && <p className="text-[11px] text-muted/80 mt-1.5 leading-snug max-w-prose">{subtitle}</p>}
        </div>
        {aside && <div className="shrink-0">{aside}</div>}
      </div>
      <div className="px-5 py-4 space-y-3">
        {children}
      </div>
    </section>
  )
}

export function Row({ label, value, bold, total, negative, indent, red, good, sub }: {
  label: ReactNode; value: string; bold?: boolean; total?: boolean; negative?: boolean; indent?: boolean; red?: boolean; good?: boolean; sub?: string
}) {
  const emphasize = bold || total
  return (
    <div
      className={clsx(
        'flex items-center justify-between gap-4',
        indent && 'pl-4',
        total
          ? 'mt-1 pt-2.5 pb-1 border-t-2 border-surface-border'
          : 'py-[7px] border-b border-surface-border last:border-b-0',
      )}
    >
      <span className={clsx('inline-flex items-center gap-1.5', total ? 'text-sm font-bold text-ink' : emphasize ? 'text-sm font-semibold text-ink' : 'text-sm text-muted')}>
        {label}
        {sub && <span className="text-[11px] text-muted/70 font-normal">{sub}</span>}
      </span>
      <span
        className={clsx(
          'font-mono tabular-nums whitespace-nowrap',
          total ? 'text-[15px] font-bold' : emphasize ? 'text-sm font-semibold' : 'text-sm',
          red ? 'text-score-notrecommended' : good ? 'text-score-strong' : 'text-ink',
        )}
      >
        {negative ? `(${value})` : value}
      </span>
    </div>
  )
}

export function NumField({ value, onChange, suffix, width = 'w-28', label, placeholder }: {
  value: string; onChange: (v: string) => void; suffix?: string; width?: string; label: string; placeholder?: string
}) {
  return (
    <span className={clsx('relative inline-block', width)}>
      <input
        type="text" inputMode="decimal" value={value} aria-label={label} placeholder={placeholder}
        onChange={e => onChange(e.target.value)}
        className={clsx('input py-1.5 text-right font-mono tabular-nums text-sm placeholder:font-sans placeholder:text-muted/50', suffix && 'pr-7')}
      />
      {suffix && <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-muted pointer-events-none">{suffix}</span>}
    </span>
  )
}

export function InputRow({ label, source, sourceTitle, sub, children }: {
  label: ReactNode; source?: 'listing' | 'input'; sourceTitle?: string; sub?: string; children: ReactNode
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-[7px] border-b border-surface-border last:border-b-0">
      <span className="inline-flex items-center gap-1.5 text-sm text-muted">
        {label}
        {source && <SourceBadge kind={source} title={sourceTitle ?? (source === 'listing' ? 'From listing data' : 'Broker input')} />}
        {sub && <span className="text-[11px] text-muted/60">{sub}</span>}
      </span>
      {children}
    </div>
  )
}

/**
 * Calculator-style field: label (and optional source badge / hint) stacked
 * ABOVE the input, the way the Desjardins/Centris calculators lay out — used
 * inside FieldGrid for the editable sections.
 */
export function Field({ label, sub, source, sourceTitle, children }: {
  label: ReactNode; sub?: string; source?: 'listing' | 'input'; sourceTitle?: string; children: ReactNode
}) {
  return (
    <label className="block">
      <span className="flex items-center gap-1.5 text-xs font-medium text-ink mb-1">
        {label}
        {source && <SourceBadge kind={source} title={sourceTitle ?? (source === 'listing' ? 'From listing data' : 'Broker input')} />}
        {sub && <span className="text-[10px] text-muted/70 font-normal normal-case">{sub}</span>}
      </span>
      {children}
    </label>
  )
}

/** Responsive 2-column grid of stacked Fields. */
export function FieldGrid({ children, cols = 2 }: { children: ReactNode; cols?: 1 | 2 | 3 }) {
  const colClass = cols === 1 ? 'sm:grid-cols-1' : cols === 3 ? 'sm:grid-cols-3' : 'sm:grid-cols-2'
  return <div className={clsx('grid grid-cols-1 gap-x-4 gap-y-3', colClass)}>{children}</div>
}

/**
 * Highlighted result box that closes each calculator section — the emphasised
 * "answer" line, like the grey result box at the bottom of the Centris
 * calculators. `tone` colours the figure for pass/fail.
 */
export function ResultBox({ label, value, sub, tone = 'default' }: {
  label: string; value: string; sub?: string; tone?: 'default' | 'good' | 'bad'
}) {
  const wrapClass =
    tone === 'good' ? 'from-score-strong/5 to-score-strong/10 border-score-strong/20'
      : tone === 'bad' ? 'from-score-notrecommended/5 to-score-notrecommended/10 border-score-notrecommended/20'
      : 'from-accent/5 to-accent/10 border-accent/15'
  const labelClass =
    tone === 'good' ? 'text-score-strong' : tone === 'bad' ? 'text-score-notrecommended' : 'text-accent'
  const valueClass =
    tone === 'good' ? 'text-score-strong' : tone === 'bad' ? 'text-score-notrecommended' : 'text-ink'
  return (
    <div className={clsx('mt-3 rounded-xl border bg-gradient-to-br px-4 py-3.5 flex items-center justify-between gap-4', wrapClass)}>
      <div>
        <p className={clsx('text-[11px] font-bold uppercase tracking-wider', labelClass)}>{label}</p>
        {sub && <p className="text-[10px] text-muted/70 mt-0.5 font-mono">{sub}</p>}
      </div>
      <p className={clsx('font-mono font-bold tabular-nums text-2xl whitespace-nowrap', valueClass)}>{value}</p>
    </div>
  )
}

/**
 * Headline KPI card. `tone` colors the value for pass/fail signalling
 * (good = green, bad = red, warn = amber); an explicit `valueClass` still wins.
 */
export function StatTile({ label, value, valueClass, tone = 'default', formula, hint }: {
  label: string; value: string; valueClass?: string; tone?: 'default' | 'good' | 'bad' | 'warn'; formula?: string; hint?: string
}) {
  const toneClass =
    valueClass ??
    (tone === 'good' ? 'text-score-strong'
      : tone === 'bad' ? 'text-score-notrecommended'
      : tone === 'warn' ? 'text-score-market'
      : 'text-ink')
  const barClass =
    tone === 'good' ? 'bg-score-strong'
      : tone === 'bad' ? 'bg-score-notrecommended'
      : tone === 'warn' ? 'bg-score-market'
      : 'bg-accent'
  return (
    <div className="relative bg-surface-card border border-surface-border rounded-xl pl-4 pr-3 py-3.5 overflow-hidden shadow-card">
      <span className={clsx('absolute left-0 top-0 bottom-0 w-1', barClass)} aria-hidden />
      <p className="text-[11px] font-semibold text-muted uppercase tracking-wider mb-1.5">{label}</p>
      <p className={clsx('font-mono font-bold tabular-nums text-2xl leading-none', toneClass)}>{value}</p>
      {formula && <p className="text-[10px] text-muted/60 mt-1.5 leading-snug">= {formula}</p>}
      {hint && !formula && <p className="text-[10px] text-muted/70 mt-1.5 leading-snug">{hint}</p>}
    </div>
  )
}
