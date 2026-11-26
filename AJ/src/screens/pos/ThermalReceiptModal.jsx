import React, { useState } from 'react';
import { Modal, View, Text, ScrollView, TouchableOpacity, StyleSheet, Share, Alert, ActivityIndicator } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Icon } from '../../components/Icon';
import { colors } from '../../theme/colors';
import { printInvoiceReceipt, getConfiguredPrinter } from '../../utils/printerService';
import { downloadInvoicePdf } from '../../utils/pdfService';
import { invoicesApi } from '../../api/invoices';
import { settingsApi } from '../../api/admin';
import { friendlyErrorMessage } from '../../api/client';

export function ThermalReceiptModal({ visible, invoice, onClose }) {
  const [printing, setPrinting] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const branchQuery = useQuery({
    queryKey: ['settings-branch'],
    queryFn: settingsApi.getBranch,
    enabled: visible,
  });

  if (!visible || !invoice) return null;

  const branch = invoice.branch || branchQuery.data || {};
  const shopTitle = branch.print_name || branch.branch_name || 'AJ AGENCY';
  const shopAddress = branch.address_line1 ? (branch.address_line1 + (branch.city ? `, ${branch.city}` : '')) : '';
  const shopContact = [branch.gstin ? `GSTIN: ${branch.gstin}` : '', branch.phone ? `Ph: ${branch.phone}` : ''].filter(Boolean).join(' · ');

  const items = invoice.items || [];
  const grandTotal = Number(invoice.grand_total || 0).toFixed(2);
  const invoiceNo = invoice.invoice_no || `INV-${invoice.id}`;
  const dateStr = invoice.invoice_date || new Date().toLocaleDateString();
  const customerName = invoice.customer_name || 'Walk-in Customer';
  const paymentStatus = (invoice.payment_status || 'PAID').toUpperCase();

  // Share receipt text handler
  const handleShare = async () => {
    try {
      const lineItemsStr = items
        .map((l) => `${l.item_name_snapshot || l.item_name || 'Item'} x${l.qty} @ Rs.${l.rate} = Rs.${l.line_total}`)
        .join('\n');
      const shareMsg = `${shopTitle}\nDistributor Billing & Inventory\n${shopAddress ? shopAddress + '\n' : ''}${shopContact ? shopContact + '\n' : ''}--------------------------------\nInvoice #: ${invoiceNo}\nDate: ${dateStr}\nCustomer: ${customerName}\nStatus: ${paymentStatus}\n--------------------------------\n${lineItemsStr}\n--------------------------------\nGrand Total: Rs. ${grandTotal}\n--------------------------------\nThank you for shopping with us!`;
      await Share.share({ message: shareMsg });
    } catch (err) {
      Alert.alert('Share Error', err.message);
    }
  };

  // Real thermal print — talks to the printer configured in Settings >
  // Thermal Printer; shows the actual failure (not connected, Bluetooth
  // off, permission denied, connection lost) instead of a fake success.
  const handlePrint = async () => {
    setPrinting(true);
    try {
      const configured = await getConfiguredPrinter();
      if (!configured) {
        Alert.alert('No printer configured', 'Go to Settings > Thermal Printer to pair a printer first.');
        return;
      }
      await printInvoiceReceipt(invoice, branch);
      Alert.alert('Printed', `Invoice ${invoiceNo} sent to ${configured.name || configured.address}.`);
    } catch (err) {
      Alert.alert('Print failed', err?.message || 'Could not print to the configured printer.');
    } finally {
      setPrinting(false);
    }
  };

  // Real PDF — fetches the /invoices/{id}/print payload, renders it to an actual PDF file,
  // and hands it to the Android share/save sheet. If network/server is unreachable, constructs
  // printData locally from the invoice object so PDF download never fails offline.
  const handleDownloadPdf = async () => {
    setDownloading(true);
    try {
      let printData;
      try {
        printData = await invoicesApi.print(invoice.id);
      } catch (netErr) {
        // Local fallback if server endpoint is unreachable or offline
        const formattedItems = (invoice.items || []).map((it) => ({
          ...it,
          hsn_snapshot: it.hsn_snapshot || '-',
          item_name_snapshot: it.item_name_snapshot || it.item_name || 'Item',
          rate: Number(it.rate || 0).toFixed(2),
          qty: Number(it.qty || 1),
          unit_code: it.unit_code || 'PCS',
          line_total: Number(it.line_total || (it.qty * it.rate) || 0).toFixed(2),
          net_amount: Number(
            it.net_amount ?? ((Number(it.line_total || (it.qty * it.rate) || 0)) + Number(it.tax_amount || 0) + Number(it.cess_amount || 0))
          ).toFixed(2),
        }));
        printData = {
          invoice: {
            ...invoice,
            bill_type: invoice.bill_type || 'gst',
            invoice_no: invoice.invoice_no || `INV-${invoice.id}`,
            items: formattedItems,
          },
          branch: {
            print_name: shopTitle,
            address_line1: branch.address_line1 || 'Main Road',
            city: branch.city || 'Commercial Hub',
            phone: branch.phone || '',
            gstin: branch.gstin || '',
          },
          tax_slabs: [],
          amount_in_words: `Rupees ${Number(invoice.grand_total || 0).toFixed(2)} Only`,
          customer_outstanding: 0,
        };
      }
      await downloadInvoicePdf(printData);
    } catch (err) {
      Alert.alert('PDF failed', friendlyErrorMessage(err));
    } finally {
      setDownloading(false);
    }
  };

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.container}>
          {/* Modal Header */}
          <View style={styles.headerBar}>
            <View style={styles.headerTitleRow}>
              <Icon name="check" size={20} color={colors.success} />
              <Text style={styles.headerTitle}>Payment Complete</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.topCloseBtn}>
              <Icon name="close" size={18} color={colors.inkMuted} />
            </TouchableOpacity>
          </View>

          {/* Thermal Receipt Paper UI Container */}
          <ScrollView contentContainerStyle={styles.receiptScroll} showsVerticalScrollIndicator={false}>
            <View style={styles.paper}>
              {/* Paper Top Jagged Edge / Header */}
              <View style={styles.shopHeader}>
                <Text style={styles.shopTitle}>{shopTitle}</Text>
                <Text style={styles.shopSubtitle}>DISTRIBUTOR BILLING & INVENTORY</Text>
                {shopAddress ? <Text style={styles.shopInfo}>{shopAddress}</Text> : null}
                {shopContact ? <Text style={styles.shopInfo}>{shopContact}</Text> : null}
              </View>

              <View style={styles.dividerDashed} />

              {/* Invoice Meta */}
              <View style={styles.metaSection}>
                <View style={styles.metaRow}>
                  <Text style={styles.metaLabel}>INVOICE NO:</Text>
                  <Text style={styles.metaValBold}>{invoiceNo}</Text>
                </View>
                <View style={styles.metaRow}>
                  <Text style={styles.metaLabel}>DATE & TIME:</Text>
                  <Text style={styles.metaVal}>{dateStr}</Text>
                </View>
                <View style={styles.metaRow}>
                  <Text style={styles.metaLabel}>CUSTOMER:</Text>
                  <Text style={styles.metaVal}>{customerName}</Text>
                </View>
                <View style={styles.metaRow}>
                  <Text style={styles.metaLabel}>STATUS:</Text>
                  <Text style={[styles.metaValBold, { color: colors.success }]}>{paymentStatus}</Text>
                </View>
              </View>

              <View style={styles.dividerDashed} />

              {/* Items Table */}
              <View style={styles.tableHeader}>
                <Text style={[styles.colHeader, { flex: 2 }]}>ITEM</Text>
                <Text style={[styles.colHeader, { flex: 0.8, textAlign: 'center' }]}>QTY</Text>
                <Text style={[styles.colHeader, { flex: 1, textAlign: 'right' }]}>RATE</Text>
                <Text style={[styles.colHeader, { flex: 1.2, textAlign: 'right' }]}>AMOUNT</Text>
              </View>

              <View style={styles.dividerSolid} />

              {items.map((line, idx) => (
                <View key={idx} style={styles.tableRow}>
                  <Text style={[styles.colBody, { flex: 2 }]} numberOfLines={2}>
                    {line.item_name_snapshot || line.item?.item_name || line.item_name || 'Item'}
                  </Text>
                  <Text style={[styles.colBody, { flex: 0.8, textAlign: 'center' }]}>{line.qty}</Text>
                  <Text style={[styles.colBody, { flex: 1, textAlign: 'right' }]}>{Number(line.rate || 0).toFixed(2)}</Text>
                  <Text style={[styles.colBodyBold, { flex: 1.2, textAlign: 'right' }]}>
                    {Number(
                      line.net_amount ?? ((Number(line.line_total || (line.qty * line.rate) || 0)) + Number(line.tax_amount || 0) + Number(line.cess_amount || 0))
                    ).toFixed(2)}
                  </Text>
                </View>
              ))}

              <View style={styles.dividerDashed} />

              {/* Totals Summary */}
              <View style={styles.totalsSection}>
                {invoice.subtotal && (
                  <View style={styles.totalRow}>
                    <Text style={styles.totalLabel}>Subtotal</Text>
                    <Text style={styles.totalVal}>Rs. {Number(invoice.subtotal).toFixed(2)}</Text>
                  </View>
                )}
                {Number(invoice.discount_amount || 0) > 0 && (
                  <View style={styles.totalRow}>
                    <Text style={styles.totalLabel}>Discount</Text>
                    <Text style={[styles.totalVal, { color: colors.danger }]}>- Rs. {Number(invoice.discount_amount).toFixed(2)}</Text>
                  </View>
                )}
                {invoice.taxable_value && (
                  <View style={styles.totalRow}>
                    <Text style={styles.totalLabel}>Taxable Value</Text>
                    <Text style={styles.totalVal}>Rs. {Number(invoice.taxable_value).toFixed(2)}</Text>
                  </View>
                )}
                {Number(invoice.cgst_amount || 0) > 0 && (
                  <View style={styles.totalRow}>
                    <Text style={styles.totalLabel}>CGST</Text>
                    <Text style={styles.totalVal}>Rs. {Number(invoice.cgst_amount).toFixed(2)}</Text>
                  </View>
                )}
                {Number(invoice.sgst_amount || 0) > 0 && (
                  <View style={styles.totalRow}>
                    <Text style={styles.totalLabel}>SGST</Text>
                    <Text style={styles.totalVal}>Rs. {Number(invoice.sgst_amount).toFixed(2)}</Text>
                  </View>
                )}
                {Number(invoice.igst_amount || 0) > 0 && (
                  <View style={styles.totalRow}>
                    <Text style={styles.totalLabel}>IGST</Text>
                    <Text style={styles.totalVal}>Rs. {Number(invoice.igst_amount).toFixed(2)}</Text>
                  </View>
                )}
                {!invoice.cgst_amount && !invoice.sgst_amount && !invoice.igst_amount && invoice.tax_amount && Number(invoice.tax_amount) > 0 && (
                  <View style={styles.totalRow}>
                    <Text style={styles.totalLabel}>GST Tax</Text>
                    <Text style={styles.totalVal}>Rs. {Number(invoice.tax_amount).toFixed(2)}</Text>
                  </View>
                )}
                {Number(invoice.cess_amount || 0) > 0 && (
                  <View style={styles.totalRow}>
                    <Text style={styles.totalLabel}>Cess</Text>
                    <Text style={styles.totalVal}>Rs. {Number(invoice.cess_amount).toFixed(2)}</Text>
                  </View>
                )}
                {invoice.round_off != null && Number(invoice.round_off) !== 0 && (
                  <View style={styles.totalRow}>
                    <Text style={styles.totalLabel}>Round Off</Text>
                    <Text style={styles.totalVal}>Rs. {Number(invoice.round_off).toFixed(2)}</Text>
                  </View>
                )}
                <View style={[styles.totalRow, styles.grandTotalRow]}>
                  <Text style={styles.grandLabel}>TOTAL AMOUNT</Text>
                  <Text style={styles.grandVal}>Rs. {grandTotal}</Text>
                </View>
              </View>

              <View style={styles.dividerDashed} />

              {/* Barcode Visual */}
              <View style={styles.barcodeBox}>
                <View style={styles.barcodeLines}>
                  {Array.from({ length: 24 }).map((_, i) => (
                    <View
                      key={i}
                      style={{
                        width: i % 3 === 0 ? 3 : i % 2 === 0 ? 2 : 1,
                        height: 36,
                        backgroundColor: '#000',
                        marginHorizontal: 1,
                      }}
                    />
                  ))}
                </View>
                <Text style={styles.barcodeText}>*{invoiceNo}*</Text>
              </View>

              {/* Paper Footer */}
              <Text style={styles.receiptFooter}>*** THANK YOU FOR YOUR BUSINESS ***</Text>
              <Text style={styles.receiptSubFooter}>Goods once sold cannot be returned.</Text>
            </View>
          </ScrollView>

          {/* Action Buttons Bar */}
          <View style={styles.actionsBar}>
            <TouchableOpacity style={styles.printBtn} onPress={handlePrint} disabled={printing}>
              {printing ? <ActivityIndicator size="small" color="#fff" /> : (
                <>
                  <Icon name="print" size={16} color="#fff" style={{ marginRight: 4 }} />
                  <Text style={styles.printBtnText}>Thermal Print</Text>
                </>
              )}
            </TouchableOpacity>

            <TouchableOpacity style={styles.shareBtn} onPress={handleDownloadPdf} disabled={downloading}>
              {downloading ? <ActivityIndicator size="small" color={colors.ink} /> : (
                <>
                  <Icon name="Invoices" size={16} color={colors.ink} style={{ marginRight: 4 }} />
                  <Text style={styles.shareBtnText}>A4 Print / PDF</Text>
                </>
              )}
            </TouchableOpacity>

            <TouchableOpacity style={styles.shareBtn} onPress={handleShare}>
              <Icon name="share" size={16} color={colors.ink} style={{ marginRight: 4 }} />
              <Text style={styles.shareBtnText}>Share</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
              <Icon name="close" size={16} color={colors.inkMuted} style={{ marginRight: 4 }} />
              <Text style={styles.closeBtnText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  container: {
    width: '100%',
    maxHeight: '90%',
    backgroundColor: '#1E293B',
    borderRadius: 16,
    overflow: 'hidden',
  },
  headerBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#F8FAFC',
  },
  topCloseBtn: {
    padding: 4,
  },
  receiptScroll: {
    padding: 16,
    alignItems: 'center',
  },
  // Realistic Thermal Receipt Paper Styling
  paper: {
    width: '100%',
    backgroundColor: '#FFFEEA',
    borderRadius: 4,
    padding: 16,
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  shopHeader: {
    alignItems: 'center',
    marginBottom: 10,
  },
  shopTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#000',
    letterSpacing: 1.5,
  },
  shopSubtitle: {
    fontSize: 9,
    fontWeight: '700',
    color: '#444',
    letterSpacing: 1,
    marginBottom: 4,
  },
  shopInfo: {
    fontSize: 10,
    color: '#555',
    textAlign: 'center',
  },
  dividerDashed: {
    borderBottomWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#888',
    marginVertical: 8,
  },
  dividerSolid: {
    borderBottomWidth: 1,
    borderColor: '#000',
    marginVertical: 4,
  },
  metaSection: {
    marginVertical: 4,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginVertical: 2,
  },
  metaLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#444',
  },
  metaVal: {
    fontSize: 11,
    color: '#000',
  },
  metaValBold: {
    fontSize: 11,
    fontWeight: '800',
    color: '#000',
  },
  tableHeader: {
    flexDirection: 'row',
    paddingVertical: 2,
  },
  colHeader: {
    fontSize: 10,
    fontWeight: '900',
    color: '#000',
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
  },
  colBody: {
    fontSize: 11,
    color: '#222',
  },
  colBodyBold: {
    fontSize: 11,
    fontWeight: '700',
    color: '#000',
  },
  totalsSection: {
    marginVertical: 4,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginVertical: 2,
  },
  totalLabel: {
    fontSize: 11,
    color: '#444',
  },
  totalVal: {
    fontSize: 11,
    fontWeight: '600',
    color: '#000',
  },
  grandTotalRow: {
    marginTop: 6,
    paddingTop: 6,
    borderTopWidth: 1,
    borderColor: '#000',
  },
  grandLabel: {
    fontSize: 14,
    fontWeight: '900',
    color: '#000',
  },
  grandVal: {
    fontSize: 16,
    fontWeight: '900',
    color: '#000',
  },
  barcodeBox: {
    alignItems: 'center',
    marginTop: 10,
    marginBottom: 6,
  },
  barcodeLines: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  barcodeText: {
    fontSize: 10,
    fontFamily: 'monospace',
    color: '#333',
    marginTop: 2,
  },
  receiptFooter: {
    fontSize: 10,
    fontWeight: '700',
    color: '#444',
    textAlign: 'center',
    marginTop: 6,
  },
  receiptSubFooter: {
    fontSize: 9,
    color: '#666',
    textAlign: 'center',
    marginTop: 2,
  },
  actionsBar: {
    flexDirection: 'row',
    padding: 12,
    gap: 10,
    backgroundColor: '#0F172A',
  },
  printBtn: {
    flex: 1.2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.navbar,
    borderRadius: 10,
    paddingVertical: 12,
  },
  printBtnText: {
    color: colors.gold,
    fontWeight: '700',
    fontSize: 14,
  },
  shareBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.card,
    borderRadius: 10,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: colors.borderSoft,
  },
  shareBtnText: {
    color: colors.ink,
    fontWeight: '600',
    fontSize: 14,
  },
  closeBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.page,
    borderRadius: 10,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: colors.borderSoft,
  },
  closeBtnText: {
    color: colors.inkMuted,
    fontWeight: '600',
    fontSize: 14,
  },
});
