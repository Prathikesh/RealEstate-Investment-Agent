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
import clsx from 'clsx'
import { Link } from 'react-router-dom'
import { Sparkles, SlidersHorizontal, ArrowUpRight } from 'lucide-react'
import { useLang } from '../context/LanguageContext'
import { useAuth } from '../auth/AuthContext'
import { scoreToCategory } from './ScoreBadge'
import type { PropertyDetail } from '../api'
import {
  computeWeightedScore, categoryForScore, withLiveFinancials,
  STRATEGY_WEIGHTS, weightsAreValid, type ScoreWeights,
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
const STRATEGY_LABEL: Record<string, string> = {
  buy_and_hold: 'Buy & Hold',
  buy_fix_sell: 'Flip (Fix & Sell)',
  both:         'Buy & Hold + Flip',
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

  const strategy = user?.investment_strategy ?? 'both'
  const customValid = user?.custom_score_weights && weightsAreValid(user.custom_score_weights)
  const weights: ScoreWeights = customValid
    ? (user!.custom_score_weights as ScoreWeights)
    : STRATEGY_WEIGHTS[strategy]

  const base = componentsForProperty(prop)
  const components = live ? withLiveFinancials(base, live) : base

  const yourScore = computeWeightedScore(components, weights)
  const yourCategory = categoryForScore(yourScore)

  const aiScore = prop.score
  const aiCategory = prop.score_category ?? (aiScore != null ? scoreToCategory(aiScore) : 'not_recommended')

  const delta = aiScore != null ? yourScore - aiScore : null
  // "Your Verdict" only tells the investor something new once it diverges from
  // the AI — either because they set custom weights, or because they're running
  // live financing scenarios. Until then it mirrors the AI, so we say so plainly
  // rather than showing two identical numbers that look broken.
  const personalized = customValid || !!live
  const yourSubtitle = live
    ? 'your weights · live'
    : personalized
      ? 'your weights'
      : 'mirrors AI until you set your weights'

  return (
    <div className={clsx('card p-5 space-y-3', className)}>
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-ink">AI Verdict vs. Your Verdict</h3>
        {delta != null && Math.abs(delta) >= 1 && (
          <span className={clsx(
            'text-xs font-bold font-mono px-2 py-0.5 rounded-full',
            delta > 0 ? 'text-score-strong bg-score-strong/10' : 'text-score-notrecommended bg-score-notrecommended/10',
          )}>
            {delta > 0 ? '+' : ''}{delta} vs AI
          </span>
        )}
      </div>

      <div className="flex gap-3">
        <VerdictTile
          icon={<Sparkles size={12} className="text-accent" />}
          title="AI Verdict"
          subtitle="AI weighting · listing terms"
          score={aiScore}
          category={aiCategory}
          accent={false}
        />
        <VerdictTile
          icon={<SlidersHorizontal size={12} className="text-accent" />}
          title="Your Verdict"
          subtitle={yourSubtitle}
          score={yourScore}
          category={yourCategory}
          accent={personalized}
        />
      </div>

      <div className="flex items-center justify-between text-[11px] text-muted pt-1">
        <span>
          {customValid
            ? 'Using your custom scoring criteria.'
            : `Using your ${STRATEGY_LABEL[strategy]} defaults — set your own in Settings.`}
        </span>
        <Link to="/settings" className="inline-flex items-center gap-0.5 text-accent font-semibold hover:underline">
          Adjust criteria <ArrowUpRight size={12} />
        </Link>
      </div>
    </div>
  )
}
