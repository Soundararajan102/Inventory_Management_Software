import { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Link, useLocation, useNavigate } from 'react-router-dom';
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
import Activation from './pages/Activation';
import { AuthProvider, useAuth } from './lib/AuthContext';
import { isAppActivated } from './lib/db';

// Main Sidebar Component
function Sidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  const navItems = [
    { name: 'Dashboard', path: '/', icon: LayoutDashboard, roles: ['admin', 'billing', 'stock'], shortcut: '1' },
    { name: 'POS / Billing', path: '/pos', icon: ShoppingCart, roles: ['admin', 'billing'], shortcut: '2' },
    { name: 'Purchases', path: '/purchases', icon: Truck, roles: ['admin', 'stock'], shortcut: '3' },
    { name: 'Payments', path: '/payments', icon: IndianRupee, roles: ['admin'], shortcut: '4' },
    { name: 'Expenses', path: '/expenses', icon: Receipt, roles: ['admin'], shortcut: '5' },
    { name: 'Returns', path: '/returns', icon: RotateCcw, roles: ['admin', 'billing', 'stock'], shortcut: '6' },
    { name: 'Reports', path: '/reports', icon: FileText, roles: ['admin'], shortcut: '7' },
    { name: 'Inventory', path: '/inventory', icon: Package, roles: ['admin', 'stock'], shortcut: '8' },
    { name: 'Contacts', path: '/contacts', icon: Users, roles: ['admin', 'billing'], shortcut: '9' },
    { name: 'Staff', path: '/staff', icon: Users, roles: ['admin'], shortcut: '0' },
    { name: 'Settings (Backup)', path: '/settings', icon: Settings, roles: ['admin'], shortcut: '-' },
  ];

  const visibleMenuItems = navItems.filter(item => user && (user.role === 'admin' || (user.permissions && user.permissions.includes(item.path))));

  const [showShortcuts, setShowShortcuts] = useState(() => {
    return localStorage.getItem('hideShortcuts') !== 'true';
  });

  useEffect(() => {
    const handleStorage = () => {
      setShowShortcuts(localStorage.getItem('hideShortcuts') !== 'true');
    };
    window.addEventListener('storage', handleStorage);
    window.addEventListener('preferencesUpdated', handleStorage);
    
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey) {
        const item = visibleMenuItems.find(i => i.shortcut === e.key);
        if (item) {
          e.preventDefault();
          navigate(item.path);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener('preferencesUpdated', handleStorage);
    };
  }, [navigate, visibleMenuItems]);

  return (
    <div className="w-64 bg-canvas text-body flex flex-col h-full border-r border-hairline z-10">
      <div className="p-6 shrink-0">
        <h1 className="text-2xl font-bold tracking-tight text-ink flex items-center gap-3">
          <img src="/logo.png" alt="Electro Hub Logo" className="w-8 h-8 rounded-lg shadow-sm object-cover" />
          <span className="flex flex-col gap-0 leading-tight">
            Electro<span className="text-muted text-sm font-medium">Hub</span>
          </span>
        </h1>
      </div>
      <nav className="flex-1 mt-4 space-y-1 overflow-y-auto pb-4">
        {visibleMenuItems.map((item) => {
          const Icon = item.icon;
          const isActive = location.pathname === item.path;
          return (
            <Link
              key={item.name}
              to={item.path}
              className={`group flex items-center justify-between px-4 py-3 mx-4 rounded-lg transition-all duration-200 ${isActive ? 'bg-primary text-on-primary font-medium' : 'hover:bg-surface-soft text-body font-medium'
                }`}
            >
              <div className="flex items-center">
                <Icon className={`w-5 h-5 mr-3 transition-colors ${isActive ? 'text-on-primary' : 'text-muted group-hover:text-ink'}`} />
                <span>{item.name}</span>
              </div>
              {showShortcuts && (
                <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded border opacity-60 ${isActive ? 'border-on-primary/30 text-on-primary' : 'border-hairline text-muted'}`}>
                  ^{item.shortcut}
                </span>
              )}
            </Link>
          );
        })}
      </nav>
      {user && (
        <div className="p-4 border-t border-hairline bg-surface-soft shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-on-primary font-bold uppercase mr-3">
                {user.username.charAt(0)}
              </div>
              <div>
                <p className="text-sm font-bold text-ink leading-none">{user.username}</p>
                <p className="text-xs text-muted capitalize mt-1">{user.role}</p>
              </div>
            </div>
            <button onClick={logout} className="p-2 text-muted hover:text-ink hover:bg-canvas rounded-md transition-colors border border-transparent hover:border-hairline" title="Log out">
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
    <div className="flex h-screen bg-canvas font-sans overflow-hidden text-body">
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
  const [activated, setActivated] = useState<boolean | null>(null);

  useEffect(() => {
    isAppActivated().then(setActivated);
  }, []);

  if (activated === null) return <div className="flex h-screen items-center justify-center bg-slate-900 text-slate-500">Checking License...</div>;

  if (!activated) {
    return <Activation onActivated={() => setActivated(true)} />;
  }

  return (
    <AuthProvider>
      <Router>
        <MainLayout />
      </Router>
    </AuthProvider>
  );
}

export default App;
