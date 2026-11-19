import { useState, useEffect } from 'react';
import { Keyboard, ArrowLeft, X, ShoppingCart, Compass } from 'lucide-react';

const GENERAL_NAVIGATION_SHORTCUTS = [
  {
    keys: ['Esc'],
    desc: 'Close popup / Go back',
    descTa: 'பாப்அப் மூட / பின்செல்ல',
  },
  {
    keys: ['Enter'],
    desc: 'Next field / Submit',
    descTa: 'அடுத்த புலம் / சமர்ப்பிக்க',
  },
  {
    keys: ['↑', '↓'],
    desc: 'Move up / down',
    descTa: 'மேலும் / கீழும் செல்ல',
  },
  {
    keys: ['←', '→'],
    desc: 'Switch tabs / Sideways',
    descTa: 'தாவல்கள் / பக்கவாட்டில் மாற',
  },
];

const POS_BILLING_SHORTCUTS = [
  {
    keys: ['F6', 'Ctrl + S'],
    desc: 'Save bill / Proceed to pay',
    descTa: 'பில் சேமிக்க / கட்டணம் தொடர',
  },
  {
    keys: ['Enter'],
    desc: 'Add product / Select',
    descTa: 'பொருள் சேர்க்க / தேர்வு செய்க',
  },
  {
    keys: ['Tab'],
    desc: 'Jump to cart table',
    descTa: 'கார்ட் அட்டவணைக்கு செல்ல',
  },
  {
    keys: ['↑', '↓'],
    desc: 'Move rows / items',
    descTa: 'வரிசைகள் / பொருட்களில் நகர',
  },
  {
    keys: ['←', '→'],
    desc: 'Switch cell / Payment',
    descTa: 'செல் / கட்டண முறைக்கு மாற',
  },
  {
    keys: ['Esc'],
    desc: 'Cancel / Return to POS',
    descTa: 'ரத்து / POS-க்கு திரும்ப',
  },
];

export function KeyboardShortcutsModal({ isOpen, onClose }) {
  const [lang, setLang] = useState('en'); // 'en' | 'ta'

  // Pressing Escape closes the full-screen view and returns to POS
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex flex-col bg-[#F4F7FC] animate-in fade-in duration-150 select-none overflow-hidden font-sans"
    >
      {/* Top Header Card Container */}
      <div className="w-full px-4 sm:px-8 pt-4 pb-2 shrink-0">
        <header className="flex h-14 w-full items-center justify-between rounded-2xl border border-[#CBD5E1] bg-white px-4 sm:px-6 shadow-sm">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-xl border border-[#CBD5E1] bg-white text-[#0B1B45] hover:bg-[#EFF6FF] hover:border-[#2449C6] transition-all cursor-pointer shadow-xs active:scale-95"
              title="Return to POS (Esc)"
            >
              <ArrowLeft size={16} />
            </button>
            <div className="flex items-center gap-2.5">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#EFF6FF] text-[#2449C6] border border-[#BFDBFE]">
                <Keyboard size={15} />
              </div>
              <h1 className="text-sm sm:text-base font-extrabold text-[#0B1B45] tracking-tight">
                Keyboard Shortcuts
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Language Toggle: Tamil / English */}
            <div className="flex overflow-hidden rounded-xl border border-[#CBD5E1] bg-[#F1F5F9] p-0.5 text-xs font-bold">
              <button
                type="button"
                onClick={() => setLang('ta')}
                className={`px-3 py-1 rounded-lg transition-all ${
                  lang === 'ta'
                    ? 'bg-[#0B1B45] text-white shadow-xs'
                    : 'text-[#475569] hover:text-[#0B1B45]'
                }`}
              >
                தமிழ்
              </button>
              <button
                type="button"
                onClick={() => setLang('en')}
                className={`px-3 py-1 rounded-lg transition-all ${
                  lang === 'en'
                    ? 'bg-[#0B1B45] text-white shadow-xs'
                    : 'text-[#475569] hover:text-[#0B1B45]'
                }`}
              >
                English
              </button>
            </div>

            {/* Close Button */}
            <button
              type="button"
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-xl border border-[#CBD5E1] bg-white text-[#64748B] hover:text-[#0B1B45] hover:border-[#2449C6] transition-all cursor-pointer shadow-xs active:scale-95"
              title="Close (Esc)"
            >
              <X size={16} />
            </button>
          </div>
        </header>
      </div>

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto px-4 sm:px-8 py-3 w-full flex flex-col justify-between">
        <div className="space-y-6">
          {/* SECTION 1: General Navigation */}
          <div>
            {/* Section Header */}
            <div className="flex items-center gap-2 mb-3 px-1">
              <div className="flex h-5 w-5 items-center justify-center rounded-md bg-[#EFF6FF] text-[#2449C6]">
                <Compass size={14} />
              </div>
              <h2 className="text-xs sm:text-sm font-extrabold text-[#0B1B45] tracking-wide">
                General Navigation
              </h2>
            </div>

            {/* General Navigation Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {GENERAL_NAVIGATION_SHORTCUTS.map((item, idx) => (
                <div
                  key={idx}
                  className="flex items-center gap-3 rounded-2xl border border-[#CBD5E1] bg-white px-3.5 py-3 shadow-2xs hover:border-[#2449C6] hover:shadow-xs transition-all duration-150"
                >
                  <div className="flex items-center gap-1 shrink-0">
                    {item.keys.map((k, kIdx) => (
                      <span key={kIdx} className="flex items-center gap-1">
                        {kIdx > 0 && <span className="text-[#94A3B8] text-xs font-bold">/</span>}
                        <kbd className="inline-flex items-center justify-center min-w-[28px] h-7 px-2 rounded-lg border border-[#CBD5E1] bg-[#F8FAFC] font-mono text-xs font-bold text-[#0B1B45] shadow-3xs">
                          {k}
                        </kbd>
                      </span>
                    ))}
                  </div>
                  <span className="text-xs font-semibold text-[#334155] truncate">
                    {lang === 'ta' ? item.descTa : item.desc}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* SECTION 2: POS Billing */}
          <div>
            {/* Section Header */}
            <div className="flex items-center gap-2 mb-3 px-1">
              <div className="flex h-5 w-5 items-center justify-center rounded-md bg-[#EFF6FF] text-[#2449C6]">
                <ShoppingCart size={14} />
              </div>
              <h2 className="text-xs sm:text-sm font-extrabold text-[#0B1B45] tracking-wide">
                POS Billing
              </h2>
            </div>

            {/* POS Billing Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {POS_BILLING_SHORTCUTS.map((item, idx) => (
                <div
                  key={idx}
                  className="flex items-center gap-3 rounded-2xl border border-[#CBD5E1] bg-white px-3.5 py-3 shadow-2xs hover:border-[#2449C6] hover:shadow-xs transition-all duration-150"
                >
                  <div className="flex items-center gap-1 shrink-0">
                    {item.keys.map((k, kIdx) => (
                      <span key={kIdx} className="flex items-center gap-1">
                        {kIdx > 0 && <span className="text-[#94A3B8] text-xs font-bold">/</span>}
                        <kbd className="inline-flex items-center justify-center min-w-[28px] h-7 px-2 rounded-lg border border-[#CBD5E1] bg-[#F8FAFC] font-mono text-xs font-bold text-[#0B1B45] shadow-3xs">
                          {k}
                        </kbd>
                      </span>
                    ))}
                  </div>
                  <span className="text-xs font-semibold text-[#334155] truncate">
                    {lang === 'ta' ? item.descTa : item.desc}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer Bar matching Image 4 */}
        <footer className="mt-8 pt-3 border-t border-[#CBD5E1] flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-[#64748B] shrink-0 pb-3">
          <div className="flex items-center gap-2">
            <span className="font-bold text-[#0B1B45]">AJ Agency</span>
            <span>&bull;</span>
            <span>Distributor Billing &amp; Inventory</span>
          </div>

          <div className="flex items-center gap-4 text-xs font-medium">
            <div className="flex items-center gap-1.5 text-emerald-600 font-bold">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>Online</span>
            </div>
            <div className="flex items-center gap-1 text-[#64748B]">
              <span>Press</span>
              <kbd className="px-1.5 py-0.5 rounded border border-[#CBD5E1] bg-white font-mono text-[10px] text-[#0B1B45]">Esc</kbd>
              <span>to return</span>
            </div>
          </div>
        </footer>
      </main>
    </div>
  );
}
