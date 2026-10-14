import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { invoicesApi } from '../api/invoices';
import { ThermalTemplate } from '../print/ThermalTemplate';
import { A4Template } from '../print/A4Template';
import '../print/print.css';

export function InvoicePrint() {
  const { id } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const format = searchParams.get('format') || 'a4';
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    invoicesApi.print(id).then(setData).catch((err) => setError(err?.response?.data?.error || 'Failed to load'));
  }, [id]);

  const whatsappHref = () => {
    if (!data) return '#';
    const phone = (data.invoice.customer_phone || '').replace(/\D/g, '');
    const text = encodeURIComponent(
      `Hi! Your invoice ${data.invoice.invoice_no || ''} from ${data.branch.print_name} — Total: Rs. ${data.invoice.grand_total}. Thank you for your business!`
    );
    return `https://wa.me/${phone ? '91' + phone : ''}?text=${text}`;
  };

  if (error) return <div className="p-6 text-red-600">{error}</div>;
  if (!data) return <div className="p-6 text-gray-500">Loading…</div>;

  return (
    <div className="min-h-screen bg-[#EDF5FF] py-6">
      <div className="no-print mx-auto mb-4 flex max-w-3xl items-center gap-2.5 rounded-2xl border border-[#D5E3F7] bg-white p-3 shadow-xs">
        <span className="text-xs font-bold uppercase tracking-wider text-slate-500 mr-1">Format:</span>
        <button
          onClick={() => setSearchParams({ format: 'thermal' })}
          className={`rounded-xl px-3.5 py-1.5 text-xs font-bold transition-all ${
            format === 'thermal'
              ? 'bg-gradient-to-r from-[#0B1B45] to-[#2449C6] text-white shadow-xs ring-1 ring-white/20'
              : 'border border-[#D5E3F7] bg-[#F8FAFD] text-slate-700 hover:bg-[#F5F8FF]'
          }`}
        >
          Thermal (80mm)
        </button>
        <button
          onClick={() => setSearchParams({ format: 'a4' })}
          className={`rounded-xl px-3.5 py-1.5 text-xs font-bold transition-all ${
            format === 'a4'
              ? 'bg-gradient-to-r from-[#0B1B45] to-[#2449C6] text-white shadow-xs ring-1 ring-white/20'
              : 'border border-[#D5E3F7] bg-[#F8FAFD] text-slate-700 hover:bg-[#F5F8FF]'
          }`}
        >
          A4 Standard
        </button>
        <button
          onClick={() => window.print()}
          className="ml-auto rounded-xl bg-gradient-to-r from-[#0B1B45] to-[#2449C6] px-4 py-1.5 text-xs font-bold text-white shadow-xs hover:shadow-md transition"
        >
          Print Invoice
        </button>
        {data.invoice.customer_phone && (
          <a
            href={whatsappHref()}
            target="_blank"
            rel="noreferrer"
            className="rounded-xl bg-emerald-600 hover:bg-emerald-500 px-4 py-1.5 text-xs font-bold text-white shadow-xs transition"
          >
            Share via WhatsApp
          </a>
        )}
      </div>

      <div className="mx-auto w-fit rounded-2xl border border-[#D5E3F7] bg-white p-6 shadow-md">
        {format === 'thermal' ? <ThermalTemplate data={data} /> : <A4Template data={data} />}
      </div>
    </div>
  );
}
