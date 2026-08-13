/**
 * ValueSlider — a real-number range slider with a linked, editable number box.
 *
 * The client's "in numbers, not percentages" request: drag the handle along a
 * real-value track (e.g. $0 → $2,500/mo, 0 → 180 days) OR type the exact number;
 * the two stay in sync. `undefined` means the target is off (no filter, ignored
 * in scoring). Used by both the Settings buy box and the Properties filter panel
 * so the two surfaces look and behave identically.
 */
import clsx from 'clsx'

export interface ValueSliderProps {
  label: string
  desc?: string
  color: string
  value: number | undefined
  onChange: (v: number | undefined) => void
  min: number
  max: number
  step: number
  prefix?: string
  suffix?: string
  /** Optional helper line under the slider, e.g. "Listings at 45 days+ score 100 here". */
  hint?: (value: number) => string
  compact?: boolean
}

export function ValueSlider({
  label, desc, color, value, onChange,
  min, max, step, prefix, suffix, hint, compact,
}: ValueSliderProps) {
  const active = value != null && value > 0
  // The handle sits at min(value, max); the typed number can exceed the track max.
  const sliderVal = Math.min(Math.max(value ?? min, min), max)
  const pct = ((sliderVal - min) / (max - min)) * 100
  const fill = `linear-gradient(to right, ${color} 0%, ${color} ${pct}%, #E2E8F0 ${pct}%, #E2E8F0 100%)`

  const commit = (v: number | undefined) => {
    if (v == null || Number.isNaN(v) || v <= 0) onChange(undefined)
    else onChange(v)
  }

  return (
    <div className={clsx(compact ? 'py-1' : 'py-1.5')}>
      <div className="flex items-center justify-between gap-3 mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
          <div className="min-w-0">
            <span className="text-sm font-semibold text-ink">{label}</span>
            {desc && !compact && <span className="block text-[11px] text-muted leading-snug">{desc}</span>}
          </div>
        </div>
        {/* Linked number box */}
        <div className={clsx(
          'flex items-center rounded-lg border bg-white shrink-0 transition-colors',
          active ? 'border-surface-border' : 'border-dashed border-surface-border',
        )}>
          {prefix && <span className="pl-2 text-xs text-muted select-none">{prefix}</span>}
          <input
            type="number"
            inputMode="numeric"
            min={0}
            step={step}
            value={value ?? ''}
            placeholder="Off"
            onChange={e => commit(e.target.value === '' ? undefined : Number(e.target.value))}
            aria-label={`${label} target`}
            className={clsx(
              'w-16 py-1 px-1.5 text-sm font-semibold tabular-nums text-right bg-transparent',
              'focus:outline-none placeholder:text-muted/60 placeholder:font-normal',
              active ? 'text-ink' : 'text-muted',
            )}
          />
          {suffix && <span className="pr-2 text-xs text-muted select-none whitespace-nowrap">{suffix}</span>}
        </div>
      </div>

      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={sliderVal}
        onChange={e => commit(Number(e.target.value))}
        aria-label={`${label} slider`}
        className="range-fill"
        style={{ background: fill, ['--range-color' as string]: color }}
      />

      {hint && (
        <p className="text-[11px] mt-1.5 min-h-[14px]" style={{ color: active ? color : 'transparent' }}>
          {active ? hint(value!) : ' '}
        </p>
      )}
    </div>
  )
}
