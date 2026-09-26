import { useState, useEffect } from 'react';
import { Database, Download, Upload, AlertTriangle, X, Trash2 } from 'lucide-react';
import { save, open, confirm } from '@tauri-apps/plugin-dialog';
import { copyFile } from '@tauri-apps/plugin-fs';
import { appDataDir, join } from '@tauri-apps/api/path';
import * as OTPAuth from 'otpauth';
import Staff from './Staff';
import { wipeAllData } from '../lib/db';


export default function Settings() {
  const [status, setStatus] = useState<{ type: 'success' | 'error', message: string } | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  
  const [showWipeModal, setShowWipeModal] = useState(false);
  const [wipeCode, setWipeCode] = useState('');
  const [wipeError, setWipeError] = useState('');

  const [activeTab, setActiveTab] = useState<'staff' | 'preferences' | 'backup'>('staff');
  
  const [shopName, setShopName] = useState(() => localStorage.getItem('shopName') || 'Electro Hub');
  const [shopAddress, setShopAddress] = useState(() => localStorage.getItem('shopAddress') || '123 Market Street, City');
  const [shopPhone, setShopPhone] = useState(() => localStorage.getItem('shopPhone') || '+91 9876543210');
  const [shopGSTIN, setShopGSTIN] = useState(() => localStorage.getItem('shopGSTIN') || '27XXXXX1234X1X1');

  const updateShopDetail = (key: string, value: string, setter: React.Dispatch<React.SetStateAction<string>>) => {
    setter(value);
    localStorage.setItem(key, value);
    window.dispatchEvent(new Event('preferencesUpdated'));
  };

  const [hideShortcuts, setHideShortcuts] = useState(() => {
    return localStorage.getItem('hideShortcuts') === 'true';
  });
  const [enableSalesGST, setEnableSalesGST] = useState(() => {
    const val = localStorage.getItem('enableSalesGST');
    if (val !== null) return val !== 'false';
    return localStorage.getItem('enableGST') !== 'false'; // fallback to legacy
  });
  const [salesTaxMethod, setSalesTaxMethod] = useState<'exclusive' | 'inclusive'>(() => {
    const val = localStorage.getItem('salesTaxMethod') as 'exclusive' | 'inclusive';
    if (val) return val;
    return (localStorage.getItem('taxMethod') as 'exclusive' | 'inclusive') || 'exclusive'; // fallback to legacy
  });

  const [enablePurchaseGST, setEnablePurchaseGST] = useState(() => {
    const val = localStorage.getItem('enablePurchaseGST');
    if (val !== null) return val !== 'false';
    return localStorage.getItem('enableGST') !== 'false'; // fallback to legacy
  });
  const [purchaseTaxMethod, setPurchaseTaxMethod] = useState<'exclusive' | 'inclusive'>(() => {
    const val = localStorage.getItem('purchaseTaxMethod') as 'exclusive' | 'inclusive';
    if (val) return val;
    return (localStorage.getItem('taxMethod') as 'exclusive' | 'inclusive') || 'exclusive'; // fallback to legacy
  });
  
  const [lowStockThreshold, setLowStockThreshold] = useState(() => {
    return localStorage.getItem('lowStockThreshold') || '10';
  });

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowWipeModal(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleLowStockChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.replace(/\D/g, '');
    setLowStockThreshold(val);
    localStorage.setItem('lowStockThreshold', val || '0');
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

  const toggleSalesGST = () => {
    const newValue = !enableSalesGST;
    setEnableSalesGST(newValue);
    localStorage.setItem('enableSalesGST', newValue ? 'true' : 'false');
    window.dispatchEvent(new Event('preferencesUpdated'));
  };

  const toggleSalesTaxMethod = () => {
    const newMethod = salesTaxMethod === 'exclusive' ? 'inclusive' : 'exclusive';
    setSalesTaxMethod(newMethod);
    localStorage.setItem('salesTaxMethod', newMethod);
    window.dispatchEvent(new Event('preferencesUpdated'));
  };

  const togglePurchaseGST = () => {
    const newValue = !enablePurchaseGST;
    setEnablePurchaseGST(newValue);
    localStorage.setItem('enablePurchaseGST', newValue ? 'true' : 'false');
    window.dispatchEvent(new Event('preferencesUpdated'));
  };

  const togglePurchaseTaxMethod = () => {
    const newMethod = purchaseTaxMethod === 'exclusive' ? 'inclusive' : 'exclusive';
    setPurchaseTaxMethod(newMethod);
    localStorage.setItem('purchaseTaxMethod', newMethod);
    window.dispatchEvent(new Event('preferencesUpdated'));
  };

  const handleBackup = async () => {
    try {
      setIsLoading(true);
      setStatus(null);
      
      const savePath = await save({
        filters: [{
          name: 'SQLite Database',
          extensions: ['db']
        }],
        defaultPath: 'inventory_backup.db'
      });

      if (!savePath) {
        setIsLoading(false);
        return;
      }

      // We need to copy from appDataDir/inventory.db to the chosen savePath.
      const appDataDirPath = await appDataDir();
      const sourcePath = await join(appDataDirPath, 'inventory.db');

      await copyFile(sourcePath, savePath);

      setStatus({ type: 'success', message: `Database successfully backed up to ${savePath}` });
    } catch (e: any) {
      console.error(e);
      const errorMessage = typeof e === 'string' ? e : (e?.message || 'Failed to create backup');
      setStatus({ type: 'error', message: errorMessage });
    } finally {
      setIsLoading(false);
    }
  };

  const handleRestore = async () => {
    if (!confirm('WARNING: Restoring a backup will overwrite all current data. This action cannot be undone. Do you wish to continue?')) {
      return;
    }

    try {
      setIsLoading(true);
      setStatus(null);

      const openPath = await open({
        filters: [{
          name: 'SQLite Database',
          extensions: ['db']
        }],
        multiple: false
      });

      if (!openPath) {
        setIsLoading(false);
        return;
      }

      const appDataDirPath = await appDataDir();
      const destPath = await join(appDataDirPath, 'inventory.db');

      // Copy the selected backup file over the current database
      await copyFile(openPath as string, destPath);

      setStatus({ type: 'success', message: 'Database successfully restored! Please restart the application to apply changes.' });
      
      // Optionally, we could force reload the window to re-init the DB
      setTimeout(() => {
        window.location.reload();
      }, 3000);

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
      <div className="p-8 pb-4 shrink-0">
        <h1 className="text-4xl font-display font-medium text-ink tracking-tight">Settings</h1>
        <p className="text-base text-body mt-2">Manage your app preferences, staff, and database backups.</p>
      </div>

      <div className="px-8 border-b border-hairline shrink-0">
        <div className="flex gap-6">
          <button
            onClick={() => setActiveTab('staff')}
            className={`pb-4 font-medium text-sm transition-colors border-b-2 ${
              activeTab === 'staff' ? 'text-primary border-primary' : 'text-muted hover:text-ink border-transparent'
            }`}
          >
            Staff Management
          </button>
          <button
            onClick={() => setActiveTab('preferences')}
            className={`pb-4 font-medium text-sm transition-colors border-b-2 ${
              activeTab === 'preferences' ? 'text-primary border-primary' : 'text-muted hover:text-ink border-transparent'
            }`}
          >
            Preferences
          </button>
          <button
            onClick={() => setActiveTab('backup')}
            className={`pb-4 font-medium text-sm transition-colors border-b-2 ${
              activeTab === 'backup' ? 'text-primary border-primary' : 'text-muted hover:text-ink border-transparent'
            }`}
          >
            Backup & Restore
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {activeTab === 'staff' && (
          <div className="h-full">
            <Staff />
          </div>
        )}

        {activeTab === 'preferences' && (
          <div className="p-8 max-w-4xl space-y-8">
            
            {/* Shop Details Section */}
            <section>
              <h3 className="text-sm font-bold text-ink uppercase tracking-wider mb-4">Shop Details (For Invoice)</h3>
              <div className="bg-canvas rounded-xl shadow-sm border border-hairline overflow-hidden">
                <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-bold text-ink mb-2">Shop Name</label>
                    <input 
                      type="text" 
                      value={shopName} 
                      onChange={e => updateShopDetail('shopName', e.target.value, setShopName)}
                      className="w-full px-3 py-2 bg-surface-soft border border-hairline rounded-md focus:outline-none focus:border-ink transition-colors text-ink font-medium"
                      placeholder="Electro Hub"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-ink mb-2">Phone Number</label>
                    <input 
                      type="text" 
                      value={shopPhone} 
                      onChange={e => updateShopDetail('shopPhone', e.target.value, setShopPhone)}
                      className="w-full px-3 py-2 bg-surface-soft border border-hairline rounded-md focus:outline-none focus:border-ink transition-colors text-ink font-medium"
                      placeholder="+91 9876543210"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-sm font-bold text-ink mb-2">Shop Address</label>
                    <input 
                      type="text" 
                      value={shopAddress} 
                      onChange={e => updateShopDetail('shopAddress', e.target.value, setShopAddress)}
                      className="w-full px-3 py-2 bg-surface-soft border border-hairline rounded-md focus:outline-none focus:border-ink transition-colors text-ink font-medium"
                      placeholder="123 Market Street, City"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-sm font-bold text-ink mb-2">GSTIN</label>
                    <input 
                      type="text" 
                      value={shopGSTIN} 
                      onChange={e => updateShopDetail('shopGSTIN', e.target.value, setShopGSTIN)}
                      className="w-full px-3 py-2 bg-surface-soft border border-hairline rounded-md focus:outline-none focus:border-ink transition-colors text-ink font-medium uppercase"
                      placeholder="27XXXXX1234X1X1"
                    />
                  </div>
                </div>
              </div>
            </section>

            {/* User Interface Section */}
            <section>
              <h3 className="text-sm font-bold text-ink uppercase tracking-wider mb-4">User Interface</h3>
              <div className="bg-canvas rounded-xl shadow-sm border border-hairline overflow-hidden">
                <div className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-bold text-ink">Keyboard Shortcuts in Sidebar</p>
                      <p className="text-sm text-muted">Show the shortcut hints (^1, ^2) next to menu items</p>
                    </div>
                    <button
                      onClick={toggleShortcuts}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${!hideShortcuts ? 'bg-primary' : 'bg-surface-strong'}`}
                    >
                      <span className={`inline-block h-4 w-4 transform rounded-full bg-canvas transition-transform ${!hideShortcuts ? 'translate-x-6' : 'translate-x-1'}`} />
                    </button>
                  </div>
                </div>
              </div>
            </section>

            {/* Sales Tax Section */}
            <section>
              <h3 className="text-sm font-bold text-ink uppercase tracking-wider mb-4">Sales / Billing Tax</h3>
              <div className="bg-canvas rounded-xl shadow-sm border border-hairline overflow-hidden">
                <div className="p-6 space-y-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-bold text-ink">Enable GST for Sales</p>
                      <p className="text-sm text-muted">Include GST in customer bills and print on receipts</p>
                    </div>
                    <button
                      onClick={toggleSalesGST}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${enableSalesGST ? 'bg-primary' : 'bg-surface-strong'}`}
                    >
                      <span className={`inline-block h-4 w-4 transform rounded-full bg-canvas transition-transform ${enableSalesGST ? 'translate-x-6' : 'translate-x-1'}`} />
                    </button>
                  </div>

                  {enableSalesGST && (
                    <div className="flex items-center justify-between pt-6 border-t border-hairline">
                      <div>
                        <p className="font-bold text-ink">Sales Tax Method</p>
                        <p className="text-sm text-muted">
                          {salesTaxMethod === 'exclusive' 
                            ? 'Exclusive: Tax is added on top of the selling price' 
                            : 'Inclusive: Selling price already includes the tax'}
                        </p>
                      </div>
                      <button
                        onClick={toggleSalesTaxMethod}
                        className={`relative inline-flex h-8 w-32 items-center justify-center rounded-md border border-hairline transition-colors ${salesTaxMethod === 'inclusive' ? 'bg-primary text-white border-primary' : 'bg-surface-soft text-ink hover:bg-canvas'}`}
                      >
                        <span className="text-xs font-bold uppercase">{salesTaxMethod}</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </section>

            {/* Purchase Tax Section */}
            <section>
              <h3 className="text-sm font-bold text-ink uppercase tracking-wider mb-4">Purchase Tax</h3>
              <div className="bg-canvas rounded-xl shadow-sm border border-hairline overflow-hidden">
                <div className="p-6 space-y-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-bold text-ink">Enable GST for Purchases</p>
                      <p className="text-sm text-muted">Include GST when bringing in new inventory</p>
                    </div>
                    <button
                      onClick={togglePurchaseGST}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${enablePurchaseGST ? 'bg-primary' : 'bg-surface-strong'}`}
                    >
                      <span className={`inline-block h-4 w-4 transform rounded-full bg-canvas transition-transform ${enablePurchaseGST ? 'translate-x-6' : 'translate-x-1'}`} />
                    </button>
                  </div>

                  {enablePurchaseGST && (
                    <div className="flex items-center justify-between pt-6 border-t border-hairline">
                      <div>
                        <p className="font-bold text-ink">Purchase Tax Method</p>
                        <p className="text-sm text-muted">
                          {purchaseTaxMethod === 'exclusive' 
                            ? 'Exclusive: Tax is added on top of the purchase price' 
                            : 'Inclusive: Purchase price already includes the tax'}
                        </p>
                      </div>
                      <button
                        onClick={togglePurchaseTaxMethod}
                        className={`relative inline-flex h-8 w-32 items-center justify-center rounded-md border border-hairline transition-colors ${purchaseTaxMethod === 'inclusive' ? 'bg-primary text-white border-primary' : 'bg-surface-soft text-ink hover:bg-canvas'}`}
                      >
                        <span className="text-xs font-bold uppercase">{purchaseTaxMethod}</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </section>

            {/* Inventory Section */}
            <section>
              <h3 className="text-sm font-bold text-ink uppercase tracking-wider mb-4">Inventory</h3>
              <div className="bg-canvas rounded-xl shadow-sm border border-hairline overflow-hidden">
                <div className="p-6 space-y-6">
                  <div className="flex items-center justify-between">
                    <div className="flex-1 pr-4">
                      <p className="font-bold text-ink">Low Stock Alert Threshold</p>
                      <p className="text-sm text-muted">Items with quantity below this number will be flagged on the dashboard</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <input 
                        type="text" 
                        value={lowStockThreshold} 
                        onChange={handleLowStockChange}
                        className="w-16 px-3 py-1.5 bg-surface-soft border border-hairline rounded-md focus:outline-none focus:border-ink transition-colors text-ink text-center font-medium"
                      />
                      <span className="text-sm text-muted">items</span>
                    </div>
                  </div>
                  
                  <div className="pt-6 border-t border-hairline flex items-center justify-between">
                    <div>
                      <h3 className="text-md font-bold text-ink">Custom Unit Types</h3>
                      <p className="text-sm text-muted">Manage the units used for inventory items (e.g., Kg, Box, Pack)</p>
                    </div>
                    <button
                      onClick={() => setShowUnitModal(true)}
                      className="px-4 py-2 bg-surface-soft border border-hairline hover:bg-canvas rounded-md font-medium text-sm transition-colors text-ink"
                    >
                      Manage Units
                    </button>
                  </div>
                </div>
              </div>
            </section>
          </div>
        )}

        {activeTab === 'backup' && (
          <div className="p-8 max-w-3xl">
            <div className="bg-canvas rounded-xl shadow-sm border border-hairline overflow-hidden">
              <div className="p-6 border-b border-hairline bg-surface-soft flex items-center gap-3">
                <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
                  <Database className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-ink">Data Backup & Restore</h2>
                  <p className="text-sm text-muted">Secure your data or restore from a previous backup</p>
                </div>
              </div>

              <div className="p-8">
                {status && (
                  <div className={`mb-8 p-4 rounded-xl border flex items-start ${
                    status.type === 'success' ? 'bg-success/10 border-success/30 text-success' : 'bg-signature-coral/10 border-signature-coral/30 text-signature-coral'
                  }`}>
                    {status.type === 'error' && <AlertTriangle className="w-5 h-5 mr-3 shrink-0 mt-0.5" />}
                    <p className="font-medium">{status.message}</p>
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <button
                    onClick={handleBackup}
                    disabled={isLoading}
                    className="group relative overflow-hidden bg-canvas border border-hairline hover:border-primary rounded-xl p-8 flex flex-col items-center justify-center transition-all hover:bg-surface-soft hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <div className="w-12 h-12 bg-primary/10 text-primary rounded-full flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                      <Download className="w-6 h-6" />
                    </div>
                    <h2 className="text-lg font-bold text-ink">Create Backup</h2>
                    <p className="text-sm text-muted text-center mt-2">Save a copy of your database to an external drive</p>
                  </button>

                  <button
                    onClick={handleRestore}
                    disabled={isLoading}
                    className="group relative overflow-hidden bg-canvas border border-hairline hover:border-signature-coral rounded-xl p-8 flex flex-col items-center justify-center transition-all hover:bg-surface-soft hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <div className="w-12 h-12 bg-signature-coral/10 text-signature-coral rounded-full flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                      <Upload className="w-6 h-6" />
                    </div>
                    <h2 className="text-lg font-bold text-ink">Restore Data</h2>
                    <p className="text-sm text-muted text-center mt-2">Replace current data with a previous backup file</p>
                  </button>

                </div>
              </div>
            </div>

            <div className="bg-canvas rounded-xl shadow-sm border border-signature-coral/30 overflow-hidden mt-8">
              <div className="p-6 border-b border-signature-coral/20 bg-signature-coral/5 flex items-center gap-3">
                <div className="w-10 h-10 bg-signature-coral/10 rounded-lg flex items-center justify-center">
                  <AlertTriangle className="w-5 h-5 text-signature-coral" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-signature-coral">Danger Zone</h2>
                  <p className="text-sm text-signature-coral/80">Irreversible destructive actions</p>
                </div>
              </div>
              <div className="p-8 bg-signature-coral/5">
                <div className="flex flex-col md:flex-row items-center justify-between gap-6">
                  <div>
                    <h3 className="text-base font-bold text-ink">Wipe All Data</h3>
                    <p className="text-sm text-muted mt-1 max-w-xl">Permanently delete all products, sales, purchases, and contacts. This action cannot be undone and will reset the database to its initial state.</p>
                  </div>
                  <button
                    onClick={handleWipeData}
                    disabled={isLoading}
                    className="flex items-center gap-2 bg-signature-coral hover:bg-red-600 text-white px-6 py-3 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed shrink-0 shadow-sm"
                  >
                    <Trash2 className="w-5 h-5" />
                    Wipe Data
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {showWipeModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-canvas w-full max-w-md rounded-2xl shadow-xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between p-6 border-b border-hairline bg-signature-coral/5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-signature-coral/10 flex items-center justify-center text-signature-coral">
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-signature-coral">Wipe All Data</h3>
                  <p className="text-xs text-signature-coral/80 font-medium">Irreversible Action</p>
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
                Please enter the 6-digit <strong>Activation Code</strong> (ask your vendor) to confirm this action.
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

      {showUnitModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-canvas w-full max-w-lg rounded-2xl shadow-xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between p-6 border-b border-hairline">
              <h2 className="text-xl font-bold text-ink">Manage Unit Types</h2>
              <button 
                onClick={() => setShowUnitModal(false)}
                className="text-muted hover:text-ink transition-colors"
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
                  placeholder="e.g. Kg, Dozen, Pack" 
                  className="flex-1 px-3 py-2 bg-surface-soft border border-hairline rounded-md focus:outline-none focus:border-primary transition-colors text-ink text-sm"
                  onKeyDown={e => e.key === 'Enter' && addUnit()}
                  autoFocus
                />
                <button 
                  onClick={addUnit}
                  className="px-4 py-2 bg-primary hover:bg-primary-active text-on-primary rounded-md font-medium text-sm transition-colors"
                >
                  Add Unit
                </button>
              </div>
              <div className="bg-surface-soft border border-hairline rounded-lg p-4 min-h-[150px] max-h-[300px] overflow-y-auto">
                {customUnits.length === 0 ? (
                  <p className="text-sm text-muted text-center pt-8">No custom units found. Add some above.</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {customUnits.map(unit => (
                      <div key={unit} className="flex items-center gap-2 bg-canvas border border-hairline px-3 py-1.5 rounded-full shadow-sm">
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
                className="px-6 py-2 bg-ink text-canvas rounded-lg font-medium transition-colors hover:bg-ink/90"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
