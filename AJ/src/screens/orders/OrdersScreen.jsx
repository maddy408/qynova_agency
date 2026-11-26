import { useState, useMemo } from 'react';
import { View, Text, TextInput, FlatList, TouchableOpacity, StyleSheet, Alert, ScrollView, Modal } from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { customerPrebookingsApi, purchaseRequestsApi, purchasesApi, routeSuppliersApi } from '../../api/purchasing';
import { customersApi, suppliersApi, routesApi } from '../../api/parties';
import { itemsApi } from '../../api/catalog';
import { usersApi } from '../../api/users';
import { friendlyErrorMessage } from '../../api/client';
import { FormModal, formStyles } from '../../components/FormModal';
import { SelectField } from '../../components/SelectField';
import { ItemLineEditor } from '../../components/ItemLineEditor';
import { SegmentedTabs } from '../../components/SegmentedTabs';
import { Icon } from '../../components/Icon';
import { downloadReportPdf } from '../../utils/pdfService';
import { colors } from '../../theme/colors';
import { usePermission } from '../../hooks/useAuth';

const PB_STATUS_COLOR = {
  pending: colors.warning,
  confirmed: colors.gold,
  processing: colors.gold,
  ready: colors.success,
  completed: colors.success,
  cancelled: colors.danger,
};

const PREBOOKING_NEXT_STATUS = {
  pending: ['confirmed', 'cancelled'],
  confirmed: ['processing', 'cancelled'],
  processing: ['ready', 'cancelled'],
  ready: ['completed', 'cancelled'],
};

const PR_STATUS_COLOR = {
  open: colors.warning,
  approved: colors.gold,
  partially_received: colors.gold,
  converted_to_grn: colors.success,
  cancelled: colors.danger,
};

const BOOKING_SOURCES = [
  { id: 'direct', name: 'Direct Walk-in' },
  { id: 'salesman', name: 'Salesman' },
  { id: 'phone', name: 'Phone' },
  { id: 'whatsapp', name: 'WhatsApp' },
];

function PrebookingFormModal({ visible, onClose }) {
  const queryClient = useQueryClient();
  const customersQuery = useQuery({ queryKey: ['customers'], queryFn: customersApi.list, enabled: visible });
  const routesQuery = useQuery({ queryKey: ['routes'], queryFn: routesApi.list, enabled: visible });
  const usersQuery = useQuery({ queryKey: ['users'], queryFn: usersApi.list, enabled: visible });
  const itemsQuery = useQuery({ queryKey: ['items', ''], queryFn: () => itemsApi.list(''), enabled: visible });

  const [customerId, setCustomerId] = useState(null);
  const [routeId, setRouteId] = useState(null);
  const [employeeId, setEmployeeId] = useState(null);
  const [bookingSource, setBookingSource] = useState('direct');
  const [customEstimatedTotal, setCustomEstimatedTotal] = useState('');
  const [lines, setLines] = useState([{ key: '1', item_id: null, qty: '1', rate: '' }]);
  const [error, setError] = useState('');
  const [touched, setTouched] = useState({});

  const items = itemsQuery.data || [];
  const validLines = lines.filter((l) => l.item_id);
  const subtotal = validLines.reduce((s, l) => s + Number(l.qty || 0) * Number(l.rate || 0), 0);
  const gst = validLines.reduce((s, l) => {
    const item = items.find((i) => i.id === l.item_id);
    return s + Number(l.qty || 0) * Number(l.rate || 0) * (Number(item?.gst_percent || 0) / 100);
  }, 0);
  const autoEstimatedTotal = (subtotal + gst).toFixed(2);

  const createMutation = useMutation({
    mutationFn: customerPrebookingsApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customer-prebookings'] });
      reset();
      onClose();
    },
    onError: (err) => setError(friendlyErrorMessage(err)),
  });

  const reset = () => {
    setCustomerId(null);
    setRouteId(null);
    setEmployeeId(null);
    setBookingSource('direct');
    setCustomEstimatedTotal('');
    setLines([{ key: '1', item_id: null, qty: '1', rate: '' }]);
    setError('');
    setTouched({});
  };

  const submit = () => {
    setTouched({ customer: true, items: true });
    setError('');
    if (!customerId) return setError('Please select a customer.');
    if (validLines.length === 0) return setError('Please add at least one item.');

    createMutation.mutate({
      customer_id: customerId,
      route_id: routeId,
      employee_id: employeeId,
      booking_source: bookingSource,
      estimated_total: Number(customEstimatedTotal !== '' ? customEstimatedTotal : (subtotal + gst)),
      items: validLines.map((l) => ({ item_id: l.item_id, qty: Number(l.qty), rate: l.rate !== '' ? Number(l.rate) : undefined })),
    });
  };

  return (
    <FormModal
      visible={visible}
      title="New Customer Pre-Booking"
      onClose={() => { reset(); onClose(); }}
      footer={
        <>
          <TouchableOpacity style={formStyles.secondaryBtn} onPress={() => { reset(); onClose(); }}>
            <Text style={formStyles.secondaryBtnText}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[formStyles.primaryBtn, createMutation.isPending && formStyles.disabled]}
            onPress={submit}
            disabled={createMutation.isPending}
          >
            <Text style={formStyles.primaryBtnText}>{createMutation.isPending ? 'Saving…' : 'Create Pre-Booking'}</Text>
          </TouchableOpacity>
        </>
      }
    >
      <SelectField
        label="Customer *"
        required
        value={customerId}
        options={customersQuery.data || []}
        labelKey="ledger_name"
        onChange={(v) => { setError(''); setCustomerId(v); }}
      />
      {touched.customer && !customerId ? (
        <Text style={[formStyles.error, { marginTop: -4, marginBottom: 8 }]}>Customer is required.</Text>
      ) : null}

      <SelectField label="Booking Source" value={bookingSource} options={BOOKING_SOURCES} onChange={setBookingSource} />
      <SelectField label="Route (Optional)" value={routeId} options={routesQuery.data || []} onChange={setRouteId} />
      <SelectField label="Salesman / Employee (Optional)" value={employeeId} options={usersQuery.data || []} onChange={setEmployeeId} />

      <Text style={formStyles.label}>Items *</Text>
      <ItemLineEditor lines={lines} setLines={setLines} items={items} />
      {touched.items && validLines.length === 0 ? (
        <Text style={[formStyles.error, { marginTop: 4, marginBottom: 8 }]}>At least one item is required.</Text>
      ) : null}

      <Text style={formStyles.label}>Estimated Total (Rs.) (Editable)</Text>
      <TextInput
        keyboardType="numeric"
        value={customEstimatedTotal !== '' ? customEstimatedTotal : autoEstimatedTotal}
        onChangeText={setCustomEstimatedTotal}
        style={[formStyles.input, { color: colors.ink }]}
        placeholder={autoEstimatedTotal}
        placeholderTextColor={colors.inkMuted}
      />

      <View style={styles.totalsBox}>
        <View style={styles.totalRow}><Text style={styles.totalLabel}>Subtotal</Text><Text style={styles.totalValue}>{subtotal.toFixed(2)}</Text></View>
        <View style={styles.totalRow}><Text style={styles.totalLabel}>GST</Text><Text style={styles.totalValue}>{gst.toFixed(2)}</Text></View>
        <View style={[styles.totalRow, styles.grandRow]}>
          <Text style={styles.grandLabel}>Final Estimated Total</Text>
          <Text style={styles.grandValue}>Rs. {customEstimatedTotal !== '' ? Number(customEstimatedTotal).toFixed(2) : autoEstimatedTotal}</Text>
        </View>
      </View>

      {error ? <Text style={formStyles.error}>{error}</Text> : null}
    </FormModal>
  );
}

function RequestFormModal({ visible, onClose }) {
  const queryClient = useQueryClient();
  const routesQuery = useQuery({ queryKey: ['routes'], queryFn: routesApi.list, enabled: visible });
  const suppliersQuery = useQuery({ queryKey: ['suppliers'], queryFn: suppliersApi.list, enabled: visible });
  const itemsQuery = useQuery({ queryKey: ['items', ''], queryFn: () => itemsApi.list(''), enabled: visible });

  const [routeId, setRouteId] = useState(null);
  const [supplierId, setSupplierId] = useState(null);
  const [lines, setLines] = useState([{ key: '1', item_id: null, qty: '1', rate: '' }]);
  const [error, setError] = useState('');
  const [touched, setTouched] = useState({});

  const mappedSuppliersQuery = useQuery({
    queryKey: ['route-suppliers', routeId],
    queryFn: () => routeSuppliersApi.get(routeId),
    enabled: visible && !!routeId,
  });
  const allSuppliers = suppliersQuery.data || [];
  const mappedIds = mappedSuppliersQuery.data?.supplier_ids;
  const suppliers = routeId && mappedIds && mappedIds.length > 0 ? allSuppliers.filter((s) => mappedIds.includes(s.id)) : allSuppliers;

  const items = itemsQuery.data || [];
  const validLines = lines.filter((l) => l.item_id);
  const total = validLines.reduce((s, l) => s + Number(l.qty || 0) * Number(l.rate || 0), 0);

  const createMutation = useMutation({
    mutationFn: purchaseRequestsApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['purchase-requests'] });
      reset();
      onClose();
    },
    onError: (err) => setError(friendlyErrorMessage(err)),
  });

  const reset = () => {
    setRouteId(null);
    setSupplierId(null);
    setLines([{ key: '1', item_id: null, qty: '1', rate: '' }]);
    setError('');
    setTouched({});
  };

  const submit = () => {
    setTouched({ supplier: true, items: true });
    setError('');
    if (!supplierId) return setError('Please select a supplier.');
    if (validLines.length === 0) return setError('Please add at least one item.');

    createMutation.mutate({
      supplier_id: supplierId,
      route_id: routeId,
      items: validLines.map((l) => ({ item_id: l.item_id, qty: Number(l.qty), rate: Number(l.rate || 0) })),
    });
  };

  return (
    <FormModal
      visible={visible}
      title="New Supplier Purchase Request"
      onClose={() => { reset(); onClose(); }}
      footer={
        <>
          <TouchableOpacity style={formStyles.secondaryBtn} onPress={() => { reset(); onClose(); }}>
            <Text style={formStyles.secondaryBtnText}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[formStyles.primaryBtn, createMutation.isPending && formStyles.disabled]}
            onPress={submit}
            disabled={createMutation.isPending}
          >
            <Text style={formStyles.primaryBtnText}>{createMutation.isPending ? 'Saving…' : 'Generate Request'}</Text>
          </TouchableOpacity>
        </>
      }
    >
      <SelectField
        label="Route (optional — filters suppliers)"
        value={routeId}
        options={routesQuery.data || []}
        onChange={(v) => { setRouteId(v); setSupplierId(null); }}
      />
      <SelectField
        label="Supplier *"
        required
        value={supplierId}
        options={suppliers}
        onChange={(v) => { setError(''); setSupplierId(v); }}
      />
      {touched.supplier && !supplierId ? (
        <Text style={[formStyles.error, { marginTop: -4, marginBottom: 8 }]}>Supplier is required.</Text>
      ) : null}

      <Text style={formStyles.label}>Items *</Text>
      <ItemLineEditor lines={lines} setLines={setLines} items={items} rateLabel="Purchase Rate" />
      {touched.items && validLines.length === 0 ? (
        <Text style={[formStyles.error, { marginTop: 4, marginBottom: 8 }]}>At least one item is required.</Text>
      ) : null}

      <View style={styles.totalsBox}>
        <View style={[styles.totalRow, styles.grandRow]}>
          <Text style={styles.grandLabel}>Estimated Total</Text>
          <Text style={styles.grandValue}>Rs. {total.toFixed(2)}</Text>
        </View>
      </View>

      {error ? <Text style={formStyles.error}>{error}</Text> : null}
    </FormModal>
  );
}

function PrebookingsTab({ modalVisible, setModalVisible }) {
  const canManageStatus = usePermission('orders.manage_prebooking_status');
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [viewBooking, setViewBooking] = useState(null);
  const [detailedBooking, setDetailedBooking] = useState(null);
  const [statusPickerBooking, setStatusPickerBooking] = useState(null);

  const listQuery = useQuery({ queryKey: ['customer-prebookings'], queryFn: customerPrebookingsApi.list });

  const cancelMutation = useMutation({
    mutationFn: customerPrebookingsApi.cancel,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['customer-prebookings'] }),
    onError: (e) => Alert.alert('Error', friendlyErrorMessage(e)),
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }) => customerPrebookingsApi.setStatus(id, status),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['customer-prebookings'] }),
    onError: (e) => Alert.alert('Error', friendlyErrorMessage(e)),
  });

  const rows = listQuery.data || [];

  const filteredRows = useMemo(() => {
    let out = rows;
    if (statusFilter !== 'all') {
      out = out.filter((r) => r.status === statusFilter);
    }
    const q = search.trim().toLowerCase();
    if (q) {
      out = out.filter((r) => {
        const no = (r.prebooking_no || '').toLowerCase();
        const cust = (r.customer_name || '').toLowerCase();
        const phone = (r.customer_phone || '').toLowerCase();
        const route = (r.route_name || '').toLowerCase();
        const status = (r.status || '').toLowerCase();
        const notes = (r.notes || '').toLowerCase();
        return no.includes(q) || cust.includes(q) || phone.includes(q) || route.includes(q) || status.includes(q) || notes.includes(q);
      });
    }
    return out;
  }, [rows, search, statusFilter]);

  const openView = async (booking) => {
    setViewBooking(booking);
    try {
      const full = await customerPrebookingsApi.get(booking.id);
      setDetailedBooking(full);
    } catch {
      setDetailedBooking(booking);
    }
  };

  const handlePrintBooking = (booking) => {
    const items = booking.items || [];
    downloadReportPdf({
      title: `Customer Pre-Booking ${booking.prebooking_no || '#' + booking.id}`,
      columns: {
        item_name: 'Item',
        qty: 'Qty',
        rate: 'Rate (Rs.)',
        line_total: 'Total (Rs.)',
      },
      rows: items.length > 0 ? items.map((i) => ({
        item_name: i.item_name || i.name || 'Item',
        qty: String(i.qty || 1),
        rate: Number(i.rate || 0).toFixed(2),
        line_total: (Number(i.qty || 1) * Number(i.rate || 0)).toFixed(2),
      })) : [
        { item_name: 'Total Items', qty: String(booking.item_count || 1), rate: '-', line_total: Number(booking.estimated_total || 0).toFixed(2) }
      ],
      totalsRow: {
        item_name: 'Grand Total',
        qty: items.length > 0 ? String(items.reduce((s, i) => s + Number(i.qty || 0), 0)) : String(booking.item_count || 1),
        rate: '',
        line_total: Number(booking.estimated_total || 0).toFixed(2),
      },
    }, `prebooking_${booking.prebooking_no || booking.id}.pdf`);
  };

  const nextStatuses = (status) => PREBOOKING_NEXT_STATUS[status] || [];

  return (
    <>
      {/* Search & Filter Bar */}
      <View style={styles.topActionRow}>
        <View style={styles.searchBar}>
          <Icon name="search" size={16} color={colors.inkMuted} style={{ marginRight: 8 }} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search booking #, customer, phone..."
            placeholderTextColor={colors.inkMuted}
            style={styles.searchInput}
            autoCapitalize="none"
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch('')} style={styles.clearSearchBtn}>
              <Text style={styles.clearSearchText}>✕</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Status Pills */}
      <View style={styles.filterPillsRow}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 12, gap: 6 }}>
          {['all', 'pending', 'confirmed', 'processing', 'ready', 'completed', 'cancelled'].map((st) => (
            <TouchableOpacity
              key={st}
              onPress={() => setStatusFilter(st)}
              style={[styles.filterPill, statusFilter === st && styles.filterPillActive]}
            >
              <Text style={[styles.filterPillText, statusFilter === st && styles.filterPillTextActive]}>
                {st.toUpperCase()}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      <FlatList
        data={filteredRows}
        keyExtractor={(r) => String(r.id)}
        contentContainerStyle={{ padding: 12, paddingBottom: 140, flexGrow: 1 }}
        refreshing={listQuery.isFetching}
        onRefresh={listQuery.refetch}
        ListEmptyComponent={
          <View style={styles.noResultsBox}>
            <Text style={styles.empty}>No pre-bookings found.</Text>
            {search ? (
              <TouchableOpacity onPress={() => setSearch('')} style={styles.resetSearchBtn}>
                <Text style={styles.resetSearchBtnText}>Clear Search</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        }
        renderItem={({ item: r }) => (
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle}>{r.prebooking_no}</Text>
              <View style={[styles.statusBadge, { borderColor: PB_STATUS_COLOR[r.status] || colors.borderSoft }]}>
                <Text style={[styles.statusText, { color: PB_STATUS_COLOR[r.status] || colors.ink }]}>
                  {r.status.toUpperCase()}
                </Text>
              </View>
            </View>
            <Text style={styles.cardSubtitle}>{r.customer_name} {r.customer_phone ? `(${r.customer_phone})` : ''}</Text>
            <Text style={styles.cardMeta}>
              {r.booking_date || r.created_at || 'Date N/A'} · {r.item_count} item(s)
              {r.route_name ? ` · Route: ${r.route_name}` : ''}
            </Text>
            <Text style={styles.cardTotal}>Rs. {Number(r.estimated_total || 0).toFixed(2)}</Text>

            <View style={styles.cardActions}>
              <TouchableOpacity onPress={() => openView(r)} style={styles.actionBtn}>
                <Icon name="view" size={14} color={colors.ink} style={{ marginRight: 4 }} />
                <Text style={styles.actionBtnText}>View</Text>
              </TouchableOpacity>

              <TouchableOpacity onPress={() => handlePrintBooking(r)} style={styles.actionBtn}>
                <Icon name="printer" size={14} color={colors.gold} style={{ marginRight: 4 }} />
                <Text style={styles.actionBtnText}>Print</Text>
              </TouchableOpacity>

              {canManageStatus && (
                <TouchableOpacity onPress={() => setStatusPickerBooking(r)} style={styles.actionBtn}>
                  <Text style={styles.actionBtnText}>Status ▾</Text>
                </TouchableOpacity>
              )}

              {canManageStatus && nextStatuses(r.status).map((nst) => (
                <TouchableOpacity
                  key={nst}
                  style={[styles.actionBtn, nst === 'cancelled' ? styles.actionBtnDanger : styles.actionBtnSuccess]}
                  onPress={() => {
                    if (nst === 'cancelled') {
                      Alert.alert('Cancel pre-booking?', r.prebooking_no, [
                        { text: 'No', style: 'cancel' },
                        { text: 'Yes, cancel', style: 'destructive', onPress: () => cancelMutation.mutate(r.id) },
                      ]);
                    } else {
                      statusMutation.mutate({ id: r.id, status: nst });
                    }
                  }}
                >
                  <Text style={nst === 'cancelled' ? styles.actionBtnDangerText : styles.actionBtnSuccessText}>
                    {nst.toUpperCase()}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}
      />
      <PrebookingFormModal visible={modalVisible} onClose={() => setModalVisible(false)} />

      {/* Status Picker Modal */}
      {statusPickerBooking && (
        <StatusPickerModal
          visible={!!statusPickerBooking}
          title={`Update Status: ${statusPickerBooking.prebooking_no}`}
          currentStatus={statusPickerBooking.status}
          statuses={['pending', 'confirmed', 'processing', 'ready', 'completed', 'cancelled']}
          onClose={() => setStatusPickerBooking(null)}
          onSelect={(st) => {
            if (st === 'cancelled') {
              Alert.alert('Cancel pre-booking?', statusPickerBooking.prebooking_no, [
                { text: 'No', style: 'cancel' },
                { text: 'Yes, cancel', style: 'destructive', onPress: () => cancelMutation.mutate(statusPickerBooking.id) },
              ]);
            } else {
              statusMutation.mutate({ id: statusPickerBooking.id, status: st });
            }
          }}
        />
      )}

      {/* View Modal */}
      {viewBooking && (
        <FormModal
          visible
          title={`Pre-Booking: ${viewBooking.prebooking_no}`}
          onClose={() => { setViewBooking(null); setDetailedBooking(null); }}
          footer={
            <View style={{ flexDirection: 'row', gap: 10, width: '100%' }}>
              <TouchableOpacity
                style={[formStyles.secondaryBtn, { flex: 1 }]}
                onPress={() => handlePrintBooking(detailedBooking || viewBooking)}
              >
                <Text style={formStyles.secondaryBtnText}>Print / PDF</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[formStyles.primaryBtn, { flex: 1 }]}
                onPress={() => { setViewBooking(null); setDetailedBooking(null); }}
              >
                <Text style={formStyles.primaryBtnText}>Close</Text>
              </TouchableOpacity>
            </View>
          }
        >
          <View style={styles.detailBox}>
            <DetailRow label="Pre-Booking #" value={viewBooking.prebooking_no} />
            <DetailRow label="Customer" value={viewBooking.customer_name} />
            <DetailRow label="Phone" value={viewBooking.customer_phone || '-'} />
            <DetailRow label="Route" value={viewBooking.route_name || '-'} />
            <DetailRow label="Booking Source" value={(viewBooking.booking_source || 'direct').toUpperCase()} />
            <DetailRow label="Status" value={viewBooking.status.toUpperCase()} />
            <DetailRow label="Estimated Total" value={`Rs. ${Number(viewBooking.estimated_total || 0).toFixed(2)}`} />

            {/* Quick Status Changers inside View Modal */}
            {canManageStatus && (
              <View style={{ marginTop: 14 }}>
                <Text style={[styles.detailLabel, { marginBottom: 6, fontWeight: '700' }]}>Update Status:</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
                  {['pending', 'confirmed', 'processing', 'ready', 'completed', 'cancelled'].map((st) => (
                    <TouchableOpacity
                      key={st}
                      style={[styles.statusSelectPill, viewBooking.status === st && styles.statusSelectPillActive]}
                      onPress={() => {
                        if (st === 'cancelled') {
                          Alert.alert('Cancel pre-booking?', viewBooking.prebooking_no, [
                            { text: 'No', style: 'cancel' },
                            {
                              text: 'Yes, cancel',
                              style: 'destructive',
                              onPress: () => {
                                cancelMutation.mutate(viewBooking.id);
                                setViewBooking((p) => ({ ...p, status: 'cancelled' }));
                              },
                            },
                          ]);
                        } else {
                          statusMutation.mutate({ id: viewBooking.id, status: st });
                          setViewBooking((p) => ({ ...p, status: st }));
                        }
                      }}
                    >
                      <Text style={[styles.statusSelectPillText, viewBooking.status === st && styles.statusSelectPillTextActive]}>
                        {st.toUpperCase()}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}

            {detailedBooking?.items && detailedBooking.items.length > 0 && (
              <View style={{ marginTop: 12 }}>
                <Text style={[styles.detailLabel, { marginBottom: 6, fontWeight: '700' }]}>Item Lines:</Text>
                {detailedBooking.items.map((line, idx) => (
                  <View key={idx} style={styles.itemLineRow}>
                    <Text style={styles.itemLineName}>{line.item_name || `Item #${line.item_id}`}</Text>
                    <Text style={styles.itemLineQty}>Qty: {line.qty}</Text>
                    <Text style={styles.itemLineRate}>@ Rs. {Number(line.rate || 0).toFixed(2)}</Text>
                    <Text style={styles.itemLineTotal}>Rs. {(Number(line.qty || 0) * Number(line.rate || 0)).toFixed(2)}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        </FormModal>
      )}
    </>
  );
}

function RequestsTab({ modalVisible, setModalVisible }) {
  const canApprove = usePermission('orders.approve_purchase_request');
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [viewRequest, setViewRequest] = useState(null);
  const [detailedRequest, setDetailedRequest] = useState(null);
  const [converting, setConverting] = useState(null);

  const listQuery = useQuery({ queryKey: ['purchase-requests'], queryFn: purchaseRequestsApi.list });

  const approveMutation = useMutation({
    mutationFn: purchaseRequestsApi.approve,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['purchase-requests'] });
      Alert.alert('Success', 'Purchase request approved successfully.');
    },
    onError: (e) => Alert.alert('Approval Error', friendlyErrorMessage(e)),
  });

  const cancelMutation = useMutation({
    mutationFn: purchaseRequestsApi.cancel,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['purchase-requests'] }),
    onError: (e) => Alert.alert('Error', friendlyErrorMessage(e)),
  });

  const rows = listQuery.data || [];

  const filteredRows = useMemo(() => {
    let out = rows;
    if (statusFilter !== 'all') {
      out = out.filter((r) => r.status === statusFilter);
    }
    const q = search.trim().toLowerCase();
    if (q) {
      out = out.filter((r) => {
        const no = (r.request_no || '').toLowerCase();
        const supp = (r.supplier_name || '').toLowerCase();
        const route = (r.route_name || '').toLowerCase();
        const status = (r.status || '').toLowerCase();
        const notes = (r.notes || '').toLowerCase();
        return no.includes(q) || supp.includes(q) || route.includes(q) || status.includes(q) || notes.includes(q);
      });
    }
    return out;
  }, [rows, search, statusFilter]);

  const openView = async (req) => {
    setViewRequest(req);
    try {
      const full = await purchaseRequestsApi.get(req.id);
      setDetailedRequest(full);
    } catch {
      setDetailedRequest(req);
    }
  };

  const handlePrintRequest = (req) => {
    const items = req.items || [];
    downloadReportPdf({
      title: `Purchase Request ${req.request_no || '#' + req.id}`,
      columns: {
        item_name: 'Item',
        qty: 'Qty',
        rate: 'Rate (Rs.)',
        line_total: 'Total (Rs.)',
      },
      rows: items.length > 0 ? items.map((i) => ({
        item_name: i.item_name || i.name || 'Item',
        qty: String(i.qty || 1),
        rate: Number(i.rate || 0).toFixed(2),
        line_total: (Number(i.qty || 1) * Number(i.rate || 0)).toFixed(2),
      })) : [
        { item_name: 'Total Items', qty: String(req.item_count || 1), rate: '-', line_total: Number(req.estimated_total || 0).toFixed(2) }
      ],
      totalsRow: {
        item_name: 'Grand Total',
        qty: items.length > 0 ? String(items.reduce((s, i) => s + Number(i.qty || 0), 0)) : String(req.item_count || 1),
        rate: '',
        line_total: Number(req.estimated_total || 0).toFixed(2),
      },
    }, `request_${req.request_no || req.id}.pdf`);
  };

  return (
    <>
      {/* Search & Filter Bar */}
      <View style={styles.topActionRow}>
        <View style={styles.searchBar}>
          <Icon name="search" size={16} color={colors.inkMuted} style={{ marginRight: 8 }} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search request #, supplier, route..."
            placeholderTextColor={colors.inkMuted}
            style={styles.searchInput}
            autoCapitalize="none"
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch('')} style={styles.clearSearchBtn}>
              <Text style={styles.clearSearchText}>✕</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Status Pills */}
      <View style={styles.filterPillsRow}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 12, gap: 6 }}>
          {['all', 'open', 'approved', 'partially_received', 'converted_to_grn', 'cancelled'].map((st) => (
            <TouchableOpacity
              key={st}
              onPress={() => setStatusFilter(st)}
              style={[styles.filterPill, statusFilter === st && styles.filterPillActive]}
            >
              <Text style={[styles.filterPillText, statusFilter === st && styles.filterPillTextActive]}>
                {st.replace(/_/g, ' ').toUpperCase()}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      <FlatList
        data={filteredRows}
        keyExtractor={(r) => String(r.id)}
        contentContainerStyle={{ padding: 12, paddingBottom: 140, flexGrow: 1 }}
        refreshing={listQuery.isFetching}
        onRefresh={listQuery.refetch}
        ListEmptyComponent={
          <View style={styles.noResultsBox}>
            <Text style={styles.empty}>No purchase requests found.</Text>
            {search ? (
              <TouchableOpacity onPress={() => setSearch('')} style={styles.resetSearchBtn}>
                <Text style={styles.resetSearchBtnText}>Clear Search</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        }
        renderItem={({ item: r }) => (
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle}>{r.request_no}</Text>
              <View style={[styles.statusBadge, { borderColor: PR_STATUS_COLOR[r.status] || colors.borderSoft }]}>
                <Text style={[styles.statusText, { color: PR_STATUS_COLOR[r.status] || colors.ink }]}>
                  {r.status.replace(/_/g, ' ').toUpperCase()}
                </Text>
              </View>
            </View>
            <Text style={styles.cardSubtitle}>{r.supplier_name}</Text>
            <Text style={styles.cardMeta}>
              {r.created_at || 'Date N/A'} · {r.item_count} item(s)
              {r.route_name ? ` · Route: ${r.route_name}` : ''}
            </Text>
            <Text style={styles.cardTotal}>Rs. {Number(r.estimated_total || 0).toFixed(2)}</Text>

            <View style={styles.cardActions}>
              <TouchableOpacity onPress={() => openView(r)} style={styles.actionBtn}>
                <Icon name="view" size={14} color={colors.ink} style={{ marginRight: 4 }} />
                <Text style={styles.actionBtnText}>View</Text>
              </TouchableOpacity>

              <TouchableOpacity onPress={() => handlePrintRequest(r)} style={styles.actionBtn}>
                <Icon name="printer" size={14} color={colors.gold} style={{ marginRight: 4 }} />
                <Text style={styles.actionBtnText}>Print</Text>
              </TouchableOpacity>

              {canApprove && r.status === 'open' && (
                <TouchableOpacity
                  style={styles.actionBtnSuccess}
                  onPress={() => approveMutation.mutate(r.id)}
                  disabled={approveMutation.isPending}
                >
                  <Icon name="check" size={14} color={colors.success} style={{ marginRight: 4 }} />
                  <Text style={styles.actionBtnSuccessText}>Approve</Text>
                </TouchableOpacity>
              )}

              {r.status === 'approved' && (
                <TouchableOpacity
                  style={styles.actionBtnGrn}
                  onPress={async () => {
                    try {
                      const full = await purchaseRequestsApi.get(r.id);
                      setConverting(full);
                    } catch {
                      setConverting(r);
                    }
                  }}
                >
                  <Icon name="plus" size={14} color="#B45309" style={{ marginRight: 4 }} />
                  <Text style={styles.actionBtnGrnText}>Create GRN</Text>
                </TouchableOpacity>
              )}

              {(r.status === 'open' || r.status === 'approved') && (
                <TouchableOpacity
                  style={styles.actionBtnDanger}
                  onPress={() => Alert.alert('Cancel Request?', r.request_no, [
                    { text: 'No', style: 'cancel' },
                    { text: 'Yes, cancel', style: 'destructive', onPress: () => cancelMutation.mutate(r.id) },
                  ])}
                >
                  <Text style={styles.actionBtnDangerText}>Cancel</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        )}
      />
      <RequestFormModal visible={modalVisible} onClose={() => setModalVisible(false)} />

      {/* Convert to GRN Modal */}
      {converting && (
        <ConvertToGrnModal request={converting} onClose={() => setConverting(null)} />
      )}

      {/* View Modal */}
      {viewRequest && (
        <FormModal
          visible
          title={`Request: ${viewRequest.request_no}`}
          onClose={() => { setViewRequest(null); setDetailedRequest(null); }}
          footer={
            <View style={{ flexDirection: 'row', gap: 10, width: '100%' }}>
              <TouchableOpacity
                style={[formStyles.secondaryBtn, { flex: 1 }]}
                onPress={() => handlePrintRequest(detailedRequest || viewRequest)}
              >
                <Text style={formStyles.secondaryBtnText}>Print / PDF</Text>
              </TouchableOpacity>
              {viewRequest.status === 'approved' && (
                <TouchableOpacity
                  style={[formStyles.primaryBtn, { flex: 1, backgroundColor: '#D97706' }]}
                  onPress={() => {
                    const target = detailedRequest || viewRequest;
                    setViewRequest(null);
                    setDetailedRequest(null);
                    setConverting(target);
                  }}
                >
                  <Text style={formStyles.primaryBtnText}>Create GRN</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={[formStyles.secondaryBtn, { flex: 1 }]}
                onPress={() => { setViewRequest(null); setDetailedRequest(null); }}
              >
                <Text style={formStyles.secondaryBtnText}>Close</Text>
              </TouchableOpacity>
            </View>
          }
        >
          <View style={styles.detailBox}>
            <DetailRow label="Request #" value={viewRequest.request_no} />
            <DetailRow label="Supplier" value={viewRequest.supplier_name} />
            <DetailRow label="Route" value={viewRequest.route_name || '-'} />
            <DetailRow label="Items Count" value={viewRequest.item_count} />
            <DetailRow label="Estimated Total" value={`Rs. ${Number(viewRequest.estimated_total || 0).toFixed(2)}`} />
            <DetailRow label="Status" value={viewRequest.status.replace(/_/g, ' ').toUpperCase()} />

            {/* Quick Actions in View modal */}
            {viewRequest.status === 'open' && (
              <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
                {canApprove && (
                  <TouchableOpacity
                    style={[styles.actionBtnSuccess, { flex: 1, justifyContent: 'center', paddingVertical: 10 }]}
                    onPress={() => {
                      approveMutation.mutate(viewRequest.id);
                      setViewRequest((p) => ({ ...p, status: 'approved' }));
                    }}
                  >
                    <Text style={styles.actionBtnSuccessText}>Approve Request</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  style={[styles.actionBtnDanger, { flex: 1, justifyContent: 'center', paddingVertical: 10 }]}
                  onPress={() => {
                    Alert.alert('Cancel Request?', viewRequest.request_no, [
                      { text: 'No', style: 'cancel' },
                      {
                        text: 'Yes, cancel',
                        style: 'destructive',
                        onPress: () => {
                          cancelMutation.mutate(viewRequest.id);
                          setViewRequest((p) => ({ ...p, status: 'cancelled' }));
                        },
                      },
                    ]);
                  }}
                >
                  <Text style={styles.actionBtnDangerText}>Cancel Request</Text>
                </TouchableOpacity>
              </View>
            )}

            {detailedRequest?.items && detailedRequest.items.length > 0 && (
              <View style={{ marginTop: 14 }}>
                <Text style={[styles.detailLabel, { marginBottom: 6, fontWeight: '700' }]}>Item Lines:</Text>
                {detailedRequest.items.map((line, idx) => (
                  <View key={idx} style={styles.itemLineRow}>
                    <Text style={styles.itemLineName}>{line.item_name || `Item #${line.item_id}`}</Text>
                    <Text style={styles.itemLineQty}>Qty: {line.qty}</Text>
                    <Text style={styles.itemLineRate}>@ Rs. {Number(line.rate || 0).toFixed(2)}</Text>
                    <Text style={styles.itemLineTotal}>Rs. {(Number(line.qty || 0) * Number(line.rate || 0)).toFixed(2)}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        </FormModal>
      )}
    </>
  );
}

function ConvertToGrnModal({ request, onClose }) {
  const queryClient = useQueryClient();
  const [paymentMode, setPaymentMode] = useState('credit');
  const [paidAmount, setPaidAmount] = useState('0');
  const [supplierInvoiceNo, setSupplierInvoiceNo] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const rawItems = request?.items || [];
  const items = rawItems.map((l) => ({
    item_id: l.item_id,
    item_name: l.item_name || 'Item',
    qty: Number(l.qty || 1),
    rate: Number(l.rate || 0),
    free_qty: 0,
    mrp: Number(l.rate || 0),
  }));

  const total = items.reduce((s, l) => s + Number(l.qty || 0) * Number(l.rate || 0), 0);

  const handleConvert = async () => {
    setError('');
    if (items.length === 0) {
      setError('At least one item is required in the request.');
      return;
    }
    setSaving(true);
    try {
      await purchasesApi.create({
        supplier_id: request.supplier_id,
        purchase_request_id: request.id,
        supplier_invoice_no: supplierInvoiceNo.trim() || null,
        payment_mode: paymentMode,
        paid_amount: Number(paidAmount || 0),
        items: items.map((l) => ({
          item_id: l.item_id,
          qty: l.qty,
          rate: l.rate,
          free_qty: 0,
          mrp: l.mrp || l.rate,
          discount_mode: 'percent',
          discount_percent: 0,
          discount_amount: 0,
        })),
      });
      queryClient.invalidateQueries({ queryKey: ['purchase-requests'] });
      queryClient.invalidateQueries({ queryKey: ['purchases'] });
      Alert.alert('Success', 'GRN created successfully from Purchase Request.');
      onClose();
    } catch (err) {
      const msg = friendlyErrorMessage(err);
      setError(msg);
      Alert.alert('Conversion Failed', msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <FormModal
      visible
      title={`Create GRN: ${request.request_no || '#' + request.id}`}
      onClose={onClose}
      footer={
        <View style={{ flexDirection: 'row', gap: 10, width: '100%' }}>
          <TouchableOpacity style={[formStyles.secondaryBtn, { flex: 1 }]} onPress={onClose}>
            <Text style={formStyles.secondaryBtnText}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[formStyles.primaryBtn, { flex: 1, backgroundColor: colors.success }, saving && formStyles.disabled]}
            onPress={handleConvert}
            disabled={saving}
          >
            <Text style={formStyles.primaryBtnText}>{saving ? 'Creating…' : 'Create GRN'}</Text>
          </TouchableOpacity>
        </View>
      }
    >
      <View style={{ marginBottom: 12 }}>
        <DetailRow label="Supplier" value={request.supplier_name} />
        <DetailRow label="Route" value={request.route_name || '-'} />
        <DetailRow label="Est. Total" value={`Rs. ${total.toFixed(2)}`} />
      </View>

      <Text style={formStyles.label}>Supplier Bill / Invoice # (Optional)</Text>
      <TextInput
        value={supplierInvoiceNo}
        onChangeText={setSupplierInvoiceNo}
        placeholder="Enter supplier invoice number"
        placeholderTextColor={colors.inkMuted}
        style={formStyles.input}
      />

      <SelectField
        label="Payment Mode"
        value={paymentMode}
        options={[
          { id: 'credit', name: 'Credit (Pay Later)' },
          { id: 'cash', name: 'Cash' },
          { id: 'bank', name: 'Bank / UPI' },
          { id: 'cheque', name: 'Cheque' },
        ]}
        onChange={(val) => {
          setPaymentMode(val);
          if (val === 'credit') setPaidAmount('0');
          else if (total > 0) setPaidAmount(total.toFixed(2));
        }}
      />

      <Text style={formStyles.label}>Paid Amount (Rs.)</Text>
      <TextInput
        value={paidAmount}
        onChangeText={setPaidAmount}
        keyboardType="numeric"
        placeholder="0.00"
        placeholderTextColor={colors.inkMuted}
        style={formStyles.input}
      />

      <View style={{ marginTop: 14 }}>
        <Text style={[styles.detailLabel, { marginBottom: 8, fontWeight: '700' }]}>Items to Receive into GRN:</Text>
        {items.map((line, idx) => (
          <View key={idx} style={styles.itemLineRow}>
            <Text style={styles.itemLineName}>{line.item_name}</Text>
            <Text style={styles.itemLineQty}>{line.qty} pcs</Text>
            <Text style={styles.itemLineRate}>@ Rs. {line.rate.toFixed(2)}</Text>
            <Text style={styles.itemLineTotal}>Rs. {(line.qty * line.rate).toFixed(2)}</Text>
          </View>
        ))}
      </View>

      {error ? <Text style={formStyles.error}>{error}</Text> : null}
    </FormModal>
  );
}

function StatusPickerModal({ visible, title, currentStatus, statuses, onClose, onSelect }) {
  if (!visible) return null;
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={onClose}>
        <View style={styles.pickerBox} onStartShouldSetResponder={() => true}>
          <Text style={styles.pickerTitle}>{title || 'Change Status'}</Text>
          {statuses.map((st) => (
            <TouchableOpacity
              key={st}
              style={[styles.pickerItem, currentStatus === st && styles.pickerItemActive]}
              onPress={() => { onSelect(st); onClose(); }}
            >
              <Text style={[styles.pickerItemText, currentStatus === st && styles.pickerItemTextActive]}>
                {st.replace(/_/g, ' ').toUpperCase()}
              </Text>
              {currentStatus === st && <Text style={{ color: colors.success, fontWeight: '800' }}>✓</Text>}
            </TouchableOpacity>
          ))}
          <TouchableOpacity style={styles.pickerCancelBtn} onPress={onClose}>
            <Text style={styles.pickerCancelText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

export function OrdersScreen() {
  const [tab, setTab] = useState('prebookings');
  const [modalVisible, setModalVisible] = useState(false);

  return (
    <View style={styles.screen}>
      <View style={styles.topHeader}>
        <View style={{ flex: 1 }}>
          <SegmentedTabs
            tabs={[
              { key: 'prebookings', label: 'Pre-Bookings' },
              { key: 'requests', label: 'Supplier Requests' },
            ]}
            active={tab}
            onChange={(t) => { setTab(t); setModalVisible(false); }}
          />
        </View>
        <TouchableOpacity style={styles.topRightBtn} onPress={() => setModalVisible(true)}>
          <Icon name="plus" size={14} color={colors.gold} style={{ marginRight: 4 }} />
          <Text style={styles.topRightBtnText}>
            {tab === 'prebookings' ? '+ Booking' : '+ Request'}
          </Text>
        </TouchableOpacity>
      </View>
      {tab === 'prebookings' ? (
        <PrebookingsTab modalVisible={modalVisible} setModalVisible={setModalVisible} />
      ) : (
        <RequestsTab modalVisible={modalVisible} setModalVisible={setModalVisible} />
      )}
    </View>
  );
}

function DetailRow({ label, value }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}:</Text>
      <Text style={styles.detailVal}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.page },
  topHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingRight: 10,
    backgroundColor: colors.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSoft,
  },
  topRightBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.navbar,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    marginLeft: 8,
  },
  topRightBtnText: { color: colors.gold, fontWeight: '700', fontSize: 12 },
  topActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    marginTop: 10,
    marginBottom: 4,
    gap: 8,
  },
  searchBar: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 40,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    color: colors.ink,
    paddingVertical: 6,
  },
  clearSearchBtn: { padding: 4 },
  clearSearchText: { color: colors.inkMuted, fontSize: 13, fontWeight: '700' },
  filterPillsRow: { marginVertical: 6 },
  filterPill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 16,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.borderSoft,
  },
  filterPillActive: {
    backgroundColor: colors.navbar,
    borderColor: colors.navbar,
  },
  filterPillText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.inkMuted,
  },
  filterPillTextActive: {
    color: colors.gold,
  },
  empty: { textAlign: 'center', color: colors.inkMuted, marginTop: 40, fontSize: 13 },
  noResultsBox: { alignItems: 'center', marginTop: 30 },
  resetSearchBtn: {
    marginTop: 12,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: colors.navbar,
  },
  resetSearchBtnText: { color: colors.gold, fontWeight: '700', fontSize: 12 },
  card: { backgroundColor: colors.card, borderRadius: 12, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: colors.borderSoft },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardTitle: { fontWeight: '700', color: colors.ink, fontSize: 14 },
  cardSubtitle: { fontWeight: '600', color: colors.inkSoft, fontSize: 13, marginTop: 2 },
  statusBadge: { borderWidth: 1, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  statusText: { fontWeight: '700', fontSize: 10 },
  cardMeta: { color: colors.inkMuted, fontSize: 12, marginTop: 4 },
  cardTotal: { fontWeight: '800', color: colors.ink, fontSize: 14, marginTop: 6 },
  cardActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10, paddingTop: 8, borderTopWidth: 1, borderTopColor: colors.borderSoft },
  actionBtn: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6, backgroundColor: colors.page, borderWidth: 1, borderColor: colors.borderSoft },
  actionBtnText: { color: colors.ink, fontWeight: '600', fontSize: 12 },
  actionBtnDanger: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6, backgroundColor: '#FEF2F2', borderWidth: 1, borderColor: colors.danger },
  actionBtnDangerText: { color: colors.danger, fontWeight: '700', fontSize: 12 },
  actionBtnSuccess: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6, backgroundColor: '#F0FDF4', borderWidth: 1, borderColor: colors.success },
  actionBtnSuccessText: { color: colors.success, fontWeight: '700', fontSize: 12 },
  actionBtnGrn: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6, backgroundColor: '#FEF3C7', borderWidth: 1, borderColor: '#F59E0B' },
  actionBtnGrnText: { color: '#B45309', fontWeight: '700', fontSize: 12 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  pickerBox: { backgroundColor: colors.card, borderRadius: 14, width: '100%', maxWidth: 340, padding: 18, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 10, elevation: 6 },
  pickerTitle: { fontSize: 16, fontWeight: '700', color: colors.ink, marginBottom: 14, textAlign: 'center' },
  pickerItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 12, borderRadius: 8, marginBottom: 6, backgroundColor: colors.page },
  pickerItemActive: { backgroundColor: '#F0FDF4', borderWidth: 1, borderColor: colors.success },
  pickerItemText: { fontSize: 13, fontWeight: '600', color: colors.ink },
  pickerItemTextActive: { color: colors.success, fontWeight: '700' },
  pickerCancelBtn: { marginTop: 10, paddingVertical: 10, alignItems: 'center' },
  pickerCancelText: { fontSize: 14, color: colors.inkMuted, fontWeight: '600' },
  statusSelectPill: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 14, backgroundColor: colors.page, borderWidth: 1, borderColor: colors.borderSoft, marginRight: 6, marginBottom: 6 },
  statusSelectPillActive: { backgroundColor: colors.gold, borderColor: colors.gold },
  statusSelectPillText: { fontSize: 11, fontWeight: '600', color: colors.ink },
  statusSelectPillTextActive: { color: '#fff', fontWeight: '700' },
  totalsBox: { backgroundColor: colors.page, borderRadius: 10, padding: 12, marginTop: 8 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2 },
  totalLabel: { color: colors.inkMuted, fontSize: 12 },
  totalValue: { color: colors.ink, fontSize: 12 },
  grandRow: { marginTop: 4, borderTopWidth: 1, borderTopColor: colors.borderSoft, paddingTop: 6 },
  grandLabel: { fontWeight: '700', color: colors.ink },
  grandValue: { fontWeight: '700', color: colors.ink, fontSize: 15 },
  detailBox: { backgroundColor: colors.page, borderRadius: 10, padding: 12 },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: colors.borderSoft },
  detailLabel: { fontWeight: '600', color: colors.inkMuted, fontSize: 13 },
  detailVal: { fontWeight: '700', color: colors.ink, fontSize: 13 },
  itemLineRow: {
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSoft,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  itemLineName: { fontSize: 12, fontWeight: '700', color: colors.ink, flex: 2 },
  itemLineQty: { fontSize: 12, color: colors.inkMuted, flex: 1, textAlign: 'center' },
  itemLineRate: { fontSize: 12, color: colors.inkMuted, flex: 1.2, textAlign: 'right' },
  itemLineTotal: { fontSize: 12, fontWeight: '700', color: colors.primary, flex: 1.2, textAlign: 'right' },
});
