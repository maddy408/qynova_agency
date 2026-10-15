import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Search, ScanBarcode, Plus, UserPlus, User, Grid2x2, List, Minus, Trash2, Clock, Barcode, Image as ImageIcon, Camera, PackageX, ShoppingCart, CreditCard, FileText, MapPin, ShieldCheck, Tag, Coins } from 'lucide-react';
import { itemsApi, stockUnitsApi, categoriesApi } from '../api/catalog';
import { customersApi } from '../api/parties';
import { invoicesApi } from '../api/invoices';
import { stockHubApi } from '../api/purchasing';
import { settingsApi } from '../api/admin';
import { useBranchStore } from '../store/branchStore';
import { usePermission } from '../hooks/usePermission';
import { priceLine, computeCartTotals, resolveUnitPricing, resolveSellingPrice } from '../utils/pricing';
import { resolveImageUrl } from '../utils/media';
import { Badge } from '../components/Badge.jsx';
import { Card } from '../components/Card.jsx';
import { Button } from '../components/Button.jsx';
import { PrintPreviewModal } from '../components/PrintPreviewModal.jsx';
import { ImageSearchModal } from '../components/ImageSearchModal.jsx';
import { CustomerSelect } from '../components/CustomerSelect.jsx';
import { PreviousWeekPriceModal } from '../components/PreviousWeekPriceModal.jsx';

const PAYMENT_METHODS = [
  { key: 'cash', label: 'Cash' },
  { key: 'upi', label: 'UPI' },
  { key: 'card', label: 'Card' },
  { key: 'credit', label: 'Credit' },
  { key: 'other', label: 'Other' },
];

function ProductThumb({ item, size = 'h-24 w-full', className = '' }) {
  const url = item.image ? resolveImageUrl(item.image) : null;
  const [broken, setBroken] = useState(false);

  return (
    <div className={`flex ${size} shrink-0 items-center justify-center overflow-hidden rounded-xl bg-gradient-to-b from-[#F8FAFD] to-[#EDF4FF] border border-[#E2EDFF] relative select-none ${className}`}>
      {url && !broken ? (
        <img src={url} alt="" className="h-full w-full object-contain p-1.5" onError={() => setBroken(true)} />
      ) : (
        <ImageIcon size={26} className="text-[#9BB4D8]" />
      )}
    </div>
  );
}

function newLine(item, priceType = 'normal') {
  return {
    key: `${item.id}-${Date.now()}-${Math.random()}`,
    item,
    qty: 1,
    free_qty: 0,
    discount_percent: 0,
    discount_amount: '',
    discount_mode: 'percent',
    unit_id: item.base_unit_id,
    rate: resolveSellingPrice(item, item.base_unit_id, priceType).rate,
  };
}

// billType overrides the item's own GST% for display — a Non-GST invoice
// must never show a cart line as taxed, even though the item master keeps
// its GST% untouched.
function taxBadge(item, billType = 'gst') {
  const pct = billType === 'non_gst' ? 0 : Number(item.gst_percent || 0);
  return pct > 0 ? <Badge variant="gst">GST {pct}%</Badge> : <Badge variant="non-gst">Non-GST</Badge>;
}

export function POS() {
  const queryClient = useQueryClient();
  const canGst = usePermission('pos.gst_billing');
  const canNonGst = usePermission('pos.non_gst_billing');
  const canDiscount = usePermission('pos.apply_discount');
  const canEditPrice = usePermission('pos.edit_price_at_sale');
  const canVoidHold = usePermission('pos.void_hold_bill');
  const canViewStock = usePermission('inventory.view_stock');

  const [billType, setBillType] = useState(canGst ? 'gst' : 'non_gst');
  const [billingFormat, setBillingFormat] = useState('local');
  const [priceType, setPriceType] = useState('normal');
  const [customerId, setCustomerId] = useState('');
  const [vehicleNo, setVehicleNo] = useState('');
  const [cart, setCart] = useState([]);
  const [billDiscount, setBillDiscount] = useState('');
  const [billDiscountMode, setBillDiscountMode] = useState('amount');
  const [search, setSearch] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [selectedGridIndex, setSelectedGridIndex] = useState(-1);
  const [heldId, setHeldId] = useState(null);
  const [showHeldList, setShowHeldList] = useState(false);
  const [splitMode, setSplitMode] = useState(false);
  // Payment method defaults to Credit every time (section 7 of the billing
  // requirements) — a completed credit invoice is still a completed sale;
  // revenue/profit are recognized immediately (see InvoiceModel::complete),
  // this default only changes what the payment modal shows pre-selected.
  const [payments, setPayments] = useState([{ payment_method: 'credit', amount: 0, reference_no: '' }]);
  const [message, setMessage] = useState('');
  const [printingInvoiceId, setPrintingInvoiceId] = useState(null);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [activeCategory, setActiveCategory] = useState('all');
  const [viewMode, setViewMode] = useState('grid');
  const [showImageSearch, setShowImageSearch] = useState(false);
  const searchInputRef = useRef(null);

  // Previous week selling price modal state & request tracking
  const [prevPriceModal, setPrevPriceModal] = useState({
    isOpen: false,
    loading: false,
    data: null,
    error: null,
    productId: null,
  });
  const prevPriceAbortRef = useRef(null);
  const prevPriceRequestIdRef = useRef(0);
  const prevPriceCacheRef = useRef(new Map());

  const selectedBranchId = useBranchStore((state) => state.selectedBranchId);
  const itemsQuery = useQuery({ queryKey: ['items', ''], queryFn: () => itemsApi.list('') });
  const customersQuery = useQuery({ queryKey: ['customers'], queryFn: customersApi.list });
  const unitsQuery = useQuery({ queryKey: ['stock-units'], queryFn: stockUnitsApi.list });
  const categoriesQuery = useQuery({ queryKey: ['categories'], queryFn: categoriesApi.list });
  const heldQuery = useQuery({ queryKey: ['invoices', 'held'], queryFn: () => invoicesApi.list('held') });
  const stockQuery = useQuery({ queryKey: ['stock-hub', 'branch', selectedBranchId], queryFn: () => stockHubApi.list({ owner_type: 'branch' }), enabled: canViewStock });
  const freeQtyQuery = useQuery({ queryKey: ['settings-free-qty'], queryFn: settingsApi.getFreeQty });
  const posPopupSettingsQuery = useQuery({ queryKey: ['settings-pos-popup'], queryFn: () => settingsApi.getPosPopup().catch(() => ({ pos_prev_week_popup_enabled: true, prev_week_popup_on_repeat_add: false })) });
  const isPopupFeatureEnabled = posPopupSettingsQuery.data?.pos_prev_week_popup_enabled ?? true;
  const popupOnRepeatAdd = posPopupSettingsQuery.data?.prev_week_popup_on_repeat_add ?? false;

  const items = useMemo(() => (Array.isArray(itemsQuery.data) ? itemsQuery.data : (itemsQuery.data?.items || [])), [itemsQuery.data]);
  const customers = customersQuery.data || [];
  const units = unitsQuery.data || [];
  const categories = categoriesQuery.data || [];
  const heldInvoices = heldQuery.data || [];

  const selectedCustomer = useMemo(() => customers.find((c) => String(c.id) === String(customerId)), [customers, customerId]);
  
  useEffect(() => {
    if (selectedCustomer) {
      setBillingFormat(Number(selectedCustomer.is_local_customer) === 1 ? 'local' : 'outstation');
    }
  }, [selectedCustomer]);

  // Selecting a customer auto-applies their configured pricing type
  // (Normal/Retail/Wholesale — section 4 of the customer requirements) so
  // the cashier doesn't have to remember to switch the mode by hand. This
  // only fires when the customer actually changes, so if the cashier then
  // manually picks a different price tab for this bill, nothing here
  // overwrites that choice again until a different customer is selected.
  useEffect(() => {
    if (selectedCustomer?.pricing_type) {
      setPriceType(selectedCustomer.pricing_type);
    }
  }, [selectedCustomer]);

  const isLocalBilling = billingFormat === 'local';
  const allowLocalFree = freeQtyQuery.data ? Number(freeQtyQuery.data.allow_local_free_qty) === 1 : true;
  const allowDistanceFree = freeQtyQuery.data ? Number(freeQtyQuery.data.allow_distance_free_qty) === 1 : false;
  const isFreeQtyAllowed = isLocalBilling ? allowLocalFree : allowDistanceFree;

  useEffect(() => {
    if (!isFreeQtyAllowed) {
      setCart((prev) => {
        if (prev.some((l) => Number(l.free_qty) > 0)) {
          return prev.map((l) => ({ ...l, free_qty: 0 }));
        }
        return prev;
      });
    }
  }, [isFreeQtyAllowed]);

  const stockByItemId = useMemo(() => {
    const map = {};
    const rows = Array.isArray(stockQuery.data) ? stockQuery.data : [];
    for (const row of rows) {
      if (row && row.item_id !== undefined) map[row.item_id] = row.quantity_on_hand;
    }
    return map;
  }, [stockQuery.data]);

  const getItemStock = (item) => {
    if (!item) return 0;
    if (stockByItemId[item.id] !== undefined) {
      return Number(stockByItemId[item.id]);
    }
    return Number(item.opening_stock ?? 0);
  };

  const isItemOutOfStock = (item) => {
    if (!item) return false;
    if (stockQuery.isLoading) return false;
    if (canViewStock) {
      return getItemStock(item) <= 0;
    }
    return false;
  };

  const activeCategories = useMemo(
    () => categories.filter((c) => c.is_active === undefined || c.is_active === null || Number(c.is_active) === 1),
    [categories]
  );

  const activeCategoryIds = useMemo(
    () => new Set(activeCategories.map((c) => String(c.id))),
    [activeCategories]
  );

  const activeItems = useMemo(() => {
    return items.filter((i) => {
      const isItemActive = i.is_active === undefined || i.is_active === null || Number(i.is_active) === 1;
      const isCatActive = !i.category_id || activeCategoryIds.has(String(i.category_id));
      return isItemActive && isCatActive;
    });
  }, [items, activeCategoryIds]);

  const filteredItems = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return [];
    return activeItems
      .filter(
        (i) =>
          i.item_name.toLowerCase().includes(term) ||
          (i.item_code || '').toLowerCase().includes(term) ||
          (i.barcode || '').toLowerCase() === term
      )
      .slice(0, 8);
  }, [activeItems, search]);

  const gridItems = useMemo(() => {
    if (activeCategory === 'all') return activeItems;
    return activeItems.filter((i) => String(i.category_id) === String(activeCategory));
  }, [activeItems, activeCategory]);

  const pricedLines = useMemo(
    () =>
      cart.map((line) => {
        const priced = priceLine(
          line.item,
          line.discount_mode === 'amount' ? { ...line, discount_percent: 0 } : { ...line, discount_amount: '' },
          billType,
          priceType
        );
        return {
          ...line,
          priced,
          gross: priced.gross,
          discount_amount: priced.discount_amount,
          tax_percent: priced.tax_percent,
          cess_percent: priced.cess_percent,
          tax_amount: priced.tax_amount,
          cess_amount: priced.cess_amount,
          line_total: priced.line_total,
        };
      }),
    [cart, billType, priceType]
  );
  const totals = useMemo(
    () => computeCartTotals(pricedLines, { amount: billDiscount, mode: billDiscountMode }),
    [pricedLines, billDiscount, billDiscountMode]
  );
  const uniformTaxPercent = pricedLines.length > 0 && pricedLines.every((l) => l.priced.tax_percent === pricedLines[0].priced.tax_percent)
    ? pricedLines[0].priced.tax_percent
    : null;

  useEffect(() => {
    if (!splitMode) {
      setPayments((prev) => [{ ...prev[0], amount: totals.grandTotal }]);
    }
  }, [totals.grandTotal, splitMode]);

  // Section: keyboard shortcuts — Ctrl+S opens Payment instead of the
  // browser's Save dialog, so a cashier never has to touch the mouse.
  useEffect(() => {
    const handler = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        if (cart.length > 0) setShowPaymentModal(true);
        return;
      }

      const activeTag = document.activeElement?.tagName?.toLowerCase();
      const isInput = activeTag === 'input' || activeTag === 'textarea' || activeTag === 'select';

      if (isInput && document.activeElement !== searchInputRef.current) {
        return;
      }

      if (e.key === 'ArrowRight') {
        if (gridItems.length > 0 && filteredItems.length === 0) {
          e.preventDefault();
          setSelectedGridIndex((prev) => (prev < gridItems.length - 1 ? prev + 1 : 0));
        }
      } else if (e.key === 'ArrowLeft') {
        if (gridItems.length > 0 && filteredItems.length === 0) {
          e.preventDefault();
          setSelectedGridIndex((prev) => (prev > 0 ? prev - 1 : gridItems.length - 1));
        }
      } else if (e.key === 'Enter' && !isInput) {
        if (selectedGridIndex >= 0 && selectedGridIndex < gridItems.length) {
          e.preventDefault();
          const itemToAdd = gridItems[selectedGridIndex];
          if (!isItemOutOfStock(itemToAdd)) {
            addItem(itemToAdd);
          } else {
            setMessage(`${itemToAdd.item_name} is out of stock.`);
            setTimeout(() => setMessage(''), 3000);
          }
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [cart.length, gridItems, filteredItems.length, selectedGridIndex]);

  useEffect(() => {
    setSelectedIndex(-1);
  }, [search]);

  useEffect(() => {
    setSelectedGridIndex(-1);
  }, [activeCategory, search]);

  const fetchPrevWeekPrice = (item) => {
    if (!isPopupFeatureEnabled) return;

    const reqId = ++prevPriceRequestIdRef.current;
    if (prevPriceAbortRef.current) {
      prevPriceAbortRef.current.abort();
    }
    const abortController = new AbortController();
    prevPriceAbortRef.current = abortController;

    const unitId = item.base_unit_id;
    const cacheKey = `${item.id}-${unitId}-${priceType}`;
    const cached = prevPriceCacheRef.current.get(cacheKey);
    const now = Date.now();

    if (cached && (now - cached.timestamp < 10 * 60 * 1000)) {
      setPrevPriceModal({
        isOpen: true,
        loading: false,
        data: cached.data,
        error: null,
        productId: item.id,
      });
      return;
    }

    setPrevPriceModal({
      isOpen: true,
      loading: true,
      data: null,
      error: null,
      productId: item.id,
    });

    itemsApi.previousWeekPrice(item.id, { unit_id: unitId, tier: priceType }, abortController.signal)
      .then((data) => {
        if (prevPriceRequestIdRef.current !== reqId) return;
        prevPriceCacheRef.current.set(cacheKey, { data, timestamp: Date.now() });
        setPrevPriceModal((prev) => {
          if (prev.productId !== item.id) return prev;
          return {
            ...prev,
            loading: false,
            data,
            error: null,
          };
        });
      })
      .catch((err) => {
        if (err?.name === 'CanceledError' || err?.name === 'AbortError' || abortController.signal.aborted) {
          return;
        }
        if (prevPriceRequestIdRef.current !== reqId) return;
        setPrevPriceModal((prev) => {
          if (prev.productId !== item.id) return prev;
          return {
            ...prev,
            loading: false,
            data: null,
            error: err?.response?.data?.error || 'Could not retrieve previous week selling price',
          };
        });
      });
  };

  const addItem = (item) => {
    if (isItemOutOfStock(item)) {
      setMessage(`${item.item_name} is out of stock.`);
      setTimeout(() => setMessage(''), 3000);
      return;
    }

    const isAlreadyInCart = cart.some((l) => l.item.id === item.id && l.unit_id === item.base_unit_id);
    setCart((prev) => {
      const existing = prev.find((l) => l.item.id === item.id && l.unit_id === item.base_unit_id);
      if (existing) {
        return prev.map((l) => (l.key === existing.key ? { ...l, qty: Number(l.qty) + 1 } : l));
      }
      return [...prev, newLine(item, priceType)];
    });
    setSearch('');
    setSelectedIndex(-1);

    if (!isAlreadyInCart || popupOnRepeatAdd) {
      fetchPrevWeekPrice(item);
    }
  };

  const handleSearchKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      if (filteredItems.length > 0) {
        e.preventDefault();
        setSelectedIndex((prev) => (prev < filteredItems.length - 1 ? prev + 1 : 0));
      } else if (gridItems.length > 0) {
        e.preventDefault();
        setSelectedGridIndex((prev) => (prev < gridItems.length - 1 ? prev + 1 : 0));
      }
    } else if (e.key === 'ArrowUp') {
      if (filteredItems.length > 0) {
        e.preventDefault();
        setSelectedIndex((prev) => (prev > 0 ? prev - 1 : filteredItems.length - 1));
      } else if (gridItems.length > 0) {
        e.preventDefault();
        setSelectedGridIndex((prev) => (prev > 0 ? prev - 1 : gridItems.length - 1));
      }
    } else if (e.key === 'ArrowRight') {
      if (filteredItems.length === 0 && gridItems.length > 0) {
        e.preventDefault();
        setSelectedGridIndex((prev) => (prev < gridItems.length - 1 ? prev + 1 : 0));
      }
    } else if (e.key === 'ArrowLeft') {
      if (filteredItems.length === 0 && gridItems.length > 0) {
        e.preventDefault();
        setSelectedGridIndex((prev) => (prev > 0 ? prev - 1 : gridItems.length - 1));
      }
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (selectedIndex >= 0 && selectedIndex < filteredItems.length) {
        const itemToAdd = filteredItems[selectedIndex];
        if (!isItemOutOfStock(itemToAdd)) {
          addItem(itemToAdd);
        }
        return;
      }
      const term = search.trim().toLowerCase();
      if (term) {
        const exact = items.find((i) => (i.barcode || '').toLowerCase() === term || (i.item_code || '').toLowerCase() === term);
        if (exact) {
          if (!isItemOutOfStock(exact)) {
            addItem(exact);
          } else {
            setMessage(`${exact.item_name} is out of stock.`);
            setTimeout(() => setMessage(''), 3000);
          }
          return;
        }
        if (filteredItems.length === 1) {
          if (!isItemOutOfStock(filteredItems[0])) {
            addItem(filteredItems[0]);
          } else {
            setMessage(`${filteredItems[0].item_name} is out of stock.`);
            setTimeout(() => setMessage(''), 3000);
          }
          return;
        }
      }
      if (selectedGridIndex >= 0 && selectedGridIndex < gridItems.length) {
        const itemToAdd = gridItems[selectedGridIndex];
        if (!isItemOutOfStock(itemToAdd)) {
          addItem(itemToAdd);
        }
        return;
      }
    } else if (e.key === 'Escape') {
      setSearch('');
      setSelectedIndex(-1);
      setSelectedGridIndex(-1);
    }
  };

  const updateLine = (key, patch) => setCart((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  // Switching a line's unit (e.g. PCS -> BOX) re-prices it from that unit's
  // own NET_SRATE/Retail/Wholesale rate (never the primary-unit rate) —
  // mirrors ItemModel::resolveSellingPrice server-side.
  const changeLineUnit = (line, unitId) => {
    const pricing = resolveSellingPrice(line.item, unitId, priceType);
    updateLine(line.key, { unit_id: unitId, rate: pricing.rate });
  };
  // The cart's `rate` field is a stored, user-editable value (so a manual
  // price override at sale time sticks) — switching Normal/Retail/Wholesale
  // must therefore explicitly re-price every existing line, not just flip a
  // display flag, or the cart would silently keep showing the old rate
  // (section 13). Only triggered by the user's own click, never on mount/
  // resume, so resuming a held Retail/Wholesale bill keeps its actual
  // snapshotted rate instead of being silently re-priced to Normal.
  const changePriceType = (nextType) => {
    setPriceType(nextType);
    setCart((prev) => prev.map((line) => ({ ...line, rate: resolveSellingPrice(line.item, line.unit_id, nextType).rate })));
  };
  const removeLine = (key) => setCart((prev) => prev.filter((l) => l.key !== key));
  const bumpQty = (line, delta) => {
    const next = Number(line.qty) + delta;
    if (next < 1) return;
    updateLine(line.key, { qty: next });
  };

  const resetBill = () => {
    setCart([]);
    setCustomerId('');
    setVehicleNo('');
    setHeldId(null);
    setBillDiscount('');
    setBillDiscountMode('amount');
    setPayments([{ payment_method: 'credit', amount: 0, reference_no: '' }]);
    setSplitMode(false);
  };

  const buildPayload = () => ({
    bill_type: billType,
    price_type: priceType,
    customer_id: customerId ? Number(customerId) : null,
    vehicle_no: vehicleNo || null,
    items: totals.updatedLines.map((l) => ({
      item_id: l.item.id,
      qty: Number(l.qty),
      free_qty: isFreeQtyAllowed ? Number(l.free_qty || 0) : 0,
      unit_id: l.unit_id,
      ...(canDiscount
        ? { discount_amount: Number(l.combined_discount_amount ?? l.discount_amount ?? 0) }
        : {}),
      ...(canEditPrice ? { rate: Number(l.rate) } : {}),
    })),
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = buildPayload();
      if (heldId) {
        return invoicesApi.update(heldId, payload);
      }
      const created = await invoicesApi.create(payload);
      setHeldId(created.id);
      return created;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['invoices', 'held'] }),
  });

  const completeMutation = useMutation({
    mutationFn: async () => {
      const saved = heldId ? await invoicesApi.update(heldId, buildPayload()) : await invoicesApi.create(buildPayload());
      const id = saved.id;
      return invoicesApi.complete(id, payments.filter((p) => Number(p.amount) > 0));
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['invoices', 'held'] });
      setShowPaymentModal(false);
      setPrintingInvoiceId(result.id);
      resetBill();
      setMessage(`Invoice ${result.invoice_no} completed.`);
      setTimeout(() => setMessage(''), 4000);
    },
  });

  const resumeHeld = async (invoiceId) => {
    const invoice = await invoicesApi.get(invoiceId);
    setHeldId(invoice.id);
    setBillType(invoice.bill_type);
    // Restore the stored mode directly (never via changePriceType) so the
    // held bill's already-snapshotted line rates aren't silently re-priced.
    setPriceType(invoice.price_type || 'normal');
    setCustomerId(invoice.customer_id || '');
    setVehicleNo(invoice.vehicle_no || '');
    setCart(
      invoice.items.map((it) => ({
        key: `${it.item_id}-${it.id}`,
        item: {
          id: it.item_id,
          item_name: it.item_name_snapshot,
          retail_price: it.rate,
          gst_percent: it.tax_percent,
          cess_percent: 0,
          base_unit_id: it.unit_id,
        },
        qty: Number(it.qty),
        free_qty: Number(it.free_qty),
        discount_percent: Number(it.discount_percent),
        unit_id: it.unit_id,
        rate: Number(it.rate),
      }))
    );
    setShowHeldList(false);
  };

  const discardHeld = async (invoiceId) => {
    await invoicesApi.discard(invoiceId);
    queryClient.invalidateQueries({ queryKey: ['invoices', 'held'] });
    if (heldId === invoiceId) resetBill();
  };

  const paymentsTotal = payments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
  const remaining = Math.round((totals.grandTotal - paymentsTotal) * 100) / 100;
  const now = new Date();

  return (
    <div className="w-full min-h-[calc(100vh-54px)] bg-[#EDF5FF] px-4 sm:px-6 lg:px-8 py-5 sm:py-6">
      {/* Top POS Control Bar */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex overflow-hidden rounded-xl border border-[#D5E3F7] bg-white p-1 shadow-[0_2px_8px_rgba(15,30,65,0.04)] gap-1">
          <button
            type="button"
            disabled={!canGst}
            onClick={() => setBillType('gst')}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 text-sm font-bold rounded-lg transition-all cursor-pointer ${
              billType === 'gst'
                ? 'bg-gradient-to-r from-[#0F1E4A] via-[#14275E] to-[#1C3372] text-white shadow-[0_2px_8px_rgba(15,30,65,0.28)]'
                : 'text-[#14264F] hover:bg-[#EDF5FF]'
            } disabled:opacity-40`}
          >
            <ShieldCheck size={14} className={billType === 'gst' ? 'text-white' : 'text-[#315BFF]'} />
            GST Billing
          </button>
          <button
            type="button"
            disabled={!canNonGst}
            onClick={() => setBillType('non_gst')}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 text-sm font-semibold rounded-lg transition-all cursor-pointer ${
              billType === 'non_gst'
                ? 'bg-gradient-to-r from-[#0F1E4A] via-[#14275E] to-[#1C3372] text-white shadow-[0_2px_8px_rgba(15,30,65,0.28)]'
                : 'text-[#14264F] hover:bg-[#EDF5FF]'
            } disabled:opacity-40`}
          >
            Non-GST / Estimate
          </button>
        </div>

        <div className="flex overflow-hidden rounded-xl border border-[#D5E3F7] bg-white p-1 shadow-[0_2px_8px_rgba(15,30,65,0.04)] gap-1">
          <button
            type="button"
            onClick={() => setBillingFormat('local')}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 text-sm font-bold rounded-lg transition-all cursor-pointer ${
              billingFormat === 'local'
                ? 'bg-gradient-to-r from-[#0F1E4A] via-[#14275E] to-[#1C3372] text-white shadow-[0_2px_8px_rgba(15,30,65,0.28)]'
                : 'text-[#14264F] hover:bg-[#EDF5FF]'
            }`}
          >
            <MapPin size={14} className={billingFormat === 'local' ? 'text-white' : 'text-[#315BFF]'} />
            Local Billing
          </button>
          <button
            type="button"
            onClick={() => setBillingFormat('outstation')}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 text-sm font-semibold rounded-lg transition-all cursor-pointer ${
              billingFormat === 'outstation'
                ? 'bg-gradient-to-r from-[#0F1E4A] via-[#14275E] to-[#1C3372] text-white shadow-[0_2px_8px_rgba(15,30,65,0.28)]'
                : 'text-[#14264F] hover:bg-[#EDF5FF]'
            }`}
          >
            Distance Billing
          </button>
        </div>

        <div className="flex overflow-hidden rounded-xl border border-[#D5E3F7] bg-white p-1 shadow-[0_2px_8px_rgba(15,30,65,0.04)] gap-1">
          {[
            { key: 'normal', label: 'Normal', icon: Tag },
            { key: 'retail', label: 'Retail' },
            { key: 'wholesale', label: 'Wholesale' },
          ].map((opt) => (
            <button
              key={opt.key}
              type="button"
              onClick={() => changePriceType(opt.key)}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-bold rounded-lg transition-all cursor-pointer ${
                priceType === opt.key
                  ? 'bg-gradient-to-r from-[#0F1E4A] via-[#14275E] to-[#1C3372] text-white shadow-[0_2px_8px_rgba(15,30,65,0.28)]'
                  : 'text-[#14264F] hover:bg-[#EDF5FF]'
              }`}
            >
              {opt.icon && <opt.icon size={13} className={priceType === opt.key ? 'text-white' : 'text-[#315BFF]'} />}
              {opt.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          {message && <span className="text-sm font-semibold text-emerald-600">{message}</span>}
          <button
            type="button"
            onClick={() => setShowHeldList((v) => !v)}
            className="flex items-center gap-2 rounded-xl border border-[#D5E3F7] bg-white shadow-[0_2px_8px_rgba(15,30,65,0.04)] px-3.5 py-1.5 text-sm font-bold text-[#14264F] hover:bg-[#EDF5FF] transition-all cursor-pointer"
          >
            <FileText size={15} className="text-[#315BFF]" />
            <span>Hold Bills</span>
            {heldInvoices.length > 0 && (
              <span className="rounded-full bg-[#315BFF] px-2 py-0.2 text-[10px] font-black text-white shadow-2xs">
                {heldInvoices.length}
              </span>
            )}
          </button>
        </div>
      </div>

      {showHeldList && (
        <Card className="mb-4 p-3 rounded-2xl border border-[#D5E3F7] shadow-sm">
          {heldInvoices.length === 0 && <p className="text-sm text-[#64789D]">No held bills.</p>}
          {heldInvoices.map((inv) => (
            <div key={inv.id} className="flex items-center justify-between border-b border-[#D5E3F7] py-2 text-sm last:border-0">
              <span className="text-[#14264F]">
                #{inv.id} · {inv.bill_type.toUpperCase()} · {inv.customer_name || 'Walk-in'} · Rs. {inv.grand_total}
              </span>
              <div className="flex gap-3">
                <button onClick={() => resumeHeld(inv.id)} className="font-semibold text-[#315BFF] hover:underline">
                  Resume
                </button>
                {canVoidHold && (
                  <button onClick={() => discardHeld(inv.id)} className="font-medium text-[#F05B7A] hover:underline">
                    Discard
                  </button>
                )}
              </div>
            </div>
          ))}
        </Card>
      )}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_370px] xl:grid-cols-[1fr_400px]">
        {/* Left panel — product browsing */}
        <div>
          <div className="mb-4 flex flex-wrap items-center gap-2.5">
            {/* Walk-in Customer Quick Select Button */}
            <button
              type="button"
              onClick={() => setCustomerId('')}
              className={`h-10 px-4 rounded-xl text-sm font-bold transition-all flex items-center gap-2 shrink-0 ${
                !customerId
                  ? 'bg-gradient-to-r from-[#446BF5] via-[#355CEE] to-[#2449C6] text-white shadow-[0_4px_12px_rgba(36,73,198,0.28)] hover:opacity-95'
                  : 'bg-white text-[#14264F] border border-[#D5E3F7] shadow-[0_2px_8px_rgba(15,30,65,0.04)] hover:bg-[#EDF5FF]'
              }`}
              title="Select Walk-in Customer"
            >
              <User size={16} />
              Walk-in
            </button>

            {/* Searchable Customer Dropdown */}
            <CustomerSelect
              customers={customers}
              value={customerId}
              onChange={(id) => setCustomerId(id)}
              placeholder="Search customer by name or phone…"
              className="w-64 sm:w-72"
            />
            <Link to="/parties">
              <button
                type="button"
                className="flex h-10 items-center gap-2 rounded-xl bg-gradient-to-r from-[#446BF5] via-[#355CEE] to-[#2449C6] px-4 text-sm font-bold text-white shadow-[0_4px_12px_rgba(36,73,198,0.28)] hover:opacity-95 transition-all shrink-0"
              >
                <UserPlus size={16} />
                Add Customer
              </button>
            </Link>

            {/* Unified Product Search with Barcode & Camera Buttons */}
            <div className="flex items-center gap-2 flex-1 min-w-[260px]">
              <div className="relative flex-1">
                <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#7E92B2]" />
                <input
                  ref={searchInputRef}
                  autoFocus
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onKeyDown={handleSearchKeyDown}
                  placeholder="Search product by name, code or barcode…"
                  className="h-10 w-full pl-9 pr-3 rounded-xl border border-[#D5E3F7] bg-white text-sm font-medium text-[#14264F] placeholder-[#7E92B2]/80 shadow-[0_2px_8px_rgba(15,30,65,0.04)] focus:outline-none focus:ring-2 focus:ring-[#315BFF]/30 focus:border-[#315BFF] transition-all"
                />
                {filteredItems.length > 0 && (
                  <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-64 overflow-auto rounded-xl border border-[#D5E3F7] bg-white shadow-xl py-1">
                    {filteredItems.map((item, index) => {
                      const stock = getItemStock(item);
                      const outOfStock = isItemOutOfStock(item);
                      const isHighlighted = index === selectedIndex;
                      return (
                        <button
                          key={item.id}
                          disabled={outOfStock}
                          ref={(el) => {
                            if (isHighlighted && el) {
                              el.scrollIntoView({ block: 'nearest' });
                            }
                          }}
                          onClick={() => {
                            if (outOfStock) return;
                            addItem(item);
                          }}
                          onMouseEnter={() => {
                            if (!outOfStock) setSelectedIndex(index);
                          }}
                          className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm transition-colors ${
                            outOfStock
                              ? 'opacity-50 cursor-not-allowed bg-slate-50 text-slate-400'
                              : isHighlighted ? 'bg-[#EDF5FF] text-[#0B1B45] font-semibold' : 'hover:bg-[#F5F8FF]'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <span>{item.item_name} <span className="text-[#334155] font-medium">({item.item_code})</span></span>
                            {outOfStock && (
                              <span className="rounded-full bg-rose-100 text-rose-700 text-[10px] font-bold px-1.5 py-0.2">
                                Out of stock
                              </span>
                            )}
                          </div>
                          <span className="text-[#0B1B45] font-bold">Rs. {resolveSellingPrice(item, item.base_unit_id, priceType).rate.toFixed(2)}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={() => searchInputRef.current?.focus()}
                title="Focus search to scan a barcode"
                className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-b from-[#FDE8B5] via-[#F6D389] to-[#E5BE6C] border border-[#DEB660] text-[#0B1B45] shadow-[0_2px_8px_rgba(229,190,108,0.35)] shrink-0 transition-all hover:brightness-105 active:scale-95 cursor-pointer"
              >
                <ScanBarcode size={18} />
              </button>
              <button
                type="button"
                onClick={() => setShowImageSearch(true)}
                title="Find an item from a photo"
                className="flex h-10 w-10 items-center justify-center rounded-xl border border-[#D5E3F7] bg-white text-[#315BFF] shadow-[0_2px_8px_rgba(15,30,65,0.04)] hover:bg-[#EDF5FF] shrink-0 transition-all active:scale-95 cursor-pointer"
              >
                <Camera size={18} />
              </button>
            </div>
          </div>

          {/* Products List Toolbar (All option retained, specific categories and catalog label omitted) */}
          <div className="mb-4 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => setActiveCategory('all')}
              className={`rounded-full px-5 py-1.5 text-xs sm:text-sm font-bold transition-all cursor-pointer ${
                activeCategory === 'all'
                  ? 'bg-gradient-to-r from-[#446BF5] via-[#355CEE] to-[#2449C6] text-white shadow-[0_3px_10px_rgba(36,73,198,0.3)]'
                  : 'border border-[#D5E3F7] bg-white text-[#64789D] hover:text-[#14264F] hover:bg-[#F8FAFF] shadow-2xs'
              }`}
            >
              All
            </button>
            <div className="flex overflow-hidden rounded-xl border border-[#D5E3F7] bg-white p-0.5 shadow-[0_2px_6px_rgba(15,30,65,0.04)] gap-0.5">
              <button
                type="button"
                onClick={() => setViewMode('grid')}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg transition-all cursor-pointer ${
                  viewMode === 'grid'
                    ? 'bg-gradient-to-r from-[#EDF5FF] to-[#E3EFFF] font-bold text-[#2449C6] shadow-2xs'
                    : 'text-[#64789D] hover:text-[#14264F] font-medium'
                }`}
              >
                <Grid2x2 size={14} /> Grid
              </button>
              <button
                type="button"
                onClick={() => setViewMode('list')}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg transition-all cursor-pointer ${
                  viewMode === 'list'
                    ? 'bg-gradient-to-r from-[#EDF5FF] to-[#E3EFFF] font-bold text-[#2449C6] shadow-2xs'
                    : 'text-[#64789D] hover:text-[#14264F] font-medium'
                }`}
              >
                <List size={14} /> List
              </button>
            </div>
          </div>

          {viewMode === 'grid' ? (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4">
              {gridItems.map((item, index) => {
                const stock = getItemStock(item);
                const outOfStock = isItemOutOfStock(item);
                const lowStock = canViewStock && stock > 0 && stock <= Number(item.min_stock_threshold || 0);
                const isSelected = index === selectedGridIndex;
                return (
                  <button
                    key={item.id}
                    disabled={outOfStock}
                    aria-disabled={outOfStock}
                    ref={(el) => {
                      if (isSelected && el) {
                        el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
                      }
                    }}
                    onClick={() => {
                      if (outOfStock) return;
                      addItem(item);
                      setSelectedGridIndex(index);
                    }}
                    onMouseEnter={() => {
                      if (!outOfStock) setSelectedGridIndex(index);
                    }}
                    className={`group relative flex flex-col rounded-2xl border p-3 text-left transition-all duration-200 select-none ${
                      outOfStock
                        ? 'opacity-50 cursor-not-allowed bg-slate-50/90 border-slate-200 shadow-none'
                        : isSelected
                        ? 'bg-white border-[#315BFF]/60 shadow-[0_4px_16px_rgba(49,91,255,0.12)] -translate-y-0.5 cursor-pointer'
                        : 'bg-white border-[#D8E6F7] shadow-[0_2px_10px_rgba(15,30,65,0.04)] hover:-translate-y-1 hover:shadow-[0_8px_24px_rgba(15,30,65,0.08)] cursor-pointer'
                    }`}
                  >
                    <div className="relative mb-2">
                      <ProductThumb item={item} size="h-20 w-full" className={outOfStock ? 'opacity-70 grayscale-[30%]' : ''} />
                      {outOfStock && (
                        <span className="absolute right-2 top-2 rounded-full bg-gradient-to-r from-[#F75A7B] to-[#EE3A5F] px-2.5 py-0.5 text-[10px] font-bold text-white shadow-[0_2px_6px_rgba(238,58,95,0.35)]">
                          Out of stock
                        </span>
                      )}
                      {!outOfStock && lowStock && (
                        <span className="absolute right-2 top-2 rounded-full bg-amber-500 px-2.5 py-0.5 text-[10px] font-bold text-white shadow-xs">
                          Low stock
                        </span>
                      )}
                    </div>
                    <div className="truncate text-sm font-bold text-[#0F1E4A] mb-0.5">{item.item_name}</div>
                    <div className="mb-1 text-base font-extrabold text-[#0F1E4A]">
                      Rs. {resolveSellingPrice(item, item.base_unit_id, priceType).rate.toFixed(2)}
                    </div>
                    <div className="mb-1">{taxBadge(item, billType)}</div>
                    <div className="flex items-center justify-between text-xs text-[#1E293B] font-semibold">
                      <span>{canViewStock ? `Stock: ${stock}` : item.item_code}</span>
                      {item.barcode && <Barcode size={14} className="text-[#475569]" />}
                    </div>
                  </button>
                );
              })}
              {gridItems.length === 0 && (
                <div className="col-span-full py-10 text-center text-[#64789D]">No products in this category.</div>
              )}
            </div>
          ) : (
            <Card>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#D7E5FF] text-left text-xs uppercase text-[#64789D]">
                    <th className="px-4 py-2"></th>
                    <th className="px-4 py-2">Item</th>
                    <th className="px-4 py-2">Price</th>
                    <th className="px-4 py-2">Tax</th>
                    <th className="px-4 py-2">{canViewStock ? 'Stock' : 'Code'}</th>
                    <th className="px-4 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {gridItems.map((item, index) => {
                    const stock = getItemStock(item);
                    const outOfStock = isItemOutOfStock(item);
                    const isSelected = index === selectedGridIndex;
                    return (
                      <tr
                        key={item.id}
                        ref={(el) => {
                          if (isSelected && el) {
                            el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
                          }
                        }}
                        onClick={() => {
                          if (outOfStock) return;
                          addItem(item);
                          setSelectedGridIndex(index);
                        }}
                        onMouseEnter={() => {
                          if (!outOfStock) setSelectedGridIndex(index);
                        }}
                        className={`border-b border-[#D7E5FF] last:border-0 transition-colors ${
                          outOfStock
                            ? 'opacity-50 cursor-not-allowed bg-slate-50/60'
                            : isSelected ? 'bg-[#EDF5FF] font-semibold text-[#0B1B45] cursor-pointer' : 'hover:bg-[#F5F8FF] cursor-pointer'
                        }`}
                      >
                        <td className="px-4 py-2"><ProductThumb item={item} size="h-9 w-9" className={outOfStock ? 'grayscale-[30%]' : ''} /></td>
                        <td className="px-4 py-2 font-bold text-[#14264F]">{item.item_name}</td>
                        <td className="px-4 py-2 font-semibold text-[#14264F]">Rs. {resolveSellingPrice(item, item.base_unit_id, priceType).rate.toFixed(2)}</td>
                        <td className="px-4 py-2">{taxBadge(item)}</td>
                        <td className="px-4 py-2 font-semibold text-[#334155]">{canViewStock ? `${stock}` : item.item_code}</td>
                        <td className="px-4 py-2 text-right">
                          <Button
                            size="sm"
                            variant="secondary"
                            disabled={outOfStock}
                            icon={!outOfStock && <Plus size={14} />}
                            onClick={(e) => {
                              e.stopPropagation();
                              if (outOfStock) return;
                              addItem(item);
                              setSelectedGridIndex(index);
                            }}
                          >
                            {outOfStock ? 'Out of stock' : 'Add'}
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                  {gridItems.length === 0 && (
                    <tr><td colSpan={6} className="px-4 py-8 text-center text-[#64789D]">No products in this category.</td></tr>
                  )}
                </tbody>
              </table>
            </Card>
          )}
        </div>

        {/* Right panel — Current Bill */}
        <div className="lg:sticky lg:top-3">
          <div id="pos-current-bill-panel" className="flex flex-col rounded-2xl border border-[#D5E3F7] bg-white shadow-[0_4px_24px_rgba(15,30,65,0.06)] overflow-hidden h-[600px] lg:h-[calc(100vh-8.25rem)] min-h-[500px] max-h-[860px]">
            {/* Header: Fixed */}
            <div className="relative shrink-0 overflow-hidden bg-gradient-to-r from-[#0C1B45] via-[#12265E] to-[#1E3B8A] px-3.5 py-2.5 text-white">
              {/* Subtle layered glow wave highlight */}
              <div className="pointer-events-none absolute -right-6 -top-8 h-20 w-36 rounded-full bg-gradient-to-br from-[#315BFF]/30 to-transparent blur-xl" />
              <div className="pointer-events-none absolute left-0 bottom-0 h-8 w-full bg-gradient-to-t from-white/5 to-transparent" />
              <div className="relative flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FileText size={16} className="text-[#E8C985] drop-shadow-xs" />
                  <div>
                    <div className="text-[15px] font-bold text-white tracking-tight leading-tight">Current Bill</div>
                    <div className="text-[11px] text-[#ADC3E8] font-medium leading-none">{pricedLines.length} item(s)</div>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 text-xs text-white/80 font-medium">
                  <Clock size={13} />
                  {now.toLocaleString(undefined, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
            </div>

            {/* Panel Body: flex-col with flex-1 min-h-0 overflow-hidden */}
            <div className="p-3 flex flex-col flex-1 min-h-0 overflow-hidden">
              {/* Cart Product List: Vertically scrollable with min-h-0 and custom-scrollbar */}
              <div id="pos-cart-items-container" className="flex-1 min-h-0 overflow-y-auto pr-1 space-y-1 custom-scrollbar">
                {pricedLines.map((line) => (
                  <div key={line.key} className="flex gap-2 rounded-xl border border-[#D5E3F7] p-1.5 bg-white hover:bg-[#F5F8FF]/60 transition-colors shadow-2xs">
                    <ProductThumb item={line.item} size="h-9 w-9 shrink-0" />
                    <div className="min-w-0 flex-1 flex flex-col justify-between">
                      {/* Name, badges, and delete button */}
                      <div className="flex items-start justify-between gap-1 leading-none">
                        <div className="min-w-0 flex-1 flex items-center gap-1.5 flex-wrap">
                          <span className="truncate text-xs font-bold text-[#0F1E4A] leading-tight" title={line.item.item_name}>
                            {line.item.item_name}
                          </span>
                          {taxBadge(line.item, billType)}
                          {Number(line.free_qty) > 0 && isFreeQtyAllowed && <Badge variant="warning">Free: {line.free_qty}</Badge>}
                          {!line.priced.price_configured && (
                            <Badge variant="warning" title={`No ${priceType} price set — using Normal NET_SRATE`}>
                              {priceType === 'retail' ? 'Retail' : 'Wholesale'} price not set
                            </Badge>
                          )}
                        </div>
                        <button
                          onClick={() => removeLine(line.key)}
                          className="shrink-0 p-0.5 text-[#7E92B2] hover:text-[#F05B7A] rounded hover:bg-rose-50 transition-colors"
                          title="Remove item"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>

                      {/* Quantity controls, unit, rate, and line total */}
                      <div className="mt-1 flex items-center justify-between gap-1">
                        <div className="flex items-center gap-0.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => bumpQty(line, -1)}
                            className="flex h-5 w-5 items-center justify-center rounded border border-[#D5E3F7] text-[#7E92B2] hover:bg-[#EDF5FF] active:scale-95"
                          >
                            <Minus size={10} />
                          </button>
                          <input
                            type="number"
                            min="0"
                            step="any"
                            value={line.qty}
                            onChange={(e) => updateLine(line.key, { qty: e.target.value })}
                            className="w-9 rounded border border-[#D5E3F7] px-0.5 py-0.5 text-center text-xs font-bold text-[#0F1E4A]"
                          />
                          <button
                            type="button"
                            onClick={() => bumpQty(line, 1)}
                            className="flex h-5 w-5 items-center justify-center rounded border border-[#D5E3F7] text-[#7E92B2] hover:bg-[#EDF5FF] active:scale-95"
                          >
                            <Plus size={10} />
                          </button>
                          {line.item.secondary_unit_id ? (
                            <select
                              value={line.unit_id}
                              onChange={(e) => changeLineUnit(line, Number(e.target.value))}
                              className="rounded border border-[#D5E3F7] px-0.5 py-0.5 text-[10px] text-[#7E92B2] bg-white cursor-pointer ml-0.5"
                            >
                              {[line.item.base_unit_id, line.item.secondary_unit_id].map((id) => (
                                <option key={id} value={id}>{units.find((u) => u.id === id)?.short_code || ''}</option>
                              ))}
                            </select>
                          ) : (
                            <span className="text-[10px] font-medium text-[#7E92B2] ml-0.5">{units.find((u) => u.id === line.unit_id)?.short_code || ''}</span>
                          )}
                        </div>

                        <div className="flex items-center gap-1.5 text-xs shrink-0">
                          <input
                            type="number"
                            step="any"
                            disabled={!canEditPrice}
                            value={line.rate}
                            title="Net Rate"
                            onChange={(e) => updateLine(line.key, { rate: e.target.value })}
                            className="w-12 rounded border border-[#D5E3F7] px-1 py-0.5 text-right font-bold text-[#0F1E4A] text-xs disabled:bg-[#EDF5FF]"
                          />
                          <span className="text-xs font-black text-[#0F1E4A] whitespace-nowrap min-w-[58px] text-right">
                            Rs. {line.priced.line_total.toFixed(2)}
                          </span>
                        </div>
                      </div>

                      {/* Discount & Free Qty */}
                      {canDiscount && (
                        <div className="mt-1 flex items-center justify-between gap-1 text-[10px] text-[#7E92B2] pt-0.5 border-t border-[#F0F4FC]">
                          <div className="flex items-center gap-1">
                            <span className="font-medium">Disc</span>
                            <div className="flex overflow-hidden rounded border border-[#D5E3F7]">
                              <button
                                type="button"
                                onClick={() => updateLine(line.key, { discount_mode: 'percent' })}
                                className={`px-1 py-0.2 font-bold ${line.discount_mode !== 'amount' ? 'bg-[#F6D389] text-[#0B1B45]' : 'bg-white text-[#7E92B2]'}`}
                              >
                                %
                              </button>
                              <button
                                type="button"
                                onClick={() => updateLine(line.key, { discount_mode: 'amount' })}
                                className={`px-1 py-0.2 font-bold ${line.discount_mode === 'amount' ? 'bg-[#F6D389] text-[#0B1B45]' : 'bg-white text-[#7E92B2]'}`}
                              >
                                Rs.
                              </button>
                            </div>
                            {line.discount_mode === 'amount' ? (
                              <input
                                type="number" min="0" step="any" value={line.discount_amount}
                                onChange={(e) => updateLine(line.key, { discount_amount: e.target.value })}
                                className="w-11 rounded border border-[#D5E3F7] px-0.5 py-0.2 text-center text-[10px] font-bold text-[#0F1E4A]"
                              />
                            ) : (
                              <input
                                type="number" min="0" step="any" value={line.discount_percent}
                                onChange={(e) => updateLine(line.key, { discount_percent: e.target.value })}
                                className="w-9 rounded border border-[#D5E3F7] px-0.5 py-0.2 text-center text-[10px] font-bold text-[#0F1E4A]"
                              />
                            )}
                          </div>
                          {isFreeQtyAllowed && (
                            <div className="flex items-center gap-1">
                              <span className="font-medium">Free</span>
                              <input
                                type="number"
                                min="0"
                                step="any"
                                value={line.free_qty}
                                onChange={(e) => updateLine(line.key, { free_qty: e.target.value })}
                                className="w-9 rounded border border-[#D5E3F7] px-0.5 py-0.2 text-center text-[10px] font-bold text-[#0F1E4A]"
                              />
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
                {cart.length === 0 && (
                  <div className="h-full min-h-[160px] flex flex-col items-center justify-center gap-2 py-8 text-center text-[#475569]">
                    <div className="flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-b from-[#E6F0FF] to-[#D5E5FF] shadow-xs">
                      <ShoppingCart size={20} className="text-[#315BFF]" />
                    </div>
                    <p className="max-w-[210px] text-xs font-semibold text-[#334155] leading-relaxed">
                      Cart is empty — scan or search an item, or tap a product.
                    </p>
                  </div>
                )}
              </div>

              {/* Fixed Summary & Action Controls: Never scrolled */}
              <div className="shrink-0 pt-2 mt-2 border-t border-[#EAF1FA] bg-white">
                <SummaryRow label="Subtotal" value={totals.subtotal} />
                <SummaryRow label={`GST Total${uniformTaxPercent ? ` (${uniformTaxPercent}%)` : ''}`} value={totals.cgst + totals.sgst + totals.cessAmount} />
                {canDiscount && (
                  <div className="flex items-center justify-between py-0.5 text-sm">
                    <span className="flex items-center gap-1.5 font-semibold text-[#1E293B]">
                      Discount
                      <div className="flex overflow-hidden rounded-md border border-[#D5E3F7] text-[11px] shadow-2xs">
                        <button
                          type="button"
                          onClick={() => setBillDiscountMode('amount')}
                          className={`px-1.5 py-0.5 font-bold transition-colors ${billDiscountMode === 'amount' ? 'bg-gradient-to-b from-[#FDE8B5] via-[#F6D389] to-[#E5BE6C] text-[#0B1B45]' : 'bg-white text-[#7E92B2]'}`}
                        >
                          Rs.
                        </button>
                        <button
                          type="button"
                          onClick={() => setBillDiscountMode('percent')}
                          className={`px-1.5 py-0.5 font-bold transition-colors ${billDiscountMode === 'percent' ? 'bg-gradient-to-b from-[#FDE8B5] via-[#F6D389] to-[#E5BE6C] text-[#0B1B45]' : 'bg-white text-[#7E92B2]'}`}
                        >
                          %
                        </button>
                      </div>
                    </span>
                    <input
                      type="number"
                      min="0"
                      step="any"
                      placeholder="0"
                      value={billDiscount}
                      onChange={(e) => setBillDiscount(e.target.value)}
                      className="w-20 rounded-md border border-[#D5E3F7] px-2 py-0.5 text-right font-bold text-[#0F1E4A] text-sm focus:outline-none focus:ring-1 focus:ring-[#315BFF]"
                    />
                  </div>
                )}
                <SummaryRow label="Round off" value={totals.roundOff} />

                <div className="mt-2 flex items-center justify-between rounded-xl bg-gradient-to-r from-[#EDF4FF] via-[#E4EFFF] to-[#DBEBFF] px-3.5 py-2 border border-[#D0E2FB] shadow-xs">
                  <div className="flex items-center gap-2">
                    <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-white/90 text-[#315BFF] shadow-xs">
                      <Coins size={14} />
                    </div>
                    <span className="text-sm font-bold text-[#0F1E4A]">Total Amount</span>
                  </div>
                  <span className="text-base sm:text-lg font-black text-[#0F1E4A] whitespace-nowrap">Rs. {totals.grandTotal.toFixed(2)}</span>
                </div>

                <button
                  type="button"
                  onClick={() => setShowPaymentModal(true)}
                  disabled={cart.length === 0}
                  className="mt-2 flex w-full items-center justify-between rounded-xl bg-gradient-to-r from-[#112456] via-[#1A3785] to-[#254BD8] hover:from-[#0E1E48] hover:via-[#162F72] hover:to-[#1E3EB8] px-3.5 py-2.5 text-sm font-semibold text-white shadow-[0_4px_16px_rgba(26,55,133,0.35)] transition-all hover:shadow-[0_6px_20px_rgba(26,55,133,0.45)] disabled:opacity-40 disabled:cursor-not-allowed group active:scale-[0.99]"
                >
                  <div className="flex items-center gap-2">
                    <CreditCard size={16} className="text-white" />
                    <span className="font-bold text-white text-[14px]">Proceed to Payment</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="rounded-full bg-white/15 px-2 py-0.5 text-[10px] font-mono text-white/90 font-medium">Ctrl+S</span>
                    <span className="text-white/80 font-bold group-hover:translate-x-0.5 transition-transform">&gt;</span>
                  </div>
                </button>

                {cart.length > 0 && (
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <Button size="sm" variant="secondary" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
                      Hold Bill
                    </Button>
                    <Button size="sm" variant="secondary" onClick={resetBill}>
                      Clear
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {showPaymentModal && (
        <PaymentModal
          totals={totals}
          customerName={customers.find((c) => String(c.id) === String(customerId))?.ledger_name}
          itemCount={pricedLines.length}
          splitMode={splitMode}
          setSplitMode={setSplitMode}
          payments={payments}
          setPayments={setPayments}
          hasCustomer={!!customerId}
          canDiscount={canDiscount}
          billDiscount={billDiscount}
          setBillDiscount={setBillDiscount}
          billDiscountMode={billDiscountMode}
          setBillDiscountMode={setBillDiscountMode}
          onBack={() => setShowPaymentModal(false)}
          onPay={() => completeMutation.mutate()}
          isPending={completeMutation.isPending}
          error={completeMutation.isError ? completeMutation.error?.response?.data?.error || 'Failed to complete' : null}
        />
      )}

      {printingInvoiceId && <PrintPreviewModal invoiceId={printingInvoiceId} onClose={() => setPrintingInvoiceId(null)} />}
      {showImageSearch && (
        <ImageSearchModal
          onClose={() => setShowImageSearch(false)}
          onAdd={(item) => { addItem(item); setShowImageSearch(false); }}
        />
      )}

      <PreviousWeekPriceModal
        isOpen={prevPriceModal.isOpen}
        loading={prevPriceModal.loading}
        data={prevPriceModal.data}
        error={prevPriceModal.error}
        onClose={() => setPrevPriceModal((prev) => ({ ...prev, isOpen: false }))}
      />
    </div>
  );
}

function PaymentModal({
  totals,
  customerName,
  itemCount,
  splitMode,
  setSplitMode,
  payments,
  setPayments,
  hasCustomer,
  canDiscount,
  billDiscount,
  setBillDiscount,
  billDiscountMode,
  setBillDiscountMode,
  onBack,
  onPay,
  isPending,
  error,
}) {
  const grandTotal = totals.grandTotal;
  const paymentsTotal = payments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
  const remaining = Math.round((grandTotal - paymentsTotal) * 100) / 100;

  const toggleSplit = (next) => {
    setSplitMode(next);
    if (next) {
      setPayments(PAYMENT_METHODS.map((m) => ({ payment_method: m.key, amount: m.key === 'credit' ? grandTotal : 0, reference_no: '' })));
    } else {
      setPayments([{ payment_method: 'credit', amount: grandTotal, reference_no: '' }]);
    }
  };

  const getAmount = (key) => Number(payments.find((p) => p.payment_method === key)?.amount || 0);

  const setSplitAmount = (key, raw) => {
    let value = Number(raw);
    if (Number.isNaN(value) || value < 0) value = 0;
    setPayments((prev) => {
      const othersTotal = prev.filter((p) => p.payment_method !== key).reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
      const capped = Math.min(value, Math.max(0, grandTotal - othersTotal));
      const exists = prev.some((p) => p.payment_method === key);
      return exists
        ? prev.map((p) => (p.payment_method === key ? { ...p, amount: capped } : p))
        : [...prev, { payment_method: key, amount: capped, reference_no: '' }];
    });
  };

  const singleMethod = payments[0]?.payment_method || 'cash';
  const singleAmount = payments[0]?.amount ?? grandTotal;

  const setSingleAmount = (raw) => {
    let value = Number(raw);
    if (Number.isNaN(value) || value < 0) value = 0;
    if (value > grandTotal) value = grandTotal;
    setPayments((prev) => [{ ...prev[0], amount: value }]);
  };

  const blockedNoCustomer = remaining > 0.009 && !hasCustomer;

  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/30 p-4">
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto card p-5">
        <div className="mb-3">
          <div className="text-lg font-bold text-[#14264F]">Payment</div>
          <div className="text-xs text-[#64789D]">{customerName || 'Walk-in Customer'} · {itemCount} item(s)</div>
        </div>

        {canDiscount && (
          <div className="mb-3 rounded-xl border border-[#D7E5FF] bg-[#EDF5FF] p-2.5">
            <div className="mb-1 flex items-center justify-between text-xs font-semibold text-[#64789D]">
              <span>Bill Discount</span>
              <div className="flex overflow-hidden rounded-lg border border-[#D7E5FF] text-xs">
                <button
                  type="button"
                  onClick={() => setBillDiscountMode('amount')}
                  className={`px-2 py-0.5 font-semibold transition-colors ${billDiscountMode === 'amount' ? 'bg-[#E8C985] text-[#0B1B45]' : 'bg-white text-[#64789D]'}`}
                >
                  Rs.
                </button>
                <button
                  type="button"
                  onClick={() => setBillDiscountMode('percent')}
                  className={`px-2 py-0.5 font-semibold transition-colors ${billDiscountMode === 'percent' ? 'bg-[#E8C985] text-[#0B1B45]' : 'bg-white text-[#64789D]'}`}
                >
                  %
                </button>
              </div>
            </div>
            <input
              type="number"
              min="0"
              step="any"
              placeholder="Enter discount amount..."
              value={billDiscount}
              onChange={(e) => setBillDiscount(e.target.value)}
              className="input font-semibold text-[#14264F] border-[#D7E5FF]"
            />
          </div>
        )}

        <div className="mb-4 rounded-xl bg-[#EDF5FF] px-4 py-3 text-center border border-[#D7E5FF] shadow-xs">
          <div className="text-xs font-bold uppercase tracking-wider text-[#315BFF]">Total Payable</div>
          <div className="text-2xl font-extrabold text-[#14264F]">Rs. {grandTotal.toFixed(2)}</div>
        </div>

        <div className="mb-3 flex overflow-hidden rounded-xl border border-[#D7E5FF] bg-[#EDF5FF] p-1 text-sm">
          <button onClick={() => toggleSplit(false)} className={`flex-1 rounded-lg px-3 py-1.5 font-semibold transition-all ${!splitMode ? 'bg-white shadow-xs text-[#0B1B45]' : 'text-[#64789D]'}`}>
            Single Payment
          </button>
          <button onClick={() => toggleSplit(true)} className={`flex-1 rounded-lg px-3 py-1.5 font-semibold transition-all ${splitMode ? 'bg-white shadow-xs text-[#0B1B45]' : 'text-[#64789D]'}`}>
            Split Payment
          </button>
        </div>

        {!splitMode ? (
          <>
            <div className="mb-1 text-xs font-semibold text-[#64789D]">Payment Method</div>
            <div className="mb-3 grid grid-cols-3 gap-2">
              {PAYMENT_METHODS.map((m) => (
                <button
                  key={m.key}
                  onClick={() => setPayments((prev) => [{ ...prev[0], payment_method: m.key }])}
                  className={`rounded-xl border px-2 py-2.5 text-sm font-semibold transition-all ${
                    singleMethod === m.key ? 'border-[#315BFF] bg-[#EDF5FF] text-[#0B1B45] shadow-xs' : 'border-[#D7E5FF] bg-white text-[#64789D] hover:bg-[#F5F8FF]'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
            <div className="mb-1 text-xs font-semibold text-[#64789D]">Amount</div>
            <input
              type="number"
              min="0"
              step="any"
              value={singleAmount}
              onChange={(e) => setSingleAmount(e.target.value)}
              className="input mb-3 text-lg font-bold text-[#14264F] border-[#D7E5FF]"
            />
          </>
        ) : (
          <div className="mb-3 flex flex-col gap-2">
            {PAYMENT_METHODS.map((m) => (
              <div key={m.key} className="flex items-center justify-between gap-2">
                <span className="w-14 text-sm font-semibold text-[#14264F]">{m.label}</span>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={getAmount(m.key)}
                  onChange={(e) => setSplitAmount(m.key, e.target.value)}
                  className="input flex-1 text-right font-semibold text-[#14264F] border-[#D7E5FF]"
                />
              </div>
            ))}
          </div>
        )}

        <div className="mb-1 flex justify-between text-sm text-[#64789D]">
          <span>Subtotal</span><span className="font-semibold text-[#14264F]">Rs. {totals.subtotal.toFixed(2)}</span>
        </div>
        {totals.discountAmount > 0 && (
          <div className="mb-1 flex justify-between text-sm text-[#64789D]">
            <span>Discount</span><span className="text-[#F05B7A] font-semibold">- Rs. {totals.discountAmount.toFixed(2)}</span>
          </div>
        )}
        <div className="mb-1 flex justify-between text-sm text-[#64789D]">
          <span>Total Bill</span><span className="font-bold text-[#14264F]">Rs. {grandTotal.toFixed(2)}</span>
        </div>
        <div className="mb-1 flex justify-between text-sm text-[#64789D]">
          <span>Paid</span><span className="font-semibold text-[#14264F]">Rs. {paymentsTotal.toFixed(2)}</span>
        </div>
        <div className={`mb-3 flex justify-between rounded-xl px-3 py-2 text-sm font-bold ${remaining > 0.009 ? 'bg-[#FFF3D8] text-[#92400E]' : 'bg-[#DCFCE7] text-[#16A34A]'}`}>
          <span>{remaining > 0.009 ? 'Remaining (on credit)' : 'Fully Paid'}</span>
          <span>Rs. {Math.max(remaining, 0).toFixed(2)}</span>
        </div>

        {blockedNoCustomer && (
          <p className="mb-2 text-xs text-[#F05B7A]">Select a customer above to allow a partial/credit payment — a walk-in sale must be paid in full.</p>
        )}
        {error && <p className="mb-2 text-sm text-[#F05B7A]">{error}</p>}

        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onBack} disabled={isPending}>Back</Button>
          <Button onClick={onPay} disabled={isPending || blockedNoCustomer} className="bg-gradient-to-r from-[#0B1B45] to-[#2449C6] hover:opacity-95 text-white font-bold rounded-xl px-5 py-2.5">Pay Now</Button>
        </div>
      </div>
    </div>
  );
}

function SummaryRow({ label, value }) {
  return (
    <div className="flex justify-between py-0.5 text-sm">
      <span className="font-semibold text-[#1E293B]">{label}</span>
      <span className="font-black text-[#0B1B45] whitespace-nowrap">Rs. {Number(value).toFixed(2)}</span>
    </div>
  );
}
