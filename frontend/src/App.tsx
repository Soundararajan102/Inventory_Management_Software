import { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Link, useLocation, useNavigate } from 'react-router-dom';
import { LayoutDashboard, Package, ShoppingCart, Settings, Users, Truck, IndianRupee, Receipt, RotateCcw, FileText, ChevronLeft, ChevronRight } from 'lucide-react';
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
import SettingsPage from './pages/Settings';
import Activation from './pages/Activation';
import DayBook from './pages/DayBook';
import { AuthProvider, useAuth } from './lib/AuthContext';
import { isAppActivated } from './lib/db';

// Main Sidebar Component
function Sidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [isExpanded, setIsExpanded] = useState(() => {
    return localStorage.getItem('sidebarExpanded') !== 'false';
  });

  const toggleSidebar = () => {
    const newState = !isExpanded;
    setIsExpanded(newState);
    localStorage.setItem('sidebarExpanded', String(newState));
  };

  const navItems = [
    { name: 'Dashboard', path: '/', icon: LayoutDashboard, roles: ['admin', 'billing', 'stock'], shortcut: '1' },
    { name: 'Day Book', path: '/daybook', icon: FileText, roles: ['admin', 'billing'], shortcut: '2' },
    { name: 'POS / Billing', path: '/pos', icon: ShoppingCart, roles: ['admin', 'billing'], shortcut: '3' },
    { name: 'Purchases', path: '/purchases', icon: Truck, roles: ['admin', 'stock'], shortcut: '4' },
    { name: 'Payments', path: '/payments', icon: IndianRupee, roles: ['admin'], shortcut: '5' },
    { name: 'Expenses', path: '/expenses', icon: Receipt, roles: ['admin'], shortcut: '6' },
    { name: 'Returns', path: '/returns', icon: RotateCcw, roles: ['admin', 'billing', 'stock'], shortcut: '7' },
    { name: 'Reports', path: '/reports', icon: FileText, roles: ['admin'], shortcut: '8' },
    { name: 'Inventory', path: '/inventory', icon: Package, roles: ['admin', 'stock'], shortcut: '9' },
    { name: 'Contacts', path: '/contacts', icon: Users, roles: ['admin', 'billing'], shortcut: '0' },
    { name: 'Settings', path: '/settings', icon: Settings, roles: ['admin'], shortcut: ',' },
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
      if (e.defaultPrevented) return;

      if (e.ctrlKey) {
        const item = visibleMenuItems.find(i => i.shortcut.toLowerCase() === e.key.toLowerCase());
        if (item) {
          e.preventDefault();
          navigate(item.path);
        }
        return;
      }

      // GLOBAL KEYBOARD NAVIGATION
      if (['ArrowDown', 'ArrowUp', 'ArrowRight', 'ArrowLeft', 'Enter'].includes(e.key)) {
        const active = document.activeElement as HTMLElement;

        // Don't interfere if they are typing in a textarea
        if (active && active.tagName === 'TEXTAREA') return;

        // If in a text input, don't override Left/Right (let the cursor move)
        if (active && active.tagName === 'INPUT') {
          const type = (active as HTMLInputElement).type;
          if (type !== 'radio' && type !== 'checkbox' && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
             return;
          }
        }

        const focusableSelectors = 'input:not([disabled]):not([type="hidden"]), button:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabIndex="0"]';
        const elements = Array.from(document.querySelectorAll<HTMLElement>(focusableSelectors)).filter(el => {
            const rect = el.getBoundingClientRect();
            return rect.width > 0 && rect.height > 0 && window.getComputedStyle(el).visibility !== 'hidden' && window.getComputedStyle(el).display !== 'none';
        });

        if (elements.length === 0) return;

        let currentIndex = elements.indexOf(active);
        
        // If nothing is focused, start from the first element
        if (currentIndex === -1) {
           if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
               e.preventDefault();
               elements[0].focus();
           }
           return;
        }

        if (e.key === 'ArrowDown' || e.key === 'ArrowRight' || e.key === 'Enter') {
          if (e.key === 'Enter' && (active.tagName === 'BUTTON' || active.getAttribute('role') === 'button')) return; // let enter click it
          if (currentIndex < elements.length - 1) {
            e.preventDefault();
            elements[currentIndex + 1].focus();
            // Scroll into view nicely
            elements[currentIndex + 1].scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          }
        } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
          if (currentIndex > 0) {
            e.preventDefault();
            elements[currentIndex - 1].focus();
            elements[currentIndex - 1].scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          }
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
    <div className={`group bg-canvas text-body flex flex-col h-full border-r border-hairline z-10 print:hidden transition-all duration-300 relative ${isExpanded ? 'w-64' : 'w-20'}`}>
      <div className="p-4 shrink-0 flex items-center justify-between">
        <h1 className={`font-bold tracking-tight text-ink flex items-center gap-3 overflow-hidden ${!isExpanded && 'w-0 opacity-0'}`}>
          <img src="/logo.png" alt="Electro Hub Logo" className="w-8 h-8 rounded-lg shadow-sm object-cover shrink-0" />
          <span className="flex items-baseline gap-1 leading-tight whitespace-nowrap text-2xl">
            Electro<span className="text-muted text-sm font-medium">Hub</span>
          </span>
        </h1>
        {!isExpanded && (
           <img src="/logo.png" alt="Electro Hub Logo" className="w-8 h-8 rounded-lg shadow-sm object-cover shrink-0 mx-auto" />
        )}
        <button onClick={toggleSidebar} className="hidden lg:block p-1 text-muted hover:text-ink rounded-full transition-all duration-200 border border-hairline absolute -right-3 top-6 bg-canvas z-20 shadow-sm opacity-0 group-hover:opacity-100" title={isExpanded ? "Collapse Sidebar" : "Expand Sidebar"}>
          {isExpanded ? <ChevronLeft className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </button>
      </div>
      
      {/* Date Display */}
      <div className={`shrink-0 ${isExpanded ? 'px-4 pb-2' : 'px-2 pb-2'}`} title={new Date().toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'short', day: 'numeric' })}>
        <div className={`font-medium text-muted bg-surface-soft rounded-md text-center border border-hairline ${isExpanded ? 'px-3 py-2 text-xs' : 'px-1 py-2 text-[10px] leading-tight'}`}>
          {isExpanded 
            ? new Date().toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'short', day: 'numeric' })
            : new Date().toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })
          }
        </div>
      </div>

      <nav className="flex-1 mt-2 space-y-1 overflow-y-auto pb-4">
        {visibleMenuItems.map((item) => {
          const Icon = item.icon;
          const isActive = location.pathname === item.path;
          return (
            <Link
              key={item.name}
              to={item.path}
              title={!isExpanded ? item.name : undefined}
              className={`group flex items-center justify-between py-3 mx-4 rounded-lg transition-all duration-200 ${isExpanded ? 'px-4' : 'px-0 justify-center'} ${isActive ? 'bg-primary text-on-primary font-medium' : 'hover:bg-surface-soft text-body font-medium'
                }`}
            >
              <div className="flex items-center overflow-hidden">
                <Icon className={`w-5 h-5 transition-colors shrink-0 ${isExpanded ? 'mr-3' : ''} ${isActive ? 'text-on-primary' : 'text-muted group-hover:text-ink'}`} />
                <span className={`whitespace-nowrap transition-all duration-200 ${isExpanded ? 'opacity-100 w-auto' : 'opacity-0 w-0'}`}>{item.name}</span>
              </div>
              {showShortcuts && isExpanded && (
                <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded border opacity-60 shrink-0 ${isActive ? 'border-on-primary/30 text-on-primary' : 'border-hairline text-muted'}`}>
                  ^{item.shortcut}
                </span>
              )}
            </Link>
          );
        })}
      </nav>
      {user && (
        <div className={`p-4 border-t border-hairline bg-surface-soft shrink-0 flex ${isExpanded ? 'items-center justify-between' : 'justify-center'}`}>
          {isExpanded && (
            <div className="flex items-center overflow-hidden">
              <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-on-primary font-bold uppercase shrink-0 mr-3">
                {user.username.charAt(0)}
              </div>
              <div className="whitespace-nowrap">
                <p className="text-sm font-bold text-ink leading-none">{user.username}</p>
                <p className="text-xs text-muted capitalize mt-1">{user.role}</p>
              </div>
            </div>
          )}
          <button onClick={logout} className="p-2 text-muted hover:text-ink hover:bg-canvas rounded-md transition-colors border border-transparent hover:border-hairline shrink-0" title="Log out">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" x2="9" y1="12" y2="12" /></svg>
          </button>
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
          <Route path="/daybook" element={<DayBook />} />
          <Route path="/pos" element={<POS />} />
          <Route path="/purchases" element={<Purchases />} />
          <Route path="/payments" element={<Payments />} />
          <Route path="/expenses" element={<Expenses />} />
          <Route path="/returns" element={<Returns />} />
          <Route path="/reports" element={<Reports />} />
          <Route path="/inventory" element={<Inventory />} />
          <Route path="/contacts" element={<Contacts />} />
          <Route path="/settings" element={<SettingsPage />} />
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
