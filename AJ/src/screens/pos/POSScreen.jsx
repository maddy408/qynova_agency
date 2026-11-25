import { useEffect, useMemo, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet, Alert, Platform } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { launchCamera, launchImageLibrary } from 'react-native-image-picker';
import { itemsApi, categoriesApi, stockUnitsApi } from '../../api/catalog';
import { customersApi } from '../../api/parties';
import { invoicesApi } from '../../api/invoices';
import { settingsApi } from '../../api/admin';
import { friendlyErrorMessage } from '../../api/client';
import { ProductImage } from '../../components/ProductImage';
import { Icon } from '../../components/Icon';
import { CartSheet } from './CartSheet';
import { BarcodeScannerModal } from './BarcodeScannerModal';
import { ThermalReceiptModal } from './ThermalReceiptModal';
import { HeldBillsModal } from './HeldBillsModal';
import { resolveSellingPrice, priceLine, computeBillDiscountAmount, applyBillDiscountToLines } from '../../utils/pricing';
import { colors } from '../../theme/colors';

function newLine(item, priceType) {
  return {
    key: `${item.id}-${Date.now()}`,
    item,
    qty: 1,
    free_qty: 0,
    discount_mode: 'percent',
    discount_percent: 0,
    discount_amount: '',
    unit_id: item.base_unit_id,
    rate: resolveSellingPrice(item, item.base_unit_id, priceType).rate,
  };
}

export function POSScreen() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState('all');
  const [billType, setBillType] = useState('gst');
  const [billingFormat, setBillingFormat] = useState('local');
  const [priceType, setPriceType] = useState('normal');
  const [cart, setCart] = useState([]);
  const [billDiscountType, setBillDiscountType] = useState('percent');
  const [billDiscountValue, setBillDiscountValue] = useState('');
  const [customerId, setCustomerId] = useState(null);
  const [customerSearch, setCustomerSearch] = useState('');
  const [customerDropdownOpen, setCustomerDropdownOpen] = useState(false);
  const [cartVisible, setCartVisible] = useState(false);
  const [heldVisible, setHeldVisible] = useState(false);
  const [heldId, setHeldId] = useState(null);
  const [completing, setCompleting] = useState(false);
  const [holding, setHolding] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [scanMatches, setScanMatches] = useState(null);
  const [barcodeVisible, setBarcodeVisible] = useState(false);
  const [completedInvoice, setCompletedInvoice] = useState(null);

  const itemsQuery = useQuery({ queryKey: ['items', ''], queryFn: () => itemsApi.list('') });
  const customersQuery = useQuery({ queryKey: ['customers'], queryFn: customersApi.list });
  const categoriesQuery = useQuery({ queryKey: ['categories'], queryFn: categoriesApi.list });
  const unitsQuery = useQuery({ queryKey: ['stock-units'], queryFn: stockUnitsApi.list });
  const heldQuery = useQuery({ queryKey: ['invoices', 'held'], queryFn: () => invoicesApi.list('held') });
  const freeQtyQuery = useQuery({ queryKey: ['settings-free-qty'], queryFn: settingsApi.getFreeQty });

  const items = useMemo(() => (Array.isArray(itemsQuery.data) ? itemsQuery.data : (itemsQuery.data?.items || [])), [itemsQuery.data]);
  const customers = useMemo(() => customersQuery.data || [], [customersQuery.data]);
  const categories = categoriesQuery.data || [];
  const units = unitsQuery.data || [];
  const heldInvoices = heldQuery.data || [];

  const selectedCustomer = useMemo(
    () => customers.find((c) => String(c.id) === String(customerId)),
    [customers, customerId]
  );

  useEffect(() => {
    if (selectedCustomer) {
      setBillingFormat(Number(selectedCustomer.is_local_customer) === 1 ? 'local' : 'outstation');
    }
  }, [selectedCustomer]);

  // Selecting a customer auto-applies their configured pricing type
  // (Normal/Retail/Wholesale), mirroring web POS — only fires when the
  // customer actually changes, so a manual price-tab change afterward for
  // this bill is never overwritten again until a different customer is picked.
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

  const filteredCustomers = useMemo(() => {
    const q = customerSearch.trim().toLowerCase();
    if (!q) return customers;
    return customers.filter(
      (c) =>
        (c.ledger_name || '').toLowerCase().includes(q) ||
        (c.phone || '').toLowerCase().includes(q)
    );
  }, [customers, customerSearch]);

  // Paginated for browsing the full customer list without scrolling one long
  // list — search still filters the complete dataset above, unaffected.
  const [customerPage, setCustomerPage] = useState(1);
  const CUSTOMER_PAGE_SIZE = 20;
  const customerTotalPages = Math.max(1, Math.ceil(filteredCustomers.length / CUSTOMER_PAGE_SIZE));
  const customerCurrentPage = Math.min(customerPage, customerTotalPages);
  const pagedCustomers = useMemo(
    () => filteredCustomers.slice((customerCurrentPage - 1) * CUSTOMER_PAGE_SIZE, customerCurrentPage * CUSTOMER_PAGE_SIZE),
    [filteredCustomers, customerCurrentPage]
  );
  useEffect(() => { setCustomerPage(1); }, [customerSearch]);

  const activeCategories = useMemo(
    () => categories.filter((c) => c.is_active === undefined || c.is_active === null || Number(c.is_active) === 1),
    [categories]
  );

  const activeCategoryIds = useMemo(
    () => new Set(activeCategories.map((c) => String(c.id))),
    [activeCategories]
  );

  // O(1) barcode/item_code lookup for the scanner instead of scanning the
  // whole catalog array on every single read — built once per items change,
  // not per scan, so a fast repeated scan never re-walks the list.
  const itemsByCode = useMemo(() => {
    const map = new Map();
    for (const i of items) {
      if (i.barcode) map.set(String(i.barcode).toLowerCase(), i);
      if (i.item_code) map.set(String(i.item_code).toLowerCase(), i);
    }
    return map;
  }, [items]);

  const activeItems = useMemo(() => {
    return items.filter((i) => {
      const isItemActive = i.is_active === undefined || i.is_active === null || Number(i.is_active) === 1;
      const isCatActive = !i.category_id || activeCategoryIds.has(String(i.category_id));
      return isItemActive && isCatActive;
    });
  }, [items, activeCategoryIds]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = activeItems;
    if (activeCategory !== 'all') list = list.filter((i) => String(i.category_id) === String(activeCategory));
    if (!q) return list;
    return list.filter((i) => i.item_name.toLowerCase().includes(q) || (i.item_code || '').toLowerCase().includes(q) || (i.barcode || '') === q);
  }, [activeItems, search, activeCategory]);

  const addToCart = (item) => {
    setCart((prev) => {
      const existing = prev.find((l) => l.item.id === item.id && l.unit_id === item.base_unit_id);
      if (existing) return prev.map((l) => (l.key === existing.key ? { ...l, qty: l.qty + 1 } : l));
      return [...prev, newLine(item, priceType)];
    });
  };

  const handleBarcodeRead = (code) => {
    setBarcodeVisible(false);
    if (!code) return;
    const match = itemsByCode.get(code.toLowerCase());
    if (match) {
      addToCart(match);
    } else {
      Alert.alert('No match', `No product found for barcode "${code}".`);
    }
  };

  const handleScan = async (fromCamera) => {
    const result = await (fromCamera ? launchCamera({ mediaType: 'photo', quality: 0.7 }) : launchImageLibrary({ mediaType: 'photo', quality: 0.7 }));
    const asset = result.assets?.[0];
    if (!asset) return;
    try {
      const res = await itemsApi.imageSearch({ uri: asset.uri, type: asset.type || 'image/jpeg', name: asset.fileName || 'photo.jpg' });
      if (!res.engine_available) {
        Alert.alert('Photo search unavailable', res.message);
        return;
      }
      if (res.matches.length === 0) {
        Alert.alert('No match found', 'No catalog items matched this photo. Try a clearer shot, or search manually.');
        return;
      }
      setScanMatches(res.matches);
    } catch (err) {
      Alert.alert('Error', friendlyErrorMessage(err));
    }
  };

  /**
   * The overall bill discount (from the Payment screen) is distributed
   * proportionally across each line's own discount_amount before the
   * invoice is submitted — never sent as a separate field — so the
   * backend's existing InvoiceModel::priceLine()/computeTotals() (per-item
   * GST rate, GST/Non-GST, Normal/Wholesale/Retail) apply completely
   * unchanged, and reports summing invoice_items.discount_amount already
   * reflect it correctly with no double-counting or new schema needed.
   */
  const buildPayload = () => {
    const pricedLines = cart.map((l) =>
      priceLine(l.item, l.discount_mode === 'amount' ? { ...l, discount_percent: 0 } : { ...l, discount_amount: '' }, billType, priceType)
    );
    const subtotal = pricedLines.reduce((s, l) => s + l.gross, 0);
    const billDiscountAmount = computeBillDiscountAmount(subtotal, billDiscountType, billDiscountValue);

    // No bill discount at all — payload is byte-identical to before this
    // feature existed (still sends discount_percent OR discount_amount per
    // line, whichever mode the user picked), so Hold Bill/resume of a
    // plain per-item discount is completely unaffected.
    if (billDiscountAmount <= 0) {
      return {
        bill_type: billType,
        price_type: priceType,
        customer_id: customerId,
        items: cart.map((l) => ({
          item_id: l.item.id,
          qty: l.qty,
          free_qty: isFreeQtyAllowed ? Number(l.free_qty || 0) : 0,
          unit_id: l.unit_id,
          ...(l.discount_mode === 'amount' ? { discount_amount: Number(l.discount_amount || 0) } : { discount_percent: Number(l.discount_percent || 0) }),
          rate: l.rate,
        })),
      };
    }

    const adjusted = applyBillDiscountToLines(pricedLines, billDiscountAmount);
    return {
      bill_type: billType,
      price_type: priceType,
      customer_id: customerId,
      items: cart.map((l, idx) => ({
        item_id: l.item.id,
        qty: l.qty,
        free_qty: isFreeQtyAllowed ? Number(l.free_qty || 0) : 0,
        unit_id: l.unit_id,
        discount_amount: adjusted[idx].discount_amount,
        rate: l.rate,
      })),
    };
  };

  const resetBill = () => {
    setCart([]);
    setBillDiscountType('percent');
    setBillDiscountValue('');
    setCustomerId(null);
    setHeldId(null);
    setCustomerSearch('');
    setCustomerDropdownOpen(false);
  };

  const holdBill = async () => {
    if (cart.length === 0) return;
    setErrorMessage('');
    setHolding(true);
    try {
      if (heldId) {
        await invoicesApi.update(heldId, buildPayload());
      } else {
        await invoicesApi.create(buildPayload());
      }
      queryClient.invalidateQueries({ queryKey: ['invoices', 'held'] });
      resetBill();
      setCartVisible(false);
    } catch (err) {
      setErrorMessage(friendlyErrorMessage(err));
    } finally {
      setHolding(false);
    }
  };

  const resumeHeld = async (invoice) => {
    const full = await invoicesApi.get(invoice.id);
    setHeldId(full.id);
    setBillType(full.bill_type);
    setPriceType(full.price_type || 'normal');
    setCustomerId(full.customer_id || null);
    setCart(
      full.items.map((it) => ({
        key: `${it.item_id}-${it.id}`,
        item: {
          id: it.item_id, item_name: it.item_name_snapshot, retail_price: it.rate,
          gst_percent: it.tax_percent, cess_percent: 0, base_unit_id: it.unit_id,
        },
        qty: Number(it.qty),
        free_qty: Number(it.free_qty),
        discount_mode: 'percent',
        discount_percent: Number(it.discount_percent),
        discount_amount: '',
        unit_id: it.unit_id,
        rate: Number(it.rate),
      }))
    );
    setHeldVisible(false);
    setCartVisible(true);
  };

  const discardHeld = async (invoiceId) => {
    await invoicesApi.discard(invoiceId);
    queryClient.invalidateQueries({ queryKey: ['invoices', 'held'] });
    if (heldId === invoiceId) resetBill();
  };

  const completeSale = async (payments) => {
    setErrorMessage('');
    setCompleting(true);
    try {
      const payload = buildPayload();
      const held = heldId ? await invoicesApi.update(heldId, payload) : await invoicesApi.create(payload);
      const result = await invoicesApi.complete(held.id, payments);
      const fullInvoice = await invoicesApi.get(held.id).catch(() => result);

      resetBill();
      setCartVisible(false);
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      queryClient.invalidateQueries({ queryKey: ['invoices', 'held'] });
      setCompletedInvoice(fullInvoice || result);
    } catch (err) {
      setErrorMessage(friendlyErrorMessage(err));
    } finally {
      setCompleting(false);
    }
  };

  return (
    <View style={styles.screen}>
      <View style={styles.searchRow}>
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Search product by name, code or barcode…"
          placeholderTextColor={colors.inkMuted}
          style={styles.searchInput}
        />
        <TouchableOpacity style={styles.cameraBtn} onPress={() => setBarcodeVisible(true)}>
          <Icon name="barcode" size={20} color={colors.ink} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.cameraBtn} onPress={() => handleScan(true)}>
          <Icon name="camera" size={20} color={colors.ink} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.cameraBtn} onPress={() => setHeldVisible(true)}>
          <Icon name="clipboard" size={20} color={colors.ink} />
          {heldInvoices.length > 0 && (
            <View style={styles.heldBadge}><Text style={styles.heldBadgeText}>{heldInvoices.length}</Text></View>
          )}
        </TouchableOpacity>
      </View>

      <View style={styles.toggleRow}>
        <View style={styles.segment}>
          <TouchableOpacity style={[styles.segmentBtn, billType === 'gst' && styles.segmentBtnActive]} onPress={() => setBillType('gst')}>
            <Text style={billType === 'gst' ? styles.segmentTextActive : styles.segmentText}>GST</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.segmentBtn, billType === 'non_gst' && styles.segmentBtnActive]} onPress={() => setBillType('non_gst')}>
            <Text style={billType === 'non_gst' ? styles.segmentTextActive : styles.segmentText}>Non-GST</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.segment}>
          <TouchableOpacity style={[styles.segmentBtn, billingFormat === 'local' && styles.segmentBtnActive]} onPress={() => setBillingFormat('local')}>
            <Text style={billingFormat === 'local' ? styles.segmentTextActive : styles.segmentText}>Local</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.segmentBtn, billingFormat === 'outstation' && styles.segmentBtnActive]} onPress={() => setBillingFormat('outstation')}>
            <Text style={billingFormat === 'outstation' ? styles.segmentTextActive : styles.segmentText}>Distance</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.segment}>
          {['normal', 'retail', 'wholesale'].map((pt) => (
            <TouchableOpacity
              key={pt}
              style={[styles.segmentBtn, priceType === pt && styles.segmentBtnActive]}
              onPress={() => {
                setPriceType(pt);
                setCart((prev) => prev.map((l) => ({ ...l, rate: resolveSellingPrice(l.item, l.unit_id, pt).rate })));
              }}
            >
              <Text style={priceType === pt ? styles.segmentTextActive : styles.segmentText}>{pt === 'normal' ? 'Normal' : pt === 'retail' ? 'Retail' : 'Wholesale'}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <View style={[styles.customerContainer, { zIndex: 10 }]}>
        <View style={styles.customerRow}>
          <TouchableOpacity
            style={[styles.customerChip, !customerId && styles.customerChipActive]}
            onPress={() => {
              setCustomerId(null);
              setCustomerSearch('');
              setCustomerDropdownOpen(false);
            }}
          >
            <Text style={!customerId ? styles.customerChipTextActive : styles.customerChipText}>Walk-in</Text>
          </TouchableOpacity>

          <View style={styles.customerSearchWrap}>
            <View style={[styles.customerInputBox, customerDropdownOpen && styles.customerInputBoxActive]}>
              <Icon name="search" size={16} color={colors.inkMuted} style={{ marginRight: 6 }} />
              <TextInput
                value={selectedCustomer ? selectedCustomer.ledger_name : customerSearch}
                onChangeText={(text) => {
                  setCustomerSearch(text);
                  if (customerId) setCustomerId(null);
                  setCustomerDropdownOpen(true);
                }}
                onFocus={() => setCustomerDropdownOpen(true)}
                placeholder="Search & choose customer..."
                placeholderTextColor={colors.inkMuted}
                style={styles.customerTextInput}
              />
              {(selectedCustomer || customerSearch.length > 0) && (
                <TouchableOpacity
                  onPress={() => {
                    setCustomerId(null);
                    setCustomerSearch('');
                    setCustomerDropdownOpen(false);
                  }}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  style={styles.customerClearBtn}
                >
                  <Icon name="close" size={14} color={colors.inkMuted} />
                </TouchableOpacity>
              )}
            </View>
          </View>
        </View>

        {customerDropdownOpen && (
          <View style={styles.customerDropdownList}>
            <FlatList
              data={pagedCustomers}
              keyExtractor={(c) => String(c.id)}
              keyboardShouldPersistTaps="handled"
              nestedScrollEnabled={true}
              style={styles.customerListMaxHeight}
              ListEmptyComponent={
                <Text style={styles.noCustomerText}>No customer found</Text>
              }
              ListFooterComponent={filteredCustomers.length > CUSTOMER_PAGE_SIZE ? (
                <View style={styles.customerPagerRow}>
                  <TouchableOpacity
                    style={[styles.customerPagerBtn, customerCurrentPage === 1 && styles.customerPagerBtnDisabled]}
                    onPress={() => setCustomerPage((p) => Math.max(1, p - 1))}
                    disabled={customerCurrentPage === 1}
                  >
                    <Text style={styles.customerPagerBtnText}>Prev</Text>
                  </TouchableOpacity>
                  <Text style={styles.customerPagerLabel}>
                    Page {customerCurrentPage} of {customerTotalPages} · {filteredCustomers.length}
                  </Text>
                  <TouchableOpacity
                    style={[styles.customerPagerBtn, customerCurrentPage === customerTotalPages && styles.customerPagerBtnDisabled]}
                    onPress={() => setCustomerPage((p) => Math.min(customerTotalPages, p + 1))}
                    disabled={customerCurrentPage === customerTotalPages}
                  >
                    <Text style={styles.customerPagerBtnText}>Next</Text>
                  </TouchableOpacity>
                </View>
              ) : null}
              renderItem={({ item: c }) => (
                <TouchableOpacity
                  style={[styles.customerOption, customerId === c.id && styles.customerOptionActive]}
                  onPress={() => {
                    setCustomerId(c.id);
                    setCustomerSearch('');
                    setCustomerDropdownOpen(false);
                  }}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.customerOptionName, customerId === c.id && styles.customerOptionNameActive]}>
                      {c.ledger_name}
                    </Text>
                    {c.phone ? <Text style={styles.customerOptionPhone}>{c.phone}</Text> : null}
                  </View>
                  {customerId === c.id && <Icon name="check" size={16} color={colors.gold} />}
                </TouchableOpacity>
              )}
            />
            <TouchableOpacity style={styles.closeDropdownBtn} onPress={() => setCustomerDropdownOpen(false)}>
              <Text style={styles.closeDropdownText}>Close</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      <FlatList
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.categoryRow}
        contentContainerStyle={{ paddingHorizontal: 12, gap: 6 }}
        data={[{ id: 'all', name: 'All' }, ...activeCategories]}
        keyExtractor={(c) => String(c.id)}
        renderItem={({ item: c }) => (
          <TouchableOpacity
            style={[styles.categoryChip, activeCategory === c.id && styles.categoryChipActive]}
            onPress={() => setActiveCategory(c.id)}
          >
            <Text style={activeCategory === c.id ? styles.categoryChipTextActive : styles.categoryChipText}>{c.name}</Text>
          </TouchableOpacity>
        )}
      />

      <FlatList
        data={filtered}
        keyExtractor={(i) => String(i.id)}
        numColumns={2}
        contentContainerStyle={{ padding: 8, paddingBottom: 100 }}
        columnWrapperStyle={{ gap: 8 }}
        renderItem={({ item }) => {
          const rate = resolveSellingPrice(item, item.base_unit_id, priceType).rate;
          return (
            <TouchableOpacity style={styles.productCard} onPress={() => addToCart(item)}>
              <ProductImage path={item.image} size={80} style={{ width: '100%', height: 90, borderRadius: 10 }} />
              <Text style={styles.productName} numberOfLines={1}>{item.item_name}</Text>
              <Text style={styles.productPrice}>Rs. {rate.toFixed(2)}</Text>
              <Text style={styles.productCode}>{item.item_code}</Text>
            </TouchableOpacity>
          );
        }}
      />

      {cart.length > 0 && (
        <TouchableOpacity style={styles.cartBar} onPress={() => setCartVisible(true)}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Icon name="cart" size={20} color={colors.gold} style={{ marginRight: 8 }} />
            <Text style={styles.cartBarText}>{cart.length} item(s) in cart</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Text style={styles.cartBarText}>View Cart</Text>
            <Icon name="chevronRight" size={18} color={colors.gold} style={{ marginLeft: 4 }} />
          </View>
        </TouchableOpacity>
      )}

      <BarcodeScannerModal visible={barcodeVisible} onScan={handleBarcodeRead} onClose={() => setBarcodeVisible(false)} />

      <CartSheet
        visible={cartVisible}
        cart={cart}
        setCart={setCart}
        billType={billType}
        priceType={priceType}
        units={units}
        billDiscountType={billDiscountType}
        setBillDiscountType={setBillDiscountType}
        billDiscountValue={billDiscountValue}
        setBillDiscountValue={setBillDiscountValue}
        hasCustomer={!!customerId}
        isFreeQtyAllowed={isFreeQtyAllowed}
        onClose={() => setCartVisible(false)}
        onComplete={completeSale}
        onHold={holdBill}
        holding={holding}
        completing={completing}
        errorMessage={errorMessage}
      />

      <HeldBillsModal
        visible={heldVisible}
        heldInvoices={heldInvoices}
        onResume={resumeHeld}
        onDiscard={discardHeld}
        onClose={() => setHeldVisible(false)}
      />

      <ThermalReceiptModal
        visible={!!completedInvoice}
        invoice={completedInvoice}
        onClose={() => setCompletedInvoice(null)}
      />

      {scanMatches && (
        <View style={styles.scanOverlay}>
          <View style={styles.scanCard}>
            <Text style={styles.scanTitle}>Matching products</Text>
            <FlatList
              data={scanMatches}
              keyExtractor={(i) => String(i.id)}
              renderItem={({ item }) => (
                <TouchableOpacity style={styles.scanRow} onPress={() => { addToCart(item); setScanMatches(null); }}>
                  <ProductImage path={item.image} size={40} />
                  <Text style={{ marginLeft: 10, flex: 1 }}>{item.item_name}</Text>
                  <Text style={{ color: colors.gold, fontWeight: '700' }}>Add</Text>
                </TouchableOpacity>
              )}
            />
            <TouchableOpacity style={styles.scanClose} onPress={() => setScanMatches(null)}>
              <Text>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  customerListMaxHeight: { maxHeight: 240 },
  customerPagerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8, paddingHorizontal: 4, borderTopWidth: 1, borderTopColor: colors.borderSoft },
  customerPagerBtn: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6, backgroundColor: colors.page },
  customerPagerBtnDisabled: { opacity: 0.4 },
  customerPagerBtnText: { color: colors.ink, fontWeight: '600', fontSize: 11 },
  customerPagerLabel: { color: colors.inkMuted, fontSize: 10, fontWeight: '600', flexShrink: 1, textAlign: 'center' },
  screen: { flex: 1, backgroundColor: colors.page },
  searchRow: { flexDirection: 'row', padding: 12, gap: 8 },
  searchInput: { flex: 1, backgroundColor: colors.card, borderRadius: 10, borderWidth: 1, borderColor: colors.borderSoft, paddingHorizontal: 12, paddingVertical: 10, color: colors.ink, fontSize: 13 },
  cameraBtn: { width: 44, height: 44, borderRadius: 10, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.borderSoft, alignItems: 'center', justifyContent: 'center' },
  heldBadge: { position: 'absolute', top: -4, right: -4, backgroundColor: colors.danger, borderRadius: 8, minWidth: 16, height: 16, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 },
  heldBadgeText: { color: '#fff', fontSize: 9, fontWeight: '700' },
  toggleRow: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 12, marginBottom: 8, gap: 8 },
  segment: { flexDirection: 'row', backgroundColor: colors.card, borderRadius: 8, borderWidth: 1, borderColor: colors.borderSoft, overflow: 'hidden' },
  segmentBtn: { paddingHorizontal: 10, paddingVertical: 6 },
  segmentBtnActive: { backgroundColor: colors.navbar },
  segmentText: { fontSize: 11, fontWeight: '600', color: colors.inkMuted },
  segmentTextActive: { fontSize: 11, fontWeight: '700', color: colors.gold },
  customerContainer: { paddingHorizontal: 12, marginBottom: 8, position: 'relative' },
  customerRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  customerChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.borderSoft, justifyContent: 'center', alignItems: 'center' },
  customerChipActive: { backgroundColor: colors.gold, borderColor: colors.gold },
  customerChipText: { fontSize: 12, color: colors.inkMuted, fontWeight: '600' },
  customerChipTextActive: { fontSize: 12, color: '#fff', fontWeight: '700' },
  customerSearchWrap: { flex: 1 },
  customerInputBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.card, borderRadius: 10, borderWidth: 1, borderColor: colors.borderSoft, paddingHorizontal: 10, height: 38 },
  customerInputBoxActive: { borderColor: colors.gold },
  customerTextInput: { flex: 1, fontSize: 12, color: colors.ink, padding: 0 },
  customerClearBtn: { padding: 4 },
  customerDropdownList: {
    position: 'absolute',
    top: 44,
    left: 12,
    right: 12,
    backgroundColor: '#0f172a',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#334155',
    elevation: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    zIndex: 999,
    overflow: 'hidden',
  },
  customerOption: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#1e293b' },
  customerOptionActive: { backgroundColor: '#1e293b' },
  customerOptionName: { fontSize: 13, color: '#f8fafc', fontWeight: '600' },
  customerOptionNameActive: { color: colors.gold, fontWeight: '700' },
  customerOptionPhone: { fontSize: 11, color: '#94a3b8', marginTop: 2 },
  noCustomerText: { padding: 14, textAlign: 'center', color: '#94a3b8', fontSize: 12 },
  closeDropdownBtn: { backgroundColor: '#1e293b', paddingVertical: 8, alignItems: 'center', borderTopWidth: 1, borderTopColor: '#334155' },
  closeDropdownText: { color: colors.gold, fontSize: 12, fontWeight: '700' },
  categoryRow: { marginBottom: 6, minHeight: 38, maxHeight: 42 },
  categoryChip: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 14, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.borderSoft, justifyContent: 'center', alignItems: 'center' },
  categoryChipActive: { backgroundColor: colors.ink, borderColor: colors.ink },
  categoryChipText: { fontSize: 12, color: colors.inkMuted, fontWeight: '600', lineHeight: 16 },
  categoryChipTextActive: { fontSize: 12, color: '#fff', fontWeight: '700', lineHeight: 16 },
  productCard: { flex: 1, backgroundColor: colors.card, borderRadius: 12, padding: 8, marginBottom: 8, borderWidth: 1, borderColor: colors.borderSoft },
  productName: { fontSize: 13, fontWeight: '600', color: colors.ink, marginTop: 6 },
  productPrice: { fontSize: 14, fontWeight: '700', color: colors.ink },
  productCode: { fontSize: 11, color: colors.inkMuted },
  cartBar: {
    position: 'absolute',
    bottom: Platform.OS === 'android' ? 68 : 60,
    left: 16,
    right: 16,
    backgroundColor: colors.navbar,
    borderRadius: 12,
    padding: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  cartBarText: { color: colors.gold, fontWeight: '700' },
  scanOverlay: { position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center' },
  scanCard: { width: '85%', maxHeight: '60%', backgroundColor: colors.card, borderRadius: 12, padding: 16 },
  scanTitle: { fontWeight: '700', marginBottom: 8 },
  scanRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.borderSoft },
  scanClose: { marginTop: 12, alignItems: 'center', padding: 10 },
});
