import { useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { X, Upload, Camera, ImageOff } from 'lucide-react';
import { itemsApi } from '../api/catalog';
import { resolveImageUrl } from '../utils/media';
import { Button } from './Button.jsx';

/**
 * "Find this item from a photo." Runs server-side OCR (if the server has an
 * OCR engine installed) and text-matches the result against the catalog —
 * this reads printed text on a label, it is not visual object recognition.
 * When no OCR engine is installed, the backend says so plainly and this
 * modal surfaces that instead of pretending a match was attempted.
 */
export function ImageSearchModal({ onClose, onAdd }) {
  const [preview, setPreview] = useState(null);
  const fileInputRef = useRef(null);
  const cameraInputRef = useRef(null);

  const searchMutation = useMutation({ mutationFn: itemsApi.imageSearch });

  const handlePick = (e) => {
    const f = e.target.files[0];
    if (!f) return;
    setPreview(URL.createObjectURL(f));
    searchMutation.mutate(f);
  };

  const result = searchMutation.data;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
      <div className="w-full max-w-md overflow-hidden rounded-3xl border border-[#D5E3F7] bg-white p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between border-b border-[#EAF1FA] pb-3">
          <div className="text-base font-bold text-[#0B1B45] tracking-tight">Find Item From Photo</div>
          <button onClick={onClose} className="rounded-xl p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition"><X size={18} /></button>
        </div>

        {!preview ? (
          <div className="flex flex-col items-center gap-3.5 rounded-2xl border-2 border-dashed border-[#D5E3F7] bg-[#F8FAFD] py-10 px-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white shadow-xs border border-[#EAF1FA] text-[#2449C6]">
              <Camera size={26} />
            </div>
            <p className="px-6 text-center text-xs font-semibold text-slate-500">Upload or capture a photo of the product's label or pack.</p>
            <div className="flex gap-2.5 pt-1">
              <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/webp" onChange={handlePick} className="hidden" />
              <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" onChange={handlePick} className="hidden" />
              <Button variant="secondary" size="sm" icon={<Upload size={14} />} onClick={() => fileInputRef.current?.click()}>Upload</Button>
              <Button variant="secondary" size="sm" icon={<Camera size={14} />} onClick={() => cameraInputRef.current?.click()}>Camera</Button>
            </div>
          </div>
        ) : (
          <>
            <div className="mb-3 flex h-40 items-center justify-center overflow-hidden rounded-2xl border border-[#D5E3F7] bg-[#F8FAFD]">
              <img src={preview} alt="" className="h-full w-full object-contain" />
            </div>

            {searchMutation.isPending && (
              <div className="flex items-center gap-2 py-2 text-xs font-bold text-[#2449C6]">
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-[#2449C6] border-t-transparent" />
                <span>Scanning image…</span>
              </div>
            )}

            {searchMutation.isError && (
              <p className="text-xs font-semibold text-rose-600">Could not process this image. Please try again or search manually.</p>
            )}

            {result && result.engine_available === false && (
              <div className="flex items-start gap-2.5 rounded-2xl bg-amber-50 p-3 text-xs font-semibold text-amber-800 border border-amber-200">
                <ImageOff size={16} className="mt-0.5 shrink-0 text-amber-600" />
                <span>{result.message}</span>
              </div>
            )}

            {result && result.engine_available && result.matches.length === 0 && (
              <p className="text-xs font-medium text-slate-500">No catalog items matched the text found in this image. Try a clearer photo of the label, or search manually.</p>
            )}

            {result && result.engine_available && result.matches.length > 0 && (
              <div className="flex flex-col gap-2">
                <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Matching products</div>
                {result.matches.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => onAdd(item)}
                    className="flex items-center gap-3 rounded-2xl border border-[#D5E3F7] p-2.5 text-left transition hover:bg-[#F5F8FF] hover:border-[#2449C6]/30"
                  >
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-[#EAF1FA] bg-[#F8FAFD]">
                      {item.image ? <img src={resolveImageUrl(item.image)} alt="" className="h-full w-full object-cover" /> : null}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-xs font-bold text-[#0B1B45]">{item.item_name}</div>
                      <div className="text-[11px] font-medium text-slate-500">{item.item_code} · <span className="font-bold text-[#0B1B45]">Rs. {item.retail_price}</span></div>
                    </div>
                    <span className="shrink-0 rounded-lg bg-gradient-to-r from-[#0B1B45] to-[#2449C6] px-2.5 py-1 text-[11px] font-bold text-white shadow-2xs">Add</span>
                  </button>
                ))}
              </div>
            )}

            <button
              onClick={() => { setPreview(null); searchMutation.reset(); }}
              className="mt-3 text-xs font-bold text-[#2449C6] hover:underline"
            >
              Try another photo
            </button>
          </>
        )}

        <div className="mt-4 flex justify-end">
          <Button variant="secondary" onClick={onClose}>Close</Button>
        </div>
      </div>
    </div>
  );
}
