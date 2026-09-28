/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // Agricultural, farmer-friendly palette
        leaf: {
          50: '#f0fdf4', 100: '#dcfce7', 200: '#bbf7d0', 300: '#86efac',
          400: '#4ade80', 500: '#22c55e', 600: '#16a34a', 700: '#15803d',
          800: '#166534', 900: '#14532d',
        },
        soil: {
          50: '#fdf8f3', 100: '#f8ead9', 200: '#eed6b6', 300: '#dfb98a',
          400: '#cd9559', 500: '#bd7a37', 600: '#a1612c', 700: '#814a26',
          800: '#6a3e24', 900: '#573421',
        },
        sun: { 50: '#fffbeb', 100: '#fef3c7', 300: '#fcd34d', 500: '#f59e0b', 600: '#d97706' },
        sky: { 400: '#38bdf8', 500: '#0ea5e9', 600: '#0284c7' },
        canvas: '#F8FAFC',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'Noto Sans', 'sans-serif'],
      },
      boxShadow: {
        soft: '0 1px 2px rgba(16,24,40,.04), 0 4px 16px -4px rgba(16,24,40,.08)',
        lift: '0 10px 30px -12px rgba(16,24,40,.18)',
        glow: '0 0 0 4px rgba(34,197,94,.12)',
      },
      borderRadius: { xl2: '1.25rem', '3xl': '1.75rem' },
      keyframes: {
        'fade-up': { '0%': { opacity: 0, transform: 'translateY(10px)' }, '100%': { opacity: 1, transform: 'none' } },
        'fade-in': { '0%': { opacity: 0 }, '100%': { opacity: 1 } },
        'pop-in': { '0%': { opacity: 0, transform: 'scale(.96)' }, '100%': { opacity: 1, transform: 'scale(1)' } },
        float: { '0%,100%': { transform: 'translateY(0)' }, '50%': { transform: 'translateY(-8px)' } },
        shimmer: { '100%': { transform: 'translateX(100%)' } },
      },
      animation: {
        'fade-up': 'fade-up .45s cubic-bezier(.22,1,.36,1) both',
        'fade-in': 'fade-in .3s ease both',
        'pop-in': 'pop-in .22s cubic-bezier(.22,1,.36,1) both',
        float: 'float 5s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};
