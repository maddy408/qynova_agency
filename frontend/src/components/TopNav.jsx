import { useEffect, useState, useRef } from 'react';
import { NavLink, Link, useLocation } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  LayoutDashboard, ShoppingCart, Package, Users, Truck, Warehouse, RotateCcw,
  Wallet, Banknote, Receipt, BarChart3, ShieldCheck, Settings as SettingsIcon,
  LogOut, ChevronDown, MapPin, FileText, ClipboardList, Tag, Menu, X, MoreHorizontal,
  Building2,
} from 'lucide-react';
import { useAuth } from '../hooks/useAuth.jsx';
import { usePermission } from '../hooks/usePermission';
import { useBranchStore } from '../store/branchStore';
import { branchesApi } from '../api/branches';

// Hook to close dropdowns on click outside
function useClickOutside(ref, handler) {
  const handlerRef = useRef(handler);
  useEffect(() => {
    handlerRef.current = handler;
  });

  useEffect(() => {
    const listener = (event) => {
      if (!ref.current || ref.current.contains(event.target)) return;
      handlerRef.current?.(event);
    };
    document.addEventListener('mousedown', listener);
    document.addEventListener('touchstart', listener);
    return () => {
      document.removeEventListener('mousedown', listener);
      document.removeEventListener('touchstart', listener);
    };
  }, [ref]);
}

// Single Navigation Link Component
function NavItem({ to, label, icon: Icon, end, activePaths, onClick }) {
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
        return `flex shrink-0 items-center gap-1.5 rounded-xl px-2 py-1 text-xs font-semibold transition-all whitespace-nowrap ${
          active
            ? 'bg-gradient-to-b from-[#1D4ED8] via-[#2563EB] to-[#3B82F6] text-white shadow-md font-bold'
            : 'text-white/85 hover:bg-white/10 hover:text-white'
        }`;
      }}
    >
      {({ isActive }) => {
        const active = isCustomActive !== undefined ? isCustomActive : isActive;
        return (
          <>
            <Icon size={14} className={active ? 'text-[#0B1B45]' : 'text-white/85'} />
            <span>{label}</span>
          </>
        );
      }}
    </NavLink>
  );
}

// Dropdown Navigation Group Component
function NavDropdown({ label, icon: Icon, to, items, align = 'left' }) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);
  const location = useLocation();

  useClickOutside(dropdownRef, () => setIsOpen(false));

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') setIsOpen(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  // Close when path or query changes
  useEffect(() => {
    setIsOpen(false);
  }, [location.pathname, location.search]);

  // Check if any sub-item is active
  const isChildActive = items.some((item) => {
    const itemPath = item.to.split('?')[0];
    const itemQuery = item.to.includes('?') ? item.to.split('?')[1] : null;
    if (location.pathname !== itemPath) return false;
    if (!itemQuery) return true;
    return location.search.includes(itemQuery);
  });

  const isParentActive = isChildActive || (to && location.pathname === to);

  // Filter allowed items
  const permittedItems = items.filter((item) => {
    if (!item.perm) return true;
    return Array.isArray(item.perm) ? item.perm.some(Boolean) : Boolean(item.permAllowed);
  });

  if (permittedItems.length === 0) return null;

  return (
    <div
      ref={dropdownRef}
      className="relative shrink-0"
      onMouseEnter={() => setIsOpen(true)}
      onMouseLeave={() => setIsOpen(false)}
    >
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setIsOpen(true);
        }}
        aria-haspopup="true"
        aria-expanded={isOpen}
        className={`flex items-center gap-1 rounded-xl px-1.5 py-1 text-xs font-semibold transition-all whitespace-nowrap cursor-pointer ${
          isParentActive
            ? 'bg-gradient-to-b from-[#1D4ED8] via-[#2563EB] to-[#3B82F6] text-white shadow-md font-bold'
            : 'text-white/85 hover:bg-white/10 hover:text-white'
        }`}
      >
        <Icon size={14} className={isParentActive ? 'text-white' : 'text-white/85'} />
        <span>{label}</span>
        <ChevronDown
          size={11}
          className={`transition-transform duration-200 ${isOpen ? 'rotate-180' : ''} ${
            isParentActive ? 'text-white' : 'text-white/60'
          }`}
        />
      </button>

      {isOpen && (
        <div
          role="menu"
          className={`absolute ${
            align === 'right' ? 'right-0' : 'left-0'
          } top-full mt-1.5 min-w-[210px] rounded-2xl bg-[#0B1B45]/95 backdrop-blur-md border border-[#1C3675] shadow-[0_12px_30px_rgba(0,0,0,0.5)] p-1.5 z-50 animate-in fade-in zoom-in-95 duration-100`}
        >
          {permittedItems.map((item) => {
            const SubIcon = item.icon;
            const itemPath = item.to.split('?')[0];
            const itemQuery = item.to.includes('?') ? item.to.split('?')[1] : null;
            const isSubActive =
              location.pathname === itemPath && (!itemQuery || location.search.includes(itemQuery));

            return (
              <Link
                key={item.to}
                to={item.to}
                role="menuitem"
                onClick={() => setIsOpen(false)}
                className={`flex items-center gap-2.5 rounded-xl px-3 py-2 text-xs transition-all ${
                  isSubActive
                    ? 'bg-gradient-to-r from-[#1D4ED8] via-[#2563EB] to-[#3B82F6] text-white font-bold shadow-xs'
                    : 'text-white/85 hover:bg-[#142B5C] hover:text-[#93C5FD] font-medium'
                }`}
              >
                <SubIcon size={14} className={isSubActive ? 'text-white' : 'text-[#93C5FD]'} />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Branch Context Switcher (Main Branch)
function BranchSwitcher() {
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
    <div className="flex shrink-0 items-center gap-1.5 rounded-xl bg-[#0B1B45]/70 border border-[#2449C6]/30 px-2 py-1 shadow-[0_2px_8px_rgba(0,0,0,0.2)]">
      <MapPin size={13} className="text-[#315BFF] shrink-0" />
      <select
        value={selectedBranchId ?? ''}
        onChange={(e) => {
          setSelectedBranchId(Number(e.target.value));
          queryClient.invalidateQueries();
        }}
        aria-label="Select active branch"
        className="border-none bg-transparent text-xs font-semibold text-white focus:outline-none [&>option]:text-[#14264F] cursor-pointer max-w-[85px] sm:max-w-[120px] truncate"
      >
        {branches.map((b) => (
          <option key={b.id} value={b.id}>{b.branch_name}</option>
        ))}
      </select>
    </div>
  );
}

export function TopNav() {
  const { logout } = useAuth();
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

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

  // Remaining individual items (Orders, Invoices, Inventory, Reports)
  const remainingItems = [
    { to: '/orders', label: 'Orders & Indents', icon: ClipboardList, allowed: canOrders },
    { to: '/invoices', label: 'Invoices', icon: FileText, allowed: canPos },
    { to: '/inventory', label: 'Inventory', icon: Warehouse, allowed: canInventory },
    { to: '/reports', label: 'Reports', icon: BarChart3, allowed: canReports },
  ].filter((i) => i.allowed);

  const moreDropdownGroup = {
    label: 'More',
    icon: MoreHorizontal,
    to: null,
    items: remainingItems.map((item) => ({
      to: item.to,
      label: item.label,
      icon: item.icon,
      permAllowed: true,
    })),
  };

  // Close mobile menu on route change
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname, location.search]);

  return (
    <header className="relative bg-gradient-to-r from-[#071333] via-[#0B1B45] to-[#122A63] border-b border-[#1C3675]/60 px-4 py-2 shadow-md select-none">
      {/* Decorative subtle gold flourish sweep arc under the brand */}
      <svg className="pointer-events-none absolute -left-1 -bottom-1 w-36 h-8 overflow-hidden opacity-60" viewBox="0 0 160 35" fill="none">
        <path d="M 0 28 C 30 32, 60 12, 100 15 C 130 18, 150 8, 160 2" stroke="url(#goldSweepGrad)" strokeWidth="1.2" strokeLinecap="round" />
        <defs>
          <linearGradient id="goldSweepGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#FFF7E0" stopOpacity="0.9" />
            <stop offset="40%" stopColor="#E8C985" stopOpacity="0.8" />
            <stop offset="100%" stopColor="#B3872F" stopOpacity="0" />
          </linearGradient>
        </defs>
      </svg>

      <div className="relative flex items-center justify-between gap-2">
        {/* Left: Compact AJ Agency Brand Identity */}
        <Link to="/" className="flex shrink-0 items-center gap-2 pr-1.5 focus:outline-none select-none group">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-[#122A63] via-[#0B1B45] to-[#071333] border border-[#E8C985]/40 text-[#E8C985] shadow-xs ring-1 ring-white/10 group-hover:border-[#E8C985] transition-colors">
            <span className="font-serif font-black text-xs tracking-tighter">AJ</span>
          </div>
          <div className="flex flex-col leading-none">
            <span className="font-serif text-[15px] font-bold tracking-tight text-white group-hover:text-[#FFF5DE] transition-colors drop-shadow-[0_1px_2px_rgba(0,0,0,0.5)]">
              AJ Agency
            </span>
            <span className="text-[6.5px] font-bold uppercase tracking-wider text-[#E8C985]/90 mt-0.5 whitespace-nowrap">
              Distributor Billing &amp; Inventory
            </span>
          </div>
        </Link>

        {/* Center: Desktop Navigation Bar (Direct links, No dropdown arrows on grouped sections) */}
        <nav className="hidden xl:flex flex-1 items-center gap-0.5 overflow-visible">
          {/* Target Structure: Dashboard | Billing | Catalog */}
          {canDashboard && <NavItem to="/" label="Dashboard" icon={LayoutDashboard} end />}
          {canPos && <NavItem to="/pos" label="Billing" icon={ShoppingCart} />}
          {canCatalog && <NavItem to="/catalog" label="Catalog" icon={Package} />}

          {/* Settings (Direct page with General, Price Adjustment, Staff Price Adjustment, Staff tabs) */}
          {(canSettings || canCatalog || canStaff) && (
            <NavItem
              to="/settings"
              label="Settings"
              icon={SettingsIcon}
              activePaths={['/settings', '/price-adjustment', '/staff']}
            />
          )}

          {/* Parties & Purchasing (Direct page with Customers, Suppliers, Routes, Cities, Purchasing, Purchase Orders, GRN tabs) */}
          {(canCustomers || canSuppliers || canGrn) && (
            <NavItem
              to="/parties"
              label="Parties & Purchasing"
              icon={Users}
              activePaths={['/parties', '/purchasing']}
            />
          )}

          {/* Returns & Credit (Direct page with Returns and Credit tabs) */}
          {(canReturns || canCollections) && (
            <NavItem
              to="/returns"
              label="Returns & Credit"
              icon={RotateCcw}
              activePaths={['/returns', '/collections']}
            />
          )}

          {/* Expenses & Handover (Direct page with Expenses and Handover tabs) */}
          {(canExpenses || canHandover) && (
            <NavItem
              to="/expenses"
              label="Expenses & Handover"
              icon={Receipt}
              activePaths={['/expenses', '/cash-handover']}
            />
          )}

          {/* On very wide screens (>= 1520px), show remaining items inline */}
          <div className="hidden min-[1520px]:flex items-center gap-0.5">
            {remainingItems.map((item) => (
              <NavItem key={item.to} to={item.to} label={item.label} icon={item.icon} />
            ))}
          </div>

          {/* On standard desktop screens (< 1520px), show remaining items in compact More dropdown */}
          {remainingItems.length > 0 && (
            <div className="block min-[1520px]:hidden">
              <NavDropdown {...moreDropdownGroup} align="right" />
            </div>
          )}
        </nav>

        {/* Right: Branch Context & Logout Action */}
        <div className="flex shrink-0 items-center gap-2">
          <BranchSwitcher />

          <button
            type="button"
            onClick={logout}
            className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs font-semibold text-white/85 hover:bg-rose-500/20 hover:text-rose-200 hover:border-rose-500/30 transition-all cursor-pointer shadow-2xs"
            title="Logout of session"
          >
            <LogOut size={14} className="text-white/85" />
            <span className="hidden sm:inline">Logout</span>
          </button>

          {/* Mobile Menu Hamburger Toggle */}
          <button
            type="button"
            onClick={() => setMobileMenuOpen((prev) => !prev)}
            aria-label="Toggle mobile menu"
            className="xl:hidden p-1.5 rounded-xl text-white/85 hover:text-white hover:bg-white/10 transition cursor-pointer"
          >
            {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </div>

      {/* Mobile Navigation Drawer / Menu (Accessible down to 375px) */}
      {mobileMenuOpen && (
        <div className="xl:hidden mt-3 rounded-2xl bg-[#0B1B45] border border-[#1C3675] shadow-2xl p-3.5 space-y-2.5 animate-in slide-in-from-top-2 duration-150">
          <div className="grid grid-cols-2 gap-1.5">
            {canDashboard && <NavItem to="/" label="Dashboard" icon={LayoutDashboard} end onClick={() => setMobileMenuOpen(false)} />}
            {canPos && <NavItem to="/pos" label="Billing" icon={ShoppingCart} onClick={() => setMobileMenuOpen(false)} />}
            {canCatalog && <NavItem to="/catalog" label="Catalog" icon={Package} onClick={() => setMobileMenuOpen(false)} />}
            {(canSettings || canCatalog || canStaff) && (
              <NavItem to="/settings" label="Settings" icon={SettingsIcon} activePaths={['/settings', '/price-adjustment', '/staff']} onClick={() => setMobileMenuOpen(false)} />
            )}
            {(canCustomers || canSuppliers || canGrn) && (
              <NavItem to="/parties" label="Parties & Purchasing" icon={Users} activePaths={['/parties', '/purchasing']} onClick={() => setMobileMenuOpen(false)} />
            )}
            {(canReturns || canCollections) && (
              <NavItem to="/returns" label="Returns & Credit" icon={RotateCcw} activePaths={['/returns', '/collections']} onClick={() => setMobileMenuOpen(false)} />
            )}
            {(canExpenses || canHandover) && (
              <NavItem to="/expenses" label="Expenses & Handover" icon={Receipt} activePaths={['/expenses', '/cash-handover']} onClick={() => setMobileMenuOpen(false)} />
            )}
          </div>

          {remainingItems.length > 0 && (
            <div className="border-t border-[#1C3675]/60 pt-2 grid grid-cols-2 gap-1.5">
              {remainingItems.map((item) => (
                <NavItem key={item.to} to={item.to} label={item.label} icon={item.icon} onClick={() => setMobileMenuOpen(false)} />
              ))}
            </div>
          )}
        </div>
      )}
    </header>
  );
}
