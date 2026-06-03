import { Link } from 'react-router-dom'
import { Building2, ArrowRight } from 'lucide-react'
import clsx from 'clsx'
import ScoreBadge, { ScoreDot } from './ScoreBadge'
import { useLang } from '../context/LanguageContext'
import type { PropertyCard } from '../api'

// ── Formatting helpers ────────────────────────────────────────────────────────

function fmtCAD(v: number | null | undefined): string {
  if (v == null) return '—'
  return new Intl.NumberFormat('en-CA', {
    style: 'currency', currency: 'CAD', maximumFractionDigits: 0,
  }).format(v)
}

// ── Photo / placeholder ───────────────────────────────────────────────────────

function PropertyPhoto({ photos, address }: { photos: string[]; address: string }) {
  if (photos.length > 0) {
    return (
      <img
        src={photos[0]}
        alt={address}
        className="w-full h-full object-cover"
        onError={e => {
          const el = e.currentTarget
          el.style.display = 'none'
          el.nextElementSibling?.classList.remove('hidden')
        }}
      />
    )
  }
  return null
}

function PhotoPlaceholder({ type }: { type: string }) {
  return (
    <div className="w-full h-full flex flex-col items-center justify-center gap-2 select-none">
      <Building2 size={28} className="text-surface-border" />
      <span className="text-xs text-surface-border capitalize">{type.replace(/_/g, ' ')}</span>
    </div>
  )
}

// ── Metric mini-card ──────────────────────────────────────────────────────────

function MiniCard({
  label, value, valueClass,
}: {
  label: string
  value: string
  valueClass?: string
}) {
  return (
    <div className="bg-surface rounded-lg px-2.5 py-2 text-center">
      <p className={clsx('text-xs font-mono font-semibold tabular-nums leading-tight', valueClass ?? 'text-slate-300')}>
        {value}
      </p>
      <p className="text-[10px] text-muted mt-0.5 leading-tight">{label}</p>
    </div>
  )
}

// ── Main card ─────────────────────────────────────────────────────────────────

interface Props {
  property: PropertyCard
  className?: string
}

export default function PropertyCardGrid({ property: p, className }: Props) {
  const { t, lang } = useLang()

  const discountClass =
    p.discount_pct != null && p.discount_pct > 5  ? 'text-score-strong' :
    p.discount_pct != null && p.discount_pct < -2 ? 'text-score-notrecommended' :
    'text-slate-300'

  const capRateClass =
    p.cap_rate == null           ? 'text-slate-300' :
    p.cap_rate >= 5              ? 'text-score-strong' :
    p.cap_rate >= 3              ? 'text-slate-300'    :
    'text-score-market'

  const categoryLabels: Record<string, string> = {
    strong_opportunity:  t('strongOpportunity'),
    worth_investigating: t('worthInvestigating'),
    market_price:        t('marketPrice'),
    not_recommended:     t('notRecommended'),
  }

  const sources = (p.active_sources ?? [p.primary_source]).filter(Boolean) as string[]

  const typeLabel = p.property_type
    .split('_')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')

  return (
    <Link
      to={`/properties/${p.id}`}
      className={clsx(
        'group block bg-surface-card border border-surface-border rounded-xl overflow-hidden',
        'hover:border-accent/40 hover:shadow-lg hover:shadow-accent/5 transition-all duration-200',
        className,
      )}
    >
      {/* ── Photo ────────────────────────────────────────────────────────── */}
      <div className="relative aspect-video bg-surface-hover overflow-hidden">
        <PropertyPhoto photos={p.photos ?? []} address={p.full_address} />
        <div className="hidden w-full h-full flex-col items-center justify-center gap-2">
          <PhotoPlaceholder type={p.property_type} />
        </div>

        {/* Gradient overlay for text readability */}
        <div className="absolute inset-0 bg-gradient-to-t from-surface-card/60 via-transparent to-transparent pointer-events-none" />

        {/* Score badge — top right */}
        <div className="absolute top-3 right-3">
          <ScoreBadge score={p.score} category={p.score_category} size="card" />
        </div>

        {/* Badges — top left */}
        <div className="absolute top-3 left-3 flex gap-1.5">
          {p.is_new && (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-accent text-white tracking-wide">
              {t('newBadge')}
            </span>
          )}
          {p.status === 'price_changed' && (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-score-strong/90 text-[#0F1117] tracking-wide">
              ↓ {t('priceDrop')}
            </span>
          )}
        </div>
      </div>

      {/* ── Content ──────────────────────────────────────────────────────── */}
      <div className="p-4 space-y-3">

        {/* Type + neighborhood */}
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs text-muted truncate">
            <span className="text-slate-400 font-medium capitalize">{typeLabel}</span>
            {p.neighborhood && (
              <span className="text-muted"> · {p.neighborhood}</span>
            )}
          </p>
        </div>

        {/* Address + price */}
        <div>
          <p className="text-sm text-slate-200 font-medium leading-snug truncate group-hover:text-white transition-colors">
            {p.full_address}
          </p>
          <p className="text-xl font-bold font-mono text-white mt-1 tabular-nums">
            {fmtCAD(p.asking_price)}
          </p>
        </div>

        {/* Specs row */}
        <div className="flex items-center gap-2.5 text-xs text-muted flex-wrap">
          {p.unit_count && <span>{p.unit_count} {t('units')}</span>}
          {p.unit_count && p.sqft_total && <span className="text-surface-border">•</span>}
          {p.sqft_total && (
            <span>{p.sqft_total.toLocaleString(lang === 'fr' ? 'fr-CA' : 'en-CA')} {t('sqft')}</span>
          )}
          {p.year_built && (
            <>
              <span className="text-surface-border">•</span>
              <span>{t('built')} {p.year_built}</span>
            </>
          )}
          {p.days_on_market != null && (
            <>
              <span className="text-surface-border">•</span>
              <span>{p.days_on_market}j</span>
            </>
          )}
        </div>

        {/* Metric mini-cards */}
        <div className="grid grid-cols-3 gap-1.5">
          <MiniCard
            label={t('discount')}
            value={p.discount_pct != null
              ? `${p.discount_pct > 0 ? '↓' : '↑'} ${Math.abs(p.discount_pct).toFixed(1)}%`
              : '—'
            }
            valueClass={discountClass}
          />
          <MiniCard
            label={t('capRate')}
            value={p.cap_rate != null ? `${p.cap_rate.toFixed(2)}%` : '—'}
            valueClass={capRateClass}
          />
          <MiniCard
            label={t('compsFound')}
            value={p.comparable_count != null ? `${p.comparable_count} ✓` : '—'}
            valueClass={p.comparable_count != null && p.comparable_count >= 7 ? 'text-score-strong' : 'text-slate-300'}
          />
        </div>

        {/* Recommendation + CTA */}
        <div className="flex items-center justify-between pt-1 border-t border-surface-border">
          {p.score_category ? (
            <div className="flex items-center gap-1.5">
              <ScoreDot category={p.score_category} />
              <span className="text-xs font-semibold text-slate-300">
                {categoryLabels[p.score_category] ?? p.score_category}
              </span>
            </div>
          ) : (
            <span className="text-xs text-muted">Not analyzed</span>
          )}
          <span className="flex items-center gap-1 text-xs text-accent font-medium opacity-0 group-hover:opacity-100 transition-opacity">
            {t('viewAnalysis')} <ArrowRight size={11} />
          </span>
        </div>

        {/* Sources */}
        {sources.length > 0 && (
          <p className="text-[10px] text-muted/60">
            {sources.map(s => s.charAt(0).toUpperCase() + s.slice(1)).join(' · ')}
          </p>
        )}
      </div>
    </Link>
  )
}
