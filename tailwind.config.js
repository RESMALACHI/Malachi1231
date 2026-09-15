/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        // Hebrew-friendly font loaded in index.html
        sans: ['Heebo', 'system-ui', 'Arial', 'sans-serif'],
      },
      colors: {
        brand: {
          50: '#eef2ff',
          100: '#e0e7ff',
          500: '#6366f1',
          600: '#4f46e5',
          700: '#4338ca',
        },
      },
      // Motion tokens — short on purpose: dialogs and pages that take half a
      // second to arrive felt stuck on the office's machines.
      // ── Motion tokens ──────────────────────────────────────────────────────
      keyframes: {
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(14px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'scale-in': {
          '0%': { opacity: '0', transform: 'scale(.94)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        'slide-up': {
          '0%': { opacity: '0', transform: 'translateY(100%)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        pop: {
          '0%': { transform: 'scale(.8)' },
          '60%': { transform: 'scale(1.08)' },
          '100%': { transform: 'scale(1)' },
        },
        'pop-in': {
          '0%': { opacity: '0', transform: 'scale(.8) translateY(10px)' },
          '60%': { opacity: '1', transform: 'scale(1.05)' },
          '100%': { opacity: '1', transform: 'scale(1) translateY(0)' },
        },
        'pulse-ring': {
          '0%': { transform: 'scale(.85)', opacity: '.6' },
          '70%': { transform: 'scale(1.7)', opacity: '0' },
          '100%': { transform: 'scale(1.7)', opacity: '0' },
        },
        'gradient-pan': {
          '0%, 100%': { backgroundPosition: '0% 50%' },
          '50%': { backgroundPosition: '100% 50%' },
        },
        wiggle: {
          '0%, 100%': { transform: 'rotate(0deg)' },
          '25%': { transform: 'rotate(-14deg)' },
          '75%': { transform: 'rotate(14deg)' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-7px)' },
        },
        'bar-grow': {
          '0%': { transform: 'scaleX(0)' },
          '100%': { transform: 'scaleX(1)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '200% 0' },
          '100%': { backgroundPosition: '-200% 0' },
        },
        blob: {
          '0%, 100%': { transform: 'translate(0, 0) scale(1)' },
          '33%': { transform: 'translate(28px, -42px) scale(1.12)' },
          '66%': { transform: 'translate(-26px, 22px) scale(0.92)' },
        },
      },
      animation: {
        'fade-in': 'fade-in .18s ease-out both',
        'fade-up': 'fade-up .3s cubic-bezier(.22,1,.36,1) both',
        // A page arriving: opacity only and quick, so it never waits on itself.
        'page-in': 'fade-in .18s ease-out both',
        'scale-in': 'scale-in .2s cubic-bezier(.22,1,.36,1) both',
        'slide-up': 'slide-up .26s cubic-bezier(.22,1,.36,1) both',
        pop: 'pop .32s cubic-bezier(.34,1.56,.64,1) both',
        'pop-in': 'pop-in .34s cubic-bezier(.34,1.56,.64,1) both',
        'pulse-ring': 'pulse-ring 1.6s cubic-bezier(.24,0,.38,1) infinite',
        'gradient-pan': 'gradient-pan 9s ease infinite',
        wiggle: 'wiggle .6s ease-in-out',
        float: 'float 4.5s ease-in-out infinite',
        'bar-grow': 'bar-grow .8s cubic-bezier(.22,1,.36,1) both',
        shimmer: 'shimmer 1.6s linear infinite',
        blob: 'blob 18s ease-in-out infinite',
      },
    },
  },
  plugins: [],
}
