import { useState, useRef, useEffect, useMemo } from 'react';
import { Search, Plus, Minus, Trash2, X, Zap, ArrowRight, AlertCircle, CheckCircle2 } from 'lucide-react';
import { Button } from './Button.jsx';
import { resolveSellingPrice } from '../utils/pricing.js';

/**
 * QuickSaleModal
 * Dedicated compact popup for fast product entry, stock validation,
 * running subtotal calculation, and seamless transfer into POS billing.
 */
export function QuickSaleModal({
  isOpen,
  onClose,
  items = [],
  getItemStock,
  priceType = 'normal',
  onGenerateBill,
  onContinueToBilling,
  isGenerating = false,
}) {
  const [search, setSearch] = useState('');
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [qty, setQty] = useState(1);
  const [unitPrice, setUnitPrice] = useState('');
  const [addedItems, setAddedItems] = useState([]);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [dropdownIndex, setDropdownIndex] = useState(-1);
  const [errorMsg, setErrorMsg] = useState('');

  const searchInputRef = useRef(null);
  const qtyInputRef = useRef(null);
  const priceInputRef = useRef(null);
  const dropdownRef = useRef(null);
  const manualItemCounterRef = useRef(1);

  // Focus search input when modal opens
  useEffect(() => {
    if (isOpen) {
      setSearch('');
      setSelectedProduct(null);
      setQty(1);
      setUnitPrice('');
      setAddedItems([]);
      setErrorMsg('');
      setIsDropdownOpen(false);
      setDropdownIndex(-1);
      manualItemCounterRef.current = 1;
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 50);
    }
  }, [isOpen]);

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target) && !searchInputRef.current?.contains(e.target)) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Filter items based on search input
  const filteredProducts = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term || (selectedProduct && selectedProduct.item_name.toLowerCase() === term)) {
      return [];
    }
    return items
      .filter((i) => {
        const nameMatch = (i.item_name || '').toLowerCase().includes(term);
        const codeMatch = (i.item_code || '').toLowerCase().includes(term);
        const barcodeMatch = (i.barcode || '').toLowerCase().includes(term);
        return nameMatch || codeMatch || barcodeMatch;
      })
      .slice(0, 8);
  }, [items, search, selectedProduct]);

  // Selected item stock
  const currentStock = useMemo(() => {
    if (!selectedProduct) return 0;
    return typeof getItemStock === 'function' ? getItemStock(selectedProduct) : (selectedProduct.quantity_on_hand ?? 0);
  }, [selectedProduct, getItemStock]);

  // Calculate live amount for the entry row
  const calculatedAmount = useMemo(() => {
    const q = Number(qty) || 0;
    const p = Number(unitPrice) || 0;
    return Math.max(0, q * p);
  }, [qty, unitPrice]);

  // Calculate running subtotal of all added items
  const runningSubtotal = useMemo(() => {
    return addedItems.reduce((acc, it) => acc + (Number(it.amount) || 0), 0);
  }, [addedItems]);

  const totalQuantity = useMemo(() => {
    return addedItems.reduce((acc, it) => acc + (Number(it.qty) || 0), 0);
  }, [addedItems]);

  // Select a product from the list
  const handleSelectProduct = (product, autoAdd = false) => {
    const stock = typeof getItemStock === 'function' ? getItemStock(product) : (product.quantity_on_hand ?? 0);
    if (stock <= 0) {
      setErrorMsg(`"${product.item_name}" is out of stock.`);
      return;
    }

    const priceInfo = resolveSellingPrice(product, product.base_unit_id, priceType);
    const resolvedRate = priceInfo.rate;

    if (autoAdd) {
      // Direct auto-add (e.g. from exact barcode scan)
      addItemToList(product, 1, resolvedRate);
      setSearch('');
      setSelectedProduct(null);
      setQty(1);
      setUnitPrice('');
      setIsDropdownOpen(false);
      setDropdownIndex(-1);
      setErrorMsg('');
      searchInputRef.current?.focus();
      return;
    }

    setSelectedProduct(product);
    setSearch(product.item_name);
    setUnitPrice(resolvedRate);
    setQty(1);
    setIsDropdownOpen(false);
    setDropdownIndex(-1);
    setErrorMsg('');
    setTimeout(() => {
      qtyInputRef.current?.focus();
      qtyInputRef.current?.select();
    }, 50);
  };

  // Helper to add or merge item into addedItems list
  const addItemToList = (product, quantity, rate) => {
    const stock = typeof getItemStock === 'function' ? getItemStock(product) : (product.quantity_on_hand ?? 0);
    const numQty = Number(quantity);
    const numRate = Number(rate);

    setAddedItems((prev) => {
      const existingIdx = prev.findIndex((it) => it.id === product.id && it.unit_id === product.base_unit_id);
      if (existingIdx >= 0) {
        const next = [...prev];
        const newQty = next[existingIdx].qty + numQty;
        if (newQty > stock) {
          setErrorMsg(`Cannot add more. Reached available stock limit of ${stock}.`);
          return prev;
        }
        next[existingIdx] = {
          ...next[existingIdx],
          qty: newQty,
          rate: numRate,
          amount: newQty * numRate,
        };
        return next;
      }

      if (numQty > stock) {
        setErrorMsg(`Requested quantity (${numQty}) exceeds available stock (${stock}).`);
        return prev;
      }

      return [
        ...prev,
        {
          id: product.id,
          rawItem: product,
          name: product.item_name,
          barcode: product.barcode || product.item_code || '',
          unit_id: product.base_unit_id,
          qty: numQty,
          rate: numRate,
          amount: numQty * numRate,
        },
      ];
    });
  };

  // Add Item button handler
  const handleAddItem = () => {
    const numQty = Number(qty);
    if (!numQty || numQty <= 0) {
      setErrorMsg('Quantity must be greater than 0.');
      qtyInputRef.current?.focus();
      return;
    }

    const numRate = Number(unitPrice);
    if (unitPrice === '' || isNaN(numRate) || numRate < 0) {
      setErrorMsg('Please enter a valid unit price.');
      priceInputRef.current?.focus();
      return;
    }

    if (selectedProduct) {
      if (currentStock <= 0) {
        setErrorMsg(`"${selectedProduct.item_name}" is out of stock.`);
        return;
      }

      const existingInList = addedItems.find(
        (it) => !it.is_manual && it.id === selectedProduct.id && it.unit_id === selectedProduct.base_unit_id
      );
      const totalQtyWillBe = (existingInList ? existingInList.qty : 0) + numQty;
      if (totalQtyWillBe > currentStock) {
        setErrorMsg(
          `Only ${currentStock} in stock. ${existingInList ? `(Already added ${existingInList.qty})` : ''}`
        );
        return;
      }

      addItemToList(selectedProduct, numQty, numRate);
    } else {
      if (search.trim()) {
        setErrorMsg('Please select a product from the list, or clear the search field to add a manual item.');
        return;
      }

      const manualName = `Item${manualItemCounterRef.current++}`;
      setAddedItems((prev) => [
        ...prev,
        {
          key: `manual-${Date.now()}-${Math.random()}`,
          id: null,
          is_manual: true,
          rawItem: null,
          name: manualName,
          barcode: '',
          unit_id: 1,
          qty: numQty,
          rate: numRate,
          amount: numQty * numRate,
        },
      ]);
    }

    // Clear and reset entry fields for next product
    setSelectedProduct(null);
    setSearch('');
    setQty(1);
    setUnitPrice('');
    setErrorMsg('');
    setIsDropdownOpen(false);
    setDropdownIndex(-1);
    searchInputRef.current?.focus();
  };

  // Keyboard navigation for search input & barcode scan
  const handleSearchKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      if (filteredProducts.length > 0) {
        e.preventDefault();
        setIsDropdownOpen(true);
        setDropdownIndex((prev) => (prev < filteredProducts.length - 1 ? prev + 1 : 0));
      }
    } else if (e.key === 'ArrowUp') {
      if (filteredProducts.length > 0) {
        e.preventDefault();
        setIsDropdownOpen(true);
        setDropdownIndex((prev) => (prev > 0 ? prev - 1 : filteredProducts.length - 1));
      }
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const term = search.trim().toLowerCase();
      if (!term) return;

      // 1. Check exact barcode match first (handles hardware barcode scanners)
      const exactBarcodeMatch = items.find((i) => (i.barcode || '').trim().toLowerCase() === term);
      if (exactBarcodeMatch) {
        handleSelectProduct(exactBarcodeMatch, true);
        return;
      }

      // 2. Check exact item_code match
      const exactCodeMatch = items.find((i) => (i.item_code || '').trim().toLowerCase() === term);
      if (exactCodeMatch) {
        handleSelectProduct(exactCodeMatch, true);
        return;
      }

      // 3. Select highlighted dropdown item or single search result
      if (dropdownIndex >= 0 && dropdownIndex < filteredProducts.length) {
        handleSelectProduct(filteredProducts[dropdownIndex]);
      } else if (filteredProducts.length === 1) {
        handleSelectProduct(filteredProducts[0]);
      } else if (filteredProducts.length > 1) {
        setIsDropdownOpen(true);
        setDropdownIndex(0);
      } else {
        setErrorMsg('Product not found.');
      }
    } else if (e.key === 'Escape') {
      if (isDropdownOpen) {
        setIsDropdownOpen(false);
      } else {
        onClose();
      }
    }
  };

  // Remove item from list
  const handleRemoveItem = (item) => {
    setAddedItems((prev) =>
      prev.filter((it) => (item.key ? it.key !== item.key : !(it.id === item.id && it.unit_id === item.unit_id)))
    );
  };

  // Adjust item qty in list
  const handleBumpItemQty = (item, delta) => {
    if (item.is_manual) {
      const newQty = item.qty + delta;
      if (newQty < 1) {
        handleRemoveItem(item);
        return;
      }
      setErrorMsg('');
      setAddedItems((prev) =>
        prev.map((it) =>
          it.key === item.key
            ? { ...it, qty: newQty, amount: newQty * it.rate }
            : it
        )
      );
      return;
    }
    const stock = typeof getItemStock === 'function' ? getItemStock(item.rawItem) : (item.rawItem?.quantity_on_hand ?? 0);
    const newQty = item.qty + delta;
    if (newQty < 1) {
      handleRemoveItem(item);
      return;
    }
    if (newQty > stock) {
      setErrorMsg(`Cannot increase. Stock limit is ${stock}.`);
      return;
    }
    setErrorMsg('');
    setAddedItems((prev) =>
      prev.map((it) =>
        it.id === item.id && it.unit_id === item.unit_id
          ? { ...it, qty: newQty, amount: newQty * it.rate }
          : it
      )
    );
  };

  // Generate Bill action
  const handleGenerateBill = () => {
    if (isGenerating) return;
    if (addedItems.length === 0) {
      setErrorMsg('Please add at least one item before generating the bill.');
      return;
    }

    // Validate quantities, prices, and stock for all items
    for (const item of addedItems) {
      if (item.is_manual) {
        if (item.qty <= 0) {
          setErrorMsg(`Item "${item.name}" has invalid quantity.`);
          return;
        }
        if (isNaN(item.rate) || item.rate < 0) {
          setErrorMsg(`Item "${item.name}" has invalid price.`);
          return;
        }
        continue;
      }
      const stock = typeof getItemStock === 'function' ? getItemStock(item.rawItem) : (item.rawItem?.quantity_on_hand ?? 0);
      if (item.qty <= 0) {
        setErrorMsg(`Item "${item.name}" has invalid quantity.`);
        return;
      }
      if (stock <= 0) {
        setErrorMsg(`Item "${item.name}" is out of stock.`);
        return;
      }
      if (item.qty > stock) {
        setErrorMsg(`Item "${item.name}" requested quantity (${item.qty}) exceeds stock (${stock}).`);
        return;
      }
    }

    if (onGenerateBill) {
      onGenerateBill(addedItems);
    } else if (onContinueToBilling) {
      onContinueToBilling(addedItems);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-3 sm:p-4 backdrop-blur-xs">
      <div className="w-full max-w-2xl bg-white rounded-2xl shadow-2xl border border-border-soft flex flex-col max-h-[85vh] overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border-soft px-4 py-3 bg-gradient-to-r from-page to-white shrink-0">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gold/15 text-gold">
              <Zap size={18} className="fill-current" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-ink">Quick Sale</h3>
                <span className="rounded bg-gold/10 px-2 py-0.5 text-[11px] font-semibold text-gold">
                  Direct Item Entry
                </span>
              </div>
              <p className="text-[11px] text-ink-muted">
                Scan or search items, set quantities, and generate the bill directly.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-ink-muted hover:bg-page hover:text-ink transition-colors"
            title="Close (Esc)"
          >
            <X size={18} />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex flex-col flex-1 overflow-hidden p-4 gap-3">
          
          {/* Error Message Alert */}
          {errorMsg && (
            <div className="flex items-center gap-2 rounded-lg bg-rose-50 border border-rose-200 px-3 py-2 text-xs text-rose-700 animate-in fade-in">
              <AlertCircle size={14} className="shrink-0" />
              <span className="flex-1 font-medium">{errorMsg}</span>
              <button
                type="button"
                onClick={() => setErrorMsg('')}
                className="text-rose-500 hover:text-rose-700 font-bold"
              >
                ×
              </button>
            </div>
          )}

          {/* Item Entry Section (Compact) */}
          <div className="rounded-xl border border-border-soft bg-page/60 p-3 shrink-0">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted mb-2">
              Add Product
            </div>

            {/* Grid of entry inputs */}
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-end">
              
              {/* Product Search Field */}
              <div className="sm:col-span-5 relative" ref={dropdownRef}>
                <label className="block text-xs font-medium text-ink-muted mb-1">
                  Product / Barcode
                </label>
                <div className="relative">
                  <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-muted" />
                  <input
                    ref={searchInputRef}
                    type="text"
                    value={search}
                    onChange={(e) => {
                      setSearch(e.target.value);
                      setIsDropdownOpen(true);
                      if (selectedProduct && e.target.value !== selectedProduct.item_name) {
                        setSelectedProduct(null);
                        setUnitPrice('');
                      }
                      if (errorMsg) setErrorMsg('');
                    }}
                    onFocus={() => {
                      if (filteredProducts.length > 0) setIsDropdownOpen(true);
                    }}
                    onKeyDown={handleSearchKeyDown}
                    placeholder="Search name, barcode, code..."
                    className="input pl-8 pr-7 py-1.5 text-xs font-medium"
                    autoComplete="off"
                  />
                  {search && (
                    <button
                      type="button"
                      onClick={() => {
                        setSearch('');
                        setSelectedProduct(null);
                        setUnitPrice('');
                        setIsDropdownOpen(false);
                        searchInputRef.current?.focus();
                      }}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-ink-muted hover:text-ink"
                    >
                      <X size={13} />
                    </button>
                  )}
                </div>

                {/* Autocomplete Dropdown */}
                {isDropdownOpen && filteredProducts.length > 0 && (
                  <div className="absolute left-0 right-0 top-full z-30 mt-1 max-h-48 overflow-y-auto rounded-xl border border-border-soft bg-white p-1 shadow-xl">
                    {filteredProducts.map((p, idx) => {
                      const stock = typeof getItemStock === 'function' ? getItemStock(p) : (p.quantity_on_hand ?? 0);
                      const isOutOfStock = stock <= 0;
                      const isHighlighted = idx === dropdownIndex;
                      const priceInfo = resolveSellingPrice(p, p.base_unit_id, priceType);

                      return (
                        <div
                          key={p.id}
                          onClick={() => handleSelectProduct(p)}
                          className={`flex items-center justify-between rounded-lg px-2.5 py-1.5 text-xs cursor-pointer transition-colors ${
                            isHighlighted ? 'bg-primary-soft text-primary font-semibold' : 'hover:bg-page text-ink'
                          } ${isOutOfStock ? 'opacity-50' : ''}`}
                        >
                          <div className="flex-1 truncate mr-2">
                            <div className="font-medium truncate">{p.item_name}</div>
                            <div className="text-[10px] text-ink-muted truncate">
                              {p.barcode ? `Barcode: ${p.barcode}` : p.item_code ? `Code: ${p.item_code}` : ''}
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <div className="font-semibold text-ink">Rs. {priceInfo.rate.toFixed(2)}</div>
                            <div className={`text-[10px] ${isOutOfStock ? 'text-rose-600 font-semibold' : 'text-emerald-600'}`}>
                              {isOutOfStock ? 'Out of stock' : `Stock: ${stock}`}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Quantity Input */}
              <div className="sm:col-span-2">
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-medium text-ink-muted">Qty</label>
                  {selectedProduct && (
                    <span className="text-[10px] text-ink-muted">Max: {currentStock}</span>
                  )}
                </div>
                <input
                  ref={qtyInputRef}
                  type="number"
                  min="1"
                  step="1"
                  value={qty}
                  onChange={(e) => {
                    setQty(e.target.value);
                    if (errorMsg) setErrorMsg('');
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddItem();
                    }
                  }}
                  className="input py-1.5 text-xs text-center font-semibold"
                  placeholder="1"
                />
              </div>

              {/* Unit Price Field */}
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-ink-muted mb-1">
                  Unit Price
                </label>
                <div className="relative">
                  <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-[10px] text-ink-muted">₹</span>
                  <input
                    ref={priceInputRef}
                    type="number"
                    min="0"
                    step="any"
                    value={unitPrice}
                    onChange={(e) => {
                      setUnitPrice(e.target.value);
                      if (errorMsg) setErrorMsg('');
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddItem();
                      }
                    }}
                    placeholder="0.00"
                    className="input pl-5 py-1.5 text-xs font-semibold"
                  />
                </div>
              </div>

              {/* Calculated Amount */}
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-ink-muted mb-1 text-right">
                  Amount
                </label>
                <div className="h-9 px-2 flex items-center justify-end rounded-xl border border-border-soft bg-white text-xs font-bold text-ink">
                  Rs. {calculatedAmount.toFixed(2)}
                </div>
              </div>

              {/* Add Item Button */}
              <div className="sm:col-span-1 flex items-center">
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleAddItem}
                  disabled={
                    selectedProduct
                      ? currentStock <= 0
                      : (!search.trim()
                          ? (!Number(qty) || Number(qty) <= 0 || unitPrice === '' || isNaN(Number(unitPrice)) || Number(unitPrice) < 0)
                          : true)
                  }
                  className="w-full h-9 flex items-center justify-center px-2"
                  title="Add Item (Enter)"
                >
                  <Plus size={15} />
                </Button>
              </div>

            </div>

            {/* Selected product helper text */}
            {selectedProduct && (
              <div className="mt-2 flex items-center gap-1.5 text-[11px] text-ink-muted">
                <CheckCircle2 size={12} className="text-emerald-600 shrink-0" />
                <span className="font-medium text-ink">{selectedProduct.item_name}</span>
                <span>·</span>
                <span>Stock: <strong className="text-emerald-700">{currentStock}</strong></span>
                {selectedProduct.barcode && (
                  <>
                    <span>·</span>
                    <span>Barcode: {selectedProduct.barcode}</span>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Added Items List (Scrollable Area) */}
          <div className="flex-1 flex flex-col min-h-0">
            <div className="flex items-center justify-between mb-1.5 px-1">
              <span className="text-xs font-bold text-ink">
                Added Items ({addedItems.length})
              </span>
              {addedItems.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setAddedItems([]);
                    manualItemCounterRef.current = 1;
                  }}
                  className="text-[11px] text-ink-muted hover:text-rose-600 transition-colors"
                >
                  Clear list
                </button>
              )}
            </div>

            <div className="flex-1 overflow-x-auto overflow-y-auto rounded-xl border border-border-soft bg-white max-h-[220px]">
              {addedItems.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-center text-ink-muted px-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-page mb-2 text-ink-muted">
                    <Zap size={18} />
                  </div>
                  <p className="text-xs font-medium">No items added yet</p>
                  <p className="text-[11px] text-ink-muted/70 mt-0.5">
                    Search or scan a product above and click Add Item.
                  </p>
                </div>
              ) : (
                <table className="w-full min-w-[450px] text-left text-xs">
                  <thead className="sticky top-0 bg-page/90 backdrop-blur-xs text-[10px] uppercase font-semibold text-ink-muted border-b border-border-soft">
                    <tr>
                      <th className="py-2 px-3">Item</th>
                      <th className="py-2 px-2 text-center w-28">Qty</th>
                      <th className="py-2 px-2 text-right w-24">Price</th>
                      <th className="py-2 px-3 text-right w-24">Total</th>
                      <th className="py-2 px-2 text-center w-10"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border-soft/60">
                    {addedItems.map((item) => (
                      <tr key={item.key || `${item.id}-${item.unit_id}`} className="hover:bg-page/40 transition-colors">
                        <td className="py-2 px-3">
                          <div className="font-semibold text-ink truncate max-w-[200px]">{item.name}</div>
                          {item.is_manual ? (
                            <div className="text-[11px] text-ink-muted">
                              {item.qty} × ₹{Number(item.rate).toFixed(2)} = ₹{Number(item.amount).toFixed(2)}
                            </div>
                          ) : (
                            item.barcode && (
                              <div className="text-[10px] text-ink-muted">{item.barcode}</div>
                            )
                          )}
                        </td>
                        <td className="py-2 px-2">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleBumpItemQty(item, -1)}
                              className="h-6 w-6 rounded border border-border-soft flex items-center justify-center hover:bg-page text-ink-muted hover:text-ink transition-colors"
                              title="Decrease"
                            >
                              <Minus size={11} />
                            </button>
                            <span className="w-6 text-center font-bold text-ink">{item.qty}</span>
                            <button
                              type="button"
                              onClick={() => handleBumpItemQty(item, 1)}
                              className="h-6 w-6 rounded border border-border-soft flex items-center justify-center hover:bg-page text-ink-muted hover:text-ink transition-colors"
                              title="Increase"
                            >
                              <Plus size={11} />
                            </button>
                          </div>
                        </td>
                        <td className="py-2 px-2 text-right font-medium text-ink-muted">
                          Rs. {item.rate.toFixed(2)}
                        </td>
                        <td className="py-2 px-3 text-right font-bold text-ink">
                          Rs. {item.amount.toFixed(2)}
                        </td>
                        <td className="py-2 px-2 text-center">
                          <button
                            type="button"
                            onClick={() => handleRemoveItem(item)}
                            className="p-1 rounded text-ink-muted hover:text-rose-600 hover:bg-rose-50 transition-colors"
                            title="Remove"
                          >
                            <Trash2 size={13} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

        </div>

        {/* Running Subtotal & Footer Actions */}
        <div className="border-t border-border-soft px-4 py-3 bg-page/50 shrink-0 flex flex-col sm:flex-row items-center justify-between gap-3">
          {/* Running Subtotal */}
          <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-start">
            <span className="text-xs text-ink-muted">
              Total: <strong className="text-ink">{totalQuantity}</strong> item(s)
            </span>
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-semibold text-ink-muted">Subtotal:</span>
              <span className="text-base font-extrabold text-ink">
                Rs. {runningSubtotal.toFixed(2)}
              </span>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            <Button
              variant="secondary"
              size="sm"
              onClick={onClose}
              disabled={isGenerating}
              className="flex-1 sm:flex-none"
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={handleGenerateBill}
              disabled={addedItems.length === 0 || isGenerating}
              icon={<ArrowRight size={14} />}
              className="flex-1 sm:flex-none"
            >
              {isGenerating ? 'Generating...' : 'Generate Bill'}
            </Button>
          </div>
        </div>

      </div>
    </div>
  );
}
