import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, Image, StyleSheet, Switch, PermissionsAndroid, Platform, Alert } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { launchCamera, launchImageLibrary } from 'react-native-image-picker';
import { itemsApi, categoriesApi, brandsApi, productLinesApi, stockUnitsApi, taxCodesApi } from '../../api/catalog';
import { suppliersApi } from '../../api/parties';
import { branchesApi } from '../../api/branches';
import { friendlyErrorMessage } from '../../api/client';
import { FormModal, formStyles } from '../../components/FormModal';
import { SelectField } from '../../components/SelectField';
import { resolveImageUrl } from '../../utils/media';
import { colors } from '../../theme/colors';

/** Full New Item / Edit Item form — mirrors frontend/src/pages/ItemsPanel.jsx field-for-field. */
export function ItemFormModal({ item, onClose }) {
  const isEdit = !!item;
  const queryClient = useQueryClient();
  const categoriesQuery = useQuery({ queryKey: ['categories'], queryFn: categoriesApi.list });
  const brandsQuery = useQuery({ queryKey: ['brands'], queryFn: brandsApi.list });
  const productLinesQuery = useQuery({ queryKey: ['product-lines'], queryFn: productLinesApi.list });
  const suppliersQuery = useQuery({ queryKey: ['suppliers'], queryFn: suppliersApi.list });
  const unitsQuery = useQuery({ queryKey: ['stock-units'], queryFn: stockUnitsApi.list });
  const taxQuery = useQuery({ queryKey: ['tax-codes'], queryFn: taxCodesApi.list });
  const branchesQuery = useQuery({ queryKey: ['branches'], queryFn: branchesApi.list });

  const [form, setForm] = useState({
    item_name: item?.item_name || '',
    category_id: item?.category_id || null,
    brand_id: item?.brand_id || null,
    product_line_id: item?.product_line_id || null,
    supplier_id: item?.supplier_id || null,
    base_unit_id: item?.base_unit_id || null,
    secondary_unit_id: item?.secondary_unit_id || null,
    tax_code_id: item?.tax_code_id || null,
    hsn_code: item?.hsn_code || '',
    barcode: item?.barcode || '',
    purchase_price: String(item?.purchase_price ?? ''),
    cost_price: String(item?.cost_price ?? ''),
    wholesale_price: String(item?.wholesale_price ?? ''),
    retail_price: String(item?.retail_price ?? ''),
    mrp: String(item?.mrp ?? ''),
    net_srate: item?.net_srate != null ? String(item.net_srate) : '',
    net_purrate: item?.net_purrate != null ? String(item.net_purrate) : '',
    secondary_mrp: item?.secondary_mrp != null ? String(item.secondary_mrp) : '',
    secondary_net_srate: item?.secondary_net_srate != null ? String(item.secondary_net_srate) : '',
    secondary_net_purrate: item?.secondary_net_purrate != null ? String(item.secondary_net_purrate) : '',
    min_stock_threshold: String(item?.min_stock_threshold ?? ''),
    opening_stock: item?.opening_stock != null ? String(item.opening_stock) : '',
    is_active: item ? !!Number(item.is_active) : true,
  });
  const [selectedBranches, setSelectedBranches] = useState(item?.branch_ids || []);
  const [imageAsset, setImageAsset] = useState(null);
  const [imagePreview, setImagePreview] = useState(item?.image ? resolveImageUrl(item.image) : null);
  const [imageRemoved, setImageRemoved] = useState(false);
  const [error, setError] = useState('');

  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));
  const toggleBranch = (id) => setSelectedBranches((prev) => (prev.includes(id) ? prev.filter((b) => b !== id) : [...prev, id]));

  const createMutation = useMutation({ mutationFn: itemsApi.create });
  const updateMutation = useMutation({ mutationFn: ({ id, data }) => itemsApi.update(id, data) });
  const uploadMutation = useMutation({ mutationFn: ({ id, asset }) => itemsApi.uploadImage(id, asset) });

  const requestCameraPermission = async () => {
    if (Platform.OS !== 'android') return true;
    try {
      const granted = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.CAMERA,
        {
          title: 'Camera Permission',
          message: 'AJ Agency requires camera access to take product photos.',
          buttonPositive: 'Allow',
          buttonNegative: 'Deny',
        }
      );
      return granted === PermissionsAndroid.RESULTS.GRANTED;
    } catch (err) {
      console.warn('Camera permission error:', err);
      return false;
    }
  };

  const pickImage = async (fromCamera) => {
    try {
      if (fromCamera) {
        const hasPermission = await requestCameraPermission();
        if (!hasPermission) {
          Alert.alert('Permission Denied', 'Camera access is required to take photos. Please allow camera permissions in device settings.');
          return;
        }
      }
      const options = {
        mediaType: 'photo',
        quality: 0.8,
        saveToPhotos: false,
      };
      const result = await (fromCamera ? launchCamera(options) : launchImageLibrary(options));
      if (result.didCancel) return;
      if (result.errorCode) {
        Alert.alert('Image Error', result.errorMessage || result.errorCode);
        return;
      }
      const asset = result.assets?.[0];
      if (!asset) return;
      setImageAsset(asset);
      setImagePreview(asset.uri);
      setImageRemoved(false);
    } catch (err) {
      Alert.alert('Error', 'Failed to access camera/gallery: ' + (err?.message || 'Unknown error'));
    }
  };

  const removeImage = () => {
    setImageAsset(null);
    setImagePreview(null);
    setImageRemoved(true);
  };

  // Blank means "leave the item's existing net rate as-is" — never send 0
  // and silently overwrite a configured NET_SRATE/NET_PURRATE.
  const numOrNull = (v) => (v === '' || v === null || v === undefined ? null : Number(v));

  const submit = async () => {
    setError('');
    if (!form.item_name?.trim()) {
      setError('Item name is required.');
      return;
    }
    if (!form.base_unit_id) {
      setError('Base unit is required.');
      return;
    }

    // Number validations
    const priceFields = [
      { key: 'mrp', label: 'MRP' },
      { key: 'purchase_price', label: 'Purchase Price' },
      { key: 'cost_price', label: 'Cost Price' },
      { key: 'wholesale_price', label: 'Wholesale Price' },
      { key: 'retail_price', label: 'Retail Price' },
      { key: 'min_stock_threshold', label: 'Minimum Stock Threshold' },
      { key: 'opening_stock', label: 'Opening Stock' },
    ];
    for (const f of priceFields) {
      const val = form[f.key];
      if (val !== '' && val !== null && val !== undefined) {
        const num = Number(val);
        if (isNaN(num)) {
          setError(`${f.label} must be a valid number.`);
          return;
        }
        if (num < 0) {
          setError(`${f.label} cannot be negative.`);
          return;
        }
      }
    }

    const payload = {
      item_name: form.item_name.trim(),
      category_id: form.category_id,
      brand_id: form.brand_id,
      product_line_id: form.product_line_id,
      supplier_id: form.supplier_id,
      base_unit_id: form.base_unit_id,
      secondary_unit_id: form.secondary_unit_id,
      tax_code_id: form.tax_code_id,
      hsn_code: form.hsn_code ? form.hsn_code.trim() : null,
      barcode: form.barcode ? form.barcode.trim() : null,
      purchase_price: Number(form.purchase_price || 0),
      cost_price: Number(form.cost_price || 0),
      wholesale_price: Number(form.wholesale_price || 0),
      retail_price: Number(form.retail_price || 0),
      mrp: Number(form.mrp || 0),
      net_srate: numOrNull(form.net_srate),
      net_purrate: numOrNull(form.net_purrate),
      secondary_mrp: numOrNull(form.secondary_mrp),
      secondary_net_srate: numOrNull(form.secondary_net_srate),
      secondary_net_purrate: numOrNull(form.secondary_net_purrate),
      min_stock_threshold: Number(form.min_stock_threshold || 0),
      opening_stock: Number(form.opening_stock || 0),
      is_active: form.is_active ? 1 : 0,
      branch_ids: selectedBranches,
    };
    try {
      let id = item?.id;
      if (isEdit) {
        await updateMutation.mutateAsync({ id, data: payload });
      } else {
        const created = await createMutation.mutateAsync(payload);
        id = created.id;
      }
      if (imageAsset) {
        await uploadMutation.mutateAsync({ id, asset: imageAsset });
      } else if (imageRemoved && isEdit && item?.image) {
        await itemsApi.removeImage(id);
      }
      queryClient.invalidateQueries({ queryKey: ['items'] });
      onClose();
    } catch (err) {
      setError(friendlyErrorMessage(err));
    }
  };

  const saving = createMutation.isPending || updateMutation.isPending || uploadMutation.isPending;
  const units = unitsQuery.data || [];
  const branches = branchesQuery.data || [];
  const secondaryUnitOptions = units.filter((u) => u.id !== form.base_unit_id);

  return (
    <FormModal
      visible
      title={isEdit ? `Edit ${item.item_name}` : 'New Item'}
      onClose={onClose}
      footer={
        <>
          <TouchableOpacity style={formStyles.secondaryBtn} onPress={onClose}><Text style={formStyles.secondaryBtnText}>Cancel</Text></TouchableOpacity>
          <TouchableOpacity style={[formStyles.primaryBtn, saving && formStyles.disabled]} onPress={submit} disabled={saving}>
            <Text style={formStyles.primaryBtnText}>{saving ? 'Saving…' : 'Save'}</Text>
          </TouchableOpacity>
        </>
      }
    >
      <View style={styles.imageRow}>
        <View style={styles.imageBox}>
          {imagePreview ? <Image source={{ uri: imagePreview }} style={{ width: '100%', height: '100%' }} /> : <Text style={styles.imagePlaceholder}>No image</Text>}
        </View>
        <View style={{ marginLeft: 12, gap: 8 }}>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TouchableOpacity style={formStyles.secondaryBtn} onPress={() => pickImage(true)}><Text style={formStyles.secondaryBtnText}>📷 Camera</Text></TouchableOpacity>
            <TouchableOpacity style={formStyles.secondaryBtn} onPress={() => pickImage(false)}><Text style={formStyles.secondaryBtnText}>🖼️ Gallery</Text></TouchableOpacity>
          </View>
          {imagePreview ? (
            <TouchableOpacity style={[formStyles.secondaryBtn, { borderColor: colors.danger, backgroundColor: '#FFF5F5' }]} onPress={removeImage}>
              <Text style={[formStyles.secondaryBtnText, { color: colors.danger }]}>✕ Remove Image</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      <Text style={formStyles.label}>Item Name *</Text>
      <TextInput value={form.item_name} onChangeText={(v) => set('item_name', v)} style={formStyles.input} />

      <SelectField label="Category" value={form.category_id} options={categoriesQuery.data || []} onChange={(v) => set('category_id', v)} />
      <SelectField label="Brand" value={form.brand_id} options={brandsQuery.data || []} onChange={(v) => set('brand_id', v)} />
      <SelectField label="Product Line" value={form.product_line_id} options={productLinesQuery.data || []} onChange={(v) => set('product_line_id', v)} />
      <SelectField label="Supplier" value={form.supplier_id} options={suppliersQuery.data || []} onChange={(v) => set('supplier_id', v)} />
      <SelectField label="Tax Code / GST %" value={form.tax_code_id} options={taxQuery.data || []} labelKey="code" onChange={(v) => set('tax_code_id', v)} />

      <View style={formStyles.row}>
        <View style={{ flex: 1 }}>
          <Text style={formStyles.label}>HSN Code</Text>
          <TextInput value={form.hsn_code} onChangeText={(v) => set('hsn_code', v)} style={formStyles.input} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={formStyles.label}>Barcode</Text>
          <TextInput value={form.barcode} onChangeText={(v) => set('barcode', v)} style={formStyles.input} />
        </View>
      </View>

      <Text style={styles.sectionTitle}>Units</Text>
      <SelectField label="Base Unit *" value={form.base_unit_id} options={units} labelKey="short_code" onChange={(v) => set('base_unit_id', v)} />
      <SelectField label="Secondary Unit (optional)" value={form.secondary_unit_id} options={secondaryUnitOptions} labelKey="short_code" onChange={(v) => set('secondary_unit_id', v)} />

      <Text style={styles.sectionTitle}>Primary Unit Pricing</Text>
      <View style={formStyles.row}>
        <View style={{ flex: 1 }}>
          <Text style={formStyles.label}>MRP</Text>
          <TextInput keyboardType="numeric" value={form.mrp} onChangeText={(v) => set('mrp', v)} style={formStyles.input} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={formStyles.label}>Net Sale Rate</Text>
          <TextInput keyboardType="numeric" value={form.net_srate} onChangeText={(v) => set('net_srate', v)} style={formStyles.input} placeholder={form.retail_price || '0.00'} />
        </View>
      </View>
      <View style={formStyles.row}>
        <View style={{ flex: 1 }}>
          <Text style={formStyles.label}>Net Purchase Rate</Text>
          <TextInput keyboardType="numeric" value={form.net_purrate} onChangeText={(v) => set('net_purrate', v)} style={formStyles.input} placeholder={form.purchase_price || '0.00'} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={formStyles.label}>Purchase Price</Text>
          <TextInput keyboardType="numeric" value={form.purchase_price} onChangeText={(v) => set('purchase_price', v)} style={formStyles.input} />
        </View>
      </View>
      <View style={formStyles.row}>
        <View style={{ flex: 1 }}>
          <Text style={formStyles.label}>Cost Price</Text>
          <TextInput keyboardType="numeric" value={form.cost_price} onChangeText={(v) => set('cost_price', v)} style={formStyles.input} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={formStyles.label}>Wholesale Price</Text>
          <TextInput keyboardType="numeric" value={form.wholesale_price} onChangeText={(v) => set('wholesale_price', v)} style={formStyles.input} />
        </View>
      </View>
      <Text style={formStyles.label}>Retail Price</Text>
      <TextInput keyboardType="numeric" value={form.retail_price} onChangeText={(v) => set('retail_price', v)} style={formStyles.input} />

      {form.secondary_unit_id && (
        <>
          <Text style={styles.sectionTitle}>
            Secondary Unit Pricing ({units.find((u) => u.id === form.secondary_unit_id)?.short_code})
          </Text>
          <View style={formStyles.row}>
            <View style={{ flex: 1 }}>
              <Text style={formStyles.label}>S-MRP</Text>
              <TextInput keyboardType="numeric" value={form.secondary_mrp} onChangeText={(v) => set('secondary_mrp', v)} style={formStyles.input} placeholder={form.mrp || '0.00'} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={formStyles.label}>S-Net Sale Rate</Text>
              <TextInput keyboardType="numeric" value={form.secondary_net_srate} onChangeText={(v) => set('secondary_net_srate', v)} style={formStyles.input} placeholder={form.net_srate || '0.00'} />
            </View>
          </View>
          <Text style={formStyles.label}>S-Net Purchase Rate</Text>
          <TextInput keyboardType="numeric" value={form.secondary_net_purrate} onChangeText={(v) => set('secondary_net_purrate', v)} style={formStyles.input} placeholder={form.net_purrate || '0.00'} />
        </>
      )}

      <Text style={styles.sectionTitle}>Stock</Text>
      <Text style={formStyles.label}>Minimum Stock Threshold</Text>
      <TextInput keyboardType="numeric" value={form.min_stock_threshold} onChangeText={(v) => set('min_stock_threshold', v)} style={formStyles.input} />
      {!isEdit && (
        <>
          <Text style={formStyles.label}>Opening Stock (applied to every branch checked below)</Text>
          <TextInput keyboardType="numeric" value={form.opening_stock} onChangeText={(v) => set('opening_stock', v)} style={formStyles.input} />
        </>
      )}

      <View style={styles.switchRow}>
        <Text style={formStyles.label}>Active</Text>
        <Switch value={form.is_active} onValueChange={(v) => set('is_active', v)} />
      </View>

      <Text style={styles.sectionTitle}>Available at Branches</Text>
      <View style={styles.branchBox}>
        {branches.map((b) => (
          <TouchableOpacity key={b.id} style={styles.branchRow} onPress={() => toggleBranch(b.id)}>
            <View style={[styles.checkbox, selectedBranches.includes(b.id) && styles.checkboxChecked]}>
              {selectedBranches.includes(b.id) && <Text style={styles.checkboxTick}>✓</Text>}
            </View>
            <Text style={styles.branchLabel}>{b.branch_name}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {error ? <Text style={formStyles.error}>{error}</Text> : null}
    </FormModal>
  );
}

const styles = StyleSheet.create({
  imageRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  imageBox: { width: 80, height: 80, borderRadius: 10, backgroundColor: colors.page, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', borderWidth: 1, borderColor: colors.borderSoft },
  imagePlaceholder: { fontSize: 10, color: colors.inkMuted },
  sectionTitle: { fontSize: 12, fontWeight: '700', color: colors.gold, marginTop: 18, marginBottom: 4, textTransform: 'uppercase' },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 },
  branchBox: { borderWidth: 1, borderColor: colors.borderSoft, borderRadius: 10, padding: 10, backgroundColor: colors.card },
  branchRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6 },
  checkbox: { width: 18, height: 18, borderRadius: 4, borderWidth: 1.5, borderColor: colors.borderSoft, alignItems: 'center', justifyContent: 'center', marginRight: 8 },
  checkboxChecked: { backgroundColor: colors.gold, borderColor: colors.gold },
  checkboxTick: { color: '#fff', fontSize: 11, fontWeight: '700' },
  branchLabel: { fontSize: 13, color: colors.ink },
});
