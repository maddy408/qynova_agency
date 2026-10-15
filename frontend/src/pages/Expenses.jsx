import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { DollarSign, Search, Plus, Trash2, CheckCircle2, TrendingUp, TrendingDown, CreditCard, Banknote, Receipt } from 'lucide-react';
import { expenseCategoriesApi, expensesApi, otherIncomeApi } from '../api/postsale';
import { Tabs } from '../components/Tabs';
import { usePermission } from '../hooks/usePermission';
import { Button } from '../components/Button.jsx';
import { CashHandover } from './CashHandover.jsx';
import { Pagination } from '../components/Pagination.jsx';

function ExpensesPanel({ canManage }) {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState('');
  const expensesQuery = useQuery({
    queryKey: ['expenses', page, searchQuery],
    queryFn: () => expensesApi.list({ page, limit: 10, search: searchQuery.trim() || undefined }),
  });
  const categoriesQuery = useQuery({ queryKey: ['expense-categories'], queryFn: expenseCategoriesApi.list });

  const categories = categoriesQuery.data || [];
  const rawExpenses = expensesQuery.data;
  const expenses = Array.isArray(rawExpenses) ? rawExpenses : (rawExpenses?.data || []);
  const totalExpenses = Array.isArray(rawExpenses) ? rawExpenses.length : (rawExpenses?.total ?? expenses.length);

  const [categoryId, setCategoryId] = useState('');
  const [amount, setAmount] = useState('');
  const [paymentMode, setPaymentMode] = useState('cash');
  const [description, setDescription] = useState('');
  const [formError, setFormError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['expenses'] });

  const createMutation = useMutation({
    mutationFn: expensesApi.create,
    onSuccess: () => {
      invalidate();
      resetForm();
      showSuccess('Expense logged successfully!');
    },
  });

  const removeMutation = useMutation({
    mutationFn: expensesApi.remove,
    onSuccess: () => {
      invalidate();
      showSuccess('Expense deleted.');
    },
  });

  const resetForm = () => {
    setCategoryId('');
    setAmount('');
    setPaymentMode('cash');
    setDescription('');
    setFormError('');
  };

  const showSuccess = (msg) => {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(''), 3000);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!categoryId) {
      setFormError('Please select a category.');
      return;
    }
    if (!amount || Number(amount) <= 0) {
      setFormError('Please enter a valid amount.');
      return;
    }
    setFormError('');
    createMutation.mutate({
      category_id: Number(categoryId),
      amount: Number(amount),
      payment_mode: paymentMode,
      description,
    });
  };

  const filteredExpenses = expenses;

  return (
    <div className="space-y-4">
      {successMsg && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs px-4 py-3 rounded-xl flex items-center gap-2.5 font-medium shadow-xs">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          {successMsg}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Left Column Form */}
        <div className="lg:col-span-4">
          <div className="rounded-2xl border border-[#D5E3F7] bg-white shadow-xs p-6 space-y-5 sticky top-6">
            <div className="border-b border-[#EAF1FA] pb-4 flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-rose-50 text-rose-600 ring-1 ring-rose-200">
                <TrendingDown className="w-4 h-4" />
              </div>
              <div>
                <h2 className="font-bold text-[#0B1B45] text-sm">Add Operating Expense</h2>
                <p className="text-[11px] text-slate-500">Record cash outflow or bill</p>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {formError && (
                <div className="text-xs text-rose-800 bg-rose-50 p-3 rounded-xl border border-rose-200 font-medium">
                  {formError}
                </div>
              )}

              <div>
                <label className="text-[11px] font-bold uppercase tracking-wider text-slate-600 block mb-1.5">
                  Expense Category *
                </label>
                <select
                  required
                  value={categoryId}
                  onChange={(e) => setCategoryId(e.target.value)}
                  className="w-full rounded-xl border border-[#D5E3F7] bg-white px-3.5 py-2.5 text-xs text-slate-800 transition focus:border-[#2449C6] focus:outline-none focus:ring-2 focus:ring-[#2449C6]/20"
                >
                  <option value="">-- Select Category --</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-[11px] font-bold uppercase tracking-wider text-slate-600 block mb-1.5">
                  Amount (₹) *
                </label>
                <input
                  required
                  type="number"
                  step="0.01"
                  min="0.01"
                  placeholder="0.00"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-full rounded-xl border border-[#D5E3F7] bg-white px-3.5 py-2 text-sm font-medium text-slate-800 transition focus:border-[#2449C6] focus:outline-none focus:ring-2 focus:ring-[#2449C6]/20"
                />
              </div>

              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-slate-600 block mb-1.5">
                  Payment Mode
                </label>
                <select
                  value={paymentMode}
                  onChange={(e) => setPaymentMode(e.target.value)}
                  className="w-full rounded-xl border border-[#D5E3F7] bg-white px-3.5 py-2 text-sm text-slate-800 capitalize transition focus:border-[#2449C6] focus:outline-none focus:ring-2 focus:ring-[#2449C6]/20"
                >
                  <option value="cash">Cash</option>
                  <option value="upi">UPI</option>
                  <option value="card">Card</option>
                  <option value="bank_transfer">Bank Transfer</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-slate-600 block mb-1.5">
                  Description / Notes
                </label>
                <textarea
                  rows="2"
                  placeholder="Vendor name, bill # or purpose..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full rounded-xl border border-[#D5E3F7] bg-white px-3.5 py-2 text-sm text-slate-800 transition focus:border-[#2449C6] focus:outline-none focus:ring-2 focus:ring-[#2449C6]/20"
                />
              </div>

              {canManage && (
                <div className="pt-2">
                  <Button type="submit" variant="primary" loading={createMutation.isPending} className="w-full shadow-md shadow-[#2449C6]/20">
                    Record Expense
                  </Button>
                </div>
              )}
            </form>
          </div>
        </div>

        {/* Right Column Table */}
        <div className="lg:col-span-8 space-y-4">
          <div className="rounded-2xl border border-[#D5E3F7] bg-white p-4 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="relative w-full sm:w-72">
              <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search expenses..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setPage(1);
                }}
                className="w-full rounded-xl border border-[#D5E3F7] bg-[#F8FAFD] pl-9.5 pr-3.5 py-2 text-xs text-slate-800 transition focus:border-[#2449C6] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#2449C6]/20"
              />
            </div>
            <span className="text-xs font-semibold text-slate-500 bg-[#F5F8FF] px-3 py-1.5 rounded-xl border border-[#D5E3F7]">
              {totalExpenses} expense record(s)
            </span>
          </div>

          <div className="rounded-2xl border border-[#D5E3F7] bg-white shadow-xs overflow-hidden">
            <div className="px-5 py-4 border-b border-[#EAF1FA] bg-[#F8FAFD]/50 flex items-center justify-between">
              <h3 className="font-bold text-[#0B1B45] text-sm">Expenses History</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-[#D5E3F7] bg-[#F5F8FF] text-xs font-bold uppercase tracking-wider text-slate-600">
                    <th className="px-3.5 py-2.5">Expense #</th>
                    <th className="px-3.5 py-2.5">Category</th>
                    <th className="px-3.5 py-2.5 text-right">Amount</th>
                    <th className="px-3.5 py-2.5">Payment Mode</th>
                    <th className="px-3.5 py-2.5">Description</th>
                    <th className="px-3.5 py-2.5">Date</th>
                    <th className="px-3.5 py-2.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#EAF1FA]">
                  {filteredExpenses.map((item) => {
                    const catName = categories.find((c) => c.id === item.category_id)?.name || '-';
                    return (
                      <tr key={item.id} className="hover:bg-[#F5F8FF]/60 transition">
                        <td className="px-3.5 py-2.5 font-mono font-semibold text-[#0B1B45]">{item.expense_no || `#${item.id}`}</td>
                        <td className="px-3.5 py-2.5 font-semibold text-slate-700">{catName}</td>
                        <td className="px-3.5 py-2.5 text-right font-bold text-rose-600 whitespace-nowrap">₹{Number(item.amount).toFixed(2)}</td>
                        <td className="px-3.5 py-2.5">
                          <span className="px-2.5 py-0.5 rounded-full text-xs uppercase font-bold tracking-wider bg-[#F5F8FF] text-[#2449C6] border border-[#D5E3F7]">
                            {item.payment_mode || 'cash'}
                          </span>
                        </td>
                        <td className="px-3.5 py-2.5 text-slate-600">{item.description || '-'}</td>
                        <td className="px-3.5 py-2.5 text-slate-500 text-xs">{item.expense_date || item.created_at || '-'}</td>
                        <td className="px-3.5 py-2.5 text-right">
                          {canManage && (
                            <button
                              onClick={() => removeMutation.mutate(item.id)}
                              className="p-1.5 rounded-lg border border-transparent hover:border-rose-200 hover:bg-rose-50 text-slate-400 hover:text-rose-600 transition"
                              title="Delete Expense"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {filteredExpenses.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-4 py-10 text-center text-slate-400 text-xs">
                        No expenses found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <Pagination
              page={page}
              total={totalExpenses}
              limit={10}
              onPageChange={setPage}
              label="expenses"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function OtherIncomePanel({ canManage }) {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState('');
  const incomeQuery = useQuery({
    queryKey: ['other-income', page, searchQuery],
    queryFn: () => otherIncomeApi.list({ page, limit: 10, search: searchQuery.trim() || undefined }),
  });
  const rawIncomes = incomeQuery.data;
  const incomes = Array.isArray(rawIncomes) ? rawIncomes : (rawIncomes?.data || []);
  const totalIncomes = Array.isArray(rawIncomes) ? rawIncomes.length : (rawIncomes?.total ?? incomes.length);

  const [amount, setAmount] = useState('');
  const [paymentMode, setPaymentMode] = useState('cash');
  const [description, setDescription] = useState('');
  const [formError, setFormError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['other-income'] });

  const createMutation = useMutation({
    mutationFn: otherIncomeApi.create,
    onSuccess: () => {
      invalidate();
      resetForm();
      showSuccess('Extra income logged successfully!');
    },
  });

  const removeMutation = useMutation({
    mutationFn: otherIncomeApi.remove,
    onSuccess: () => {
      invalidate();
      showSuccess('Income record deleted.');
    },
  });

  const resetForm = () => {
    setAmount('');
    setPaymentMode('cash');
    setDescription('');
    setFormError('');
  };

  const showSuccess = (msg) => {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(''), 3000);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!amount || Number(amount) <= 0) {
      setFormError('Please enter a valid amount.');
      return;
    }
    if (!description.trim()) {
      setFormError('Description is required.');
      return;
    }
    setFormError('');
    createMutation.mutate({
      amount: Number(amount),
      payment_mode: paymentMode,
      description: description.trim(),
    });
  };

  const filteredIncomes = incomes;

  return (
    <div className="space-y-4">
      {successMsg && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs px-4 py-3 rounded-xl flex items-center gap-2.5 font-medium shadow-xs">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          {successMsg}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Left Column Form */}
        <div className="lg:col-span-4">
          <div className="rounded-2xl border border-[#D5E3F7] bg-white shadow-xs p-6 space-y-5 sticky top-6">
            <div className="border-b border-[#EAF1FA] pb-4 flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 ring-1 ring-emerald-200">
                <TrendingUp className="w-4 h-4" />
              </div>
              <div>
                <h2 className="font-bold text-[#0B1B45] text-sm">Add Extra Income</h2>
                <p className="text-[11px] text-slate-500">Record scrap, commission, etc.</p>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {formError && (
                <div className="text-xs text-rose-800 bg-rose-50 p-3 rounded-xl border border-rose-200 font-medium">
                  {formError}
                </div>
              )}

              <div>
                <label className="text-[11px] font-bold uppercase tracking-wider text-slate-600 block mb-1.5">
                  Amount (₹) *
                </label>
                <input
                  required
                  type="number"
                  step="0.01"
                  min="0.01"
                  placeholder="0.00"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-full rounded-xl border border-[#D5E3F7] bg-white px-3.5 py-2 text-sm font-medium text-slate-800 transition focus:border-[#2449C6] focus:outline-none focus:ring-2 focus:ring-[#2449C6]/20"
                />
              </div>

              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-slate-600 block mb-1.5">
                  Payment Mode
                </label>
                <select
                  value={paymentMode}
                  onChange={(e) => setPaymentMode(e.target.value)}
                  className="w-full rounded-xl border border-[#D5E3F7] bg-white px-3.5 py-2 text-sm text-slate-800 capitalize transition focus:border-[#2449C6] focus:outline-none focus:ring-2 focus:ring-[#2449C6]/20"
                >
                  <option value="cash">Cash</option>
                  <option value="upi">UPI</option>
                  <option value="card">Card</option>
                  <option value="bank_transfer">Bank Transfer</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-slate-600 block mb-1.5">
                  Description / Source *
                </label>
                <textarea
                  required
                  rows="3"
                  placeholder="Scrap sale, commission, rent received..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full rounded-xl border border-[#D5E3F7] bg-white px-3.5 py-2 text-sm text-slate-800 transition focus:border-[#2449C6] focus:outline-none focus:ring-2 focus:ring-[#2449C6]/20"
                />
              </div>

              {canManage && (
                <div className="pt-2">
                  <Button type="submit" variant="primary" loading={createMutation.isPending} className="w-full shadow-md shadow-[#2449C6]/20">
                    Record Income
                  </Button>
                </div>
              )}
            </form>
          </div>
        </div>

        {/* Right Column Table */}
        <div className="lg:col-span-8 space-y-4">
          <div className="rounded-2xl border border-[#D5E3F7] bg-white p-4 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="relative w-full sm:w-72">
              <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search receipts..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setPage(1);
                }}
                className="w-full rounded-xl border border-[#D5E3F7] bg-[#F8FAFD] pl-9.5 pr-3.5 py-2 text-xs text-slate-800 transition focus:border-[#2449C6] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#2449C6]/20"
              />
            </div>
            <span className="text-xs font-semibold text-slate-500 bg-[#F5F8FF] px-3 py-1.5 rounded-xl border border-[#D5E3F7]">
              {totalIncomes} receipt record(s)
            </span>
          </div>

          <div className="rounded-2xl border border-[#D5E3F7] bg-white shadow-xs overflow-hidden">
            <div className="px-5 py-4 border-b border-[#EAF1FA] bg-[#F8FAFD]/50 flex items-center justify-between">
              <h3 className="font-bold text-[#0B1B45] text-sm">Income Receipts History</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-[#D5E3F7] bg-[#F5F8FF] text-xs font-bold uppercase tracking-wider text-slate-600">
                    <th className="px-3.5 py-2.5">Receipt #</th>
                    <th className="px-3.5 py-2.5 text-right">Amount</th>
                    <th className="px-3.5 py-2.5">Payment Mode</th>
                    <th className="px-3.5 py-2.5">Description</th>
                    <th className="px-3.5 py-2.5">Date</th>
                    <th className="px-3.5 py-2.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#EAF1FA]">
                  {filteredIncomes.map((item) => (
                    <tr key={item.id} className="hover:bg-[#F5F8FF]/60 transition">
                      <td className="px-3.5 py-2.5 font-mono font-semibold text-[#0B1B45]">{item.receipt_no || `#${item.id}`}</td>
                      <td className="px-3.5 py-2.5 text-right font-bold text-emerald-600 whitespace-nowrap">₹{Number(item.amount).toFixed(2)}</td>
                      <td className="px-3.5 py-2.5">
                        <span className="px-2.5 py-0.5 rounded-full text-xs uppercase font-bold tracking-wider bg-[#F5F8FF] text-[#2449C6] border border-[#D5E3F7]">
                          {item.payment_mode || 'cash'}
                        </span>
                      </td>
                      <td className="px-3.5 py-2.5 text-slate-600">{item.description || '-'}</td>
                      <td className="px-3.5 py-2.5 text-slate-500 text-xs">{item.income_date || item.created_at || '-'}</td>
                      <td className="px-3.5 py-2.5 text-right">
                        {canManage && (
                          <button
                            onClick={() => removeMutation.mutate(item.id)}
                            className="p-1.5 rounded-lg border border-transparent hover:border-rose-200 hover:bg-rose-50 text-slate-400 hover:text-rose-600 transition"
                            title="Delete Receipt"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                  {filteredIncomes.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-4 py-10 text-center text-slate-400 text-xs">
                        No extra income receipts found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <Pagination
              page={page}
              total={totalIncomes}
              limit={10}
              onPageChange={setPage}
              label="receipts"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

export function Expenses({ defaultTab }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const validTabs = ['expenses', 'handover'];
  const tabFromUrl = searchParams.get('tab');
  
  let initialTab = tabFromUrl;
  if (initialTab === 'income') initialTab = 'expenses';
  if (initialTab === 'cash-handover') initialTab = 'handover';
  if (!initialTab && defaultTab) initialTab = defaultTab;

  const activeTab = validTabs.includes(initialTab) ? initialTab : 'expenses';

  const canManage = usePermission('expenses.manage');

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#D5E3F7] pb-5">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-[#0B1B45] to-[#2449C6] text-white shadow-md shadow-[#0B1B45]/20 ring-1 ring-white/20">
            <Receipt className="w-5 h-5 text-[#E8C985]" />
          </div>
          <div>
            <h1 className="text-2xl font-black tracking-tight text-[#0B1B45]">
              Expenses &amp; Handover
            </h1>
            <p className="text-xs font-medium text-slate-500 mt-0.5">
              Manage store operational expenses, extra receipts, and daily cash handovers
            </p>
          </div>
        </div>
      </div>

      <Tabs
        activeKey={activeTab}
        onTabChange={(k) => setSearchParams({ tab: k })}
        tabs={[
          {
            key: 'expenses',
            label: 'Expenses',
            icon: Receipt,
            content: (
              <div className="space-y-4">
                <Tabs
                  tabs={[
                    { key: 'expenses', label: 'Operating Expenses', content: <ExpensesPanel canManage={canManage} /> },
                    { key: 'income', label: 'Extra Income & Receipts', content: <OtherIncomePanel canManage={canManage} /> },
                  ]}
                />
              </div>
            ),
          },
          {
            key: 'handover',
            label: 'Handover',
            icon: Banknote,
            content: <CashHandover hideHeader />,
          },
        ]}
      />
    </div>
  );
}

