import { useState, useEffect } from 'react';
import { 
  Store, 
  Receipt, 
  Percent, 
  Boxes, 
  Users, 
  Database, 
  Sliders, 
  Upload, 
  AlertTriangle, 
  Trash2, 
  X, 
  Plus, 
  Sparkles,
  Building2,
  Phone,
  MapPin,
  CreditCard,
  Keyboard,
  ArrowRight,
  Check,
  ShieldCheck,
  Lock,
  Layers,
  CheckCircle2
} from 'lucide-react';
import { save, open, confirm } from '@tauri-apps/plugin-dialog';
import { invoke } from '@tauri-apps/api/core';
import * as OTPAuth from 'otpauth';
import Staff from './Staff';
import { wipeAllData, getDb, formatCustomBillNumber, closeDbConnection, type BillYearFormat } from '../lib/db';
import { CompanyModal } from '../components/CompanyModal';
import { 
  getCompanies, 
  getActiveCompany, 
  updateCompany, 
  createCompany, 
  deleteCompany, 
  switchCompany, 
  prepareFullBackupMetadata,
  restoreFullBackupMetadata,
  type Company 
} from '../lib/companies';
import { useAuth } from '../lib/AuthContext';

type SettingsTab = 'shop' | 'companies' | 'billing' | 'taxes' | 'inventory' | 'staff' | 'backup' | 'interface';

interface CategoryItem {
  id: SettingsTab;
  label: string;
  desc: string;
  icon: any;
}

const CATEGORIES: CategoryItem[] = [
  { id: 'shop', label: 'Store & Branding', desc: 'Shop details, contact & GSTIN', icon: Store },
  { id: 'companies', label: 'Company Management', desc: 'Create & manage independent company databases', icon: Building2 },
  { id: 'billing', label: 'Bill & Invoicing', desc: 'Invoice format, prefix & counters', icon: Receipt },
  { id: 'taxes', label: 'Taxes & GST', desc: 'Sales, purchase tax & profit rules', icon: Percent },
  { id: 'inventory', label: 'Inventory & Units', desc: 'Stock alerts & unit measurements', icon: Boxes },
  { id: 'staff', label: 'Staff Management', desc: 'Team accounts & cashier access', icon: Users },
  { id: 'backup', label: 'Backup & Recovery', desc: 'Database export, restore & reset', icon: Database },
  { id: 'interface', label: 'Interface & Shortcuts', desc: 'Navigation hints & hotkeys', icon: Sliders },
];

export default function Settings() {
  const [activeTab, setActiveTab] = useState<SettingsTab>('shop');
  const [status, setStatus] = useState<{ type: 'success' | 'error', message: string } | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  
  // Wipe Modal State
  const [showWipeModal, setShowWipeModal] = useState(false);
  const [wipeCode, setWipeCode] = useState('');
  const [wipeError, setWipeError] = useState('');

  const [showCompanyModal, setShowCompanyModal] = useState(false);
  const [activeCompany, setActiveCompany] = useState<Company>(getActiveCompany);

  const auth = useAuth();
  const user = auth?.user;
  const isMasterAdmin = Boolean(user && user.role === 'admin' && activeCompany.id === 'comp_default');

  // Company Management Tab State
  const [companiesList, setCompaniesList] = useState<Company[]>(getCompanies);
  const [showCreateCompanyCard, setShowCreateCompanyCard] = useState(false);
  const [newCompName, setNewCompName] = useState('');
  const [isSubmittingComp, setIsSubmittingComp] = useState(false);

  const refreshCompanies = () => {
    setCompaniesList(getCompanies());
    setActiveCompany(getActiveCompany());
  };

  const handleCreateCompanySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCompName.trim()) {
      setStatus({ type: 'error', message: 'Please enter a Company / Shop Name.' });
      return;
    }
    setIsSubmittingComp(true);
    try {
      const created = createCompany({
        name: newCompName.trim()
      });
      refreshCompanies();
      setNewCompName('');
      setShowCreateCompanyCard(false);
      setStatus({
        type: 'success',
        message: `Company "${created.name}" created successfully! Switch to it anytime to configure its details in Store & Branding.`
      });
    } catch (err) {
      setStatus({ type: 'error', message: 'Failed to create company: ' + err });
    } finally {
      setIsSubmittingComp(false);
    }
  };

  const handleDeleteCompanyClick = async (comp: Company) => {
    if (comp.id === 'comp_default') {
      alert('The primary / default company cannot be deleted.');
      return;
    }
    const ok = await confirm(
      `Are you sure you want to remove "${comp.name}"?\n\nIts independent data file will be detached.`,
      { title: 'Delete Business Profile', kind: 'warning' }
    );
    if (!ok) return;

    deleteCompany(comp.id);
    refreshCompanies();
    setStatus({ type: 'success', message: `Company "${comp.name}" removed.` });
  };

  // Shop Profile State
  const [shopName, setShopName] = useState(() => localStorage.getItem('shopName') || 'Electro Hub');
  const [shopAddress, setShopAddress] = useState(() => localStorage.getItem('shopAddress') || '123 Market Street, City');
  const [shopPhone, setShopPhone] = useState(() => localStorage.getItem('shopPhone') || '+91 9876543210');
  const [shopGSTIN, setShopGSTIN] = useState(() => (localStorage.getItem('shopGSTIN') || '27XXXXX1234X1X1').toUpperCase());

  const updateShopDetail = (key: string, value: string, setter: React.Dispatch<React.SetStateAction<string>>) => {
    const finalVal = key === 'shopGSTIN' ? value.toUpperCase() : value;
    setter(finalVal);
    localStorage.setItem(key, finalVal);
    try {
      if (key === 'shopName') {
        updateCompany(activeCompany.id, { name: finalVal, shopName: finalVal });
        refreshCompanies();
      } else {
        updateCompany(activeCompany.id, { [key]: finalVal });
      }
    } catch (e) {}
    window.dispatchEvent(new Event('preferencesUpdated'));
  };

  // Bill Format State
  const [billPrefix, setBillPrefix] = useState(() => localStorage.getItem('billPrefix') ?? '');
  const [billQuotationPrefix, setBillQuotationPrefix] = useState(() => localStorage.getItem('billQuotationPrefix') ?? 'QT');
  const [billYearFormat, setBillYearFormat] = useState<BillYearFormat>(() => {
    return (localStorage.getItem('billYearFormat') as BillYearFormat) || '2digit';
  });
  const [billSeparator, setBillSeparator] = useState(() => localStorage.getItem('billSeparator') ?? '-');
  const [billPadding, setBillPadding] = useState(() => Number(localStorage.getItem('billPadding') || 0));
  const [billNextNumber, setBillNextNumber] = useState(() => localStorage.getItem('billNextNumber') ?? '');
  const [maxSalesId, setMaxSalesId] = useState<number>(0);

  useEffect(() => {
    async function loadMaxId() {
      try {
        const db = await getDb();
        const res = await db.select<{ max_id: number }[]>('SELECT MAX(id) as max_id FROM sales');
        if (res && res.length > 0 && res[0].max_id) {
          setMaxSalesId(res[0].max_id);
        }
      } catch (e) {
        console.error('Failed to load max sales id:', e);
      }
    }
    loadMaxId();
  }, []);

  const handleBillFormatChange = (key: string, val: any) => {
    if (key === 'billPrefix') setBillPrefix(val);
    if (key === 'billQuotationPrefix') setBillQuotationPrefix(val);
    if (key === 'billYearFormat') setBillYearFormat(val);
    if (key === 'billSeparator') setBillSeparator(val);
    if (key === 'billPadding') setBillPadding(val);
    if (key === 'billNextNumber') setBillNextNumber(val);

    if (val === '' && (key === 'billNextNumber' || key === 'billPrefix')) {
      if (key === 'billNextNumber') {
        localStorage.removeItem(key);
      } else {
        localStorage.setItem(key, '');
      }
    } else {
      localStorage.setItem(key, String(val));
    }
    window.dispatchEvent(new Event('preferencesUpdated'));
  };

  const applyPreset = (preset: 'gst' | 'shop' | 'counter' | 'default') => {
    if (preset === 'gst') {
      setBillPrefix('INV');
      setBillQuotationPrefix('QT');
      setBillYearFormat('fy_short');
      setBillSeparator('/');
      setBillPadding(4);
      localStorage.setItem('billPrefix', 'INV');
      localStorage.setItem('billQuotationPrefix', 'QT');
      localStorage.setItem('billYearFormat', 'fy_short');
      localStorage.setItem('billSeparator', '/');
      localStorage.setItem('billPadding', '4');
    } else if (preset === 'shop') {
      setBillPrefix('EH');
      setBillQuotationPrefix('QT');
      setBillYearFormat('4digit');
      setBillSeparator('-');
      setBillPadding(3);
      localStorage.setItem('billPrefix', 'EH');
      localStorage.setItem('billQuotationPrefix', 'QT');
      localStorage.setItem('billYearFormat', '4digit');
      localStorage.setItem('billSeparator', '-');
      localStorage.setItem('billPadding', '3');
    } else if (preset === 'counter') {
      setBillPrefix('INV');
      setBillQuotationPrefix('QT');
      setBillYearFormat('none');
      setBillSeparator('-');
      setBillPadding(4);
      localStorage.setItem('billPrefix', 'INV');
      localStorage.setItem('billQuotationPrefix', 'QT');
      localStorage.setItem('billYearFormat', 'none');
      localStorage.setItem('billSeparator', '-');
      localStorage.setItem('billPadding', '4');
    } else if (preset === 'default') {
      setBillPrefix('');
      setBillQuotationPrefix('QT');
      setBillYearFormat('2digit');
      setBillSeparator('-');
      setBillPadding(0);
      localStorage.setItem('billPrefix', '');
      localStorage.setItem('billQuotationPrefix', 'QT');
      localStorage.setItem('billYearFormat', '2digit');
      localStorage.setItem('billSeparator', '-');
      localStorage.setItem('billPadding', '0');
    }
    window.dispatchEvent(new Event('preferencesUpdated'));
  };

  const currentSeq = billNextNumber && !isNaN(Number(billNextNumber)) && Number(billNextNumber) > 0
    ? Number(billNextNumber)
    : (maxSalesId + 1);

  const previewBillNo = formatCustomBillNumber(
    billPrefix,
    currentSeq,
    billYearFormat,
    billSeparator,
    billPadding,
    new Date()
  );

  const previewQuotationNo = formatCustomBillNumber(
    billQuotationPrefix,
    1,
    billYearFormat,
    billSeparator,
    billPadding,
    new Date()
  );

  // Tax Settings State
  const [enableSalesGST, setEnableSalesGST] = useState(() => {
    const val = localStorage.getItem('enableSalesGST');
    if (val !== null) return val !== 'false';
    return localStorage.getItem('enableGST') !== 'false';
  });
  const [salesTaxMethod, setSalesTaxMethod] = useState<'exclusive' | 'inclusive'>(() => {
    const val = localStorage.getItem('salesTaxMethod') as 'exclusive' | 'inclusive';
    if (val) return val;
    return (localStorage.getItem('taxMethod') as 'exclusive' | 'inclusive') || 'exclusive';
  });

  const [enablePurchaseGST, setEnablePurchaseGST] = useState(() => {
    const val = localStorage.getItem('enablePurchaseGST');
    if (val !== null) return val !== 'false';
    return localStorage.getItem('enableGST') !== 'false';
  });
  const [purchaseTaxMethod, setPurchaseTaxMethod] = useState<'exclusive' | 'inclusive'>(() => {
    const val = localStorage.getItem('purchaseTaxMethod') as 'exclusive' | 'inclusive';
    if (val) return val;
    return (localStorage.getItem('taxMethod') as 'exclusive' | 'inclusive') || 'exclusive';
  });

  const [profitTaxMode, setProfitTaxMode] = useState<'with_gst' | 'without_gst'>(() => {
    return (localStorage.getItem('profitTaxMode') as 'with_gst' | 'without_gst') || 'with_gst';
  });

  const toggleSalesGST = () => {
    const newValue = !enableSalesGST;
    setEnableSalesGST(newValue);
    localStorage.setItem('enableSalesGST', newValue ? 'true' : 'false');
    window.dispatchEvent(new Event('preferencesUpdated'));
  };

  const setSalesTaxMethodExplicit = (method: 'exclusive' | 'inclusive') => {
    setSalesTaxMethod(method);
    localStorage.setItem('salesTaxMethod', method);
    window.dispatchEvent(new Event('preferencesUpdated'));
  };

  const togglePurchaseGST = () => {
    const newValue = !enablePurchaseGST;
    setEnablePurchaseGST(newValue);
    localStorage.setItem('enablePurchaseGST', newValue ? 'true' : 'false');
    window.dispatchEvent(new Event('preferencesUpdated'));
  };

  const setPurchaseTaxMethodExplicit = (method: 'exclusive' | 'inclusive') => {
    setPurchaseTaxMethod(method);
    localStorage.setItem('purchaseTaxMethod', method);
    window.dispatchEvent(new Event('preferencesUpdated'));
  };

  const toggleProfitTaxMode = (mode: 'with_gst' | 'without_gst') => {
    setProfitTaxMode(mode);
    localStorage.setItem('profitTaxMode', mode);
    window.dispatchEvent(new Event('preferencesUpdated'));
  };

  // Inventory & Stock State
  const [lowStockThreshold, setLowStockThreshold] = useState(() => {
    return localStorage.getItem('lowStockThreshold') || '10';
  });

  const handleLowStockChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.replace(/\D/g, '');
    setLowStockThreshold(val);
    localStorage.setItem('lowStockThreshold', val || '0');
    window.dispatchEvent(new Event('preferencesUpdated'));
  };

  const [customUnits, setCustomUnits] = useState<string[]>(() => {
    const saved = localStorage.getItem('customUnits');
    return saved ? JSON.parse(saved) : ['Piece', 'Box', 'Meter', 'Roll'];
  });
  const [newUnit, setNewUnit] = useState('');
  const [showUnitModal, setShowUnitModal] = useState(false);

  const addUnit = () => {
    if (newUnit.trim() && !customUnits.includes(newUnit.trim())) {
      const updated = [...customUnits, newUnit.trim()];
      setCustomUnits(updated);
      localStorage.setItem('customUnits', JSON.stringify(updated));
      window.dispatchEvent(new Event('preferencesUpdated'));
      setNewUnit('');
    }
  };

  const removeUnit = async (unitToRemove: string) => {
    const isConfirmed = await confirm(`Are you sure you want to delete the unit type "${unitToRemove}"?`, {
      title: 'Confirm Deletion',
      kind: 'warning'
    });
    
    if (isConfirmed) {
      const updated = customUnits.filter(u => u !== unitToRemove);
      setCustomUnits(updated);
      localStorage.setItem('customUnits', JSON.stringify(updated));
      window.dispatchEvent(new Event('preferencesUpdated'));
    }
  };

  // Interface State
  const [hideShortcuts, setHideShortcuts] = useState(() => {
    return localStorage.getItem('hideShortcuts') === 'true';
  });

  const toggleShortcuts = () => {
    const newValue = !hideShortcuts;
    setHideShortcuts(newValue);
    if (newValue) {
      localStorage.setItem('hideShortcuts', 'true');
    } else {
      localStorage.removeItem('hideShortcuts');
    }
    window.dispatchEvent(new Event('preferencesUpdated'));
  };

  // Escape key handler for modals
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowWipeModal(false);
        setShowUnitModal(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Backup & Restore
  const handleFullBackup = async () => {
    try {
      setIsLoading(true);
      setStatus(null);

      // Checkpoint active database to ensure WAL is fully flushed to disk
      try {
        const db = await getDb();
        await db.execute('PRAGMA wal_checkpoint(TRUNCATE);');
      } catch (err) {
        console.warn('Could not truncate WAL checkpoint:', err);
      }

      const { metadataJson, dbFiles } = prepareFullBackupMetadata();
      const allComps = getCompanies();

      const savePath = await save({
        filters: [
          {
            name: 'Electro Hub Multi-Company Backup Package (*.ehbak)',
            extensions: ['ehbak']
          },
          {
            name: 'All Files (*.*)',
            extensions: ['*']
          }
        ],
        defaultPath: `ElectroHub_Full_Backup_${new Date().toISOString().split('T')[0]}.ehbak`
      });

      if (!savePath) {
        setIsLoading(false);
        return;
      }

      const res = await invoke<{ file_count: number; total_bytes: number }>('backup_all_companies', {
        targetPath: savePath,
        metadataJson,
        dbFiles
      });

      const sizeMb = (res.total_bytes / (1024 * 1024)).toFixed(2);
      setStatus({
        type: 'success',
        message: `Full system backup created successfully! Backed up all ${allComps.length} companies (${res.file_count} database files, ${sizeMb} MB) to ${savePath}`
      });
    } catch (e: any) {
      console.error(e);
      const errorMessage = typeof e === 'string' ? e : (e?.message || 'Failed to create full backup');
      setStatus({ type: 'error', message: errorMessage });
    } finally {
      setIsLoading(false);
    }
  };

  const handleRestore = async () => {
    const isConfirmed = await confirm(
      'WARNING: Restoring a backup will overwrite current database and company records. Do you wish to proceed?',
      {
        title: 'Confirm System / Database Restore',
        kind: 'warning'
      }
    );

    if (!isConfirmed) return;

    try {
      setIsLoading(true);
      setStatus(null);

      const openPath = await open({
        filters: [
          {
            name: 'Electro Hub Backup Package (*.ehbak, *.db, *.bak)',
            extensions: ['ehbak', 'db', 'bak']
          },
          {
            name: 'All Files (*.*)',
            extensions: ['*']
          }
        ],
        multiple: false
      });

      if (!openPath) {
        setIsLoading(false);
        return;
      }

      // Close in-memory database pool before restoring files to release file locks
      try {
        await closeDbConnection();
      } catch (err) {
        console.warn('Error closing database pool prior to restore:', err);
      }

      const activeDbName = activeCompany.dbFile ? activeCompany.dbFile.replace('sqlite:', '') : 'inventory.db';

      const res = await invoke<{
        is_full_backup: boolean;
        metadata_json: string;
        restored_files: string[];
      }>('restore_backup', {
        backupPath: openPath as string,
        activeDbName
      });

      if (res.is_full_backup && res.metadata_json) {
        const restored = restoreFullBackupMetadata(res.metadata_json);
        setStatus({
          type: 'success',
          message: `Complete system restored! Successfully recovered ${restored.companyCount} companies and ${res.restored_files.length} databases. Active store: "${restored.activeName}". Reloading application...`
        });
      } else {
        setStatus({
          type: 'success',
          message: `Database restored into "${activeCompany.name}"! Reloading application...`
        });
      }

      setTimeout(() => {
        window.location.href = `/?restore=${Date.now()}`;
      }, 2500);

    } catch (e: any) {
      console.error(e);
      const errorMessage = typeof e === 'string' ? e : (e?.message || 'Failed to restore backup');
      setStatus({ type: 'error', message: errorMessage });
    } finally {
      setIsLoading(false);
    }
  };

  const handleWipeData = async () => {
    setShowWipeModal(true);
    setWipeCode('');
    setWipeError('');
  };

  const confirmWipeData = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!wipeCode.trim()) {
      setWipeError("Please enter the activation code.");
      return;
    }

    try {
      setIsLoading(true);
      setWipeError('');
      
      const totp = new OTPAuth.TOTP({
        issuer: 'InventoryApp',
        label: 'Admin',
        algorithm: 'SHA1',
        digits: 6,
        period: 30,
        secret: OTPAuth.Secret.fromBase32('JBSWY3DPEHPK3PXP')
      });

      const isValid = totp.validate({
        token: wipeCode.trim(),
        window: 1
      });

      if (isValid === null) {
        setWipeError('Incorrect Activation Code. Please ask your vendor.');
        setIsLoading(false);
        return;
      }

      await wipeAllData();
      setShowWipeModal(false);
      setStatus({ type: 'success', message: 'All data has been successfully wiped. Refreshing app...' });
      setTimeout(() => {
        window.location.reload();
      }, 2000);
    } catch (e: any) {
      console.error(e);
      setWipeError('Failed to wipe data: ' + (e?.message || String(e)));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-canvas">
      
      {/* Top Header */}
      <div className="p-6 md:p-8 pb-4 shrink-0 border-b border-hairline bg-canvas">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-3xl md:text-4xl font-display font-medium text-ink tracking-tight">Settings</h1>
            <p className="text-sm md:text-base text-body mt-1">Configure your store preferences, tax rules, billing formats, and data security.</p>
          </div>
          <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-surface-soft border border-hairline rounded-lg text-xs font-semibold text-ink self-start sm:self-auto shadow-sm">
            <Building2 className="w-3.5 h-3.5 text-primary" />
            <span className="font-mono">{shopName || 'Electro Hub'}</span>
            {shopGSTIN && (
              <span className="px-1.5 py-0.5 text-[10px] bg-primary/10 text-primary font-mono rounded">
                GSTIN: {shopGSTIN}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Main Settings Body: Two-Column Responsive Layout */}
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden bg-canvas">
        
        {/* Left Category Rail */}
        <div className="w-full md:w-72 md:shrink-0 border-b md:border-b-0 md:border-r border-hairline bg-surface-soft/40 p-3 md:p-4 overflow-x-auto md:overflow-y-auto">
          <div className="text-[11px] font-bold uppercase tracking-wider text-muted px-3 mb-2 hidden md:block">
            Settings Navigation
          </div>
          <div className="flex md:flex-col gap-1.5">
            {CATEGORIES.map(cat => {
              const Icon = cat.icon;
              const isActive = activeTab === cat.id;
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setActiveTab(cat.id)}
                  className={`flex items-center md:items-start gap-3 p-2.5 md:p-3 rounded-xl text-left transition-all whitespace-nowrap md:whitespace-normal shrink-0 md:shrink md:w-full ${
                    isActive
                      ? 'bg-canvas text-ink font-semibold shadow-sm border border-hairline ring-1 ring-primary/20'
                      : 'text-muted hover:text-ink hover:bg-canvas/60 border border-transparent'
                  }`}
                >
                  <div className={`p-2 rounded-lg shrink-0 transition-colors ${
                    isActive ? 'bg-primary text-white shadow-sm' : 'bg-surface-soft text-muted'
                  }`}>
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="min-w-0 pr-1">
                    <div className="text-xs md:text-sm font-bold truncate">{cat.label}</div>
                    <div className="text-[11px] text-muted line-clamp-1 hidden md:block mt-0.5">{cat.desc}</div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Right Active Content Pane */}
        <div className="flex-1 overflow-y-auto p-4 md:p-8">
          <div className="max-w-4xl mx-auto space-y-6">

            {status && (
              <div className={`p-4 rounded-xl border flex items-start gap-3 animate-in fade-in duration-200 ${
                status.type === 'success' 
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-300' 
                  : 'bg-red-500/10 border-red-500/30 text-red-700 dark:text-red-300'
              }`}>
                {status.type === 'success' ? (
                  <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5 text-emerald-600 dark:text-emerald-400" />
                ) : (
                  <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5 text-red-600 dark:text-red-400" />
                )}
                <div className="flex-1 text-sm font-medium">{status.message}</div>
                <button onClick={() => setStatus(null)} className="text-muted hover:text-ink p-0.5">
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* TAB 1: STORE & BRANDING */}
            {activeTab === 'shop' && (
              <div className="space-y-6 animate-in fade-in duration-150">
                <div className="border-b border-hairline pb-4">
                  <h2 className="text-lg font-bold text-ink flex items-center gap-2">
                    <Store className="w-5 h-5 text-primary" />
                    Store Details & Invoice Branding
                  </h2>
                  <p className="text-sm text-muted mt-1">
                    These store details appear directly on all customer bills, quotations, and thermal receipts.
                  </p>
                </div>

                {/* Active Company / Business Profile Card */}
                <div className="p-4 rounded-xl border border-primary/25 bg-primary/5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-2xs">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                      <Building2 className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-[10.5px] font-bold text-primary uppercase tracking-wider">Active Business Profile</div>
                      <div className="text-sm font-bold text-ink truncate">{shopName}</div>
                      <div className="text-xs text-muted">Independent database & isolated inventory</div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveTab('companies')}
                    className="px-4 py-2 text-xs font-semibold rounded-lg bg-primary hover:bg-primary-active text-on-primary shadow-2xs transition-all shrink-0 flex items-center justify-center gap-1.5 cursor-pointer active:scale-[0.98]"
                  >
                    <Building2 className="w-3.5 h-3.5" />
                    <span>Manage Companies</span>
                  </button>
                </div>

                {/* Form Fields */}
                <div className="bg-canvas rounded-xl shadow-sm border border-hairline overflow-hidden p-6 space-y-5">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wider text-muted mb-1.5 flex items-center gap-1.5">
                        <Building2 className="w-3.5 h-3.5 text-primary" /> Shop / Business Name *
                      </label>
                      <input 
                        type="text" 
                        value={shopName} 
                        onChange={e => updateShopDetail('shopName', e.target.value, setShopName)}
                        className="w-full px-3.5 py-2.5 bg-surface-soft border border-hairline rounded-lg focus:outline-none focus:border-primary transition-colors text-ink font-medium text-sm"
                        placeholder="e.g. Electro Hub"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wider text-muted mb-1.5 flex items-center gap-1.5">
                        <Phone className="w-3.5 h-3.5 text-primary" /> Support / Contact Phone *
                      </label>
                      <input 
                        type="text" 
                        value={shopPhone} 
                        onChange={e => updateShopDetail('shopPhone', e.target.value, setShopPhone)}
                        className="w-full px-3.5 py-2.5 bg-surface-soft border border-hairline rounded-lg focus:outline-none focus:border-primary transition-colors text-ink font-medium text-sm"
                        placeholder="+91 9876543210"
                      />
                    </div>

                    <div className="md:col-span-2">
                      <label className="block text-xs font-semibold uppercase tracking-wider text-muted mb-1.5 flex items-center gap-1.5">
                        <MapPin className="w-3.5 h-3.5 text-primary" /> Full Store Address
                      </label>
                      <input 
                        type="text" 
                        value={shopAddress} 
                        onChange={e => updateShopDetail('shopAddress', e.target.value, setShopAddress)}
                        className="w-full px-3.5 py-2.5 bg-surface-soft border border-hairline rounded-lg focus:outline-none focus:border-primary transition-colors text-ink font-medium text-sm"
                        placeholder="123 Market Street, City, State - PIN"
                      />
                    </div>

                    <div className="md:col-span-2">
                      <label className="block text-xs font-semibold uppercase tracking-wider text-muted mb-1.5 flex items-center gap-1.5">
                        <CreditCard className="w-3.5 h-3.5 text-primary" /> GSTIN / Tax Identification
                      </label>
                      <input 
                        type="text" 
                        value={shopGSTIN} 
                        onChange={e => updateShopDetail('shopGSTIN', e.target.value.toUpperCase(), setShopGSTIN)}
                        className="w-full px-3.5 py-2.5 bg-surface-soft border border-hairline rounded-lg focus:outline-none focus:border-primary transition-colors text-ink font-mono font-medium text-sm uppercase"
                        placeholder="27XXXXX1234X1X1"
                      />
                    </div>
                  </div>
                </div>

                {/* Live Invoice Header Preview */}
                <div className="bg-surface-soft/80 border border-hairline rounded-xl p-6">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-bold uppercase tracking-wider text-muted flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-amber-500" /> Printed Receipt Header Preview
                    </span>
                    <span className="text-[11px] text-muted">Auto-formats on all bills</span>
                  </div>
                  <div className="bg-canvas border border-hairline rounded-lg p-5 text-center max-w-md mx-auto shadow-sm space-y-1 font-sans">
                    <div className="text-lg font-bold text-ink tracking-tight uppercase">{shopName || 'STORE NAME'}</div>
                    <div className="text-xs text-muted">{shopAddress || 'Store Address'}</div>
                    <div className="text-xs text-muted flex items-center justify-center gap-3 pt-1">
                      <span>Ph: {shopPhone || 'N/A'}</span>
                      {shopGSTIN && <span>• GSTIN: <strong className="font-mono text-ink">{shopGSTIN}</strong></span>}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 2: COMPANY CREATION & MANAGEMENT */}
            {activeTab === 'companies' && (
              <div className="space-y-6 animate-in fade-in duration-150">
                {/* Header */}
                <div className="border-b border-hairline pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-bold text-ink flex items-center gap-2">
                      <Building2 className="w-5 h-5 text-primary" />
                      Company & Branch Management
                    </h2>
                    <p className="text-sm text-muted mt-1">
                      Create and manage independent companies. Each company runs on an isolated SQLite database.
                    </p>
                  </div>
                  {isMasterAdmin && !showCreateCompanyCard && (
                    <button
                      type="button"
                      onClick={() => setShowCreateCompanyCard(true)}
                      className="px-4 py-2 text-xs font-semibold rounded-lg bg-primary hover:bg-primary-active text-on-primary shadow-2xs transition-all flex items-center gap-1.5 shrink-0 cursor-pointer active:scale-[0.98]"
                    >
                      <Plus className="w-4 h-4" />
                      <span>Create New Company</span>
                    </button>
                  )}
                </div>

                {/* Role / Authority Notice */}
                {!isMasterAdmin ? (
                  <div className="p-4 bg-surface-soft border border-hairline rounded-xl flex items-start gap-3 text-xs text-muted">
                    <Lock className="w-4 h-4 text-muted shrink-0 mt-0.5" />
                    <div>
                      <div className="font-semibold text-ink">Read-Only Mode for Secondary Businesses</div>
                      <p className="mt-0.5">
                        You are currently signed into a branch or secondary business. To create new companies, edit company settings, or delete companies, switch back to the Main Company Admin account.
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="p-4 bg-emerald-500/10 border border-emerald-500/25 rounded-xl flex items-start gap-3 text-xs text-emerald-800 dark:text-emerald-300">
                    <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    <div>
                      <div className="font-semibold">Main Default Administrator Authority</div>
                      <p className="mt-0.5 text-muted">
                        You have full authority to create, configure, switch, and remove business profiles.
                      </p>
                    </div>
                  </div>
                )}

                {/* Create Company Form */}
                {showCreateCompanyCard && (
                  <form onSubmit={handleCreateCompanySubmit} className="bg-canvas border-2 border-primary/40 rounded-xl p-6 shadow-sm space-y-4 animate-in fade-in duration-150">
                    <div className="flex items-center justify-between border-b border-hairline pb-3">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                          <Plus className="w-4 h-4" />
                        </div>
                        <div>
                          <h3 className="text-sm font-bold text-ink">Create New Company / Branch</h3>
                          <p className="text-xs text-muted">Creates an independent database file with fresh inventory and sales</p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowCreateCompanyCard(false)}
                        className="text-muted hover:text-ink p-1 rounded-md hover:bg-surface-soft transition-colors cursor-pointer"
                        title="Close Form"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-ink mb-1.5">
                        Company / Shop Name *
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. Electro Hub Wholesale / Branch 2"
                        value={newCompName}
                        onChange={e => setNewCompName(e.target.value)}
                        className="w-full px-3.5 py-2.5 bg-surface-soft border border-hairline rounded-lg text-ink placeholder:text-muted focus:outline-none focus:border-primary text-xs"
                        required
                        autoFocus
                      />
                      <p className="text-[11px] text-muted mt-2">
                        All other details (phone, address, GSTIN) can be set anytime under <strong>Store &amp; Branding</strong>.
                      </p>
                    </div>

                    <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-hairline">
                      <button
                        type="button"
                        onClick={() => setShowCreateCompanyCard(false)}
                        className="px-4 py-2 text-xs font-semibold rounded-lg bg-surface-soft hover:bg-surface-strong text-muted hover:text-ink transition-colors cursor-pointer"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={isSubmittingComp}
                        className="px-5 py-2 text-xs font-semibold rounded-lg bg-primary hover:bg-primary-active text-on-primary transition-all flex items-center gap-1.5 shadow-2xs cursor-pointer active:scale-[0.98]"
                      >
                        <Check className="w-4 h-4" />
                        <span>{isSubmittingComp ? 'Creating Company...' : 'Create Company'}</span>
                      </button>
                    </div>
                  </form>
                )}

                {/* Available Companies List */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider text-muted">
                      Registered Companies ({companiesList.length})
                    </span>
                  </div>

                  <div className="grid grid-cols-1 gap-3">
                    {companiesList.map(comp => {
                      const isActive = comp.id === activeCompany.id;
                      return (
                        <div
                          key={comp.id}
                          className={`p-5 rounded-xl border transition-all ${
                            isActive
                              ? 'border-primary bg-primary/5 shadow-xs'
                              : 'border-hairline bg-canvas hover:bg-surface-soft/60'
                          }`}
                        >
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                            <div className="flex items-start gap-3.5 min-w-0">
                              <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 font-bold text-sm ${
                                isActive ? 'bg-primary text-on-primary shadow-xs' : 'bg-surface-strong text-muted'
                              }`}>
                                {comp.code ? comp.code.substring(0, 3) : <Building2 className="w-5 h-5" />}
                              </div>
                              <div className="min-w-0 space-y-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <h3 className="text-sm font-bold text-ink truncate">{comp.name}</h3>
                                  {isActive && (
                                    <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                                      <Check className="w-3 h-3" /> Active Business
                                    </span>
                                  )}
                                  {comp.id === 'comp_default' && (
                                    <span className="text-[10px] px-2 py-0.5 rounded-full font-medium bg-surface-strong text-muted border border-hairline">
                                      Main Account
                                    </span>
                                  )}
                                </div>
                                <div className="text-xs text-muted space-y-0.5">
                                  {comp.shopAddress && <div className="truncate">{comp.shopAddress}</div>}
                                  <div className="flex items-center gap-3 flex-wrap">
                                    {comp.shopPhone && <span>Ph: <strong className="text-ink font-medium">{comp.shopPhone}</strong></span>}
                                    {comp.shopGSTIN && <span>GSTIN: <strong className="font-mono text-ink font-medium">{comp.shopGSTIN}</strong></span>}
                                  </div>
                                </div>
                                <div className="text-[10.5px] font-mono text-muted/70">
                                  Database: <span className="font-semibold text-ink/75">{comp.dbFile}</span>
                                </div>
                              </div>
                            </div>

                            {/* Actions */}
                            <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                              {isMasterAdmin && comp.id !== 'comp_default' && (
                                <button
                                  type="button"
                                  onClick={() => handleDeleteCompanyClick(comp)}
                                  className="p-2 text-muted hover:text-signature-coral hover:bg-signature-coral/10 rounded-lg transition-colors cursor-pointer"
                                  title="Delete Company"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              )}

                              {isActive ? (
                                <button
                                  type="button"
                                  onClick={() => setActiveTab('shop')}
                                  className="px-3.5 py-1.5 text-xs font-semibold rounded-lg bg-surface-soft hover:bg-surface-strong text-ink border border-hairline transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs"
                                  title="Edit details in Store & Branding tab"
                                >
                                  <Store className="w-3.5 h-3.5 text-primary" />
                                  <span>Edit Store Details</span>
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => switchCompany(comp.id)}
                                  className="px-3.5 py-2 text-xs font-semibold rounded-lg bg-primary hover:bg-primary-active text-on-primary transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs active:scale-[0.98]"
                                >
                                  <span>Switch Business</span>
                                  <ArrowRight className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* TAB 3: BILL & INVOICE FORMATTING */}
            {activeTab === 'billing' && (
              <div className="space-y-6 animate-in fade-in duration-150">
                <div className="border-b border-hairline pb-4">
                  <h2 className="text-lg font-bold text-ink flex items-center gap-2">
                    <Receipt className="w-5 h-5 text-primary" />
                    Bill & Invoice Number Format
                  </h2>
                  <p className="text-sm text-muted mt-1">
                    Customize invoice numbering, prefixes, financial years, separators, and sequence counters.
                  </p>
                </div>

                {/* Real-time Preview Banner */}
                <div className="bg-surface-soft border border-hairline rounded-xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-5 shadow-sm">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold uppercase tracking-wider text-muted">Next Bill Preview</span>
                      <span className="px-2 py-0.5 text-[11px] font-semibold bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 rounded-full border border-emerald-200 dark:border-emerald-800">
                        Live Sample
                      </span>
                    </div>
                    <div className="text-2xl sm:text-3xl font-mono font-bold text-ink mt-1 tracking-wide">
                      {previewBillNo}
                    </div>
                    <p className="text-xs text-muted mt-1">Will be assigned to the next sale recorded in POS</p>
                  </div>

                  <div className="sm:border-l sm:border-hairline sm:pl-6">
                    <div className="text-xs font-bold uppercase tracking-wider text-muted">Next Quotation Preview</div>
                    <div className="text-xl font-mono font-bold text-ink mt-1 tracking-wide">
                      {previewQuotationNo}
                    </div>
                    <p className="text-xs text-muted mt-1">Assigned to the next quotation</p>
                  </div>
                </div>

                {/* Quick Format Presets */}
                <div className="bg-canvas rounded-xl shadow-sm border border-hairline p-6">
                  <label className="block text-xs font-bold uppercase tracking-wider text-muted mb-3">
                    1-Click Format Presets
                  </label>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <button
                      type="button"
                      onClick={() => applyPreset('gst')}
                      className={`p-3.5 rounded-xl border text-left transition-all ${
                        billPrefix === 'INV' && billYearFormat === 'fy_short' && billSeparator === '/' && billPadding === 4
                          ? 'border-primary bg-primary/5 ring-1 ring-primary'
                          : 'border-hairline bg-surface-soft hover:bg-canvas'
                      }`}
                    >
                      <div className="font-bold text-xs text-ink">Standard GST</div>
                      <div className="text-xs font-mono text-primary mt-1 font-semibold">INV/26-27/0001</div>
                    </button>

                    <button
                      type="button"
                      onClick={() => applyPreset('shop')}
                      className={`p-3.5 rounded-xl border text-left transition-all ${
                        billPrefix === 'EH' && billYearFormat === '4digit' && billSeparator === '-' && billPadding === 3
                          ? 'border-primary bg-primary/5 ring-1 ring-primary'
                          : 'border-hairline bg-surface-soft hover:bg-canvas'
                      }`}
                    >
                      <div className="font-bold text-xs text-ink">Shop Code</div>
                      <div className="text-xs font-mono text-primary mt-1 font-semibold">EH-2026-001</div>
                    </button>

                    <button
                      type="button"
                      onClick={() => applyPreset('counter')}
                      className={`p-3.5 rounded-xl border text-left transition-all ${
                        billPrefix === 'INV' && billYearFormat === 'none' && billSeparator === '-' && billPadding === 4
                          ? 'border-primary bg-primary/5 ring-1 ring-primary'
                          : 'border-hairline bg-surface-soft hover:bg-canvas'
                      }`}
                    >
                      <div className="font-bold text-xs text-ink">Simple Counter</div>
                      <div className="text-xs font-mono text-primary mt-1 font-semibold">INV-0001</div>
                    </button>

                    <button
                      type="button"
                      onClick={() => applyPreset('default')}
                      className={`p-3.5 rounded-xl border text-left transition-all ${
                        billPrefix === '' && billYearFormat === '2digit' && billSeparator === '-' && billPadding === 0
                          ? 'border-primary bg-primary/5 ring-1 ring-primary'
                          : 'border-hairline bg-surface-soft hover:bg-canvas'
                      }`}
                    >
                      <div className="font-bold text-xs text-ink">Default Compact</div>
                      <div className="text-xs font-mono text-primary mt-1 font-semibold">26-1</div>
                    </button>
                  </div>

                  {/* Individual Controls */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-6 mt-6 border-t border-hairline">
                    <div>
                      <label className="block text-sm font-bold text-ink mb-1">Bill / Invoice Prefix</label>
                      <p className="text-xs text-muted mb-2">Text placed before the bill number (leave blank for none)</p>
                      <input
                        type="text"
                        value={billPrefix}
                        onChange={e => handleBillFormatChange('billPrefix', e.target.value)}
                        className="w-full px-3.5 py-2.5 bg-surface-soft border border-hairline rounded-lg focus:outline-none focus:border-primary transition-colors text-ink font-medium text-sm"
                        placeholder="e.g. INV, BILL, EH, or blank"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-bold text-ink mb-1">Quotation Prefix</label>
                      <p className="text-xs text-muted mb-2">Prefix used for quotations and estimates</p>
                      <input
                        type="text"
                        value={billQuotationPrefix}
                        onChange={e => handleBillFormatChange('billQuotationPrefix', e.target.value)}
                        className="w-full px-3.5 py-2.5 bg-surface-soft border border-hairline rounded-lg focus:outline-none focus:border-primary transition-colors text-ink font-medium text-sm"
                        placeholder="e.g. QT, QUOT, EST"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-bold text-ink mb-1">Year / Date Component</label>
                      <p className="text-xs text-muted mb-2">How the year or financial year appears</p>
                      <select
                        value={billYearFormat}
                        onChange={e => handleBillFormatChange('billYearFormat', e.target.value)}
                        className="w-full px-3.5 py-2.5 bg-surface-soft border border-hairline rounded-lg focus:outline-none focus:border-primary transition-colors text-ink font-medium text-sm cursor-pointer"
                      >
                        <option value="2digit">2-Digit Year (e.g. 26)</option>
                        <option value="4digit">4-Digit Year (e.g. 2026)</option>
                        <option value="fy_short">Financial Year Short (e.g. 26-27)</option>
                        <option value="fy_long">Financial Year Full (e.g. 2026-27)</option>
                        <option value="none">None (No Year)</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-bold text-ink mb-1">Separator</label>
                      <p className="text-xs text-muted mb-2">Character separating prefix, year, and number</p>
                      <div className="grid grid-cols-4 gap-2">
                        {[
                          { label: 'Hyphen ( - )', val: '-' },
                          { label: 'Slash ( / )', val: '/' },
                          { label: 'Dot ( . )', val: '.' },
                          { label: 'None', val: '' }
                        ].map(sep => (
                          <button
                            key={sep.val}
                            type="button"
                            onClick={() => handleBillFormatChange('billSeparator', sep.val)}
                            className={`py-2 px-2 text-xs font-bold rounded-lg border text-center transition-colors ${
                              billSeparator === sep.val
                                ? 'bg-primary text-white border-primary shadow-sm'
                                : 'bg-surface-soft text-ink border-hairline hover:bg-canvas'
                            }`}
                          >
                            {sep.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-bold text-ink mb-1">Number Padding (Leading Zeros)</label>
                      <p className="text-xs text-muted mb-2">Length of sequence digits with leading zeros</p>
                      <select
                        value={billPadding}
                        onChange={e => handleBillFormatChange('billPadding', Number(e.target.value))}
                        className="w-full px-3.5 py-2.5 bg-surface-soft border border-hairline rounded-lg focus:outline-none focus:border-primary transition-colors text-ink font-medium text-sm cursor-pointer"
                      >
                        <option value={0}>No Padding (1, 2, 3...)</option>
                        <option value={2}>2 Digits (01, 02...)</option>
                        <option value={3}>3 Digits (001, 002...)</option>
                        <option value={4}>4 Digits (0001, 0002...)</option>
                        <option value={5}>5 Digits (00001, 00002...)</option>
                        <option value={6}>6 Digits (000001, 000002...)</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-bold text-ink mb-1">Next Bill Number (Counter)</label>
                      <p className="text-xs text-muted mb-2">
                        {maxSalesId > 0
                          ? `Auto tracks database ID (next auto: #${maxSalesId + 1}). Enter number to override.`
                          : 'Auto tracks database ID. Enter number to start custom sequence.'}
                      </p>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={billNextNumber}
                          onChange={e => {
                            const clean = e.target.value.replace(/\D/g, '');
                            handleBillFormatChange('billNextNumber', clean);
                          }}
                          className="flex-1 px-3.5 py-2.5 bg-surface-soft border border-hairline rounded-lg focus:outline-none focus:border-primary transition-colors text-ink font-mono font-medium text-sm"
                          placeholder={`Auto (${maxSalesId + 1})`}
                        />
                        {billNextNumber && (
                          <button
                            type="button"
                            onClick={() => handleBillFormatChange('billNextNumber', '')}
                            className="px-3.5 py-2.5 text-xs font-semibold bg-surface-soft hover:bg-canvas border border-hairline rounded-lg text-muted hover:text-ink transition-colors whitespace-nowrap"
                            title="Reset to automatic database ID counter"
                          >
                            Reset to Auto
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 3: TAXES & GST */}
            {activeTab === 'taxes' && (
              <div className="space-y-6 animate-in fade-in duration-150">
                <div className="border-b border-hairline pb-4">
                  <h2 className="text-lg font-bold text-ink flex items-center gap-2">
                    <Percent className="w-5 h-5 text-primary" />
                    Taxation, GST & Profit Calculation
                  </h2>
                  <p className="text-sm text-muted mt-1">
                    Control how taxes are calculated across sales, supplier purchases, and financial margins.
                  </p>
                </div>

                {/* Sales Tax Card */}
                <div className="bg-canvas rounded-xl shadow-sm border border-hairline p-6 space-y-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-base font-bold text-ink">Enable GST for Sales</h3>
                      <p className="text-sm text-muted">Include GST in customer invoices, item lines, and print receipts</p>
                    </div>
                    <button
                      onClick={toggleSalesGST}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${enableSalesGST ? 'bg-primary' : 'bg-surface-strong'}`}
                    >
                      <span className={`inline-block h-4 w-4 transform rounded-full bg-canvas transition-transform ${enableSalesGST ? 'translate-x-6' : 'translate-x-1'}`} />
                    </button>
                  </div>

                  {enableSalesGST && (
                    <div className="pt-6 border-t border-hairline space-y-3">
                      <label className="block text-sm font-bold text-ink">Sales Tax Calculation Method</label>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <button
                          type="button"
                          onClick={() => setSalesTaxMethodExplicit('exclusive')}
                          className={`p-4 rounded-xl border text-left transition-all ${
                            salesTaxMethod === 'exclusive'
                              ? 'border-primary bg-primary/5 ring-1 ring-primary'
                              : 'border-hairline bg-surface-soft hover:bg-canvas'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-sm text-ink">Exclusive (Tax Added)</span>
                            {salesTaxMethod === 'exclusive' && <span className="w-2 h-2 rounded-full bg-primary" />}
                          </div>
                          <p className="text-xs text-muted mt-1">
                            GST is calculated on top of the selling price (Price + Tax). Recommended for B2B & Wholesale.
                          </p>
                        </button>

                        <button
                          type="button"
                          onClick={() => setSalesTaxMethodExplicit('inclusive')}
                          className={`p-4 rounded-xl border text-left transition-all ${
                            salesTaxMethod === 'inclusive'
                              ? 'border-primary bg-primary/5 ring-1 ring-primary'
                              : 'border-hairline bg-surface-soft hover:bg-canvas'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-sm text-ink">Inclusive (Tax Embedded)</span>
                            {salesTaxMethod === 'inclusive' && <span className="w-2 h-2 rounded-full bg-primary" />}
                          </div>
                          <p className="text-xs text-muted mt-1">
                            Selling price already includes tax (MRP style). Recommended for retail customer walk-ins.
                          </p>
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Purchase Tax Card */}
                <div className="bg-canvas rounded-xl shadow-sm border border-hairline p-6 space-y-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-base font-bold text-ink">Enable GST for Purchases</h3>
                      <p className="text-sm text-muted">Include GST breakdown when adding supplier stock into inventory</p>
                    </div>
                    <button
                      onClick={togglePurchaseGST}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${enablePurchaseGST ? 'bg-primary' : 'bg-surface-strong'}`}
                    >
                      <span className={`inline-block h-4 w-4 transform rounded-full bg-canvas transition-transform ${enablePurchaseGST ? 'translate-x-6' : 'translate-x-1'}`} />
                    </button>
                  </div>

                  {enablePurchaseGST && (
                    <div className="pt-6 border-t border-hairline space-y-3">
                      <label className="block text-sm font-bold text-ink">Purchase Tax Calculation Method</label>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <button
                          type="button"
                          onClick={() => setPurchaseTaxMethodExplicit('exclusive')}
                          className={`p-4 rounded-xl border text-left transition-all ${
                            purchaseTaxMethod === 'exclusive'
                              ? 'border-primary bg-primary/5 ring-1 ring-primary'
                              : 'border-hairline bg-surface-soft hover:bg-canvas'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-sm text-ink">Exclusive (Tax on Cost)</span>
                            {purchaseTaxMethod === 'exclusive' && <span className="w-2 h-2 rounded-full bg-primary" />}
                          </div>
                          <p className="text-xs text-muted mt-1">
                            Tax is added on top of the supplier base unit purchase cost.
                          </p>
                        </button>

                        <button
                          type="button"
                          onClick={() => setPurchaseTaxMethodExplicit('inclusive')}
                          className={`p-4 rounded-xl border text-left transition-all ${
                            purchaseTaxMethod === 'inclusive'
                              ? 'border-primary bg-primary/5 ring-1 ring-primary'
                              : 'border-hairline bg-surface-soft hover:bg-canvas'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-sm text-ink">Inclusive (All-in Cost)</span>
                            {purchaseTaxMethod === 'inclusive' && <span className="w-2 h-2 rounded-full bg-primary" />}
                          </div>
                          <p className="text-xs text-muted mt-1">
                            Purchase price already includes supplier taxes.
                          </p>
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Profit Calculation Mode Card */}
                <div className="bg-canvas rounded-xl shadow-sm border border-hairline p-6 space-y-4">
                  <div>
                    <h3 className="text-base font-bold text-ink">Net Margin & Profit Reporting Mode</h3>
                    <p className="text-sm text-muted">Choose how Day Book and Dashboard calculate gross profit on products sold</p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                    <button
                      type="button"
                      onClick={() => toggleProfitTaxMode('with_gst')}
                      className={`p-4 rounded-xl border text-left transition-all ${
                        profitTaxMode === 'with_gst'
                          ? 'border-primary bg-primary/5 ring-1 ring-primary'
                          : 'border-hairline bg-surface-soft hover:bg-canvas'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-sm text-ink">Gross Turnover Mode (With GST)</span>
                        {profitTaxMode === 'with_gst' && <span className="w-2 h-2 rounded-full bg-primary" />}
                      </div>
                      <p className="text-xs text-muted mt-1">
                        Margin = Full customer bill amount minus purchase price. Useful for cash-flow accounting.
                      </p>
                    </button>

                    <button
                      type="button"
                      onClick={() => toggleProfitTaxMode('without_gst')}
                      className={`p-4 rounded-xl border text-left transition-all ${
                        profitTaxMode === 'without_gst'
                          ? 'border-primary bg-primary/5 ring-1 ring-primary'
                          : 'border-hairline bg-surface-soft hover:bg-canvas'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-sm text-ink">Real Margin Mode (Without GST)</span>
                        {profitTaxMode === 'without_gst' && <span className="w-2 h-2 rounded-full bg-primary" />}
                      </div>
                      <p className="text-xs text-muted mt-1">
                        Margin = Taxable base selling price minus purchase price. Excludes GST liability.
                      </p>
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 4: INVENTORY & STOCK */}
            {activeTab === 'inventory' && (
              <div className="space-y-6 animate-in fade-in duration-150">
                <div className="border-b border-hairline pb-4">
                  <h2 className="text-lg font-bold text-ink flex items-center gap-2">
                    <Boxes className="w-5 h-5 text-primary" />
                    Inventory, Stock Alerts & Units
                  </h2>
                  <p className="text-sm text-muted mt-1">
                    Manage re-order alert thresholds and customizable item measurement units.
                  </p>
                </div>

                {/* Low Stock Threshold Card */}
                <div className="bg-canvas rounded-xl shadow-sm border border-hairline p-6">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                      <h3 className="text-base font-bold text-ink">Low Stock Alert Threshold</h3>
                      <p className="text-sm text-muted mt-0.5">
                        Items with total remaining quantity at or below this value will trigger amber alert badges on the Dashboard.
                      </p>
                    </div>
                    <div className="flex items-center gap-2.5 shrink-0 self-start sm:self-auto">
                      <input 
                        type="text" 
                        value={lowStockThreshold} 
                        onChange={handleLowStockChange}
                        className="w-20 px-3.5 py-2 bg-surface-soft border border-hairline rounded-lg focus:outline-none focus:border-primary transition-colors text-ink text-center font-mono font-bold text-base"
                      />
                      <span className="text-sm font-semibold text-muted">units</span>
                    </div>
                  </div>
                </div>

                {/* Custom Units Card */}
                <div className="bg-canvas rounded-xl shadow-sm border border-hairline p-6 space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-base font-bold text-ink">Custom Units of Measurement</h3>
                      <p className="text-sm text-muted mt-0.5">Define measurement units selectable when adding or editing products</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowUnitModal(true)}
                      className="px-3.5 py-1.5 text-xs font-semibold bg-surface-soft hover:bg-canvas border border-hairline rounded-lg text-ink transition-colors"
                    >
                      Open Modal
                    </button>
                  </div>

                  {/* Inline Add Input */}
                  <div className="flex gap-2.5 pt-2">
                    <input 
                      type="text" 
                      value={newUnit} 
                      onChange={e => setNewUnit(e.target.value)} 
                      placeholder="e.g. Kg, Bundle, Roll, Pack" 
                      className="flex-1 px-3.5 py-2 bg-surface-soft border border-hairline rounded-lg focus:outline-none focus:border-primary transition-colors text-ink text-sm font-medium"
                      onKeyDown={e => e.key === 'Enter' && addUnit()}
                    />
                    <button 
                      type="button"
                      onClick={addUnit}
                      disabled={!newUnit.trim()}
                      className="px-4 py-2 bg-primary hover:bg-primary-active text-on-primary rounded-lg font-semibold text-xs transition-colors flex items-center gap-1.5 disabled:opacity-50 shadow-sm"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Add Unit
                    </button>
                  </div>

                  {/* Active Unit Chips */}
                  <div className="pt-2">
                    {customUnits.length === 0 ? (
                      <p className="text-xs text-muted italic">No custom units defined yet.</p>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {customUnits.map(unit => (
                          <div 
                            key={unit} 
                            className="inline-flex items-center gap-2 bg-surface-soft border border-hairline px-3.5 py-1.5 rounded-full shadow-sm text-sm font-medium text-ink group"
                          >
                            <span>{unit}</span>
                            <button 
                              type="button"
                              onClick={() => removeUnit(unit)} 
                              className="text-muted hover:text-signature-coral transition-colors p-0.5 rounded-full hover:bg-signature-coral/10" 
                              title={`Delete ${unit}`}
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* TAB 5: STAFF MANAGEMENT */}
            {activeTab === 'staff' && (
              <div className="space-y-4 animate-in fade-in duration-150">
                <Staff />
              </div>
            )}

            {/* TAB 6: BACKUP & DATA RECOVERY */}
            {activeTab === 'backup' && (
              <div className="space-y-6 animate-in fade-in duration-150">
                <div className="border-b border-hairline pb-4">
                  <h2 className="text-lg font-bold text-ink flex items-center gap-2">
                    <Database className="w-5 h-5 text-primary" />
                    Database Backup & Recovery
                  </h2>
                  <p className="text-sm text-muted mt-1">
                    Export your database to external drives, restore past backups, or manage system resets.
                  </p>
                </div>

                {/* Backup & Restore Action Grid (Entire Full Backup Only) */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Card 1: Entire Full System Backup */}
                  <button
                    type="button"
                    onClick={handleFullBackup}
                    disabled={isLoading}
                    className="group relative overflow-hidden bg-canvas border-2 border-primary/40 hover:border-primary rounded-xl p-8 flex flex-col items-center justify-between transition-all hover:bg-surface-soft hover:shadow-lg disabled:opacity-50 text-left cursor-pointer min-h-[290px]"
                  >
                    <div className="w-full flex justify-between items-center">
                      <span className="text-xs font-semibold text-muted">Complete System Package</span>
                      <span className="px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded-full bg-primary/10 text-primary border border-primary/20">
                        All Companies ({companiesList.length})
                      </span>
                    </div>
                    <div className="w-16 h-16 bg-primary/10 text-primary rounded-2xl flex items-center justify-center my-4 group-hover:scale-110 transition-transform">
                      <Layers className="w-8 h-8" />
                    </div>
                    <div className="text-center">
                      <h3 className="text-lg font-bold text-ink">Create Full System Backup</h3>
                      <p className="text-xs text-muted mt-2 max-w-sm leading-relaxed">
                        Backs up <strong>all {companiesList.length} companies</strong>, their independent databases, product stocks, customer ledgers, and billing preferences into a single secure backup file.
                      </p>
                    </div>
                    <div className="mt-5 w-full py-2.5 bg-primary text-white rounded-lg text-xs font-semibold text-center group-hover:bg-primary-active transition-colors shadow-2xs">
                      Backup All Data Now
                    </div>
                  </button>

                  {/* Card 2: Restore Full System Backup */}
                  <button
                    type="button"
                    onClick={handleRestore}
                    disabled={isLoading}
                    className="group relative overflow-hidden bg-canvas border border-hairline hover:border-amber-500 rounded-xl p-8 flex flex-col items-center justify-between transition-all hover:bg-surface-soft hover:shadow-md disabled:opacity-50 text-left cursor-pointer min-h-[290px]"
                  >
                    <div className="w-full flex justify-between items-center">
                      <span className="text-xs font-semibold text-muted">System Recovery</span>
                      <span className="px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded-full bg-amber-500/10 text-amber-700 border border-amber-500/20">
                        Full Restore
                      </span>
                    </div>
                    <div className="w-16 h-16 bg-amber-500/10 text-amber-600 rounded-2xl flex items-center justify-center my-4 group-hover:scale-110 transition-transform">
                      <Upload className="w-8 h-8" />
                    </div>
                    <div className="text-center">
                      <h3 className="text-lg font-bold text-ink">Restore System Backup</h3>
                      <p className="text-xs text-muted mt-2 max-w-sm leading-relaxed">
                        Restore your entire system from a previously saved backup file. Completely recovers all companies, databases, and billing settings. Will reload the application.
                      </p>
                    </div>
                    <div className="mt-5 w-full py-2.5 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-xs font-semibold text-center transition-colors shadow-2xs">
                      Restore Backup File
                    </div>
                  </button>
                </div>

                {/* Danger Zone */}
                <div className="bg-canvas rounded-xl shadow-sm border border-signature-coral/30 overflow-hidden mt-8">
                  <div className="p-5 border-b border-signature-coral/20 bg-signature-coral/5 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 bg-signature-coral/10 rounded-lg flex items-center justify-center text-signature-coral">
                        <AlertTriangle className="w-5 h-5" />
                      </div>
                      <div>
                        <h3 className="text-base font-bold text-signature-coral">Danger Zone: System Reset</h3>
                        <p className="text-xs text-signature-coral/80">Permanent destructive operations</p>
                      </div>
                    </div>
                  </div>

                  <div className="p-6 bg-signature-coral/5 flex flex-col sm:flex-row sm:items-center justify-between gap-5">
                    <div>
                      <h4 className="text-sm font-bold text-ink">Wipe All Application Data</h4>
                      <p className="text-xs text-muted mt-1 max-w-xl leading-relaxed">
                        Permanently deletes all inventory, sales, purchases, contacts, quotations, and returns. Protected by vendor activation code.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={handleWipeData}
                      disabled={isLoading}
                      className="flex items-center gap-2 bg-signature-coral hover:bg-red-600 text-white px-5 py-2.5 rounded-lg text-xs font-bold transition-colors disabled:opacity-50 shrink-0 shadow-sm"
                    >
                      <Trash2 className="w-4 h-4" />
                      Wipe All Data
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 7: INTERFACE & SHORTCUTS */}
            {activeTab === 'interface' && (
              <div className="space-y-6 animate-in fade-in duration-150">
                <div className="border-b border-hairline pb-4">
                  <h2 className="text-lg font-bold text-ink flex items-center gap-2">
                    <Sliders className="w-5 h-5 text-primary" />
                    Interface & Keyboard Shortcuts
                  </h2>
                  <p className="text-sm text-muted mt-1">
                    Control interface behavior, sidebar hints, and view complete system keyboard shortcuts.
                  </p>
                </div>

                {/* Shortcuts Hint Toggle */}
                <div className="bg-canvas rounded-xl shadow-sm border border-hairline p-6 flex items-center justify-between">
                  <div>
                    <h3 className="text-base font-bold text-ink">Show Keyboard Shortcuts in Sidebar</h3>
                    <p className="text-sm text-muted mt-0.5">
                      Displays handy shortcut badges (e.g. ^1, ^2, ^3) alongside menu items for faster navigation.
                    </p>
                  </div>
                  <button
                    onClick={toggleShortcuts}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${!hideShortcuts ? 'bg-primary' : 'bg-surface-strong'}`}
                  >
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-canvas transition-transform ${!hideShortcuts ? 'translate-x-6' : 'translate-x-1'}`} />
                  </button>
                </div>

                {/* Keyboard Shortcuts Reference Guide */}
                <div className="bg-canvas rounded-xl shadow-sm border border-hairline overflow-hidden">
                  <div className="p-5 border-b border-hairline bg-surface-soft/60 flex items-center gap-2.5">
                    <Keyboard className="w-4 h-4 text-primary" />
                    <h3 className="text-sm font-bold text-ink uppercase tracking-wider">Quick Navigation Cheatsheet</h3>
                  </div>
                  <div className="divide-y divide-hairline">
                    {[
                      { key: 'Ctrl + 1 / ^1', action: 'Navigate to Dashboard', page: 'Overview' },
                      { key: 'Ctrl + 2 / ^2', action: 'Navigate to Inventory', page: 'Stock & Items' },
                      { key: 'Ctrl + 3 / ^3', action: 'Navigate to POS / Billing', page: 'Cashier Checkout' },
                      { key: 'Ctrl + 4 / ^4', action: 'Navigate to Purchases', page: 'Inward Stock' },
                      { key: 'Ctrl + 5 / ^5', action: 'Navigate to Day Book', page: 'Daily Transactions' },
                      { key: 'Ctrl + 6 / ^6', action: 'Navigate to Payments', page: 'Passbook & Cheques' },
                      { key: 'Ctrl + 7 / ^7', action: 'Navigate to Returns', page: 'Exchanges' },
                      { key: 'Ctrl + 8 / ^8', action: 'Navigate to Godowns', page: 'Warehouses' },
                      { key: 'Ctrl + 9 / ^9', action: 'Navigate to Contacts', page: 'Customers & Suppliers' },
                      { key: 'Ctrl + 0 / ^0', action: 'Navigate to Reports', page: 'PDF & Analytics' },
                      { key: 'F1', action: 'Focus Product Search', page: 'POS Checkout' },
                      { key: 'Esc', action: 'Close Popups & Modals', page: 'Universal' },
                    ].map(row => (
                      <div key={row.key} className="px-6 py-3.5 flex items-center justify-between text-sm">
                        <div className="flex items-center gap-3">
                          <kbd className="px-2.5 py-1 bg-surface-soft border border-hairline rounded font-mono text-xs font-bold text-ink shadow-sm">
                            {row.key}
                          </kbd>
                          <span className="font-medium text-ink">{row.action}</span>
                        </div>
                        <span className="text-xs text-muted font-medium">{row.page}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

          </div>
        </div>
      </div>

      {/* POPUP MODAL: WIPE DATA */}
      {showWipeModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-canvas w-full max-w-md rounded-2xl shadow-xl overflow-hidden border border-hairline animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between p-6 border-b border-hairline bg-signature-coral/5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-signature-coral/10 flex items-center justify-center text-signature-coral">
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-signature-coral">Wipe All Data</h3>
                  <p className="text-xs text-signature-coral/80 font-medium">Irreversible Destruction</p>
                </div>
              </div>
              <button 
                onClick={() => setShowWipeModal(false)}
                className="text-muted hover:text-ink transition-colors p-2 rounded-lg hover:bg-surface-soft"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <form onSubmit={confirmWipeData} className="p-6">
              <p className="text-sm text-body mb-6">
                You are about to permanently delete all products, sales, purchases, and contacts. <br/><br/>
                Please enter the 6-digit <strong>Activation Code</strong> (provided by your vendor) to confirm this action.
              </p>

              {wipeError && (
                <div className="mb-4 p-3 bg-signature-coral/10 border border-signature-coral/30 rounded-lg text-signature-coral text-sm font-medium flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  {wipeError}
                </div>
              )}

              <div className="space-y-1 mb-8">
                <label className="text-sm font-medium text-ink">Activation Code</label>
                <input
                  type="text"
                  value={wipeCode}
                  onChange={(e) => setWipeCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="000000"
                  maxLength={6}
                  required
                  className="w-full px-4 py-3 bg-surface-soft border border-hairline rounded-xl focus:ring-2 focus:ring-signature-coral/20 focus:border-signature-coral outline-none transition-all text-xl tracking-widest text-center font-mono"
                  autoFocus
                />
              </div>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowWipeModal(false)}
                  className="flex-1 px-4 py-2.5 border border-hairline text-ink rounded-lg font-medium hover:bg-surface-soft transition-colors"
                  disabled={isLoading}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2.5 bg-signature-coral text-white rounded-lg font-medium hover:bg-red-600 transition-colors disabled:opacity-50"
                  disabled={isLoading || wipeCode.length !== 6}
                >
                  {isLoading ? 'Wiping...' : 'Confirm Wipe'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* POPUP MODAL: MANAGE UNIT TYPES */}
      {showUnitModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-canvas w-full max-w-lg rounded-2xl shadow-xl overflow-hidden border border-hairline animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between p-6 border-b border-hairline">
              <h2 className="text-xl font-bold text-ink">Manage Unit Types</h2>
              <button 
                onClick={() => setShowUnitModal(false)}
                className="text-muted hover:text-ink transition-colors p-1 rounded-md"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6">
              <div className="flex gap-2 mb-6">
                <input 
                  type="text" 
                  value={newUnit} 
                  onChange={e => setNewUnit(e.target.value)} 
                  placeholder="e.g. Kg, Dozen, Pack, Meter" 
                  className="flex-1 px-3.5 py-2 bg-surface-soft border border-hairline rounded-lg focus:outline-none focus:border-primary transition-colors text-ink text-sm"
                  onKeyDown={e => e.key === 'Enter' && addUnit()}
                  autoFocus
                />
                <button 
                  onClick={addUnit}
                  disabled={!newUnit.trim()}
                  className="px-4 py-2 bg-primary hover:bg-primary-active text-on-primary rounded-lg font-semibold text-xs transition-colors shadow-sm disabled:opacity-50"
                >
                  Add Unit
                </button>
              </div>
              <div className="bg-surface-soft border border-hairline rounded-xl p-4 min-h-[150px] max-h-[300px] overflow-y-auto">
                {customUnits.length === 0 ? (
                  <p className="text-sm text-muted text-center pt-8">No custom units found. Add some above.</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {customUnits.map(unit => (
                      <div key={unit} className="flex items-center gap-2 bg-canvas border border-hairline px-3.5 py-1.5 rounded-full shadow-sm">
                        <span className="text-sm font-medium text-ink">{unit}</span>
                        <button onClick={() => removeUnit(unit)} className="text-muted hover:text-signature-coral transition-colors" title="Delete unit">
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div className="p-4 border-t border-hairline bg-surface-soft flex justify-end">
              <button
                onClick={() => setShowUnitModal(false)}
                className="px-6 py-2 bg-primary text-white rounded-lg font-semibold text-xs transition-colors hover:bg-primary-active shadow-sm"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      <CompanyModal isOpen={showCompanyModal} onClose={() => setShowCompanyModal(false)} />

    </div>
  );
}
