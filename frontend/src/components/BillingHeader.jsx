import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { LayoutDashboard, LogOut, MapPin, ShoppingBag, ShieldCheck } from 'lucide-react';
import { useAuth } from '../hooks/useAuth.jsx';
import { usePermission } from '../hooks/usePermission';
import { useBranchStore } from '../store/branchStore';
import { branchesApi } from '../api/branches';

export function BillingHeader() {
  const { user, logout } = useAuth();
  const canSwitch = usePermission('branches.switch_context');
  const queryClient = useQueryClient();
  const { selectedBranchId, setSelectedBranchId } = useBranchStore();

  const branchesQuery = useQuery({ queryKey: ['branches'], queryFn: branchesApi.list, enabled: canSwitch });
  const branches = branchesQuery.data || [];

  return (
    <header className="sticky top-0 z-40 bg-gradient-to-r from-[#071333] via-[#0B1B45] to-[#122A63] border-b border-[#1C3675]/80 px-3 sm:px-5 py-2 shadow-md select-none">
      <div className="flex items-center justify-between gap-2">
        {/* Left: Exit to Dashboard + Brand Monogram */}
        <div className="flex items-center gap-3">
          {/* Prominent Dashboard Return Button */}
          <Link
            to="/"
            className="flex items-center gap-2 rounded-xl bg-gradient-to-b from-[#FFF5DE] via-[#FCE9BD] to-[#E8C985] text-[#0B1B45] px-3.5 py-1.5 text-xs font-black shadow-[0_2px_10px_rgba(232,201,133,0.35)] hover:brightness-105 active:scale-95 transition-all"
            title="Exit Billing and Return to Dashboard"
          >
            <LayoutDashboard size={15} className="text-[#0B1B45]" />
            <span>Dashboard</span>
          </Link>

          {/* AJ Agency Monogram and Label */}
          <div className="hidden sm:flex items-center gap-2 border-l border-white/15 pl-3">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-[#122A63] to-[#071333] border border-[#E8C985]/40 text-[#E8C985]">
              <span className="font-serif font-black text-xs">AJ</span>
            </div>
            <div className="flex flex-col leading-tight">
              <span className="font-serif text-sm font-bold text-white leading-none">AJ Agency</span>
              <span className="text-[6.5px] font-bold uppercase tracking-wider text-[#E8C985]/90 mt-0.5">Counter Terminal</span>
            </div>
          </div>
        </div>

        {/* Center: Live Terminal Indicator */}
        <div className="hidden md:flex items-center gap-2 rounded-full bg-white/5 border border-white/10 px-3 py-1">
          <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-[11px] font-bold text-[#E8C985] uppercase tracking-wider">
            Fullscreen POS Terminal
          </span>
        </div>

        {/* Right: Branch & Cashier Info & Logout */}
        <div className="flex items-center gap-2 sm:gap-3">
          {canSwitch && (
            <div className="flex items-center gap-1.5 rounded-xl bg-[#0B1B45]/70 border border-[#2449C6]/40 px-2 py-1 shadow-xs">
              <MapPin size={12} className="text-[#315BFF] shrink-0" />
              <select
                value={selectedBranchId ?? ''}
                onChange={(e) => {
                  setSelectedBranchId(Number(e.target.value));
                  queryClient.invalidateQueries();
                }}
                aria-label="Select active branch"
                className="border-none bg-transparent text-xs font-semibold text-white focus:outline-none [&>option]:text-[#14264F] cursor-pointer max-w-[90px] sm:max-w-[120px] truncate"
              >
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>{b.branch_name}</option>
                ))}
              </select>
            </div>
          )}

          <div className="hidden lg:flex flex-col text-right leading-none">
            <span className="text-xs font-bold text-white">{user?.name || 'Super Admin'}</span>
            <span className="text-[10px] text-[#E8C985]/80 capitalize">{user?.role || 'Admin'}</span>
          </div>

          <button
            type="button"
            onClick={logout}
            className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs font-semibold text-white/85 hover:bg-rose-500/20 hover:text-rose-200 hover:border-rose-500/30 transition-all cursor-pointer shadow-xs"
            title="Logout of session"
          >
            <LogOut size={13} className="text-white/85" />
            <span className="hidden sm:inline">Logout</span>
          </button>
        </div>
      </div>
    </header>
  );
}
