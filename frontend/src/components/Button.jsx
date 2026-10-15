const VARIANT_CLASSES = {
  primary: 'bg-gradient-to-r from-[#0B1B45] to-[#2449C6] text-white hover:from-[#142B5C] hover:to-[#315BFF] shadow-xs hover:shadow disabled:opacity-40',
  secondary: 'bg-white text-[#0B1B45] border border-[#D5E3F7] hover:bg-[#F5F8FF] hover:border-[#2449C6]/40 shadow-2xs disabled:opacity-40',
  danger: 'bg-rose-50 text-rose-600 border border-rose-200/70 hover:bg-rose-100 hover:border-rose-300 disabled:opacity-40',
  ghost: 'text-slate-600 hover:text-[#0B1B45] hover:bg-slate-100/80 disabled:opacity-40',
  gold: 'bg-gradient-to-r from-[#E8C985] to-[#DFB76C] text-[#0B1B45] font-bold hover:brightness-105 shadow-xs disabled:opacity-40',
  excel: 'bg-gradient-to-r from-[#0E7A4A] via-[#0B6B40] to-[#075633] text-white border border-[#075633] hover:brightness-110 shadow-[0_2px_8px_rgba(11,107,64,0.28)] disabled:opacity-40',
};

/**
 * Shared button. `shortcut` renders a small pill (e.g. "F9") — only pass one
 * when the app genuinely wires that keyboard shortcut; never fabricate one.
 */
export function Button({
  variant = 'primary',
  size = 'md',
  icon,
  shortcut,
  className = '',
  children,
  ...props
}) {
  const sizeClasses =
    size === 'sm'
      ? 'px-2.5 py-1 text-xs font-semibold'
      : size === 'lg'
        ? 'px-4.5 py-2 text-sm font-bold'
        : 'px-3.5 py-1.5 text-sm font-bold';

  return (
    <button
      className={`inline-flex items-center justify-center gap-1.5 rounded-xl font-bold tracking-tight transition-all duration-150 active:scale-[0.98] ${sizeClasses} ${VARIANT_CLASSES[variant] || VARIANT_CLASSES.primary} ${className}`}
      {...props}
    >
      {icon}
      <span>{children}</span>
      {shortcut && (
        <span className="ml-1 rounded-md bg-black/15 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider opacity-85">{shortcut}</span>
      )}
    </button>
  );
}
