import { useState, useMemo } from 'react';
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

export function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const canViewFinancials = usePermission('dashboard.view_financial_summary');

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [showTotalsReport, setShowTotalsReport] = useState(false);

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

  return (
    <div className="flex flex-col h-[calc(100vh-6.5rem)] justify-between overflow-hidden gap-3 font-sans">
      {/* Header Bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between pb-1 shrink-0">
        <div>
          <h1 className="text-2xl font-black text-[#0F1E4A] tracking-tight">
            Dashboard
          </h1>
          <p className="text-xs text-[#64789D] font-medium mt-0.5">
            Welcome, <span className="font-bold text-[#0F1E4A]">{user?.name}</span> ({user?.role})
          </p>
        </div>

        {/* Search & Totals Button */}
        <div className="flex items-center gap-2.5">
          <div className="relative flex-1 sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[#7E92B2]" size={15} />
            <input
              type="text"
              placeholder="Search modules..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-xl border border-[#D5E3F7] bg-white pl-9 pr-3 py-2 text-xs font-medium text-[#0F1E4A] placeholder-[#7E92B2] shadow-[0_2px_8px_rgba(15,30,65,0.04)] focus:border-[#315BFF] focus:ring-2 focus:ring-[#315BFF]/25 focus:outline-none transition-all"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#7E92B2] hover:text-[#0F1E4A]"
              >
                <X size={14} />
              </button>
            )}
          </div>

          {canViewFinancials && (
            <button
              onClick={() => setShowTotalsReport(true)}
              className="inline-flex items-center gap-2 rounded-xl border border-[#D5E3F7] bg-white px-4 py-2 text-xs font-bold text-[#0F1E4A] shadow-[0_2px_8px_rgba(15,30,65,0.04)] hover:bg-[#EDF5FF] transition-all active:scale-95 shrink-0"
            >
              <PieChart size={15} className="text-[#315BFF]" />
              <span className="hidden sm:inline">Totals Report</span>
            </button>
          )}
        </div>
      </div>

      {/* Category Pills Bar */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs shrink-0 no-scrollbar">
        {CATEGORIES.map((cat) => {
          const isActive = selectedCategory === cat.id;
          return (
            <button
              key={cat.id}
              onClick={() => setSelectedCategory(cat.id)}
              className={`rounded-xl px-4 py-2 text-xs font-bold transition-all whitespace-nowrap flex items-center gap-1.5 ${
                isActive
                  ? 'bg-gradient-to-r from-[#0F1E4A] via-[#14275E] to-[#1C3372] text-white shadow-[0_2px_8px_rgba(15,30,65,0.25)]'
                  : 'bg-white text-[#64789D] border border-[#D5E3F7] hover:text-[#0F1E4A] hover:bg-[#EDF5FF] shadow-2xs'
              }`}
            >
              {cat.id === 'all' && <LayoutGrid size={13} className={isActive ? 'text-white' : 'text-[#315BFF]'} />}
              <span>{cat.label}</span>
            </button>
          );
        })}
      </div>

      {/* Discrepancy Alert Banner */}
      {canViewFinancials && summary && summary.unresolved_handover_discrepancies?.length > 0 && (
        <Card className="border border-red-200 bg-red-50 p-2.5 rounded-xl text-red-800 shrink-0 shadow-xs">
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-2 font-bold text-red-600">
              <AlertTriangle size={16} />
              {summary.unresolved_handover_discrepancies.length} unresolved cash handover discrepancy
            </div>
            <Link to="/cash-handover" className="font-bold text-red-700 underline hover:text-red-900">
              Resolve →
            </Link>
          </div>
        </Card>
      )}

      {/* Module Cards Grid */}
      <div className="flex-1 flex flex-col justify-center my-auto">
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-6 gap-3.5">
          {/* Standard Module Cards Grid */}
          {filteredModules.map((item) => {
            const allowed = usePermission(item.perm);
            if (!allowed) return null;
            const Icon = item.icon;

            // Hero POS Card
            if (item.isHero) {
              return (
                <div
                  key={item.to}
                  onClick={() => navigate(item.to)}
                  className="group col-span-2 row-span-2 cursor-pointer relative rounded-2xl border border-[#CDE1F8] bg-gradient-to-br from-[#F5F9FF] via-[#EBF4FF] to-[#DCEBFF] p-6 text-[#0F1E4A] shadow-[0_4px_20px_rgba(36,73,198,0.07)] transition-all duration-200 hover:shadow-[0_8px_28px_rgba(36,73,198,0.14)] hover:-translate-y-0.5 flex flex-col justify-between overflow-hidden"
                >
                  {/* Subtle ice-blue water glow flourish */}
                  <div className="pointer-events-none absolute -right-12 -bottom-12 w-64 h-64 rounded-full bg-gradient-to-tl from-[#315BFF]/15 via-[#315BFF]/5 to-transparent blur-xl" />
                  <div className="pointer-events-none absolute right-0 top-0 w-48 h-48 rounded-full bg-gradient-to-br from-white/60 to-transparent blur-lg" />

                  <div className="relative z-10 flex items-start justify-between">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-[#315BFF] border border-[#D5E5FC] shadow-xs transition-transform group-hover:scale-105">
                      <ShoppingCart size={22} className="text-[#315BFF]" />
                    </div>
                    <span className="flex items-center gap-1.5 rounded-full bg-gradient-to-r from-[#FFF6E3] to-[#FEF0D0] border border-[#F6DE9F] px-3 py-1 text-[11px] font-bold text-[#A67A1E] shadow-2xs">
                      <span className="text-[#D4A333]">★</span>
                      Primary Module
                    </span>
                  </div>

                  <div className="relative z-10 mt-4">
                    <div className="text-[11px] font-black uppercase tracking-wider text-[#315BFF]">
                      Counter Terminal
                    </div>
                    <h3 className="text-2xl font-black text-[#0F1E4A] tracking-tight mt-1 group-hover:text-[#2449C6] transition-colors">
                      POS &amp; Billing
                    </h3>
                    <p className="mt-1.5 text-xs text-[#5A6E8C] font-medium leading-relaxed max-w-[280px]">
                      {item.subtitle}
                    </p>
                  </div>

                  <div className="relative z-10 mt-5">
                    <div className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-b from-[#FDE8B5] via-[#F6D389] to-[#E5BE6C] px-5 py-2.5 text-xs font-bold text-[#0B1B45] shadow-[0_3px_10px_rgba(229,190,108,0.35)] hover:brightness-105 active:scale-95 transition-all">
                      <span>Launch Counter Terminal</span>
                      <span className="font-bold text-sm">&gt;</span>
                    </div>
                  </div>
                </div>
              );
            }

            // Standard Module Card
            return (
              <div
                key={item.to}
                onClick={() => navigate(item.to)}
                className="group cursor-pointer rounded-2xl border border-[#D8E6F7] bg-white p-4 text-[#0F1E4A] shadow-[0_2px_8px_rgba(15,30,65,0.04)] transition-all duration-200 hover:-translate-y-1 hover:shadow-[0_8px_20px_rgba(15,30,65,0.08)] hover:border-[#B8D5FF] flex flex-col justify-between"
              >
                <div className="flex items-center justify-between">
                  <div className={`flex h-10 w-10 items-center justify-center rounded-xl border ${item.iconColor} shadow-2xs transition-transform group-hover:scale-105`}>
                    <Icon size={20} />
                  </div>
                  <ChevronRight size={15} className="text-[#9BB4D8] group-hover:text-[#315BFF] group-hover:translate-x-0.5 transition-all" />
                </div>

                <div className="mt-3">
                  <h4 className="text-[15px] font-bold text-[#0F1E4A] group-hover:text-[#2449C6] transition-colors truncate">
                    {item.label}
                  </h4>
                  <p className="text-xs font-medium text-[#7E92B2] truncate mt-0.5">
                    {item.subtitle}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Totals Report Modal */}
      {canViewFinancials && showTotalsReport && summary && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
          <div className="w-full max-w-3xl rounded-3xl bg-white p-6 text-[#0F1E4A] shadow-2xl space-y-5 border border-[#D5E3F7]">
            <div className="flex items-center justify-between border-b border-[#D5E3F7] pb-3.5">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#EEF5FF] text-[#315BFF] border border-[#D5E5FC]">
                  <TrendingUp size={20} />
                </div>
                <div>
                  <h2 className="text-base font-bold tracking-wide text-[#0F1E4A]">Financial Summary Report</h2>
                  <p className="text-xs text-[#64789D]">Real-time revenue, purchase &amp; outstanding overview</p>
                </div>
              </div>
              <button
                onClick={() => setShowTotalsReport(false)}
                className="rounded-xl p-1.5 text-[#64789D] hover:bg-[#EDF5FF] hover:text-[#0F1E4A] transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 max-h-[60vh] overflow-y-auto pr-1">
              {SUMMARY_METRICS.map((c) => (
                <div
                  key={c.key}
                  className={`rounded-2xl border border-[#D5E3F7] p-3.5 shadow-2xs ${
                    c.highlight
                      ? 'bg-gradient-to-br from-[#EEF5FF] to-[#E3EFFF] text-[#0F1E4A]'
                      : 'bg-[#F8FAFD] text-[#0F1E4A]'
                  }`}
                >
                  <div className="text-[10px] font-bold uppercase tracking-wider text-[#64789D]">{c.label}</div>
                  <div className="mt-1 text-base font-extrabold text-[#0F1E4A]">
                    Rs. {summary[c.key] ?? '0.00'}
                  </div>
                </div>
              ))}

              <div
                className={`rounded-2xl border border-[#D5E3F7] p-3.5 shadow-2xs ${
                  summary.low_stock_count > 0
                    ? 'bg-amber-50 text-amber-900'
                    : 'bg-[#F8FAFD] text-[#0F1E4A]'
                }`}
              >
                <div className="text-[10px] font-bold uppercase tracking-wider text-[#64789D]">Low Stock Alerts</div>
                <div className="mt-1 text-base font-extrabold text-[#0F1E4A] flex items-center gap-1.5">
                  {summary.low_stock_count} item(s)
                  {summary.low_stock_count > 0 && <AlertCircle className="h-4 w-4 text-amber-600" />}
                </div>
              </div>
            </div>

            <div className="flex justify-between items-center pt-3 border-t border-[#D5E3F7]">
              <Link
                to="/reports"
                onClick={() => setShowTotalsReport(false)}
                className="text-xs font-bold text-[#315BFF] hover:underline flex items-center gap-1"
              >
                Open Detailed Reports Page <ArrowUpRight size={14} />
              </Link>
              <button
                onClick={() => setShowTotalsReport(false)}
                className="rounded-xl bg-gradient-to-r from-[#0F1E4A] to-[#1C3372] px-4 py-2 text-xs font-bold text-white shadow-xs hover:opacity-95 transition-opacity"
              >
                Close Report
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}




