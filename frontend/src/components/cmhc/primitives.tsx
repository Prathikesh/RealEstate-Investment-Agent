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
    <span title={title} className="inline-flex shrink-0" aria-label="From listing data">
      <ShieldCheck size={12} strokeWidth={2} className="text-accent" />
    </span>
  ) : (
    <span title={title} className="inline-flex shrink-0" aria-label="Broker input">
      <SlidersHorizontal size={12} strokeWidth={2} className="text-muted" />
    </span>
  )
}

export function Panel({ title, icon, aside, children }: { title: string; icon?: ReactNode; aside?: ReactNode; children: ReactNode }) {
  return (
    <div className="card space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h3 className="inline-flex items-center gap-2 text-xs font-bold text-muted uppercase tracking-widest">
          {icon}{title}
        </h3>
        {aside}
      </div>
      {children}
    </div>
  )
}

export function Row({ label, value, bold, negative, indent, red, sub }: {
  label: ReactNode; value: string; bold?: boolean; negative?: boolean; indent?: boolean; red?: boolean; sub?: string
}) {
  return (
    <div className={clsx('flex items-center justify-between gap-4 py-[7px] border-b border-surface-border last:border-b-0', indent && 'pl-4')}>
      <span className={clsx('inline-flex items-center gap-1.5 text-sm', bold ? 'font-semibold text-ink' : 'text-muted')}>
        {label}
        {sub && <span className="text-[11px] text-muted/70 font-mono">{sub}</span>}
      </span>
      <span className={clsx('font-mono tabular-nums text-sm whitespace-nowrap', bold && 'font-semibold', red ? 'text-score-notrecommended' : 'text-ink')}>
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
        className={clsx('input py-1.5 text-right font-mono tabular-nums text-sm', suffix && 'pr-7')}
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

export function StatTile({ label, value, valueClass, formula }: { label: string; value: string; valueClass?: string; formula?: string }) {
  return (
    <div className="bg-surface rounded-lg px-3 py-3">
      <p className="text-xs text-muted mb-1">{label}</p>
      <p className={clsx('font-mono font-bold tabular-nums text-lg', valueClass ?? 'text-ink')}>{value}</p>
      {formula && <p className="text-[10px] text-muted/60 mt-1 leading-snug">= {formula}</p>}
    </div>
  )
}
