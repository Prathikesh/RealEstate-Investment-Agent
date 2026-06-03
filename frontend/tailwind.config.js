/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        surface: {
          DEFAULT: '#0F1117',
          card:    '#1A1D27',
          hover:   '#222535',
          border:  '#2A2D3A',
        },
        accent: {
          DEFAULT: '#6C5CE7',
          hover:   '#5649c0',
        },
        score: {
          strong:         '#00D68F',  // green   80-100
          worth:          '#6C5CE7',  // purple  60-79
          market:         '#FFB800',  // amber   40-59
          notrecommended: '#FF4757',  // red     <40
        },
        muted: '#8B8D97',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
    },
  },
  plugins: [],
}
