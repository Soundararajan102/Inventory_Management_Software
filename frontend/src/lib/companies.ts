import { resetDbInstance } from './db';

export interface Company {
  id: string;
  name: string;
  dbFile: string;
  code: string;
  shopName: string;
  shopAddress: string;
  shopPhone: string;
  shopGSTIN: string;
  adminPin?: string;
  createdAt: string;
}

export const COMPANY_SETTINGS_KEYS = [
  'shopName',
  'shopAddress',
  'shopPhone',
  'shopGSTIN',
  'gstin',
  'billPrefix',
  'billQuotationPrefix',
  'billYearFormat',
  'billSeparator',
  'billPadding',
  'billNextNumber',
  'quotationNextNumber',
  'enableSalesGST',
  'salesTaxMethod',
  'enablePurchaseGST',
  'purchaseTaxMethod',
  'lowStockThreshold',
  'customUnits',
  'profitTaxMode'
];

const COMPANIES_KEY = 'electrohub_companies_v1';
const ACTIVE_COMPANY_KEY = 'electrohub_active_company_id_v1';
const SETTINGS_PREFIX = 'electrohub_comp_settings_';

export function getDefaultCompany(): Company {
  const currentShopName = localStorage.getItem('shopName') || 'Electro Hub';
  return {
    id: 'comp_default',
    name: `${currentShopName} (Main)`,
    dbFile: 'sqlite:inventory.db',
    code: 'MAIN',
    shopName: currentShopName,
    shopAddress: localStorage.getItem('shopAddress') || '123 Market Street, City',
    shopPhone: localStorage.getItem('shopPhone') || '+91 9876543210',
    shopGSTIN: (localStorage.getItem('shopGSTIN') || localStorage.getItem('gstin') || '27XXXXX1234X1X1').toUpperCase(),
    createdAt: new Date().toISOString()
  };
}

export function getCompanies(): Company[] {
  try {
    const raw = localStorage.getItem(COMPANIES_KEY);
    if (!raw) {
      const def = getDefaultCompany();
      localStorage.setItem(COMPANIES_KEY, JSON.stringify([def]));
      return [def];
    }
    const list: Company[] = JSON.parse(raw);
    if (!list || list.length === 0) {
      const def = getDefaultCompany();
      localStorage.setItem(COMPANIES_KEY, JSON.stringify([def]));
      return [def];
    }
    return list;
  } catch (e) {
    console.error('Failed to parse companies list:', e);
    return [getDefaultCompany()];
  }
}

export function getActiveCompany(): Company {
  const companies = getCompanies();
  const activeId = localStorage.getItem(ACTIVE_COMPANY_KEY);
  const found = companies.find(c => c.id === activeId);
  if (found) return found;
  
  // Default to first company
  const fallback = companies[0] || getDefaultCompany();
  localStorage.setItem(ACTIVE_COMPANY_KEY, fallback.id);
  return fallback;
}

export function getActiveCompanyDbName(): string {
  const active = getActiveCompany();
  return active.dbFile || 'sqlite:inventory.db';
}

export function getDefaultCompanySettings(): Record<string, string> {
  const comp = getDefaultCompany();
  return {
    shopName: comp.shopName,
    shopAddress: comp.shopAddress,
    shopPhone: comp.shopPhone,
    shopGSTIN: comp.shopGSTIN,
    gstin: comp.shopGSTIN,
    billPrefix: '',
    billQuotationPrefix: 'QT',
    billYearFormat: '2digit',
    billSeparator: '-',
    billPadding: '0',
    enableSalesGST: 'true',
    salesTaxMethod: 'exclusive',
    enablePurchaseGST: 'true',
    purchaseTaxMethod: 'exclusive',
    lowStockThreshold: '10',
    profitTaxMode: 'with_gst'
  };
}

export function getCompanySettings(companyId: string): Record<string, string> {
  try {
    const raw = localStorage.getItem(`${SETTINGS_PREFIX}${companyId}`);
    if (raw) {
      return JSON.parse(raw);
    }
  } catch (e) {}

  if (companyId === 'comp_default') {
    return getDefaultCompanySettings();
  }
  return {};
}

export function saveCompanySettings(companyId: string, settings: Record<string, string>): void {
  try {
    localStorage.setItem(`${SETTINGS_PREFIX}${companyId}`, JSON.stringify(settings));
  } catch (e) {
    console.error('Failed to save company settings:', e);
  }
}

export function createCompany(data: {
  name: string;
  code?: string;
  shopName?: string;
  shopAddress?: string;
  shopPhone?: string;
  shopGSTIN?: string;
  adminPin?: string;
}): Company {
  const companies = getCompanies();
  const id = `comp_${Date.now()}`;
  const dbFile = `sqlite:inventory_${id}.db`;
  const cleanName = data.name.trim();
  const cleanCode = (data.code?.trim() || cleanName.substring(0, 4)).toUpperCase();
  const cleanShopName = data.shopName?.trim() || cleanName;
  const cleanAddress = data.shopAddress?.trim() || '';
  const cleanPhone = data.shopPhone?.trim() || '';
  const cleanGSTIN = (data.shopGSTIN?.trim() || '').toUpperCase();
  const cleanPin = (data.adminPin?.trim() || '1234');

  const newCompany: Company = {
    id,
    name: cleanName,
    dbFile,
    code: cleanCode,
    shopName: cleanShopName,
    shopAddress: cleanAddress,
    shopPhone: cleanPhone,
    shopGSTIN: cleanGSTIN,
    adminPin: cleanPin,
    createdAt: new Date().toISOString()
  };

  // Seed default settings for the new company (leave bill format to clean defaults)
  const newSettings: Record<string, string> = {
    shopName: cleanShopName,
    shopAddress: cleanAddress,
    shopPhone: cleanPhone,
    shopGSTIN: cleanGSTIN,
    gstin: cleanGSTIN,
    billPrefix: '',
    billQuotationPrefix: 'QT',
    billYearFormat: '2digit',
    billSeparator: '-',
    billPadding: '0',
    enableSalesGST: 'true',
    salesTaxMethod: 'exclusive',
    enablePurchaseGST: 'true',
    purchaseTaxMethod: 'exclusive',
    lowStockThreshold: '10',
    profitTaxMode: 'with_gst'
  };
  saveCompanySettings(id, newSettings);

  const updated = [...companies, newCompany];
  localStorage.setItem(COMPANIES_KEY, JSON.stringify(updated));
  return newCompany;
}

export function updateCompany(companyId: string, updates: Partial<Company>): void {
  const companies = getCompanies();
  const updated = companies.map(c => {
    if (c.id === companyId) {
      return { ...c, ...updates };
    }
    return c;
  });
  localStorage.setItem(COMPANIES_KEY, JSON.stringify(updated));

  // If updating the active company, sync local storage values
  const active = getActiveCompany();
  if (active.id === companyId) {
    if (updates.shopName) localStorage.setItem('shopName', updates.shopName);
    if (updates.shopAddress) localStorage.setItem('shopAddress', updates.shopAddress);
    if (updates.shopPhone) localStorage.setItem('shopPhone', updates.shopPhone);
    if (updates.shopGSTIN) {
      localStorage.setItem('shopGSTIN', updates.shopGSTIN);
      localStorage.setItem('gstin', updates.shopGSTIN);
    }
  }
}

export function deleteCompany(companyId: string): boolean {
  if (companyId === 'comp_default') {
    alert('The primary/default company cannot be deleted.');
    return false;
  }
  const companies = getCompanies();
  const active = getActiveCompany();
  const updated = companies.filter(c => c.id !== companyId);
  localStorage.setItem(COMPANIES_KEY, JSON.stringify(updated));
  localStorage.removeItem(`${SETTINGS_PREFIX}${companyId}`);

  // If deleting active company, switch to default
  if (active.id === companyId) {
    switchCompany('comp_default');
  } else {
    // If we're already on comp_default, heal any contaminated settings
    sanitizeBillFormatDefaults();
  }
  return true;
}

// Self-heal and sanitize company settings to strictly preserve default bill format (26-1)
export function sanitizeBillFormatDefaults(): void {
  const currentPrefix = localStorage.getItem('billPrefix');
  if (currentPrefix && (currentPrefix === 'RAM-' || currentPrefix.endsWith('-') || currentPrefix === 'RAM')) {
    localStorage.removeItem('billPrefix');
    const quot = localStorage.getItem('billQuotationPrefix');
    if (!quot || quot.includes('RAM') || quot.endsWith('-')) {
      localStorage.setItem('billQuotationPrefix', 'QT');
    }
    const active = getActiveCompany();
    const currentSettings = getCompanySettings(active.id);
    currentSettings.billPrefix = '';
    currentSettings.billQuotationPrefix = 'QT';
    saveCompanySettings(active.id, currentSettings);
    window.dispatchEvent(new Event('preferencesUpdated'));
  }
}

// Run heal check automatically on load
sanitizeBillFormatDefaults();

export function switchCompany(targetId: string): void {
  const current = getActiveCompany();
  if (current.id === targetId) return;

  // 1. Snapshot active company's settings from localStorage
  const currentSettings: Record<string, string> = {};
  COMPANY_SETTINGS_KEYS.forEach(k => {
    const v = localStorage.getItem(k);
    if (v !== null) currentSettings[k] = v;
  });
  saveCompanySettings(current.id, currentSettings);

  // 2. Set active company to targetId
  localStorage.setItem(ACTIVE_COMPANY_KEY, targetId);

  // 3. Clear active company settings from localStorage so nothing bleeds into target company
  COMPANY_SETTINGS_KEYS.forEach(k => {
    localStorage.removeItem(k);
  });

  // 4. Restore target company's settings into localStorage
  const targetSettings = getCompanySettings(targetId);
  if (targetSettings && Object.keys(targetSettings).length > 0) {
    Object.entries(targetSettings).forEach(([k, v]) => {
      localStorage.setItem(k, v);
    });
  }

  // 5. Make sure no leftover contaminated prefix persists
  sanitizeBillFormatDefaults();

  // 6. Clear auth user cache so the user logs in to the target company's admin account
  localStorage.removeItem('auth_user');

  // 7. Reset in-memory database connection
  resetDbInstance();

  // 8. Force full page reload with cache-busting query parameter so all stores & DB connection refresh
  window.location.href = `/?comp=${targetId}&t=${Date.now()}`;
}

export interface FullBackupMetadata {
  format: 'electrohub_full_backup_v1';
  version: string;
  exportedAt: string;
  activeCompanyId: string;
  companies: Company[];
  settings: Record<string, Record<string, string>>;
  dbFiles: string[];
}

export function prepareFullBackupMetadata(): { metadataJson: string; dbFiles: string[] } {
  const companies = getCompanies();
  const active = getActiveCompany();

  // Snapshot active company live settings into its company settings map
  const activeLiveSettings: Record<string, string> = {};
  COMPANY_SETTINGS_KEYS.forEach(k => {
    const v = localStorage.getItem(k);
    if (v !== null) activeLiveSettings[k] = v;
  });
  saveCompanySettings(active.id, activeLiveSettings);

  const allSettings: Record<string, Record<string, string>> = {};
  const dbFilesSet = new Set<string>();

  companies.forEach(c => {
    allSettings[c.id] = getCompanySettings(c.id);
    const dbFileName = c.dbFile ? c.dbFile.replace('sqlite:', '') : 'inventory.db';
    dbFilesSet.add(dbFileName);
  });

  // Always ensure default database file is captured
  dbFilesSet.add('inventory.db');

  const metadata: FullBackupMetadata = {
    format: 'electrohub_full_backup_v1',
    version: '1.0.0',
    exportedAt: new Date().toISOString(),
    activeCompanyId: active.id,
    companies,
    settings: allSettings,
    dbFiles: Array.from(dbFilesSet)
  };

  return {
    metadataJson: JSON.stringify(metadata, null, 2),
    dbFiles: Array.from(dbFilesSet)
  };
}

export function restoreFullBackupMetadata(metadataJson: string): { companyCount: number; activeName: string } {
  const parsed = JSON.parse(metadataJson);
  const companies: Company[] = parsed.companies || [];

  if (!Array.isArray(companies) || companies.length === 0) {
    throw new Error('Backup metadata does not contain valid company records.');
  }

  // 1. Restore companies directory
  localStorage.setItem(COMPANIES_KEY, JSON.stringify(companies));

  // 2. Restore all company settings
  if (parsed.settings && typeof parsed.settings === 'object') {
    Object.entries(parsed.settings).forEach(([compId, settingsObj]) => {
      saveCompanySettings(compId, settingsObj as Record<string, string>);
    });
  }

  // 3. Set active company ID
  const targetActiveId = parsed.activeCompanyId || companies[0].id;
  localStorage.setItem(ACTIVE_COMPANY_KEY, targetActiveId);

  // 4. Clear current live settings from localStorage
  COMPANY_SETTINGS_KEYS.forEach(k => {
    localStorage.removeItem(k);
  });

  // 5. Restore target active company settings into top-level localStorage
  const activeSettings = parsed.settings?.[targetActiveId] || getCompanySettings(targetActiveId);
  if (activeSettings && Object.keys(activeSettings).length > 0) {
    Object.entries(activeSettings).forEach(([k, v]) => {
      localStorage.setItem(k, v as string);
    });
  }

  // 6. Run sanity checks
  sanitizeBillFormatDefaults();
  localStorage.removeItem('auth_user');
  resetDbInstance();

  const activeComp = companies.find(c => c.id === targetActiveId) || companies[0];
  return {
    companyCount: companies.length,
    activeName: activeComp.name
  };
}


