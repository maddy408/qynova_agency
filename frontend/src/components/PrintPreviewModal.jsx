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
    <div className="fixed inset-0 z-50 overflow-auto bg-black/60 backdrop-blur-xs py-6">
      <div className="no-print mx-auto mb-4 flex max-w-3xl items-center gap-3 rounded-2xl border border-[#D5E3F7] bg-white p-3.5 shadow-lg">
        <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Format:</span>
        <button
          onClick={() => setFormat('a4')}
          className={`rounded-xl px-3.5 py-1.5 text-xs font-bold transition-all ${
            format === 'a4'
              ? 'bg-gradient-to-r from-[#0B1B45] to-[#2449C6] text-white shadow-xs'
              : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
          }`}
        >
          A4 Document
        </button>
        <button
          onClick={() => setFormat('thermal')}
          className={`rounded-xl px-3.5 py-1.5 text-xs font-bold transition-all ${
            format === 'thermal'
              ? 'bg-gradient-to-r from-[#0B1B45] to-[#2449C6] text-white shadow-xs'
              : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
          }`}
        >
          Thermal (80mm)
        </button>
        <div className="ml-auto flex items-center gap-2">
          {data?.invoice?.customer_phone && (
            <a
              href={whatsappHref()}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-bold text-white shadow-xs hover:bg-emerald-700 transition"
            >
              Share via WhatsApp
            </a>
          )}
          <Button icon={<Printer size={15} />} onClick={() => window.print()}>Print</Button>
          <Button variant="secondary" icon={<X size={15} />} onClick={onClose}>Close</Button>
        </div>
      </div>

      {error && <div className="mx-auto w-fit rounded-2xl border border-rose-200 bg-white p-6 text-sm font-semibold text-rose-600 shadow-lg">{error}</div>}
      {!error && !data && <div className="mx-auto w-fit rounded-2xl border border-[#D5E3F7] bg-white p-6 text-sm font-semibold text-slate-500 shadow-lg">Loading preview…</div>}
      {data && (
        <div className="mx-auto w-fit rounded-2xl border border-[#D5E3F7] bg-white p-6 shadow-xl">
          {format === 'thermal' ? <ThermalTemplate data={data} /> : <A4Template data={data} />}
        </div>
      )}
    </div>,
    document.body
  );
}
