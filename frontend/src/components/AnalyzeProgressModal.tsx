import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Check, Loader2, AlertCircle, Link2, Download, ScanSearch, Sparkles,
} from 'lucide-react'
import { useLang } from '../context/LanguageContext'
import { getLookupStatus, recordAnalysis, type LookupStatus } from '../lib/lookup'

// Map backend status → which step index is "active" (0-based). 3 = all done.
function stepIndex(status: LookupStatus): number {
  switch (status) {
    case 'pending':
    case 'resolving':
    case 'scraping': return 0
    case 'analyzing': return 1
    case 'done':
    case 'found': return 3
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
  const { t } = useLang()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [tip, setTip] = useState(0)

  const { data } = useQuery({
    queryKey: ['lookup', jobId],
    queryFn: () => getLookupStatus(jobId),
    refetchInterval: (q) => (q.state.data && TERMINAL.includes(q.state.data.status) ? false : 1000),
    refetchOnWindowFocus: false,
  })

  const status = data?.status ?? 'pending'
  const isError = status === 'needs_url' || status === 'not_found' || status === 'scrape_unavailable' || status === 'failed'

  // Rotate the encouraging tip line while working.
  useEffect(() => {
    if (isError) return
    const id = setInterval(() => setTip(x => (x + 1) % 3), 3200)
    return () => clearInterval(id)
  }, [isError])

  // On success → go to the property page.
  useEffect(() => {
    if ((status === 'done' || status === 'found') && data?.property_id) {
      recordAnalysis(data.property_id, inputLabel)
      queryClient.invalidateQueries({ queryKey: ['recent-analyses'] })
      queryClient.invalidateQueries({ queryKey: ['analysis-usage'] })
      navigate(`/properties/${data.property_id}?fresh=1`)
      onClose()
    }
  }, [status, data?.property_id]) // eslint-disable-line react-hooks/exhaustive-deps

  const active = stepIndex(status)
  const pct = status === 'analyzing' ? 78 : status === 'scraping' ? 48 : status === 'resolving' ? 30 : 12

  const STEPS = [
    { key: 'retrieving', label: t('analyze_step_retrieving'), Icon: Download },
    { key: 'analyzing', label: t('analyze_step_analyzing'), Icon: ScanSearch },
    { key: 'ready', label: t('analyze_step_ready'), Icon: Sparkles },
  ]
  const CenterIcon = active >= STEPS.length ? Check : STEPS[active].Icon

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/40 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-surface-card rounded-2xl shadow-2xl w-full max-w-sm p-7 animate-slide-up" onClick={e => e.stopPropagation()}>

        {!isError ? (
          <>
            {/* Animated ring loader with a step-aware center icon */}
            <div className="flex flex-col items-center text-center">
              <div className="relative w-16 h-16">
                <div
                  className="absolute inset-0 rounded-full animate-spin"
                  style={{ background: 'conic-gradient(from 0deg, transparent 0%, rgba(37,99,235,0.15) 40%, #2563eb 100%)', animationDuration: '1.1s' }}
                />
                <div className="absolute inset-[3px] rounded-full bg-surface-card" />
                <div className="absolute inset-0 grid place-items-center text-accent">
                  <CenterIcon size={22} className="pop-in" key={active} />
                </div>
              </div>
              <h3 className="font-bold text-ink text-lg mt-4">{t('analyze_modal_title')}</h3>
              <p className="text-sm text-muted mt-1 max-w-[19rem] truncate" title={inputLabel}>{inputLabel}</p>
            </div>

            {/* Steps */}
            <div className="mt-6 space-y-2">
              {STEPS.map((s, i) => {
                const done = active > i
                const current = active === i
                return (
                  <div key={s.key} className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors ${current ? 'bg-accent/[0.06]' : ''}`}>
                    <span className={`w-7 h-7 rounded-full grid place-items-center shrink-0 transition-colors ${done ? 'bg-score-strong text-white' : current ? 'bg-accent/15 text-accent' : 'bg-surface-hover text-muted'}`}>
                      {done ? <Check size={14} className="pop-in" /> : current ? <Loader2 size={14} className="animate-spin" /> : <s.Icon size={13} />}
                    </span>
                    <span className={`text-sm transition-colors ${done ? 'text-muted' : current ? 'font-semibold text-ink' : 'text-muted'}`}>{s.label}</span>
                  </div>
                )
              })}
            </div>

            {/* Shimmer progress bar */}
            <div className="mt-5 h-2 rounded-full bg-surface-hover overflow-hidden relative">
              <div className="h-full rounded-full bg-gradient-to-r from-accent to-indigo-500 transition-all duration-700 ease-out relative overflow-hidden" style={{ width: `${pct}%` }}>
                <div className="absolute inset-0 shimmer opacity-40" />
              </div>
            </div>

            {/* Rotating tip */}
            <p className="mt-4 text-center text-xs text-muted flex items-center justify-center gap-1.5 min-h-[1rem]">
              <Sparkles size={12} className="text-accent shrink-0" />
              <span className="animate-fade-in" key={tip}>{t(`analyze_tip${tip + 1}` as any)}</span>
            </p>
          </>
        ) : (
          <div className="text-center">
            <div className="w-14 h-14 rounded-full bg-amber-50 grid place-items-center mx-auto mb-4">
              <AlertCircle size={24} className="text-amber-500" />
            </div>
            <h3 className="font-bold text-ink text-lg">
              {status === 'needs_url' ? t('analyze_err_needsUrl_title')
                : status === 'scrape_unavailable' ? t('analyze_err_unavailable_title')
                : status === 'not_found' ? t('analyze_err_notFound_title')
                : t('analyze_err_failed_title')}
            </h3>
            <p className="text-sm text-muted mt-2">
              {status === 'needs_url'
                ? t('analyze_err_needsUrl_body')
                : status === 'scrape_unavailable'
                  ? t('analyze_err_unavailable_body')
                  : status === 'failed' && data?.error === 'duproprio_not_supported'
                    ? t('analyze_err_duproprio')
                    : status === 'failed' && data?.error === 'no_scrapfly_key'
                      ? t('analyze_err_noScrapfly')
                      : t('analyze_err_failed_body')}
            </p>
            <div className="mt-5 flex flex-col gap-2">
              <button onClick={onClose} className="btn-primary w-full justify-center">
                <Link2 size={14} /> {t('analyze_pasteLink')}
              </button>
              <button onClick={onClose} className="btn-ghost w-full justify-center">{t('analyze_close')}</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
