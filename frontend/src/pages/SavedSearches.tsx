import { Search } from 'lucide-react'
import { Link } from 'react-router-dom'

const QUICK_SEARCHES = [
  { label: 'Best deals in Montréal',    to: '/properties?city=Montr%C3%A9al&sort_by=score&score_min=60' },
  { label: 'New listings this week',    to: '/properties?sort_by=newest&listed_within=7d' },
  { label: 'Price drops anywhere',      to: '/properties?sort_by=discount' },
  { label: 'Listed on multiple sites',  to: '/properties?multi_site=true' },
  { label: 'Duplexes under $600K',      to: '/properties?property_type=duplex&price_max=600000&sort_by=score' },
]

export default function SavedSearches() {
  return (
    <div className="p-6 space-y-6 animate-slide-up">
      <div>
        <h1 className="text-2xl font-bold text-ink">Saved Searches</h1>
        <p className="text-sm text-muted mt-0.5">Quick access to your frequent searches</p>
      </div>

      {/* Coming soon card */}
      <div className="card py-14 text-center space-y-4">
        <div className="w-16 h-16 rounded-2xl bg-accent/10 flex items-center justify-center mx-auto">
          <Search size={28} className="text-accent" />
        </div>
        <div>
          <p className="font-bold text-ink text-lg">Saved searches coming soon</p>
          <p className="text-sm text-muted mt-1 max-w-sm mx-auto">
            Save any search with filters and get notified when new matches appear. Until then, use these quick-start searches:
          </p>
        </div>
        <div className="flex flex-col gap-2 max-w-xs mx-auto pt-2">
          {QUICK_SEARCHES.map(s => (
            <Link
              key={s.to}
              to={s.to}
              className="px-4 py-2.5 rounded-xl border border-surface-border bg-surface text-sm text-ink font-medium hover:border-accent/40 hover:text-accent hover:bg-accent/5 transition-all text-left"
            >
              {s.label}
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}
