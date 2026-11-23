import { useState, useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { customersApi, suppliersApi, routesApi, citiesApi } from '../../api/parties';
import { SegmentedTabs } from '../../components/SegmentedTabs';
import { EntityListScreen } from '../../components/EntityListScreen';
import { usePermission } from '../../hooks/useAuth';
import { colors } from '../../theme/colors';

export function PartiesScreen() {
  const canManageCustomers = usePermission('parties.manage_customers');
  const canManageSuppliers = usePermission('parties.manage_suppliers');
  const [tab, setTab] = useState('customers');

  const routesQuery = useQuery({ queryKey: ['routes'], queryFn: routesApi.list });
  const routes = useMemo(() => routesQuery.data || [], [routesQuery.data]);
  const routeMap = useMemo(() => new Map(routes.map((r) => [String(r.id), r.name])), [routes]);

  return (
    <View style={styles.screen}>
      <SegmentedTabs
        tabs={[
          { key: 'customers', label: 'Customers' },
          { key: 'suppliers', label: 'Suppliers' },
          { key: 'routes', label: 'Routes' },
          { key: 'cities', label: 'Cities' },
        ]}
        active={tab}
        onChange={setTab}
      />
      <View style={{ flex: 1, marginTop: 8 }}>
        {tab === 'customers' && (
          <EntityListScreen
            queryKey="customers" api={customersApi} title="Customer" canManage={canManageCustomers}
            fields={[
              { name: 'ledger_name', label: 'Customer name', required: true },
              { name: 'phone', label: 'Mobile Number', required: true, type: 'phone', keyboardType: 'phone-pad', placeholder: '10-digit mobile (e.g. 9876543210)' },
              { name: 'credit_limit', label: 'Credit limit', keyboardType: 'numeric' },
              { name: 'opening_balance', label: 'Opening balance', keyboardType: 'numeric' },
              {
                name: 'pricing_type', label: 'Pricing type', type: 'select', default: 'normal',
                options: [{ value: 'normal', label: 'Normal' }, { value: 'retail', label: 'Retail' }, { value: 'wholesale', label: 'Wholesale' }],
              },
              { name: 'gstin', label: 'GST No / GSTIN' },
              { name: 'customer_group', label: 'Group' },
              { name: 'address', label: 'Address' },
              { name: 'doj', label: 'Date of joining (YYYY-MM-DD)' },
              { name: 'dob', label: 'Date of birth (YYYY-MM-DD)' },
            ]}
            renderTitle={(r) => r.ledger_name}
            renderSubtitle={(r) => `${r.phone || 'No phone'} · Credit limit Rs. ${r.credit_limit || '0'}${r.pricing_type && r.pricing_type !== 'normal' ? ` · ${r.pricing_type}` : ''}`}
            transformSubmit={(form) => ({ ...form, doj: form.doj || null, dob: form.dob || null, gstin: form.gstin || null })}
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
            queryKey="suppliers" api={suppliersApi} title="Supplier" canManage={canManageSuppliers}
            fields={[
              { name: 'name', label: 'Supplier name', required: true },
              { name: 'phone', label: 'Mobile / Phone', type: 'phone', keyboardType: 'phone-pad', placeholder: '10-digit mobile' },
              { name: 'gstin', label: 'GSTIN' },
              { name: 'opening_balance', label: 'Outstanding (Rs.)', keyboardType: 'numeric' },
            ]}
            renderTitle={(r) => r.name}
            renderSubtitle={(r) => `${r.phone || 'No phone'}${Number(r.opening_balance) ? ` · Outstanding Rs. ${r.opening_balance}` : ''}`}
          />
        )}
        {tab === 'routes' && (
          <EntityListScreen
            queryKey="routes" api={routesApi} title="Route" canManage={canManageCustomers}
            fields={[{ name: 'name', label: 'Route name', required: true }]}
            renderTitle={(r) => r.name}
          />
        )}
        {tab === 'cities' && (
          <EntityListScreen
            queryKey="cities" api={citiesApi} title="City" canManage={canManageCustomers}
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

const styles = StyleSheet.create({ screen: { flex: 1, backgroundColor: colors.page } });
