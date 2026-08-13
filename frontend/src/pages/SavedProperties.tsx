import { useState, useEffect } from 'react'
import { displayAddress } from '../lib/address'
import { Link } from 'react-router-dom'
import { Bookmark, Trash2, Building2, MapPin } from 'lucide-react'
import { useLang } from '../context/LanguageContext'
import clsx from 'clsx'
import ScoreBadge from '../components/ScoreBadge'

export interface SavedProp {
  id: string
  full_address: string
  city: string
  asking_price: number | null
  property_type: string
  score: number | null
  score_category: string | null
  photos: string[]
  cap_rate: number | null
  monthly_cash_flow: number | null
  bedrooms_total: number | null
  sqft_total: number | null
  discount_pct: number | null
  primary_source: string | null
  savedAt: string
}

const SAVED_KEY = 'qre_saved_props'

export function loadSaved(): Record<string, SavedProp> {
  try { return JSON.parse(localStorage.getItem(SAVED_KEY) ?? '{}') }
  catch { return {} }
}

export function removeSaved(id: string) {
  const s = loadSaved()
  delete s[id]
  localStorage.setItem(SAVED_KEY, JSON.stringify(s))
}

function fmtCAD(v: number | null | undefined): string {
  if (v == null) return '—'
  return new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 }).format(v)
}

export default function SavedProperties() {
  const { t } = useLang()
  const [saved, setSaved] = useState<Record<string, SavedProp>>(loadSaved)

  useEffect(() => {
    const onStorage = () => setSaved(loadSaved())
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const props = Object.values(saved).sort(
    (a, b) => new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime()
  )

  function remove(id: string) {
    removeSaved(id)
    setSaved(loadSaved())
  }

  return (
    <div className="p-6 space-y-6 animate-slide-up">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-ink">{t('nav_savedProperties')}</h1>
          <p className="text-sm text-muted mt-0.5">
            {props.length} {props.length === 1 ? 'property' : 'properties'} saved
          </p>
        </div>
        {props.length > 0 && (
          <button
            onClick={() => { localStorage.removeItem(SAVED_KEY); setSaved({}) }}
            className="text-xs text-muted hover:text-red-500 transition-colors border border-surface-border px-3 py-1.5 rounded-lg hover:border-red-200"
          >
            Clear all
          </button>
        )}
      </div>

      {/* Empty state */}
      {props.length === 0 && (
        <div className="card py-20 text-center space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-accent/10 flex items-center justify-center mx-auto">
            <Bookmark size={28} className="text-accent" />
          </div>
          <div>
            <p className="font-bold text-ink text-lg">{t('sav_empty')}</p>
            <p className="text-sm text-muted mt-1 max-w-xs mx-auto">
              Click the bookmark icon on any property to save it here for later.
            </p>
          </div>
          <Link to="/properties" className="btn-primary inline-flex mx-auto">
            <Building2 size={14} /> Browse properties
          </Link>
        </div>
      )}

      {/* Grid */}
      {props.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
          {props.map(p => (
            <div key={p.id} className="card card-hover group relative overflow-hidden p-0">
              {/* Photo */}
              <Link to={`/properties/${p.id}`} className="block">
                <div className="aspect-video bg-surface-hover overflow-hidden">
                  {p.photos?.[0] ? (
                    <img
                      src={p.photos[0]}
                      alt={displayAddress(p)}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                      referrerPolicy="no-referrer"
                      onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Building2 size={32} className="text-surface-border" />
                    </div>
                  )}
                </div>
              </Link>

              {/* Score badge */}
              {p.score != null && (
                <div className="absolute top-2 left-2">
                  <ScoreBadge score={p.score} category={p.score_category} size="sm" />
                </div>
              )}

              {/* Remove button */}
              <button
                onClick={() => remove(p.id)}
                className="absolute top-2 right-2 w-8 h-8 rounded-lg bg-white/90 backdrop-blur flex items-center justify-center shadow text-muted hover:text-red-500 hover:bg-white transition-all opacity-0 group-hover:opacity-100"
                title={t('sav_remove')}
              >
                <Trash2 size={13} />
              </button>

              {/* Content */}
              <div className="p-4 space-y-3">
                <div>
                  <p className="text-xs text-muted capitalize">{p.property_type.replace(/_/g, ' ')}</p>
                  <Link to={`/properties/${p.id}`} className="text-sm font-bold text-ink hover:text-accent line-clamp-1 mt-0.5">
                    {displayAddress(p)}
                  </Link>
                  <div className="flex items-center gap-1 mt-0.5 text-xs text-muted">
                    <MapPin size={10} />
                    {p.city}
                  </div>
                </div>

                {/* Price */}
                <p className="text-xl font-mono text-ink">{fmtCAD(p.asking_price)}</p>

                {/* Metrics row */}
                <div className="grid grid-cols-3 gap-2">
                  <Metric label="Cap Rate" value={p.cap_rate != null ? `${p.cap_rate.toFixed(1)}%` : '—'} good={p.cap_rate != null && p.cap_rate >= 5} />
                  <Metric label="Cash Flow" value={p.monthly_cash_flow != null ? fmtCAD(p.monthly_cash_flow) : '—'} good={p.monthly_cash_flow != null && p.monthly_cash_flow >= 0} mono />
                  <Metric label="Discount" value={p.discount_pct != null ? `${p.discount_pct > 0 ? '-' : '+'}${Math.abs(p.discount_pct).toFixed(1)}%` : '—'} good={p.discount_pct != null && p.discount_pct > 0} />
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between pt-1 border-t border-surface-border">
                  <span className="text-[10px] text-muted">
                    Saved {new Date(p.savedAt).toLocaleDateString('en-CA')}
                  </span>
                  {p.primary_source && (
                    <span className="text-[10px] px-2 py-0.5 rounded bg-surface border border-surface-border text-muted capitalize">
                      {p.primary_source}
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function Metric({ label, value, good, mono }: { label: string; value: string; good?: boolean; mono?: boolean }) {
  return (
    <div className="bg-surface rounded-lg p-2 text-center">
      <p className="text-[10px] text-muted leading-tight mb-0.5">{label}</p>
      <p className={clsx('text-xs font-bold', mono && 'font-mono', good ? 'text-score-strong' : 'text-ink')}>
        {value}
      </p>
    </div>
  )
}
