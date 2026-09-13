/** Aurelix editorial dark theme — deep forest canvas, cream ink, luminous green/gold/brick. */
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        base: {
          950: '#121712', // app canvas (deep forest black)
          900: '#1A211B', // panels
          850: '#232C24', // raised / bright
          800: '#262F28', // inputs
          700: '#354135', // active / strong
          600: '#4C5B4A',
        },
        accent: {
          200: '#DCE9DC',
          300: '#A9CCAF',
          400: '#5FA878',
          500: '#35855A',
          600: '#236B45', // primary green
          700: '#1A4A31',
        },
        cream: '#F6F1E4', // text on green
        up: '#3CB179',
        updim: '#1C3A2A',
        down: '#D4694E', // bright brick
        downdim: '#3D231B',
        warn: '#D3A83C', // bright gold
        fog: '#A9B5A4',
        mute: '#6E7B6A',
        ink1: '#EFE7D3',
        line: '#2D382E',
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
