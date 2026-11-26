/** Columns summed for a report's Grand Total row / right-aligned in tables — shared with ReportsScreen.jsx. */
export const NUMERIC_REPORT_KEYS = new Set([
  'quantity', 'gross_sales', 'discount', 'gst', 'net_sales', 'total_bills', 'total_items', 'bills', 'items', 'items_sold', 'customers',
  'qty', 'cost_price', 'cost_amount', 'selling_price', 'gross_amount', 'net_amount',
  'invoice_paid_amount', 'invoice_credit_amount', 'profit_loss',
]);

/**
 * Builds a printable report HTML page — title, applied filters, generated
 * timestamp, a data table, and a grand-total row — for any {columns, rows}
 * shape ReportsController::output() returns. Shared by every report's PDF
 * export (full-filtered or selected-only) so formatting stays consistent.
 *
 * Accepts columns as an object { [key]: header } OR as an array [{ key, header }].
 * Accepts rows as an array (or fallback to data array).
 */
export function buildReportHtml({ title, filtersText, columns = {}, rows, data, totalsRow }) {
  let keys = [];
  let headers = [];

  if (Array.isArray(columns)) {
    keys = columns.map((c) => (typeof c === 'string' ? c : c.key || c.dataIndex || c.id || ''));
    headers = columns.map((c) => (typeof c === 'string' ? c : c.header || c.title || c.label || c.name || c.key || ''));
  } else if (columns && typeof columns === 'object') {
    keys = Object.keys(columns);
    headers = Object.values(columns);
  }

  const rowList = Array.isArray(rows) ? rows : (Array.isArray(data) ? data : []);

  const rowHtml = rowList
    .map(
      (r) =>
        `<tr>${keys.map((k) => `<td class="${NUMERIC_REPORT_KEYS.has(k) ? 'num' : ''}">${r[k] ?? ''}</td>`).join('')}</tr>`
    )
    .join('');

  let firstTextColumnUsed = false;
  const totalsHtml = totalsRow
    ? `<tr class="totals">${keys.map((k) => {
        if (!NUMERIC_REPORT_KEYS.has(k)) {
          const label = !firstTextColumnUsed ? 'Grand Total' : '';
          firstTextColumnUsed = true;
          return `<td>${label}</td>`;
        }
        return `<td class="num">${totalsRow[k] ?? ''}</td>`;
      }).join('')}</tr>`
    : '';

  return `
  <html>
  <head>
    <meta charset="utf-8" />
    <style>
      @page { size: landscape; margin: 24px; }
      body { font-family: Helvetica, Arial, sans-serif; color: #1a1a1a; font-size: 11px; }
      h1 { font-size: 16px; margin: 0 0 4px; }
      .meta { color: #555; font-size: 10px; margin-bottom: 4px; }
      table { width: 100%; border-collapse: collapse; margin-top: 10px; }
      th, td { border: 1px solid #ddd; padding: 5px 7px; text-align: left; word-break: break-word; }
      th { background: #f0f0f0; font-weight: 700; }
      td.num, th.num { text-align: right; }
      tr.totals td { font-weight: 700; background: #fafafa; border-top: 2px solid #333; }
    </style>
  </head>
  <body>
    <h1>${title}</h1>
    <div class="meta">Filters: ${filtersText || 'None'}</div>
    <div class="meta">Generated: ${new Date().toLocaleString()}</div>
    <table>
      <thead><tr>${headers.map((h, i) => `<th class="${NUMERIC_REPORT_KEYS.has(keys[i]) ? 'num' : ''}">${h}</th>`).join('')}</tr></thead>
      <tbody>${rowHtml}${totalsHtml}</tbody>
    </table>
  </body>
  </html>`;
}
