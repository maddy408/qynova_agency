import { useEffect, useRef, useState } from 'react';
import { NavLink, Link, useLocation } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  LayoutDashboard, ShoppingCart, Package, Users, Truck, Warehouse, RotateCcw,
  Receipt, BarChart3, Settings as SettingsIcon, LogOut, MapPin, FileText,
  ClipboardList, X, Shield, ChevronRight, Menu
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
        return `group relative flex items-center justify-between rounded-xl px-2.5 py-1.5 text-xs font-semibold transition-all select-none ${
          active
            ? 'bg-gradient-to-r from-[#1D4ED8] via-[#2563EB] to-[#3B82F6] text-white font-extrabold shadow-[0_3px_10px_rgba(37,99,235,0.4)]'
            : 'text-white/80 hover:bg-white/10 hover:text-white'
        }`;
      }}
    >
      {({ isActive }) => {
        const active = isCustomActive !== undefined ? isCustomActive : isActive;
        return (
          <>
            <div className="flex items-center gap-2.5 min-w-0">
              <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-lg transition-colors ${
                active ? 'bg-white/20 text-white' : 'bg-white/5 text-white/80 group-hover:text-white group-hover:bg-white/10'
              }`}>
                <Icon size={14} />
              </span>
              <span className="truncate">{label}</span>
            </div>
            {badge && (
              <span className={`shrink-0 rounded-full px-1.5 py-0.2 text-[9px] font-black tracking-wider uppercase ${
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
    <div className="rounded-xl bg-[#071333]/70 border border-[#1C3675] p-1.5">
      <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-[#93C5FD] mb-0.5">
        <span className="flex items-center gap-1">
          <MapPin size={11} className="text-[#38BDF8]" />
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
        className="w-full rounded-lg bg-[#0B1B45] border border-[#2449C6]/40 px-2 py-1 text-xs font-semibold text-white focus:outline-none focus:border-[#60A5FA] cursor-pointer truncate"
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

export function SideNav({ isOpen, onToggle, onClose }) {
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

  return (
    <>
      {/* Mobile Backdrop Overlay */}
      {isOpen && (
        <div
          onClick={onClose}
          className="fixed inset-0 bg-black/60 backdrop-blur-xs z-40 lg:hidden transition-opacity"
        />
      )}

      {/* Main Sidebar Container - Smooth Collapsible without scrollbar */}
      <aside
        className={`fixed top-0 bottom-0 left-0 z-50 h-screen bg-gradient-to-b from-[#071333] via-[#0B1B45] to-[#0d2257] flex flex-col transition-all duration-300 ease-in-out lg:static lg:shrink-0 overflow-hidden ${
          isOpen
            ? 'w-64 translate-x-0 opacity-100 border-r border-[#1C3675]/70 shadow-2xl lg:shadow-none'
            : 'w-0 -translate-x-full lg:translate-x-0 opacity-0 border-none pointer-events-none shadow-none'
        }`}
      >
        <div className="w-64 flex flex-col h-full shrink-0">
          {/* Brand Header */}
          <div className="relative px-3.5 py-3 border-b border-[#1C3675]/60 shrink-0">
            <div className="flex items-center justify-between">
              <Link to="/" className="flex items-center gap-2 group focus:outline-none min-w-0">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#1E3A8A] via-[#172554] to-[#0B1B45] border border-white/20 text-white shadow-md ring-1 ring-white/10 group-hover:border-white/40 transition-colors">
                  <span className="font-serif font-black text-xs tracking-tighter">AJ</span>
                </div>
                <div className="flex flex-col leading-none truncate">
                  <span className="font-serif text-base font-bold tracking-tight text-white group-hover:text-blue-100 transition-colors drop-shadow-[0_1px_2px_rgba(0,0,0,0.5)] truncate">
                    AJ Agency
                  </span>
                  <span className="text-[7px] font-bold uppercase tracking-wider text-[#93C5FD] mt-0.5 whitespace-nowrap">
                    Distributor Billing
                  </span>
                </div>
              </Link>

              {/* Toggle Button (3-lines Menu Icon) to close sidebar */}
              <button
                type="button"
                onClick={onToggle}
                className="flex items-center justify-center h-8 w-8 rounded-xl text-white/80 hover:text-white hover:bg-white/10 active:scale-95 transition cursor-pointer shrink-0"
                aria-label="Close navigation sidebar"
                title="Close Sidebar"
              >
                <Menu size={18} />
              </button>
            </div>

            {/* Decorative Subtle Blue Arc Under Brand */}
            <div className="absolute left-0 right-0 -bottom-[1px] h-[1px] bg-gradient-to-r from-transparent via-[#3B82F6]/30 to-transparent" />
          </div>

        {/* Navigation Items (Fit completely on screen with NO SCROLLING) */}
        <nav className="flex-1 overflow-hidden px-2.5 py-1.5 space-y-0.5">
          <div className="px-2.5 pb-0.5 pt-1 text-[9.5px] font-extrabold uppercase tracking-widest text-[#93C5FD]/75">
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

          <div className="pt-1.5 px-2.5 pb-0.5 text-[9.5px] font-extrabold uppercase tracking-widest text-[#93C5FD]/75">
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
        <div className="p-2.5 border-t border-[#1C3675]/70 bg-[#071333]/50 space-y-1.5 shrink-0">
          <SidebarBranchSwitcher />

          <div className="flex items-center justify-between gap-2 pt-0.5">
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
              className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-xs font-semibold text-white/85 hover:bg-rose-500/20 hover:text-rose-200 hover:border-rose-500/30 transition-all cursor-pointer shadow-xs"
              title="Logout of session"
            >
              <LogOut size={13} className="text-white/85" />
              <span className="hidden sm:inline">Logout</span>
            </button>
          </div>
        </div>
      </div>
      </aside>
    </>
  );
}
