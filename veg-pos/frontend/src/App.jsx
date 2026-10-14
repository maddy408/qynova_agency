import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './hooks/useAuth.jsx';
import { SettingsProvider } from './hooks/useSettings.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Billing from './pages/Billing.jsx';
import Items from './pages/Items.jsx';
import Parties from './pages/Parties.jsx';
import Payments from './pages/Payments.jsx';
import Purchases from './pages/Purchases.jsx';
import Invoices from './pages/Invoices.jsx';
import Reports from './pages/Reports.jsx';
import Settings from './pages/Settings.jsx';
import PrintBill from './print/PrintBill.jsx';

export default function App() {
  return (
    <AuthProvider>
      <SettingsProvider>
        <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/print/bill/:id" element={<PrintBill />} />

            <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
            <Route path="/billing" element={<ProtectedRoute><Billing /></ProtectedRoute>} />
            <Route path="/quick-sale" element={<ProtectedRoute><Navigate to="/billing?mode=quick" replace /></ProtectedRoute>} />
            <Route path="/items" element={<ProtectedRoute><Items /></ProtectedRoute>} />
            <Route path="/parties" element={<ProtectedRoute><Parties /></ProtectedRoute>} />
            <Route path="/payments" element={<ProtectedRoute><Payments /></ProtectedRoute>} />
            <Route path="/purchases" element={<ProtectedRoute><Purchases /></ProtectedRoute>} />
            <Route path="/invoices" element={<ProtectedRoute><Invoices /></ProtectedRoute>} />
            <Route path="/reports" element={<ProtectedRoute><Reports /></ProtectedRoute>} />
            <Route path="/settings" element={<ProtectedRoute adminOnly><Settings /></ProtectedRoute>} />
            <Route path="/users" element={<ProtectedRoute adminOnly><Navigate to="/settings?tab=users" replace /></ProtectedRoute>} />
          </Routes>
        </BrowserRouter>
      </SettingsProvider>
    </AuthProvider>
  );
}
