/** @type {import('tailwindcss').Config} */
// Every color reads a CSS variable from src/index.css, so one set of utilities serves both themes.
const token = (name) => `rgb(var(--c-${name}) / <alpha-value>)`

export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: token('ink'), // page background
        sidebar: token('sidebar'),
        card: token('card'),
        raised: token('raised'),
        line: 'var(--line)',
        fg: token('fg'),
        muted: token('muted'),
        brand: token('brand'),
        onbrand: token('onbrand'), // text on a brand-colored fill
        brandink: token('brandink'), // brand-tinted text on a tinted surface
        mint: token('mint'), // success fills and dots
        ok: token('ok'), // success text
        warn: token('warn'),
        danger: token('danger'),
      },
      fontFamily: {
        display: ['"Space Grotesk"', 'sans-serif'],
        sans: ['"DM Sans"', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'Menlo', 'monospace'],
      },
      boxShadow: {
        card: 'var(--shadow-card)',
        glow: 'var(--shadow-accent)',
      },
    },
  },
  plugins: [],
}
