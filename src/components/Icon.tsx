import type { SVGProps } from 'react';

export type IconName = 'overview' | 'discover' | 'watchlist' | 'alerts' | 'evidence' | 'arrow' | 'refresh' | 'search' | 'close' | 'signal';
const paths: Record<IconName, string> = {
  overview: 'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z',
  discover: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18 M15.5 8.5l-2 5-5 2 2-5z',
  watchlist: 'M6 4h12v17l-6-4-6 4z',
  alerts: 'M5 16h14l-2-3V9a5 5 0 0 0-10 0v4z M10 20h4 M12 2v2',
  evidence: 'M5 3h14v18H5z M9 8h6 M9 12h6 M9 16h3',
  arrow: 'M5 12h14 M14 7l5 5-5 5',
  refresh: 'M20 7v5h-5 M4 17v-5h5 M6 7a7 7 0 0 1 12-1l2 6 M4 12l2 6a7 7 0 0 0 12-1',
  search: 'M10 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14 M15 15l6 6',
  close: 'M6 6l12 12 M6 18L18 6',
  signal: 'M3 7h6 M3 12h10 M3 17h6 M17 7v10 M21 10v4',
};
export default function Icon({ name, ...props }: SVGProps<SVGSVGElement> & { name: IconName }) {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}><path d={paths[name]} /></svg>;
}
