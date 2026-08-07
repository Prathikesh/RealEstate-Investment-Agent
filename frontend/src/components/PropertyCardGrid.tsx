import { Link } from 'react-router-dom'
import { displayAddress } from '../lib/address'
import { Building2, ArrowRight, GitCompareArrows, Camera, Bed, Bath, TrendingUp, TrendingDown, Minus, Hammer } from 'lucide-react'
import clsx from 'clsx'
import ScoreBadge from './ScoreBadge'
import { useLang } from '../context/LanguageContext'
import { useCompare } from '../context/CompareContext'
import type { PropertyCard } from '../api'

function fmtCAD(v: number | null | undefined): string {
  if (v == null) return '—'
  return new Intl.NumberFormat('en-CA', {
    style: 'currency', currency: 'CAD', maximumFractionDigits: 0,
  }).format(v)
}

function typeLabel(t: string): string {
  return t.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
}

function VerdictChip({ category }: { category: string | null }) {
  if (!category) return null
  const map: Record<string, { label: string; cls: string }> = {
    strong_opportunity:  { label: 'Buy It',         cls: 'bg-emerald-500 text-white' },
    worth_investigating: { label: 'Worth Checking',  cls: 'bg-blue-500 text-white' },
    market_price:        { label: 'Fair Price',      cls: 'bg-amber-500 text-white' },
    not_recommended:     { label: 'Skip It',         cls: 'bg-red-500 text-white' },
  }
  const v = map[category]
  if (!v) return null
  return (
    <span className={clsx('inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wide shadow-sm', v.cls)}>
      {v.label}
    </span>
  )
}

interface Props {
  property: PropertyCard
  className?: string
  /** 'your' shows the broker's personalized score on the badge/chip; 'ai' (or
   *  undefined) shows the AI score. Set by the Properties "Rank by" toggle. */
  rankMode?: 'ai' | 'your'
}

export default function PropertyCardGrid({ property: p, className, rankMode }: Props) {
  const { lang } = useLang()
  const { toggle, has, isFull } = useCompare()
  const inCompare = has(p.id)
  const photos = p.photos ?? []

  // Which verdict this card shows. In "your" mode we surface the broker's own
  // score when it exists, falling back to the AI score for un-scored (legacy)
  // rows so the card never goes blank. `showLabel` tags the badge AI/You so it's
  // unambiguous which number is on screen once two verdicts are in play.
  const yourMode    = rankMode === 'your' && p.your_score != null
  const badgeScore  = yourMode ? p.your_score! : p.score
  const badgeCat    = yourMode ? (p.your_score_category ?? null) : p.score_category
  const showLabel   = rankMode != null && p.your_score != null

  const capRateClass =
    p.cap_rate == null        ? 'text-muted' :
    p.cap_rate >= 5           ? 'text-emerald-600 font-bold' :
    p.cap_rate >= 3           ? 'text-amber-600 font-bold' :
    'text-red-500 font-bold'

  const cfClass =
    p.monthly_cash_flow == null ? 'text-muted' :
    p.monthly_cash_flow >= 0   ? 'text-emerald-600 font-bold' :
    'text-red-500 font-bold'

  const discountClass =
    p.discount_pct == null   ? 'text-muted' :
    p.discount_pct > 5       ? 'text-emerald-600 font-bold' :
    p.discount_pct < -2      ? 'text-red-500 font-bold' :
    'text-muted font-medium'

  const CfIcon = p.monthly_cash_flow == null ? Minus :
                 p.monthly_cash_flow >= 0    ? TrendingUp : TrendingDown

  return (
    <Link
      to={`/properties/${p.id}`}
      className={clsx(
        'group block bg-white border border-surface-border rounded-2xl overflow-hidden',
        'shadow-sm hover:shadow-xl hover:-translate-y-1.5',
        'hover:border-accent/40 hover:ring-2 hover:ring-accent/10',
        'transition-all duration-300 ease-out cursor-pointer',
        className,
      )}
    >
      {/* ── Photo ── */}
      <div className="relative overflow-hidden bg-surface" style={{ aspectRatio: '4/3' }}>
        {photos.length > 0 ? (
          <img
            src={photos[0]}
            alt={displayAddress(p)}
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
            referrerPolicy="no-referrer"
            onError={e => {
              const el = e.currentTarget
              el.style.display = 'none'
              const ph = el.nextElementSibling as HTMLElement | null
              if (ph) ph.style.display = 'flex'
            }}
          />
        ) : null}
        <div
          className={clsx(
            'w-full h-full flex-col items-center justify-center gap-2 select-none bg-gradient-to-br from-slate-100 to-slate-200',
            photos.length > 0 ? 'hidden' : 'flex',
          )}
        >
          <Building2 size={32} className="text-slate-400" />
          <span className="text-xs text-slate-500 font-medium capitalize">{typeLabel(p.property_type)}</span>
        </div>

        {/* Gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent pointer-events-none" />

        {/* Top-left badges */}
        <div className="absolute top-3 left-3 flex gap-1.5 flex-wrap">
          {p.is_new && (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-accent text-white tracking-widest shadow-md uppercase">
              New
            </span>
          )}
          {p.status === 'price_changed' && (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-500 text-white shadow-md uppercase">
              Price Drop
            </span>
          )}
          {p.multi_site_count != null && p.multi_site_count > 1 && (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-500 text-white shadow-md">
              {p.multi_site_count} sites
            </span>
          )}
          {p.zoning_upside && (
            <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-violet-600 text-white shadow-md">
              <Hammer size={10} className="shrink-0" />
              Zoned for {p.zoning_max_units}+ units
            </span>
          )}
        </div>

        {/* Top-right: score + compare */}
        <div className="absolute top-3 right-3 flex flex-col items-end gap-1.5">
          <div className="flex flex-col items-center gap-0.5">
            {showLabel && (
              <span className={clsx(
                'px-1.5 py-px rounded-full text-[9px] font-black tracking-wider uppercase shadow-sm',
                yourMode ? 'bg-accent text-white' : 'bg-white/90 text-slate-500',
              )}>
                {yourMode ? 'You' : 'AI'}
              </span>
            )}
            <ScoreBadge score={badgeScore} category={badgeCat} size="card" />
          </div>
          <button
            onClick={e => {
              e.preventDefault()
              toggle({ id: p.id, full_address: p.full_address, asking_price: p.asking_price, city: p.city, photos: photos, property_type: p.property_type, score: p.score, score_category: p.score_category })
            }}
            title={inCompare ? 'Remove from compare' : isFull ? 'Full (max 3)' : 'Add to compare'}
            className={clsx(
              'w-7 h-7 rounded-full flex items-center justify-center shadow-md transition-all duration-200 active:scale-90',
              inCompare ? 'bg-accent text-white' : 'bg-white/90 text-slate-500 hover:text-accent hover:bg-white',
              isFull && !inCompare && 'opacity-40 cursor-not-allowed',
            )}
          >
            <GitCompareArrows size={13} />
          </button>
        </div>

        {/* Bottom-left: photo count */}
        {photos.length > 1 && (
          <div className="absolute bottom-3 right-3 flex items-center gap-1 px-2 py-1 rounded-lg bg-black/50 backdrop-blur-sm text-white text-xs font-semibold">
            <Camera size={11} />
            {photos.length}
          </div>
        )}

        {/* Bottom-left: verdict chip (reflects the active verdict) */}
        <div className="absolute bottom-3 left-3">
          <VerdictChip category={badgeCat} />
        </div>
      </div>

      {/* ── Content ── */}
      <div className="p-4 space-y-3">

        {/* Price + type */}
        <div>
          <p className="text-2xl font-black text-ink tabular-nums leading-none">
            {fmtCAD(p.asking_price)}
          </p>
          <p className="text-sm text-muted mt-1 font-medium">
            {typeLabel(p.property_type)}
            {p.neighborhood && <span className="text-muted/70"> · {p.neighborhood}</span>}
          </p>
        </div>

        {/* Address */}
        <p className="text-sm text-ink font-medium leading-snug line-clamp-2 group-hover:text-accent transition-colors duration-200">
          {displayAddress(p)}
        </p>

        {/* Specs row */}
        <div className="flex items-center gap-3 text-xs text-muted">
          {p.bedrooms_total != null && (
            <span className="flex items-center gap-1">
              <Bed size={12} className="shrink-0" />
              {p.bedrooms_total}
            </span>
          )}
          {p.bedrooms_total != null && (p.bathrooms_total != null || p.unit_count != null) && (
            <span className="text-surface-border">·</span>
          )}
          {p.bathrooms_total != null && (
            <span className="flex items-center gap-1">
              <Bath size={12} className="shrink-0" />
              {p.bathrooms_total}
            </span>
          )}
          {p.bathrooms_total != null && (p.unit_count != null || p.sqft_total != null) && (
            <span className="text-surface-border">·</span>
          )}
          {p.unit_count && <span>{p.unit_count} units</span>}
          {p.unit_count != null && p.sqft_total != null && <span className="text-surface-border">·</span>}
          {p.sqft_total && (
            <span>{p.sqft_total.toLocaleString(lang === 'fr' ? 'fr-CA' : 'en-CA')} sqft</span>
          )}
          {p.year_built && (
            <>
              <span className="text-surface-border">·</span>
              <span>Built {p.year_built}</span>
            </>
          )}
        </div>

        {/* Divider */}
        <div className="border-t border-surface-border" />

        {/* Metrics row */}
        <div className="grid grid-cols-3 gap-2 text-center">
          <div>
            <p className={clsx('text-sm tabular-nums', capRateClass)}>
              {p.cap_rate != null ? `${p.cap_rate.toFixed(2)}%` : '—'}
            </p>
            <p className="text-[10px] text-muted mt-0.5">Cap Rate</p>
          </div>
          <div>
            <p className={clsx('text-sm tabular-nums flex items-center justify-center gap-0.5', cfClass)}>
              <CfIcon size={11} className="shrink-0" />
              {p.monthly_cash_flow != null ? fmtCAD(p.monthly_cash_flow) : '—'}
            </p>
            <p className="text-[10px] text-muted mt-0.5">Cash Flow/mo</p>
          </div>
          <div>
            <p className={clsx('text-sm tabular-nums', discountClass)}>
              {p.discount_pct != null
                ? `${p.discount_pct > 0 ? '↓' : '↑'}${Math.abs(p.discount_pct).toFixed(1)}%`
                : '—'}
            </p>
            <p className="text-[10px] text-muted mt-0.5">vs Market</p>
          </div>
        </div>

        {/* Footer: days on market + CTA */}
        <div className="flex items-center justify-between">
          <p className="text-[10px] text-muted/60">
            {p.days_on_market != null ? `${p.days_on_market}d on market` : ''}
            {p.days_on_market != null && p.primary_source ? ' · ' : ''}
            {p.primary_source ? p.primary_source.charAt(0).toUpperCase() + p.primary_source.slice(1) : ''}
          </p>
          <span className="flex items-center gap-1 text-xs text-accent font-semibold opacity-0 group-hover:opacity-100 transition-all duration-200 translate-x-1 group-hover:translate-x-0">
            View details <ArrowRight size={11} />
          </span>
        </div>
      </div>
    </Link>
  )
}
