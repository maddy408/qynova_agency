import { printColors } from '../theme/colors.js';

export function A4Template({ data }) {
  const { invoice, branch, tax_slabs: taxSlabs, amount_in_words: amountInWords, customer_outstanding: outstanding } = data;
  const isOutstation = invoice.invoice_format === 'outstation';
  const showFreeQtyCol = !isOutstation || (invoice.items || []).some((item) => Number(item.free_qty) > 0);
  // Non-GST bills carry tax_percent/tax_amount = 0 on every line (enforced
  // server-side in InvoiceModel::priceLine) — hide the GST-specific columns
  // and slab breakdown entirely so the customer never sees GST implied.
  const isGst = invoice.bill_type !== 'non_gst';

  return (
    <div className="a4-invoice">
      <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: `2px solid ${printColors['print-blue']}`, paddingBottom: 8 }}>
        <div>
          <div style={{ fontWeight: 'bold', fontSize: 18 }}>{branch.print_name}</div>
          <div>{branch.address_line1}, {branch.city}, {branch.state} {branch.pincode}</div>
          <div>Phone: {branch.phone} {branch.support_email ? `| ${branch.support_email}` : ''}</div>
          {branch.gstin && <div>GSTIN: {branch.gstin}</div>}
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontWeight: 'bold', fontSize: 16 }}>{isGst ? 'TAX INVOICE' : 'INVOICE (NON-GST)'}</div>
          {invoice.price_type && invoice.price_type !== 'normal' && (
            <div style={{ fontSize: 11, fontWeight: 'bold', color: printColors['print-amber'] }}>
              {invoice.price_type === 'wholesale' ? 'WHOLESALE PRICING' : 'RETAIL PRICING'}
            </div>
          )}
          <div style={{ fontWeight: 'bold', color: printColors['print-blue'] }}>BILL NO: {invoice.invoice_no || 'HELD'}</div>
          <div>DATE: {invoice.invoice_date} {invoice.vehicle_no ? `| VEHICLE NO: ${invoice.vehicle_no}` : ''}</div>
          {isOutstation && (
            <div style={{ marginTop: 4, fontSize: 10 }}>
              IRN: {invoice.irn || '-'} | Ack No: {invoice.ack_no || '-'} | Ack Date: {invoice.ack_date || '-'}
            </div>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', margin: '10px 0', border: `1px solid ${printColors['print-border']}`, padding: 8 }}>
        <div>
          <div style={{ fontWeight: 'bold' }}>TO (CUSTOMER DETAILS):</div>
          <div>{invoice.customer_name || 'Walk-in Customer'}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div>MOBILE: {invoice.customer_phone || '-'}</div>
          <div>PAYMENT: {invoice.payment_status || '-'}</div>
        </div>
      </div>

      <table>
        <thead>
          <tr>
            <th>HSN</th><th>Particulars</th><th>MRP</th><th>Qty</th><th>Unit</th>
            {showFreeQtyCol && <th>Free</th>}
            <th>NET RATE</th><th>Disc</th>
            {isGst && (<><th>GST%</th><th>GST AMT</th></>)}
            <th>NET AMT</th>
          </tr>
        </thead>
        <tbody>
          {invoice.items.map((item) => (
            <tr key={item.id}>
              <td>{item.hsn_snapshot || '-'}</td>
              <td>{item.item_name_snapshot}</td>
              <td>{item.mrp}</td>
              <td>{item.qty}</td>
              <td>{item.unit_code}</td>
              {showFreeQtyCol && <td>{item.free_qty}</td>}
              <td>{item.rate}</td>
              <td>{item.discount_amount}</td>
              {isGst && (<><td>{item.tax_percent}</td><td>{item.tax_amount}</td></>)}
              <td>{item.net_amount ?? item.line_total}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {isGst && (
        <div style={{ margin: '10px 0', border: `1px solid ${printColors['print-border']}`, padding: 8 }}>
          <div style={{ fontWeight: 'bold', marginBottom: 4 }}>TAX BREAKDOWN (GST SLABS):</div>
          <table>
            <thead>
              <tr><th>GST%</th><th>Taxable</th><th>CGST</th><th>SGST</th><th>Cess</th></tr>
            </thead>
            <tbody>
              {taxSlabs.map((slab) => (
                <tr key={slab.gst_percent}>
                  <td>{slab.gst_percent}%</td>
                  <td>{slab.taxable.toFixed(2)}</td>
                  <td>{slab.cgst.toFixed(2)}</td>
                  <td>{slab.sgst.toFixed(2)}</td>
                  <td>{slab.cess.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10 }}>
        <div style={{ width: '55%' }}>
          <div><strong>Amount in Words:</strong> {amountInWords}</div>
          {outstanding !== null && outstanding !== undefined && (
            <div style={{ marginTop: 8 }}>Customer Outstanding Balance: Rs. {outstanding}</div>
          )}
          <div style={{ marginTop: 12, fontSize: 10 }}>
            <strong>Terms &amp; Conditions:</strong>
            <ol>
              <li>Goods once sold will not be taken back.</li>
              <li>Subject to local jurisdiction.</li>
            </ol>
          </div>
        </div>
        <div className="totals-box" style={{ width: '35%' }}>
          <Row label="GROSS AMOUNT" value={invoice.subtotal} />
          <Row label="DISCOUNT" value={invoice.discount_amount} />
          {isGst && (
            <Row label="GST TAX" value={(Number(invoice.cgst_amount) + Number(invoice.sgst_amount) + Number(invoice.igst_amount)).toFixed(2)} />
          )}
          <Row label="ROUND OFF" value={invoice.round_off} />
          <Row label="NET TOTAL" value={invoice.grand_total} bold color={printColors['print-blue']} />
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 30 }}>
        <div style={{ textAlign: 'center' }}>
          <div>For: {branch.print_name}</div>
          <div style={{ marginTop: 40, borderTop: `1px solid ${printColors['print-black']}`, paddingTop: 4 }}>Authorized Signatory</div>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, bold, color }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: bold ? 'bold' : 'normal', color: color || 'inherit', fontSize: bold ? 14 : 12 }}>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}
