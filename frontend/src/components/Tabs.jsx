import React, { useState, isValidElement } from 'react';

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

  const handleTabClick = (key) => {
    if (onTabChange) {
      onTabChange(key);
    }
    setInternalActive(key);
  };

  const activeTab = tabs.find((t) => t.key === currentActive) || tabs[0];

  return (
    <div>
      <div role="tablist" className="mb-5 flex gap-2 overflow-x-auto border-b border-[#D5E3F7] pb-2 no-scrollbar">
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
                <span className={`ml-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                  isActive ? 'bg-white/20 text-[#FFF3D8]' : 'bg-[#EEF5FF] text-[#315BFF]'
                }`}>
                  {tab.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>
      {activeTab?.content}
    </div>
  );
}

