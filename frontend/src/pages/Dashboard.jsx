import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  ShoppingCart, Package, Users, Truck, Warehouse, RotateCcw,
  Wallet, Banknote, Receipt, BarChart3, ShieldCheck, Settings as SettingsIcon,
  Building2, ClipboardList, FileText, AlertTriangle, X, Search,
  PieChart, TrendingUp, AlertCircle, ArrowUpRight, Zap, Sparkles, Tag,
  ChevronRight, LayoutGrid
} from 'lucide-react';
import { useAuth } from '../hooks/useAuth.jsx';
import { usePermission } from '../hooks/usePermission';
import { dashboardApi } from '../api/admin';
import { Card } from '../components/Card.jsx';
import { TotalsReportModal } from '../components/TotalsReportModal.jsx';

const MODULES = [
  {
    to: '/pos',
    label: 'POS & Billing',
    subtitle: 'Fast barcode scanning, GST/Non-GST billing & customer checkout',
    perm: 'pos.access',
    icon: ShoppingCart,
    category: 'sales',
    isHero: true,
  },
  {
    to: '/catalog',
    label: 'Products',
    subtitle: 'Items & Rates',
    perm: 'catalog.manage_items',
    icon: Package,
    category: 'stock',
    iconColor: 'bg-[#EEF5FF] text-[#315BFF] border-[#D5E5FC]',
  },
  {
    to: '/price-adjustment',
    label: 'Price Adjustment',
    subtitle: 'Wholesale & Retail',
    perm: 'catalog.manage_items',
    icon: Tag,
    category: 'stock',
    iconColor: 'bg-[#F5F0FF] text-[#7C3AED] border-[#E4D5FC]',
  },
  {
    to: '/inventory',
    label: 'Stock',
    subtitle: 'Store Inventory',
    perm: 'inventory.view_stock',
    icon: Warehouse,
    category: 'stock',
    iconColor: 'bg-[#ECFDF5] text-[#059669] border-[#C6F6D5]',
  },
  {
    to: '/parties',
    label: 'Parties',
    subtitle: 'Customers & Vendors',
    perm: 'parties.manage_customers',
    icon: Users,
    category: 'sales',
    iconColor: 'bg-[#FAF0FF] text-[#9333EA] border-[#F3D5FC]',
  },
  {
    to: '/purchasing',
    label: 'Purchasing',
    subtitle: 'Goods Receipt (GRN)',
    perm: 'purchases.create_grn',
    icon: Truck,
    category: 'stock',
    iconColor: 'bg-[#F0F7FF] text-[#0284C7] border-[#D0E8FF]',
  },
  {
    to: '/orders',
    label: 'Orders',
    subtitle: 'Pre Bookings & Sales',
    perm: 'orders.create_prebooking',
    icon: ClipboardList,
    category: 'sales',
    iconColor: 'bg-[#FFF9EB] text-[#D97706] border-[#FDE68A]',
  },
  {
    to: '/invoices',
    label: 'Invoices',
    subtitle: 'Sales Invoice History',
    perm: 'pos.access',
    icon: FileText,
    category: 'finance',
    iconColor: 'bg-[#ECFDF5] text-[#10B981] border-[#A7F3D0]',
  },
  {
    to: '/collections',
    label: 'Collections',
    subtitle: 'Paid Payments',
    perm: 'collections.field_collection_entry',
    icon: Wallet,
    category: 'finance',
    iconColor: 'bg-[#EFF6FF] text-[#2563EB] border-[#BFDBFE]',
  },
  {
    to: '/cash-handover',
    label: 'Handover',
    subtitle: 'Shift Handover',
    perm: 'handover.submit_cash_handover',
    icon: Banknote,
    category: 'finance',
    iconColor: 'bg-[#ECFDF5] text-[#16A34A] border-[#BBF7D0]',
  },
  {
    to: '/expenses',
    label: 'Expenses',
    subtitle: 'Zone Operating Expenses',
    perm: 'expenses.manage',
    icon: Receipt,
    category: 'finance',
    iconColor: 'bg-[#FDF2F4] text-[#E11D48] border-[#FECDD3]',
  },
  {
    to: '/returns',
    label: 'Returns',
    subtitle: 'Sales Return / Rtn',
    perm: 'returns.sales_return',
    icon: RotateCcw,
    category: 'sales',
    iconColor: 'bg-[#FFF7ED] text-[#EA580C] border-[#FED7AA]',
  },
  {
    to: '/reports',
    label: 'Reports',
    subtitle: 'GST, Sales & Stock',
    perm: 'reports.view_all',
    icon: BarChart3,
    category: 'finance',
    iconColor: 'bg-[#EFF6FF] text-[#3B82F6] border-[#BFDBFE]',
  },
  {
    to: '/staff',
    label: 'Staff',
    subtitle: 'Permissions & Roles',
    perm: 'staff.manage_permissions',
    icon: ShieldCheck,
    category: 'admin',
    iconColor: 'bg-[#EEF2FF] text-[#6366F1] border-[#C7D2FE]',
  },
  {
    to: '/settings',
    label: 'Settings',
    subtitle: 'System Config',
    perm: 'settings.manage',
    icon: SettingsIcon,
    category: 'admin',
    iconColor: 'bg-[#F1F5F9] text-[#475569] border-[#CBD5E1]',
  },
];

const CATEGORIES = [
  { id: 'all', label: 'All Modules' },
  { id: 'sales', label: 'Sales & Orders' },
  { id: 'stock', label: 'Inventory & Stock' },
  { id: 'finance', label: 'Finance & Accounts' },
  { id: 'admin', label: 'Admin & System' },
];

const SUMMARY_METRICS = [
  { key: 'today_sales_revenue', label: "Today's Sales Revenue", highlight: true },
  { key: 'month_sales_total', label: 'Monthly Sales Total' },
  { key: 'today_purchases', label: "Today's Purchases" },
  { key: 'month_purchases_total', label: 'Monthly Purchases Total' },
  { key: 'inventory_valuation', label: 'Inventory Valuation' },
  { key: 'customer_net_outstanding', label: 'Customer Net Outstanding' },
  { key: 'supplier_net_outstanding', label: 'Supplier Net Outstanding' },
  { key: 'employee_collections_today', label: 'Collections Today' },
  { key: 'operating_expenses_today', label: 'Expenses Today' },
  { key: 'extra_income_today', label: 'Extra Income Today' },
];

// Spatial navigation helper: finds the best element in `items` in direction `dir` from `currentEl`
function findNextNavElement(currentEl, items, dir) {
  if (!currentEl || !items || items.length === 0) return null;

  const currentRect = currentEl.getBoundingClientRect();
  const cAx = currentRect.left + currentRect.width / 2;
  const cAy = currentRect.top + currentRect.height / 2;

  let bestEl = null;
  let bestScore = Infinity;

  for (const item of items) {
    if (item === currentEl) continue;

    const rect = item.getBoundingClientRect();
    const cBx = rect.left + rect.width / 2;
    const cBy = rect.top + rect.height / 2;

    let isValid = false;
    let score = Infinity;

    if (dir === 'ArrowRight') {
      isValid = cBx > cAx + 5 && rect.right > currentRect.right + 2;

      if (isValid) {
        const dx = Math.max(0, rect.left - currentRect.right);
        const vOverlap = Math.max(0, Math.min(currentRect.bottom, rect.bottom) - Math.max(currentRect.top, rect.top));
        const dyCenter = Math.abs(cAy - cBy);

        if (vOverlap > 0 || dyCenter < Math.max(currentRect.height, rect.height) * 0.6) {
          const topDiff = Math.abs(rect.top - currentRect.top);
          score = dx * 1.0 + topDiff * 0.2 + dyCenter * 0.2;
        } else {
          isValid = false;
        }
      }
    } else if (dir === 'ArrowLeft') {
      isValid = cBx < cAx - 5 && rect.left < currentRect.left - 2;

      if (isValid) {
        const dx = Math.max(0, currentRect.left - rect.right);
        const vOverlap = Math.max(0, Math.min(currentRect.bottom, rect.bottom) - Math.max(currentRect.top, rect.top));
        const dyCenter = Math.abs(cAy - cBy);

        if (vOverlap > 0 || dyCenter < Math.max(currentRect.height, rect.height) * 0.6) {
          const topDiff = Math.abs(rect.top - currentRect.top);
          score = dx * 1.0 + topDiff * 0.2 + dyCenter * 0.5;
        } else {
          isValid = false;
        }
      }
    } else if (dir === 'ArrowDown') {
      isValid = cBy > cAy + 10 && rect.bottom > currentRect.bottom + 5;

      if (isValid) {
        const dy = Math.max(0, rect.top - currentRect.bottom);
        const hOverlap = Math.max(0, Math.min(currentRect.right, rect.right) - Math.max(currentRect.left, rect.left));
        const dxCenter = Math.abs(cAx - cBx);
        const dxLeft = Math.abs(currentRect.left - rect.left);

        if (hOverlap > 0) {
          score = dy * 2.5 + dxLeft * 0.3 + dxCenter * 0.2;
        } else {
          const dxEdge = Math.min(Math.abs(rect.left - currentRect.right), Math.abs(currentRect.left - rect.right));
          score = dy * 2.5 + dxEdge * 1.2 + 200;
        }
      }
    } else if (dir === 'ArrowUp') {
      isValid = cBy < cAy - 10 && rect.top < currentRect.top - 5;

      if (isValid) {
        const dy = Math.max(0, currentRect.top - rect.bottom);
        const hOverlap = Math.max(0, Math.min(currentRect.right, rect.right) - Math.max(currentRect.left, rect.left));
        const dxCenter = Math.abs(cAx - cBx);
        const dxLeft = Math.abs(currentRect.left - rect.left);

        if (hOverlap > 0) {
          score = dy * 2.5 + dxLeft * 0.3 + dxCenter * 0.2;
        } else {
          const dxEdge = Math.min(Math.abs(rect.left - currentRect.right), Math.abs(currentRect.left - rect.right));
          score = dy * 2.5 + dxEdge * 1.2 + 200;
        }
      }
    }

    if (isValid && score < bestScore) {
      bestScore = score;
      bestEl = item;
    }
  }

  return bestEl;
}

export function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const canViewFinancials = usePermission('dashboard.view_financial_summary');

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [showTotalsReport, setShowTotalsReport] = useState(false);
  const containerRef = useRef(null);

  const summaryQuery = useQuery({
    queryKey: ['dashboard-summary'],
    queryFn: dashboardApi.summary,
    enabled: canViewFinancials,
  });
  const summary = summaryQuery.data;

  // Filter modules based on search & category
  const filteredModules = useMemo(() => {
    return MODULES.filter((m) => {
      const matchesSearch =
        m.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
        m.subtitle.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesCategory = selectedCategory === 'all' || m.category === selectedCategory;
      return matchesSearch && matchesCategory;
    });
  }, [searchQuery, selectedCategory]);

  // Arrow key spatial navigation on the dashboard
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Don't hijack if user is typing in search input, modal, or any input/textarea
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) {
        return;
      }

      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
        const active = document.activeElement;
        const root = containerRef.current;
        if (!root) return;

        const allCards = Array.from(root.querySelectorAll('[data-dashboard-card="true"]'));
        const allFilters = Array.from(root.querySelectorAll('[data-dashboard-filter="true"]'));

        if (!allCards.length && !allFilters.length) return;

        // If nothing inside the dashboard is focused yet, focus the first card or active filter on arrow press
        if (!root.contains(active)) {
          e.preventDefault();
          if (allCards.length > 0) {
            allCards[0].focus();
          } else if (allFilters.length > 0) {
            allFilters[0].focus();
          }
          return;
        }

        // If currently focused on a category filter pill
        if (active.hasAttribute('data-dashboard-filter')) {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            // Move down to the first card
            if (allCards.length > 0) {
              allCards[0].focus();
            }
          } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
            e.preventDefault();
            const nextEl = findNextNavElement(active, allFilters, e.key);
            if (nextEl) nextEl.focus();
          }
          return;
        }

        // If currently focused on a module card
        if (active.hasAttribute('data-dashboard-card')) {
          if (e.key === 'ArrowUp') {
            // Check if there is a card above
            const nextCard = findNextNavElement(active, allCards, 'ArrowUp');
            if (nextCard) {
              e.preventDefault();
              nextCard.focus();
            } else {
              // Reached top row of cards -> move up to active or first filter pill
              e.preventDefault();
              const activeFilter = allFilters.find((f) => f.getAttribute('data-active') === 'true') || allFilters[0];
              if (activeFilter) activeFilter.focus();
            }
            return;
          }

          if (e.key === 'ArrowDown' || e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
            const nextCard = findNextNavElement(active, allCards, e.key);
            if (nextCard) {
              e.preventDefault();
              nextCard.focus();
            }
            return;
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <div ref={containerRef} className="flex flex-col flex-1 h-full justify-between gap-2 sm:gap-2.5 lg:gap-3 font-sans overflow-hidden bg-white">
      {/* Header Bar */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between shrink-0">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-[#0B1B45] tracking-tight">
            Dashboard
          </h1>
          <p className="text-[11px] sm:text-xs text-[#1E293B] font-semibold mt-0.5">
            Distributor Operations &amp; Real-time Counter Management
          </p>
        </div>

        {/* Search & Totals Button */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1 sm:w-60">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[#64748B]" size={14} />
            <input
              type="text"
              placeholder="Search modules..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-xl border border-[#CBD5E1] bg-white pl-8 pr-3 py-1.5 text-xs font-semibold text-[#0B1B45] placeholder-[#64748B] shadow-2xs focus:border-[#2449C6] focus:ring-2 focus:ring-[#2449C6]/20 focus:outline-none transition-all"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#64748B] hover:text-[#0B1B45]"
              >
                <X size={13} />
              </button>
            )}
          </div>

          {canViewFinancials && (
            <button
              onClick={() => setShowTotalsReport(true)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-[#CBD5E1] bg-white px-3.5 py-1.5 text-xs font-bold text-[#0B1B45] shadow-2xs hover:bg-[#EDF5FF] hover:border-[#2449C6] transition-all active:scale-95 shrink-0"
            >
              <PieChart size={14} className="text-[#2449C6]" />
              <span className="hidden sm:inline">Totals Report</span>
            </button>
          )}
        </div>
      </div>

      {/* Category Pills Bar */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1.5 text-xs shrink-0 nav-scrollbar scroll-smooth">
        {CATEGORIES.map((cat) => {
          const isActive = selectedCategory === cat.id;
          return (
            <button
              key={cat.id}
              onClick={() => setSelectedCategory(cat.id)}
              data-dashboard-filter="true"
              data-active={isActive ? 'true' : 'false'}
              tabIndex={0}
              className={`rounded-xl px-3.5 py-1.5 text-xs font-bold transition-all whitespace-nowrap flex items-center gap-1.5 focus:outline-none focus:ring-2 focus:ring-[#2449C6] focus:ring-offset-1 ${
                isActive
                  ? 'bg-gradient-to-r from-[#0B1B45] via-[#142B5C] to-[#1C3675] text-white shadow-md border border-[#0B1B45]'
                  : 'bg-white text-[#334155] border border-[#CBD5E1] hover:text-[#0B1B45] hover:bg-[#EDF5FF] hover:border-[#93C5FD] shadow-2xs'
              }`}
            >
              {cat.id === 'all' && <LayoutGrid size={13} className={isActive ? 'text-white' : 'text-[#2449C6]'} />}
              <span>{cat.label}</span>
            </button>
          );
        })}
      </div>

      {/* Discrepancy Alert Banner */}
      {canViewFinancials && summary && summary.unresolved_handover_discrepancies?.length > 0 && (
        <Card className="border border-red-200 bg-red-50 p-2 rounded-xl text-red-800 shrink-0 shadow-xs">
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-2 font-bold text-red-600">
              <AlertTriangle size={15} />
              {summary.unresolved_handover_discrepancies.length} unresolved cash handover discrepancy
            </div>
            <Link to="/cash-handover" className="font-bold text-red-700 underline hover:text-red-900">
              Resolve →
            </Link>
          </div>
        </Card>
      )}

      {/* Module Cards Grid */}
      <div className="flex-1 flex flex-col justify-center my-auto min-h-0">
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-6 gap-2.5 sm:gap-3 lg:gap-3">
          {/* Standard Module Cards Grid */}
          {filteredModules.map((item) => {
            const allowed = usePermission(item.perm);
            if (!allowed) return null;
            const Icon = item.icon;

            // Hero POS Card: Navy Blue + Royal Blue
            if (item.isHero) {
              return (
                <div
                  key={item.to}
                  data-dashboard-card="true"
                  tabIndex={0}
                  onClick={() => navigate(item.to)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      navigate(item.to);
                    }
                  }}
                  className="group col-span-2 row-span-2 cursor-pointer relative rounded-2xl border-2 border-[#BFDBFE] bg-gradient-to-br from-[#FFFFFF] via-[#F0F5FF] to-[#E0EEFD] p-3.5 sm:p-4 lg:p-4.5 text-[#0B1B45] shadow-[0_6px_20px_rgba(37,99,235,0.08)] transition-all duration-200 hover:shadow-[0_12px_28px_rgba(37,99,235,0.16)] hover:border-[#2563EB] hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-[#2449C6] focus:ring-offset-2 flex flex-col justify-between overflow-hidden"
                >
                  {/* Subtle royal blue water glow flourish */}
                  <div className="pointer-events-none absolute -right-12 -bottom-12 w-64 h-64 rounded-full bg-gradient-to-tl from-[#3B82F6]/20 via-[#60A5FA]/10 to-transparent blur-2xl" />
                  <div className="pointer-events-none absolute right-0 top-0 w-48 h-48 rounded-full bg-gradient-to-br from-white to-transparent blur-lg" />

                  <div className="relative z-10 flex items-start justify-between">
                    <div className="flex h-9 w-9 sm:h-10 sm:w-10 items-center justify-center rounded-xl bg-[#0B1B45] text-[#38BDF8] border border-[#1C3675] shadow-md transition-transform group-hover:scale-105">
                      <ShoppingCart size={19} className="text-[#38BDF8]" />
                    </div>
                    <span className="flex items-center gap-1.5 rounded-full bg-[#EFF6FF] border border-[#BFDBFE] px-2.5 py-0.5 text-[10px] font-extrabold text-[#1D4ED8] shadow-2xs">
                      <Sparkles size={11} className="text-[#2563EB]" />
                      Primary Terminal
                    </span>
                  </div>

                  <div className="relative z-10 mt-2 sm:mt-2.5">
                    <div className="text-[10px] font-black uppercase tracking-wider text-[#2563EB]">
                      Counter Terminal
                    </div>
                    <h3 className="text-xl sm:text-2xl font-black text-[#0B1B45] tracking-tight mt-0.5 group-hover:text-[#1D4ED8] transition-colors">
                      POS &amp; Billing
                    </h3>
                    <p className="mt-1 text-xs text-[#1E293B] font-semibold leading-snug max-w-[280px] line-clamp-2">
                      {item.subtitle}
                    </p>
                  </div>

                  <div className="relative z-10 mt-2.5 sm:mt-3">
                    <div className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-[#0B1B45] via-[#142B5C] to-[#2449C6] px-4 py-1.5 sm:py-2 text-xs font-bold text-white shadow-[0_4px_12px_rgba(11,27,69,0.25)] hover:brightness-110 active:scale-95 transition-all">
                      <span>Launch Counter Terminal</span>
                      <span className="font-extrabold text-sm">&gt;</span>
                    </div>
                  </div>
                </div>
              );
            }

            // Standard Module Card: High contrast, highlighted text & matching background
            return (
              <div
                key={item.to}
                data-dashboard-card="true"
                tabIndex={0}
                onClick={() => navigate(item.to)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    navigate(item.to);
                  }
                }}
                className="group cursor-pointer rounded-2xl border-2 border-[#BFDBFE] bg-gradient-to-br from-[#FFFFFF] via-[#F0F5FF] to-[#E0EEFD] p-2.5 sm:p-3 lg:p-3 text-[#0B1B45] shadow-[0_2px_8px_rgba(37,99,235,0.06)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_8px_20px_rgba(37,99,235,0.12)] hover:border-[#2563EB] focus:outline-none focus:ring-2 focus:ring-[#2449C6] focus:ring-offset-2 flex flex-col justify-between"
              >
                <div className="flex items-center justify-between">
                  <div className={`flex h-8.5 w-8.5 sm:h-9 sm:w-9 items-center justify-center rounded-xl border ${item.iconColor} shadow-2xs transition-transform group-hover:scale-105`}>
                    <Icon size={18} />
                  </div>
                  <ChevronRight size={15} className="text-[#94A3B8] group-hover:text-[#2449C6] group-hover:translate-x-0.5 transition-all" />
                </div>

                <div className="mt-2">
                  <h4 className="text-xs sm:text-sm font-extrabold text-[#0B1B45] group-hover:text-[#2449C6] transition-colors truncate tracking-tight">
                    {item.label}
                  </h4>
                  <p className="text-[11px] font-semibold text-[#1E293B] truncate mt-0.5">
                    {item.subtitle}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Totals Report Modal */}
      {canViewFinancials && (
        <TotalsReportModal
          isOpen={showTotalsReport}
          onClose={() => setShowTotalsReport(false)}
          initialData={summary}
        />
      )}
    </div>
  );
}




