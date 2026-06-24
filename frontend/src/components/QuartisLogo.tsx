// Arpent — brand mark
// "arpent" = the traditional French-Canadian land measurement unit,
// still referenced in Quebec property records. Our ascending-bar mark
// represents both city skylines (real estate) and analytics (bar chart).

interface IconProps { size?: number; className?: string }

export function AppIcon({ size = 24, className = '' }: IconProps) {
  const s = size
  return (
    <svg width={s} height={s} viewBox="0 0 32 32" fill="none" className={className}>
      {/* bar 1 – shortest  */}
      <rect x="1"  y="21" width="6" height="10" rx="1.5" fill="currentColor" opacity="0.38" />
      {/* bar 2 – medium    */}
      <rect x="9"  y="14" width="6" height="17" rx="1.5" fill="currentColor" opacity="0.62" />
      {/* bar 3 – tallest (centre of gravity) */}
      <rect x="17" y="5"  width="6" height="26" rx="1.5" fill="currentColor" />
      {/* bar 4 – medium-tall */}
      <rect x="25" y="11" width="6" height="20" rx="1.5" fill="currentColor" opacity="0.80" />
    </svg>
  )
}

// Keep old export alias so nothing breaks
export const QuartisIcon = AppIcon
