import { BUSINESSES, BUSINESS_ORDER, type Business } from '../lib/stark/businesses';

// Top bar on every STARK 2.0 page: which business you're looking at, and the switch.
export default function StarkHeader({ business, path }: { business: Business; path: string }) {
  return (
    <div className="sticky top-0 z-20 flex flex-wrap items-center justify-between gap-3 bg-slate-900 px-6 py-3 text-white">
      <div className="flex items-center gap-3">
        <span className="flex h-8 w-8 items-center justify-center rounded-md bg-orange-500 text-xs font-extrabold">S2</span>
        <div className="leading-tight">
          <p className="text-sm font-bold tracking-wide">STARK 2.0</p>
          <p className="text-xs text-slate-400">Viewing {business.name}</p>
        </div>
      </div>
      <nav aria-label="Business" className="flex gap-1 rounded-lg bg-slate-800 p-1">
        {BUSINESS_ORDER.map((k) => {
          const b = BUSINESSES[k];
          const on = b.key === business.key;
          return (
            <a
              key={k}
              href={`/api/stark/business?b=${k}&next=${encodeURIComponent(path)}`}
              aria-current={on ? 'true' : undefined}
              className={`rounded-md px-4 py-2 text-sm font-semibold ${on ? 'bg-white text-slate-900' : 'text-slate-300 hover:text-white'}`}
            >
              {b.name}
            </a>
          );
        })}
      </nav>
    </div>
  );
}
