const VARIANT_CLASSES = {
  gst: 'bg-emerald-50 text-emerald-700 border border-emerald-200/80 font-bold',
  success: 'bg-emerald-50 text-emerald-700 border border-emerald-200/80 font-bold',
  'non-gst': 'bg-rose-50 text-rose-700 border border-rose-200/80 font-bold',
  warning: 'bg-amber-50 text-amber-800 border border-amber-200 font-bold',
  danger: 'bg-rose-50 text-rose-600 border border-rose-200 font-bold',
  'out-of-stock': 'bg-gradient-to-r from-rose-500 to-rose-600 text-white shadow-xs font-bold',
  neutral: 'bg-[#EDF5FF] text-[#142B5C] border border-[#D5E3F7] font-semibold',
  gold: 'bg-[#FFF9EB] text-[#B45309] border border-[#FDE68A] font-bold',
};

/** Small rounded status/type pill — GST vs Non-GST, payment status, active/inactive, etc. */
export function Badge({ variant = 'neutral', children, className = '' }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-bold tracking-tight ${VARIANT_CLASSES[variant] || VARIANT_CLASSES.neutral} ${className}`}>
      {children}
    </span>
  );
}

