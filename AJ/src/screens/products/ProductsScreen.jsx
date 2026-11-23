import { useState, useMemo } from 'react';
import { View, Text, TextInput, TouchableOpacity, FlatList, Alert, StyleSheet } from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { itemsApi } from '../../api/catalog';
import { friendlyErrorMessage } from '../../api/client';
import { ProductImage } from '../../components/ProductImage';
import { FormModal, formStyles } from '../../components/FormModal';
import { ExcelToolbar } from '../../components/ExcelToolbar';
import { ImportExcelModal } from '../../components/ImportExcelModal';
import { Icon } from '../../components/Icon';
import { ItemFormModal } from './ItemFormModal';
import { usePermission } from '../../hooks/useAuth';
import { colors } from '../../theme/colors';

const PAGE_SIZE = 10;

export function ProductsScreen() {
  const canManage = usePermission('catalog.manage_items');
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('active'); // active | inactive | all
  const [page, setPage] = useState(1);
  const [modal, setModal] = useState(undefined); // undefined closed, null create, obj edit
  const [viewProduct, setViewProduct] = useState(null);
  const [importOpen, setImportOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const itemsQuery = useQuery({
    queryKey: ['items', '', statusFilter],
    queryFn: () => itemsApi.list('', statusFilter),
  });
  const removeMutation = useMutation({
    mutationFn: itemsApi.remove,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['items'] }),
    onError: (e) => Alert.alert('Error', friendlyErrorMessage(e)),
  });
  const reactivateMutation = useMutation({
    mutationFn: (id) => itemsApi.update(id, { is_active: 1 }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['items'] }),
    onError: (e) => Alert.alert('Error', friendlyErrorMessage(e)),
  });

  const items = useMemo(() => itemsQuery.data || [], [itemsQuery.data]);
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (i) =>
        (i.item_name || '').toLowerCase().includes(q) ||
        (i.item_code || '').toLowerCase().includes(q) ||
        (i.barcode || '').toLowerCase().includes(q) ||
        (i.category_name || '').toLowerCase().includes(q) ||
        (i.brand_name || '').toLowerCase().includes(q)
    );
  }, [items, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pagedItems = useMemo(
    () => filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE),
    [filtered, currentPage]
  );

  const handleSearchChange = (v) => { setSearch(v); setPage(1); };

  const openEdit = async (item) => setModal(await itemsApi.get(item.id));
  const openView = (item) => setViewProduct(item);

  const confirmDelete = (item) => {
    Alert.alert(
      'Deactivate item?',
      `"${item.item_name}" will be hidden from Billing and the active list, but its history is kept.`,
      [
        { text: 'Cancel' },
        { text: 'Deactivate', style: 'destructive', onPress: () => removeMutation.mutate(item.id) },
      ]
    );
  };

  return (
    <View style={styles.screen}>
      {/* Top Header Controls: Search Input + Top-Right "+ Add Product" Button */}
      <View style={styles.topHeader}>
        <View style={styles.searchWrap}>
          <Icon name="search" size={16} color={colors.inkMuted} style={{ marginRight: 6 }} />
          <TextInput
            value={search}
            onChangeText={handleSearchChange}
            placeholder="Search by product name, code, barcode..."
            placeholderTextColor={colors.inkMuted}
            style={styles.search}
            autoCapitalize="none"
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => handleSearchChange('')} style={{ padding: 4 }}>
              <Text style={{ color: colors.inkMuted, fontSize: 13, fontWeight: '700' }}>✕</Text>
            </TouchableOpacity>
          )}
        </View>
        {canManage && (
          <TouchableOpacity style={styles.topRightBtn} onPress={() => setModal(null)}>
            <Icon name="plus" size={14} color={colors.gold} style={{ marginRight: 4 }} />
            <Text style={styles.topRightBtnText}>+ Add</Text>
          </TouchableOpacity>
        )}
      </View>

      {canManage && (
        <ExcelToolbar
          onGetList={itemsQuery.refetch}
          onImportPress={() => setImportOpen(true)}
          busy={busy}
          setBusy={setBusy}
        />
      )}

      <View style={styles.statusFilterRow}>
        {[['active', 'Active'], ['inactive', 'Deactivated'], ['all', 'All']].map(([value, label]) => (
          <TouchableOpacity
            key={value}
            onPress={() => { setStatusFilter(value); setPage(1); }}
            style={[styles.statusFilterBtn, statusFilter === value && styles.statusFilterBtnActive]}
          >
            <Text style={[styles.statusFilterText, statusFilter === value && styles.statusFilterTextActive]}>{label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <FlatList
        data={pagedItems}
        keyExtractor={(i) => String(i.id)}
        refreshing={itemsQuery.isFetching}
        onRefresh={itemsQuery.refetch}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ padding: 12, paddingBottom: 140, flexGrow: 1 }}
        ListEmptyComponent={
          itemsQuery.isLoading ? (
            <Text style={styles.empty}>Loading products...</Text>
          ) : items.length === 0 ? (
            <Text style={styles.empty}>No products in catalog yet.</Text>
          ) : (
            <View style={{ alignItems: 'center', marginTop: 30 }}>
              <Text style={styles.empty}>No products found matching "{search}".</Text>
              <TouchableOpacity onPress={() => handleSearchChange('')} style={styles.resetSearchBtn}>
                <Text style={styles.resetSearchBtnText}>Clear Search</Text>
              </TouchableOpacity>
            </View>
          )
        }
        ListFooterComponent={filtered.length > 0 ? (
          <View style={styles.pagerRow}>
            <TouchableOpacity
              style={[styles.pagerBtn, currentPage === 1 && styles.pagerBtnDisabled]}
              onPress={() => setPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
            >
              <Text style={styles.pagerBtnText}>Previous</Text>
            </TouchableOpacity>
            <Text style={styles.pagerLabel}>Page {currentPage} of {totalPages} · {filtered.length} items</Text>
            <TouchableOpacity
              style={[styles.pagerBtn, currentPage === totalPages && styles.pagerBtnDisabled]}
              onPress={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
            >
              <Text style={styles.pagerBtnText}>Next</Text>
            </TouchableOpacity>
          </View>
        ) : null}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <ProductImage path={item.image} size={48} />
            <TouchableOpacity style={{ marginLeft: 12, flex: 1 }} onPress={() => openView(item)}>
              <Text style={styles.name}>{item.item_name}</Text>
              <Text style={styles.meta}>
                {item.item_code} · {item.category_name || 'Uncategorized'}
                {statusFilter === 'all' && !Number(item.is_active) ? ' · Deactivated' : ''}
              </Text>
              <Text style={styles.price}>Rs. {item.retail_price}</Text>
            </TouchableOpacity>

            {/* Explicit CRUD Action Buttons: View, Edit, Delete/Reactivate */}
            <View style={styles.actionBtns}>
              <TouchableOpacity onPress={() => openView(item)} style={styles.actionBtn}>
                <Icon name="view" size={16} color={colors.inkMuted} />
              </TouchableOpacity>

              {canManage && (
                <>
                  <TouchableOpacity onPress={() => openEdit(item)} style={styles.actionBtn}>
                    <Icon name="edit" size={16} color={colors.gold} />
                  </TouchableOpacity>
                  {Number(item.is_active) ? (
                    <TouchableOpacity onPress={() => confirmDelete(item)} style={styles.actionBtn}>
                      <Icon name="delete" size={16} color={colors.danger} />
                    </TouchableOpacity>
                  ) : (
                    <TouchableOpacity onPress={() => reactivateMutation.mutate(item.id)} style={styles.actionBtn}>
                      <Icon name="undo" size={16} color={colors.gold} />
                    </TouchableOpacity>
                  )}
                </>
              )}
            </View>
          </View>
        )}
      />

      {modal !== undefined && <ItemFormModal item={modal} onClose={() => setModal(undefined)} />}

      {/* Product View Detail Modal */}
      {viewProduct && (
        <FormModal
          visible
          title={`Product: ${viewProduct.item_name}`}
          onClose={() => setViewProduct(null)}
          footer={
            <TouchableOpacity style={formStyles.primaryBtn} onPress={() => setViewProduct(null)}>
              <Text style={formStyles.primaryBtnText}>Close</Text>
            </TouchableOpacity>
          }
        >
          <View style={{ alignItems: 'center', marginBottom: 12 }}>
            <ProductImage path={viewProduct.image} size={100} style={{ borderRadius: 12 }} />
          </View>
          <View style={styles.detailBox}>
            <DetailRow label="Item Code" value={viewProduct.item_code} />
            <DetailRow label="Category" value={viewProduct.category_name || 'Uncategorized'} />
            <DetailRow label="Retail Price" value={`Rs. ${viewProduct.retail_price}`} />
            <DetailRow label="Wholesale Price" value={`Rs. ${viewProduct.wholesale_price || '-'}`} />
            <DetailRow label="Barcode" value={viewProduct.barcode || '-'} />
            <DetailRow label="GST %" value={`${viewProduct.gst_percent || 0}%`} />
          </View>
        </FormModal>
      )}

      {importOpen && (
        <ImportExcelModal
          onClose={() => setImportOpen(false)}
          onImported={() => itemsQuery.refetch()}
        />
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
  statusFilterRow: { flexDirection: 'row', paddingHorizontal: 12, paddingTop: 10, gap: 6 },
  statusFilterBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: colors.borderSoft, backgroundColor: colors.card },
  statusFilterBtnActive: { backgroundColor: colors.navbar, borderColor: colors.navbar },
  statusFilterText: { fontSize: 12, fontWeight: '600', color: colors.inkMuted },
  statusFilterTextActive: { color: colors.gold },
  pagerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12, paddingHorizontal: 4 },
  pagerBtn: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.borderSoft, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8 },
  pagerBtnDisabled: { opacity: 0.4 },
  pagerBtnText: { color: colors.ink, fontWeight: '600', fontSize: 12 },
  pagerLabel: { color: colors.inkMuted, fontSize: 11, fontWeight: '600', flexShrink: 1, textAlign: 'center', marginHorizontal: 6 },
  screen: { flex: 1, backgroundColor: colors.page },
  topHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    gap: 8,
    backgroundColor: colors.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSoft,
  },
  searchWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.page,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    paddingHorizontal: 10,
    height: 40,
  },
  search: {
    flex: 1,
    fontSize: 13,
    color: colors.ink,
    paddingVertical: 6,
  },
  resetSearchBtn: {
    marginTop: 12,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: colors.navbar,
  },
  resetSearchBtnText: {
    color: colors.gold,
    fontWeight: '700',
    fontSize: 12,
  },
  empty: { textAlign: 'center', color: colors.inkMuted, marginTop: 40 },
  topRightBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.navbar,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 8,
  },
  topRightBtnText: { color: colors.gold, fontWeight: '700', fontSize: 12 },
  row: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.card, borderRadius: 10, padding: 10, marginBottom: 8, borderWidth: 1, borderColor: colors.borderSoft },
  name: { fontWeight: '600', color: colors.ink },
  meta: { fontSize: 11, color: colors.inkMuted },
  price: { fontWeight: '700', color: colors.ink, marginTop: 2 },
  actionBtns: { flexDirection: 'row', alignItems: 'center', gap: 10, marginLeft: 8 },
  actionBtn: { padding: 6 },
  detailBox: { backgroundColor: colors.page, borderRadius: 10, padding: 12 },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: colors.borderSoft },
  detailLabel: { fontWeight: '600', color: colors.inkMuted, fontSize: 13 },
  detailVal: { fontWeight: '700', color: colors.ink, fontSize: 13 },
});
