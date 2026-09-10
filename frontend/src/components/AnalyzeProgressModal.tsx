import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Check, Loader2, AlertCircle, Link2 } from 'lucide-react'
import { getLookupStatus, pushRecentLookup, type LookupStatus } from '../lib/lookup'

const STEPS = [
  { key: 'retrieving', label: 'Retrieving the listing' },
  { key: 'analyzing', label: 'Analyzing the property' },
  { key: 'ready', label: 'Almost ready' },
]

// Map backend status → which step index is "active" (0-based).
function stepIndex(status: LookupStatus): number {
  switch (status) {
    case 'pending':
    case 'resolving':
    case 'scraping': return 0
    case 'analyzing': return 1
    case 'done':
    case 'found': return 3   // all complete
    default: return 0
  }
}

const TERMINAL: LookupStatus[] = ['done', 'found', 'needs_url', 'not_found', 'scrape_unavailable', 'failed']

export default function AnalyzeProgressModal({
  jobId, inputLabel, onClose,
}: {
  jobId: string
  inputLabel: string
  onClose: () => void
}) {
  const navigate = useNavigate()

  const { data } = useQuery({
    queryKey: ['lookup', jobId],
    queryFn: () => getLookupStatus(jobId),
    refetchInterval: (q) => (q.state.data && TERMINAL.includes(q.state.data.status) ? false : 1000),
    refetchOnWindowFocus: false,
  })

  const status = data?.status ?? 'pending'

  // On success → navigate to the property page.
  useEffect(() => {
    if ((status === 'done' || status === 'found') && data?.property_id) {
      pushRecentLookup({ id: data.property_id, label: inputLabel, at: new Date().toISOString() })
      navigate(`/properties/${data.property_id}?fresh=1`)
      onClose()
    }
  }, [status, data?.property_id])  // eslint-disable-line react-hooks/exhaustive-deps

  const active = stepIndex(status)
  const isError = status === 'needs_url' || status === 'not_found' || status === 'scrape_unavailable' || status === 'failed'
  const pct = status === 'analyzing' ? 70 : status === 'scraping' || status === 'resolving' ? 35 : 10

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-7 animate-slide-up" onClick={e => e.stopPropagation()}>

        {!isError ? (
          <>
            <div className="flex flex-col items-center text-center">
              <div className="w-14 h-14 rounded-full bg-accent/10 grid place-items-center mb-4">
                <Loader2 size={24} className="text-accent animate-spin" />
              </div>
              <h3 className="font-bold text-ink text-lg">Analyzing property…</h3>
              <p className="text-xs text-muted mt-1">about 30–60 seconds</p>
            </div>

            <div className="mt-6 space-y-3">
              {STEPS.map((s, i) => {
                const done = active > i
                const current = active === i
                return (
                  <div key={s.key} className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors ${current ? 'bg-accent/5' : ''}`}>
                    <span className={`w-6 h-6 rounded-full grid place-items-center shrink-0 ${done ? 'bg-score-strong text-white' : current ? 'bg-accent/15 text-accent' : 'bg-surface-hover text-muted'}`}>
                      {done ? <Check size={13} /> : current ? <Loader2 size={13} className="animate-spin" /> : <span className="w-1.5 h-1.5 rounded-full bg-current opacity-40" />}
                    </span>
                    <span className={`text-sm ${done ? 'text-muted line-through' : current ? 'font-semibold text-ink' : 'text-muted'}`}>{s.label}</span>
                  </div>
                )
              })}
            </div>

            <div className="mt-5 h-1.5 rounded-full bg-surface-hover overflow-hidden">
              <div className="h-full bg-accent rounded-full transition-all duration-700" style={{ width: `${pct}%` }} />
            </div>
          </>
        ) : (
          <div className="text-center">
            <div className="w-14 h-14 rounded-full bg-amber-50 grid place-items-center mx-auto mb-4">
              <AlertCircle size={24} className="text-amber-500" />
            </div>
            <h3 className="font-bold text-ink text-lg">
              {status === 'needs_url' ? 'Couldn’t find that address'
                : status === 'scrape_unavailable' ? 'Scraping temporarily unavailable'
                : status === 'not_found' ? 'Nothing to analyze'
                : 'Analysis failed'}
            </h3>
            <p className="text-sm text-muted mt-2">
              {status === 'needs_url'
                ? 'We couldn’t match that address to an active listing. Paste the Centris link instead.'
                : status === 'scrape_unavailable'
                  ? 'We couldn’t reach the listing right now — this is a temporary scraping issue, not a problem with the property. Please try again in a little while.'
                  : status === 'failed' && data?.error === 'duproprio_not_supported'
                    ? 'DuProprio isn’t supported yet — try a Centris link.'
                    : status === 'failed' && data?.error === 'no_scrapfly_key'
                      ? 'Scraping isn’t configured on this server.'
                      : 'We couldn’t retrieve that listing. Check the link and try again.'}
            </p>
            <div className="mt-5 flex flex-col gap-2">
              <button onClick={onClose} className="btn-primary w-full justify-center">
                <Link2 size={14} /> Paste a listing link
              </button>
              <button onClick={onClose} className="btn-ghost w-full justify-center">Close</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
