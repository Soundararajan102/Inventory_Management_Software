import { useState, useEffect } from 'react';
import { 
  Search, 
  X, 
  Users, 
  Truck, 
  IndianRupee, 
  Clock, 
  Printer, 
  CreditCard, 
  CheckCircle2, 
  Calendar, 
  Check, 
  AlertCircle,
  Building2
} from 'lucide-react';
import { 
  getCustomers, 
  getSuppliers, 
  recordPayment, 
  getPaymentsHistory, 
  getChequesRegister, 
  clearPdcCheque, 
  bounceCheque,
  isPdcDate
} from '../lib/db';
import type { Customer, Supplier, PaymentHistory } from '../lib/db';
import { PrintableReport } from '../components/PrintableReport';
import type { PrintableReportData } from '../components/PrintableReport';

function getTodayString(): string {
  const d = new Date();
  const offset = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - offset).toISOString().split('T')[0];
}

function getPdcDaysLabel(dateStr?: string | null): { text: string; isPast: boolean; isToday: boolean } {
  if (!dateStr) return { text: '', isPast: false, isToday: false };
  const todayStr = getTodayString();
  
  if (dateStr === todayStr) {
    return { text: 'Due Today', isPast: false, isToday: true };
  }
  
  const targetDate = new Date(dateStr).getTime();
  const todayDate = new Date(todayStr).getTime();
  const diffDays = Math.round((targetDate - todayDate) / (1000 * 60 * 60 * 24));
  
  if (diffDays > 0) {
    return { text: `Due in ${diffDays} day${diffDays > 1 ? 's' : ''}`, isPast: false, isToday: false };
  } else {
    return { text: `${Math.abs(diffDays)} day${Math.abs(diffDays) > 1 ? 's' : ''} overdue`, isPast: true, isToday: false };
  }
}

export default function Payments() {
  const [activeTab, setActiveTab] = useState<'customers' | 'suppliers' | 'cheques'>('customers');
  const [search, setSearch] = useState('');
  
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [history, setHistory] = useState<PaymentHistory[]>([]);
  const [cheques, setCheques] = useState<PaymentHistory[]>([]);
  
  const [showHistory, setShowHistory] = useState(false);
  const [chequeStatusFilter, setChequeStatusFilter] = useState<'all' | 'pdc_pending' | 'cleared' | 'bounced'>('all');
  
  const [selectedEntity, setSelectedEntity] = useState<Customer | Supplier | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  
  // Payment Form State
  const [amount, setAmount] = useState<number | ''>('');
  const [paymentMode, setPaymentMode] = useState<'Cash' | 'UPI' | 'Bank Transfer' | 'Cheque'>('Cash');
  const [chequeNo, setChequeNo] = useState('');
  const [bankName, setBankName] = useState('');
  const [chequeDate, setChequeDate] = useState(getTodayString());
  const [referenceNo, setReferenceNo] = useState('');
  const [notes, setNotes] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [printReportData, setPrintReportData] = useState<PrintableReportData | null>(null);

  useEffect(() => {
    loadData();
  }, [activeTab]);

  async function loadData() {
    try {
      const [custs, supps, chqs] = await Promise.all([
        getCustomers(),
        getSuppliers(),
        getChequesRegister()
      ]);
      setCustomers(custs);
      setSuppliers(supps);
      setCheques(chqs);

      if (activeTab === 'customers' || activeTab === 'suppliers') {
        const type = activeTab === 'customers' ? 'customer' : 'supplier';
        setHistory(await getPaymentsHistory(type));
      }
    } catch (e) {
      console.error(e);
    }
  }

  const openPaymentModal = (entity: Customer | Supplier) => {
    setSelectedEntity(entity);
    setAmount(entity.balance); // Default to full balance
    setPaymentMode('Cash');
    setChequeNo('');
    setBankName('');
    setChequeDate(getTodayString());
    setReferenceNo('');
    setNotes('');
    setIsModalOpen(true);
  };

  async function handleRecordPayment(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedEntity || amount === '' || amount <= 0) return;
    
    if (Number(amount) > selectedEntity.balance + 0.01) {
      alert(`Payment amount (₹${Number(amount).toFixed(2)}) cannot exceed outstanding balance of ₹${selectedEntity.balance.toFixed(2)}.`);
      return;
    }

    if (paymentMode === 'Cheque' && !chequeNo.trim()) {
      alert('Please enter the Cheque Number');
      return;
    }

    setIsProcessing(true);
    try {
      const type = activeTab === 'suppliers' ? 'supplier' : 'customer';
      const res = await recordPayment(
        type, 
        selectedEntity.id, 
        Number(amount), 
        paymentMode, 
        referenceNo, 
        notes,
        paymentMode === 'Cheque' ? chequeNo.trim() : null,
        paymentMode === 'Cheque' ? bankName.trim() : null,
        paymentMode === 'Cheque' ? chequeDate : null
      );
      
      if (res.isPDC) {
        alert(
          `📅 Post-Dated Cheque (PDC) recorded for ${chequeDate}!\n\n` +
          `• Cheque No: ${chequeNo}\n` +
          `• Bank: ${bankName || 'N/A'}\n` +
          `• Status: PDC Pending\n\n` +
          `Important: The party's balance remains unchanged until this cheque is cleared in the Cheque Tracker.`
        );
      } else {
        alert(`Payment of ₹${Number(amount).toFixed(2)} recorded successfully! Balance has been updated.`);
      }

      setIsModalOpen(false);
      await loadData();
    } catch (error) {
      console.error(error);
      alert(`Failed to record payment: ${error}`);
    } finally {
      setIsProcessing(false);
    }
  }

  async function handleClearCheque(chq: PaymentHistory) {
    const isCustomer = chq.entity_type === 'customer';
    const partyRole = isCustomer ? 'Customer' : 'Supplier';
    const actionDesc = isCustomer 
      ? 'reduce the customer\'s outstanding balance' 
      : 'reduce the amount owed to this supplier';

    const confirmMsg = 
      `Deposit & Clear Cheque #${chq.cheque_no || 'N/A'}?\n\n` +
      `• Party: ${chq.entity_name} (${partyRole})\n` +
      `• Cheque Amount: ₹${chq.amount.toFixed(2)}\n` +
      `• Cheque Date: ${chq.cheque_date || chq.date.split(' ')[0]}\n\n` +
      `This will mark the cheque as CLEARED and will ${actionDesc}. Proceed?`;

    if (!window.confirm(confirmMsg)) return;

    try {
      await clearPdcCheque(chq.id);
      alert(`Cheque #${chq.cheque_no || ''} CLEARED successfully! Party balance updated.`);
      await loadData();
    } catch (e) {
      console.error(e);
      alert(`Failed to clear cheque: ${e}`);
    }
  }

  async function handleBounceCheque(chq: PaymentHistory) {
    const confirmMsg = 
      `Mark Cheque #${chq.cheque_no || 'N/A'} as BOUNCED / DISHONORED?\n\n` +
      `• Party: ${chq.entity_name}\n` +
      `• Amount: ₹${chq.amount.toFixed(2)}\n\n` +
      `Are you sure?`;

    if (!window.confirm(confirmMsg)) return;

    try {
      await bounceCheque(chq.id);
      alert(`Cheque #${chq.cheque_no || ''} has been marked as BOUNCED.`);
      await loadData();
    } catch (e) {
      console.error(e);
      alert(`Failed to bounce cheque: ${e}`);
    }
  }

  // Filtered Lists
  const filteredCustomers = customers.filter(c => 
    c.balance > 0 && 
    (c.name.toLowerCase().includes(search.toLowerCase()) || (c.phone && c.phone.includes(search)))
  );

  const filteredSuppliers = suppliers.filter(s => 
    s.balance > 0 && 
    (s.name.toLowerCase().includes(search.toLowerCase()) || (s.phone && s.phone.includes(search)))
  );

  const filteredCheques = cheques.filter(c => {
    const matchesFilter = chequeStatusFilter === 'all' || c.cheque_status === chequeStatusFilter;
    const matchesSearch = 
      !search || 
      (c.entity_name && c.entity_name.toLowerCase().includes(search.toLowerCase())) ||
      (c.cheque_no && c.cheque_no.toLowerCase().includes(search.toLowerCase())) ||
      (c.bank_name && c.bank_name.toLowerCase().includes(search.toLowerCase()));
    return matchesFilter && matchesSearch;
  });

  const totalReceivables = customers.reduce((sum, c) => sum + Math.max(0, c.balance), 0);
  const totalPayables = suppliers.reduce((sum, s) => sum + Math.max(0, s.balance), 0);
  
  const pendingPdcList = cheques.filter(c => c.cheque_status === 'pdc_pending');
  const pendingPdcCount = pendingPdcList.length;
  const pendingPdcAmount = pendingPdcList.reduce((sum, c) => sum + (c.amount || 0), 0);

  const handleExportPDF = () => {
    if (activeTab === 'cheques') {
      const totalAmount = filteredCheques.reduce((sum, c) => sum + (c.amount || 0), 0);
      setPrintReportData({
        reportTitle: 'CHEQUES & POST-DATED CHEQUES (PDC) REGISTER',
        summaryCards: [
          { label: 'Total Cheques Amount', value: `₹${totalAmount.toFixed(2)}`, highlight: true },
          { label: 'Pending PDCs', value: `${pendingPdcCount} (₹${pendingPdcAmount.toFixed(2)})` },
          { label: 'Total Displayed', value: filteredCheques.length }
        ],
        columns: [
          { header: 'Cheque Date', accessor: 'formattedChequeDate' },
          { header: 'Cheque No', accessor: 'cheque_no' },
          { header: 'Bank Name', accessor: 'bank_name' },
          { header: 'Party Name', accessor: 'entity_name' },
          { header: 'Party Type', accessor: 'formattedType' },
          { header: 'Status', accessor: 'formattedStatus' },
          { header: 'Amount (₹)', accessor: 'formattedAmount', align: 'right' }
        ],
        rows: filteredCheques.map(c => ({
          ...c,
          formattedChequeDate: c.cheque_date || c.date.split(' ')[0],
          cheque_no: c.cheque_no || '-',
          bank_name: c.bank_name || '-',
          formattedType: c.entity_type === 'customer' ? 'Customer' : 'Supplier',
          formattedStatus: c.cheque_status === 'pdc_pending' ? 'PDC Pending' : (c.cheque_status === 'bounced' ? 'Bounced' : 'Cleared'),
          formattedAmount: `₹${c.amount.toFixed(2)}`
        })),
        totalRow: {
          formattedChequeDate: '',
          cheque_no: '',
          bank_name: '',
          entity_name: '',
          formattedType: '',
          formattedStatus: `${filteredCheques.length} Cheques`,
          formattedAmount: `₹${totalAmount.toFixed(2)}`
        }
      });
    } else if (showHistory) {
      const totalHistoryAmount = history.reduce((sum, h) => sum + (h.amount || 0), 0);
      setPrintReportData({
        reportTitle: `${activeTab === 'customers' ? 'CUSTOMER RECEIPTS' : 'SUPPLIER PAYMENTS'} HISTORY`,
        summaryCards: [
          { label: 'Total Amount Transacted', value: `₹${totalHistoryAmount.toFixed(2)}`, highlight: true },
          { label: 'Total Entries', value: history.length }
        ],
        columns: [
          { header: 'Date', accessor: 'formattedDate' },
          { header: activeTab === 'customers' ? 'Customer Name' : 'Supplier Name', accessor: 'entity_name' },
          { header: 'Mode', accessor: 'payment_mode' },
          { header: 'Ref / Cheque No', accessor: 'reference_no' },
          { header: 'Status', accessor: 'cheque_status_label' },
          { header: 'Amount (₹)', accessor: 'formattedAmount', align: 'right' }
        ],
        rows: history.map(h => ({
          ...h,
          formattedDate: h.date.split(' ')[0],
          reference_no: h.cheque_no ? `Chq #${h.cheque_no}` : (h.reference_no || '-'),
          cheque_status_label: h.cheque_status === 'pdc_pending' ? 'PDC Pending' : (h.cheque_status === 'bounced' ? 'Bounced' : 'Cleared'),
          formattedAmount: `₹${h.amount.toFixed(2)}`
        })),
        totalRow: {
          formattedDate: '',
          entity_name: '',
          payment_mode: '',
          reference_no: `${history.length} Transactions`,
          cheque_status_label: '',
          formattedAmount: `₹${totalHistoryAmount.toFixed(2)}`
        }
      });
    } else {
      const entities = (activeTab === 'customers' ? customers : suppliers).filter(e => e.balance > 0);
      const totalBalance = entities.reduce((sum, e) => sum + e.balance, 0);
      setPrintReportData({
        reportTitle: `${activeTab === 'customers' ? 'CUSTOMER RECEIVABLE' : 'SUPPLIER PAYABLE'} OUTSTANDING REPORT`,
        summaryCards: [
          { label: 'Total Outstanding Balance', value: `₹${totalBalance.toFixed(2)}`, highlight: true },
          { label: 'Parties with Balance', value: entities.length }
        ],
        columns: [
          { header: activeTab === 'customers' ? 'Customer Name' : 'Supplier Name', accessor: 'name' },
          { header: 'Phone / Contact', accessor: 'phone' },
          { header: 'GSTIN', accessor: 'gstin' },
          { header: 'Outstanding Balance (₹)', accessor: 'formattedBalance', align: 'right' }
        ],
        rows: entities.map(e => ({
          ...e,
          phone: e.phone || '-',
          gstin: e.gstin ? e.gstin.toUpperCase() : '-',
          formattedBalance: `₹${e.balance.toFixed(2)}`
        })),
        totalRow: {
          name: '',
          phone: '',
          gstin: `${entities.length} Parties`,
          formattedBalance: `₹${totalBalance.toFixed(2)}`
        }
      });
    }

    setTimeout(() => {
      window.print();
    }, 150);
  };

  return (
    <>
      <PrintableReport data={printReportData} />
      <div className="p-8 h-full flex flex-col relative bg-canvas overflow-y-auto print:hidden">
        {/* Header */}
        <header className="mb-8 flex flex-col md:flex-row md:justify-between md:items-end gap-4">
          <div>
            <h1 className="text-4xl font-display font-medium text-ink tracking-tight">Payments & Cheques</h1>
            <p className="text-body text-base mt-2">Manage customer receipts, supplier dues, and post-dated cheques (PDC).</p>
          </div>
          <div className="flex flex-wrap gap-4">
            <div className="bg-signature-forest text-on-primary px-5 py-3 rounded-lg min-w-[170px]">
              <div className="text-xs font-medium text-on-primary/80 uppercase tracking-wider mb-1">Total Receivables</div>
              <div className="text-2xl font-display text-on-primary">₹{totalReceivables.toFixed(2)}</div>
            </div>
            <div className="bg-signature-coral text-on-primary px-5 py-3 rounded-lg min-w-[170px]">
              <div className="text-xs font-medium text-on-primary/80 uppercase tracking-wider mb-1">Total Payables</div>
              <div className="text-2xl font-display text-on-primary">₹{totalPayables.toFixed(2)}</div>
            </div>
            <div className="bg-surface-soft border border-hairline px-5 py-3 rounded-lg min-w-[170px]">
              <div className="text-xs font-medium text-amber-600 dark:text-amber-400 uppercase tracking-wider mb-1 flex items-center justify-between">
                <span>Pending PDCs</span>
                {pendingPdcCount > 0 && (
                  <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></span>
                )}
              </div>
              <div className="text-2xl font-display text-ink">₹{pendingPdcAmount.toFixed(2)}</div>
              <div className="text-xs text-muted mt-0.5">{pendingPdcCount} pending cheque{pendingPdcCount === 1 ? '' : 's'}</div>
            </div>
          </div>
        </header>

        {/* Main Content Box */}
        <div className="bg-canvas rounded-lg border border-hairline flex-1 flex flex-col overflow-hidden">
          {/* Main Navigation Bar */}
          <div className="p-4 border-b border-hairline flex flex-wrap justify-between items-center gap-3 bg-canvas">
            <div className="flex items-center gap-2">
              <button 
                onClick={() => { setActiveTab('customers'); setShowHistory(false); }}
                className={`px-4 py-2 rounded-md font-medium text-sm flex items-center transition-colors ${activeTab === 'customers' ? 'bg-surface-soft text-ink border border-hairline font-semibold shadow-2xs' : 'text-muted hover:text-ink hover:bg-surface-soft border border-transparent'}`}
              >
                <Users className="w-4 h-4 mr-2" />
                Customer Receivables
              </button>
              <button 
                onClick={() => { setActiveTab('suppliers'); setShowHistory(false); }}
                className={`px-4 py-2 rounded-md font-medium text-sm flex items-center transition-colors ${activeTab === 'suppliers' ? 'bg-surface-soft text-ink border border-hairline font-semibold shadow-2xs' : 'text-muted hover:text-ink hover:bg-surface-soft border border-transparent'}`}
              >
                <Truck className="w-4 h-4 mr-2" />
                Supplier Payables
              </button>
              <button 
                onClick={() => setActiveTab('cheques')}
                className={`px-4 py-2 rounded-md font-medium text-sm flex items-center transition-colors relative ${activeTab === 'cheques' ? 'bg-surface-soft text-ink border border-hairline font-semibold shadow-2xs' : 'text-muted hover:text-ink hover:bg-surface-soft border border-transparent'}`}
              >
                <CreditCard className="w-4 h-4 mr-2 text-primary" />
                Cheques & PDC Tracker
                {pendingPdcCount > 0 && (
                  <span className="ml-2 px-1.5 py-0.2 rounded-full text-[11px] font-bold bg-amber-500 text-white leading-tight">
                    {pendingPdcCount}
                  </span>
                )}
              </button>
            </div>

            <div className="flex items-center gap-3">
              <button 
                type="button"
                onClick={handleExportPDF}
                className="bg-primary hover:bg-primary-active text-on-primary px-3.5 py-2 rounded-md font-medium text-xs flex items-center transition-all shadow-2xs cursor-pointer"
                title="Print or Save PDF"
              >
                <Printer className="w-3.5 h-3.5 mr-1.5" />
                {activeTab === 'cheques' ? 'Export Cheques PDF' : (showHistory ? 'Export History PDF' : 'Export Outstanding PDF')}
              </button>

              {activeTab !== 'cheques' && (
                <button 
                  onClick={() => setShowHistory(!showHistory)}
                  className={`px-4 py-2 rounded-md font-medium text-sm flex items-center transition-colors border ${showHistory ? 'bg-primary text-on-primary border-transparent' : 'bg-canvas text-ink border-hairline hover:bg-surface-soft'}`}
                >
                  <Clock className="w-4 h-4 mr-2" />
                  {showHistory ? 'View Outstanding' : 'View History'}
                </button>
              )}

              <div className="relative w-64 md:w-72">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted w-4 h-4" />
                <input 
                  type="text" 
                  placeholder={activeTab === 'cheques' ? 'Search cheques, party, bank...' : `Search ${activeTab}...`}
                  className="w-full pl-9 pr-4 py-2 bg-canvas border border-hairline rounded-sm focus:outline-none focus:border-ink transition-colors text-ink placeholder-muted text-sm"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            </div>
          </div>

          {/* Sub-toolbar for Cheques Register */}
          {activeTab === 'cheques' && (
            <div className="px-4 py-2.5 bg-surface-soft/60 border-b border-hairline flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-1.5">
                <span className="font-medium text-muted uppercase tracking-wider mr-2">Filter:</span>
                {(['all', 'pdc_pending', 'cleared', 'bounced'] as const).map(filterKey => {
                  const labelMap = {
                    all: 'All Cheques',
                    pdc_pending: `Pending PDCs (${pendingPdcCount})`,
                    cleared: 'Cleared',
                    bounced: 'Bounced'
                  };
                  const active = chequeStatusFilter === filterKey;
                  return (
                    <button
                      key={filterKey}
                      onClick={() => setChequeStatusFilter(filterKey)}
                      className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${active ? 'bg-ink text-canvas font-semibold shadow-2xs' : 'text-muted hover:text-ink hover:bg-surface-soft'}`}
                    >
                      {labelMap[filterKey]}
                    </button>
                  );
                })}
              </div>

              <div className="text-muted flex items-center gap-3">
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                  PDC: Balance unchanged until cleared
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                  Cleared: Balance reduced
                </span>
              </div>
            </div>
          )}

          {/* Table Container */}
          <div className="overflow-x-auto flex-1 bg-canvas">
            {activeTab === 'cheques' ? (
              /* CHEQUES & PDC REGISTER TABLE */
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-surface-soft border-b border-hairline text-muted text-xs font-medium uppercase tracking-wider sticky top-0 z-10">
                    <th className="px-6 py-4">Cheque Date & Timing</th>
                    <th className="px-6 py-4">Cheque / Bank Details</th>
                    <th className="px-6 py-4">Party Name</th>
                    <th className="px-6 py-4 text-center">Status</th>
                    <th className="px-6 py-4 text-right">Amount (₹)</th>
                    <th className="px-6 py-4 text-center">Clearance Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-hairline">
                  {filteredCheques.map((chq) => {
                    const daysInfo = getPdcDaysLabel(chq.cheque_date);
                    const isPending = chq.cheque_status === 'pdc_pending';
                    const isCleared = chq.cheque_status === 'cleared' || !chq.cheque_status;
                    const isBounced = chq.cheque_status === 'bounced';

                    return (
                      <tr key={chq.id} className="hover:bg-surface-soft transition-colors border-b border-hairline last:border-0">
                        <td className="px-6 py-4">
                          <div className="font-semibold text-ink flex items-center gap-1.5">
                            <Calendar className="w-3.5 h-3.5 text-muted" />
                            {chq.cheque_date || chq.date.split(' ')[0]}
                          </div>
                          {isPending && daysInfo.text && (
                            <span className={`inline-block mt-1 text-[11px] px-2 py-0.5 rounded-full font-medium ${daysInfo.isToday ? 'bg-amber-500/20 text-amber-700 dark:text-amber-300 font-bold' : (daysInfo.isPast ? 'bg-rose-500/20 text-rose-700 dark:text-rose-300' : 'bg-primary/10 text-primary')}`}>
                              {daysInfo.text}
                            </span>
                          )}
                          <div className="text-[11px] text-muted mt-0.5">Recorded: {chq.date.split(' ')[0]}</div>
                        </td>

                        <td className="px-6 py-4">
                          <div className="font-mono font-medium text-ink flex items-center gap-1.5">
                            <CreditCard className="w-3.5 h-3.5 text-muted" />
                            Chq #{chq.cheque_no || 'N/A'}
                          </div>
                          <div className="text-xs text-muted mt-0.5 flex items-center gap-1">
                            <Building2 className="w-3 h-3 text-muted" />
                            {chq.bank_name || 'Bank Not Specified'}
                          </div>
                        </td>

                        <td className="px-6 py-4">
                          <div className="font-medium text-ink">{chq.entity_name}</div>
                          <span className={`inline-block mt-0.5 text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded ${chq.entity_type === 'customer' ? 'bg-emerald-500/10 text-emerald-600' : 'bg-blue-500/10 text-blue-600'}`}>
                            {chq.entity_type === 'customer' ? 'Customer (Receipt)' : 'Supplier (Payment)'}
                          </span>
                        </td>

                        <td className="px-6 py-4 text-center">
                          {isPending && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30">
                              <Clock className="w-3.5 h-3.5" />
                              PDC Pending
                            </span>
                          )}
                          {isCleared && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              Cleared
                            </span>
                          )}
                          {isBounced && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-500/15 text-rose-700 dark:text-rose-300 border border-rose-500/30">
                              <AlertCircle className="w-3.5 h-3.5" />
                              Bounced
                            </span>
                          )}
                        </td>

                        <td className="px-6 py-4 text-right">
                          <span className="font-display font-medium text-ink text-base">
                            ₹{chq.amount.toFixed(2)}
                          </span>
                        </td>

                        <td className="px-6 py-4 text-center">
                          {isPending ? (
                            <div className="inline-flex items-center gap-2">
                              <button
                                onClick={() => handleClearCheque(chq)}
                                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-xs font-semibold flex items-center gap-1 transition-colors shadow-2xs"
                                title="Deposit cheque & reduce party balance"
                              >
                                <Check className="w-3.5 h-3.5" />
                                Clear Cheque
                              </button>
                              <button
                                onClick={() => handleBounceCheque(chq)}
                                className="px-2.5 py-1.5 border border-rose-500/30 text-rose-600 hover:bg-rose-500/10 rounded text-xs font-medium transition-colors"
                                title="Mark as Bounced / Dishonored"
                              >
                                Bounced
                              </button>
                            </div>
                          ) : isCleared ? (
                            <button
                              onClick={() => handleBounceCheque(chq)}
                              className="text-[11px] text-muted hover:text-rose-600 hover:underline transition-colors"
                              title="Mark dishonored / bounced"
                            >
                              Dishonored / Bounce?
                            </button>
                          ) : (
                            <span className="text-xs text-muted italic">No action</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}

                  {filteredCheques.length === 0 && (
                    <tr>
                      <td colSpan={6} className="p-16 text-center text-muted">
                        <div className="flex flex-col items-center justify-center">
                          <div className="w-16 h-16 bg-surface-soft rounded-full flex items-center justify-center mb-4 border border-hairline">
                            <CreditCard className="w-6 h-6 text-muted" />
                          </div>
                          <p className="font-medium text-ink">No cheques found.</p>
                          <p className="text-sm mt-1">Receive payment or pay supplier with Cheque mode to populate this register.</p>
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            ) : !showHistory ? (
              /* OUTSTANDING BALANCES TABLE */
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-surface-soft border-b border-hairline text-muted text-xs font-medium uppercase tracking-wider sticky top-0 z-10">
                    <th className="px-6 py-4">{activeTab === 'customers' ? 'Customer' : 'Supplier'} Name</th>
                    <th className="px-6 py-4">Contact</th>
                    <th className="px-6 py-4 text-right">Outstanding Balance (₹)</th>
                    <th className="px-6 py-4 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-hairline">
                  {(activeTab === 'customers' ? filteredCustomers : filteredSuppliers).map((entity: any) => (
                    <tr key={entity.id} className="hover:bg-surface-soft transition-colors border-b border-hairline last:border-0">
                      <td className="px-6 py-4">
                        <div className="font-medium text-ink">{entity.name}</div>
                        <div className="text-xs text-muted mt-0.5">ID: #{entity.id}</div>
                      </td>
                      <td className="px-6 py-4 text-muted text-sm">
                        {entity.phone || entity.email || <span className="italic">N/A</span>}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <span className="font-medium text-ink text-base">
                          ₹{entity.balance.toFixed(2)}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <button 
                          onClick={() => openPaymentModal(entity)}
                          className="px-4 py-2 rounded-sm font-medium transition-colors text-sm inline-flex items-center bg-canvas text-ink border border-hairline hover:bg-surface-soft"
                        >
                          <IndianRupee className="w-4 h-4 mr-1.5" /> 
                          {activeTab === 'customers' ? 'Receive Payment' : 'Pay Supplier'}
                        </button>
                      </td>
                    </tr>
                  ))}
                  {(activeTab === 'customers' ? filteredCustomers : filteredSuppliers).length === 0 && (
                    <tr>
                      <td colSpan={4} className="p-16 text-center text-muted">
                        <div className="flex flex-col items-center justify-center">
                          <div className="w-16 h-16 bg-surface-soft rounded-full flex items-center justify-center mb-4 border border-hairline">
                            <IndianRupee className="w-6 h-6 text-muted" />
                          </div>
                          <p className="font-medium text-ink">No outstanding {activeTab === 'customers' ? 'receivables' : 'payables'} found.</p>
                          <p className="text-sm mt-1">All dues are settled.</p>
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            ) : (
              /* PAYMENT HISTORY TABLE */
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-canvas border-b border-hairline text-muted text-xs font-medium uppercase tracking-wider sticky top-0 z-10">
                    <th className="px-6 py-4">Date</th>
                    <th className="px-6 py-4">{activeTab === 'customers' ? 'Customer' : 'Supplier'} Name</th>
                    <th className="px-6 py-4">Mode / Details</th>
                    <th className="px-6 py-4 text-center">Status</th>
                    <th className="px-6 py-4 text-right">Amount (₹)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-hairline">
                  {history.map((record) => (
                    <tr key={record.id} className="hover:bg-surface-soft transition-colors border-b border-hairline last:border-0">
                      <td className="px-6 py-4 text-muted text-sm font-medium">{record.date.split(' ')[0]}</td>
                      <td className="px-6 py-4">
                        <div className="font-medium text-ink">{record.entity_name}</div>
                        <div className="text-xs text-muted mt-0.5">ID: #{record.entity_id}</div>
                      </td>
                      <td className="px-6 py-4 text-ink text-sm">
                        <span className="font-medium">{record.payment_mode}</span>
                        {record.cheque_no && (
                          <div className="text-xs text-muted mt-0.5">
                            Chq #{record.cheque_no} {record.bank_name ? `(${record.bank_name})` : ''} • Date: {record.cheque_date || '-'}
                          </div>
                        )}
                        {!record.cheque_no && record.reference_no && (
                          <div className="text-xs text-muted mt-0.5">Ref: {record.reference_no}</div>
                        )}
                      </td>
                      <td className="px-6 py-4 text-center">
                        {record.cheque_status === 'pdc_pending' ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30">
                            PDC Pending
                          </span>
                        ) : record.cheque_status === 'bounced' ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-rose-500/15 text-rose-700 dark:text-rose-300 border border-rose-500/30">
                            Bounced
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30">
                            Cleared
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-right font-medium text-ink text-base">₹{record.amount.toFixed(2)}</td>
                    </tr>
                  ))}
                  {history.length === 0 && (
                    <tr>
                      <td colSpan={5} className="p-16 text-center text-muted">
                        <p className="font-medium text-sm">No payment history found.</p>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Payment Modal */}
        {isModalOpen && selectedEntity && (
          <div className="absolute inset-0 bg-ink/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-canvas rounded-lg shadow-xl w-full max-w-lg overflow-hidden border border-hairline animate-in fade-in zoom-in-95 duration-150">
              <div className="px-6 py-5 border-b border-hairline flex justify-between items-center bg-surface-soft">
                <div>
                  <h2 className="text-lg font-medium text-ink">
                    {activeTab === 'customers' ? 'Receive Customer Payment' : 'Pay Supplier'}
                  </h2>
                  <p className="text-sm text-muted mt-0.5">{selectedEntity.name}</p>
                </div>
                <button onClick={() => setIsModalOpen(false)} className="text-muted hover:text-ink transition-colors p-1">
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              <form onSubmit={handleRecordPayment} className="p-6 flex flex-col gap-5 max-h-[85vh] overflow-y-auto">
                <div className="bg-surface-soft rounded-md p-4 border border-hairline flex justify-between items-center">
                  <span className="text-sm font-medium text-muted uppercase tracking-wider">Current Outstanding</span>
                  <span className="text-xl font-display font-medium text-ink">₹{selectedEntity.balance.toFixed(2)}</span>
                </div>

                {/* Amount */}
                <div>
                  <label className="block text-xs font-medium text-muted uppercase tracking-wider mb-1.5">
                    Amount (₹) *
                  </label>
                  <input 
                    required 
                    type="number" 
                    step="0.01"
                    min="0.01"
                    max={selectedEntity.balance}
                    value={amount} 
                    onChange={e => setAmount(e.target.value === '' ? '' : Number(e.target.value))} 
                    className="w-full px-4 py-2.5 bg-canvas border border-hairline rounded-sm focus:outline-none focus:border-ink text-lg font-medium text-ink transition-colors" 
                    placeholder="0.00" 
                  />
                </div>

                {/* Payment Mode Selector */}
                <div>
                  <label className="block text-xs font-medium text-muted uppercase tracking-wider mb-2">
                    Payment Mode
                  </label>
                  <div className="grid grid-cols-4 gap-2">
                    {(['Cash', 'UPI', 'Bank Transfer', 'Cheque'] as const).map(mode => (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => setPaymentMode(mode)}
                        className={`py-2 px-2 text-xs font-medium rounded border transition-colors text-center ${paymentMode === mode ? 'bg-primary text-on-primary border-primary font-semibold shadow-2xs' : 'bg-canvas text-ink border-hairline hover:bg-surface-soft'}`}
                      >
                        {mode}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Cheque Specific Fields */}
                {paymentMode === 'Cheque' && (
                  <div className="p-4 bg-surface-soft/80 border border-hairline rounded-md flex flex-col gap-3">
                    <div className="text-xs font-semibold text-ink uppercase tracking-wider flex items-center gap-1.5">
                      <CreditCard className="w-4 h-4 text-primary" />
                      Cheque Information
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[11px] font-medium text-muted uppercase tracking-wider mb-1">
                          Cheque Number *
                        </label>
                        <input
                          required
                          type="text"
                          placeholder="e.g. 004128"
                          value={chequeNo}
                          onChange={e => setChequeNo(e.target.value)}
                          className="w-full px-3 py-2 bg-canvas border border-hairline rounded-sm text-sm text-ink focus:outline-none focus:border-ink font-mono"
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] font-medium text-muted uppercase tracking-wider mb-1">
                          Bank Name
                        </label>
                        <input
                          type="text"
                          placeholder="e.g. HDFC Bank"
                          value={bankName}
                          onChange={e => setBankName(e.target.value)}
                          className="w-full px-3 py-2 bg-canvas border border-hairline rounded-sm text-sm text-ink focus:outline-none focus:border-ink"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-[11px] font-medium text-muted uppercase tracking-wider mb-1 flex items-center justify-between">
                        <span>Cheque Date *</span>
                        <span className="text-[10px] text-muted normal-case">(Future date = PDC)</span>
                      </label>
                      <input
                        required
                        type="date"
                        value={chequeDate}
                        onChange={e => setChequeDate(e.target.value)}
                        className="w-full px-3 py-2 bg-canvas border border-hairline rounded-sm text-sm text-ink focus:outline-none focus:border-ink"
                      />
                    </div>

                    {/* Live Accounting Banner */}
                    {isPdcDate(chequeDate) ? (
                      <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-md flex items-start gap-2.5 text-xs text-amber-700 dark:text-amber-300">
                        <Calendar className="w-4 h-4 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
                        <div>
                          <span className="font-semibold block">Post-Dated Cheque (PDC)</span>
                          Cheque date is in the future ({chequeDate}). The party's outstanding balance will <strong>remain unchanged</strong> until deposited and cleared in the Cheque Tracker.
                        </div>
                      </div>
                    ) : (
                      <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-md flex items-start gap-2.5 text-xs text-emerald-700 dark:text-emerald-300">
                        <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-600 dark:text-emerald-400" />
                        <div>
                          <span className="font-semibold block">Present Date Cheque</span>
                          Cheque will be marked as <strong>Cleared</strong> immediately. Outstanding balance will be reduced right now.
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Reference No & Notes */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-muted uppercase tracking-wider mb-1">
                      Reference No (Optional)
                    </label>
                    <input 
                      type="text" 
                      placeholder="Transaction / UTR / Memo" 
                      value={referenceNo} 
                      onChange={e => setReferenceNo(e.target.value)} 
                      className="w-full px-3 py-2 bg-canvas border border-hairline rounded-sm text-sm text-ink focus:outline-none focus:border-ink" 
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-muted uppercase tracking-wider mb-1">
                      Notes
                    </label>
                    <input 
                      type="text" 
                      placeholder="Any remarks..." 
                      value={notes} 
                      onChange={e => setNotes(e.target.value)} 
                      className="w-full px-3 py-2 bg-canvas border border-hairline rounded-sm text-sm text-ink focus:outline-none focus:border-ink" 
                    />
                  </div>
                </div>

                <div className="mt-2">
                  <button 
                    type="submit" 
                    disabled={isProcessing || amount === '' || amount <= 0 || (paymentMode === 'Cheque' && !chequeNo.trim())}
                    className={`w-full py-3 rounded-lg font-medium text-base flex items-center justify-center transition-colors
                      ${isProcessing || amount === '' || amount <= 0 || (paymentMode === 'Cheque' && !chequeNo.trim())
                        ? 'bg-surface-strong text-muted cursor-not-allowed' 
                        : 'bg-primary hover:bg-primary-active text-on-primary'}`}
                  >
                    <IndianRupee className="w-4 h-4 mr-2" /> 
                    {isProcessing 
                      ? 'Processing...' 
                      : (paymentMode === 'Cheque' && isPdcDate(chequeDate))
                        ? 'Record Post-Dated Cheque (PDC)'
                        : `Record ${activeTab === 'customers' ? 'Receipt' : 'Payment'}`
                    }
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
