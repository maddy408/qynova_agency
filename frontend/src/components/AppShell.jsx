import { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { SideNav } from './SideNav.jsx';
import { TopHeader } from './TopHeader.jsx';
import { BillingHeader } from './BillingHeader.jsx';
import { StatusFooter } from './StatusFooter.jsx';

export function AppShell({ children }) {
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(() => {
    if (typeof window !== 'undefined' && window.innerWidth < 1024) {
      return false;
    }
    const saved = localStorage.getItem('pos_sidebar_open');
    return saved !== null ? saved === 'true' : true;
  });

  const toggleSidebar = () => {
    setSidebarOpen((prev) => {
      const next = !prev;
      localStorage.setItem('pos_sidebar_open', String(next));
      return next;
    });
  };

  const closeSidebar = () => {
    setSidebarOpen(false);
    localStorage.setItem('pos_sidebar_open', 'false');
  };

  // Close sidebar on small screens when route changes
  useEffect(() => {
    if (typeof window !== 'undefined' && window.innerWidth < 1024) {
      setSidebarOpen(false);
    }
  }, [location.pathname]);

  // Check if current route is Billing (POS)
  const isBilling = location.pathname === '/pos' || location.pathname.startsWith('/pos/');

  // If Billing: render Fullscreen POS layout without sidebar
  if (isBilling) {
    return (
      <div className="flex min-h-screen flex-col bg-[#EDF5FF] w-full overflow-x-hidden">
        <BillingHeader />
        <main className="flex-1 w-full">{children}</main>
      </div>
    );
  }

  // Regular Pages: Sidebar on the left + TopHeader + Main Content
  return (
    <div className="flex min-h-screen bg-[#F0F4FA] w-full overflow-x-hidden relative">
      {/* Side Navbar: toggles open/closed via 3-lines icon */}
      <SideNav
        isOpen={sidebarOpen}
        onToggle={toggleSidebar}
        onClose={closeSidebar}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 transition-all duration-300 ease-in-out">
        <TopHeader
          onToggleSidebar={toggleSidebar}
          sidebarOpen={sidebarOpen}
        />
        <main className="flex-1 w-full p-3 sm:p-5 lg:p-6">
          {children}
        </main>
        <StatusFooter />
      </div>
    </div>
  );
}
