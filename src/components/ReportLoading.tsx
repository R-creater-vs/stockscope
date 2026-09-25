'use client';

import { useEffect, useState } from 'react';

export const REPORT_WAIT_MS = 30_000;

export default function ReportLoading({ query, startedAt, onCancel }: { query: string; startedAt: number; onCancel: () => void }) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setElapsed(Math.floor((Date.now() - startedAt) / 1000)), 1_000);
    return () => clearInterval(timer);
  }, [startedAt]);

  return <section className="report-loading" aria-labelledby="loading-heading" aria-busy="true">
    <div className="report-loading-heading"><div><span className="eyebrow">YOUR STOCK REPORT</span><h1 id="loading-heading">Opening {query.replace(/\.(NS|BO)$/i, '')}</h1></div>
      <span className="elapsed-time tnum" role="timer" aria-label={`${elapsed} seconds elapsed`}>{elapsed}<span>s elapsed</span></span>
    </div>
    <p role="status">{elapsed < 12 ? 'Fetching price history and company details.' : 'Still waiting for source data. You can cancel or search for another stock.'}</p>
    <p className="fine-print">Source speed varies. If this takes more than 30 seconds, we’ll stop and offer a retry.</p>
    <button className="btn-glass" onClick={onCancel}>Cancel search</button>
    <div className="report-skeleton" aria-hidden="true"><div /><div /><div /></div>
  </section>;
}
