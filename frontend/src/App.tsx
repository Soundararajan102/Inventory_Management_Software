import { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Link, useLocation, useNavigate } from 'react-router-dom';
import { 
  LayoutDashboard, Package, ShoppingCart, Settings, Users, Truck, IndianRupee, 
  Receipt, RotateCcw, FileText, ChevronLeft, ChevronRight, Building2, ChevronDown,
  Clock, Sparkles, X, KeyRound
} from 'lucide-react';
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
import { getLicenseInfo, activateApp, type LicenseInfo } from './lib/db';
import * as OTPAuth from 'otpauth';
import { CompanyModal } from './components/CompanyModal';
import { getActiveCompany } from './lib/companies';

// Main Sidebar Component
function Sidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [showCompanyModal, setShowCompanyModal] = useState(false);
  const [activeCompany, setActiveCompany] = useState(getActiveCompany);
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
    { name: 'Parties', path: '/contacts', icon: Users, roles: ['admin', 'billing'], shortcut: '0' },
    { name: 'Settings', path: '/settings', icon: Settings, roles: ['admin'], shortcut: ',' },
  ];

  const visibleMenuItems = navItems.filter(item => user && (user.role === 'admin' || (user.permissions && user.permissions.includes(item.path))));

  const [showShortcuts, setShowShortcuts] = useState(() => {
    return localStorage.getItem('hideShortcuts') !== 'true';
  });

  useEffect(() => {
    const handleStorage = () => {
      setShowShortcuts(localStorage.getItem('hideShortcuts') !== 'true');
      setActiveCompany(getActiveCompany());
    };
    window.addEventListener('storage', handleStorage);
    window.addEventListener('preferencesUpdated', handleStorage);
    
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;

      if (e.ctrlKey) {
        if ((window as any).__isEditingActive) {
          if (e.key === '9' || visibleMenuItems.some(i => i.shortcut.toLowerCase() === e.key.toLowerCase())) {
            e.preventDefault();
            alert("You are currently editing a bill or quotation. Press 'Esc' or click the (X) close button on the edit banner to exit edit mode before switching pages.");
            return;
          }
        }

        if (e.key === '9') {
          e.preventDefault();
          if (location.pathname !== '/inventory') {
            navigate('/inventory');
            setTimeout(() => window.dispatchEvent(new CustomEvent('openAddProduct')), 150);
          } else {
            window.dispatchEvent(new CustomEvent('openAddProduct'));
          }
          return;
        }

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

        // If in a text input, don't override Left/Right (let the cursor move), and don't override Up/Down in number inputs
        if (active && active.tagName === 'INPUT') {
          const type = (active as HTMLInputElement).type;
          if (type === 'number' && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
            return;
          }
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

      {/* Tally-Style Company / Business Switcher */}
      <div className={`shrink-0 ${isExpanded ? 'px-4 pb-2' : 'px-2 pb-2'}`}>
        <button
          type="button"
          onClick={() => setShowCompanyModal(true)}
          className={`w-full flex items-center justify-between border border-hairline rounded-lg text-ink bg-canvas hover:bg-surface-soft transition-colors shadow-2xs group cursor-pointer ${
            isExpanded ? 'px-3 py-2 text-xs' : 'p-2 justify-center'
          }`}
          title={`Active Business: ${activeCompany.name} (Click to switch)`}
        >
          <div className="flex items-center gap-2 min-w-0">
            <Building2 className="w-3.5 h-3.5 text-primary shrink-0" />
            {isExpanded && <span className="font-semibold truncate text-[11.5px]">{activeCompany.name}</span>}
          </div>
          {isExpanded && (
            <ChevronDown className="w-3 h-3 text-muted shrink-0 group-hover:text-ink transition-colors" />
          )}
        </button>
      </div>

      <nav className="flex-1 mt-2 space-y-1 overflow-y-auto pb-4">
        {visibleMenuItems.map((item) => {
          const Icon = item.icon;
          const isActive = location.pathname === item.path;
          return (
            <Link
              key={item.name}
              to={item.path}
              onClick={(e) => {
                if ((window as any).__isEditingActive) {
                  e.preventDefault();
                  alert("You are currently editing a bill or quotation. Press 'Esc' or click the (X) close button on the edit banner to exit edit mode before switching pages.");
                  return;
                }
              }}
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

      <CompanyModal isOpen={showCompanyModal} onClose={() => setShowCompanyModal(false)} />
    </div>
  );
}

function UpgradeLicenseModal({ isOpen, onClose, onSuccess }: { isOpen: boolean; onClose: () => void; onSuccess: () => void }) {
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  if (!isOpen) return null;

  const handleUpgrade = async (e: React.FormEvent) => {
    e.preventDefault();
    if (code.length !== 6) {
      setError('Please enter the full 6-digit key.');
      return;
    }
    setError('');
    setIsLoading(true);

    try {
      const fullTotp = new OTPAuth.TOTP({
        issuer: 'Inventory Software',
        label: 'License Key',
        algorithm: 'SHA1',
        digits: 6,
        period: 30,
        secret: OTPAuth.Secret.fromBase32('JBSWY3DPEHPK3PXP')
      });

      const isFullValid = fullTotp.validate({ token: code.trim(), window: 1 });
      if (isFullValid !== null) {
        await activateApp('full');
        alert('Software successfully upgraded to Full License!');
        onSuccess();
        onClose();
      } else {
        setError('Invalid activation key. Please check the code and try again.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl p-6 max-w-sm w-full border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
        <div className="flex justify-between items-center mb-1">
          <h2 className="text-base font-bold text-slate-900">Activate Full License</h2>
          <button 
            type="button" 
            onClick={onClose} 
            className="text-slate-400 hover:text-slate-700 p-1 rounded-md hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        
        <p className="text-xs text-slate-500 mb-5 leading-relaxed">
          Enter your 6-digit key to activate the full version.
        </p>

        <form onSubmit={handleUpgrade} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Activation Key
            </label>
            <div className="relative">
              <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
                <KeyRound className="w-4 h-4" />
              </div>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                value={code}
                onChange={(e) => {
                  setError('');
                  setCode(e.target.value.replace(/\D/g, '').slice(0, 6));
                }}
                className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-300 rounded-lg text-slate-900 font-mono text-base font-semibold tracking-wider focus:bg-white focus:outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-500/15 transition-all"
                autoFocus
                required
              />
            </div>
          </div>

          {error && (
            <div className="p-2.5 bg-red-50 border border-red-200 text-red-700 text-xs font-medium rounded-lg">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-2.5 pt-3 border-t border-slate-100 mt-4">
            <button 
              type="button" 
              onClick={onClose} 
              className="px-3.5 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button 
              type="submit" 
              disabled={isLoading || code.length !== 6}
              className={`px-4 py-2 text-xs font-bold text-white rounded-lg shadow-sm transition-all cursor-pointer ${
                code.length === 6 && !isLoading
                  ? 'bg-blue-600 hover:bg-blue-700 shadow-blue-500/20'
                  : 'bg-slate-200 text-slate-400 shadow-none cursor-not-allowed'
              }`}
            >
              {isLoading ? 'Verifying...' : 'Activate'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function MainLayout({ licenseInfo, onRefreshLicense }: { licenseInfo: LicenseInfo | null; onRefreshLicense: () => void }) {
  const { user, isLoading } = useAuth();
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);

  if (isLoading) {
    return <div className="flex h-screen items-center justify-center bg-slate-50 text-slate-500">Loading...</div>;
  }

  if (!user) {
    return <Login />;
  }

  return (
    <div className="flex h-screen bg-canvas font-sans overflow-hidden text-body flex-col">
      {licenseInfo?.isTrial && (
        <div className="bg-amber-400 text-slate-950 font-medium px-4 py-2 flex items-center justify-between text-xs shadow-xs border-b border-amber-500 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-5 h-5 rounded-full bg-amber-950/15 flex items-center justify-center text-slate-950">
              <Clock className="w-3.5 h-3.5" />
            </div>
            <span className="text-slate-950 text-xs">
              <strong className="font-bold">15-Day Free Trial:</strong> {licenseInfo.daysRemaining} day{licenseInfo.daysRemaining === 1 ? '' : 's'} remaining.
            </span>
          </div>
          <button
            type="button"
            onClick={() => setShowUpgradeModal(true)}
            className="bg-slate-950 hover:bg-slate-800 text-white font-bold px-3 py-1 rounded-md text-[11px] shadow-sm transition-all cursor-pointer flex items-center gap-1.5 active:scale-95"
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            <span>Upgrade to Full License</span>
          </button>
        </div>
      )}
      <div className="flex flex-1 overflow-hidden">
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

      <UpgradeLicenseModal
        isOpen={showUpgradeModal}
        onClose={() => setShowUpgradeModal(false)}
        onSuccess={onRefreshLicense}
      />
    </div>
  );
}

function App() {
  const [activated, setActivated] = useState<boolean | null>(null);
  const [licenseInfo, setLicenseInfo] = useState<LicenseInfo | null>(null);

  const checkLicense = () => {
    getLicenseInfo().then(info => {
      setLicenseInfo(info);
      setActivated(info.isActivated);
    });
  };

  useEffect(() => {
    checkLicense();
  }, []);

  if (activated === null) return <div className="flex h-screen items-center justify-center bg-slate-900 text-slate-500">Checking License...</div>;

  if (!activated) {
    return <Activation onActivated={checkLicense} />;
  }

  return (
    <AuthProvider>
      <Router>
        <MainLayout licenseInfo={licenseInfo} onRefreshLicense={checkLicense} />
      </Router>
    </AuthProvider>
  );
}

export default App;
