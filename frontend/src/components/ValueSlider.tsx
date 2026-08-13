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
  compact?: boolean
}

export function ValueSlider({
  label, desc, color, value, onChange,
  min, max, step, prefix, suffix, compact,
}: ValueSliderProps) {
  const active = value != null && value > 0
  // The handle sits at min(value, max); the typed number can exceed the track max.
  const sliderVal = Math.min(Math.max(value ?? min, min), max)
  const pct = ((sliderVal - min) / (max - min)) * 100
  const fill = `linear-gradient(to right, ${color} 0%, ${color} ${pct}%, #E2E8F0 ${pct}%, #E2E8F0 100%)`
  // Size the number box to the widest value it can hold (digits + a little room),
  // so 5-6 digit targets like a $100,000 price cut are never clipped.
  const inputCh = Math.max(4, String(Math.max(max, value ?? 0)).length + 1)

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
          {prefix && <span className="pl-2.5 text-xs text-muted select-none">{prefix}</span>}
          <input
            type="number"
            inputMode="numeric"
            min={0}
            step={step}
            value={value ?? ''}
            placeholder="Off"
            onChange={e => commit(e.target.value === '' ? undefined : Number(e.target.value))}
            aria-label={`${label} target`}
            style={{ width: `${inputCh}ch` }}
            className={clsx(
              'no-spinner py-1.5 px-1.5 text-sm font-semibold tabular-nums text-right bg-transparent',
              'focus:outline-none placeholder:text-muted/60 placeholder:font-normal',
              active ? 'text-ink' : 'text-muted',
            )}
          />
          {suffix && <span className="pr-2.5 text-xs text-muted select-none whitespace-nowrap">{suffix}</span>}
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
    </div>
  )
}
