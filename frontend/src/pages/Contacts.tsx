import { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { Search, Plus, X, Users, Truck, Printer } from 'lucide-react';
import { getCustomers, addCustomer, editCustomer, getSuppliers, addSupplier, editSupplier, getPartyLedger, getSaleDetails } from '../lib/db';
import type { Customer, Supplier, LedgerEntry } from '../lib/db';
import { Pencil } from 'lucide-react';
import { Receipt } from '../components/Receipt';
import type { ReceiptData } from '../components/Receipt';
import { PrintableReport } from '../components/PrintableReport';
import type { PrintableReportData } from '../components/PrintableReport';
import { handleFormKeyDown } from '../lib/keyboard';

export default function Contacts() {
  const location = useLocation();
  const [activeTab, setActiveTab] = useState<'customers' | 'suppliers'>((location.state as any)?.activeTab || 'customers');
  const [filterWithBalance, setFilterWithBalance] = useState<boolean>((location.state as any)?.filterWithBalance || false);
  const [search, setSearch] = useState('');

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);

  useEffect(() => {
    if (location.state) {
      if ((location.state as any).activeTab) {
        setActiveTab((location.state as any).activeTab);
      }
      if (typeof (location.state as any).filterWithBalance === 'boolean') {
        setFilterWithBalance((location.state as any).filterWithBalance);
      }
    }
  }, [location.state]);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);

  // Form State
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [gstin, setGstin] = useState('');

  // Ledger State
  const [isLedgerOpen, setIsLedgerOpen] = useState(false);
  const [ledgerData, setLedgerData] = useState<LedgerEntry[]>([]);
  const [ledgerEntityName, setLedgerEntityName] = useState('');
  const [ledgerBalance, setLedgerBalance] = useState(0);
  const [selectedLedgerContact, setSelectedLedgerContact] = useState<Customer | Supplier | null>(null);
  const [printData, setPrintData] = useState<ReceiptData | null>(null);
  const [ledgerReportPrintData, setLedgerReportPrintData] = useState<PrintableReportData | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closeModal();
        setIsLedgerOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  async function loadData() {
    try {
      setCustomers(await getCustomers());
      setSuppliers(await getSuppliers());
    } catch (e) {
      console.error("Failed to load contacts", e);
    }
  }

  async function handleAddContact(e: React.FormEvent) {
    e.preventDefault();
    try {
      const cleanGstin = gstin.trim().toUpperCase();
      if (activeTab === 'customers') {
        if (editingId) {
          await editCustomer(editingId, name, phone, email, address, cleanGstin);
        } else {
          await addCustomer(name, phone, email, address, cleanGstin);
        }
      } else {
        if (editingId) {
          await editSupplier(editingId, name, phone, email, address, cleanGstin);
        } else {
          await addSupplier(name, phone, email, address, cleanGstin);
        }
      }
      closeModal();
      loadData();
    } catch (error) {
      console.error("Failed to save contact", error);
      alert(`Error saving contact: ${error}`);
    }
  }

  function openEditModal(contact: Customer | Supplier) {
    setEditingId(contact.id);
    setName(contact.name);
    setPhone(contact.phone || '');
    setEmail(contact.email || '');
    setAddress(contact.address || '');
    setGstin((contact.gstin || '').toUpperCase());
    setIsModalOpen(true);
  }

  function closeModal() {
    setIsModalOpen(false);
    setEditingId(null);
    setName(''); setPhone(''); setEmail(''); setAddress(''); setGstin('');
  }

  async function openLedger(contact: any) {
    try {
      setSelectedLedgerContact(contact);
      const data = await getPartyLedger(activeTab === 'customers' ? 'customer' : 'supplier', contact.id);
      setLedgerData(data);
      setLedgerEntityName(contact.name);
      setLedgerBalance(contact.balance);
      setIsLedgerOpen(true);
    } catch (e) {
      console.error(e);
      alert("Failed to load ledger: " + e);
    }
  }

  const handlePrintLedgerPDF = () => {
    if (!selectedLedgerContact) return;

    let totalDr = 0;
    let totalCr = 0;
    ledgerData.forEach(e => {
      totalDr += e.debit || 0;
      totalCr += e.credit || 0;
    });

    const printRows = [...ledgerData].reverse().map(e => ({
      ...e,
      formattedDate: e.date.split(' ')[0],
      formattedDebit: e.debit > 0 ? `₹${e.debit.toFixed(2)}` : '-',
      formattedCredit: e.credit > 0 ? `₹${e.credit.toFixed(2)}` : '-',
      formattedBalance: `₹${Math.abs(e.balance).toFixed(2)} ${e.balance >= 0 ? '(Dr)' : '(Cr)'}`
    }));

    setLedgerReportPrintData({
      reportTitle: `${activeTab === 'customers' ? 'CUSTOMER' : 'SUPPLIER'} LEDGER STATEMENT`,
      partyDetails: {
        name: selectedLedgerContact.name,
        phone: selectedLedgerContact.phone || undefined,
        address: selectedLedgerContact.address || undefined,
        gstin: selectedLedgerContact.gstin ? selectedLedgerContact.gstin.toUpperCase() : undefined,
        type: activeTab === 'customers' ? 'Customer' : 'Supplier',
        closingBalance: ledgerBalance
      },
      summaryCards: [
        { label: 'Total Debited (+)', value: `₹${totalDr.toFixed(2)}` },
        { label: 'Total Credited (-)', value: `₹${totalCr.toFixed(2)}` },
        { 
          label: 'Closing Balance', 
          value: `₹${Math.abs(ledgerBalance).toFixed(2)} ${ledgerBalance > 0 ? '(Dr)' : '(Cr)'}`,
          highlight: true
        }
      ],
      columns: [
        { header: 'Date', accessor: 'formattedDate' },
        { header: 'Voucher Type', accessor: 'type' },
        { header: 'Particulars', accessor: 'description' },
        { header: 'Debit (₹)', accessor: 'formattedDebit', align: 'right' },
        { header: 'Credit (₹)', accessor: 'formattedCredit', align: 'right' },
        { header: 'Balance (₹)', accessor: 'formattedBalance', align: 'right' }
      ],
      rows: printRows,
      totalRow: {
        formattedDate: '',
        type: '',
        description: 'Total',
        formattedDebit: `₹${totalDr.toFixed(2)}`,
        formattedCredit: `₹${totalCr.toFixed(2)}`,
        formattedBalance: `₹${Math.abs(ledgerBalance).toFixed(2)} ${ledgerBalance > 0 ? '(Dr)' : '(Cr)'}`
      }
    });

    setTimeout(() => {
      window.print();
    }, 150);
  };

  async function handlePrintSale(invoiceNo: string) {
    try {
      const details = await getSaleDetails(invoiceNo);
      if (details.length === 0) return;
      const detail = details[0];
      
      const allCustomers = await getCustomers();
      const customer = allCustomers.find(c => c.id === detail.entity_id);

      const items = detail.items.map(item => ({
        id: item.product_id,
        name: item.name,
        selling_price: item.unit_price,
        cart_qty: item.quantity,
        gst_percentage: item.gst_percentage || 0,
        cgst_percentage: item.cgst_percentage || 0,
        sgst_percentage: item.sgst_percentage || 0,
        unit: item.unit,
        purchase_price: 0,
        mrp: 0,
        min_stock: 0,
        stock_quantity: 0,
        parent_id: null,
        is_group: false,
        barcode: '',
        model: item.model,
        hsn_code: item.hsn_code || ''
      } as any));

      const subtotal = (detail.net_amount || 0) - (detail.tax_amount || 0) + (detail.discount || 0);
      const originalPriceBasis = items.reduce((sum, i) => sum + (i.selling_price * i.cart_qty), 0);
      const isInclusive = Math.abs((detail.net_amount || 0) - (originalPriceBasis - (detail.discount || 0))) < 0.1;
      const taxMethod = isInclusive ? 'inclusive' : 'exclusive';

      setPrintData({
        invoiceNumber: detail.invoice_number || '',
        date: detail.date.split(' ')[0],
        customerName: detail.entity_name || '',
        customerDetails: customer ? {
          name: customer.name,
          address: customer.address || '',
          phone: customer.phone || '',
          email: customer.email || '',
          gstin: (customer.gstin || '').toUpperCase()
        } : undefined,
        items,
        subtotal,
        taxAmount: detail.tax_amount || 0,
        taxMethod,
        discount: detail.discount || 0,
        netAmount: detail.net_amount || 0,
        paidAmount: detail.paid_amount ?? (detail.status === 'Paid' ? (detail.net_amount || 0) : 0)
      });

      setTimeout(() => {
        window.print();
      }, 100);
    } catch (e) {
      console.error(e);
      alert('Error preparing print data');
    }
  }

  const filteredCustomers = customers.filter(c => {
    if (filterWithBalance && c.balance <= 0) return false;
    return (
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      (c.phone && c.phone.includes(search)) ||
      (c.email && c.email.toLowerCase().includes(search.toLowerCase())) ||
      (c.gstin && c.gstin.toLowerCase().includes(search.toLowerCase()))
    );
  });

  const filteredSuppliers = suppliers.filter(s => {
    if (filterWithBalance && s.balance <= 0) return false;
    return (
      s.name.toLowerCase().includes(search.toLowerCase()) ||
      (s.phone && s.phone.includes(search)) ||
      (s.email && s.email.toLowerCase().includes(search.toLowerCase())) ||
      (s.gstin && s.gstin.toLowerCase().includes(search.toLowerCase()))
    );
  });

  return (
    <>
    <Receipt data={printData} />
    <PrintableReport data={ledgerReportPrintData} />
    <div className="p-8 h-full flex flex-col relative bg-canvas overflow-y-auto print:hidden">
      <header className="mb-12 flex justify-between items-end">
        <div>
          <h1 className="text-4xl font-display font-medium text-ink tracking-tight">Parties Management</h1>
          <p className="text-base text-body mt-2">Manage your customers and suppliers in one place.</p>
        </div>
        <button
          onClick={() => { closeModal(); setIsModalOpen(true); }}
          className="bg-primary hover:bg-primary-active text-on-primary px-6 py-3 rounded-lg font-medium shadow-md hover:shadow-lg flex items-center transition-all"
        >
          <Plus className="w-5 h-5 mr-2" />
          Add {activeTab === 'customers' ? 'Customer' : 'Supplier'}
        </button>
      </header>

      <div className="bg-canvas rounded-xl shadow-sm border border-hairline flex-1 flex flex-col overflow-hidden">
        {/* Toolbar & Tabs */}
        <div className="p-4 border-b border-hairline flex justify-between items-center bg-canvas">
          <div className="flex gap-2">
            <button
              onClick={() => setActiveTab('customers')}
              className={`px-4 py-2 rounded-md font-medium text-sm flex items-center transition-colors ${activeTab === 'customers' ? 'bg-surface-soft text-ink border border-hairline' : 'text-muted hover:text-ink hover:bg-surface-soft border border-transparent'}`}
            >
              <Users className="w-4 h-4 mr-2" />
              Customers
            </button>
            <button
              onClick={() => setActiveTab('suppliers')}
              className={`px-4 py-2 rounded-md font-medium text-sm flex items-center transition-colors ${activeTab === 'suppliers' ? 'bg-surface-soft text-ink border border-hairline' : 'text-muted hover:text-ink hover:bg-surface-soft border border-transparent'}`}
            >
              <Truck className="w-4 h-4 mr-2" />
              Suppliers
            </button>
          </div>

          <div className="flex items-center gap-3">
            {filterWithBalance && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-signature-coral/10 text-signature-coral text-xs font-semibold">
                Showing Outstanding Balance Only
                <button onClick={() => setFilterWithBalance(false)} className="hover:opacity-75" title="Show all parties">
                  <X className="w-3.5 h-3.5" />
                </button>
              </span>
            )}
            <div className="relative w-80">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted w-4 h-4" />
              <input
                type="text"
                placeholder={`Search ${activeTab}...`}
                className="w-full pl-9 pr-4 py-2 bg-canvas border border-hairline rounded-md shadow-sm focus:outline-none focus:border-primary transition-colors text-ink placeholder-muted text-sm"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto flex-1 bg-canvas">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-surface-soft border-b border-hairline text-muted text-xs font-medium uppercase tracking-wider sticky top-0 z-10">
                <th className="px-6 py-4">Name</th>
                <th className="px-6 py-4">Contact Info</th>
                <th className="px-6 py-4">GSTIN</th>
                <th className="px-6 py-4 text-right">Outstanding Balance (₹)</th>
                <th className="px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline">
              {(activeTab === 'customers' ? filteredCustomers : filteredSuppliers).map((contact: any) => (
                <tr key={contact.id} className="hover:bg-surface-soft transition-colors border-b border-hairline last:border-0">
                  <td className="px-6 py-4">
                    <div className="font-medium text-ink">{contact.name}</div>
                    <div className="text-xs text-muted mt-0.5">{contact.address || 'No Address'}</div>
                  </td>
                  <td className="px-6 py-4 text-muted text-sm">
                    {contact.phone && <div className="text-ink">{contact.phone}</div>}
                    {contact.email && <div className="text-xs mt-0.5">{contact.email}</div>}
                    {!contact.phone && !contact.email && <span className="italic text-muted/50">None</span>}
                  </td>
                  <td className="px-6 py-4 font-mono text-muted text-sm uppercase">
                    {contact.gstin ? contact.gstin.toUpperCase() : <span className="italic text-muted/50">N/A</span>}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <span className={`font-medium ${contact.balance > 0 ? 'text-signature-coral' : 'text-ink'}`}>
                      ₹{contact.balance.toFixed(2)}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button
                      onClick={() => openLedger(contact)}
                      className="text-signature-mustard hover:text-signature-mustard-active transition-colors font-medium text-sm mr-4"
                    >
                      Ledger
                    </button>
                    <button
                      onClick={() => openEditModal(contact)}
                      className="text-slate-400 hover:text-blue-600 transition-colors"
                      title="Edit Contact"
                    >
                      <Pencil className="w-5 h-5 inline-block" />
                    </button>
                  </td>
                </tr>
              ))}
              {(activeTab === 'customers' ? filteredCustomers : filteredSuppliers).length === 0 && (
                <tr>
                  <td colSpan={5} className="p-16 text-center text-muted">
                    <div className="flex flex-col items-center justify-center">
                      <div className="w-16 h-16 bg-surface-soft border border-hairline rounded-full flex items-center justify-center mb-4">
                        {activeTab === 'customers' ? <Users className="w-6 h-6 text-muted" /> : <Truck className="w-6 h-6 text-muted" />}
                      </div>
                      <p className="font-medium text-ink">No {activeTab} found.</p>
                      <p className="text-sm mt-1">Click the button above to add one.</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Contact Modal */}
      {isModalOpen && (
        <div className="absolute inset-0 bg-ink/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-canvas rounded-xl shadow-2xl w-full max-w-md overflow-hidden border border-hairline">
            <div className="px-6 py-5 border-b border-hairline flex justify-between items-center bg-surface-soft">
              <h2 className="text-lg font-medium text-ink">{editingId ? 'Edit' : 'Add New'} {activeTab === 'customers' ? 'Customer' : 'Supplier'}</h2>
              <button onClick={closeModal} className="text-muted hover:text-ink transition-colors p-1">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleAddContact} onKeyDown={handleFormKeyDown} className="p-6 flex flex-col gap-5 overflow-y-auto max-h-[80vh]">
              <div>
                <label className="block text-xs font-medium text-muted uppercase tracking-wider mb-2">Name *</label>
                <input required type="text" value={name} onChange={e => setName(e.target.value)} className="w-full px-3 py-2 bg-canvas border border-hairline rounded-sm focus:outline-none focus:border-ink transition-colors text-ink text-sm" placeholder="Business or Person Name" />
              </div>
              <div className="grid grid-cols-2 gap-5">
                <div>
                  <label className="block text-xs font-medium text-muted uppercase tracking-wider mb-2">Phone</label>
                  <input type="text" value={phone} onChange={e => setPhone(e.target.value)} className="w-full px-3 py-2 bg-canvas border border-hairline rounded-sm focus:outline-none focus:border-ink transition-colors text-ink text-sm" placeholder="+91..." />
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted uppercase tracking-wider mb-2">Email</label>
                  <input type="email" value={email} onChange={e => setEmail(e.target.value)} className="w-full px-3 py-2 bg-canvas border border-hairline rounded-sm focus:outline-none focus:border-ink transition-colors text-ink text-sm" placeholder="email@example.com" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-muted uppercase tracking-wider mb-2">GSTIN</label>
                <input type="text" value={gstin} onChange={e => setGstin(e.target.value.toUpperCase())} className="w-full px-3 py-2 bg-canvas border border-hairline rounded-sm focus:outline-none focus:border-ink transition-colors text-ink text-sm uppercase" placeholder="27XXXXX1234X1X1" />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted uppercase tracking-wider mb-2">Full Address</label>
                <textarea rows={3} value={address} onChange={e => setAddress(e.target.value)} className="w-full px-3 py-2 bg-canvas border border-hairline rounded-sm focus:outline-none focus:border-ink transition-colors text-ink text-sm resize-none" placeholder="123 Street Name, City, State, PIN" />
              </div>

              <div className="mt-6 flex justify-end gap-3">
                <button type="button" onClick={closeModal} className="px-4 py-2 text-ink font-medium bg-canvas border border-hairline hover:bg-surface-soft rounded-sm transition-colors text-sm">Cancel</button>
                <button type="submit" className="px-6 py-2 bg-primary hover:bg-primary-active text-on-primary font-medium rounded-lg shadow-sm hover:shadow-md transition-all text-sm">{editingId ? 'Update' : 'Save'} {activeTab === 'customers' ? 'Customer' : 'Supplier'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Ledger Modal */}
      {isLedgerOpen && (
        <div className="absolute inset-0 bg-ink/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-canvas rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden border border-hairline">
            <div className="px-6 py-5 border-b border-hairline flex justify-between items-center bg-surface-soft">
              <div>
                <h2 className="text-xl font-medium text-ink">{ledgerEntityName} - Ledger Statement</h2>
                <div className="text-sm text-muted mt-1">
                  Current Balance: <span className={`font-medium ${ledgerBalance > 0 ? 'text-signature-coral' : 'text-success'}`}>
                    {ledgerBalance > 0 ? `₹${ledgerBalance.toFixed(2)} (Payable/Due)` : `₹${Math.abs(ledgerBalance).toFixed(2)} (Advance/Clear)`}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={handlePrintLedgerPDF}
                  className="bg-primary hover:bg-primary-active text-on-primary px-3.5 py-1.5 rounded-lg font-medium text-xs flex items-center transition-all shadow-xs cursor-pointer"
                  title="Print or Save Ledger Statement as PDF"
                >
                  <Printer className="w-3.5 h-3.5 mr-1.5" />
                  Print / Export Ledger PDF
                </button>
                <button onClick={() => setIsLedgerOpen(false)} className="text-muted hover:text-ink transition-colors p-1">
                  <X className="w-6 h-6" />
                </button>
              </div>
            </div>
            
            <div className="flex-1 overflow-y-auto bg-canvas p-6">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-surface-soft border-b border-hairline text-muted text-xs font-medium uppercase tracking-wider sticky top-0">
                    <th className="px-4 py-3 whitespace-nowrap">Date</th>
                    <th className="px-4 py-3">Type</th>
                    <th className="px-4 py-3">Description</th>
                    <th className="px-4 py-3 text-right">Debit (Dr)</th>
                    <th className="px-4 py-3 text-right">Credit (Cr)</th>
                    <th className="px-4 py-3 text-right">Balance</th>
                    <th className="px-4 py-3 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-hairline">
                  {ledgerData.length === 0 ? (
                    <tr><td colSpan={7} className="p-8 text-center text-muted">No transactions found.</td></tr>
                  ) : (
                    ledgerData.map((entry) => (
                      <tr key={entry.id} className="hover:bg-surface-soft transition-colors">
                        <td className="px-4 py-3 text-sm font-medium text-muted">
                          {new Date(entry.date.split(' ')[0]).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                        </td>
                        <td className="px-4 py-3 text-sm text-ink">{entry.type}</td>
                        <td className="px-4 py-3 text-sm text-ink max-w-xs truncate">{entry.description}</td>
                        <td className="px-4 py-3 text-sm text-right text-signature-coral font-medium">{entry.debit > 0 ? entry.debit.toFixed(2) : '-'}</td>
                        <td className="px-4 py-3 text-sm text-right text-success font-medium">{entry.credit > 0 ? entry.credit.toFixed(2) : '-'}</td>
                        <td className="px-4 py-3 text-sm text-right font-medium text-ink">{entry.balance.toFixed(2)}</td>
                        <td className="px-4 py-3 text-sm text-center">
                          {entry.type === 'Sale' && entry.invoice_number && (
                            <button
                              onClick={() => handlePrintSale(entry.invoice_number!)}
                              className="text-muted hover:text-signature-coral transition-colors"
                              title="Print Invoice"
                            >
                              <Printer className="w-4 h-4 inline-block" />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
    </>
  );
}
