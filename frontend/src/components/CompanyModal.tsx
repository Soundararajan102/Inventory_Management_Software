import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { Building2, Plus, Check, Trash2, Edit3, X, ArrowRight } from 'lucide-react';
import { 
  getCompanies, 
  getActiveCompany, 
  createCompany, 
  updateCompany, 
  deleteCompany, 
  switchCompany, 
  type Company 
} from '../lib/companies';
import { useAuth } from '../lib/AuthContext';

interface CompanyModalProps {
  isOpen: boolean;
  onClose: () => void;
  isReadOnly?: boolean;
}

export function CompanyModal({ isOpen, onClose, isReadOnly = false }: CompanyModalProps) {
  const auth = useAuth();
  const user = auth?.user;
  const [companies, setCompanies] = useState<Company[]>(getCompanies);
  const activeCompany = getActiveCompany();

  // The Main Account (default company admin) is the only account with full
  // management privileges (create, edit, delete companies).
  // On the Login page (isReadOnly = true), it is strictly Switch-Only.
  const isMasterAdmin = !isReadOnly && Boolean(user && user.role === 'admin' && activeCompany.id === 'comp_default');

  const [viewMode, setViewMode] = useState<'list' | 'create' | 'edit'>('list');
  const [editingCompanyId, setEditingCompanyId] = useState<string | null>(null);

  // Form states
  const [formName, setFormName] = useState('');
  const [formCode, setFormCode] = useState('');
  const [formShopName, setFormShopName] = useState('');
  const [formAddress, setFormAddress] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formGSTIN, setFormGSTIN] = useState('');
  const [formAdminPin, setFormAdminPin] = useState('1234');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  function refreshList() {
    setCompanies(getCompanies());
  }

  function openCreateForm() {
    if (!isMasterAdmin) return;
    setFormName('');
    setFormCode('');
    setFormShopName('');
    setFormAddress('');
    setFormPhone('');
    setFormGSTIN('');
    setFormAdminPin('1234');
    setViewMode('create');
  }

  function openEditForm(comp: Company) {
    if (!isMasterAdmin) return;
    setEditingCompanyId(comp.id);
    setFormName(comp.name);
    setFormCode(comp.code || '');
    setFormShopName(comp.shopName || comp.name);
    setFormAddress(comp.shopAddress || '');
    setFormPhone(comp.shopPhone || '');
    setFormGSTIN(comp.shopGSTIN || '');
    setViewMode('edit');
  }

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!formName.trim()) {
      alert('Please enter a Company / Business Name.');
      return;
    }
    setIsSubmitting(true);
    try {
      const newComp = createCompany({
        name: formName,
        code: formCode,
        shopName: formShopName || formName,
        shopAddress: formAddress,
        shopPhone: formPhone,
        shopGSTIN: formGSTIN,
        adminPin: formAdminPin
      });
      refreshList();
      // Automatically switch to the newly created company
      switchCompany(newComp.id);
    } catch (e) {
      console.error(e);
      alert('Error creating company: ' + e);
      setIsSubmitting(false);
    }
  }

  function handleUpdate(e: React.FormEvent) {
    e.preventDefault();
    if (!editingCompanyId || !formName.trim()) return;
    setIsSubmitting(true);
    try {
      updateCompany(editingCompanyId, {
        name: formName.trim(),
        code: formCode.trim().toUpperCase(),
        shopName: formShopName.trim() || formName.trim(),
        shopAddress: formAddress.trim(),
        shopPhone: formPhone.trim(),
        shopGSTIN: formGSTIN.trim().toUpperCase()
      });
      refreshList();
      setViewMode('list');
      setEditingCompanyId(null);
    } catch (e) {
      console.error(e);
      alert('Error updating company: ' + e);
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleDelete(comp: Company) {
    if (!isMasterAdmin) return;
    if (comp.id === 'comp_default') {
      alert('The primary / main company cannot be deleted.');
      return;
    }
    if (!confirm(`Are you sure you want to remove "${comp.name}"?\n\nIts independent data file will be detached from the list.`)) {
      return;
    }
    deleteCompany(comp.id);
    refreshList();
  }

  function handleSelectCompany(comp: Company) {
    if (comp.id === activeCompany.id) return;
    switchCompany(comp.id);
  }

  return createPortal(
    <div 
      className="fixed inset-0 bg-ink/60 backdrop-blur-sm flex items-center justify-center z-[9999] p-4"
      onKeyDown={e => {
        if (e.key === 'Escape') {
          e.stopPropagation();
          onClose();
        }
      }}
    >
      <div className="bg-canvas rounded-xl shadow-2xl w-full max-w-md overflow-hidden border border-hairline animate-in fade-in zoom-in duration-150 flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-hairline flex justify-between items-center bg-surface-soft shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
              <Building2 className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-ink">
                {viewMode === 'list' && 'Switch Business / Company'}
                {viewMode === 'create' && 'Create New Company / Branch'}
                {viewMode === 'edit' && 'Edit Company Details'}
              </h2>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-muted hover:text-ink transition-colors p-1.5 rounded-md hover:bg-surface-strong cursor-pointer"
            title="Close (Esc)"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 overflow-y-auto flex-1">
          {viewMode === 'list' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-muted uppercase tracking-wider">
                  Available Businesses ({companies.length})
                </span>
                {isMasterAdmin && (
                  <button
                    type="button"
                    onClick={openCreateForm}
                    className="px-2.5 py-1 text-xs font-semibold bg-primary hover:bg-primary-active text-on-primary rounded-md flex items-center gap-1.5 transition-colors shadow-2xs cursor-pointer active:scale-[0.98]"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>New Company</span>
                  </button>
                )}
              </div>

              <div className="space-y-2">
                {companies.map(comp => {
                  const isActive = comp.id === activeCompany.id;
                  return (
                    <div
                      key={comp.id}
                      className={`p-3 rounded-lg border transition-all ${
                        isActive
                          ? 'border-primary bg-primary/5 shadow-2xs'
                          : 'border-hairline bg-surface-soft/60 hover:bg-surface-soft hover:border-hairline/80'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        {/* Company Identity */}
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                            isActive ? 'bg-primary text-on-primary font-bold text-xs' : 'bg-surface-strong text-muted font-semibold text-xs'
                          }`}>
                            {comp.code ? comp.code.substring(0, 2) : <Building2 className="w-4 h-4" />}
                          </div>
                          <span className="text-xs font-bold text-ink truncate">{comp.name}</span>
                        </div>

                        {/* Actions & Status Pill */}
                        <div className="flex items-center gap-1.5 shrink-0">
                          {isMasterAdmin && (
                            <button
                              type="button"
                              onClick={() => openEditForm(comp)}
                              className="p-1.5 text-muted hover:text-ink hover:bg-surface-strong rounded-md transition-colors cursor-pointer"
                              title="Edit Details"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                          )}
                          
                          {isMasterAdmin && comp.id !== 'comp_default' && (
                            <button
                              type="button"
                              onClick={() => handleDelete(comp)}
                              className="p-1.5 text-muted hover:text-signature-coral hover:bg-signature-coral/10 rounded-md transition-colors cursor-pointer"
                              title="Delete Company"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}

                          {isActive ? (
                            <span className="px-2.5 py-1 text-xs font-semibold rounded-md bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30 flex items-center gap-1 shrink-0">
                              <Check className="w-3 h-3" /> Active
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleSelectCompany(comp)}
                              className="px-3 py-1 text-xs font-semibold rounded-md bg-primary hover:bg-primary-active text-on-primary transition-colors flex items-center gap-1 cursor-pointer active:scale-[0.98] shadow-2xs"
                            >
                              <span>Switch</span>
                              <ArrowRight className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {(viewMode === 'create' || viewMode === 'edit') && (
            <form onSubmit={viewMode === 'create' ? handleCreate : handleUpdate} className="space-y-4 text-xs">
              <div>
                <label className="text-[11px] font-semibold text-ink block mb-1">
                  Company / Business Name *
                </label>
                <input
                  type="text"
                  placeholder="e.g. Electro Hub Wholesale / Branch 2"
                  value={formName}
                  onChange={e => setFormName(e.target.value)}
                  className="w-full px-3 py-2 bg-canvas border border-hairline rounded-lg text-ink placeholder:text-muted focus:outline-none focus:border-primary text-xs shadow-2xs"
                  required
                  autoFocus
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-semibold text-ink block mb-1">
                    Short Tag / Code (for Bill Prefix)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. EHW / BR2"
                    value={formCode}
                    onChange={e => setFormCode(e.target.value.toUpperCase())}
                    className="w-full px-3 py-2 bg-canvas border border-hairline rounded-lg text-ink placeholder:text-muted focus:outline-none focus:border-primary uppercase font-mono text-xs shadow-2xs"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-semibold text-ink block mb-1">
                    Shop / Trade Display Name
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Electro Hub Electronics"
                    value={formShopName}
                    onChange={e => setFormShopName(e.target.value)}
                    className="w-full px-3 py-2 bg-canvas border border-hairline rounded-lg text-ink placeholder:text-muted focus:outline-none focus:border-primary text-xs shadow-2xs"
                  />
                </div>
              </div>

              <div>
                <label className="text-[11px] font-semibold text-ink block mb-1">
                  Shop Address (Printed on Invoices)
                </label>
                <input
                  type="text"
                  placeholder="e.g. 45 Station Road, Coimbatore - 641001"
                  value={formAddress}
                  onChange={e => setFormAddress(e.target.value)}
                  className="w-full px-3 py-2 bg-canvas border border-hairline rounded-lg text-ink placeholder:text-muted focus:outline-none focus:border-primary text-xs shadow-2xs"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-semibold text-ink block mb-1">
                    Phone / Mobile
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. +91 9443210000"
                    value={formPhone}
                    onChange={e => setFormPhone(e.target.value)}
                    className="w-full px-3 py-2 bg-canvas border border-hairline rounded-lg text-ink placeholder:text-muted focus:outline-none focus:border-primary text-xs shadow-2xs"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-semibold text-ink block mb-1">
                    GSTIN
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. 33AAAAA0000A1Z5"
                    value={formGSTIN}
                    onChange={e => setFormGSTIN(e.target.value.toUpperCase())}
                    className="w-full px-3 py-2 bg-canvas border border-hairline rounded-lg text-ink placeholder:text-muted focus:outline-none focus:border-primary uppercase font-mono text-xs shadow-2xs"
                  />
                </div>
              </div>

              {viewMode === 'create' && (
                <div className="pt-2 border-t border-hairline">
                  <label className="text-[11px] font-semibold text-ink block mb-1">
                    Initial Admin PIN (for login into this company)
                  </label>
                  <input
                    type="password"
                    inputMode="numeric"
                    placeholder="1234"
                    value={formAdminPin}
                    onChange={e => setFormAdminPin(e.target.value)}
                    className="w-32 px-3 py-2 bg-canvas border border-hairline rounded-lg text-ink placeholder:text-muted focus:outline-none focus:border-primary font-mono tracking-widest text-xs shadow-2xs"
                  />
                  <p className="text-[10px] text-muted mt-1">
                    Default is 1234. You can change this anytime in Settings &gt; Staff.
                  </p>
                </div>
              )}

              {/* Form Buttons */}
              <div className="pt-3 border-t border-hairline flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => {
                    setViewMode('list');
                    setEditingCompanyId(null);
                  }}
                  className="px-3 py-1.5 text-xs font-medium text-muted hover:text-ink transition-colors cursor-pointer"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 text-xs font-semibold rounded-lg bg-primary hover:bg-primary-active text-on-primary transition-all shadow-sm cursor-pointer flex items-center gap-1.5 active:scale-[0.98]"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>
                    {isSubmitting
                      ? 'Saving...'
                      : viewMode === 'create'
                      ? 'Create & Switch to Business'
                      : 'Save Changes'}
                  </span>
                </button>
              </div>
            </form>
          )}
        </div>

        {/* Footer for list view */}
        {viewMode === 'list' && (
          <div className="px-5 py-3 border-t border-hairline bg-surface-soft flex items-center justify-between shrink-0">
            <span className="text-[11px] text-muted">
              Current: <span className="font-semibold text-ink">{activeCompany.name}</span>
            </span>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-1.5 text-xs font-semibold rounded-lg bg-canvas hover:bg-surface-strong border border-hairline text-ink transition-colors cursor-pointer"
            >
              Done (Esc)
            </button>
          </div>
        )}

      </div>
    </div>,
    document.body
  );
}

