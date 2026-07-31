'use client';

import AccountMenu from './AccountMenu';

/**
 * The sticky, glass top bar carried across the whole app. Brand on the left
 * (doubles as "home" — clears any open report), account on the right.
 */
export default function AppHeader({ onHome }: { onHome: () => void }) {
  return (
    <header className="safe-top sticky top-0 z-40 border-b border-[var(--border)]/70 bg-[var(--background)]/70 backdrop-blur-xl">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between px-4 sm:px-6">
        <button onClick={onHome} className="group flex items-center gap-2.5 text-left">
          <span className="brand-mark" aria-hidden>
            {/* Rising candlestick / spark glyph */}
            <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4">
              <path
                d="M4 16.5L9 11l3.5 3.5L20 6.5"
                stroke="white"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path d="M15.5 6.5H20V11" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          <span className="flex items-baseline gap-2">
            <span className="text-[15px] font-bold tracking-tight gradient-text">StockScope</span>
            <span className="hidden rounded bg-[var(--surface-2)] px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-[var(--muted)] sm:inline">
              NSE
            </span>
          </span>
        </button>

        <AccountMenu />
      </div>
    </header>
  );
}
