import { useState, useMemo, useEffect } from 'react';
import { View, Text, TouchableOpacity, ScrollView, FlatList, Alert, ActivityIndicator, StyleSheet } from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { customersApi, suppliersApi, routesApi, citiesApi } from '../../api/parties';
import { routeSuppliersApi } from '../../api/purchasing';
import { SegmentedTabs } from '../../components/SegmentedTabs';
import { EntityListScreen } from '../../components/EntityListScreen';
import { Icon } from '../../components/Icon';
import { usePermission } from '../../hooks/useAuth';
import { friendlyErrorMessage } from '../../api/client';
import { colors } from '../../theme/colors';

export function PartiesScreen() {
  const canManageCustomers = usePermission('parties.manage_customers');
  const canManageSuppliers = usePermission('parties.manage_suppliers');
  const [tab, setTab] = useState('customers');

  const routesQuery = useQuery({ queryKey: ['routes'], queryFn: routesApi.list });
  const routes = useMemo(() => routesQuery.data || [], [routesQuery.data]);
  const routeMap = useMemo(() => new Map(routes.map((r) => [String(r.id), r.name])), [routes]);

  const citiesQuery = useQuery({ queryKey: ['cities'], queryFn: citiesApi.list });
  const cities = useMemo(() => citiesQuery.data || [], [citiesQuery.data]);
  const cityMap = useMemo(() => new Map(cities.map((c) => [String(c.id), c.name])), [cities]);

  const suppliersQuery = useQuery({ queryKey: ['suppliers'], queryFn: suppliersApi.list });
  const suppliers = useMemo(() => suppliersQuery.data || [], [suppliersQuery.data]);

  return (
    <View style={styles.screen}>
      <SegmentedTabs
        tabs={[
          { key: 'customers', label: 'Customers' },
          { key: 'suppliers', label: 'Suppliers' },
          { key: 'routes', label: 'Routes' },
          { key: 'route-suppliers', label: 'Route Mapping' },
          { key: 'cities', label: 'Cities' },
        ]}
        active={tab}
        onChange={setTab}
      />
      <View style={{ flex: 1, marginTop: 8 }}>
        {tab === 'customers' && (
          <EntityListScreen
            queryKey="customers"
            api={customersApi}
            title="Customer"
            canManage={canManageCustomers}
            fields={[
              { name: 'ledger_name', label: 'Customer name', required: true },
              { name: 'phone', label: 'Mobile Number', required: true, type: 'phone', keyboardType: 'phone-pad', placeholder: '10-digit mobile (e.g. 9876543210)' },
              {
                name: 'city_id',
                label: 'City',
                type: 'select',
                options: cities.map((c) => ({ value: c.id, label: c.name })),
              },
              {
                name: 'route_id',
                label: 'Route',
                type: 'select',
                options: routes.map((r) => ({ value: r.id, label: r.name })),
              },
              {
                name: 'pricing_type',
                label: 'Pricing type',
                type: 'select',
                default: 'normal',
                options: [
                  { value: 'normal', label: 'Normal' },
                  { value: 'retail', label: 'Retail' },
                  { value: 'wholesale', label: 'Wholesale' },
                ],
              },
              { name: 'credit_limit', label: 'Credit limit', keyboardType: 'numeric' },
              { name: 'opening_balance', label: 'Opening balance', keyboardType: 'numeric' },
              { name: 'gstin', label: 'GST No / GSTIN' },
              { name: 'customer_group', label: 'Group' },
              { name: 'address', label: 'Address' },
              { name: 'doj', label: 'Date of joining (YYYY-MM-DD)' },
              { name: 'dob', label: 'Date of birth (YYYY-MM-DD)' },
              { name: 'is_active', label: 'Active Status', type: 'switch', default: 1 },
            ]}
            renderTitle={(r) => r.ledger_name}
            renderSubtitle={(r) => {
              const cName = r.city_id ? cityMap.get(String(r.city_id)) : null;
              const rName = r.route_id ? routeMap.get(String(r.route_id)) : null;
              const place = [cName, rName].filter(Boolean).join(' · ');
              const statusStr = (r.status === 'inactive' || r.is_active === 0) ? 'Inactive' : 'Active';
              return `${r.phone || 'No phone'}${place ? ` · ${place}` : ''} · Credit Rs. ${r.credit_limit || '0'} · ${statusStr}`;
            }}
            transformSubmit={(form) => ({
              ...form,
              city_id: form.city_id ? Number(form.city_id) : null,
              route_id: form.route_id ? Number(form.route_id) : null,
              doj: form.doj || null,
              dob: form.dob || null,
              gstin: form.gstin || null,
              status: (form.is_active === 0 || form.is_active === false) ? 'inactive' : 'active',
            })}
            excelImport={{
              importApi: customersApi,
              exportPath: customersApi.exportPath,
              exportFilename: 'customers_export.xlsx',
              templatePath: customersApi.importTemplatePath,
              templateFilename: 'customers_import_template.xlsx',
              rowLabel: (r) => r.customer || '—',
              successNoun: 'customer(s)',
            }}
          />
        )}

        {tab === 'suppliers' && (
          <EntityListScreen
            queryKey="suppliers"
            api={suppliersApi}
            title="Supplier"
            canManage={canManageSuppliers}
            fields={[
              { name: 'name', label: 'Supplier name', required: true },
              { name: 'phone', label: 'Mobile / Phone', type: 'phone', keyboardType: 'phone-pad', placeholder: '10-digit mobile' },
              { name: 'gstin', label: 'GSTIN' },
              { name: 'address', label: 'Address' },
              { name: 'opening_balance', label: 'Outstanding (Rs.)', keyboardType: 'numeric' },
              { name: 'is_active', label: 'Active Status', type: 'switch', default: 1 },
            ]}
            renderTitle={(r) => r.name}
            renderSubtitle={(r) => {
              const statusStr = (r.status === 'inactive' || r.is_active === 0) ? 'Inactive' : 'Active';
              return `${r.phone || 'No phone'}${Number(r.opening_balance) ? ` · Outstanding Rs. ${r.opening_balance}` : ''} · ${statusStr}`;
            }}
            transformSubmit={(form) => ({
              ...form,
              status: (form.is_active === 0 || form.is_active === false) ? 'inactive' : 'active',
            })}
          />
        )}

        {tab === 'routes' && (
          <EntityListScreen
            queryKey="routes"
            api={routesApi}
            title="Route"
            canManage={canManageCustomers}
            fields={[{ name: 'name', label: 'Route name', required: true }]}
            renderTitle={(r) => r.name}
          />
        )}

        {tab === 'route-suppliers' && (
          <RouteSupplierMappingPanel
            routes={routes}
            suppliers={suppliers}
            canManage={canManageSuppliers}
          />
        )}

        {tab === 'cities' && (
          <EntityListScreen
            queryKey="cities"
            api={citiesApi}
            title="City"
            canManage={canManageCustomers}
            fields={[
              { name: 'name', label: 'City name', required: true },
              {
                name: 'route_id',
                label: 'Route',
                type: 'select',
                required: true,
                options: routes.map((rt) => ({ value: rt.id, label: rt.name })),
              },
            ]}
            renderTitle={(r) => r.name}
            renderSubtitle={(r) => {
              const rName = routeMap.get(String(r.route_id));
              return rName ? `Route: ${rName}` : (r.route_id ? `Route #${r.route_id}` : 'No route');
            }}
          />
        )}
      </View>
    </View>
  );
}

/**
 * Route -> Supplier Mapping Panel
 * Allows selecting a route, picking allowed suppliers with checkboxes,
 * saving the mapping, and seeing the Mapped Route Overview list.
 */
function RouteSupplierMappingPanel({ routes, suppliers, canManage }) {
  const queryClient = useQueryClient();
  const [selectedRouteId, setSelectedRouteId] = useState(routes[0]?.id || null);
  const [selectedSupplierIds, setSelectedSupplierIds] = useState([]);
  const [loadingMapping, setLoadingMapping] = useState(false);

  useEffect(() => {
    if (routes.length > 0 && !selectedRouteId) {
      setSelectedRouteId(routes[0].id);
    }
  }, [routes]);

  useEffect(() => {
    if (!selectedRouteId) {
      setSelectedSupplierIds([]);
      return;
    }
    let cancelled = false;
    setLoadingMapping(true);
    routeSuppliersApi
      .get(selectedRouteId)
      .then((data) => {
        if (!cancelled) {
          setSelectedSupplierIds(data?.supplier_ids || []);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          console.warn('Failed to load route suppliers:', err);
          setSelectedSupplierIds([]);
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingMapping(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedRouteId]);

  const toggleSupplier = (supplierId) => {
    if (!canManage) return;
    setSelectedSupplierIds((prev) =>
      prev.includes(supplierId) ? prev.filter((id) => id !== supplierId) : [...prev, supplierId]
    );
  };

  const saveMutation = useMutation({
    mutationFn: () => routeSuppliersApi.set(selectedRouteId, selectedSupplierIds),
    onSuccess: () => {
      Alert.alert('Saved', 'Route-Supplier mapping saved successfully!');
      queryClient.invalidateQueries({ queryKey: ['routes'] });
    },
    onError: (err) => {
      Alert.alert('Save Failed', friendlyErrorMessage(err));
    },
  });

  const selectedRoute = routes.find((r) => r.id === selectedRouteId);

  return (
    <ScrollView style={styles.mappingContainer} contentContainerStyle={{ paddingBottom: 100 }}>
      {/* Route Selector Chips */}
      <View style={styles.cardBox}>
        <Text style={styles.sectionHeader}>Select Route to Map</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.routeChipsRow}>
          {routes.map((r) => {
            const isSelected = r.id === selectedRouteId;
            return (
              <TouchableOpacity
                key={String(r.id)}
                onPress={() => setSelectedRouteId(r.id)}
                style={[styles.routeChip, isSelected && styles.routeChipActive]}
              >
                <Text style={[styles.routeChipText, isSelected && styles.routeChipTextActive]}>
                  {r.name}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* Allowed Suppliers Checkbox Section */}
      <View style={styles.cardBox}>
        <View style={styles.mappingTitleRow}>
          <View>
            <Text style={styles.sectionHeader}>
              Allowed Suppliers for {selectedRoute?.name || 'Route'}
            </Text>
            <Text style={styles.sectionSub}>
              Selected: {selectedSupplierIds.length} of {suppliers.length} suppliers
            </Text>
          </View>
          {canManage && (
            <TouchableOpacity
              style={[styles.saveBtn, (!selectedRouteId || saveMutation.isPending) && styles.saveBtnDisabled]}
              onPress={() => saveMutation.mutate()}
              disabled={!selectedRouteId || saveMutation.isPending}
            >
              {saveMutation.isPending ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.saveBtnText}>Save</Text>
              )}
            </TouchableOpacity>
          )}
        </View>

        {loadingMapping ? (
          <View style={{ paddingVertical: 20, alignItems: 'center' }}>
            <ActivityIndicator size="small" color={colors.gold} />
          </View>
        ) : suppliers.length === 0 ? (
          <Text style={styles.emptyText}>No suppliers found.</Text>
        ) : (
          <View style={styles.suppliersList}>
            {suppliers.map((s) => {
              const isChecked = selectedSupplierIds.includes(s.id);
              return (
                <TouchableOpacity
                  key={String(s.id)}
                  style={[styles.supplierRow, isChecked && styles.supplierRowChecked]}
                  onPress={() => toggleSupplier(s.id)}
                  disabled={!canManage}
                >
                  <View style={[styles.checkbox, isChecked && styles.checkboxChecked]}>
                    {isChecked && <Text style={styles.checkboxTick}>✓</Text>}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.supplierName, isChecked && styles.supplierNameChecked]}>{s.name}</Text>
                    {s.phone ? <Text style={styles.supplierPhone}>Phone: {s.phone}</Text> : null}
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </View>

      {/* Mapped Route Overview Section */}
      <View style={styles.cardBox}>
        <Text style={styles.sectionHeader}>Mapped Route Overview ({routes.length} Routes)</Text>
        <Text style={styles.sectionSub}>Tap any route card to load and edit its mapped suppliers</Text>

        <View style={{ marginTop: 8, gap: 8 }}>
          {routes.map((r) => {
            const isSelected = r.id === selectedRouteId;
            return (
              <TouchableOpacity
                key={String(r.id)}
                style={[styles.overviewCard, isSelected && styles.overviewCardSelected]}
                onPress={() => setSelectedRouteId(r.id)}
              >
                <View style={styles.overviewHeader}>
                  <Text style={[styles.overviewTitle, isSelected && { color: colors.gold }]}>{r.name}</Text>
                  <Text style={styles.overviewBadge}>
                    {isSelected ? 'Editing' : 'Select →'}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.page },
  mappingContainer: { flex: 1, padding: 12 },
  cardBox: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.borderSoft,
  },
  sectionHeader: { fontSize: 14, fontWeight: '700', color: colors.ink },
  sectionSub: { fontSize: 11, color: colors.inkMuted, marginTop: 2 },
  routeChipsRow: { flexDirection: 'row', gap: 8, paddingTop: 10, paddingBottom: 2 },
  routeChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: colors.page,
    borderWidth: 1,
    borderColor: colors.borderSoft,
  },
  routeChipActive: {
    backgroundColor: colors.navbar,
    borderColor: colors.gold,
  },
  routeChipText: { fontSize: 12, fontWeight: '600', color: colors.ink },
  routeChipTextActive: { color: colors.gold, fontWeight: '700' },
  mappingTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSoft,
    paddingBottom: 8,
  },
  saveBtn: {
    backgroundColor: colors.gold,
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: 8,
    minWidth: 70,
    alignItems: 'center',
  },
  saveBtnDisabled: { opacity: 0.5 },
  saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 12 },
  emptyText: { textAlign: 'center', color: colors.inkMuted, marginVertical: 14, fontSize: 12 },
  suppliersList: { gap: 6 },
  supplierRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    backgroundColor: colors.card,
  },
  supplierRowChecked: {
    borderColor: colors.gold,
    backgroundColor: '#FFFDF5',
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: colors.borderSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  checkboxChecked: { backgroundColor: colors.gold, borderColor: colors.gold },
  checkboxTick: { color: '#fff', fontSize: 12, fontWeight: '700' },
  supplierName: { fontSize: 13, fontWeight: '600', color: colors.ink },
  supplierNameChecked: { color: colors.ink, fontWeight: '700' },
  supplierPhone: { fontSize: 11, color: colors.inkMuted, marginTop: 1 },
  overviewCard: {
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    backgroundColor: colors.card,
  },
  overviewCardSelected: {
    borderColor: colors.gold,
    borderWidth: 1.5,
    backgroundColor: '#FFFDF5',
  },
  overviewHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  overviewTitle: { fontSize: 13, fontWeight: '700', color: colors.ink },
  overviewBadge: { fontSize: 11, fontWeight: '600', color: colors.gold },
});
