import { useEffect, useRef, useState } from 'react';
import { NavLink, Link, useLocation } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  LayoutDashboard, ShoppingCart, Package, Users, Truck, Warehouse, RotateCcw,
  Receipt, BarChart3, Settings as SettingsIcon, LogOut, MapPin, FileText,
  ClipboardList, X, Shield, ChevronRight
} from 'lucide-react';
import { useAuth } from '../hooks/useAuth.jsx';
import { usePermission } from '../hooks/usePermission';
import { useBranchStore } from '../store/branchStore';
import { branchesApi } from '../api/branches';

// Single Sidebar Navigation Link Item
function SideNavItem({ to, label, icon: Icon, end, activePaths, badge, onClick }) {
  const location = useLocation();
  const isCustomActive = activePaths
    ? activePaths.some((p) => location.pathname === p || location.pathname.startsWith(p + '/'))
    : undefined;

  return (
    <NavLink
      to={to}
      end={end}
      onClick={onClick}
      className={({ isActive }) => {
        const active = isCustomActive !== undefined ? isCustomActive : isActive;
        return `group relative flex items-center justify-between rounded-xl px-3 py-2.5 text-xs font-semibold transition-all select-none ${
          active
            ? 'bg-gradient-to-r from-[#1D4ED8] via-[#2563EB] to-[#3B82F6] text-white font-extrabold shadow-[0_4px_14px_rgba(37,99,235,0.4)]'
            : 'text-white/80 hover:bg-white/10 hover:text-white'
        }`;
      }}
    >
      {({ isActive }) => {
        const active = isCustomActive !== undefined ? isCustomActive : isActive;
        return (
          <>
            <div className="flex items-center gap-3 min-w-0">
              <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-colors ${
                active ? 'bg-white/20 text-white' : 'bg-white/5 text-white/80 group-hover:text-white group-hover:bg-white/10'
              }`}>
                <Icon size={15} />
              </span>
              <span className="truncate">{label}</span>
            </div>
            {badge && (
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-black tracking-wider uppercase ${
                active ? 'bg-[#FFF1F5] text-[#BE185D] shadow-2xs' : 'bg-[#FFF1F5]/15 text-[#FDA4AF]'
              }`}>
                {badge}
              </span>
            )}
          </>
        );
      }}
    </NavLink>
  );
}

// Branch Switcher inside Sidebar
function SidebarBranchSwitcher() {
  const canSwitch = usePermission('branches.switch_context');
  const queryClient = useQueryClient();
  const { selectedBranchId, setSelectedBranchId } = useBranchStore();
  const { user } = useAuth();

  const branchesQuery = useQuery({ queryKey: ['branches'], queryFn: branchesApi.list, enabled: canSwitch });
  const branches = branchesQuery.data || [];

  useEffect(() => {
    if (canSwitch && branches.length > 0 && selectedBranchId === null) {
      const home = branches.find((b) => b.id === user?.branch_id) || branches[0];
      setSelectedBranchId(home.id);
    }
  }, [canSwitch, branches, selectedBranchId, user?.branch_id, setSelectedBranchId]);

  if (!canSwitch) return null;

  return (
    <div className="rounded-xl bg-[#071333]/70 border border-[#1C3675] p-2">
      <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-[#93C5FD] mb-1">
        <span className="flex items-center gap-1.5">
          <MapPin size={12} className="text-[#38BDF8]" />
          Active Branch
        </span>
      </div>
      <select
        value={selectedBranchId ?? ''}
        onChange={(e) => {
          setSelectedBranchId(Number(e.target.value));
          queryClient.invalidateQueries();
        }}
        aria-label="Select active branch"
        className="w-full rounded-lg bg-[#0B1B45] border border-[#2449C6]/40 px-2 py-1.5 text-xs font-semibold text-white focus:outline-none focus:border-[#60A5FA] cursor-pointer truncate"
      >
        {branches.map((b) => (
          <option key={b.id} value={b.id} className="text-[#0B1B45] bg-white font-medium">
            {b.branch_name}
          </option>
        ))}
      </select>
    </div>
  );
}

export function SideNav({ mobileOpen, onCloseMobile }) {
  const { user, logout } = useAuth();
  const location = useLocation();

  // Permission flags
  const canDashboard = usePermission('dashboard.view_financial_summary');
  const canPos = usePermission('pos.access');
  const canCatalog = usePermission('catalog.manage_items');
  const canSettings = usePermission('settings.manage');
  const canStaff = usePermission('staff.manage_permissions');
  const canCustomers = usePermission('parties.manage_customers');
  const canSuppliers = usePermission('parties.manage_suppliers');
  const canGrn = usePermission('purchases.create_grn');
  const canReturns = usePermission('returns.sales_return');
  const canCollections = usePermission('collections.field_collection_entry');
  const canExpenses = usePermission('expenses.manage');
  const canHandover = usePermission('handover.submit_cash_handover');
  const canOrders = usePermission(['orders.create_prebooking', 'orders.create_purchase_indent', 'orders.approve_purchase_request', 'orders.manage_prebooking_status']);
  const canInventory = usePermission('inventory.view_stock');
  const canReports = usePermission('reports.view_all');

  // Close mobile drawer on route change
  useEffect(() => {
    if (onCloseMobile) onCloseMobile();
  }, [location.pathname, location.search]);

  return (
    <>
      {/* Mobile Backdrop Overlay */}
      {mobileOpen && (
        <div
          onClick={onCloseMobile}
          className="fixed inset-0 bg-black/60 backdrop-blur-xs z-40 lg:hidden transition-opacity"
        />
      )}

      {/* Main Sidebar Container */}
      <aside
        className={`fixed top-0 bottom-0 left-0 z-50 w-64 bg-gradient-to-b from-[#071333] via-[#0B1B45] to-[#0d2257] border-r border-[#1C3675]/70 flex flex-col transition-transform duration-300 ease-in-out lg:translate-x-0 lg:static lg:h-screen lg:shrink-0 ${
          mobileOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full'
        }`}
      >
        {/* Brand Header */}
        <div className="relative p-4 border-b border-[#1C3675]/60 shrink-0">
          <div className="flex items-center justify-between">
            <Link to="/" className="flex items-center gap-2.5 group focus:outline-none">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#1E3A8A] via-[#172554] to-[#0B1B45] border border-white/20 text-white shadow-md ring-1 ring-white/10 group-hover:border-white/40 transition-colors">
                <span className="font-serif font-black text-sm tracking-tighter">AJ</span>
              </div>
              <div className="flex flex-col leading-none">
                <span className="font-serif text-lg font-bold tracking-tight text-white group-hover:text-blue-100 transition-colors drop-shadow-[0_1px_2px_rgba(0,0,0,0.5)]">
                  AJ Agency
                </span>
                <span className="text-[7.5px] font-bold uppercase tracking-wider text-[#93C5FD] mt-1 whitespace-nowrap">
                  Distributor Billing &amp; Inventory
                </span>
              </div>
            </Link>

            {/* Mobile Close Button */}
            <button
              type="button"
              onClick={onCloseMobile}
              className="lg:hidden p-1.5 rounded-xl text-white/70 hover:text-white hover:bg-white/10 transition"
              aria-label="Close sidebar"
            >
              <X size={18} />
            </button>
          </div>

          {/* Decorative Subtle Blue Arc Under Brand */}
          <div className="absolute left-0 right-0 -bottom-[1px] h-[1px] bg-gradient-to-r from-transparent via-[#3B82F6]/30 to-transparent" />
        </div>

        {/* Navigation Items (Scrollable without 'More' dropdown) */}
        <nav className="flex-1 overflow-y-auto px-3 py-3.5 space-y-1.5 custom-scrollbar">
          <div className="px-3 pb-1.5 text-[10px] font-extrabold uppercase tracking-widest text-[#93C5FD]/75">
            Main Navigation
          </div>

          {canDashboard && (
            <SideNavItem to="/" label="Dashboard" icon={LayoutDashboard} end />
          )}

          {canPos && (
            <SideNavItem to="/pos" label="Billing" icon={ShoppingCart} badge="POS" />
          )}

          {canCatalog && (
            <SideNavItem to="/catalog" label="Catalog" icon={Package} activePaths={['/catalog']} />
          )}

          {(canSettings || canCatalog || canStaff) && (
            <SideNavItem
              to="/settings"
              label="Settings"
              icon={SettingsIcon}
              activePaths={['/settings', '/price-adjustment', '/staff']}
            />
          )}

          {(canCustomers || canSuppliers || canGrn) && (
            <SideNavItem
              to="/parties"
              label="Parties & Purchasing"
              icon={Users}
              activePaths={['/parties', '/purchasing']}
            />
          )}

          {(canReturns || canCollections) && (
            <SideNavItem
              to="/returns"
              label="Returns & Credit"
              icon={RotateCcw}
              activePaths={['/returns', '/collections']}
            />
          )}

          {(canExpenses || canHandover) && (
            <SideNavItem
              to="/expenses"
              label="Expenses & Handover"
              icon={Receipt}
              activePaths={['/expenses', '/cash-handover']}
            />
          )}

          <div className="pt-3 px-3 pb-1.5 text-[10px] font-extrabold uppercase tracking-widest text-[#93C5FD]/75">
            Operations &amp; Reports
          </div>

          {canOrders && (
            <SideNavItem to="/orders" label="Orders & Indents" icon={ClipboardList} activePaths={['/orders']} />
          )}

          {canPos && (
            <SideNavItem to="/invoices" label="Invoices" icon={FileText} activePaths={['/invoices']} />
          )}

          {canInventory && (
            <SideNavItem to="/inventory" label="Inventory" icon={Warehouse} activePaths={['/inventory']} />
          )}

          {canReports && (
            <SideNavItem to="/reports" label="Reports" icon={BarChart3} activePaths={['/reports']} />
          )}
        </nav>

        {/* Footer Area: Branch Context + User Info + Logout */}
        <div className="p-3 border-t border-[#1C3675]/70 bg-[#071333]/50 space-y-2.5 shrink-0">
          <SidebarBranchSwitcher />

          <div className="flex items-center justify-between gap-2 pt-1">
            <div className="flex items-center gap-2 min-w-0">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-[#2449C6] to-[#0B1B45] text-white font-bold text-xs ring-1 ring-white/20">
                {user?.name && user.name !== 'Super Admin' ? user.name.charAt(0).toUpperCase() : 'A'}
              </div>
              <div className="flex flex-col leading-tight min-w-0">
                <span className="text-xs font-bold text-white truncate">{user?.name && user.name !== 'Super Admin' ? user.name : 'Administrator'}</span>
                <span className="text-[10px] text-[#93C5FD] capitalize truncate">{user?.role && user.role !== 'Super Admin' ? user.role : 'Admin'}</span>
              </div>
            </div>

            <button
              type="button"
              onClick={logout}
              className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs font-semibold text-white/85 hover:bg-rose-500/20 hover:text-rose-200 hover:border-rose-500/30 transition-all cursor-pointer shadow-xs"
              title="Logout of session"
            >
              <LogOut size={13} className="text-white/85" />
              <span className="hidden sm:inline">Logout</span>
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
