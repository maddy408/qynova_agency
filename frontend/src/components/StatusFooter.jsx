import { useEffect, useState } from 'react';

/** Thin persistent status bar — app name/version, online indicator, live clock. */
export function StatusFooter() {
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(id);
  }, []);

  const formatted = now.toLocaleString(undefined, {
    weekday: 'short', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });

  return (
    <footer className="flex items-center justify-between border-t border-[#D5E3F7] bg-white/95 px-6 py-2.5 text-xs font-medium text-slate-500 backdrop-blur-xs">
      <span className="font-semibold text-[#0B1B45]">AJ Agency v1.0.0 &middot; <span className="font-normal text-slate-500">Distributor Billing &amp; Inventory</span></span>
      <span className="flex items-center gap-1.5 font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200/80 rounded-full px-2.5 py-0.5 text-[11px]">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
        Online
      </span>
      <span className="font-semibold text-slate-600">{formatted}</span>
    </footer>
  );
}
