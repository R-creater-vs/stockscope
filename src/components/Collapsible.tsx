'use client';

import { useState, type ReactNode } from 'react';

/**
 * Secondary detail lives behind this. The report has a lot of true, useful
 * information that is not needed to make the decision — showing all of it at
 * once buries the parts that are.
 */
export default function Collapsible({
  title,
  subtitle,
  children,
  defaultOpen = false,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-4 px-5 py-3.5 text-left transition hover:bg-[var(--surface-2)]"
      >
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wider">{title}</h2>
          {subtitle && <p className="mt-0.5 text-xs text-[var(--muted)]">{subtitle}</p>}
        </div>
        <span
          className="shrink-0 text-[var(--muted)] transition-transform duration-200"
          style={{ transform: open ? 'rotate(180deg)' : 'none' }}
          aria-hidden
        >
          ▾
        </span>
      </button>

      {open && <div className="border-t border-[var(--border)]">{children}</div>}
    </section>
  );
}
