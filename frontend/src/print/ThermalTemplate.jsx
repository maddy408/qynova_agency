export function ThermalTemplate({ data }) {
  const { invoice, branch, tax_slabs: taxSlabs, amount_in_words: amountInWords, customer_outstanding: outstanding } = data;
  const isGst = invoice.bill_type !== 'non_gst';

  return (
    <div className="thermal-invoice">
      <div style={{ textAlign: 'center' }}>
        <strong>{branch.print_name}</strong>
        <div>{branch.address_line1}, {branch.city}</div>
        <div>Ph: {branch.phone}</div>
        {branch.gstin && <div>GSTIN: {branch.gstin}</div>}
      </div>
      <hr />
      <div>Bill No: {invoice.invoice_no || 'HELD'}</div>
      {invoice.price_type && invoice.price_type !== 'normal' && (
        <div style={{ fontWeight: 'bold' }}>{invoice.price_type === 'wholesale' ? 'WHOLESALE PRICING' : 'RETAIL PRICING'}</div>
      )}
      <div>Date: {invoice.invoice_date} {invoice.vehicle_no ? `Veh: ${invoice.vehicle_no}` : ''}</div>
      <div>Customer: {invoice.customer_name || 'Walk-in'}</div>
      <hr />
      <table>
        <thead>
          <tr>
            <td>Item</td>
            <td>Qty</td>
            <td>NET RATE</td>
            <td style={{ textAlign: 'right' }}>NET AMT</td>
          </tr>
        </thead>
        <tbody>
          {invoice.items.map((item) => (
            <tr key={item.id}>
              <td colSpan={4}>{item.item_name_snapshot}{item.free_qty > 0 ? ` (+${item.free_qty} free)` : ''}</td>
            </tr>
          ))}
          {invoice.items.map((item) => (
            <tr key={`amt-${item.id}`}>
              <td></td>
              <td>{item.qty} {item.unit_code}</td>
              <td>{item.rate}</td>
              <td style={{ textAlign: 'right' }}>{item.net_amount ?? item.line_total}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <hr />
      {isGst && taxSlabs.map((slab) => (
        <div key={slab.gst_percent} style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>GST {slab.gst_percent}% (CGST {slab.cgst} + SGST {slab.sgst})</span>
        </div>
      ))}
      {isGst && <hr />}
      {invoice.subtotal && (
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>Subtotal</span><span>Rs. {Number(invoice.subtotal).toFixed(2)}</span>
        </div>
      )}
      {Number(invoice.discount_amount || 0) > 0 && (
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>Discount</span><span>- Rs. {Number(invoice.discount_amount).toFixed(2)}</span>
        </div>
      )}
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <span>Taxable</span><span>Rs. {Number(invoice.taxable_value || 0).toFixed(2)}</span>
      </div>
      {isGst && Number(invoice.cgst_amount || 0) > 0 && (
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>CGST</span><span>Rs. {Number(invoice.cgst_amount).toFixed(2)}</span>
        </div>
      )}
      {isGst && Number(invoice.sgst_amount || 0) > 0 && (
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>SGST</span><span>Rs. {Number(invoice.sgst_amount).toFixed(2)}</span>
        </div>
      )}
      {isGst && Number(invoice.igst_amount || 0) > 0 && (
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>IGST</span><span>Rs. {Number(invoice.igst_amount).toFixed(2)}</span>
        </div>
      )}
      {isGst && !invoice.cgst_amount && !invoice.sgst_amount && !invoice.igst_amount && invoice.tax_amount && Number(invoice.tax_amount) > 0 && (
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>Tax</span><span>Rs. {Number(invoice.tax_amount).toFixed(2)}</span>
        </div>
      )}
      {Number(invoice.cess_amount || 0) > 0 && (
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>Cess</span><span>Rs. {Number(invoice.cess_amount).toFixed(2)}</span>
        </div>
      )}
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <span>Round off</span><span>{invoice.round_off}</span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold' }}>
        <span>NET TOTAL</span><span>Rs. {invoice.grand_total}</span>
      </div>
      <hr />
      <div>{amountInWords}</div>
      {outstanding !== null && outstanding !== undefined && (
        <div>Outstanding balance: Rs. {outstanding}</div>
      )}
      {(data.print_settings?.bank_name || data.print_settings?.bank_account_no) && (
        <div style={{ marginTop: 4 }}>
          Bank: {data.print_settings.bank_name || ''} A/C: {data.print_settings.bank_account_no || ''}
        </div>
      )}
      {data.print_settings?.upi_id && <div>UPI ID: {data.print_settings.upi_id}</div>}
      {data.print_settings?.terms_and_conditions && (
        <div style={{ marginTop: 4, fontSize: 11 }}>{data.print_settings.terms_and_conditions}</div>
      )}
      <div style={{ textAlign: 'center', marginTop: 6, fontWeight: 'bold' }}>
        {data.print_settings?.invoice_footer_note || 'Thank you, visit again!'}
      </div>
    </div>
  );
}
