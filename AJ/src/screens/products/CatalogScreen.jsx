import { useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { categoriesApi, brandsApi, stockUnitsApi, taxCodesApi, productLinesApi } from '../../api/catalog';
import { SegmentedTabs } from '../../components/SegmentedTabs';
import { EntityListScreen } from '../../components/EntityListScreen';
import { ProductsScreen } from './ProductsScreen';
import { usePermission } from '../../hooks/useAuth';
import { colors } from '../../theme/colors';

export function CatalogScreen() {
  const canManage = usePermission('catalog.manage_items');
  const [tab, setTab] = useState('items');

  return (
    <View style={styles.screen}>
      <SegmentedTabs
        tabs={[
          { key: 'items', label: 'Items' },
          { key: 'categories', label: 'Categories' },
          { key: 'brands', label: 'Brands' },
          { key: 'units', label: 'Units' },
          { key: 'product-lines', label: 'Product Lines' },
          { key: 'tax-codes', label: 'Tax Codes' },
        ]}
        active={tab}
        onChange={setTab}
      />
      <View style={{ flex: 1, marginTop: 8 }}>
        {tab === 'items' && <ProductsScreen />}
        {tab === 'categories' && (
          <EntityListScreen
            queryKey="categories" api={categoriesApi} title="Category" canManage={canManage}
            fields={[{ name: 'name', label: 'Category name', required: true }]}
            renderTitle={(r) => r.name}
          />
        )}
        {tab === 'brands' && (
          <EntityListScreen
            queryKey="brands" api={brandsApi} title="Brand" canManage={canManage}
            fields={[{ name: 'name', label: 'Brand name', required: true }]}
            renderTitle={(r) => r.name}
          />
        )}
        {tab === 'units' && (
          <EntityListScreen
            queryKey="stock-units" api={stockUnitsApi} title="Unit" canManage={canManage}
            fields={[
              { name: 'name', label: 'Unit name', required: true },
              { name: 'short_code', label: 'Short code', required: true },
              { name: 'is_decimal', label: 'Allow Decimal Quantity', type: 'switch', default: 0 },
              { name: 'is_active', label: 'Active Status', type: 'switch', default: 1 },
            ]}
            renderTitle={(r) => `${r.name} (${r.short_code})`}
            renderSubtitle={(r) => `Decimals: ${Number(r.is_decimal) ? 'Allowed' : 'No'} · ${Number(r.is_active ?? 1) ? 'Active' : 'Inactive'}`}
            transformSubmit={(form) => ({
              ...form,
              is_decimal: Number(form.is_decimal ? 1 : 0),
              is_active: Number(form.is_active !== undefined ? (form.is_active ? 1 : 0) : 1),
            })}
          />
        )}
        {tab === 'product-lines' && (
          <EntityListScreen
            queryKey="product-lines" api={productLinesApi} title="Product Line" canManage={canManage}
            fields={[
              { name: 'name', label: 'Line Name', required: true },
              { name: 'code', label: 'Line Code' },
              { name: 'is_active', label: 'Status', type: 'switch', default: 1 },
            ]}
            transformSubmit={(f) => ({ name: (f.name || '').trim(), code: (f.code || '').trim(), is_active: f.is_active ? 1 : 0 })}
            renderTitle={(r) => r.name}
            renderSubtitle={(r) => `${r.code || 'No code'}${Number(r.is_active) === 0 ? ' · Inactive' : ''}`}
          />
        )}
        {tab === 'tax-codes' && (
          <EntityListScreen
            queryKey="tax-codes" api={taxCodesApi} title="Tax Code" canManage={canManage}
            fields={[
              { name: 'code', label: 'Code', required: true },
              { name: 'name', label: 'Name', required: true },
              { name: 'gst_percent', label: 'GST %', keyboardType: 'numeric' },
              { name: 'cgst_percent', label: 'CGST % (blank = auto GST/2)', keyboardType: 'numeric' },
              { name: 'sgst_percent', label: 'SGST % (blank = auto GST/2)', keyboardType: 'numeric' },
              { name: 'igst_percent', label: 'IGST % (blank = auto = GST)', keyboardType: 'numeric' },
              { name: 'cess_percent', label: 'Cess % (blank = 0)', keyboardType: 'numeric' },
              { name: 'is_active', label: 'Status', type: 'switch', default: 1 },
            ]}
            transformSubmit={(f) => {
              const gst = Number(f.gst_percent || 0);
              return {
                code: (f.code || '').trim(),
                name: (f.name || '').trim(),
                gst_percent: gst,
                cgst_percent: f.cgst_percent !== '' ? Number(f.cgst_percent) : gst / 2,
                sgst_percent: f.sgst_percent !== '' ? Number(f.sgst_percent) : gst / 2,
                igst_percent: f.igst_percent !== '' ? Number(f.igst_percent) : gst,
                cess_percent: f.cess_percent !== '' ? Number(f.cess_percent) : 0,
                is_active: f.is_active ? 1 : 0,
              };
            }}
            renderTitle={(r) => `${r.code} · ${r.name}`}
            renderSubtitle={(r) => `GST ${r.gst_percent}%${Number(r.is_active) === 0 ? ' · Inactive' : ''}`}
          />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.page },
});
