import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { SideNav } from './SideNav.jsx';
import { TopHeader } from './TopHeader.jsx';
import { BillingHeader } from './BillingHeader.jsx';
import { StatusFooter } from './StatusFooter.jsx';

export function AppShell({ children }) {
  const location = useLocation();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

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
    <div className="flex min-h-screen bg-[#F0F4FA] w-full overflow-x-hidden">
      {/* Fixed/Sticky Left Side Navbar */}
      <SideNav mobileOpen={mobileNavOpen} onCloseMobile={() => setMobileNavOpen(false)} />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        <TopHeader onOpenMobile={() => setMobileNavOpen(true)} />
        <main className="flex-1 w-full p-3 sm:p-5 lg:p-6 max-w-[1750px] mx-auto">
          {children}
        </main>
        <StatusFooter />
      </div>
    </div>
  );
}
