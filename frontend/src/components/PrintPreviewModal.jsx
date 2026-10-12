import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Printer } from 'lucide-react';
import { invoicesApi } from '../api/invoices';
import { ThermalTemplate } from '../print/ThermalTemplate';
import { A4Template } from '../print/A4Template';
import { Button } from './Button.jsx';
import '../print/print.css';

/**
 * In-app print preview — replaces the old window.open(new tab) flow.
 * Rendered via portal directly into <body> so print.css's
 * `body.has-print-modal #root { display: none }` rule can hide the app
 * shell and print only this modal's content.
 */
export function PrintPreviewModal({ invoiceId, onClose }) {
  const [format, setFormat] = useState('a4');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    document.body.classList.add('has-print-modal');
    return () => document.body.classList.remove('has-print-modal');
  }, []);

  useEffect(() => {
    invoicesApi.print(invoiceId).then(setData).catch((err) => setError(err?.response?.data?.error || 'Failed to load'));
  }, [invoiceId]);

  const whatsappHref = () => {
    if (!data) return '#';
    const phone = (data.invoice.customer_phone || '').replace(/\D/g, '');
    const text = encodeURIComponent(
      `Hi! Your invoice ${data.invoice.invoice_no || ''} from ${data.branch.print_name} — Total: Rs. ${data.invoice.grand_total}. Thank you for your business!`
    );
    return `https://wa.me/${phone ? '91' + phone : ''}?text=${text}`;
  };

  return createPortal(
    <div className="fixed inset-0 z-50 overflow-auto bg-black/40 py-6">
      <div className="no-print mx-auto mb-4 flex max-w-3xl items-center gap-2 rounded-lg bg-white p-3 shadow-sm">
        <span className="text-sm font-medium text-gray-600">Format:</span>
        <button
          onClick={() => setFormat('a4')}
          className={`rounded px-3 py-1 text-sm ${format === 'a4' ? 'bg-navbar text-white' : 'bg-gray-100 text-gray-700'}`}
        >
          A4
        </button>
        <button
          onClick={() => setFormat('thermal')}
          className={`rounded px-3 py-1 text-sm ${format === 'thermal' ? 'bg-navbar text-white' : 'bg-gray-100 text-gray-700'}`}
        >
          Thermal (80mm)
        </button>
        <div className="ml-auto flex items-center gap-2">
          {data?.invoice?.customer_phone && (
            <a href={whatsappHref()} target="_blank" rel="noreferrer" className="rounded bg-green-600 px-3 py-1 text-sm text-white">
              Share via WhatsApp
            </a>
          )}
          <Button icon={<Printer size={14} />} onClick={() => window.print()}>Print</Button>
          <Button variant="secondary" icon={<X size={14} />} onClick={onClose}>Close</Button>
        </div>
      </div>

      {error && <div className="mx-auto w-fit rounded-lg bg-white p-6 text-red-600 shadow-sm">{error}</div>}
      {!error && !data && <div className="mx-auto w-fit rounded-lg bg-white p-6 text-gray-500 shadow-sm">Loading…</div>}
      {data && (
        <div className="mx-auto w-fit rounded-lg bg-white p-6 shadow-sm">
          {format === 'thermal' ? <ThermalTemplate data={data} /> : <A4Template data={data} />}
        </div>
      )}
    </div>,
    document.body
  );
}
