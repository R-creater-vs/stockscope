'use client';

import { useEffect, useId, useRef, useState } from 'react';
import type { SymbolMatch } from '@/lib/yahoo';

const EXAMPLES = ['IRFC', 'RELIANCE', 'TCS'];

export default function SearchBar({ onSelect }: { onSelect: (query: string) => void }) {
  const [value, setValue] = useState('');
  const [suggestions, setSuggestions] = useState<SymbolMatch[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const id = useId();
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const query = value.trim();
    if (!open || query.length < 2) return;
    const controller = new AbortController();
    let cancelled = false;
    let deadline: ReturnType<typeof setTimeout> | undefined;
    const timer = setTimeout(async () => {
      setStatus('loading');
      deadline = setTimeout(() => controller.abort(), 7_000);
      try {
        const response = await fetch(`/api/search?q=${encodeURIComponent(query)}`, { signal: controller.signal });
        if (!response.ok) throw new Error('Search unavailable');
        const result = await response.json() as { results?: SymbolMatch[] };
        if (cancelled) return;
        setSuggestions(result.results ?? []);
        setActive(-1);
        setStatus('ready');
      } catch {
        if (!cancelled) { setSuggestions([]); setStatus('error'); }
      } finally { clearTimeout(deadline); }
    }, 250);
    return () => { cancelled = true; clearTimeout(timer); clearTimeout(deadline); controller.abort(); };
  }, [value, open]);

  useEffect(() => {
    const outside = (event: MouseEvent) => {
      if (!boxRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', outside);
    return () => document.removeEventListener('mousedown', outside);
  }, []);

  const submit = (query: string) => {
    if (!query.trim()) return;
    setOpen(false);
    setActive(-1);
    setValue(query.trim());
    onSelect(query.trim());
  };

  return <div ref={boxRef} className="stock-search" onBlur={event => {
    if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
  }}>
    <label htmlFor={id} className="search-label">Search a stock</label>
    <p id={`${id}-hint`} className="search-hint">Type a company name or symbol, then tap Search.</p>
    <div className="relative">
      <form onSubmit={event => { event.preventDefault(); submit(value); }} className="flex gap-2">
        <input id={id} role="combobox" aria-label="Search NSE or BSE company or symbol"
          aria-describedby={`${id}-hint`} aria-autocomplete="list"
          aria-expanded={open && suggestions.length > 0} aria-controls={`${id}-list`}
          aria-activedescendant={open && active >= 0 ? `${id}-option-${active}` : undefined}
          value={value} onChange={event => {
            setValue(event.target.value); setSuggestions([]); setActive(-1); setStatus('idle'); setOpen(true);
          }} onFocus={() => setOpen(true)}
          onKeyDown={event => {
            if (event.key === 'Escape') { setOpen(false); setActive(-1); }
            if (event.key === 'ArrowDown' && suggestions.length) { event.preventDefault(); setOpen(true); setActive(i => (i + 1) % suggestions.length); }
            if (event.key === 'ArrowUp' && suggestions.length) { event.preventDefault(); setOpen(true); setActive(i => (i - 1 + suggestions.length) % suggestions.length); }
            if (event.key === 'Enter' && open && active >= 0 && suggestions[active]) { event.preventDefault(); submit(suggestions[active].symbol); }
          }}
          placeholder="e.g. IRFC or Tata Motors" className="stock-search-input"
          autoComplete="off" autoCapitalize="characters" spellCheck={false} enterKeyHint="search" />
        <button type="submit" disabled={!value.trim()} className="btn-primary shrink-0 px-4 py-3 text-sm">Search</button>
      </form>
      {open && suggestions.length > 0 && <ul id={`${id}-list`} role="listbox" aria-label="Matching companies" className="search-results">
        {suggestions.map((suggestion, index) => <li key={suggestion.symbol} id={`${id}-option-${index}`}
          role="option" aria-selected={active === index}
          onMouseDown={event => event.preventDefault()} onClick={() => submit(suggestion.symbol)}
          className={active === index ? 'search-result active' : 'search-result'}>
          <span>{suggestion.name}</span><span className="tnum">{suggestion.symbol} · {suggestion.exchange}</span>
        </li>)}
      </ul>}
    </div>
    <div className="search-feedback" role="status" aria-live="polite">
      {open && value.trim().length >= 2 && (status === 'loading' ? 'Finding matching companies…' : status === 'error' ? 'Suggestions are unavailable. You can still search by stock symbol.' : status === 'ready' ? suggestions.length ? `${suggestions.length} matching companies. Choose one or tap Search.` : 'No matching company found. Check the name or try its NSE / BSE symbol.' : '')}
    </div>
    <div className="search-popular"><span>Try</span>{EXAMPLES.map(symbol => <button key={symbol} onClick={() => submit(symbol)}>{symbol}</button>)}</div>
  </div>;
}
