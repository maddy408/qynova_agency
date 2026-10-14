import { CheckCircle2, X } from 'lucide-react';

/** Small floating success toast, auto-dismissed by the caller (setTimeout clearing the message state). */
export function Toast({ message, onClose }) {
  if (!message) return null;
  return (
    <div className="fixed right-6 top-6 z-50 flex items-center gap-3 rounded-2xl border border-[#D5E3F7] bg-white px-4 py-3 text-xs font-bold text-[#0B1B45] shadow-xl shadow-[#0B1B45]/10 animate-fade-in">
      <div className="flex h-7 w-7 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 ring-1 ring-emerald-200 shrink-0">
        <CheckCircle2 className="h-4 w-4" />
      </div>
      <span>{message}</span>
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          className="ml-2 rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}
