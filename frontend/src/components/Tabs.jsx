import React, { useState, useRef, useEffect, useCallback, isValidElement } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

function renderTabIcon(icon, isActive) {
  if (!icon) return null;
  if (isValidElement(icon)) {
    return icon;
  }
  if (typeof icon === 'function' || (typeof icon === 'object' && icon !== null && (icon.$$typeof || icon.render))) {
    const IconComponent = icon;
    return <IconComponent size={15} className={isActive ? 'text-[#E8C985]' : 'text-[#315BFF]'} />;
  }
  if (typeof icon === 'string' || typeof icon === 'number') {
    return <span>{icon}</span>;
  }
  return null;
}

export function Tabs({ tabs, activeKey, onTabChange }) {
  const [internalActive, setInternalActive] = useState(tabs[0]?.key);
  const currentActive = activeKey !== undefined ? activeKey : internalActive;
  const tabListRef = useRef(null);

  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const checkScroll = useCallback(() => {
    const el = tabListRef.current;
    if (!el) return;
    const { scrollLeft, scrollWidth, clientWidth } = el;
    setCanScrollLeft(scrollLeft > 2);
    setCanScrollRight(scrollLeft + clientWidth < scrollWidth - 2);
  }, []);

  useEffect(() => {
    checkScroll();
    const handleResize = () => checkScroll();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [checkScroll, tabs]);

  const handleTabClick = (key) => {
    if (onTabChange) {
      onTabChange(key);
    }
    setInternalActive(key);
  };

  const scrollByAmount = (amount) => {
    if (tabListRef.current) {
      tabListRef.current.scrollBy({ left: amount, behavior: 'smooth' });
    }
  };

  // Scroll active tab into view when changed
  useEffect(() => {
    const activeEl = tabListRef.current?.querySelector('[aria-selected="true"]');
    if (activeEl) {
      activeEl.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
    }
  }, [currentActive]);

  const activeTab = tabs.find((t) => t.key === currentActive) || tabs[0];

  return (
    <div>
      <div className="relative mb-5 group">
        {/* Left Scroll Button */}
        {canScrollLeft && (
          <button
            type="button"
            onClick={() => scrollByAmount(-240)}
            aria-label="Scroll tabs left"
            className="absolute left-0 top-1/2 -translate-y-1/2 -mt-1 z-10 flex h-7 w-7 sm:h-8 sm:w-8 items-center justify-center rounded-full bg-white text-[#0B1B45] border border-[#CBD5E1] shadow-md hover:bg-[#EEF5FF] hover:border-[#2449C6] hover:scale-105 active:scale-95 transition-all cursor-pointer"
          >
            <ChevronLeft size={16} />
          </button>
        )}

        {/* Left Gradient Fade */}
        {canScrollLeft && (
          <div className="pointer-events-none absolute left-0 top-0 bottom-2.5 w-6 sm:w-8 bg-gradient-to-r from-white via-white/80 to-transparent z-5" />
        )}

        {/* Tab List with Nav Scrollbar */}
        <div
          ref={tabListRef}
          role="tablist"
          onScroll={checkScroll}
          className="flex gap-2 overflow-x-auto border-b border-[#D5E3F7] pb-2.5 nav-scrollbar scroll-smooth"
        >
          {tabs.map((tab) => {
            const isActive = currentActive === tab.key;
            return (
              <button
                key={tab.key}
                role="tab"
                aria-selected={isActive}
                type="button"
                onClick={() => handleTabClick(tab.key)}
                className={`shrink-0 whitespace-nowrap px-4 py-2 text-xs sm:text-sm font-bold rounded-xl transition-all flex items-center gap-2 ${
                  isActive
                    ? 'bg-gradient-to-r from-[#0B1B45] via-[#142B5C] to-[#1C3675] text-white shadow-[0_2px_8px_rgba(11,27,69,0.25)]'
                    : 'bg-white text-[#64789D] border border-[#D5E3F7] hover:text-[#0F1E4A] hover:bg-[#EDF5FF] shadow-2xs'
                }`}
              >
                {renderTabIcon(tab.icon, isActive)}
                <span>{tab.label}</span>
                {tab.badge !== undefined && (
                  <span
                    className={`ml-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                      isActive ? 'bg-white/20 text-[#FFF3D8]' : 'bg-[#EEF5FF] text-[#315BFF]'
                    }`}
                  >
                    {tab.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Right Gradient Fade */}
        {canScrollRight && (
          <div className="pointer-events-none absolute right-0 top-0 bottom-2.5 w-6 sm:w-8 bg-gradient-to-l from-white via-white/80 to-transparent z-5" />
        )}

        {/* Right Scroll Button */}
        {canScrollRight && (
          <button
            type="button"
            onClick={() => scrollByAmount(240)}
            aria-label="Scroll tabs right"
            className="absolute right-0 top-1/2 -translate-y-1/2 -mt-1 z-10 flex h-7 w-7 sm:h-8 sm:w-8 items-center justify-center rounded-full bg-white text-[#0B1B45] border border-[#CBD5E1] shadow-md hover:bg-[#EEF5FF] hover:border-[#2449C6] hover:scale-105 active:scale-95 transition-all cursor-pointer"
          >
            <ChevronRight size={16} />
          </button>
        )}
      </div>

      {activeTab?.content}
    </div>
  );
}

