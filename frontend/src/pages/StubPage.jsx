export function StubPage({ title }) {
  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-[#D5E3F7] bg-white p-8 shadow-xs text-center max-w-lg mx-auto my-12">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-[#0B1B45] to-[#2449C6] text-white shadow-md shadow-[#0B1B45]/20 ring-1 ring-white/20 mb-4">
          <span className="text-lg font-bold text-[#E8C985]">AJ</span>
        </div>
        <h1 className="text-xl font-black text-[#0B1B45] mb-2">{title}</h1>
        <p className="text-xs text-slate-500 font-medium">This module is scheduled for development in a future release.</p>
      </div>
    </div>
  );
}
