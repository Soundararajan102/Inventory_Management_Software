import { BrowserRouter as Router, Routes, Route, Link, useLocation } from 'react-router-dom';
import { LayoutDashboard, Package, ShoppingCart, Settings, Users, Truck, IndianRupee, Receipt, RotateCcw, FileText } from 'lucide-react';
import Dashboard from './pages/Dashboard';
import Inventory from './pages/Inventory';
import POS from './pages/POS';
import Contacts from './pages/Contacts';
import Purchases from './pages/Purchases';
import Payments from './pages/Payments';
import Expenses from './pages/Expenses';
import Returns from './pages/Returns';
import Reports from './pages/Reports';
import Login from './pages/Login';
import Staff from './pages/Staff';
import BackupRestore from './pages/BackupRestore';
import { AuthProvider, useAuth } from './lib/AuthContext';

// Main Sidebar Component
function Sidebar() {
  const location = useLocation();
  const { user, logout } = useAuth();

  const navItems = [
    { name: 'Dashboard', path: '/', icon: LayoutDashboard, roles: ['admin', 'billing', 'stock'] },
    { name: 'POS / Billing', path: '/pos', icon: ShoppingCart, roles: ['admin', 'billing'] },
    { name: 'Purchases', path: '/purchases', icon: Truck, roles: ['admin', 'stock'] },
    { name: 'Payments', path: '/payments', icon: IndianRupee, roles: ['admin'] },
    { name: 'Expenses', path: '/expenses', icon: Receipt, roles: ['admin'] },
    { name: 'Returns', path: '/returns', icon: RotateCcw, roles: ['admin', 'billing', 'stock'] },
    { name: 'Reports', path: '/reports', icon: FileText, roles: ['admin'] },
    { name: 'Inventory', path: '/inventory', icon: Package, roles: ['admin', 'stock'] },
    { name: 'Contacts', path: '/contacts', icon: Users, roles: ['admin', 'billing'] },
    { name: 'Staff', path: '/staff', icon: Users, roles: ['admin'] },
    { name: 'Settings (Backup)', path: '/settings', icon: Settings, roles: ['admin'] },
  ];

  const visibleMenuItems = navItems.filter(item => user && (user.role === 'admin' || (user.permissions && user.permissions.includes(item.path))));

  return (
    <div className="w-64 bg-slate-900 text-white flex flex-col min-h-screen border-r border-slate-800 shadow-2xl z-10">
      <div className="p-6">
        <h1 className="text-2xl font-bold tracking-tight text-blue-400 flex items-center gap-3">
          <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-lg flex items-center justify-center shadow-lg shadow-blue-500/20">
            <span className="text-white font-bold text-lg leading-none">E</span>
          </div>
          <span className="flex flex-col gap-0 leading-tight">
            Electrical<span className="text-white text-sm">Shop</span>
          </span>
        </h1>
      </div>
      <nav className="flex-1 mt-4 space-y-1">
        {visibleMenuItems.map((item) => {
          const Icon = item.icon;
          const isActive = location.pathname === item.path;
          return (
            <Link
              key={item.name}
              to={item.path}
              className={`group flex items-center px-4 py-3 mx-4 rounded-xl transition-all duration-200 ${isActive ? 'bg-blue-500/15 text-blue-400 font-semibold shadow-sm' : 'hover:bg-slate-800 text-slate-400 hover:text-slate-200 font-medium'
                }`}
            >
              <Icon className={`w-5 h-5 mr-3 transition-colors ${isActive ? 'text-blue-400' : 'text-slate-500 group-hover:text-slate-300'}`} />
              <span>{item.name}</span>
            </Link>
          );
        })}
      </nav>
      {user && (
        <div className="p-4 border-t border-slate-800 bg-slate-900/50">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center text-slate-300 font-bold uppercase mr-3 border border-slate-700">
                {user.username.charAt(0)}
              </div>
              <div>
                <p className="text-sm font-bold text-white leading-none">{user.username}</p>
                <p className="text-xs text-slate-400 capitalize mt-1">{user.role}</p>
              </div>
            </div>
            <button onClick={logout} className="p-2 text-slate-400 hover:text-red-400 hover:bg-slate-800 rounded-lg transition-colors" title="Log out">
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" x2="9" y1="12" y2="12" /></svg>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function MainLayout() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return <div className="flex h-screen items-center justify-center bg-slate-50 text-slate-500">Loading...</div>;
  }

  if (!user) {
    return <Login />;
  }

  return (
    <div className="flex h-screen bg-slate-50 font-sans overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/pos" element={<POS />} />
          <Route path="/purchases" element={<Purchases />} />
          <Route path="/payments" element={<Payments />} />
          <Route path="/expenses" element={<Expenses />} />
          <Route path="/returns" element={<Returns />} />
          <Route path="/reports" element={<Reports />} />
          <Route path="/inventory" element={<Inventory />} />
          <Route path="/contacts" element={<Contacts />} />
          <Route path="/staff" element={<Staff />} />
          <Route path="/settings" element={<BackupRestore />} />
        </Routes>
      </main>
    </div>
  );
}

function App() {
  return (
    <AuthProvider>
      <Router>
        <MainLayout />
      </Router>
    </AuthProvider>
  );
}

export default App;
