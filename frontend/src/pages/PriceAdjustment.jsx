import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Tag, AlertCircle, Search, X } from 'lucide-react';
import { pricingApi } from '../api/catalog';
import { Button } from '../components/Button.jsx';

export function PricingPanel({ type, label }) {
  const [search, setSearch] = useState('');
  const [edits, setEdits] = useState({});
  const [message, setMessage] = useState(null);
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['pricing', type, search],
    queryFn: () => pricingApi.list(type, search),
  });

  const saveMutation = useMutation({
    mutationFn: (items) => pricingApi.bulkSave(type, items),
  });

  const rawRows = query.data;
  const rows = Array.isArray(rawRows)
    ? rawRows
    : Array.isArray(rawRows?.data)
    ? rawRows.data
    : Array.isArray(rawRows?.items)
    ? rawRows.items
    : [];

  const changedIds = Object.keys(edits);

  const handleChange = (itemId, value) => {
    setMessage(null);
    setEdits((prev) => ({ ...prev, [itemId]: value }));
  };

  const handleSave = async () => {
    setMessage(null);
    const items = changedIds
      .map((id) => ({ item_id: Number(id), price: edits[id] === '' ? null : Number(edits[id]) }))
      .filter((row) => row.price !== null);

    if (items.length === 0) return;
    const invalid = items.find((row) => Number.isNaN(row.price) || row.price < 0);
    if (invalid) {
      setMessage({ kind: 'error', text: `${label} price must be a non-negative number.` });
      return;
    }

    try {
      const result = await saveMutation.mutateAsync(items);
      setMessage({
        kind: 'success',
        text: `Saved ${result.updated} ${label.toLowerCase()} price${result.updated === 1 ? '' : 's'}.`,
      });
      setEdits({});
      queryClient.invalidateQueries({ queryKey: ['pricing', type] });
    } catch (err) {
      setMessage({ kind: 'error', text: err?.response?.data?.error || 'Save failed' });
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full sm:w-96 md:w-[480px]">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
          <input
            type="text"
            placeholder="Search item name / code / barcode..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-xl border border-[#D5E3F7] bg-white pl-10 pr-9 py-2 text-xs font-semibold text-[#0B1B45] placeholder-slate-400 focus:border-[#2449C6] focus:ring-2 focus:ring-[#2449C6]/15 focus:outline-none shadow-2xs"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
            >
              <X size={14} />
            </button>
          )}
        </div>
        <Button size="sm" onClick={handleSave} disabled={changedIds.length === 0 || saveMutation.isPending}>
          {saveMutation.isPending ? 'Saving…' : `Save${changedIds.length ? ` (${changedIds.length})` : ''}`}
        </Button>
        {changedIds.length > 0 && (
          <button
            type="button"
            onClick={() => {
              setEdits({});
              setMessage(null);
            }}
            className="text-xs font-bold text-slate-500 hover:text-[#0B1B45] hover:underline"
          >
            Reset
          </button>
        )}
        {message && (
          <span className={`text-xs font-bold px-3 py-1 rounded-full ${message.kind === 'error' ? 'text-rose-700 bg-rose-50 border border-rose-200' : 'text-emerald-700 bg-emerald-50 border border-emerald-200'}`}>
            {message.text}
          </span>
        )}
      </div>

      {query.isError && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-3.5 text-xs font-semibold text-rose-800 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
          <span>{query.error?.response?.data?.error || query.error?.message || 'Failed to load item prices.'}</span>
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border border-[#D5E3F7] bg-white shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-[#EAF1FA] bg-[#F8FAFD] text-left uppercase text-[11px] font-bold tracking-wider text-slate-500">
                <th className="px-5 py-3">Item</th>
                <th className="px-5 py-3">Unit</th>
                <th className="px-5 py-3 text-right">MRP</th>
                <th className="px-5 py-3 text-right">Normal NET_SRATE</th>
                <th className="px-5 py-3 text-right">{label} Price</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#EAF1FA]">
              {query.isLoading && (
                <tr>
                  <td colSpan={5} className="px-5 py-10 text-center text-xs font-medium text-slate-400">Loading items…</td>
                </tr>
              )}
              {!query.isLoading && !query.isError && rows.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-5 py-10 text-center text-xs font-medium text-slate-400">No items found.</td>
                </tr>
              )}
              {!query.isLoading &&
                !query.isError &&
                rows.map((r) => {
                  const edited = Object.prototype.hasOwnProperty.call(edits, r.id);
                  const value = edited ? edits[r.id] : r.price ?? '';
                  return (
                    <tr key={r.id} className={`hover:bg-[#F8FAFD]/70 transition ${edited ? 'bg-[#FFFDF5]' : ''}`}>
                      <td className="px-5 py-3.5 font-bold text-[#0B1B45]">
                        {r.item_name} <span className="font-normal text-slate-400 text-[11px]">({r.item_code})</span>
                      </td>
                      <td className="px-5 py-3.5 font-medium text-slate-500">{r.unit_code || '—'}</td>
                      <td className="px-5 py-3.5 text-right font-semibold text-slate-600">₹{r.mrp}</td>
                      <td className="px-5 py-3.5 text-right font-semibold text-slate-600">₹{r.net_srate}</td>
                      <td className="px-5 py-3.5 text-right">
                        <input
                          type="number"
                          step="any"
                          min="0"
                          value={value}
                          placeholder="Not set"
                          onChange={(e) => handleChange(r.id, e.target.value)}
                          className="w-28 rounded-xl border border-[#D5E3F7] bg-white px-3 py-1.5 text-right text-xs font-bold text-[#0B1B45] shadow-2xs outline-none transition focus:border-[#2449C6] focus:ring-2 focus:ring-[#2449C6]/15"
                        />
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export function PriceAdjustment({ defaultTab, hideHeader = false, lockTab = false }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('tab');
  const initial = defaultTab || (tabParam === 'retail' ? 'retail' : 'wholesale');
  const [activeTab, setActiveTab] = useState(initial);

  useEffect(() => {
    if (!lockTab && (tabParam === 'retail' || tabParam === 'wholesale')) {
      setActiveTab(tabParam);
    }
  }, [tabParam, lockTab]);

  const handleTabChange = (t) => {
    setActiveTab(t);
    setSearchParams({ tab: t });
  };

  const currentTab = lockTab && defaultTab ? defaultTab : activeTab;

  return (
    <div className="space-y-6">
      {!hideHeader && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#D5E3F7] pb-5">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-[#0B1B45] to-[#2449C6] text-[#E8C985] shadow-md">
              <Tag className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-[#0B1B45]">
                Price Adjustment
              </h1>
              <p className="text-xs font-medium text-slate-500 mt-0.5">
                Manage wholesale &amp; retail selling prices across your product catalog
              </p>
            </div>
          </div>

          {/* Sub-nav tabs */}
          {!lockTab && (
            <div className="flex items-center gap-1.5 bg-[#EDF5FF] p-1.5 rounded-2xl border border-[#D5E3F7]">
              <button
                type="button"
                onClick={() => handleTabChange('wholesale')}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                  currentTab === 'wholesale'
                    ? 'bg-gradient-to-r from-[#0B1B45] via-[#142B5C] to-[#1C3675] text-white shadow-xs'
                    : 'text-slate-600 hover:text-[#0B1B45] hover:bg-white/60'
                }`}
              >
                Wholesale Price
              </button>
              <button
                type="button"
                onClick={() => handleTabChange('retail')}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                  currentTab === 'retail'
                    ? 'bg-gradient-to-r from-[#0B1B45] via-[#142B5C] to-[#1C3675] text-white shadow-xs'
                    : 'text-slate-600 hover:text-[#0B1B45] hover:bg-white/60'
                }`}
              >
                Retail Price
              </button>
            </div>
          )}
        </div>
      )}

      {currentTab === 'wholesale' ? (
        <PricingPanel type="wholesale" label="Wholesale" />
      ) : (
        <PricingPanel type="retail" label="Retail" />
      )}
    </div>
  );
}
