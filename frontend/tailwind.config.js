/** @type {import('tailwindcss').Config} */
export default {
  // Theme is driven by CSS variables (see index.css :root / [data-theme=dark]);
  // colors below reference them with <alpha-value> so bg-accent/10 etc. work.
  darkMode: ['selector', '[data-theme="dark"]'],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        surface: {
          DEFAULT: 'rgb(var(--surface) / <alpha-value>)',
          card:    'rgb(var(--surface-card) / <alpha-value>)',
          hover:   'rgb(var(--surface-hover) / <alpha-value>)',
          border:  'rgb(var(--surface-border) / <alpha-value>)',
        },
        accent: {
          DEFAULT: 'rgb(var(--accent) / <alpha-value>)',
          hover:   'rgb(var(--accent-hover) / <alpha-value>)',
          light:   'rgb(var(--accent-light) / <alpha-value>)',
        },
        // Status colors — same hue in both themes (they read fine on dark).
        score: {
          strong:         '#059669',
          worth:          '#2563EB',
          market:         '#D97706',
          notrecommended: '#DC2626',
        },
        muted: 'rgb(var(--muted) / <alpha-value>)',
        ink:   'rgb(var(--ink) / <alpha-value>)',
      },
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'system-ui', 'sans-serif'],
        mono: ['"DM Mono"', 'monospace'],
      },
      borderRadius: {
        xl: '12px',
        '2xl': '16px',
      },
      boxShadow: {
        card: '0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)',
        'card-hover': '0 4px 12px rgba(0,0,0,0.10), 0 2px 4px rgba(0,0,0,0.05)',
        sidebar: '4px 0 24px rgba(0,0,0,0.12)',
      },
      animation: {
        'fade-in': 'fadeIn 0.2s ease-out',
        'slide-up': 'slideUp 0.25s ease-out',
        'scale-in': 'scaleIn 0.15s ease-out',
      },
      keyframes: {
        fadeIn:  { from: { opacity: '0' },                      to: { opacity: '1' } },
        slideUp: { from: { opacity: '0', transform: 'translateY(8px)' }, to: { opacity: '1', transform: 'translateY(0)' } },
        scaleIn: { from: { opacity: '0', transform: 'scale(0.96)' },     to: { opacity: '1', transform: 'scale(1)' } },
      },
    },
  },
  plugins: [],
}
