'use client';

import { useEffect, useRef, useState } from 'react';
import type { SymbolMatch } from '@/lib/yahoo';

interface Props {
  onSelect: (query: string) => void;
  loading: boolean;
}

const POPULAR = ['RELIANCE', 'TCS', 'HDFCBANK', 'INFY', 'TATAMOTORS', 'ITC'];

export default function SearchBar({ onSelect, loading }: Props) {
  const [value, setValue] = useState('');
  const [suggestions, setSuggestions] = useState<SymbolMatch[]>([]);
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  // Debounced autocomplete — Yahoo's search endpoint is rate limited, so we
  // wait for a pause in typing rather than firing on every keystroke. All state
  // updates happen inside the timer or the fetch callback, never synchronously
  // in the effect body, and `cancelled` drops responses that arrive out of order.
  useEffect(() => {
    let cancelled = false;
    const q = value.trim();

    const timer = setTimeout(async () => {
      if (q.length < 2) {
        if (!cancelled) setSuggestions([]);
        return;
      }
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
        const data = (await res.json()) as { results: SymbolMatch[] };
        if (cancelled) return;
        setSuggestions(data.results ?? []);
        setOpen((data.results ?? []).length > 0);
      } catch {
        if (!cancelled) setSuggestions([]);
      }
    }, 300);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [value]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const submit = (q: string) => {
    if (!q.trim()) return;
    setOpen(false);
    setValue(q);
    onSelect(q);
  };

  return (
    <div className="w-full">
      <div ref={boxRef} className="relative">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit(value);
          }}
          className="flex gap-2"
        >
          <div className="relative flex-1">
            <svg
              className="pointer-events-none absolute left-4 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-[var(--muted-2)]"
              viewBox="0 0 20 20"
              fill="none"
              stroke="currentColor"
              aria-hidden
            >
              <circle cx="9" cy="9" r="6" strokeWidth="1.6" />
              <path d="M14 14l4 4" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
            <input
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onFocus={() => suggestions.length && setOpen(true)}
              placeholder="Enter a stock name or symbol — e.g. Reliance, TCS, HDFC Bank"
              className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] py-3.5 pl-11 pr-4 text-[15px] outline-none transition placeholder:text-[var(--muted-2)] focus:border-[var(--accent)] focus:shadow-[0_0_0_4px_var(--ring)]"
              autoComplete="off"
              spellCheck={false}
            />
          </div>
          <button
            type="submit"
            disabled={loading || !value.trim()}
            className="btn-primary shrink-0 px-7 py-3.5 text-[15px]"
          >
            {loading ? 'Analysing…' : 'Analyse'}
          </button>
        </form>

        {open && suggestions.length > 0 && (
          <ul className="glass-panel absolute z-30 mt-2 w-full overflow-hidden animate-fade-in p-1">
            {suggestions.map((s) => (
              <li key={s.symbol}>
                <button
                  onClick={() => submit(s.symbol)}
                  className="flex w-full items-center justify-between rounded-lg px-3.5 py-2.5 text-left text-sm transition hover:bg-[var(--surface-2)]"
                >
                  <span className="truncate">{s.name}</span>
                  <span className="ml-3 flex shrink-0 items-center gap-2 tnum text-xs text-[var(--muted)]">
                    {s.symbol}
                    <span className="rounded bg-[var(--surface-2)] px-1.5 py-0.5">{s.exchange}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="mt-3.5 flex flex-wrap items-center gap-2">
        <span className="text-xs text-[var(--muted-2)]">Try</span>
        {POPULAR.map((p) => (
          <button
            key={p}
            onClick={() => submit(p)}
            className="rounded-lg border border-[var(--border)] bg-[var(--surface)]/60 px-2.5 py-1 text-xs text-[var(--muted)] transition hover:border-[var(--accent)] hover:text-[var(--foreground)]"
          >
            {p}
          </button>
        ))}
      </div>
    </div>
  );
}
