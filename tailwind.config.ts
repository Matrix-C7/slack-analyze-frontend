import type { Config } from 'tailwindcss';

// Colors resolve to CSS variables defined in src/app/globals.css (light + dark).
const v = (name: string) => `var(--${name})`;

export default {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: v('bg'),
        subtle: v('bg-subtle'),
        hover: v('bg-hover'),
        line: v('border'),
        ink: v('text'),
        muted: v('muted'),
        accent: v('accent'),
        'accent-soft': 'color-mix(in srgb, var(--accent) 14%, transparent)',
        rail: v('rail'),
        'rail-2': v('rail-2'),
        side: v('sidebar'),
        'side-hover': v('sidebar-hover'),
        'side-active': v('sidebar-active'),
        'side-text': v('sidebar-text'),
        mark: v('mark'),
        good: v('good'),
        warn: v('warn'),
        bad: v('bad'),
      },
      fontFamily: {
        sans: ['var(--font-lato)', 'Lato', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      boxShadow: {
        card: '0 1px 2px rgb(0 0 0 / 0.04), 0 1px 3px rgb(0 0 0 / 0.06)',
        pop: '0 12px 32px -8px rgb(0 0 0 / 0.28), 0 4px 10px -4px rgb(0 0 0 / 0.12)',
      },
      keyframes: {
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
        'pop-in': { from: { opacity: '0', transform: 'translateY(6px) scale(0.98)' }, to: { opacity: '1', transform: 'none' } },
        'slide-up': { from: { opacity: '0', transform: 'translateY(10px)' }, to: { opacity: '1', transform: 'none' } },
        shimmer: { from: { backgroundPosition: '200% 0' }, to: { backgroundPosition: '-200% 0' } },
      },
      animation: {
        'fade-in': 'fade-in 160ms ease-out',
        'pop-in': 'pop-in 180ms cubic-bezier(0.2, 0.8, 0.2, 1)',
        'slide-up': 'slide-up 220ms cubic-bezier(0.2, 0.8, 0.2, 1)',
        shimmer: 'shimmer 1.6s linear infinite',
      },
    },
  },
  plugins: [],
} satisfies Config;
