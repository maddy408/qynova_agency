import { useState, useRef, useEffect, useMemo } from 'react';
import { Search, User, X, ChevronDown, Check, Phone } from 'lucide-react';

const PAGE_SIZE = 20;

export function CustomerSelect({
  customers = [],
  value = '',
  onChange,
  placeholder = 'Search customer by name or phone…',
  className = '',
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const [page, setPage] = useState(1);
  const wrapperRef = useRef(null);
  const inputRef = useRef(null);

  // Find currently selected customer
  const selectedCustomer = useMemo(() => {
    if (!value) return null;
    return customers.find((c) => String(c.id) === String(value)) || null;
  }, [customers, value]);

  // Sync search term with selected customer when not active/open
  useEffect(() => {
    if (!isOpen) {
      if (selectedCustomer) {
        setSearchTerm(selectedCustomer.ledger_name || selectedCustomer.name || '');
      } else {
        setSearchTerm('');
      }
    }
  }, [selectedCustomer, value, isOpen]);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Filter list based on search term
  const filteredCustomers = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return customers;

    // If search term matches selected customer's exact name, show all or filtered
    return customers.filter((c) => {
      const name = (c.ledger_name || c.name || '').toLowerCase();
      const phone = (c.phone || '').toLowerCase();
      const code = (c.code || '').toLowerCase();
      return name.includes(term) || phone.includes(term) || code.includes(term);
    });
  }, [customers, searchTerm]);

  // Reset highlight index and paging whenever the filter changes — browsing
  // the full customer list (no search term) still needs pages, not one long
  // scroll, once there are more than PAGE_SIZE of them.
  useEffect(() => {
    setHighlightedIndex(0);
    setPage(1);
  }, [searchTerm]);

  const totalPages = Math.max(1, Math.ceil(filteredCustomers.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pagedCustomers = filteredCustomers.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const handleSelect = (customer) => {
    onChange(customer ? customer.id : '');
    if (customer) {
      setSearchTerm(customer.ledger_name || customer.name || '');
    } else {
      setSearchTerm('');
    }
    setIsOpen(false);
  };

  const handleClear = (e) => {
    e.stopPropagation();
    onChange('');
    setSearchTerm('');
    setIsOpen(false);
    if (inputRef.current) {
      inputRef.current.focus();
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!isOpen) {
        setIsOpen(true);
      } else {
        setHighlightedIndex((prev) => Math.min(prev + 1, pagedCustomers.length - 1));
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (isOpen) {
        setHighlightedIndex((prev) => Math.max(prev - 1, 0));
      }
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (isOpen && pagedCustomers.length > 0) {
        const item = pagedCustomers[highlightedIndex] || pagedCustomers[0];
        if (item) {
          handleSelect(item);
        }
      } else if (!isOpen) {
        setIsOpen(true);
      }
    } else if (e.key === 'Escape') {
      setIsOpen(false);
    }
  };

  return (
    <div ref={wrapperRef} className={`relative min-w-[240px] flex-1 ${className}`}>
      <div className="relative flex items-center">
        <Search size={16} className="pointer-events-none absolute left-3.5 text-slate-400 z-10" />
        <input
          ref={inputRef}
          type="text"
          value={searchTerm}
          onClick={() => {
            setIsOpen(true);
            if (selectedCustomer && searchTerm === (selectedCustomer.ledger_name || selectedCustomer.name)) {
              inputRef.current?.select();
            }
          }}
          onFocus={() => {
            setIsOpen(true);
          }}
          onChange={(e) => {
            setSearchTerm(e.target.value);
            if (!isOpen) setIsOpen(true);
          }}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className={`h-10 pl-10 pr-9 w-full rounded-xl text-sm font-semibold border transition-all focus:outline-none focus:ring-2 focus:ring-[#2449C6]/20 focus:border-[#2449C6] shadow-2xs ${
            selectedCustomer ? 'border-[#2449C6] bg-[#EDF5FF] text-[#0B1B45]' : 'border-[#D5E3F7] bg-white text-[#0B1B45] placeholder-slate-400'
          }`}
        />

        {value ? (
          <button
            type="button"
            onClick={handleClear}
            title="Clear customer selection (revert to Walk-in)"
            className="absolute right-3 p-1 text-slate-400 hover:text-rose-600 rounded-full transition-colors"
          >
            <X size={14} />
          </button>
        ) : (
          <ChevronDown
            size={14}
            className={`absolute right-3 text-slate-400 pointer-events-none transition-transform duration-200 ${
              isOpen ? 'rotate-180' : ''
            }`}
          />
        )}
      </div>

      {isOpen && (
        <div className="absolute left-0 right-0 top-full z-40 mt-1.5 rounded-2xl border border-[#D5E3F7] bg-white shadow-xl py-1.5 overflow-hidden animate-in fade-in zoom-in-95 duration-100">
          <div className="max-h-64 overflow-y-auto">
          {filteredCustomers.length === 0 ? (
            <div className="px-4 py-4 text-xs font-medium text-slate-400 text-center">No customers found</div>
          ) : (
            pagedCustomers.map((c, index) => {
              const isSelected = String(c.id) === String(value);
              const isHighlighted = index === highlightedIndex;

              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => handleSelect(c)}
                  onMouseEnter={() => setHighlightedIndex(index)}
                  className={`flex w-full items-center justify-between px-4 py-2.5 text-left text-sm transition-colors ${
                    isHighlighted ? 'bg-[#EDF5FF] text-[#0B1B45]' : 'hover:bg-[#F8FAFD]'
                  } ${isSelected ? 'font-bold bg-[#EDF5FF] text-[#0B1B45]' : ''}`}
                >
                  <div className="flex items-center gap-2.5 truncate">
                    <User size={15} className={isSelected ? 'text-[#2449C6]' : 'text-slate-400'} />
                    <span className="truncate font-semibold text-[#0B1B45]">{c.ledger_name || c.name}</span>
                    {c.phone && (
                      <span className="flex items-center gap-1 text-xs font-normal text-slate-500">
                        <Phone size={11} />
                        {c.phone}
                      </span>
                    )}
                  </div>
                  {isSelected && <Check size={15} className="text-[#2449C6] shrink-0 ml-2" />}
                </button>
              );
            })
          )}
          </div>
          {filteredCustomers.length > PAGE_SIZE && (
            <div className="flex items-center justify-between border-t border-[#EAF1FA] bg-[#F8FAFD] px-3 py-2 text-xs">
              <button
                type="button"
                onMouseDown={(e) => { e.preventDefault(); setPage((p) => Math.max(1, p - 1)); }}
                disabled={currentPage === 1}
                className="rounded-lg px-2.5 py-1 font-semibold text-slate-600 hover:bg-white hover:shadow-2xs disabled:opacity-30"
              >
                Previous
              </button>
              <span className="text-[11px] font-medium text-slate-500">Page {currentPage} of {totalPages} · {filteredCustomers.length} customers</span>
              <button
                type="button"
                onMouseDown={(e) => { e.preventDefault(); setPage((p) => Math.min(totalPages, p + 1)); }}
                disabled={currentPage === totalPages}
                className="rounded-lg px-2.5 py-1 font-semibold text-slate-600 hover:bg-white hover:shadow-2xs disabled:opacity-30"
              >
                Next
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
