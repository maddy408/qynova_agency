import { Link, useLocation } from 'react-router-dom';
import { Menu, ShoppingCart, Sparkles, Clock } from 'lucide-react';
import { usePermission } from '../hooks/usePermission';

export function TopHeader({ onOpenMobile }) {
  const location = useLocation();
  const canPos = usePermission('pos.access');

  // Friendly title mapping based on pathname
  const path = location.pathname;
  let pageTitle = 'Dashboard';
  if (path.startsWith('/pos')) pageTitle = 'POS & Billing Counter';
  else if (path.startsWith('/catalog')) pageTitle = 'Catalog Master';
  else if (path.startsWith('/parties') || path.startsWith('/purchasing')) pageTitle = 'Parties & Purchasing';
  else if (path.startsWith('/returns') || path.startsWith('/collections')) pageTitle = 'Returns & Credit';
  else if (path.startsWith('/expenses') || path.startsWith('/cash-handover')) pageTitle = 'Expenses & Handover';
  else if (path.startsWith('/orders')) pageTitle = 'Orders & Indents';
  else if (path.startsWith('/invoices')) pageTitle = 'Invoices Management';
  else if (path.startsWith('/inventory')) pageTitle = 'Inventory & Stock';
  else if (path.startsWith('/reports')) pageTitle = 'Reports & Analytics';
  else if (path.startsWith('/settings') || path.startsWith('/price-adjustment') || path.startsWith('/staff')) pageTitle = 'System Settings';

  const today = new Date().toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

  return (
    <header className="sticky top-0 z-30 flex h-14 w-full items-center justify-between border-b border-[#D5E3F7]/80 bg-white/80 backdrop-blur-md px-4 sm:px-6 shadow-2xs select-none">
      {/* Left: Mobile Toggle & Page Title */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onOpenMobile}
          aria-label="Open navigation menu"
          className="lg:hidden p-1.5 rounded-xl text-[#0B1B45] hover:bg-[#EDF5FF] transition"
        >
          <Menu size={20} />
        </button>

        <div className="flex items-center gap-2">
          <span className="font-extrabold text-sm sm:text-base text-[#0B1B45] tracking-tight">
            {pageTitle}
          </span>
          <span className="hidden sm:inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200/80 rounded-full px-2 py-0.5">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Online
          </span>
        </div>
      </div>

      {/* Right: Quick POS Action & Date */}
      <div className="flex items-center gap-2 sm:gap-3">
        <span className="hidden md:flex items-center gap-1.5 text-xs font-semibold text-slate-500">
          <Clock size={13} className="text-[#2449C6]" />
          {today}
        </span>

        {/* Quick Launch Billing CTA */}
        {canPos && (
          <Link
            to="/pos"
            className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#0B1B45] via-[#142B5C] to-[#2449C6] text-white px-3.5 py-1.5 text-xs font-bold shadow-xs hover:brightness-110 active:scale-95 transition-all"
            title="Open Fullscreen Billing Terminal"
          >
            <ShoppingCart size={14} className="text-[#E8C985]" />
            <span className="hidden xs:inline">Billing Counter</span>
            <span className="rounded-full bg-[#E8C985] text-[#0B1B45] text-[10px] font-black px-1.5 py-0.2">POS</span>
          </Link>
        )}
      </div>
    </header>
  );
}
