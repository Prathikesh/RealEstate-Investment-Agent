import { useEffect } from 'react'
import { X } from 'lucide-react'

// Small, dependency-free modal for explainer content (e.g. "How My Scoring
// Criteria works"). Deliberately built on the app's existing shipped tokens
// (surface/ink/muted/accent) rather than the in-progress design-system
// tokens in components/ui/, so it can ship independently of that work.
export function InfoModal({
  open, onClose, title, children,
}: { open: boolean; onClose: () => void; title: string; children: React.ReactNode }) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 animate-fade-in"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="w-full max-w-lg max-h-[85vh] overflow-y-auto bg-white border border-surface-border rounded-2xl shadow-card-hover p-6"
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="flex items-start justify-between gap-4 mb-4">
          <h2 className="text-base font-bold text-ink leading-tight">{title}</h2>
          <button
            type="button" onClick={onClose} aria-label="Close"
            className="shrink-0 w-7 h-7 rounded-lg flex items-center justify-center text-muted hover:text-ink hover:bg-surface transition-colors"
          >
            <X size={16} />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}
