/**
 * AI Verdict vs. Your Verdict — the core of the client's "own metrics" request.
 *
 * AI Verdict is the backend's authoritative stored score (a fixed reference at
 * the listing's standard terms). Your Verdict recombines the same per-factor
 * component scores with the logged-in investor's own weights, and — when `live`
 * financing values are supplied by the FinancingWorkbench — recomputes the
 * cap-rate/cash-flow components on the fly so the score reacts as they change
 * the down payment, rate, rent, etc.
 */
import { useState } from 'react'
import clsx from 'clsx'
import { Link } from 'react-router-dom'
import { Sparkles, SlidersHorizontal, ArrowUpRight, ChevronDown } from 'lucide-react'
import { useLang } from '../context/LanguageContext'
import { useAuth } from '../auth/AuthContext'
import { scoreToCategory } from './ScoreBadge'
import type { PropertyDetail } from '../api'
import {
  computeWeightedScore, buildYourVerdictRows, categoryForScore, withLiveFinancials,
  STRATEGY_WEIGHTS, weightsAreValid, FACTOR_LABEL, type ScoreWeights,
} from '../lib/verdict'
import { componentsForProperty } from '../lib/propertyVerdict'

const CAT_TEXT: Record<string, string> = {
  strong_opportunity:  'text-score-strong',
  worth_investigating: 'text-score-worth',
  market_price:        'text-score-market',
  not_recommended:     'text-score-notrecommended',
}
const CAT_LABEL_KEY: Record<string, 'strongOpportunity' | 'worthInvestigating' | 'marketPrice' | 'notRecommended'> = {
  strong_opportunity:  'strongOpportunity',
  worth_investigating: 'worthInvestigating',
  market_price:        'marketPrice',
  not_recommended:     'notRecommended',
}

// Friendly strategy names — the raw enum ("both") reads badly in a sentence.
const STRATEGY_LABEL_KEY: Record<string, string> = {
  buy_and_hold: 'vc_strat_hold',
  buy_fix_sell: 'vc_strat_flip',
  both:         'vc_strat_both',
}

function VerdictTile({
  icon, title, subtitle, score, category, accent,
}: {
  icon: React.ReactNode
  title: string
  subtitle: string
  score: number | null
  category: string
  accent: boolean
}) {
  const { t } = useLang()
  return (
    <div className={clsx(
      'flex-1 rounded-xl border p-4 text-center',
      accent ? 'border-accent/40 bg-accent/5' : 'border-surface-border bg-white',
    )}>
      <div className="flex items-center justify-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-muted">
        {icon}{title}
      </div>
      <p className={clsx('text-4xl font-black font-mono leading-none mt-2', score != null ? CAT_TEXT[category] : 'text-muted')}>
        {score ?? '—'}
      </p>
      <p className={clsx('text-xs font-semibold mt-1', score != null ? CAT_TEXT[category] : 'text-muted')}>
        {score != null ? t(CAT_LABEL_KEY[category]) : '—'}
      </p>
      <p className="text-[10px] text-muted mt-1">{subtitle}</p>
    </div>
  )
}

export default function VerdictCompare({
  prop,
  live,
  className,
}: {
  prop: PropertyDetail
  live?: { capRatePct?: number | null; monthlyCashFlow?: number | null }
  className?: string
}) {
  const { user } = useAuth()
  const { t } = useLang()
  const [showCalc, setShowCalc] = useState(false)

  const strategy = user?.investment_strategy ?? 'both'
  const customValid = user?.custom_score_weights && weightsAreValid(user.custom_score_weights)
  const weights: ScoreWeights = customValid
    ? (user!.custom_score_weights as ScoreWeights)
    : STRATEGY_WEIGHTS[strategy]

  const base = componentsForProperty(prop)
  const components = live ? withLiveFinancials(base, live) : base

  // Target-relative scoring: when the broker has buy-box targets, score those
  // factors relative to their own numbers (matches the server-side ranking on the
  // Properties page). Raw metrics use live financing values when present.
  const buyBox = user?.custom_buy_box ?? undefined
  const raw = {
    discount:  prop.discount_pct,
    cap_rate:  live?.capRatePct ?? prop.cap_rate,
    cash_flow: live?.monthlyCashFlow ?? prop.monthly_cash_flow,
    dom_bonus: prop.days_on_market,
  }
  const yourScore = computeWeightedScore(components, weights, buyBox, raw)
  const yourCategory = categoryForScore(yourScore)

  // Per-factor breakdown behind Your Verdict — the "how did I get to 100?" answer.
  // `breakdown.total` equals yourScore by construction (same loop as the score).
  const breakdown = buildYourVerdictRows(components, weights, buyBox, raw)
  const yourSubtotal = Math.round(breakdown.rows.reduce((s, r) => s + r.contribution, 0) * 10) / 10
  const yourRounding = Math.round((breakdown.total - yourSubtotal) * 10) / 10

  const aiScore = prop.score
  const aiCategory = prop.score_category ?? (aiScore != null ? scoreToCategory(aiScore) : 'not_recommended')

  const delta = aiScore != null ? yourScore - aiScore : null
  // "Your Verdict" only tells the investor something new once it diverges from
  // the AI — either because they set custom weights, or because they're running
  // live financing scenarios. Until then it mirrors the AI, so we say so plainly
  // rather than showing two identical numbers that look broken.
  const personalized = customValid || !!live
  const yourSubtitle = live
    ? t('vc_sub_live')
    : personalized
      ? t('vc_sub_weights')
      : t('vc_sub_mirror')

  return (
    <div className={clsx('card p-5 space-y-3', className)}>
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-ink">{t('vc_title')}</h3>
        {delta != null && Math.abs(delta) >= 1 && (
          <span className={clsx(
            'text-xs font-bold font-mono px-2 py-0.5 rounded-full',
            delta > 0 ? 'text-score-strong bg-score-strong/10' : 'text-score-notrecommended bg-score-notrecommended/10',
          )}>
            {delta > 0 ? '+' : ''}{delta} {t('vc_vsAI')}
          </span>
        )}
      </div>

      <div className="flex gap-3">
        <VerdictTile
          icon={<Sparkles size={12} className="text-accent" />}
          title={t('vc_aiVerdict')}
          subtitle={t('vc_aiSubtitle')}
          score={aiScore}
          category={aiCategory}
          accent={false}
        />
        <VerdictTile
          icon={<SlidersHorizontal size={12} className="text-accent" />}
          title={t('vc_yourVerdict')}
          subtitle={yourSubtitle}
          score={yourScore}
          category={yourCategory}
          accent={personalized}
        />
      </div>

      <div className="flex items-center justify-between text-[11px] text-muted pt-1">
        <span>
          {customValid
            ? t('vc_usingCustom')
            : `${t('vc_usingDefPre')} ${t(STRATEGY_LABEL_KEY[strategy] ?? 'vc_strat_both')} ${t('vc_usingDefPost')}`}
        </span>
        <Link to="/settings" className="inline-flex items-center gap-0.5 text-accent font-semibold hover:underline">
          {t('vc_adjust')} <ArrowUpRight size={12} />
        </Link>
      </div>

      {/* "How did I get to 100?" — the per-factor breakdown that adds up to Your
          Verdict. Collapsed by default so the tiles stay the focus. */}
      <div className="pt-1 border-t border-surface-border">
        <button
          onClick={() => setShowCalc(v => !v)}
          className="w-full flex items-center justify-between text-[11px] font-semibold text-muted hover:text-ink transition-colors py-0.5"
          aria-expanded={showCalc}
        >
          <span>{showCalc ? t('vc_hideCalc') : t('vc_howCalc')}</span>
          <ChevronDown size={14} className={clsx('transition-transform', showCalc && 'rotate-180')} />
        </button>

        {showCalc && (
          <div className="mt-2 space-y-1.5">
            {breakdown.rows.map(r => (
              <div key={r.factor} className="flex items-center justify-between gap-2 text-[11px]">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="font-semibold text-ink truncate">{FACTOR_LABEL[r.factor]}</span>
                  <span className="text-muted shrink-0">{r.weightPct}% {t('vc_colWeight')}</span>
                  {r.targeted && (
                    <span className="shrink-0 px-1.5 py-px rounded-full bg-accent/10 text-accent font-semibold">{t('vc_badgeTarget')}</span>
                  )}
                  {r.capped && (
                    <span className="shrink-0 px-1.5 py-px rounded-full bg-amber-100 text-amber-700 font-semibold">{t('vc_badgeCapped')}</span>
                  )}
                </div>
                <div className="flex items-center gap-2.5 shrink-0 font-mono">
                  <span className={clsx(
                    'w-7 text-right font-black',
                    r.score >= 70 ? 'text-emerald-700' : r.score >= 40 ? 'text-amber-600' : 'text-red-600',
                  )}>{r.score}</span>
                  <span className="w-10 text-right font-bold text-accent">+{r.contribution.toFixed(1)}</span>
                </div>
              </div>
            ))}

            <div className="pt-1.5 mt-0.5 border-t border-surface-border flex items-center justify-between text-[11px]">
              <span className="text-muted">{t('vc_ledSubtotal')}</span>
              <span className="font-mono font-semibold text-ink">{yourSubtotal.toFixed(1)}</span>
            </div>
            {Math.abs(yourRounding) >= 0.1 && (
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-muted">{t('vc_ledRounding')}</span>
                <span className="font-mono font-semibold text-muted">{yourRounding > 0 ? '+' : ''}{yourRounding.toFixed(1)}</span>
              </div>
            )}
            <div className="pt-1.5 mt-0.5 border-t border-surface-border flex items-center justify-between">
              <span className="text-[11px] font-bold text-ink">{t('vc_yourVerdict')}</span>
              <span className="text-sm font-black font-mono text-accent">{breakdown.total} <span className="text-muted font-semibold">/ 100</span></span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
