// Plexa — brand mark.
// Named for the Québec "plex" (duplex/triplex/plex — the heart of Montréal
// investment real estate). The mark is a house (property) whose interior rises
// as three ascending bars (investment analytics) — property + intelligence in
// one glyph. Reads cleanly at 16px and on any background.

interface IconProps { size?: number; className?: string }

export function AppIcon({ size = 24, className = '' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" className={className} aria-hidden="true">
      {/* roof */}
      <path
        d="M4.6 14.8 L16 4.8 L27.4 14.8"
        stroke="currentColor" strokeWidth="2.9" strokeLinecap="round" strokeLinejoin="round"
      />
      {/* walls */}
      <path
        d="M7.4 13.2 V26.6 H24.6 V13.2"
        stroke="currentColor" strokeWidth="2.9" strokeLinecap="round" strokeLinejoin="round"
      />
      {/* ascending bars (investment) */}
      <path
        d="M12 22.4 V19.6 M16 22.4 V16.4 M20 22.4 V18.2"
        stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"
      />
    </svg>
  )
}

// Full wordmark lockup (icon + "Plexa").
export function AppWordmark({ className = '', iconSize = 26 }: { className?: string; iconSize?: number }) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <AppIcon size={iconSize} />
      <span className="font-extrabold tracking-tight" style={{ fontSize: iconSize * 0.72 }}>Plexa</span>
    </span>
  )
}

// Back-compat alias — existing imports use QuartisIcon.
export const QuartisIcon = AppIcon
