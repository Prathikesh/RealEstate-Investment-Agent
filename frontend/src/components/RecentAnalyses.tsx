import type { MouseEvent } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { MapPin, ArrowRight, Building2, CalendarClock, Trash2 } from 'lucide-react'
import { useLang } from '../context/LanguageContext'
import { getRecentAnalyses, deleteAnalysis, type RecentAnalysis } from '../lib/lookup'

function fmtCAD(v: number | null | undefined, compact = false): string {
  if (v == null) return '—'
  return new Intl.NumberFormat('en-CA', {
    style: 'currency', currency: 'CAD', maximumFractionDigits: 0,
    notation: compact ? 'compact' : 'standard',
  }).format(v)
}

const TYPE_LABELS: Record<string, string> = {
  single_family: 'Single family', condo: 'Condo', duplex: 'Duplex', triplex: 'Triplex',
  quadruplex: 'Quadruplex', quintuplex_plus: '5+ plex', townhouse: 'Townhouse',
}
function typeLabel(pt: string | null | undefined): string | null {
  if (!pt) return null
  return TYPE_LABELS[pt] ?? pt.replace(/_/g, ' ')
}

function scoreColor(s: number): string {
  return s >= 80 ? '#16a34a' : s >= 60 ? '#d97706' : '#dc2626'
}

function ScoreGauge({ score }: { score: number | null | undefined }) {
  const s = Math.max(0, Math.min(100, score ?? 0))
  const r = 26
  const len = Math.PI * r
  const filled = (s / 100) * len
  const color = score == null ? '#94a3b8' : scoreColor(s)
  return (
    <div className="flex flex-col items-center leading-none">
      <svg width="60" height="34" viewBox="0 0 64 38" className="overflow-visible">
        <path d="M6 34 A26 26 0 0 1 58 34" fill="none" className="text-surface-border" stroke="currentColor" strokeWidth="6" strokeLinecap="round" />
        <path d="M6 34 A26 26 0 0 1 58 34" fill="none" stroke={color} strokeWidth="6" strokeLinecap="round" strokeDasharray={`${filled} ${len}`} />
      </svg>
      <span className="text-sm font-extrabold -mt-1.5 tabular-nums" style={{ color }}>{score ?? '—'}</span>
    </div>
  )
}

export default function RecentAnalyses() {
  const { t } = useLang()
  const { data, isLoading } = useQuery({
    queryKey: ['recent-analyses'],
    queryFn: getRecentAnalyses,
    staleTime: 15_000,
  })

  if (!isLoading && (!data || data.length === 0)) return null

  return (
    <div className="space-y-3 animate-slide-up">
      <div className="flex items-center gap-2">
        <span className="grid place-items-center w-7 h-7 rounded-lg bg-accent/10 text-accent">
          <CalendarClock size={15} />
        </span>
        <div>
          <h2 className="font-bold text-ink text-base leading-tight">{t('recent_title')}</h2>
          <p className="text-xs text-muted">{t('recent_subtitle')}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {isLoading
          ? Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-64 rounded-2xl shimmer" />)
          : data!.slice(0, 4).map(a => <AnalysisCard key={a.id} a={a} t={t} />)}
      </div>
    </div>
  )
}

function AnalysisCard({ a, t }: { a: RecentAnalysis; t: (k: any) => string }) {
  const queryClient = useQueryClient()
  const cashPos = (a.monthly_cash_flow ?? 0) >= 0
  const dateStr = a.analyzed_at
    ? new Date(a.analyzed_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
    : ''
  const ptLabel = typeLabel(a.property_type)

  async function onDelete(e: MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    await deleteAnalysis(a.id)
    queryClient.invalidateQueries({ queryKey: ['recent-analyses'] })
  }

  return (
    <div className="group relative rounded-2xl border border-surface-border bg-surface-card shadow-card p-4 transition-all hover:shadow-card-hover">
      {/* Delete (hover) */}
      <button
        onClick={onDelete}
        title={t('recent_delete')}
        className="absolute top-3 right-3 grid place-items-center w-7 h-7 rounded-full text-muted opacity-0 group-hover:opacity-100
                   hover:bg-score-market/10 hover:text-score-market transition-all"
      >
        <Trash2 size={14} />
      </button>

      {/* Header */}
      <p className="text-[10px] font-bold uppercase tracking-wider text-muted pr-8">
        {t('recent_analyzedOn')} · {dateStr}
      </p>
      <div className="mt-1 flex items-start gap-3">
        <div className="w-11 h-11 rounded-xl overflow-hidden bg-surface-hover border border-surface-border shrink-0 grid place-items-center">
          {a.photo
            ? <img src={a.photo} alt="" className="w-full h-full object-cover" loading="lazy" />
            : <Building2 size={16} className="text-muted" />}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-ink truncate leading-snug">{a.full_address}</p>
          <div className="mt-0.5 flex items-center gap-1.5 flex-wrap">
            <span className="text-[11px] text-muted inline-flex items-center gap-1 truncate">
              <MapPin size={10} className="shrink-0" /> {a.city ?? '—'}
            </span>
            {ptLabel && (
              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-accent/10 text-accent">{ptLabel}</span>
            )}
          </div>
        </div>
      </div>

      {/* Stats box */}
      <div className="mt-3 rounded-xl border border-surface-border overflow-hidden">
        <div className="grid grid-cols-3 divide-x divide-surface-border">
          <div className="px-3 py-2.5 text-center">
            <p className="text-[9px] font-bold uppercase tracking-wider text-muted">{t('recent_capRate')}</p>
            <p className={`text-base font-extrabold tabular-nums ${a.cap_rate != null && a.cap_rate >= 5 ? 'text-score-strong' : 'text-ink'}`}>
              {a.cap_rate != null ? `${a.cap_rate.toFixed(1)}%` : '—'}
            </p>
          </div>
          <div className="px-3 py-2.5 text-center">
            <p className="text-[9px] font-bold uppercase tracking-wider text-muted">{t('recent_price')}</p>
            <p className="text-base font-extrabold tabular-nums text-ink">{fmtCAD(a.asking_price, true)}</p>
          </div>
          <div className="px-2 py-2 grid place-items-center">
            <p className="text-[9px] font-bold uppercase tracking-wider text-muted mb-0.5">{t('recent_score')}</p>
            <ScoreGauge score={a.score} />
          </div>
        </div>
      </div>

      {/* Cashflow box */}
      <div className="mt-2 rounded-xl bg-surface-hover/60 px-3 py-2.5 flex items-center justify-between">
        <div>
          <p className="text-[9px] font-bold uppercase tracking-wider text-muted">{t('recent_cashflow')}</p>
          <p className={`text-lg font-extrabold tabular-nums ${cashPos ? 'text-score-strong' : 'text-score-market'}`}>
            {a.monthly_cash_flow != null ? `${cashPos ? '+' : ''}${fmtCAD(a.monthly_cash_flow)}` : '—'}
            <span className="text-[10px] font-medium text-muted"> {a.monthly_cash_flow != null ? t('recent_perMo') : ''}</span>
          </p>
        </div>
        {a.monthly_cash_flow != null && (
          <span className={`text-[10px] font-bold px-2 py-1 rounded-full ${cashPos ? 'bg-score-strong/10 text-score-strong' : 'bg-score-market/10 text-score-market'}`}>
            {cashPos ? t('recent_positive') : t('recent_negative')}
          </span>
        )}
      </div>

      {/* Footer link */}
      <Link
        to={`/properties/${a.id}`}
        className="mt-3 flex items-center justify-end gap-1 text-xs font-bold text-accent hover:gap-2 transition-all"
      >
        {t('recent_viewReport')} <ArrowRight size={13} />
      </Link>
    </div>
  )
}
