/** Consistent white rounded card wrapper used across every panel/table/list in the app. */
export function Card({ children, className = '', title, actions }) {
  if (!title && !actions) {
    return <div className={`overflow-hidden rounded-2xl border border-[#D5E3F7] bg-white shadow-xs ${className}`}>{children}</div>;
  }
  return (
    <div className={`overflow-hidden rounded-2xl border border-[#D5E3F7] bg-white shadow-xs ${className}`}>
      {(title || actions) && (
        <div className="flex items-center justify-between border-b border-[#EAF1FA] bg-gradient-to-r from-[#F8FAFD] to-white px-5 py-3.5">
          {title && <span className="font-bold tracking-tight text-[#0B1B45] text-sm">{title}</span>}
          {actions}
        </div>
      )}
      {children}
    </div>
  );
}
