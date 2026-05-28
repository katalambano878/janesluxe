/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./{app,components,libs,pages,hooks}/**/*.{html,js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        black: '#6B5246',
        brand: {
          primary: '#C89B7B',
          secondary: '#EAD8CB',
          supporting: '#E6C7B2',
          accent: '#D8B48A',
          ivory: '#FFF9F5',
          text: '#6B5246',
          champagne: '#D8B48A',
          /* Legacy aliases → new palette */
          brown: '#6B5246',
          carton: '#E6C7B2',
          cream: '#F7EFE8',
          purple: '#C89B7B',
          pink: '#E6C7B2',
          coral: '#C89B7B',
          yellow: '#FFF9F5',
          tan: '#EAD8CB',
          gold: '#D8B48A',
          oxblood: '#6B5246',
          rose: '#C89B7B',
        },
        gray: {
          50: '#FFF9F5',
          100: '#F7EFE8',
          200: '#EAD8CB',
          300: '#E6C7B2',
          400: '#D8B48A',
          500: '#C89B7B',
          600: '#A57A61',
          700: '#6B5246',
          800: '#5A443A',
          900: '#49372F',
          950: '#372922',
        },
      },
      fontFamily: {
        sans: ['var(--font-manrope)', 'sans-serif'],
        display: ['var(--font-playfair)', 'serif'],
      },
      animation: {
        'just-landed-scroll': 'just-landed-scroll 30s linear infinite',
      },
      keyframes: {
        'just-landed-scroll': {
          '0%': { transform: 'translateX(0)' },
          '100%': { transform: 'translateX(-50%)' },
        },
      },
      boxShadow: {
        soft: '0 4px 24px -4px rgba(107, 82, 70, 0.1)',
        card: '0 10px 30px -12px rgba(107, 82, 70, 0.14)',
      },
    },
  },
  plugins: [],
};
