'use client';

import { useId, useState, type ReactNode } from 'react';

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
  const contentId = useId();
  const triggerId = useId();

  return (
    <section className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={contentId}
        id={triggerId}
        className="flex min-h-14 w-full items-center justify-between gap-4 px-5 py-4 text-left transition hover:bg-[var(--surface-2)]"
      >
        <div>
          <h2 className="text-sm font-semibold">{title}</h2>
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

      <div id={contentId} role="region" aria-labelledby={triggerId} hidden={!open} className={open ? 'border-t border-[var(--border)]' : undefined}>{open && children}</div>
    </section>
  );
}
