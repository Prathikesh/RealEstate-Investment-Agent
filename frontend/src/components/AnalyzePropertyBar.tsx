import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Search, Link2, MapPin, Loader2, ArrowRight, Building2 } from 'lucide-react'
import { useLang } from '../context/LanguageContext'
import {
  detectKind, startLookup, suggestProperties, type AddressSuggestion,
} from '../lib/lookup'
import AnalyzeProgressModal from './AnalyzeProgressModal'

function fmtCAD(v: number | null | undefined): string {
  if (v == null) return '—'
  return new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 }).format(v)
}

export default function AnalyzePropertyBar() {
  const { t } = useLang()
  const navigate = useNavigate()
  const [value, setValue] = useState('')
  const [debounced, setDebounced] = useState('')
  const [starting, setStarting] = useState(false)
  const [job, setJob] = useState<{ id: string; label: string } | null>(null)
  const [open, setOpen] = useState(false)
  const boxRef = useRef<HTMLDivElement>(null)

  const kind = value.trim() ? detectKind(value) : null

  // Debounce the input for autocomplete.
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value.trim()), 250)
    return () => clearTimeout(id)
  }, [value])

  const { data: suggestions } = useQuery({
    queryKey: ['suggest', debounced],
    queryFn: () => suggestProperties(debounced),
    enabled: kind === 'address' && debounced.length >= 3,
    staleTime: 30_000,
  })

  // Close dropdown on outside click.
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  async function analyze() {
    const input = value.trim()
    if (!input || starting) return
    setOpen(false)
    setStarting(true)
    try {
      const res = await startLookup(input)
      if ((res.status === 'found' || res.status === 'done') && res.property_id) {
        navigate(`/properties/${res.property_id}`)
      } else {
        setJob({ id: res.job_id, label: input })
      }
    } catch {
      // Surface a minimal inline error by opening a failed-ish modal? Keep simple: no-op.
    } finally {
      setStarting(false)
    }
  }

  const showDropdown = open && kind === 'address' && (suggestions?.length ?? 0) > 0

  return (
    <div ref={boxRef} className="relative">
      <div className="bg-gradient-to-br from-accent/10 to-accent/5 border border-accent/20 rounded-2xl p-5 shadow-card">
        <div className="flex items-center gap-2 mb-3">
          <h2 className="font-bold text-ink text-base">{t('analyze_title')}</h2>
          {kind && (
            <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full ${kind === 'url' ? 'bg-accent/15 text-accent' : 'bg-emerald-100 text-emerald-700'}`}>
              {kind === 'url' ? <><Link2 size={11} /> {t('analyze_linkDetected')}</> : <><MapPin size={11} /> {t('analyze_addressDetected')}</>}
            </span>
          )}
        </div>

        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
            <input
              value={value}
              onChange={e => { setValue(e.target.value); setOpen(true) }}
              onFocus={() => setOpen(true)}
              onKeyDown={e => { if (e.key === 'Enter') analyze() }}
              placeholder={t('analyze_placeholder')}
              className="w-full h-12 pl-10 pr-3 rounded-xl border border-surface-border bg-white text-sm focus:outline-none focus:ring-2 focus:ring-accent/40"
            />
          </div>
          <button onClick={analyze} disabled={!value.trim() || starting} className="btn-primary px-5 shrink-0">
            {starting ? <Loader2 size={15} className="animate-spin" /> : <>{t('analyze_cta')} <ArrowRight size={14} /></>}
          </button>
        </div>

        <p className="text-xs text-muted mt-2">{t('analyze_hint')}</p>
      </div>

      {/* Autocomplete dropdown — instant hits from our DB */}
      {showDropdown && (
        <div className="absolute left-0 right-0 mt-2 z-30 bg-white border border-surface-border rounded-xl shadow-lg overflow-hidden">
          <div className="px-3 py-2 text-[10px] font-bold text-muted uppercase tracking-wider border-b border-surface-border">
            {t('analyze_inYourDb')}
          </div>
          {suggestions!.slice(0, 6).map(s => (
            <SuggestionRow key={s.id} s={s} onPick={() => { setOpen(false); navigate(`/properties/${s.id}`) }} />
          ))}
          <div className="px-3 py-2 text-[11px] text-muted border-t border-surface-border">{t('analyze_notListed')}</div>
        </div>
      )}

      {job && <AnalyzeProgressModal jobId={job.id} inputLabel={job.label} onClose={() => setJob(null)} />}
    </div>
  )
}

function SuggestionRow({ s, onPick }: { s: AddressSuggestion; onPick: () => void }) {
  return (
    <button onClick={onPick} className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-surface-hover transition-colors text-left">
      <div className="w-8 h-8 rounded-lg bg-surface-hover grid place-items-center shrink-0 border border-surface-border">
        <Building2 size={13} className="text-muted" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-ink truncate">{s.full_address}</p>
        <p className="text-[11px] text-muted">{s.city}</p>
      </div>
      <span className="text-xs font-bold font-mono text-ink tabular-nums shrink-0">{fmtCAD(s.asking_price)}</span>
    </button>
  )
}
