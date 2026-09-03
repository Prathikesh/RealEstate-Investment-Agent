// PlexAi brand assets.
//  • AppIcon      — the gradient "P" mark (pin + house). Full-colour, so it
//    reads on light OR dark backgrounds. Use it standalone, or beside a
//    white wordmark on dark surfaces.
//  • AppWordmark  — the full lockup (mark + "PlexAi"). The wordmark is dark,
//    so use it on LIGHT backgrounds only.
import markUrl from '../assets/plexai-mark.svg'
import logoUrl from '../assets/plexai-logo.png'

interface IconProps { size?: number; className?: string }

export function AppIcon({ size = 24, className = '' }: IconProps) {
  return (
    <img
      src={markUrl}
      alt="PlexAi"
      className={className}
      style={{ height: size, width: 'auto', display: 'block' }}
    />
  )
}

export function AppWordmark({ className = '', iconSize = 26 }: { className?: string; iconSize?: number }) {
  return (
    <img
      src={logoUrl}
      alt="PlexAi"
      className={className}
      style={{ height: Math.round(iconSize * 1.15), width: 'auto', display: 'block' }}
    />
  )
}

// Back-compat alias — existing imports use QuartisIcon.
export const QuartisIcon = AppIcon
