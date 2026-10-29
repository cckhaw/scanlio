/** @type {import('tailwindcss').Config} */
// HIG tokens resolve to CSS variables (see src/index.css) so Light/Dark/System
// switching is a single class flip on <html> with no per-component dark: variants.
const v = (name) => `rgb(var(--${name}) / <alpha-value>)`;

export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        base: v('base'),            // #F5F5F7 / #000000
        surface: v('surface'),      // frosted card (use with bg-surface/80)
        elevated: v('elevated'),
        label: v('label'),          // primary text  #1D1D1F / #F5F5F7
        secondary: v('secondary'),
        tertiary: v('tertiary'),
        separator: v('separator'),
        accent: v('accent'),        // #007AFF / #0A84FF
        success: v('success'),      // #30D158 / #32D74B
        danger: v('danger'),
        warning: v('warning'),
      },
      borderRadius: { card: '24px', btn: '14px' },
      spacing: { 'safe-b': 'env(safe-area-inset-bottom)', 'safe-t': 'env(safe-area-inset-top)' },
      minHeight: { tap: '44px' },
      minWidth: { tap: '44px' },
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', '"SF Pro Text"', '"SF Pro Display"', 'Inter', 'system-ui', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      transitionTimingFunction: { hig: 'cubic-bezier(0.16, 1, 0.3, 1)' },
      backdropBlur: { glass: '20px' },
      boxShadow: {
        glass: '0 8px 32px rgba(0,0,0,0.12)',
        float: '0 12px 40px rgba(0,0,0,0.25)',
      },
      keyframes: {
        sheetUp: { from: { transform: 'translateY(100%)' }, to: { transform: 'translateY(0)' } },
        fadeIn: { from: { opacity: 0 }, to: { opacity: 1 } },
        pop: { '0%': { transform: 'scale(1)' }, '40%': { transform: 'scale(0.92)' }, '100%': { transform: 'scale(1)' } },
        toastIn: { from: { transform: 'translateY(-16px) scale(.96)', opacity: 0 }, to: { transform: 'none', opacity: 1 } },
        flash: { '0%': { opacity: 0.9 }, '100%': { opacity: 0 } },
        check: { from: { strokeDashoffset: 24 }, to: { strokeDashoffset: 0 } },
      },
      animation: {
        'sheet-up': 'sheetUp .45s cubic-bezier(0.16,1,0.3,1)',
        'fade-in': 'fadeIn .3s ease-out',
        pop: 'pop .28s cubic-bezier(0.16,1,0.3,1)',
        'toast-in': 'toastIn .4s cubic-bezier(0.16,1,0.3,1)',
        flash: 'flash .35s ease-out forwards',
        check: 'check .4s .1s cubic-bezier(0.16,1,0.3,1) both',
      },
    },
  },
  plugins: [],
};
