/** Aurelix editorial dark theme — deep forest canvas, cream ink, luminous green/gold/brick. */
const v = (name) => `rgb(var(--c-${name}) / <alpha-value>)`;

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      // colors are CSS variables (see index.css) so the signed-in app can switch palettes via `.theme-qx`
      colors: {
        base: { 950: v('base-950'), 900: v('base-900'), 850: v('base-850'), 800: v('base-800'), 700: v('base-700'), 600: v('base-600') },
        accent: { 200: v('accent-200'), 300: v('accent-300'), 400: v('accent-400'), 500: v('accent-500'), 600: v('accent-600'), 700: v('accent-700') },
        cream: v('cream'),
        up: v('up'),
        updim: v('updim'),
        down: v('down'),
        downdim: v('downdim'),
        warn: v('warn'),
        fog: v('fog'),
        mute: v('mute'),
        ink1: v('ink1'),
        line: v('line'),
      },
      fontFamily: {
        display: ['Fraunces', '"Iowan Old Style"', '"Palatino Linotype"', 'Palatino', 'Georgia', 'serif'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      boxShadow: {
        panel: '0 1px 2px rgba(0,0,0,0.4)',
        pop: '0 18px 40px -14px rgba(0,0,0,0.6)',
      },
    },
  },
  plugins: [],
};
