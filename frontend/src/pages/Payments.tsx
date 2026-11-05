import { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
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
  Building2,
  Plus
} from 'lucide-react';
import { 
  getCustomers, 
  getSuppliers, 
  recordPayment, 
  getPaymentsHistory, 
  getChequesRegister, 
  clearPdcCheque, 
  bounceCheque,
  isPdcDate,
  getPartyProfileData,
  applyAdvanceToClearDues
} from '../lib/db';
import type { Customer, Supplier, PaymentHistory, PartyBillItem } from '../lib/db';
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
  const location = useLocation();
  const [activeTab, setActiveTab] = useState<'customers' | 'suppliers' | 'cheques'>(
    (location.state as any)?.activeTab || 'customers'
  );
  const [search, setSearch] = useState('');
  
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [history, setHistory] = useState<PaymentHistory[]>([]);
  const [cheques, setCheques] = useState<PaymentHistory[]>([]);
  
  const [showHistory, setShowHistory] = useState(false);
  const [chequeStatusFilter, setChequeStatusFilter] = useState<'all' | 'pdc_pending' | 'cleared' | 'bounced'>(
    (location.state as any)?.chequeStatusFilter || 'all'
  );

  useEffect(() => {
    if ((location.state as any)?.activeTab) {
      setActiveTab((location.state as any).activeTab);
    }
    if ((location.state as any)?.chequeStatusFilter) {
      setChequeStatusFilter((location.state as any).chequeStatusFilter);
    }
  }, [location.state]);
  
  const [selectedEntity, setSelectedEntity] = useState<Customer | Supplier | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [paymentModalTab, setPaymentModalTab] = useState<'clear_dues' | 'advance'>('clear_dues');
  
  // Payment Form State
  const [amount, setAmount] = useState<number | ''>('');
  const [paymentMode, setPaymentMode] = useState<'Cash' | 'UPI' | 'Bank Transfer' | 'Cheque'>('Cash');
  const [chequeNo, setChequeNo] = useState('');
  const [bankName, setBankName] = useState('');
  const [chequeDate, setChequeDate] = useState(getTodayString());
  const [referenceNo, setReferenceNo] = useState('');
  const [notes, setNotes] = useState('');
  const [targetedBill, setTargetedBill] = useState<PartyBillItem | null>(null);
  const [partyDueBills, setPartyDueBills] = useState<PartyBillItem[]>([]);
  const [isLoadingDueBills, setIsLoadingDueBills] = useState(false);
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

  const openPaymentModal = async (entity: Customer | Supplier) => {
    setSelectedEntity(entity);
    setTargetedBill(null);
    setPaymentMode('Cash');
    setChequeNo('');
    setBankName('');
    setChequeDate(getTodayString());
    setReferenceNo('');
    setNotes('');
    setIsModalOpen(true);

    if (entity.balance > 0) {
      setPaymentModalTab('clear_dues');
    } else {
      setPaymentModalTab('advance');
    }

    setIsLoadingDueBills(true);
    try {
      const type = activeTab === 'suppliers' ? 'supplier' : 'customer';
      const data = await getPartyProfileData(type, entity.id);
      const dues = (data.bills || []).filter(b => b.due_amount > 0.001);
      setPartyDueBills(dues);
      const totalDue = dues.reduce((sum, b) => sum + (b.due_amount || 0), 0);
      if (totalDue > 0) {
        setAmount(Number(totalDue.toFixed(2)));
        setPaymentModalTab('clear_dues');
      } else {
        setAmount('');
        if (entity.balance <= 0) {
          setPaymentModalTab('advance');
        }
      }
    } catch (err) {
      console.error('Failed to load due bills in payments', err);
      setPartyDueBills([]);
      setAmount(entity.balance > 0 ? Number(entity.balance.toFixed(2)) : '');
    } finally {
      setIsLoadingDueBills(false);
    }
  };

  function handleSelectDueBill(billIdStr: string) {
    if (!billIdStr) {
      setTargetedBill(null);
      setReferenceNo('');
      setNotes('');
      const totalDue = partyDueBills.reduce((s, b) => s + (b.due_amount || 0), 0);
      if (totalDue > 0) {
        setAmount(Number(totalDue.toFixed(2)));
      } else if (selectedEntity && selectedEntity.balance > 0) {
        setAmount(Number(selectedEntity.balance.toFixed(2)));
      }
      return;
    }
    const bill = partyDueBills.find(b => String(b.id) === billIdStr);
    if (bill) {
      setTargetedBill(bill);
      setReferenceNo(bill.invoice_number || String(bill.id));
      setAmount(Number(bill.due_amount.toFixed(2)));
      setNotes(`Payment against Bill #${bill.invoice_number || bill.id}`);
    }
  }

  async function handleUseAdvanceToClearDues() {
    if (!selectedEntity) return;
    const availableAdvance: number = Number(selectedEntity.advance_balance || 0) > 0 
      ? Number(selectedEntity.advance_balance) 
      : (selectedEntity.balance < 0 ? Math.abs(selectedEntity.balance) : 0);
    const totalDues = partyDueBills.reduce((s, b) => s + (b.due_amount || 0), 0);
    const amountToApply = Math.min(availableAdvance, totalDues);
    if (amountToApply <= 0) {
      alert("No available advance or no open bill dues to clear.");
      return;
    }

    const partyRole = activeTab === 'suppliers' ? 'supplier' : 'customer';
    if (!confirm(`Apply ₹${amountToApply.toFixed(2)} from stored advance credit to clear open bill dues for ${selectedEntity.name}?`)) {
      return;
    }

    try {
      setIsProcessing(true);
      const res = await applyAdvanceToClearDues(partyRole, selectedEntity.id, amountToApply);
      alert(`Successfully cleared ${res.clearedCount} bill(s) using ₹${res.appliedAmount.toFixed(2)} of stored advance!`);
      setIsModalOpen(false);
      setTargetedBill(null);
      setPartyDueBills([]);
      await loadData();
    } catch (err) {
      console.error(err);
      alert(`Failed to apply advance: ${err}`);
    } finally {
      setIsProcessing(false);
    }
  }

  async function handleRecordPayment(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedEntity || amount === '' || amount <= 0) return;

    if (paymentMode === 'Cheque' && !chequeNo.trim()) {
      alert('Please enter the Cheque Number');
      return;
    }

    setIsProcessing(true);
    try {
      const type = activeTab === 'suppliers' ? 'supplier' : 'customer';
      const defaultNotes = paymentModalTab === 'advance'
        ? (notes.trim() || `${activeTab === 'customers' ? 'Customer' : 'Supplier'} Advance Deposit`)
        : (notes.trim() || (targetedBill ? `Payment against Bill #${targetedBill.invoice_number || targetedBill.id}` : 'Payment clearing due bills'));

      const res = await recordPayment(
        type, 
        selectedEntity.id, 
        Number(amount), 
        paymentMode, 
        referenceNo, 
        defaultNotes,
        paymentMode === 'Cheque' ? chequeNo.trim() : null,
        paymentMode === 'Cheque' ? bankName.trim() : null,
        paymentMode === 'Cheque' ? chequeDate : null,
        null,
        paymentModalTab === 'clear_dues' && targetedBill ? targetedBill.id : null
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
        if (paymentModalTab === 'advance') {
          alert(`Advance deposit of ₹${Number(amount).toFixed(2)} recorded and credited to ${selectedEntity.name}'s advance balance!`);
        } else {
          alert(`Payment of ₹${Number(amount).toFixed(2)} recorded successfully! Dues cleared.`);
        }
      }

      setIsModalOpen(false);
      setTargetedBill(null);
      setPartyDueBills([]);
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
                        {entity.balance > 0 ? (
                          <div>
                            <span className="font-bold text-red-600 text-base">
                              ₹{entity.balance.toFixed(2)}
                            </span>
                            <span className="text-[10px] text-red-500 font-semibold block">
                              {activeTab === 'customers' ? 'Due' : 'Payable'}
                            </span>
                          </div>
                        ) : (
                          <div>
                            <span className="font-medium text-emerald-600 text-base">
                              ₹0.00
                            </span>
                            <span className="text-[10px] text-muted block">Settled</span>
                          </div>
                        )}
                        {(entity.advance_balance || 0) > 0 && (
                          <div className="mt-1">
                            <span className="inline-block text-[10px] px-1.5 py-0.5 rounded font-bold bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300">
                              Adv: ₹{(entity.advance_balance || 0).toFixed(2)}
                            </span>
                          </div>
                        )}
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
        {isModalOpen && selectedEntity && (() => {
          const availableAdvance = (selectedEntity.advance_balance || 0) > 0 
            ? (selectedEntity.advance_balance || 0) 
            : (selectedEntity.balance < 0 ? Math.abs(selectedEntity.balance) : 0);
          const totalBillsDue = partyDueBills.reduce((sum, b) => sum + (b.due_amount || 0), 0);

          return (
            <div className="absolute inset-0 bg-ink/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
              <div className="bg-canvas rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden border border-hairline animate-in fade-in zoom-in-95 duration-150">
                {/* Header */}
                <div className="px-6 py-4 border-b border-hairline flex justify-between items-center bg-surface-soft/60">
                  <div>
                    <h2 className="text-base font-bold text-ink flex items-center gap-2">
                      <IndianRupee className="w-4 h-4 text-primary" />
                      {activeTab === 'customers' ? 'Collect from Customer' : 'Pay to Supplier'}
                    </h2>
                    <p className="text-xs text-muted mt-0.5">{selectedEntity.name}</p>
                  </div>
                  <button 
                    onClick={() => {
                      setIsModalOpen(false);
                      setTargetedBill(null);
                    }} 
                    className="text-muted hover:text-ink transition-colors p-1.5 rounded-lg hover:bg-surface-soft"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                {/* TWO DEDICATED FUNCTION TABS */}
                <div className="flex border-b border-hairline bg-surface-soft/40 p-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setPaymentModalTab('clear_dues');
                      if (totalBillsDue > 0) setAmount(Number(totalBillsDue.toFixed(2)));
                    }}
                    className={`flex-1 py-2.5 px-4 rounded-xl text-xs sm:text-sm font-semibold flex items-center justify-center gap-2 transition-all ${
                      paymentModalTab === 'clear_dues'
                        ? 'bg-canvas text-primary border border-hairline shadow-xs font-bold'
                        : 'text-muted hover:text-ink hover:bg-surface-soft'
                    }`}
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>1. Clear Due Bills</span>
                    {totalBillsDue > 0 && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 dark:bg-red-950/40 text-red-700 dark:text-red-300 font-bold ml-1">
                        ₹{totalBillsDue.toFixed(0)}
                      </span>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setPaymentModalTab('advance');
                      setTargetedBill(null);
                      setAmount('');
                    }}
                    className={`flex-1 py-2.5 px-4 rounded-xl text-xs sm:text-sm font-semibold flex items-center justify-center gap-2 transition-all ${
                      paymentModalTab === 'advance'
                        ? 'bg-canvas text-primary border border-hairline shadow-xs font-bold'
                        : 'text-muted hover:text-ink hover:bg-surface-soft'
                    }`}
                  >
                    <Plus className="w-4 h-4" />
                    <span>2. Receive Advance</span>
                    {availableAdvance > 0 && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 font-bold ml-1">
                        ₹{availableAdvance.toFixed(0)}
                      </span>
                    )}
                  </button>
                </div>

                <form onSubmit={handleRecordPayment} className="p-6 space-y-4 max-h-[78vh] overflow-y-auto">
                  {paymentModalTab === 'clear_dues' ? (
                    /* ========================================================= */
                    /* FUNCTION 1: CLEAR DUE BILLS                               */
                    /* ========================================================= */
                    <>
                      {/* Dues & Stored Advance Status Cards */}
                      {availableAdvance > 0 && totalBillsDue > 0 ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div className="p-3.5 rounded-xl bg-surface-soft/60 border border-hairline flex items-center justify-between">
                            <div>
                              <span className="text-xs text-muted font-medium block">Total Unpaid Bill Dues</span>
                              <span className="text-[11px] text-muted/70">
                                {partyDueBills.length} pending bill{partyDueBills.length > 1 ? 's' : ''}
                              </span>
                            </div>
                            <span className="font-bold font-display text-lg text-red-600">
                              ₹{totalBillsDue.toFixed(2)}
                            </span>
                          </div>

                          <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-between">
                            <div>
                              <span className="text-xs font-bold text-emerald-800 dark:text-emerald-300 block">
                                Stored Advance
                              </span>
                              <span className="text-base font-bold font-display text-emerald-600 dark:text-emerald-400">
                                ₹{availableAdvance.toFixed(2)}
                              </span>
                            </div>
                            <button
                              type="button"
                              onClick={handleUseAdvanceToClearDues}
                              disabled={isProcessing}
                              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold shadow-xs transition-colors shrink-0 ml-2"
                            >
                              Apply (₹{Math.min(availableAdvance, totalBillsDue).toFixed(2)})
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="p-3.5 rounded-xl bg-surface-soft/60 border border-hairline flex items-center justify-between">
                          <div>
                            <span className="text-xs text-muted font-medium block">Total Unpaid Bill Dues</span>
                            <span className="text-[11px] text-muted/70">
                              {partyDueBills.length > 0
                                ? `Across ${partyDueBills.length} pending bill${partyDueBills.length > 1 ? 's' : ''}`
                                : 'No pending unpaid bills'}
                            </span>
                          </div>
                          <span
                            className={`font-bold font-display text-lg ${
                              totalBillsDue > 0 ? 'text-red-600' : 'text-emerald-600'
                            }`}
                          >
                            ₹{totalBillsDue.toFixed(2)}
                          </span>
                        </div>
                      )}

                      {/* Target Specific Bill (Optional) */}
                      {isLoadingDueBills ? (
                        <div className="text-xs text-muted italic flex items-center gap-1.5 py-2">
                          <div className="w-3.5 h-3.5 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
                          <span>Loading pending bills...</span>
                        </div>
                      ) : partyDueBills.length > 0 && (
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between">
                            <label className="text-xs font-semibold text-muted uppercase tracking-wider">
                              Bills to Clear (Oldest Cleared First)
                            </label>
                            <span className="text-xs font-medium text-muted">
                              {partyDueBills.length} unpaid bill{partyDueBills.length > 1 ? 's' : ''}
                            </span>
                          </div>
                          {partyDueBills.length <= 3 ? (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                              <button
                                type="button"
                                onClick={() => handleSelectDueBill('')}
                                className={`p-3 rounded-xl text-left border transition-all ${
                                  !targetedBill
                                    ? 'bg-primary text-on-primary border-primary font-semibold shadow-xs'
                                    : 'bg-canvas text-ink border-hairline hover:bg-surface-soft'
                                }`}
                              >
                                <div className="flex items-center justify-between">
                                  <span className="font-bold text-xs sm:text-sm">Clear One-by-One</span>
                                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${!targetedBill ? 'bg-white/20 text-white' : 'bg-surface-soft text-muted'}`}>
                                    Auto FIFO
                                  </span>
                                </div>
                                <div className={`text-xs mt-1 ${!targetedBill ? 'text-on-primary/80' : 'text-muted'}`}>
                                  Clears all unpaid bills chronologically
                                </div>
                              </button>
                              {partyDueBills.map(bill => {
                                const isSelected = targetedBill?.id === bill.id;
                                return (
                                  <button
                                    key={bill.id}
                                    type="button"
                                    onClick={() => handleSelectDueBill(isSelected ? '' : String(bill.id))}
                                    className={`p-3 rounded-xl text-left border transition-all ${
                                      isSelected
                                        ? 'bg-primary text-on-primary border-primary font-semibold shadow-xs'
                                        : 'bg-canvas text-ink border-hairline hover:bg-surface-soft'
                                    }`}
                                  >
                                    <div className="flex items-center justify-between">
                                      <span className="font-bold text-xs sm:text-sm">Bill #{bill.invoice_number || bill.id}</span>
                                      <span className={`text-xs sm:text-sm font-bold ${isSelected ? 'text-on-primary' : 'text-red-600'}`}>
                                        Due: ₹{bill.due_amount.toFixed(2)}
                                      </span>
                                    </div>
                                    <div className={`flex items-center justify-between text-xs mt-1 ${isSelected ? 'text-on-primary/80' : 'text-muted'}`}>
                                      <span>Date: {bill.date ? bill.date.split(' ')[0] : 'N/A'}</span>
                                      <span>Total: ₹{bill.net_amount.toFixed(2)}</span>
                                    </div>
                                  </button>
                                );
                              })}
                            </div>
                          ) : (
                            <select
                              value={targetedBill ? String(targetedBill.id) : ''}
                              onChange={e => handleSelectDueBill(e.target.value)}
                              className="w-full px-3 py-2 bg-canvas border border-hairline focus:border-primary rounded-xl text-xs sm:text-sm font-medium text-ink transition-colors cursor-pointer"
                            >
                              <option value="">Clear All Bills One-by-One (FIFO — Clears oldest dues automatically)</option>
                              {partyDueBills.map(bill => (
                                <option key={bill.id} value={String(bill.id)}>
                                  Bill #{bill.invoice_number || bill.id} • Due: ₹{bill.due_amount.toFixed(2)} (Total: ₹{bill.net_amount.toFixed(2)} • Date: {bill.date ? bill.date.split(' ')[0] : 'N/A'})
                                </option>
                              ))}
                            </select>
                          )}
                        </div>
                      )}

                      {/* Amount to Pay & Payment Mode in 2 Balanced Columns */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <div className="flex items-center justify-between mb-1.5">
                            <label className="block text-xs font-semibold text-muted uppercase tracking-wider">
                              Amount Received (₹) *
                            </label>
                            {totalBillsDue > 0 && (
                              <button
                                type="button"
                                onClick={() => {
                                  setTargetedBill(null);
                                  setAmount(Number(totalBillsDue.toFixed(2)));
                                }}
                                className="text-[11px] font-semibold text-primary hover:underline"
                              >
                                Pay Full Dues (₹{totalBillsDue.toFixed(2)})
                              </button>
                            )}
                          </div>
                          <div className="relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted font-bold text-sm">₹</span>
                            <input
                              required
                              type="number"
                              step="0.01"
                              min="0.01"
                              value={amount}
                              onChange={e => setAmount(e.target.value === '' ? '' : parseFloat(e.target.value))}
                              className="w-full pl-7 pr-3 py-2 bg-canvas border border-hairline rounded-xl text-sm font-bold font-display text-ink focus:outline-none focus:border-primary transition-colors"
                              placeholder="0.00"
                            />
                          </div>
                        </div>

                        <div>
                          <label className="block text-xs font-semibold text-muted uppercase tracking-wider mb-1.5">
                            Payment Mode
                          </label>
                          <div className="grid grid-cols-4 gap-1.5">
                            {(['Cash', 'UPI', 'Bank Transfer', 'Cheque'] as const).map(mode => (
                              <button
                                key={mode}
                                type="button"
                                onClick={() => setPaymentMode(mode)}
                                className={`py-2 px-1 rounded-xl text-xs font-semibold border text-center transition-all ${
                                  paymentMode === mode
                                    ? 'bg-primary text-on-primary border-primary shadow-xs'
                                    : 'bg-canvas text-ink border-hairline hover:bg-surface-soft'
                                }`}
                              >
                                {mode === 'Bank Transfer' ? 'Bank' : mode}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>

                      {/* Cheque Specific Fields */}
                      {paymentMode === 'Cheque' && (
                        <div className="p-3.5 rounded-xl bg-surface-soft/50 border border-hairline space-y-3">
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            <div>
                              <label className="block text-[10px] font-semibold text-muted uppercase mb-1">Cheque No *</label>
                              <input
                                required
                                type="text"
                                value={chequeNo}
                                onChange={e => setChequeNo(e.target.value)}
                                className="w-full px-2.5 py-1.5 bg-canvas border border-hairline rounded-lg text-xs text-ink"
                                placeholder="e.g. 402911"
                              />
                            </div>
                            <div>
                              <label className="block text-[10px] font-semibold text-muted uppercase mb-1">Bank Name</label>
                              <input
                                required
                                type="text"
                                value={bankName}
                                onChange={e => setBankName(e.target.value)}
                                className="w-full px-2.5 py-1.5 bg-canvas border border-hairline rounded-lg text-xs text-ink"
                                placeholder="e.g. HDFC Bank"
                              />
                            </div>
                            <div>
                              <label className="block text-[10px] font-semibold text-muted uppercase mb-1">Cheque Due Date *</label>
                              <input
                                required
                                type="date"
                                value={chequeDate}
                                onChange={e => setChequeDate(e.target.value)}
                                className="w-full px-2.5 py-1.5 bg-canvas border border-hairline rounded-lg text-xs text-ink"
                              />
                            </div>
                          </div>

                          {/* Live Accounting Banner */}
                          {isPdcDate(chequeDate) ? (
                            <div className="p-2.5 bg-amber-500/10 border border-amber-500/30 rounded-lg flex items-start gap-2 text-xs text-amber-700 dark:text-amber-300">
                              <Calendar className="w-4 h-4 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
                              <div>
                                <span className="font-semibold block">Post-Dated Cheque (PDC)</span>
                                Cheque date is in the future ({chequeDate}). Dues will remain until cleared in the Cheque Tracker.
                              </div>
                            </div>
                          ) : (
                            <div className="p-2.5 bg-emerald-500/10 border border-emerald-500/30 rounded-lg flex items-start gap-2 text-xs text-emerald-700 dark:text-emerald-300">
                              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-600 dark:text-emerald-400" />
                              <div>
                                <span className="font-semibold block">Present Date Cheque</span>
                                Cheque is marked as Cleared immediately and dues are cleared now.
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Reference / Transaction No & Notes in 2 Columns */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs font-semibold text-muted uppercase tracking-wider mb-1.5">
                            Reference / Transaction No <span className="text-[11px] text-muted normal-case font-normal">(Optional)</span>
                          </label>
                          <input
                            type="text"
                            value={referenceNo}
                            onChange={e => setReferenceNo(e.target.value)}
                            className="w-full px-3 py-2 bg-canvas border border-hairline rounded-xl text-xs text-ink placeholder-muted focus:outline-none focus:border-primary transition-colors"
                            placeholder="e.g. UPI Ref / UTR / Cheque No / Memo"
                          />
                        </div>

                        <div>
                          <label className="block text-xs font-semibold text-muted uppercase tracking-wider mb-1.5">
                            Notes / Remarks <span className="text-[11px] text-muted normal-case font-normal">(Optional)</span>
                          </label>
                          <input
                            type="text"
                            value={notes}
                            onChange={e => setNotes(e.target.value)}
                            className="w-full px-3 py-2 bg-canvas border border-hairline rounded-xl text-xs text-ink placeholder-muted focus:outline-none focus:border-primary transition-colors"
                            placeholder="e.g. Part payment against pending bills"
                          />
                        </div>
                      </div>
                    </>
                  ) : (
                    /* ========================================================= */
                    /* FUNCTION 2: RECEIVE ADVANCE DEPOSIT                       */
                    /* ========================================================= */
                    <>
                      {/* Current Advance Status Card */}
                      <div className="p-3.5 rounded-xl bg-surface-soft/60 border border-hairline flex items-center justify-between">
                        <div>
                          <span className="text-xs text-muted font-medium block">Current Stored Advance Balance</span>
                          <span className="text-[11px] text-muted/70">
                            Money received here is stored as advance credit to clear future bills.
                          </span>
                        </div>
                        <span className="text-lg font-bold font-display text-emerald-600">
                          ₹{availableAdvance.toFixed(2)}
                        </span>
                      </div>

                      {/* Advance Amount & Payment Mode in 2 Balanced Columns */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <div className="flex items-center justify-between mb-1.5">
                            <label className="block text-xs font-semibold text-muted uppercase tracking-wider">
                              Advance Amount (₹) *
                            </label>
                          </div>
                          <div className="relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted font-bold text-sm">₹</span>
                            <input
                              required
                              type="number"
                              step="0.01"
                              min="0.01"
                              value={amount}
                              onChange={e => setAmount(e.target.value === '' ? '' : parseFloat(e.target.value))}
                              className="w-full pl-7 pr-3 py-2 bg-canvas border border-hairline rounded-xl text-sm font-bold font-display text-ink focus:outline-none focus:border-primary transition-colors"
                              placeholder="0.00"
                            />
                          </div>
                          {/* Quick Preset Buttons */}
                          <div className="flex gap-1.5 mt-2">
                            {[500, 1000, 2000, 5000].map(val => (
                              <button
                                key={val}
                                type="button"
                                onClick={() => setAmount(val)}
                                className="flex-1 py-1 px-1 rounded-lg text-xs bg-surface-soft hover:bg-surface-soft/80 border border-hairline text-ink font-semibold transition-colors text-center"
                              >
                                +₹{val}
                              </button>
                            ))}
                          </div>
                        </div>

                        <div>
                          <label className="block text-xs font-semibold text-muted uppercase tracking-wider mb-1.5">
                            Payment Mode
                          </label>
                          <div className="grid grid-cols-4 gap-1.5">
                            {(['Cash', 'UPI', 'Bank Transfer', 'Cheque'] as const).map(mode => (
                              <button
                                key={mode}
                                type="button"
                                onClick={() => setPaymentMode(mode)}
                                className={`py-2 px-1 rounded-xl text-xs font-semibold border text-center transition-all ${
                                  paymentMode === mode
                                    ? 'bg-primary text-on-primary border-primary shadow-xs'
                                    : 'bg-canvas text-ink border-hairline hover:bg-surface-soft'
                                }`}
                              >
                                {mode === 'Bank Transfer' ? 'Bank' : mode}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>

                      {/* Cheque Specific Fields */}
                      {paymentMode === 'Cheque' && (
                        <div className="p-3.5 rounded-xl bg-surface-soft/50 border border-hairline space-y-3">
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            <div>
                              <label className="block text-[10px] font-semibold text-muted uppercase mb-1">Cheque No *</label>
                              <input
                                required
                                type="text"
                                value={chequeNo}
                                onChange={e => setChequeNo(e.target.value)}
                                className="w-full px-2.5 py-1.5 bg-canvas border border-hairline rounded-lg text-xs text-ink"
                                placeholder="e.g. 402911"
                              />
                            </div>
                            <div>
                              <label className="block text-[10px] font-semibold text-muted uppercase mb-1">Bank Name</label>
                              <input
                                required
                                type="text"
                                value={bankName}
                                onChange={e => setBankName(e.target.value)}
                                className="w-full px-2.5 py-1.5 bg-canvas border border-hairline rounded-lg text-xs text-ink"
                                placeholder="e.g. HDFC Bank"
                              />
                            </div>
                            <div>
                              <label className="block text-[10px] font-semibold text-muted uppercase mb-1">Cheque Due Date *</label>
                              <input
                                required
                                type="date"
                                value={chequeDate}
                                onChange={e => setChequeDate(e.target.value)}
                                className="w-full px-2.5 py-1.5 bg-canvas border border-hairline rounded-lg text-xs text-ink"
                              />
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Reference / Transaction No & Notes in 2 Columns */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs font-semibold text-muted uppercase tracking-wider mb-1.5">
                            Reference / Transaction No <span className="text-[11px] text-muted normal-case font-normal">(Optional)</span>
                          </label>
                          <input
                            type="text"
                            value={referenceNo}
                            onChange={e => setReferenceNo(e.target.value)}
                            className="w-full px-3 py-2 bg-canvas border border-hairline rounded-xl text-xs text-ink placeholder-muted focus:outline-none focus:border-primary transition-colors"
                            placeholder="e.g. UPI Ref / Cash receipt / Memo"
                          />
                        </div>

                        <div>
                          <label className="block text-xs font-semibold text-muted uppercase tracking-wider mb-1.5">
                            Notes / Remarks <span className="text-[11px] text-muted normal-case font-normal">(Optional)</span>
                          </label>
                          <input
                            type="text"
                            value={notes}
                            onChange={e => setNotes(e.target.value)}
                            className="w-full px-3 py-2 bg-canvas border border-hairline rounded-xl text-xs text-ink placeholder-muted focus:outline-none focus:border-primary transition-colors"
                            placeholder="e.g. Advance deposit for upcoming orders"
                          />
                        </div>
                      </div>
                    </>
                  )}

                  {/* Action Buttons */}
                  <div className="pt-3 border-t border-hairline flex justify-end gap-2.5">
                    <button
                      type="button"
                      onClick={() => {
                        setIsModalOpen(false);
                        setTargetedBill(null);
                      }}
                      className="px-4 py-2 text-xs font-medium text-ink hover:bg-surface-soft rounded-xl transition-colors border border-hairline"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isProcessing || amount === '' || amount <= 0 || (paymentMode === 'Cheque' && !chequeNo.trim())}
                      className="px-5 py-2 text-xs font-semibold bg-primary hover:bg-primary-active text-on-primary rounded-xl shadow-sm transition-colors disabled:opacity-50"
                    >
                      {isProcessing
                        ? 'Saving...'
                        : paymentModalTab === 'advance'
                        ? `Record Advance (₹${typeof amount === 'number' ? amount.toFixed(2) : '0.00'})`
                        : `Record & Clear Dues (₹${typeof amount === 'number' ? amount.toFixed(2) : '0.00'})`}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          );
        })()}
      </div>
    </>
  );
}
