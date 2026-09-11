import { useNavigate } from 'react-router-dom'
import { displayAddress } from '../lib/address'
import { X, GitCompareArrows, Building2 } from 'lucide-react'
import { useCompare } from '../context/CompareContext'

export default function CompareBar() {
  const { items, remove, clear } = useCompare()
  const navigate = useNavigate()

  if (items.length === 0) return null

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 px-4 pb-4 pointer-events-none">
      <div className="max-w-4xl mx-auto pointer-events-auto">
        <div className="bg-surface-card border border-surface-border rounded-2xl shadow-xl px-4 py-3 flex items-center gap-3">

          {/* Icon + label */}
          <div className="flex items-center gap-2 shrink-0">
            <GitCompareArrows size={16} className="text-accent" />
            <span className="text-sm font-bold text-ink hidden sm:block">Compare</span>
          </div>

          <div className="w-px h-8 bg-surface-border shrink-0" />

          {/* Selected items */}
          <div className="flex items-center gap-2 flex-1 min-w-0">
            {items.map(item => (
              <div key={item.id}
                className="flex items-center gap-2 bg-surface border border-surface-border rounded-xl px-2.5 py-1.5 min-w-0 shrink-0"
              >
                <div className="w-7 h-7 rounded-lg overflow-hidden bg-surface-hover shrink-0">
                  {item.photos[0]
                    ? <img src={item.photos[0]} referrerPolicy="no-referrer" className="w-full h-full object-cover"
                        onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }} />
                    : <Building2 size={12} className="text-muted m-auto mt-1.5" />
                  }
                </div>
                <div className="min-w-0 hidden sm:block">
                  <p className="text-xs font-semibold text-ink truncate max-w-[120px]">{displayAddress(item)}</p>
                  <p className="text-[10px] text-muted">{item.city}</p>
                </div>
                <button
                  onClick={() => remove(item.id)}
                  className="text-muted hover:text-ink transition-colors ml-1 shrink-0"
                >
                  <X size={12} />
                </button>
              </div>
            ))}

            {/* Empty slots */}
            {Array.from({ length: 3 - items.length }).map((_, i) => (
              <div key={i}
                className="w-10 h-10 rounded-xl border-2 border-dashed border-surface-border flex items-center justify-center shrink-0"
              >
                <span className="text-[10px] text-muted/40 font-bold">+</span>
              </div>
            ))}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={clear}
              className="text-xs text-muted hover:text-ink transition-colors hidden sm:block"
            >
              Clear
            </button>
            <button
              onClick={() => navigate('/compare')}
              disabled={items.length < 2}
              className="btn-primary text-xs px-4 py-2 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Compare {items.length < 2 && `(need ${2 - items.length} more)`}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
