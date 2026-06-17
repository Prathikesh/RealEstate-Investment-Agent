/**
 * Floating scrape progress bar — appears at top of page while scraping runs.
 * Polls /api/admin/scrape-status every 2 seconds.
 * Shows per-source mini bars (Realtor / Centris / ReMax) + totals.
 */
import { useEffect, useState } from 'react'
import { RefreshCw, CheckCircle2, XCircle, Clock, X } from 'lucide-react'
import clsx from 'clsx'

interface SourceStatus {
  target:  number
  done:    number
  status:  'pending' | 'running' | 'done' | 'error'
  message: string
  pct:     number
}

interface ScrapeStatus {
  running:         boolean
  current_source:  string
  total_new:       number
  total_updated:   number
  total_errors:    number
  elapsed_seconds: number
  message:         string
  started_at:      string | null
  finished_at:     string | null
  sources: {
    realtor: SourceStatus
    centris: SourceStatus
    remax:   SourceStatus
  }
}

const SOURCE_LABELS: Record<string, string> = {
  realtor: 'Realtor.ca',
  centris: 'Centris',
  remax:   'ReMax',
}

const SOURCE_COLORS: Record<string, string> = {
  realtor: '#6C5CE7',   // purple
  centris: '#00B4D8',   // blue
  remax:   '#E84393',   // pink
}

export default function ScrapeProgressBar() {
  const [status, setStatus] = useState<ScrapeStatus | null>(null)
  const [dismissed, setDismissed] = useState(false)
  const [_polling, setPolling] = useState(false)

  // Start polling when this component mounts
  useEffect(() => {
    let interval: ReturnType<typeof setInterval>

    const poll = async () => {
      try {
        const res = await fetch('/api/admin/scrape-status')
        if (!res.ok) return
        const data: ScrapeStatus = await res.json()
        setStatus(data)

        // Auto-dismiss after 10s when finished
        if (!data.running && data.finished_at) {
          setPolling(false)
        }
      } catch {
        // silently ignore network errors
      }
    }

    poll()  // immediate first poll
    interval = setInterval(poll, 2000)
    setPolling(true)

    return () => clearInterval(interval)
  }, [])

  // Reset dismissed state when a new scrape starts
  useEffect(() => {
    if (status?.running) setDismissed(false)
  }, [status?.running])

  // Don't show if: no data, dismissed, or never ran
  if (!status || dismissed || (!status.running && !status.finished_at)) return null

  const isRunning  = status.running
  const isDone     = !isRunning && !!status.finished_at
  const hasErrors  = status.total_errors > 0
  const overallPct = Math.round(
    Object.values(status.sources).reduce((sum, s) => sum + s.pct, 0) /
    Object.values(status.sources).length
  )

  return (
    <div className={clsx(
      'mx-6 mt-4 rounded-xl border overflow-hidden transition-all',
      isRunning
        ? 'border-accent/40 bg-surface-card'
        : hasErrors
          ? 'border-red-500/30 bg-surface-card'
          : 'border-score-strong/30 bg-surface-card',
    )}>
      {/* ── Top bar ─────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-surface-border">
        <div className="flex items-center gap-2">
          {isRunning ? (
            <RefreshCw size={13} className="text-accent animate-spin" />
          ) : hasErrors ? (
            <XCircle size={13} className="text-red-400" />
          ) : (
            <CheckCircle2 size={13} className="text-score-strong" />
          )}
          <span className="text-xs font-semibold text-ink">
            {isRunning ? 'Scraping Quebec properties...' : status.message}
          </span>
          {isRunning && status.current_source && (
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-accent/15 text-accent font-medium">
              {SOURCE_LABELS[status.current_source] ?? status.current_source}
            </span>
          )}
        </div>

        <div className="flex items-center gap-3">
          {/* Elapsed time */}
          <span className="flex items-center gap-1 text-[10px] text-muted">
            <Clock size={10} />
            {status.elapsed_seconds}s
          </span>

          {/* Totals */}
          {(status.total_new > 0 || status.total_updated > 0) && (
            <div className="flex items-center gap-2 text-[10px]">
              <span className="text-score-strong font-mono">+{status.total_new} new</span>
              {status.total_updated > 0 && (
                <span className="text-muted font-mono">{status.total_updated} updated</span>
              )}
              {status.total_errors > 0 && (
                <span className="text-red-400 font-mono">{status.total_errors} errors</span>
              )}
            </div>
          )}

          {/* Overall pct when running */}
          {isRunning && (
            <span className="text-xs font-bold text-accent font-mono">{overallPct}%</span>
          )}

          {/* Dismiss button (only when done) */}
          {isDone && (
            <button
              onClick={() => setDismissed(true)}
              className="text-muted hover:text-ink transition-colors"
            >
              <X size={13} />
            </button>
          )}
        </div>
      </div>

      {/* ── Per-source bars ─────────────────────────────────────────── */}
      <div className="grid grid-cols-3 divide-x divide-surface-border px-0">
        {(['realtor', 'centris', 'remax'] as const).map(key => {
          const src   = status.sources[key]
          const color = SOURCE_COLORS[key]
          return (
            <div key={key} className="px-4 py-3 space-y-1.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <div
                    className="w-1.5 h-1.5 rounded-full shrink-0"
                    style={{ backgroundColor: color }}
                  />
                  <span className="text-xs text-ink font-medium">
                    {SOURCE_LABELS[key]}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-mono text-muted">
                    {src.done}/{src.target}
                  </span>
                  <StatusDot status={src.status} />
                </div>
              </div>

              {/* Progress bar */}
              <div className="h-1 bg-surface rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${src.pct}%`,
                    backgroundColor: src.status === 'error' ? '#FF4757' : color,
                    opacity: src.status === 'pending' ? 0.3 : 1,
                  }}
                />
              </div>

              {/* Status message */}
              {src.message && (
                <p className="text-[10px] text-muted/70 truncate">{src.message}</p>
              )}
            </div>
          )
        })}
      </div>

      {/* ── Overall progress bar ────────────────────────────────────── */}
      {isRunning && (
        <div className="h-0.5 bg-surface">
          <div
            className="h-full bg-accent transition-all duration-700"
            style={{ width: `${overallPct}%` }}
          />
        </div>
      )}
    </div>
  )
}

function StatusDot({ status }: { status: SourceStatus['status'] }) {
  if (status === 'running') {
    return <div className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
  }
  if (status === 'done') {
    return <div className="w-1.5 h-1.5 rounded-full bg-score-strong" />
  }
  if (status === 'error') {
    return <div className="w-1.5 h-1.5 rounded-full bg-red-400" />
  }
  return <div className="w-1.5 h-1.5 rounded-full bg-surface-border" />
}
