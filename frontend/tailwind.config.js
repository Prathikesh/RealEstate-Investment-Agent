/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Page background — subtle cool tint, never flat white
        surface: {
          DEFAULT: '#EEF2F7',
          card:    '#FFFFFF',
          hover:   '#E8EDF5',
          border:  '#D8E0EC',
        },
        // Dark sidebar
        sidebar: {
          DEFAULT: '#111827',
          hover:   '#1F2937',
          active:  '#1E3A5F',
          border:  '#1F2937',
          text:    '#9CA3AF',
          heading: '#6B7280',
        },
        accent: {
          DEFAULT: '#2563EB',
          hover:   '#1D4ED8',
          light:   '#EFF6FF',
        },
        score: {
          strong:         '#059669',
          worth:          '#2563EB',
          market:         '#D97706',
          notrecommended: '#DC2626',
        },
        muted: '#6B7280',
        ink:   '#111827',
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
