import { useState } from 'react'
import { useLang } from '../context/LanguageContext'
import { Link } from 'react-router-dom'
import {
  Search, TrendingUp, Zap, ArrowDownCircle, Globe, Building2,
  BarChart2, Bookmark, BookmarkCheck, Trash2, ChevronRight, MapPin, Star,
} from 'lucide-react'

// ── Types ─────────────────────────────────────────────────────────────────────

interface SavedSearch {
  id: string
  label: string
  desc: string
  to: string
  icon: string
  savedAt: string
}

const STORAGE_KEY = 'qre_saved_searches'

function loadSaved(): SavedSearch[] {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]') as SavedSearch[] }
  catch { return [] }
}
function saveSaved(list: SavedSearch[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list))
}

// ── Preset searches ───────────────────────────────────────────────────────────

const PRESETS = [
  {
    id: 'best-deals',
    icon: 'trending',
    color:  'text-emerald-600',
    bg:     'bg-emerald-50',
    border: 'border-emerald-200',
    label:  'Best Deals Right Now',
    desc:   'AI score 80+ — strongest investment opportunities across Quebec',
    to:     '/properties?score_min=80&sort_by=score',
    tag:    'Score 80+',
  },
  {
    id: 'new-week',
    icon: 'zap',
    color:  'text-blue-600',
    bg:     'bg-blue-50',
    border: 'border-blue-200',
    label:  'New This Week',
    desc:   'Fresh listings added in the last 7 days across all cities',
    to:     '/properties?sort_by=newest&listed_within=7d',
    tag:    'Last 7 days',
  },
  {
    id: 'price-drops',
    icon: 'arrow-down',
    color:  'text-red-500',
    bg:     'bg-red-50',
    border: 'border-red-200',
    label:  'Price Drops',
    desc:   'Properties with recent asking price reductions — motivated sellers',
    to:     '/properties?sort_by=discount',
    tag:    'Below market',
  },
  {
    id: 'multi-site',
    icon: 'globe',
    color:  'text-violet-600',
    bg:     'bg-violet-50',
    border: 'border-violet-200',
    label:  'Listed on Multiple Sites',
    desc:   'Cross-listed properties — more data means higher confidence in price',
    to:     '/properties?multi_site=true',
    tag:    'Multi-site verified',
  },
  {
    id: 'duplex-600',
    icon: 'building',
    color:  'text-amber-600',
    bg:     'bg-amber-50',
    border: 'border-amber-200',
    label:  'Duplexes Under $600K',
    desc:   'Entry-level multi-family in Montréal at duplex scale',
    to:     '/properties?property_type=duplex&price_max=600000&sort_by=score',
    tag:    'Duplex · Under $600K',
  },
  {
    id: 'montreal-best',
    icon: 'mappin',
    color:  'text-accent',
    bg:     'bg-accent/10',
    border: 'border-accent/20',
    label:  'Best Deals in Montréal',
    desc:   'Highest-scored properties in the Montréal metro area',
    to:     '/properties?city=Montr%C3%A9al&sort_by=score&score_min=60',
    tag:    'Montréal · Score 60+',
  },
  {
    id: 'highest-yield',
    icon: 'barchart',
    color:  'text-score-strong',
    bg:     'bg-score-strong/10',
    border: 'border-score-strong/20',
    label:  'Highest Yield Properties',
    desc:   'Best cap rate opportunities — maximize your annual return on investment',
    to:     '/properties?sort_by=score&score_min=50',
    tag:    'Best yield',
  },
  {
    id: 'new-24h',
    icon: 'star',
    color:  'text-orange-500',
    bg:     'bg-orange-50',
    border: 'border-orange-200',
    label:  'Just Listed (24h)',
    desc:   'Properties added in the last 24 hours — be first to see new deals',
    to:     '/properties?listed_within=24h&sort_by=newest',
    tag:    'Last 24 hours',
  },
]

function PresetIcon({ icon, cls }: { icon: string; cls: string }) {
  const size = 18
  if (icon === 'trending')   return <TrendingUp size={size} className={cls} />
  if (icon === 'zap')        return <Zap size={size} className={cls} />
  if (icon === 'arrow-down') return <ArrowDownCircle size={size} className={cls} />
  if (icon === 'globe')      return <Globe size={size} className={cls} />
  if (icon === 'building')   return <Building2 size={size} className={cls} />
  if (icon === 'mappin')     return <MapPin size={size} className={cls} />
  if (icon === 'barchart')   return <BarChart2 size={size} className={cls} />
  if (icon === 'star')       return <Star size={size} className={cls} />
  return <Search size={size} className={cls} />
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function SavedSearches() {
  const { t } = useLang()
  const [saved, setSaved] = useState<SavedSearch[]>(loadSaved)

  const savedIds = new Set(saved.map(s => s.id))

  function toggleSave(preset: typeof PRESETS[number]) {
    if (savedIds.has(preset.id)) {
      const next = saved.filter(s => s.id !== preset.id)
      setSaved(next); saveSaved(next)
    } else {
      const next: SavedSearch[] = [...saved, {
        id: preset.id, label: preset.label, desc: preset.desc, to: preset.to,
        icon: preset.icon, savedAt: new Date().toISOString(),
      }]
      setSaved(next); saveSaved(next)
    }
  }

  function remove(id: string) {
    const next = saved.filter(s => s.id !== id)
    setSaved(next); saveSaved(next)
  }

  return (
    <div className="p-6 space-y-6 max-w-[1400px] mx-auto animate-slide-up">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-ink">{t('nav_savedSearches')}</h1>
          <p className="text-sm text-muted mt-0.5">{t('ss_subtitle')}</p>
        </div>
        <Link to="/properties" className="btn-primary shadow-md">
          <Search size={14} /> Browse Properties
        </Link>
      </div>

      {/* Pinned / saved section */}
      {saved.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <BookmarkCheck size={15} className="text-accent" />
            <h2 className="font-bold text-ink text-base">{t('ss_pinned')}</h2>
            <span className="text-xs text-muted bg-surface border border-surface-border px-2 py-0.5 rounded-full font-medium">{saved.length}</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
            {saved.map(s => {
              const preset = PRESETS.find(p => p.id === s.id)
              return (
                <div key={s.id} className="card group flex items-start gap-3 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 relative">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${preset?.bg ?? 'bg-surface-hover'}`}>
                    <PresetIcon icon={s.icon} cls={preset?.color ?? 'text-muted'} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-ink text-sm truncate">{s.label}</p>
                    <p className="text-xs text-muted mt-0.5 line-clamp-1">{s.desc}</p>
                    <p className="text-[10px] text-muted/60 mt-1">
                      Saved {new Date(s.savedAt).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Link to={s.to} className="p-1.5 rounded-lg text-accent hover:bg-accent/10 transition-colors">
                      <ChevronRight size={14} />
                    </Link>
                    <button onClick={() => remove(s.id)} className="p-1.5 rounded-lg text-muted hover:text-red-500 hover:bg-red-50 transition-colors">
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Quick search presets */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Search size={15} className="text-muted" />
          <h2 className="font-bold text-ink text-base">{t('ss_quick')}</h2>
          <span className="text-xs text-muted">{t('ss_bookmarkHint')}</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
          {PRESETS.map(p => {
            const isPinned = savedIds.has(p.id)
            return (
              <div
                key={p.id}
                className={`card group relative hover:shadow-lg hover:-translate-y-1 transition-all duration-250 cursor-pointer ${isPinned ? 'ring-2 ring-accent/20' : ''}`}
              >
                {/* Pin button */}
                <button
                  onClick={() => toggleSave(p)}
                  title={isPinned ? 'Unpin search' : 'Pin search'}
                  className={`absolute top-3 right-3 p-1.5 rounded-lg transition-all duration-200 ${
                    isPinned
                      ? 'text-accent bg-accent/10 hover:bg-red-50 hover:text-red-500'
                      : 'text-muted hover:text-accent hover:bg-accent/10 opacity-0 group-hover:opacity-100'
                  }`}
                >
                  {isPinned ? <BookmarkCheck size={14} /> : <Bookmark size={14} />}
                </button>

                <Link to={p.to} className="flex flex-col gap-3">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${p.bg}`}>
                      <PresetIcon icon={p.icon} cls={p.color} />
                    </div>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${p.bg} ${p.color} ${p.border}`}>
                      {p.tag}
                    </span>
                  </div>
                  <div>
                    <p className="font-bold text-ink text-sm leading-snug">{p.label}</p>
                    <p className="text-xs text-muted mt-1 leading-relaxed line-clamp-2">{p.desc}</p>
                  </div>
                  <div className={`flex items-center gap-1 text-xs font-semibold mt-auto ${p.color}`}>
                    Open search <ChevronRight size={12} />
                  </div>
                </Link>
              </div>
            )
          })}
        </div>
      </div>

      {/* Empty pinned state */}
      {saved.length === 0 && (
        <div className="card bg-accent/5 border-accent/20 py-8 text-center space-y-2">
          <Bookmark size={20} className="text-accent/50 mx-auto" />
          <p className="text-sm text-muted">{t('ss_clickBookmark')}</p>
        </div>
      )}
    </div>
  )
}
