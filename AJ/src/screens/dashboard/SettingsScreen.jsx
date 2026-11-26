import { useEffect, useState, useMemo } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet, Alert, ActivityIndicator, Switch, FlatList } from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { settingsApi } from '../../api/admin';
import { pricingApi } from '../../api/catalog';
import { friendlyErrorMessage } from '../../api/client';
import { useAuth } from '../../hooks/useAuth';
import { colors } from '../../theme/colors';
import { formStyles } from '../../components/FormModal';
import { SegmentedTabs } from '../../components/SegmentedTabs';
import { Icon } from '../../components/Icon';
import { SelectField } from '../../components/SelectField';
import {
  getConfiguredPrinter, ensureBluetoothPermissions,
  isBluetoothEnabled, scanPairedDevices, connectPrinter, disconnectPrinter, testPrint,
} from '../../utils/printerService';
import { StaffScreen } from './StaffScreen';

// -----------------------------------------------------------------------------
// 1. General Settings (Profile, Free Qty, POS Price Popup, Print, Prefix)
// -----------------------------------------------------------------------------
function GeneralSettingsTab() {
  const [subTab, setSubTab] = useState('profile');

  return (
    <View style={{ flex: 1 }}>
      <View style={{ backgroundColor: colors.card, borderBottomWidth: 1, borderBottomColor: colors.borderSoft, paddingHorizontal: 6 }}>
        <SegmentedTabs
          tabs={[
            { key: 'profile', label: 'Profile' },
            { key: 'free_qty', label: 'Free Qty' },
            { key: 'pos_popup', label: 'POS Popup' },
            { key: 'print', label: 'Print Setup' },
            { key: 'sequences', label: 'Prefixes' },
          ]}
          active={subTab}
          onChange={setSubTab}
        />
      </View>
      <View style={{ flex: 1, marginTop: 4 }}>
        {subTab === 'profile' && <ProfilePanel />}
        {subTab === 'free_qty' && <FreeQtySettingsPanel />}
        {subTab === 'pos_popup' && <PosPopupSettingsPanel />}
        {subTab === 'print' && <PrinterSetupPanel />}
        {subTab === 'sequences' && <InvoiceSequencesPanel />}
      </View>
    </View>
  );
}

function ProfilePanel() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const branchQuery = useQuery({ queryKey: ['settings-branch'], queryFn: settingsApi.getBranch });
  const [form, setForm] = useState(null);

  useEffect(() => {
    if (branchQuery.data && !form) setForm(branchQuery.data);
  }, [branchQuery.data]);

  const branch = form || branchQuery.data || {};
  const updateMutation = useMutation({
    mutationFn: settingsApi.updateBranch,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings-branch'] });
      Alert.alert('Saved', 'Branch details updated successfully.');
    },
    onError: (e) => Alert.alert('Error', friendlyErrorMessage(e)),
  });

  return (
    <ScrollView style={styles.tabContent} contentContainerStyle={{ padding: 16, paddingBottom: 140 }}>
      <Text style={styles.sectionTitle}>Logged Account</Text>
      <View style={styles.card}>
        <Text style={styles.name}>{user?.name}</Text>
        <Text style={styles.meta}>{user?.email} · {user?.role || 'Staff'}</Text>
      </View>

      <Text style={styles.sectionTitle}>Company / Branch Profile &amp; Billing Info</Text>
      <View style={styles.card}>
        <Text style={formStyles.label}>Branch Name</Text>
        <TextInput
          value={branch.branch_name || ''}
          onChangeText={(v) => setForm({ ...branch, branch_name: v })}
          style={[formStyles.input, { color: colors.ink }]}
        />
        <Text style={formStyles.label}>Print Name</Text>
        <TextInput
          value={branch.print_name || ''}
          onChangeText={(v) => setForm({ ...branch, print_name: v })}
          style={[formStyles.input, { color: colors.ink }]}
        />
        <Text style={formStyles.label}>Address</Text>
        <TextInput
          value={branch.address_line1 || ''}
          onChangeText={(v) => setForm({ ...branch, address_line1: v })}
          style={[formStyles.input, { color: colors.ink }]}
        />
        <Text style={formStyles.label}>Phone (10 digits)</Text>
        <TextInput
          value={branch.phone || ''}
          onChangeText={(v) => setForm({ ...branch, phone: v.replace(/\D/g, '').slice(0, 10) })}
          style={[formStyles.input, { color: colors.ink }]}
          keyboardType="numeric"
          maxLength={10}
          placeholder="10-digit phone"
          placeholderTextColor={colors.inkMuted}
        />
        <Text style={formStyles.label}>Support Email</Text>
        <TextInput
          value={branch.support_email || ''}
          onChangeText={(v) => setForm({ ...branch, support_email: v })}
          style={[formStyles.input, { color: colors.ink }]}
          keyboardType="email-address"
          autoCapitalize="none"
        />
        <Text style={formStyles.label}>GSTIN</Text>
        <TextInput
          value={branch.gstin || ''}
          onChangeText={(v) => setForm({ ...branch, gstin: v })}
          style={[formStyles.input, { color: colors.ink }]}
          autoCapitalize="characters"
        />
        <Text style={formStyles.label}>PAN Number</Text>
        <TextInput
          value={branch.pan_number || ''}
          onChangeText={(v) => setForm({ ...branch, pan_number: v })}
          style={[formStyles.input, { color: colors.ink }]}
          autoCapitalize="characters"
        />
        <TouchableOpacity
          style={[formStyles.primaryBtn, { marginTop: 14 }]}
          onPress={() => updateMutation.mutate(branch)}
          disabled={updateMutation.isPending}
        >
          <Text style={formStyles.primaryBtnText}>{updateMutation.isPending ? 'Saving…' : 'Save Changes'}</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

function FreeQtySettingsPanel() {
  const queryClient = useQueryClient();
  const freeQtyQuery = useQuery({ queryKey: ['settings-free-qty'], queryFn: settingsApi.getFreeQty });
  const [form, setForm] = useState(null);

  useEffect(() => {
    if (freeQtyQuery.data && !form) {
      setForm({
        allow_local_free_qty: Number(freeQtyQuery.data.allow_local_free_qty ?? 1),
        allow_distance_free_qty: Number(freeQtyQuery.data.allow_distance_free_qty ?? 0),
      });
    }
  }, [freeQtyQuery.data]);

  const saveMutation = useMutation({
    mutationFn: settingsApi.updateFreeQty,
    onSuccess: (data) => {
      setForm({
        allow_local_free_qty: Number(data.allow_local_free_qty),
        allow_distance_free_qty: Number(data.allow_distance_free_qty),
      });
      queryClient.invalidateQueries({ queryKey: ['settings-free-qty'] });
      Alert.alert('Saved', 'Free Qty configuration saved successfully.');
    },
    onError: (e) => Alert.alert('Error', friendlyErrorMessage(e)),
  });

  if (!form) {
    return (
      <View style={{ padding: 20, alignItems: 'center' }}>
        <ActivityIndicator size="small" color={colors.primary} />
        <Text style={styles.hint}>Loading Free Qty configuration...</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.tabContent} contentContainerStyle={{ padding: 16, paddingBottom: 140 }}>
      <Text style={styles.sectionTitle}>Free Qty Configuration</Text>
      <Text style={styles.hint}>
        Configure automatic free quantity eligibility for local walk-in bills and distance route deliveries.
      </Text>

      <View style={styles.card}>
        <View style={styles.switchRow}>
          <View style={{ flex: 1, paddingRight: 10 }}>
            <Text style={styles.switchTitle}>Allow Local Free Qty</Text>
            <Text style={styles.switchDesc}>Enable free quantity items on walk-in / local POS sales.</Text>
          </View>
          <Switch
            value={form.allow_local_free_qty === 1}
            onValueChange={(v) => setForm({ ...form, allow_local_free_qty: v ? 1 : 0 })}
          />
        </View>

        <View style={[styles.switchRow, { borderTopWidth: 1, borderTopColor: colors.borderSoft, paddingTop: 14, marginTop: 10 }]}>
          <View style={{ flex: 1, paddingRight: 10 }}>
            <Text style={styles.switchTitle}>Allow Distance Free Qty</Text>
            <Text style={styles.switchDesc}>Enable free quantity calculation on van / route distance delivery sales.</Text>
          </View>
          <Switch
            value={form.allow_distance_free_qty === 1}
            onValueChange={(v) => setForm({ ...form, allow_distance_free_qty: v ? 1 : 0 })}
          />
        </View>

        <TouchableOpacity
          style={[formStyles.primaryBtn, { marginTop: 16 }]}
          onPress={() => saveMutation.mutate(form)}
          disabled={saveMutation.isPending}
        >
          <Text style={formStyles.primaryBtnText}>{saveMutation.isPending ? 'Saving…' : 'Save Configuration'}</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

function PosPopupSettingsPanel() {
  const queryClient = useQueryClient();
  const posPopupQuery = useQuery({ queryKey: ['settings-pos-popup'], queryFn: settingsApi.getPosPopup });
  const [form, setForm] = useState(null);

  useEffect(() => {
    if (posPopupQuery.data && !form) {
      setForm({
        pos_prev_week_popup_enabled: posPopupQuery.data.pos_prev_week_popup_enabled ? 1 : 0,
        prev_week_price_rule: posPopupQuery.data.prev_week_price_rule || 'AUTO',
        prev_week_popup_on_repeat_add: posPopupQuery.data.prev_week_popup_on_repeat_add ? 1 : 0,
      });
    }
  }, [posPopupQuery.data]);

  const saveMutation = useMutation({
    mutationFn: settingsApi.updatePosPopup,
    onSuccess: (data) => {
      setForm({
        pos_prev_week_popup_enabled: data.pos_prev_week_popup_enabled ? 1 : 0,
        prev_week_price_rule: data.prev_week_price_rule || 'AUTO',
        prev_week_popup_on_repeat_add: data.prev_week_popup_on_repeat_add ? 1 : 0,
      });
      queryClient.invalidateQueries({ queryKey: ['settings-pos-popup'] });
      Alert.alert('Saved', 'POS Price comparison popup settings saved.');
    },
    onError: (e) => Alert.alert('Error', friendlyErrorMessage(e)),
  });

  if (!form) {
    return (
      <View style={{ padding: 20, alignItems: 'center' }}>
        <ActivityIndicator size="small" color={colors.primary} />
        <Text style={styles.hint}>Loading POS popup settings...</Text>
      </View>
    );
  }

  const priceRuleOptions = [
    { id: 'AUTO', name: 'AUTO — Price Range (Min – Max) (Recommended)' },
    { id: 'LATEST', name: 'LATEST — Most Recent Selling Price in Previous Week' },
    { id: 'AVERAGE', name: 'AVERAGE — Weighted Average Selling Price' },
  ];

  return (
    <ScrollView style={styles.tabContent} contentContainerStyle={{ padding: 16, paddingBottom: 140 }}>
      <Text style={styles.sectionTitle}>Previous Week Selling Price Popup</Text>
      <Text style={styles.hint}>
        Configure the automatic previous week selling price comparison modal displayed during POS billing.
      </Text>

      <View style={styles.card}>
        <View style={styles.switchRow}>
          <View style={{ flex: 1, paddingRight: 10 }}>
            <Text style={styles.switchTitle}>Enable Price Comparison Popup</Text>
            <Text style={styles.switchDesc}>Display previous week price modal when adding products in POS billing.</Text>
          </View>
          <Switch
            value={form.pos_prev_week_popup_enabled === 1}
            onValueChange={(v) => setForm({ ...form, pos_prev_week_popup_enabled: v ? 1 : 0 })}
          />
        </View>

        <View style={{ marginTop: 14 }}>
          <SelectField
            label="Price Calculation Rule"
            value={form.prev_week_price_rule}
            options={priceRuleOptions}
            onChange={(v) => setForm({ ...form, prev_week_price_rule: v })}
          />
        </View>

        <View style={[styles.switchRow, { borderTopWidth: 1, borderTopColor: colors.borderSoft, paddingTop: 14, marginTop: 10 }]}>
          <View style={{ flex: 1, paddingRight: 10 }}>
            <Text style={styles.switchTitle}>Show Popup on Repeat Add</Text>
            <Text style={styles.switchDesc}>Show modal again when clicking an item already present in current bill.</Text>
          </View>
          <Switch
            value={form.prev_week_popup_on_repeat_add === 1}
            disabled={form.pos_prev_week_popup_enabled === 0}
            onValueChange={(v) => setForm({ ...form, prev_week_popup_on_repeat_add: v ? 1 : 0 })}
          />
        </View>

        <TouchableOpacity
          style={[formStyles.primaryBtn, { marginTop: 16 }]}
          onPress={() => saveMutation.mutate(form)}
          disabled={saveMutation.isPending}
        >
          <Text style={formStyles.primaryBtnText}>{saveMutation.isPending ? 'Saving…' : 'Save Popup Settings'}</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

function PrinterSetupPanel() {
  const queryClient = useQueryClient();
  const printQuery = useQuery({ queryKey: ['settings-print'], queryFn: settingsApi.getPrint });
  const [form, setForm] = useState(null);
  const [configured, setConfigured] = useState(null);
  const [pairedDevices, setPairedDevices] = useState([]);
  const [scanning, setScanning] = useState(false);
  const [busyAddress, setBusyAddress] = useState(null);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    getConfiguredPrinter().then(setConfigured);
  }, []);

  useEffect(() => {
    if (printQuery.data && !form) setForm(printQuery.data);
  }, [printQuery.data]);

  const saveMutation = useMutation({
    mutationFn: settingsApi.updatePrint,
    onSuccess: (data) => {
      setForm(data);
      queryClient.invalidateQueries({ queryKey: ['settings-print'] });
      Alert.alert('Saved', 'Print preferences updated.');
    },
    onError: (e) => Alert.alert('Error', friendlyErrorMessage(e)),
  });

  const scan = async () => {
    const perm = await ensureBluetoothPermissions();
    if (!perm) return Alert.alert('Permission Denied', 'Bluetooth permissions required.');
    const enabled = await isBluetoothEnabled();
    if (!enabled) return Alert.alert('Bluetooth is OFF', 'Please enable Bluetooth.');
    setScanning(true);
    try {
      const devs = await scanPairedDevices();
      setPairedDevices(devs);
    } catch (e) {
      Alert.alert('Scan failed', friendlyErrorMessage(e));
    } finally {
      setScanning(false);
    }
  };

  const connect = async (d) => {
    setBusyAddress(d.address);
    try {
      await connectPrinter(d);
      setConfigured(d);
      Alert.alert('Connected', `Connected to ${d.name || d.address}`);
    } catch (e) {
      Alert.alert('Connection failed', friendlyErrorMessage(e));
    } finally {
      setBusyAddress(null);
    }
  };

  const disconnect = async () => {
    await disconnectPrinter();
    setConfigured(null);
  };

  const runTestPrint = async () => {
    setTesting(true);
    try {
      await testPrint();
    } catch (e) {
      Alert.alert('Print failed', friendlyErrorMessage(e));
    } finally {
      setTesting(false);
    }
  };

  if (!form) {
    return <ActivityIndicator style={{ marginTop: 20 }} />;
  }

  return (
    <ScrollView style={styles.tabContent} contentContainerStyle={{ padding: 16, paddingBottom: 140 }}>
      <Text style={styles.sectionTitle}>Bluetooth Thermal Printer</Text>
      <View style={styles.card}>
        {configured ? (
          <View style={styles.printerRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{configured.name || 'Printer'}</Text>
              <Text style={styles.meta}>{configured.address}</Text>
            </View>
            <TouchableOpacity style={styles.forgetBtn} onPress={disconnect}>
              <Text style={styles.forgetBtnText}>Disconnect</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <Text style={styles.hint}>No printer paired yet. Turn on printer and tap Scan.</Text>
        )}

        <TouchableOpacity style={[formStyles.secondaryBtn, { marginTop: 10 }]} onPress={scan} disabled={scanning}>
          <Text style={formStyles.secondaryBtnText}>{scanning ? 'Scanning…' : 'Scan Paired Devices'}</Text>
        </TouchableOpacity>

        {pairedDevices.map((d) => (
          <TouchableOpacity key={d.address} style={styles.deviceRow} onPress={() => connect(d)} disabled={busyAddress === d.address}>
            <Text style={styles.name}>{d.name || 'Unnamed device'}</Text>
            <Text style={styles.meta}>{busyAddress === d.address ? 'Connecting…' : d.address}</Text>
          </TouchableOpacity>
        ))}

        {configured && (
          <TouchableOpacity style={[formStyles.primaryBtn, { marginTop: 12, backgroundColor: colors.navbar }]} onPress={runTestPrint} disabled={testing}>
            <Text style={[formStyles.primaryBtnText, { color: colors.gold }]}>{testing ? 'Printing…' : 'Test Print'}</Text>
          </TouchableOpacity>
        )}
      </View>

      <Text style={styles.sectionTitle}>Print Preferences</Text>
      <View style={styles.card}>
        <Text style={formStyles.label}>Printer type</Text>
        <View style={styles.segment}>
          {[['a4', 'A4'], ['thermal_58', '58mm'], ['thermal_80', '80mm']].map(([val, label]) => (
            <TouchableOpacity key={val} style={[styles.segmentBtn, form.printer_type === val && styles.segmentBtnActive]} onPress={() => setForm({ ...form, printer_type: val })}>
              <Text style={form.printer_type === val ? styles.segmentTextActive : styles.segmentText}>{label}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <Text style={formStyles.label}>Default print copies</Text>
        <TextInput
          value={String(form.default_print_copies ?? 1)}
          onChangeText={(v) => setForm({ ...form, default_print_copies: v })}
          style={[formStyles.input, { color: colors.ink }]}
          keyboardType="numeric"
        />
        <View style={styles.switchRow}>
          <Text style={formStyles.label}>Show UPI QR on thermal receipt</Text>
          <Switch value={!!Number(form.show_upi_qr_on_thermal)} onValueChange={(v) => setForm({ ...form, show_upi_qr_on_thermal: v ? 1 : 0 })} />
        </View>
        <Text style={formStyles.label}>Bank account no.</Text>
        <TextInput value={form.bank_account_no ?? ''} onChangeText={(v) => setForm({ ...form, bank_account_no: v })} style={[formStyles.input, { color: colors.ink }]} />
        <Text style={formStyles.label}>Bank name</Text>
        <TextInput value={form.bank_name ?? ''} onChangeText={(v) => setForm({ ...form, bank_name: v })} style={[formStyles.input, { color: colors.ink }]} />
        <Text style={formStyles.label}>UPI ID</Text>
        <TextInput value={form.upi_id ?? ''} onChangeText={(v) => setForm({ ...form, upi_id: v })} style={[formStyles.input, { color: colors.ink }]} />
        <Text style={formStyles.label}>Invoice footer note</Text>
        <TextInput value={form.invoice_footer_note ?? ''} onChangeText={(v) => setForm({ ...form, invoice_footer_note: v })} style={[formStyles.input, { color: colors.ink }]} />
        <Text style={formStyles.label}>Terms &amp; conditions</Text>
        <TextInput value={form.terms_and_conditions ?? ''} onChangeText={(v) => setForm({ ...form, terms_and_conditions: v })} style={[formStyles.input, { height: 70, color: colors.ink }]} multiline />
        <TouchableOpacity style={[formStyles.primaryBtn, { marginTop: 14 }]} onPress={() => saveMutation.mutate(form)} disabled={saveMutation.isPending}>
          <Text style={formStyles.primaryBtnText}>{saveMutation.isPending ? 'Saving…' : 'Save Preferences'}</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

function InvoiceSequencesPanel() {
  const queryClient = useQueryClient();
  const sequencesQuery = useQuery({ queryKey: ['settings-sequences'], queryFn: settingsApi.getSequences });
  const [edits, setEdits] = useState({});

  const saveMutation = useMutation({
    mutationFn: ({ id, prefix }) => settingsApi.updateSequence(id, prefix),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings-sequences'] });
      Alert.alert('Saved', 'Invoice prefix updated.');
    },
    onError: (e) => Alert.alert('Error', friendlyErrorMessage(e)),
  });

  const sequences = sequencesQuery.data || [];

  return (
    <ScrollView style={styles.tabContent} contentContainerStyle={{ padding: 16, paddingBottom: 140 }}>
      <Text style={styles.sectionTitle}>Invoice Sequence Prefixes</Text>
      <Text style={styles.hint}>Only the prefix can be changed — the running number keeps counting so numbering never repeats.</Text>
      {sequencesQuery.isLoading && <ActivityIndicator style={{ marginTop: 20 }} />}
      {sequences.map((s) => (
        <View key={s.id} style={styles.card}>
          <Text style={styles.name}>{s.series.replace('_', '-').replace(/\b\w/g, (c) => c.toUpperCase())}</Text>
          <Text style={styles.meta}>Next number: {s.current_number + 1}</Text>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
            <TextInput
              value={edits[s.id] ?? s.prefix}
              onChangeText={(v) => setEdits((prev) => ({ ...prev, [s.id]: v }))}
              style={[formStyles.input, { flex: 1, color: colors.ink }]}
              autoCapitalize="characters"
            />
            <TouchableOpacity
              style={formStyles.primaryBtn}
              onPress={() => saveMutation.mutate({ id: s.id, prefix: edits[s.id] ?? s.prefix })}
              disabled={saveMutation.isPending}
            >
              <Text style={formStyles.primaryBtnText}>Save</Text>
            </TouchableOpacity>
          </View>
        </View>
      ))}
    </ScrollView>
  );
}

// -----------------------------------------------------------------------------
// 2 & 3. Pricing Adjustment Component (Wholesale & Retail/Staff)
// -----------------------------------------------------------------------------
function PriceAdjustmentPanel({ type, label }) {
  const [search, setSearch] = useState('');
  const [edits, setEdits] = useState({});
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['pricing', type, search],
    queryFn: () => pricingApi.list(type, search),
  });

  const saveMutation = useMutation({
    mutationFn: (items) => pricingApi.bulkSave(type, items),
    onSuccess: (result) => {
      setEdits({});
      queryClient.invalidateQueries({ queryKey: ['pricing', type] });
      Alert.alert('Saved', `Saved ${result.updated} ${label.toLowerCase()} price${result.updated === 1 ? '' : 's'}.`);
    },
    onError: (e) => Alert.alert('Error', friendlyErrorMessage(e)),
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

  const handlePriceChange = (id, val) => {
    setEdits((prev) => ({ ...prev, [id]: val }));
  };

  const handleSave = () => {
    const items = changedIds
      .map((id) => ({ item_id: Number(id), price: edits[id] === '' ? null : Number(edits[id]) }))
      .filter((row) => row.price !== null);

    if (items.length === 0) return;
    const invalid = items.find((row) => isNaN(row.price) || row.price < 0);
    if (invalid) {
      Alert.alert('Invalid Price', `${label} price must be a non-negative number.`);
      return;
    }

    saveMutation.mutate(items);
  };

  return (
    <View style={{ flex: 1 }}>
      {/* Top Search & Actions */}
      <View style={styles.pricingTopRow}>
        <View style={styles.searchBar}>
          <Icon name="search" size={16} color={colors.inkMuted} style={{ marginRight: 8 }} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder={`Search items for ${label.toLowerCase()} price...`}
            placeholderTextColor={colors.inkMuted}
            style={styles.searchInput}
            autoCapitalize="none"
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch('')} style={{ padding: 4 }}>
              <Text style={{ color: colors.inkMuted, fontWeight: '700' }}>✕</Text>
            </TouchableOpacity>
          )}
        </View>

        <TouchableOpacity
          style={[styles.saveBatchBtn, (changedIds.length === 0 || saveMutation.isPending) && styles.saveBatchBtnDisabled]}
          onPress={handleSave}
          disabled={changedIds.length === 0 || saveMutation.isPending}
        >
          <Text style={styles.saveBatchBtnText}>
            {saveMutation.isPending ? 'Saving…' : `Save${changedIds.length ? ` (${changedIds.length})` : ''}`}
          </Text>
        </TouchableOpacity>

        {changedIds.length > 0 && (
          <TouchableOpacity onPress={() => setEdits({})} style={styles.resetBatchBtn}>
            <Text style={styles.resetBatchBtnText}>Reset</Text>
          </TouchableOpacity>
        )}
      </View>

      <FlatList
        data={rows}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={{ padding: 12, paddingBottom: 140, flexGrow: 1 }}
        refreshing={query.isFetching}
        onRefresh={query.refetch}
        ListEmptyComponent={
          query.isLoading ? (
            <Text style={styles.empty}>Loading items…</Text>
          ) : (
            <Text style={styles.empty}>No items found.</Text>
          )
        }
        renderItem={({ item: r }) => {
          const edited = Object.prototype.hasOwnProperty.call(edits, r.id);
          const currentVal = edited ? edits[r.id] : (r.price != null ? String(r.price) : '');
          return (
            <View style={[styles.pricingCard, edited && styles.pricingCardEdited]}>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardTitle}>{r.item_name}</Text>
                <Text style={styles.cardMeta}>
                  SKU: {r.item_code} · Unit: {r.unit_code || '—'}
                </Text>
                <Text style={styles.cardPriceRow}>
                  MRP: ₹{Number(r.mrp || 0).toFixed(2)} · Net SRATE: ₹{Number(r.net_srate || 0).toFixed(2)}
                </Text>
              </View>

              <View style={{ alignItems: 'flex-end', marginLeft: 12 }}>
                <Text style={styles.priceInputLabel}>{label} Price (₹)</Text>
                <TextInput
                  keyboardType="numeric"
                  value={currentVal}
                  placeholder="Not set"
                  placeholderTextColor={colors.inkMuted}
                  onChangeText={(v) => handlePriceChange(r.id, v)}
                  style={[styles.priceInput, edited && styles.priceInputActive]}
                />
              </View>
            </View>
          );
        }}
      />
    </View>
  );
}

// -----------------------------------------------------------------------------
// 4. Main Settings Screen Component
// -----------------------------------------------------------------------------
export function SettingsScreen() {
  const [tab, setTab] = useState('general'); // 'general' | 'price' | 'staff_price' | 'staff'

  return (
    <View style={styles.screen}>
      <View style={styles.topHeader}>
        <SegmentedTabs
          tabs={[
            { key: 'general', label: 'General Settings' },
            { key: 'price', label: 'Price Adjustment' },
            { key: 'staff_price', label: 'Staff Price Adjustment' },
            { key: 'staff', label: 'Staff' },
          ]}
          active={tab}
          onChange={setTab}
        />
      </View>
      <View style={{ flex: 1, marginTop: 4 }}>
        {tab === 'general' && <GeneralSettingsTab />}
        {tab === 'price' && <PriceAdjustmentPanel type="wholesale" label="Wholesale" />}
        {tab === 'staff_price' && <PriceAdjustmentPanel type="retail" label="Staff Retail" />}
        {tab === 'staff' && <StaffScreen />}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.page },
  topHeader: {
    backgroundColor: colors.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSoft,
    paddingHorizontal: 8,
  },
  tabContent: { flex: 1 },
  sectionTitle: { fontWeight: '700', color: colors.ink, marginBottom: 8, marginTop: 12, fontSize: 14 },
  hint: { color: colors.inkMuted, fontSize: 12, marginBottom: 12, lineHeight: 17 },
  card: { backgroundColor: colors.card, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: colors.borderSoft, marginBottom: 12 },
  name: { fontWeight: '700', color: colors.ink },
  meta: { color: colors.inkMuted, fontSize: 12, marginTop: 2 },
  printerRow: { flexDirection: 'row', alignItems: 'center' },
  forgetBtn: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: colors.danger },
  forgetBtnText: { color: colors.danger, fontWeight: '600', fontSize: 12 },
  deviceRow: { paddingVertical: 10, borderTopWidth: 1, borderTopColor: colors.borderSoft, marginTop: 8 },
  segment: { flexDirection: 'row', backgroundColor: colors.page, borderRadius: 8, overflow: 'hidden', marginBottom: 8 },
  segmentBtn: { flex: 1, paddingVertical: 8, alignItems: 'center' },
  segmentBtnActive: { backgroundColor: colors.navbar },
  segmentText: { fontSize: 12, color: colors.inkMuted, fontWeight: '600' },
  segmentTextActive: { fontSize: 12, color: colors.gold, fontWeight: '700' },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  switchTitle: { fontSize: 13, fontWeight: '700', color: colors.ink },
  switchDesc: { fontSize: 11, color: colors.inkMuted, marginTop: 2 },
  pricingTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    marginTop: 10,
    marginBottom: 6,
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
  saveBatchBtn: {
    backgroundColor: colors.navbar,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 8,
  },
  saveBatchBtnDisabled: { opacity: 0.5 },
  saveBatchBtnText: { color: colors.gold, fontWeight: '700', fontSize: 12 },
  resetBatchBtn: { paddingHorizontal: 8, paddingVertical: 9 },
  resetBatchBtnText: { color: colors.inkMuted, fontWeight: '600', fontSize: 12 },
  empty: { textAlign: 'center', color: colors.inkMuted, marginTop: 40, fontSize: 13 },
  pricingCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: colors.borderSoft,
  },
  pricingCardEdited: {
    backgroundColor: '#FFFDF5',
    borderColor: colors.gold,
  },
  cardTitle: { fontWeight: '700', color: colors.ink, fontSize: 13 },
  cardMeta: { color: colors.inkMuted, fontSize: 11, marginTop: 2 },
  cardPriceRow: { color: colors.inkSoft, fontSize: 11, fontWeight: '600', marginTop: 4 },
  priceInputLabel: { fontSize: 10, fontWeight: '700', color: colors.inkMuted, textTransform: 'uppercase', marginBottom: 4 },
  priceInput: {
    width: 90,
    height: 36,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    backgroundColor: colors.page,
    textAlign: 'right',
    paddingHorizontal: 8,
    fontSize: 13,
    fontWeight: '700',
    color: colors.ink,
  },
  priceInputActive: {
    borderColor: colors.gold,
    backgroundColor: '#FFF',
  },
});
