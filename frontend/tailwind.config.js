/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Dark base per FRONTEND_GUIDELINES.md
        base: '#07131D',
        surface: '#0B2233',
        border: '#15364F',
        // Official Pantone Palette
        // Dark Navy Blue: PANTONE 19-4033 TCX (Poseidon)
        poseidon: {
          DEFAULT: '#123955',
          deep: '#07131D',
          dark: '#0A1C2B',
          surface: '#0E2538',
          light: '#1B4D70',
          border: '#1E4B6E',
        },
        // Light Blue: PANTONE 15-4427 TCX (Norse Blue)
        norse: {
          DEFAULT: '#4CA5C7',
          light: '#7DC0D9',
          pale: '#A8D7E8',
          dark: '#34819E',
          glow: 'rgba(76, 165, 199, 0.4)',
        },
        // Orange-Red: PANTONE 17-1449 TCX (Pureed Pumpkin / Orange-Red)
        orangered: {
          DEFAULT: '#C34121',
          bright: '#E65A33',
          vivid: '#F0714E',
          dark: '#9E3318',
          glow: 'rgba(230, 90, 51, 0.4)',
        },
        // Per-agent accent colors
        security: '#E65A33',
        architecture: '#4CA5C7',
        spec: '#7DC0D9',
        tests: '#10B981',
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'Geist Mono', 'monospace'],
        sans: ['Plus Jakarta Sans', 'Inter', 'system-ui', 'sans-serif'],
      },
      animation: {
        'pulse-border': 'pulse-border 2s ease-in-out infinite',
      },
      keyframes: {
        'pulse-border': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.4' },
        },
      },
    },
  },
  plugins: [],
}
