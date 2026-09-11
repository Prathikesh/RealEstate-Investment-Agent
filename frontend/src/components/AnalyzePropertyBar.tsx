import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Search, Link2, MapPin, Loader2, ArrowRight, Building2, Radar, Lock, Sparkles as SparklesIcon } from 'lucide-react'
import { useLang } from '../context/LanguageContext'
import {
  detectKind, startLookup, suggestProperties, recordAnalysis, getAnalysisUsage,
  type AddressSuggestion,
} from '../lib/lookup'
import AnalyzeProgressModal from './AnalyzeProgressModal'

function fmtCAD(v: number | null | undefined): string {
  if (v == null) return '—'
  return new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 }).format(v)
}

// A couple of ready-made examples users can click to fill the bar.
const EXAMPLES = [
  { kind: 'address' as const, value: '32 Rue des Érables, Saint-Sixte' },
  { kind: 'url' as const, value: 'https://www.centris.ca/fr/maison~a-vendre~amherst/22406457' },
]

export default function AnalyzePropertyBar() {
  const { t } = useLang()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [value, setValue] = useState('')
  const [debounced, setDebounced] = useState('')
  const [mode, setMode] = useState<'address' | 'url'>('address')
  const [starting, setStarting] = useState(false)
  const [job, setJob] = useState<{ id: string; label: string } | null>(null)
  const [open, setOpen] = useState(false)
  const boxRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Auto-detect from what's typed; fall back to the manual toggle when empty.
  const detected = value.trim() ? detectKind(value) : null
  const activeKind = detected ?? mode

  // Keep the toggle in sync with what the user is actually typing.
  useEffect(() => {
    if (detected && detected !== mode) setMode(detected)
  }, [detected]) // eslint-disable-line react-hooks/exhaustive-deps

  // Debounce the input for autocomplete.
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value.trim()), 250)
    return () => clearTimeout(id)
  }, [value])

  const { data: suggestions } = useQuery({
    queryKey: ['suggest', debounced],
    queryFn: () => suggestProperties(debounced),
    enabled: activeKind === 'address' && debounced.length >= 3,
    staleTime: 30_000,
  })

  const { data: usage } = useQuery({
    queryKey: ['analysis-usage'],
    queryFn: getAnalysisUsage,
    staleTime: 30_000,
  })
  const reached = !!usage?.reached

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  async function analyze() {
    const input = value.trim()
    if (!input || starting || reached) return
    setOpen(false)
    setStarting(true)
    try {
      const res = await startLookup(input)
      if ((res.status === 'found' || res.status === 'done') && res.property_id) {
        recordAnalysis(res.property_id, input)
        queryClient.invalidateQueries({ queryKey: ['recent-analyses'] })
        queryClient.invalidateQueries({ queryKey: ['analysis-usage'] })
        navigate(`/properties/${res.property_id}`)
      } else {
        setJob({ id: res.job_id, label: input })
      }
    } catch {
      /* keep it simple: the modal path handles most failures */
    } finally {
      setStarting(false)
    }
  }

  function useExample(v: string) {
    setValue(v)
    setOpen(true)
    inputRef.current?.focus()
  }

  const showDropdown = open && activeKind === 'address' && (suggestions?.length ?? 0) > 0
  const placeholder = mode === 'url' ? t('analyze_placeholder_link') : t('analyze_placeholder_address')

  return (
    <div ref={boxRef} className="relative animate-slide-up">
      <div className="rounded-2xl border border-accent/15 bg-gradient-to-br from-accent/[0.07] via-surface-card to-surface-card p-6 sm:p-7 shadow-card">
        {/* Heading */}
        <div className="flex items-center gap-2">
          <span className="grid place-items-center w-9 h-9 rounded-xl bg-gradient-to-br from-accent to-indigo-500 text-white shrink-0 shadow-sm">
            <Radar size={18} />
          </span>
          <div>
            <h2 className="font-bold text-ink text-lg leading-tight">{t('analyze_title')}</h2>
            <p className="text-xs text-muted">{t('analyze_subtitle')}</p>
          </div>
        </div>

        {reached ? (
          /* Free-tier limit reached → Pro upsell (billing coming soon) */
          <div className="mt-4 rounded-2xl border border-accent/25 bg-accent/[0.06] p-6 text-center">
            <span className="grid place-items-center w-12 h-12 mx-auto rounded-2xl bg-accent/15 text-accent mb-3">
              <Lock size={22} />
            </span>
            <h3 className="font-bold text-ink text-base">{t('analyze_limitTitle')}</h3>
            <p className="text-sm text-muted mt-1 max-w-md mx-auto">{t('analyze_limitBody')}</p>
            <button
              disabled
              className="mt-4 inline-flex items-center gap-2 h-11 px-6 rounded-full font-semibold text-sm text-white
                         bg-gradient-to-r from-accent to-indigo-500 shadow-sm opacity-90 cursor-not-allowed"
            >
              <SparklesIcon size={15} /> {t('analyze_proSoon')}
            </button>
          </div>
        ) : (
          <>
            {/* Segmented toggle — echoes Centris's Residential/Commercial tabs */}
            <div className="mt-4 inline-flex items-center gap-1 p-1 rounded-full bg-surface-hover border border-surface-border">
              {(['address', 'url'] as const).map(m => {
                const on = mode === m
                return (
                  <button
                    key={m}
                    onClick={() => { setMode(m); inputRef.current?.focus() }}
                    className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all ${
                      on ? 'bg-surface-card text-accent shadow-sm' : 'text-muted hover:text-ink'
                    }`}
                  >
                    {m === 'address' ? <MapPin size={13} /> : <Link2 size={13} />}
                    {m === 'address' ? t('analyze_addressDetected') : t('analyze_linkDetected')}
                  </button>
                )
              })}
            </div>

            {/* The pill: search + prominent Analyze button */}
            <div className="mt-3 flex items-center gap-1.5 rounded-full border border-surface-border bg-surface-card pl-4 pr-1.5 h-14 shadow-sm focus-within:border-accent/40 focus-within:ring-2 focus-within:ring-accent/20 transition-all">
              <Search size={18} className="text-muted shrink-0 pointer-events-none" />
              <input
                ref={inputRef}
                value={value}
                onChange={e => { setValue(e.target.value); setOpen(true) }}
                onFocus={() => setOpen(true)}
                onKeyDown={e => { if (e.key === 'Enter') analyze() }}
                placeholder={placeholder}
                className="flex-1 min-w-0 h-full bg-transparent text-sm sm:text-[15px] text-ink placeholder:text-muted focus:outline-none"
              />
              <button
                onClick={analyze}
                disabled={!value.trim() || starting}
                className="inline-flex items-center gap-2 h-11 px-5 rounded-full font-semibold text-sm text-white shrink-0
                           bg-gradient-to-r from-accent to-indigo-500 shadow-sm
                           hover:brightness-105 active:scale-[0.98] transition-all
                           disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:brightness-100"
              >
                {starting
                  ? <><Loader2 size={16} className="animate-spin" /> {t('analyze_starting')}</>
                  : <>{t('analyze_cta')} <ArrowRight size={15} /></>}
              </button>
            </div>

            {/* Example chips + free-usage hint */}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="text-xs text-muted">{t('analyze_try')}</span>
              {EXAMPLES.map(ex => (
                <button
                  key={ex.value}
                  onClick={() => useExample(ex.value)}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium
                             bg-surface-hover text-ink/80 border border-surface-border hover:border-accent/40 hover:text-accent transition-colors max-w-full"
                >
                  {ex.kind === 'address' ? <MapPin size={11} className="shrink-0" /> : <Link2 size={11} className="shrink-0" />}
                  <span className="truncate">{ex.kind === 'address' ? ex.value : 'centris.ca/…/22406457'}</span>
                </button>
              ))}
              {usage && (
                <span className="ml-auto text-[11px] font-medium text-muted whitespace-nowrap">
                  {usage.count}/{usage.limit} {t('analyze_freeUsed')}
                </span>
              )}
            </div>
          </>
        )}
      </div>

      {/* Autocomplete dropdown — instant hits from our DB */}
      {showDropdown && (
        <div className="absolute left-0 right-0 mt-2 z-30 bg-surface-card border border-surface-border rounded-2xl shadow-card-hover overflow-hidden animate-fade-in">
          <div className="px-4 py-2.5 text-[10px] font-bold text-muted uppercase tracking-wider border-b border-surface-border bg-surface-hover/50">
            {t('analyze_inYourDb')}
          </div>
          {suggestions!.slice(0, 6).map(s => (
            <SuggestionRow key={s.id} s={s} onPick={() => {
              setOpen(false)
              recordAnalysis(s.id, s.full_address)
              queryClient.invalidateQueries({ queryKey: ['recent-analyses'] })
              queryClient.invalidateQueries({ queryKey: ['analysis-usage'] })
              navigate(`/properties/${s.id}`)
            }} />
          ))}
          <div className="px-4 py-2.5 text-[11px] text-muted border-t border-surface-border flex items-center gap-1.5">
            <Radar size={12} className="text-accent" /> {t('analyze_notListed')}
          </div>
        </div>
      )}

      {job && <AnalyzeProgressModal jobId={job.id} inputLabel={job.label} onClose={() => setJob(null)} />}
    </div>
  )
}

function SuggestionRow({ s, onPick }: { s: AddressSuggestion; onPick: () => void }) {
  return (
    <button onClick={onPick} className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-surface-hover transition-colors text-left">
      <div className="w-9 h-9 rounded-lg bg-surface-hover grid place-items-center shrink-0 border border-surface-border">
        <Building2 size={14} className="text-muted" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-ink truncate">{s.full_address}</p>
        <p className="text-[11px] text-muted">{s.city}</p>
      </div>
      <span className="text-xs font-bold font-mono text-ink tabular-nums shrink-0">{fmtCAD(s.asking_price)}</span>
    </button>
  )
}
