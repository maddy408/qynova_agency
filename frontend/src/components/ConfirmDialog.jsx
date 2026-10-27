import { AlertTriangle, HelpCircle, Info } from 'lucide-react';
import { Button } from './Button.jsx';

const VARIANTS = {
  danger: {
    icon: AlertTriangle,
    ring: 'border-rose-300',
    iconWrap: 'bg-rose-50 text-rose-600 ring-rose-200',
    titleColor: 'text-rose-700',
    confirmVariant: 'danger',
  },
  warning: {
    icon: AlertTriangle,
    ring: 'border-amber-300',
    iconWrap: 'bg-amber-50 text-amber-600 ring-amber-200',
    titleColor: 'text-amber-700',
    confirmVariant: 'gold',
  },
  info: {
    icon: Info,
    ring: 'border-[#D5E3F7]',
    iconWrap: 'bg-[#EDF5FF] text-[#2449C6] ring-[#D5E3F7]',
    titleColor: 'text-[#0B1B45]',
    confirmVariant: 'primary',
  },
  question: {
    icon: HelpCircle,
    ring: 'border-[#D5E3F7]',
    iconWrap: 'bg-[#EDF5FF] text-[#2449C6] ring-[#D5E3F7]',
    titleColor: 'text-[#0B1B45]',
    confirmVariant: 'primary',
  },
};

/**
 * Generic confirm/warning modal — replaces raw window.confirm()/alert() so
 * every "are you sure" / "this exceeds X" prompt in the app gets the same
 * white-background, red-accented, keyboard-reachable treatment instead of
 * each screen inventing its own. Render conditionally (`{state && <ConfirmDialog .../>}`)
 * from local state; there is no global provider/queue.
 */
export function ConfirmDialog({
  open = true,
  variant = 'warning',
  title,
  message,
  details,
  confirmLabel = 'Continue',
  cancelLabel = 'Cancel',
  onConfirm,
  onCancel,
  loading = false,
}) {
  if (!open) return null;
  const v = VARIANTS[variant] || VARIANTS.warning;
  const Icon = v.icon;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-xs p-4"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
      onKeyDown={(e) => {
        if (e.key === 'Escape') onCancel?.();
      }}
    >
      <div className={`w-full max-w-md rounded-3xl border-2 ${v.ring} bg-white shadow-2xl p-5 space-y-4`}>
        <div className="flex items-start gap-3">
          <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ring-1 ${v.iconWrap}`}>
            <Icon className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 id="confirm-dialog-title" className={`text-sm font-bold ${v.titleColor}`}>
              {title}
            </h3>
            {message && <p className="mt-1 text-sm font-medium text-slate-700 leading-relaxed">{message}</p>}
          </div>
        </div>

        {details && (
          <div className="rounded-2xl border border-[#EAF1FA] bg-[#F8FAFD] p-3 text-xs font-semibold text-slate-700 space-y-1.5 max-h-48 overflow-y-auto">
            {details}
          </div>
        )}

        <div className="flex justify-end gap-2.5 pt-1">
          <Button type="button" variant="secondary" onClick={onCancel} disabled={loading}>
            {cancelLabel}
          </Button>
          <Button type="button" variant={v.confirmVariant} onClick={onConfirm} loading={loading}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
