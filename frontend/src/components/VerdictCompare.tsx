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
  computeFitScore, buildFitRows, categoryForScore, type FitRaw, type FitTargetKey,
} from '../lib/verdict'

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

// i18n key per buy-box factor for the Your Verdict breakdown rows.
const FIT_LABEL_KEY: Record<FitTargetKey, string> = {
  cash_flow_min:      'factor_cash_flow',
  cap_rate_min:       'factor_cap_rate',
  discount_min:       'factor_discount',
  days_on_market_min: 'factor_dom_bonus',
  grm_max:            'factor_grm',
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
      accent ? 'border-accent/40 bg-accent/5' : 'border-surface-border bg-surface-card',
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

  const aiScore = prop.score
  // Estimated (undisclosed) rent → the yield factors are capped so fabricated
  // income can't fake a perfect fit (mirrors the backend guard).
  const incomeEstimated = (prop.score_components?.unverified_income_cap ?? 0) > 0

  // Your Verdict = buy-box FIT: how well the listing meets the broker's real-number
  // targets (matches the server-side ranking on the Properties page). Raw metrics
  // use live financing values when the workbench supplies them.
  const buyBox = user?.custom_buy_box ?? undefined
  const raw: FitRaw = {
    discount:  prop.discount_pct,
    cap_rate:  live?.capRatePct ?? prop.cap_rate,
    cash_flow: live?.monthlyCashFlow ?? prop.monthly_cash_flow,
    days:      prop.days_on_market,
    grm:       prop.grm,
  }
  const yourScore = computeFitScore(buyBox, raw, incomeEstimated, aiScore)
  const yourCategory = categoryForScore(yourScore)

  // Per-factor breakdown behind Your Verdict — the "how did I get this?" answer.
  const breakdown = buildFitRows(buyBox, raw, incomeEstimated)
  const hasTargets = breakdown.rows.length > 0

  const aiCategory = prop.score_category ?? (aiScore != null ? scoreToCategory(aiScore) : 'not_recommended')

  const delta = (aiScore != null && yourScore != null) ? yourScore - aiScore : null
  // "Your Verdict" only diverges from the AI once the broker sets buy-box targets
  // (or runs a live financing scenario). Until then it mirrors the AI, so we say so
  // plainly rather than showing two identical numbers that look broken.
  const personalized = hasTargets || !!live
  const yourSubtitle = live
    ? t('vc_sub_live')
    : hasTargets
      ? t('vc_sub_buybox')
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
        <span>{hasTargets ? t('vc_usingBuyBox') : t('vc_noBuyBox')}</span>
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
          hasTargets ? (
            <div className="mt-2 space-y-1.5">
              {breakdown.rows.map(r => (
                <div key={r.key} className="flex items-center justify-between gap-2 text-[11px]">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="font-semibold text-ink truncate">{t(FIT_LABEL_KEY[r.key])}</span>
                    <span className="text-muted shrink-0">{t('vc_fit_target')} {r.target}</span>
                    {r.isWorst && (
                      <span className="shrink-0 px-1.5 py-px rounded-full bg-amber-100 text-amber-700 font-semibold">{t('vc_badgeWeakest')}</span>
                    )}
                    {r.capped && (
                      <span className="shrink-0 px-1.5 py-px rounded-full bg-amber-100 text-amber-700 font-semibold">{t('vc_badgeCapped')}</span>
                    )}
                  </div>
                  <span className={clsx(
                    'w-10 text-right font-black font-mono',
                    r.fit >= 70 ? 'text-emerald-700' : r.fit >= 40 ? 'text-amber-600' : 'text-red-600',
                  )}>{r.fit}</span>
                </div>
              ))}

              <div className="pt-1.5 mt-0.5 border-t border-surface-border flex items-center justify-between text-[11px]">
                <span className="text-muted">{t('vc_blendLine')}</span>
                <span className="font-mono font-semibold text-ink" />
              </div>
              <div className="pt-1.5 mt-0.5 border-t border-surface-border flex items-center justify-between">
                <span className="text-[11px] font-bold text-ink">{t('vc_yourVerdict')}</span>
                <span className="text-sm font-black font-mono text-accent">{breakdown.total} <span className="text-muted font-semibold">/ 100</span></span>
              </div>
            </div>
          ) : (
            <p className="mt-2 text-[11px] text-muted">{t('vc_noBuyBoxCalc')}</p>
          )
        )}
      </div>
    </div>
  )
}
