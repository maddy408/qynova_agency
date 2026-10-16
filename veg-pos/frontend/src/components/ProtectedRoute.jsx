import { Navigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth.jsx';
import TopNav from './TopNav.jsx';

export default function ProtectedRoute({ children, adminOnly = false, managerUp = false }) {
  const { user } = useAuth();

  if (!user) {
    return <Navigate to="/login" replace />;
  }
  if (adminOnly && user.role !== 'admin') {
    return <Navigate to="/" replace />;
  }
  if (managerUp && !['admin', 'manager'].includes(user.role)) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="min-h-screen flex flex-col bg-slate-100/70">
      <TopNav />
      <main className="flex-1 w-full px-2 sm:px-4 py-2.5 pb-8">{children}</main>
    </div>
  );
}
