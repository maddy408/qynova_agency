import { CheckCircle2, XCircle, AlertTriangle, X } from 'lucide-react';

const VARIANTS = {
  success: { icon: CheckCircle2, ring: 'border-[#D5E3F7]', iconWrap: 'bg-emerald-50 text-emerald-600 ring-emerald-200', titleColor: 'text-[#0B1B45]' },
  error: { icon: XCircle, ring: 'border-rose-300', iconWrap: 'bg-rose-50 text-rose-600 ring-rose-200', titleColor: 'text-rose-700' },
  warning: { icon: AlertTriangle, ring: 'border-amber-300', iconWrap: 'bg-amber-50 text-amber-600 ring-amber-200', titleColor: 'text-amber-700' },
};

/**
 * Small floating toast, auto-dismissed by the caller (setTimeout clearing
 * the message state). `variant` defaults to 'success' to keep every
 * existing caller's look-and-feel unchanged; pass 'error'/'warning' for a
 * white background with the matching red/amber accent border.
 */
export function Toast({ message, onClose, variant = 'success', title }) {
  if (!message) return null;
  const v = VARIANTS[variant] || VARIANTS.success;
  const Icon = v.icon;
  return (
    <div className={`fixed right-6 top-6 z-50 flex items-start gap-3 rounded-2xl border ${v.ring} bg-white px-4 py-3 text-xs font-bold shadow-xl shadow-[#0B1B45]/10 animate-fade-in max-w-sm`}>
      <div className={`flex h-7 w-7 items-center justify-center rounded-xl ring-1 shrink-0 ${v.iconWrap}`}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="flex-1 min-w-0">
        {title && <div className={`${v.titleColor}`}>{title}</div>}
        <div className={title ? 'font-semibold text-slate-600 mt-0.5' : v.titleColor}>{message}</div>
      </div>
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          className="ml-2 rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition shrink-0"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}
