import clsx from 'clsx'
import { useLang } from '../context/LanguageContext'

export type ScoreCategory =
  | 'strong_opportunity'
  | 'worth_investigating'
  | 'market_price'
  | 'not_recommended'

interface Props {
  score:    number | null
  category: string | null
  /** sm  = compact pill for tables
   *  card = circle overlay on property photo
   *  lg   = large pill with full label for detail page */
  size?: 'sm' | 'card' | 'lg'
}

const CONFIG: Record<string, {
  bgSolid: string
  bgTint:  string
  text:    string
  border:  string
  textOnSolid: string
  labelKey: 'strongOpportunity' | 'worthInvestigating' | 'marketPrice' | 'notRecommended'
}> = {
  strong_opportunity: {
    bgSolid:     'bg-score-strong',
    bgTint:      'bg-score-strong/15',
    text:        'text-score-strong',
    border:      'border-score-strong/25',
    textOnSolid: 'text-[#0F1117]',
    labelKey:    'strongOpportunity',
  },
  worth_investigating: {
    bgSolid:     'bg-score-worth',
    bgTint:      'bg-score-worth/15',
    text:        'text-score-worth',
    border:      'border-score-worth/25',
    textOnSolid: 'text-white',
    labelKey:    'worthInvestigating',
  },
  market_price: {
    bgSolid:     'bg-score-market',
    bgTint:      'bg-score-market/15',
    text:        'text-score-market',
    border:      'border-score-market/25',
    textOnSolid: 'text-[#0F1117]',
    labelKey:    'marketPrice',
  },
  not_recommended: {
    bgSolid:     'bg-score-notrecommended',
    bgTint:      'bg-score-notrecommended/15',
    text:        'text-score-notrecommended',
    border:      'border-score-notrecommended/25',
    textOnSolid: 'text-white',
    labelKey:    'notRecommended',
  },
}

export default function ScoreBadge({ score, category, size = 'sm' }: Props) {
  const { t } = useLang()

  if (score === null || score === undefined) {
    if (size === 'card') {
      return (
        <div className="w-10 h-10 rounded-full bg-surface-border/80 backdrop-blur flex items-center justify-center">
          <span className="text-xs text-slate-500 font-mono">—</span>
        </div>
      )
    }
    return <span className="text-muted text-xs font-mono">—</span>
  }

  const cat = category ?? scoreToCategory(score)
  const cfg = CONFIG[cat] ?? CONFIG['not_recommended']

  // ── Card overlay: solid circle with score number ──────────────────────────
  if (size === 'card') {
    return (
      <div className={clsx(
        'w-11 h-11 rounded-full flex items-center justify-center shadow-lg',
        cfg.bgSolid,
      )}>
        <span className={clsx('text-sm font-bold font-mono', cfg.textOnSolid)}>
          {score}
        </span>
      </div>
    )
  }

  // ── Large: pill with number + full label ──────────────────────────────────
  if (size === 'lg') {
    return (
      <div className={clsx(
        'inline-flex items-center gap-2 px-3 py-1.5 rounded-full font-semibold',
        cfg.bgTint, cfg.text, 'border', cfg.border,
      )}>
        <span className="font-mono text-lg leading-none">{score}</span>
        <span className="text-xs opacity-80">{t(cfg.labelKey)}</span>
      </div>
    )
  }

  // ── Small (default): compact pill for tables ──────────────────────────────
  return (
    <span className={clsx(
      'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-semibold border',
      cfg.bgTint, cfg.text, cfg.border,
    )}>
      <span className="font-mono font-bold">{score}</span>
    </span>
  )
}

/** Utility: derive category from score number if category string is absent. */
export function scoreToCategory(score: number): ScoreCategory {
  if (score >= 80) return 'strong_opportunity'
  if (score >= 60) return 'worth_investigating'
  if (score >= 40) return 'market_price'
  return 'not_recommended'
}

/** Utility: return the CSS text color class for a category string. */
export function scoreCategoryColor(category: string | null): string {
  if (!category) return 'text-muted'
  return CONFIG[category]?.text ?? 'text-muted'
}

/** Utility: small colored dot bullet for recommendation lines. */
export function ScoreDot({ category }: { category: string | null }) {
  const cfg = category ? CONFIG[category] : null
  return (
    <span className={clsx('inline-block w-2 h-2 rounded-full', cfg?.bgSolid ?? 'bg-surface-border')} />
  )
}
