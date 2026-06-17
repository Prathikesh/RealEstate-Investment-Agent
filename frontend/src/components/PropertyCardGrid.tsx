import { Link } from 'react-router-dom'
import { Building2, ArrowRight, ThumbsUp, ThumbsDown, Minus, GitCompareArrows } from 'lucide-react'
import clsx from 'clsx'
import ScoreBadge from './ScoreBadge'
import { useLang } from '../context/LanguageContext'
import { useCompare } from '../context/CompareContext'
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
  if (photos.length === 0) return null
  return (
    <img
      src={photos[0]}
      alt={address}
      className="w-full h-full object-cover"
      referrerPolicy="no-referrer"
      onError={e => {
        const el = e.currentTarget
        el.style.display = 'none'
        el.nextElementSibling?.classList.remove('hidden')
      }}
    />
  )
}

function PhotoPlaceholder({ type }: { type: string }) {
  return (
    <div className="w-full h-full flex flex-col items-center justify-center gap-2 select-none bg-surface">
      <Building2 size={28} className="text-surface-border" />
      <span className="text-xs text-muted capitalize">{type.replace(/_/g, ' ')}</span>
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
    <div className="bg-surface rounded-lg px-2.5 py-2 text-center border border-surface-border">
      <p className={clsx('text-xs font-mono tabular-nums leading-tight', valueClass ?? 'text-ink')}>
        {value}
      </p>
      <p className="text-[10px] text-muted mt-0.5 leading-tight">{label}</p>
    </div>
  )
}

// ── Verdict chip ──────────────────────────────────────────────────────────────

function VerdictChip({ category }: { category: string | null }) {
  if (!category) return <span className="text-xs text-muted">Not analyzed</span>

  if (category === 'strong_opportunity') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-score-strong/10 text-score-strong border border-score-strong/30">
        <ThumbsUp size={10} /> BUY IT
      </span>
    )
  }
  if (category === 'worth_investigating') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-score-worth/10 text-score-worth border border-score-worth/30">
        <ThumbsUp size={10} /> WORTH CHECKING
      </span>
    )
  }
  if (category === 'market_price') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-score-market/10 text-score-market border border-score-market/30">
        <Minus size={10} /> FAIR PRICE
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-score-notrecommended/10 text-score-notrecommended border border-score-notrecommended/30">
      <ThumbsDown size={10} /> SKIP IT
    </span>
  )
}

// ── Main card ─────────────────────────────────────────────────────────────────

interface Props {
  property: PropertyCard
  className?: string
}

export default function PropertyCardGrid({ property: p, className }: Props) {
  const { lang } = useLang()
  const { toggle, has, isFull } = useCompare()
  const inCompare = has(p.id)

  const belowMarketClass =
    p.discount_pct != null && p.discount_pct > 5  ? 'text-score-strong' :
    p.discount_pct != null && p.discount_pct < -2 ? 'text-score-notrecommended' :
    'text-ink'

  const returnClass =
    p.cap_rate == null           ? 'text-ink' :
    p.cap_rate >= 5              ? 'text-score-strong' :
    p.cap_rate >= 3              ? 'text-ink'          :
    'text-score-market'

  const typeLabel = p.property_type
    .split('_')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')

  const sources = (p.active_sources ?? [p.primary_source]).filter(Boolean) as string[]

  return (
    <Link
      to={`/properties/${p.id}`}
      className={clsx(
        'group block bg-white border border-surface-border rounded-2xl overflow-hidden shadow-card',
        'hover:border-accent/40 hover:shadow-card-hover hover:-translate-y-0.5 transition-all duration-200',
        className,
      )}
    >
      {/* ── Photo ────────────────────────────────────────────────────────── */}
      <div className="relative aspect-video bg-surface overflow-hidden">
        <PropertyPhoto photos={p.photos ?? []} address={p.full_address} />
        <div className="hidden flex w-full h-full flex-col items-center justify-center gap-2">
          <PhotoPlaceholder type={p.property_type} />
        </div>

        {/* Gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/30 via-transparent to-transparent pointer-events-none" />

        {/* Score badge — top right */}
        <div className="absolute top-3 right-3 flex flex-col items-end gap-1.5">
          <ScoreBadge score={p.score} category={p.score_category} size="card" />
          {/* Compare toggle */}
          <button
            onClick={e => {
              e.preventDefault()
              toggle({ id: p.id, full_address: p.full_address, asking_price: p.asking_price, city: p.city, photos: p.photos ?? [], property_type: p.property_type, score: p.score, score_category: p.score_category })
            }}
            title={inCompare ? 'Remove from compare' : isFull ? 'Compare list full (max 3)' : 'Add to compare'}
            className={clsx(
              'w-7 h-7 rounded-full flex items-center justify-center shadow transition-all',
              inCompare
                ? 'bg-accent text-white'
                : 'bg-white/90 text-muted hover:text-accent hover:bg-white',
              isFull && !inCompare && 'opacity-40 cursor-not-allowed',
            )}
          >
            <GitCompareArrows size={13} />
          </button>
        </div>

        {/* Badges — top left */}
        <div className="absolute top-3 left-3 flex gap-1.5">
          {p.is_new && (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-accent text-white tracking-wide shadow">
              NEW
            </span>
          )}
          {p.status === 'price_changed' && (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-score-strong text-white tracking-wide shadow">
              PRICE DROP
            </span>
          )}
          {p.multi_site_count != null && p.multi_site_count > 1 && (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-500 text-white tracking-wide shadow">
              {p.multi_site_count} sites
            </span>
          )}
        </div>
      </div>

      {/* ── Content ──────────────────────────────────────────────────────── */}
      <div className="p-4 space-y-3">

        {/* Type + neighborhood */}
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs text-muted truncate">
            <span className="text-ink font-medium capitalize">{typeLabel}</span>
            {p.neighborhood && (
              <span className="text-muted"> · {p.neighborhood}</span>
            )}
          </p>
          {p.days_on_market != null && (
            <span className="text-[10px] text-muted shrink-0">{p.days_on_market}d on market</span>
          )}
        </div>

        {/* Address + price */}
        <div>
          <p className="text-sm text-ink font-medium leading-snug truncate group-hover:text-accent transition-colors">
            {p.full_address}
          </p>
          <p className="text-xl font-mono text-ink mt-1 tabular-nums">
            {fmtCAD(p.asking_price)}
          </p>
        </div>

        {/* Specs row */}
        <div className="flex items-center gap-2.5 text-xs text-muted flex-wrap">
          {p.unit_count && <span>{p.unit_count} units</span>}
          {p.unit_count && p.sqft_total && <span className="text-surface-border">•</span>}
          {p.sqft_total && (
            <span>{p.sqft_total.toLocaleString(lang === 'fr' ? 'fr-CA' : 'en-CA')} sqft</span>
          )}
          {p.year_built && (
            <>
              <span className="text-surface-border">•</span>
              <span>Built {p.year_built}</span>
            </>
          )}
        </div>

        {/* Metric mini-cards: user-friendly labels */}
        <div className="grid grid-cols-3 gap-1.5">
          <MiniCard
            label="Below Market"
            value={p.discount_pct != null
              ? `${p.discount_pct > 0 ? '↓' : '↑'} ${Math.abs(p.discount_pct).toFixed(1)}%`
              : '—'
            }
            valueClass={belowMarketClass}
          />
          <MiniCard
            label="Yearly Return"
            value={p.cap_rate != null ? `${p.cap_rate.toFixed(2)}%` : '—'}
            valueClass={returnClass}
          />
          <MiniCard
            label="Monthly Profit"
            value={p.monthly_cash_flow != null
              ? fmtCAD(p.monthly_cash_flow)
              : '—'
            }
            valueClass={
              p.monthly_cash_flow == null ? 'text-muted' :
              p.monthly_cash_flow >= 0    ? 'text-score-strong' :
              'text-score-notrecommended'
            }
          />
        </div>

        {/* Verdict + CTA */}
        <div className="flex items-center justify-between pt-1 border-t border-surface-border">
          <VerdictChip category={p.score_category} />
          <span className="flex items-center gap-1 text-xs text-accent font-medium opacity-0 group-hover:opacity-100 transition-opacity">
            View details <ArrowRight size={11} />
          </span>
        </div>

        {/* Sources */}
        {sources.length > 0 && (
          <div className="flex items-center justify-between">
            <p className="text-[10px] text-muted/60">
              {sources.map(s => s.charAt(0).toUpperCase() + s.slice(1)).join(' · ')}
            </p>
            {p.lowest_price_source && p.lowest_price != null && p.lowest_price_source !== p.primary_source && (
              <p className="text-[10px] text-score-strong font-mono">
                Lowest: {p.lowest_price_source}
              </p>
            )}
          </div>
        )}
      </div>
    </Link>
  )
}
