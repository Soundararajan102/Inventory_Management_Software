import { useState, useEffect, useMemo } from 'react';
import { useLocation, useNavigate, Link } from 'react-router-dom';
import {
  Users,
  Truck,
  Search,
  Plus,
  X,
  Printer,
  Pencil,
  ArrowLeft,
  ArrowRight,
  IndianRupee,
  CreditCard,
  MapPin,
  Phone,
  Mail,
  FileText,
  CheckCircle2,
  Calendar,
  AlertCircle,
  Receipt,
  RotateCcw,
  Building2,
  Check,
  Eye,
  MoreVertical,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  History,
  Shield
} from 'lucide-react';
import {
  getCustomers,
  addCustomer,
  editCustomer,
  getSuppliers,
  addSupplier,
  editSupplier,
  getSaleDetails,
  getPartyProfileData,
  recordPayment,
  clearPdcCheque,
  bounceCheque,
  isPdcDate,
  applyAdvanceToClearDues
} from '../lib/db';
import type {
  Customer,
  Supplier,
  PartyProfileData,
  PartyBillItem
} from '../lib/db';
import { Receipt as ReceiptComponent } from '../components/Receipt';
import type { ReceiptData } from '../components/Receipt';
import { PrintableReport } from '../components/PrintableReport';
import type { PrintableReportData } from '../components/PrintableReport';
import { handleFormKeyDown } from '../lib/keyboard';

function getTodayString(): string {
  const d = new Date();
  const offset = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - offset).toISOString().split('T')[0];
}

function getInitials(name: string): string {
  if (!name) return '??';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
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
    return { text: `Due in ${diffDays}d`, isPast: false, isToday: false };
  } else {
    return { text: `${Math.abs(diffDays)}d overdue`, isPast: true, isToday: false };
  }
}

function formatDateTime(dateStr?: string | null): { date: string; time: string } {
  if (!dateStr) return { date: '-', time: '' };
  try {
    const cleanStr = dateStr.includes('T') ? dateStr : dateStr.replace(' ', 'T');
    const d = new Date(cleanStr);
    if (isNaN(d.getTime())) {
      const parts = dateStr.split(' ');
      return { date: parts[0] || dateStr, time: parts[1] || '' };
    }
    const dateFormatted = d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    const hasTime = dateStr.includes(' ') || dateStr.includes('T');
    const timeFormatted = hasTime ? d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }) : '';
    return { date: dateFormatted, time: timeFormatted };
  } catch (e) {
    return { date: dateStr.split(' ')[0], time: '' };
  }
}

function getDaysElapsed(dateStr?: string | null): number {
  if (!dateStr) return 0;
  try {
    const cleanStr = dateStr.includes('T') ? dateStr : dateStr.replace(' ', 'T');
    const billDate = new Date(cleanStr);
    if (isNaN(billDate.getTime())) return 0;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const target = new Date(billDate.getFullYear(), billDate.getMonth(), billDate.getDate());

    const diffTime = today.getTime() - target.getTime();
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    return Math.max(0, diffDays);
  } catch {
    return 0;
  }
}

export default function Contacts() {
  const location = useLocation();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'customers' | 'suppliers'>(
    (location.state as any)?.activeTab || 'customers'
  );
  const [filterBalance, setFilterBalance] = useState<'all' | 'due' | 'settled'>(
    (location.state as any)?.filterWithBalance ? 'due' : 'all'
  );
  const [search, setSearch] = useState('');

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(false);

  // Selected party for profile view
  const [selectedParty, setSelectedParty] = useState<Customer | Supplier | null>(null);
  const [profileData, setProfileData] = useState<PartyProfileData | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileActiveTab, setProfileActiveTab] = useState<'bills' | 'cheques' | 'payments' | 'ledger' | 'returns'>('bills');
  const [billFilter, setBillFilter] = useState<'all' | 'due' | 'paid'>('all');
  const [chequeFilter, setChequeFilter] = useState<'all' | 'pdc_pending' | 'cleared' | 'bounced'>('all');
  const [expandedProducts, setExpandedProducts] = useState<Record<string, boolean>>({});
  const [openDropdownId, setOpenDropdownId] = useState<string | null>(null);

  // Bill Sort State
  const [billSortField, setBillSortField] = useState<'date' | 'invoice_number' | 'entity_name' | 'total_quantity' | 'taxable_amount' | 'tax_amount' | 'net_amount' | 'due_amount' | 'days_elapsed'>('date');
  const [billSortDirection, setBillSortDirection] = useState<'asc' | 'desc'>('desc');

  // Ledger & Timeline Sort/Filter State
  const [ledgerSortOrder, setLedgerSortOrder] = useState<'desc' | 'asc'>('desc');
  const [timelineFilter, setTimelineFilter] = useState<'all' | 'bills' | 'payments' | 'advances' | 'returns'>('all');
  const displayedLedger = useMemo(() => {
    if (!profileData?.ledger) return [];
    let list = profileData.ledger;
    if (timelineFilter === 'bills') {
      list = list.filter(e => e.type === 'Sale' || e.type === 'Purchase');
    } else if (timelineFilter === 'payments') {
      list = list.filter(e => e.type === 'Payment' || e.type === 'Advance');
    } else if (timelineFilter === 'advances') {
      list = list.filter(e => e.type === 'Advance' || e.is_advance || (e.description && e.description.toLowerCase().includes('advance')));
    } else if (timelineFilter === 'returns') {
      list = list.filter(e => e.type === 'Return');
    }
    return ledgerSortOrder === 'desc' ? list : [...list].reverse();
  }, [profileData?.ledger, ledgerSortOrder, timelineFilter]);

  // Party Add / Edit Modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [gstin, setGstin] = useState('');

  // Quick Payment Modal (Collect / Pay)
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [paymentModalTab, setPaymentModalTab] = useState<'clear_dues' | 'advance'>('clear_dues');
  const [paymentParty, setPaymentParty] = useState<Customer | Supplier | null>(null);
  const [targetedBill, setTargetedBill] = useState<PartyBillItem | null>(null);
  const [partyDueBills, setPartyDueBills] = useState<PartyBillItem[]>([]);
  const [isLoadingDueBills, setIsLoadingDueBills] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState<number | ''>('');
  const [paymentMode, setPaymentMode] = useState<'Cash' | 'UPI' | 'Bank Transfer' | 'Cheque'>('Cash');
  const [chequeNo, setChequeNo] = useState('');
  const [bankName, setBankName] = useState('');
  const [chequeDate, setChequeDate] = useState(getTodayString());
  const [referenceNo, setReferenceNo] = useState('');
  const [notes, setNotes] = useState('');
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);

  // Print states
  const [printData, setPrintData] = useState<ReceiptData | null>(null);
  const [ledgerReportPrintData, setLedgerReportPrintData] = useState<PrintableReportData | null>(null);

  useEffect(() => {
    loadData();
    const closeDropdown = () => setOpenDropdownId(null);
    window.addEventListener('click', closeDropdown);
    return () => window.removeEventListener('click', closeDropdown);
  }, []);

  useEffect(() => {
    if (location.state) {
      if ((location.state as any).activeTab) {
        setActiveTab((location.state as any).activeTab);
      }
      if ((location.state as any).filterWithBalance) {
        setFilterBalance('due');
      }
    }
  }, [location.state]);

  async function loadData() {
    try {
      setLoading(true);
      const [custs, supps] = await Promise.all([getCustomers(), getSuppliers()]);
      setCustomers(custs);
      setSuppliers(supps);

      // Check if returning from a party profile or if selectedParty is set
      const targetPartyId = (location.state as any)?.selectedPartyId || (location.state as any)?.partyId || selectedParty?.id;
      if (targetPartyId) {
        const currentTab = (location.state as any)?.partyType || (location.state as any)?.activeTab || activeTab;
        const list = currentTab === 'customers' ? custs : supps;
        const found = list.find(p => p.id === targetPartyId);
        if (found) {
          setSelectedParty(found);
          loadProfileData(currentTab === 'customers' ? 'customer' : 'supplier', found.id);
        }
      }
    } catch (e) {
      console.error('Failed to load contacts', e);
    } finally {
      setLoading(false);
    }
  }

  async function loadProfileData(type: 'customer' | 'supplier', id: number) {
    try {
      setProfileLoading(true);
      const data = await getPartyProfileData(type, id);
      setProfileData(data);
    } catch (err) {
      console.error('Failed to load party profile data', err);
    } finally {
      setProfileLoading(false);
    }
  }

  function handleSelectParty(party: Customer | Supplier) {
    setSelectedParty(party);
    setProfileActiveTab('bills');
    setBillFilter('all');
    setChequeFilter('all');
    setTimelineFilter('all');
    loadProfileData(activeTab === 'customers' ? 'customer' : 'supplier', Number(party.id));
  }

  function handleBackToList() {
    setSelectedParty(null);
    setProfileData(null);
    navigate('/contacts', { replace: true, state: { activeTab } });
  }

  function openEditModal(party: Customer | Supplier) {
    setEditingId(party.id);
    setName(party.name);
    setPhone(party.phone || '');
    setEmail(party.email || '');
    setAddress(party.address || '');
    setGstin((party.gstin || '').toUpperCase());
    setIsModalOpen(true);
  }

  function closeModal() {
    setIsModalOpen(false);
    setEditingId(null);
    setName('');
    setPhone('');
    setEmail('');
    setAddress('');
    setGstin('');
  }

  async function handleSaveParty(e: React.FormEvent) {
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
      await loadData();
    } catch (error) {
      console.error('Failed to save party', error);
      alert(`Error saving contact: ${error}`);
    }
  }

  // Quick Payment handler (General)
  async function openPaymentModal(
    party: Customer | Supplier,
    presetAmount?: number,
    presetNotes?: string,
    targetBill?: PartyBillItem | null
  ) {
    setPaymentParty(party);
    setTargetedBill(targetBill || null);
    setPaymentMode('Cash');
    setChequeNo('');
    setBankName('');
    setChequeDate(getTodayString());
    setReferenceNo(targetBill ? (targetBill.invoice_number || String(targetBill.id)) : '');
    setNotes(presetNotes || '');

    // Default mode: if targetBill or balance > 0, default to 'clear_dues', else 'advance'
    if (targetBill || party.balance > 0) {
      setPaymentModalTab('clear_dues');
    } else {
      setPaymentModalTab('advance');
    }

    // Fetch and populate pending bills for this party
    setIsLoadingDueBills(true);
    try {
      const pType = activeTab === 'customers' ? 'customer' : 'supplier';
      let dues: PartyBillItem[] = [];
      if (selectedParty && selectedParty.id === party.id && profileData && profileData.bills) {
        dues = profileData.bills.filter(b => b.due_amount > 0.001);
      } else {
        const data = await getPartyProfileData(pType, party.id);
        dues = (data.bills || []).filter(b => b.due_amount > 0.001);
      }
      setPartyDueBills(dues);

      const totalDues = dues.reduce((sum, b) => sum + (b.due_amount || 0), 0);
      setPaymentAmount(
        typeof presetAmount === 'number'
          ? Number(presetAmount.toFixed(2))
          : targetBill
          ? Number(targetBill.due_amount.toFixed(2))
          : totalDues > 0
          ? Number(totalDues.toFixed(2))
          : party.balance > 0
          ? Number(party.balance.toFixed(2))
          : ''
      );
    } catch (e) {
      console.error('Failed to load due bills for payment modal', e);
      setPartyDueBills([]);
      setPaymentAmount(
        typeof presetAmount === 'number'
          ? Number(presetAmount.toFixed(2))
          : party.balance > 0
          ? Number(party.balance.toFixed(2))
          : ''
      );
    } finally {
      setIsLoadingDueBills(false);
    }

    setIsPaymentModalOpen(true);
  }

  function handleSelectDueBill(billIdStr: string) {
    if (!billIdStr) {
      setTargetedBill(null);
      setNotes('');
      const totalDues = partyDueBills.reduce((sum, b) => sum + (b.due_amount || 0), 0);
      if (totalDues > 0) {
        setPaymentAmount(Number(totalDues.toFixed(2)));
      } else if (paymentParty && paymentParty.balance > 0) {
        setPaymentAmount(Number(paymentParty.balance.toFixed(2)));
      }
      return;
    }
    const bill = partyDueBills.find(b => String(b.id) === billIdStr);
    if (bill) {
      setTargetedBill(bill);
      setPaymentAmount(Number(bill.due_amount.toFixed(2)));
      setNotes(`Payment against Bill #${bill.invoice_number || bill.id}`);
    }
  }

  // Clear specific bill due
  function openClearBillDueModal(bill: PartyBillItem) {
    if (!selectedParty) return;
    openPaymentModal(
      selectedParty,
      bill.due_amount,
      `Payment against Bill #${bill.invoice_number || bill.id}`,
      bill
    );
  }

  async function handleRecordPaymentSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!paymentParty || !paymentAmount || paymentAmount <= 0) return;

    try {
      setIsProcessingPayment(true);
      const entityType = activeTab === 'customers' ? 'customer' : 'supplier';
      const finalNotes = paymentModalTab === 'advance'
        ? (notes.trim() || `${activeTab === 'customers' ? 'Customer' : 'Supplier'} Advance Deposit`)
        : (notes.trim() || (targetedBill ? `Payment against Bill #${targetedBill.invoice_number || targetedBill.id}` : 'Payment clearing due bills'));

      await recordPayment(
        entityType,
        paymentParty.id,
        Number(paymentAmount),
        paymentMode,
        referenceNo,
        finalNotes,
        paymentMode === 'Cheque' ? chequeNo : null,
        paymentMode === 'Cheque' ? bankName : null,
        paymentMode === 'Cheque' ? chequeDate : null,
        null,
        paymentModalTab === 'clear_dues' && targetedBill ? targetedBill.id : null
      );
      setIsPaymentModalOpen(false);
      setTargetedBill(null);
      setPartyDueBills([]);
      await loadData();
    } catch (err) {
      console.error('Failed to record payment', err);
      alert(`Error recording payment: ${err}`);
    } finally {
      setIsProcessingPayment(false);
    }
  }

  async function handleUseAdvanceToClearDues() {
    if (!paymentParty) return;
    const availAdvance: number = Number(paymentParty.advance_balance || 0) > 0 
      ? Number(paymentParty.advance_balance) 
      : (paymentParty.balance < 0 ? Math.abs(paymentParty.balance) : 0);
    const billsDue = partyDueBills.reduce((sum, b) => sum + (b.due_amount || 0), 0);
    if (availAdvance <= 0 || billsDue <= 0) return;

    const amountToApply = Math.min(availAdvance, billsDue);
    const partyRole = activeTab === 'customers' ? 'Customer' : 'Supplier';
    if (!confirm(`Apply ₹${amountToApply.toFixed(2)} from available advance balance to clear open bill dues for this ${partyRole}?`)) {
      return;
    }

    try {
      setIsProcessingPayment(true);
      const entityType = activeTab === 'customers' ? 'customer' : 'supplier';
      const res = await applyAdvanceToClearDues(entityType, paymentParty.id, amountToApply);
      alert(`Success: ₹${res.appliedAmount.toFixed(2)} from stored advance applied! ${res.clearedCount} bill(s) cleared/updated.`);
      setIsPaymentModalOpen(false);
      setTargetedBill(null);
      setPartyDueBills([]);
      await loadData();
    } catch (err) {
      console.error('Failed to apply advance', err);
      alert(`Error applying advance: ${err}`);
    } finally {
      setIsProcessingPayment(false);
    }
  }

  // Clear PDC Cheque directly inside profile
  async function handleClearCheque(paymentId: number) {
    if (!confirm('Mark this cheque as cleared? This will update the party account balance.')) return;
    try {
      await clearPdcCheque(paymentId);
      await loadData();
    } catch (e) {
      console.error(e);
      alert('Error clearing cheque: ' + e);
    }
  }

  // Bounce PDC Cheque directly inside profile
  async function handleBounceCheque(paymentId: number) {
    if (!confirm('Mark this cheque as bounced?')) return;
    try {
      await bounceCheque(paymentId);
      await loadData();
    } catch (e) {
      console.error(e);
      alert('Error: ' + e);
    }
  }

  // Print Invoice / Bill
  async function handlePrintSale(invoiceNo: string) {
    try {
      const details = await getSaleDetails(invoiceNo);
      if (details.length === 0) return;
      const detail = details[0];

      const customer = customers.find(c => c.id === detail.entity_id) || selectedParty;

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
      const netAmount = Number(detail.net_amount || 0);
      const taxAmount = Number(detail.tax_amount || 0);
      const discountAmount = Number(detail.discount || 0);
      const diffInclusive = Math.abs(netAmount - (originalPriceBasis - discountAmount));
      const diffExclusive = Math.abs(netAmount - (originalPriceBasis - discountAmount + taxAmount));
      const isInclusive = taxAmount > 0 ? (diffInclusive < diffExclusive) : (diffInclusive <= 1.0);
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

  // Print Statement of Account PDF
  const handlePrintLedgerPDF = () => {
    if (!selectedParty || !profileData) return;

    let totalDr = 0;
    let totalCr = 0;
    profileData.ledger.forEach(e => {
      totalDr += e.debit || 0;
      totalCr += e.credit || 0;
    });

    const printRows = [...profileData.ledger].reverse().map(e => {
      const dt = formatDateTime(e.date);
      return {
        ...e,
        formattedDate: dt.time ? `${dt.date} ${dt.time}` : dt.date,
        formattedDebit: e.debit > 0 ? `₹${e.debit.toFixed(2)}` : '-',
        formattedCredit: e.credit > 0 ? `₹${e.credit.toFixed(2)}` : '-',
        formattedBalance: Math.abs(e.balance) < 0.005 
          ? '₹0.00' 
          : `₹${Math.abs(e.balance).toFixed(2)} ${
              activeTab === 'customers' 
                ? (e.balance > 0 ? '(Dr)' : '(Cr)') 
                : (e.balance > 0 ? '(Cr)' : '(Dr)')
            }`
      };
    });

    setLedgerReportPrintData({
      reportTitle: `${activeTab === 'customers' ? 'CUSTOMER' : 'SUPPLIER'} STATEMENT OF ACCOUNT`,
      partyDetails: {
        name: selectedParty.name,
        phone: selectedParty.phone || undefined,
        address: selectedParty.address || undefined,
        gstin: selectedParty.gstin ? selectedParty.gstin.toUpperCase() : undefined,
        type: activeTab === 'customers' ? 'Customer' : 'Supplier',
        closingBalance: selectedParty.balance
      },
      summaryCards: [
        { label: 'Total Billed (Dr)', value: `₹${totalDr.toFixed(2)}` },
        { label: 'Total Paid (Cr)', value: `₹${totalCr.toFixed(2)}` },
        {
          label: 'Closing Balance',
          value: Math.abs(selectedParty.balance) < 0.005 
            ? '₹0.00' 
            : `₹${Math.abs(selectedParty.balance).toFixed(2)} ${
                activeTab === 'customers'
                  ? (selectedParty.balance > 0 ? '(Dr/Due)' : '(Cr/Advance)')
                  : (selectedParty.balance > 0 ? '(Cr/Payable)' : '(Dr/Advance)')
              }`,
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
        formattedBalance: Math.abs(selectedParty.balance) < 0.005
          ? '₹0.00'
          : `₹${Math.abs(selectedParty.balance).toFixed(2)} ${
              activeTab === 'customers' 
                ? (selectedParty.balance > 0 ? '(Dr)' : '(Cr)') 
                : (selectedParty.balance > 0 ? '(Cr)' : '(Dr)')
            }`
      }
    });

    setTimeout(() => {
      window.print();
    }, 150);
  };

  // Compute active list & metrics
  const partyList = activeTab === 'customers' ? customers : suppliers;

  const totalOutstanding = partyList.reduce((acc, p) => acc + (p.balance > 0 ? p.balance : 0), 0);
  const partiesWithDuesCount = partyList.filter(p => p.balance > 0).length;
  const settledPartiesCount = partyList.filter(p => p.balance <= 0).length;

  const filteredParties = partyList.filter(p => {
    if (filterBalance === 'due' && p.balance <= 0) return false;
    if (filterBalance === 'settled' && p.balance > 0) return false;
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      p.name.toLowerCase().includes(q) ||
      (p.phone && p.phone.includes(q)) ||
      (p.email && p.email.toLowerCase().includes(q)) ||
      (p.gstin && p.gstin.toLowerCase().includes(q)) ||
      (p.address && p.address.toLowerCase().includes(q))
    );
  });

  // Filter bills in profile view
  const profileBills = (profileData?.bills || []).filter(bill => {
    if (billFilter === 'due') return bill.due_amount > 0;
    if (billFilter === 'paid') return bill.due_amount <= 0;
    return true;
  });
  const dueBillsCount = (profileData?.bills || []).filter(b => b.due_amount > 0).length;
  const paidBillsCount = (profileData?.bills || []).filter(b => b.due_amount <= 0).length;

  const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

  const sortedProfileBills = [...profileBills].sort((a, b) => {
    let cmp = 0;
    if (billSortField === 'date') {
      const aTime = new Date(a.date).getTime() || 0;
      const bTime = new Date(b.date).getTime() || 0;
      cmp = aTime !== bTime ? aTime - bTime : a.id - b.id;
    } else if (billSortField === 'invoice_number') {
      const aVal = a.invoice_number || String(a.id);
      const bVal = b.invoice_number || String(b.id);
      cmp = collator.compare(aVal, bVal);
    } else if (billSortField === 'entity_name') {
      cmp = collator.compare(selectedParty?.name || '', selectedParty?.name || '');
    } else if (billSortField === 'total_quantity') {
      cmp = (a.total_quantity || a.item_count || 0) - (b.total_quantity || b.item_count || 0);
    } else if (billSortField === 'taxable_amount') {
      cmp = (a.taxable_amount || 0) - (b.taxable_amount || 0);
    } else if (billSortField === 'tax_amount') {
      cmp = (a.tax_amount || 0) - (b.tax_amount || 0);
    } else if (billSortField === 'net_amount') {
      cmp = (a.net_amount || 0) - (b.net_amount || 0);
    } else if (billSortField === 'due_amount') {
      cmp = (a.due_amount || 0) - (b.due_amount || 0);
    } else if (billSortField === 'days_elapsed') {
      cmp = getDaysElapsed(a.date) - getDaysElapsed(b.date);
    }
    return billSortDirection === 'asc' ? cmp : -cmp;
  });

  const handleBillHeaderSort = (field: typeof billSortField) => {
    if (billSortField === field) {
      setBillSortDirection(billSortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setBillSortField(field);
      setBillSortDirection('asc');
    }
  };

  const renderBillSortHeader = (label: string, field: typeof billSortField, align: 'left' | 'right' | 'center' = 'left') => {
    const isActive = billSortField === field;
    return (
      <th
        onClick={() => handleBillHeaderSort(field)}
        className={`px-4 py-2.5 text-xs font-semibold uppercase tracking-wider whitespace-nowrap cursor-pointer hover:bg-surface-soft select-none transition-colors group ${
          align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left'
        }`}
        title={`Sort by ${label} (${isActive && billSortDirection === 'asc' ? 'Click for Descending' : 'Click for Ascending'})`}
      >
        <div className={`inline-flex items-center gap-1.5 ${align === 'right' ? 'justify-end' : align === 'center' ? 'justify-center' : 'justify-start'}`}>
          <span>{label}</span>
          {isActive ? (
            billSortDirection === 'asc' ? (
              <ArrowUp className="w-3.5 h-3.5 text-primary stroke-[2.5]" />
            ) : (
              <ArrowDown className="w-3.5 h-3.5 text-primary stroke-[2.5]" />
            )
          ) : (
            <ArrowUpDown className="w-3.5 h-3.5 text-muted/30 group-hover:text-muted transition-colors" />
          )}
        </div>
      </th>
    );
  };

  // Filter cheques in profile view
  const profileCheques = (profileData?.cheques || []).filter(chq => {
    if (chequeFilter === 'pdc_pending') return chq.cheque_status === 'pdc_pending';
    if (chequeFilter === 'cleared') return chq.cheque_status === 'cleared';
    if (chequeFilter === 'bounced') return chq.cheque_status === 'bounced';
    return true;
  });
  const pendingChequesCount = (profileData?.cheques || []).filter(c => c.cheque_status === 'pdc_pending').length;

  return (
    <>
      <ReceiptComponent data={printData} />
      <PrintableReport data={ledgerReportPrintData} />

      <div className="p-6 md:p-8 min-h-full flex flex-col bg-canvas overflow-y-auto space-y-6 print:hidden">
        {/* ========================================================= */}
        {/* VIEW 1: DEDICATED PARTY PROFILE PAGE                      */}
        {/* ========================================================= */}
        {selectedParty ? (
          <div className="space-y-6 animate-in fade-in duration-200">
            {/* Top Navigation Bar */}
            <div className="flex items-center justify-between pb-3 border-b border-hairline">
              <button
                onClick={handleBackToList}
                className="inline-flex items-center gap-2 text-sm font-semibold text-muted hover:text-ink transition-colors px-3 py-1.5 rounded-lg hover:bg-surface-soft border border-hairline"
              >
                <ArrowLeft className="w-4 h-4" />
                Back to {activeTab === 'customers' ? 'All Customers' : 'All Suppliers'}
              </button>

              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-surface-soft text-muted border border-hairline">
                  {activeTab === 'customers' ? 'Customer Profile' : 'Supplier Profile'}
                </span>
                <button
                  onClick={() => openEditModal(selectedParty)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-hairline text-xs font-medium text-ink hover:bg-surface-soft transition-colors"
                >
                  <Pencil className="w-3.5 h-3.5 text-muted" /> Edit Details
                </button>
              </div>
            </div>

            {/* Profile Hero Header Card */}
            <div className="bg-canvas rounded-2xl border border-hairline shadow-sm p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
              {/* Left Details */}
              <div className="min-w-0 space-y-1.5">
                <h1 className="text-2xl font-bold font-display text-ink tracking-tight truncate">
                  {selectedParty.name}
                </h1>

                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                  {selectedParty.gstin && (
                    <span className="px-2 py-0.5 rounded font-mono text-[11px] font-semibold bg-surface-soft text-ink border border-hairline inline-flex items-center gap-1 shadow-2xs">
                      <span className="text-muted font-normal">GST:</span> {selectedParty.gstin.toUpperCase()}
                    </span>
                  )}
                  {selectedParty.phone && (
                    <span className="flex items-center gap-1 text-muted">
                      <Phone className="w-3.5 h-3.5 text-muted/70" /> {selectedParty.phone}
                    </span>
                  )}
                  {selectedParty.email && (
                    <span className="flex items-center gap-1 text-muted">
                      <Mail className="w-3.5 h-3.5 text-muted/70" /> {selectedParty.email}
                    </span>
                  )}
                  {selectedParty.address && (
                    <span className="flex items-center gap-1 text-muted">
                      <MapPin className="w-3.5 h-3.5 text-muted/70" /> {selectedParty.address}
                    </span>
                  )}
                  {!selectedParty.gstin && !selectedParty.phone && !selectedParty.email && !selectedParty.address && (
                    <span className="text-xs text-muted/70 italic">No additional contact details</span>
                  )}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-wrap items-center gap-2.5 shrink-0">
                <button
                  onClick={() => openPaymentModal(selectedParty)}
                  className="px-4 py-2 bg-primary hover:bg-primary-active text-on-primary font-medium text-xs rounded-lg shadow-sm transition-all flex items-center gap-1.5"
                >
                  <IndianRupee className="w-4 h-4" />
                  {activeTab === 'customers' ? 'Collect Payment' : 'Record Payment'}
                </button>

                {activeTab === 'customers' && (
                  <Link
                    to="/pos"
                    className="px-3.5 py-2 bg-surface-soft hover:bg-surface-soft/80 text-ink font-medium text-xs rounded-lg border border-hairline transition-colors flex items-center gap-1.5"
                  >
                    <Plus className="w-4 h-4 text-muted" /> New Sale (POS)
                  </Link>
                )}

                <button
                  onClick={handlePrintLedgerPDF}
                  className="px-3.5 py-2 bg-surface-soft hover:bg-surface-soft/80 text-ink font-medium text-xs rounded-lg border border-hairline transition-colors flex items-center gap-1.5"
                  title="Print or Export Statement PDF"
                >
                  <Printer className="w-4 h-4 text-muted" /> Print Statement
                </button>
              </div>
            </div>

            {/* Financial Summary KPI Cards (4 in a row) */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Total Business */}
              <div className="bg-canvas rounded-xl border border-hairline shadow-sm p-4 flex flex-col justify-between">
                <div className="flex items-center justify-between text-muted text-xs mb-1">
                  <span className="font-semibold uppercase tracking-wider text-[10px]">
                    {activeTab === 'customers' ? 'Total Sales' : 'Total Purchases'}
                  </span>
                  <Receipt className="w-4 h-4 text-blue-500" />
                </div>
                <div className="text-xl font-bold font-display text-ink mt-1">
                  ₹{profileData ? profileData.totalBilled.toLocaleString('en-IN', { minimumFractionDigits: 2 }) : '...'}
                </div>
                <span className="text-[11px] text-muted mt-0.5">Lifetime Gross Turnover</span>
              </div>

              {/* Total Paid */}
              <div className="bg-canvas rounded-xl border border-hairline shadow-sm p-4 flex flex-col justify-between">
                <div className="flex items-center justify-between text-muted text-xs mb-1">
                  <span className="font-semibold uppercase tracking-wider text-[10px]">Total Paid / Settled</span>
                  <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                </div>
                <div className="text-xl font-bold font-display text-ink mt-1">
                  ₹{profileData ? profileData.totalPaid.toLocaleString('en-IN', { minimumFractionDigits: 2 }) : '...'}
                </div>
                <span className="text-[11px] text-muted mt-0.5">Cleared payments recorded</span>
              </div>

              {/* Unpaid Bill Dues */}
              <div className="bg-canvas rounded-xl border border-hairline shadow-sm p-4 flex flex-col justify-between">
                <div className="flex items-center justify-between text-muted text-xs mb-1">
                  <span className="font-semibold uppercase tracking-wider text-[10px]">Unpaid Bill Dues</span>
                  <FileText className="w-4 h-4 text-purple-500" />
                </div>
                <div className={`text-xl font-bold font-display mt-1 ${profileData && profileData.totalPendingDue > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                  ₹{profileData ? profileData.totalPendingDue.toLocaleString('en-IN', { minimumFractionDigits: 2 }) : '...'}
                </div>
                <span className="text-[11px] text-muted mt-0.5">Across {dueBillsCount} unpaid bills</span>
              </div>

              {/* Available Advance Credit */}
              <div className="bg-canvas rounded-xl border border-hairline shadow-sm p-4 flex flex-col justify-between">
                <div className="flex items-center justify-between text-muted text-xs mb-1">
                  <span className="font-semibold uppercase tracking-wider text-[10px]">Stored Advance Credit</span>
                  <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                </div>
                <div className={`text-xl font-bold font-display mt-1 ${(selectedParty.advance_balance || 0) > 0 ? 'text-emerald-600' : 'text-muted'}`}>
                  ₹{(selectedParty.advance_balance || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </div>
                <span className="text-[11px] font-medium text-muted mt-0.5">
                  {(selectedParty.advance_balance || 0) > 0 ? 'Available store credit' : 'No stored advance'}
                </span>
              </div>
            </div>

            {/* Profile Sub-Tabs Navigation */}
            <div className="bg-canvas rounded-xl border border-hairline shadow-sm overflow-hidden">
              <div className="flex items-center gap-1 p-2 border-b border-hairline bg-surface-soft/40 overflow-x-auto">
                <button
                  onClick={() => setProfileActiveTab('bills')}
                  className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all flex items-center gap-2 whitespace-nowrap ${
                    profileActiveTab === 'bills'
                      ? 'bg-canvas text-ink shadow-xs border border-hairline'
                      : 'text-muted hover:text-ink hover:bg-surface-soft'
                  }`}
                >
                  <Receipt className="w-3.5 h-3.5" />
                  All Bills & Invoices ({profileData?.bills.length || 0})
                </button>

                <button
                  onClick={() => setProfileActiveTab('ledger')}
                  className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all flex items-center gap-2 whitespace-nowrap ${
                    profileActiveTab === 'ledger' || profileActiveTab === 'payments'
                      ? 'bg-canvas text-ink shadow-xs border border-hairline'
                      : 'text-muted hover:text-ink hover:bg-surface-soft'
                  }`}
                >
                  <History className="w-3.5 h-3.5 text-primary" />
                  Account Timeline & Statement ({profileData?.ledger.length || 0})
                </button>

                <button
                  onClick={() => setProfileActiveTab('cheques')}
                  className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all flex items-center gap-2 whitespace-nowrap ${
                    profileActiveTab === 'cheques'
                      ? 'bg-canvas text-ink shadow-xs border border-hairline'
                      : 'text-muted hover:text-ink hover:bg-surface-soft'
                  }`}
                >
                  <CreditCard className="w-3.5 h-3.5" />
                  Cheques ({profileData?.cheques?.length || 0})
                  {pendingChequesCount > 0 && (
                    <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-amber-500/15 text-amber-700">
                      {pendingChequesCount} PDC
                    </span>
                  )}
                </button>

                {profileData?.returns && profileData.returns.length > 0 && (
                  <button
                    onClick={() => setProfileActiveTab('returns')}
                    className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all flex items-center gap-2 whitespace-nowrap ${
                      profileActiveTab === 'returns'
                        ? 'bg-canvas text-ink shadow-xs border border-hairline'
                        : 'text-muted hover:text-ink hover:bg-surface-soft'
                    }`}
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    Returns ({profileData.returns.length})
                  </button>
                )}
              </div>

              {/* ========================================================= */}
              {/* SUB-TAB 1: BILLS & INVOICES (DAY BOOK STYLE)              */}
              {/* ========================================================= */}
              {profileActiveTab === 'bills' && (
                <div>
                  {/* Sub-Filters */}
                  <div className="px-4 py-2.5 border-b border-hairline flex flex-wrap items-center justify-between gap-3 bg-surface-soft/20 text-xs">
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => setBillFilter('all')}
                        className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                          billFilter === 'all'
                            ? 'bg-primary/10 text-primary border border-primary/20 font-semibold'
                            : 'text-muted hover:text-ink hover:bg-surface-soft'
                        }`}
                      >
                        All Bills ({profileData?.bills.length || 0})
                      </button>
                      <button
                        onClick={() => setBillFilter('due')}
                        className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                          billFilter === 'due'
                            ? 'bg-red-500/10 text-red-700 border border-red-500/20 font-semibold'
                            : 'text-muted hover:text-ink hover:bg-surface-soft'
                        }`}
                      >
                        With Dues ({dueBillsCount})
                      </button>
                      <button
                        onClick={() => setBillFilter('paid')}
                        className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                          billFilter === 'paid'
                            ? 'bg-emerald-500/10 text-emerald-700 border border-emerald-500/20 font-semibold'
                            : 'text-muted hover:text-ink hover:bg-surface-soft'
                        }`}
                      >
                        Fully Paid ({paidBillsCount})
                      </button>
                    </div>

                    <span className="text-[11px] text-muted">
                      Showing {sortedProfileBills.length} bills with product breakdown
                    </span>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead className="sticky top-0 bg-surface-soft border-b border-hairline z-10">
                        <tr className="text-muted text-xs">
                          {renderBillSortHeader('Date', 'date')}
                          {activeTab === 'customers' ? (
                            <>
                              {renderBillSortHeader('Bill No', 'invoice_number')}
                              {renderBillSortHeader('Customer', 'entity_name')}
                            </>
                          ) : (
                            <>
                              {renderBillSortHeader('Supplier', 'entity_name')}
                              {renderBillSortHeader('Invoice #', 'invoice_number')}
                            </>
                          )}
                          <th className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wider min-w-[240px]">
                            Products Bought
                          </th>
                          {renderBillSortHeader('Total Qty', 'total_quantity', 'center')}
                          <th className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-right whitespace-nowrap">
                            Taxable (₹)
                          </th>
                          {renderBillSortHeader('Tax (₹)', 'tax_amount', 'right')}
                          {renderBillSortHeader('Net Amount (₹)', 'net_amount', 'right')}
                          {renderBillSortHeader('Days', 'days_elapsed', 'center')}
                          <th className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-center whitespace-nowrap">
                            Action
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-hairline">
                        {profileLoading ? (
                          <tr>
                            <td colSpan={10} className="p-8 text-center text-muted text-xs">
                              Loading bills...
                            </td>
                          </tr>
                        ) : sortedProfileBills.length > 0 ? (
                          sortedProfileBills.map(bill => {
                            const productLines = bill.products_bought
                              ? bill.products_bought.split('\n').filter(Boolean)
                              : [];
                            const isExpanded = !!expandedProducts[`bill-${bill.id}`];

                            return (
                              <tr
                                key={bill.id}
                                className={`hover:bg-surface-soft/60 transition-colors align-middle text-xs ${
                                  bill.status === 'Returned' ? 'bg-red-50/20' : ''
                                }`}
                              >
                                {/* 1. Date */}
                                <td className="px-4 py-2.5 text-muted font-medium whitespace-nowrap">
                                  <div className="font-medium text-ink">{formatDateTime(bill.date).date}</div>
                                  {formatDateTime(bill.date).time && (
                                    <div className="text-[10px] text-muted font-mono">{formatDateTime(bill.date).time}</div>
                                  )}
                                </td>

                                {/* 2 & 3. Bill No & Customer / Supplier */}
                                {activeTab === 'customers' ? (
                                  <>
                                    <td className="px-4 py-2.5 font-medium whitespace-nowrap">
                                      <button
                                        type="button"
                                        onClick={() =>
                                          navigate(`/pos?viewId=${bill.id}`, {
                                            state: {
                                              from: 'contacts',
                                              partyId: selectedParty.id,
                                              partyType: activeTab,
                                              partyName: selectedParty.name
                                            }
                                          })
                                        }
                                        className="text-primary hover:underline font-mono font-bold cursor-pointer"
                                        title="Click to view full bill details (Read-Only)"
                                      >
                                        {bill.invoice_number || bill.id}
                                      </button>
                                    </td>
                                    <td className="px-4 py-2.5 font-medium text-ink whitespace-nowrap">
                                      <div className="flex items-center gap-1.5 flex-wrap">
                                        <span>{selectedParty.name}</span>
                                        {bill.status && bill.status !== 'Paid' && (
                                          <span
                                            className={`px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider ${
                                              bill.status === 'Returned'
                                                ? 'bg-red-100 text-red-700'
                                                : 'bg-amber-100 text-amber-700'
                                            }`}
                                          >
                                            {bill.status}
                                          </span>
                                        )}
                                        {bill.due_amount > 0 && (
                                          <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-red-100 text-red-700 border border-red-200">
                                            Due: ₹{bill.due_amount.toFixed(2)}
                                          </span>
                                        )}
                                      </div>
                                    </td>
                                  </>
                                ) : (
                                  <>
                                    <td className="px-4 py-2.5 font-medium text-ink whitespace-nowrap">
                                      <div className="flex items-center gap-1.5 flex-wrap">
                                        <span>{selectedParty.name}</span>
                                        {bill.status && bill.status !== 'Paid' && (
                                          <span
                                            className={`px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider ${
                                              bill.status === 'Returned'
                                                ? 'bg-red-100 text-red-700'
                                                : 'bg-amber-100 text-amber-700'
                                            }`}
                                          >
                                            {bill.status}
                                          </span>
                                        )}
                                        {bill.due_amount > 0 && (
                                          <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-red-100 text-red-700 border border-red-200">
                                            Due: ₹{bill.due_amount.toFixed(2)}
                                          </span>
                                        )}
                                      </div>
                                    </td>
                                    <td className="px-4 py-2.5 font-medium whitespace-nowrap">
                                      <button
                                        type="button"
                                        onClick={() =>
                                          navigate(`/purchases?viewId=${bill.id}`, {
                                            state: {
                                              from: 'contacts',
                                              partyId: selectedParty.id,
                                              partyType: activeTab,
                                              partyName: selectedParty.name
                                            }
                                          })
                                        }
                                        className="text-primary hover:underline font-mono font-bold cursor-pointer"
                                        title="Click to view full purchase details (Read-Only)"
                                      >
                                        {bill.invoice_number || bill.id}
                                      </button>
                                    </td>
                                  </>
                                )}

                                {/* 4. Products Bought */}
                                <td className="px-4 py-2.5 text-xs">
                                  {productLines.length === 0 ? (
                                    <span className="text-muted">-</span>
                                  ) : productLines.length === 1 ? (
                                    <span
                                      className="font-medium text-ink truncate max-w-[260px] inline-block"
                                      title={productLines[0]}
                                    >
                                      {productLines[0]}
                                    </span>
                                  ) : (
                                    <div className="flex flex-col gap-1">
                                      <div className="flex items-center gap-1.5 flex-wrap">
                                        <span className="font-medium text-ink">
                                          {productLines[0]}
                                        </span>
                                        <button
                                          type="button"
                                          onClick={() =>
                                            setExpandedProducts(prev => ({
                                              ...prev,
                                              [`bill-${bill.id}`]: !prev[`bill-${bill.id}`]
                                            }))
                                          }
                                          className="text-[10px] font-semibold px-1.5 py-0.2 rounded bg-surface-soft hover:bg-hairline text-primary border border-hairline transition-colors cursor-pointer"
                                          title="Click to view all items in this bill"
                                        >
                                          {isExpanded ? 'Hide' : `+${productLines.length - 1} more`}
                                        </button>
                                      </div>
                                      {isExpanded && (
                                        <div className="flex flex-col gap-1 mt-1 pl-2 border-l-2 border-primary/30">
                                          {productLines.slice(1).map((line, idx) => (
                                            <span key={idx} className="text-muted font-medium">
                                              {line}
                                            </span>
                                          ))}
                                        </div>
                                      )}
                                    </div>
                                  )}
                                </td>

                                {/* 5. Total Qty */}
                                <td className="px-4 py-2.5 text-center font-bold text-ink whitespace-nowrap">
                                  {bill.total_quantity || bill.item_count || 0}
                                </td>

                                {/* 6. Taxable (₹) */}
                                <td className="px-4 py-2.5 text-right text-muted whitespace-nowrap">
                                  {bill.taxable_amount.toFixed(2)}
                                </td>

                                {/* 7. Tax (₹) */}
                                <td className="px-4 py-2.5 text-right text-muted whitespace-nowrap">
                                  {bill.tax_amount.toFixed(2)}
                                </td>

                                {/* 8. Net Amount (₹) */}
                                <td className="px-4 py-2.5 text-right font-bold text-ink text-sm whitespace-nowrap">
                                  <div>₹{bill.net_amount.toFixed(2)}</div>
                                  {bill.due_amount > 0 && (
                                    <div className="text-[10px] font-semibold text-red-600">
                                      Due: ₹{bill.due_amount.toFixed(2)}
                                    </div>
                                  )}
                                </td>

                                {/* 9. Day-wise Counting (Days / Bill Age - Last before Action column) */}
                                <td className="px-4 py-2.5 text-center whitespace-nowrap">
                                  {(() => {
                                    const days = getDaysElapsed(bill.date);
                                    return (
                                      <span
                                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold font-mono ${
                                          days === 0
                                            ? 'bg-primary/10 text-primary'
                                            : days <= 2
                                            ? 'bg-surface-soft text-ink border border-hairline'
                                            : days <= 15
                                            ? 'bg-surface-soft text-ink border border-hairline'
                                            : 'bg-amber-500/10 text-amber-700 border border-amber-500/20'
                                        }`}
                                        title={`Bill date: ${bill.date} (${days} ${days === 1 ? 'day' : 'days'} elapsed)`}
                                      >
                                        {days === 0 ? 'Today' : `${days} ${days === 1 ? 'day' : 'days'}`}
                                      </span>
                                    );
                                  })()}
                                </td>

                                {/* 10. Actions */}
                                <td className="px-4 py-2.5 text-center whitespace-nowrap">
                                  <div className="flex items-center justify-center gap-1">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        navigate(
                                          activeTab === 'customers'
                                            ? `/pos?viewId=${bill.id}`
                                            : `/purchases?viewId=${bill.id}`,
                                          {
                                            state: {
                                              from: 'contacts',
                                              partyId: selectedParty.id,
                                              partyType: activeTab,
                                              partyName: selectedParty.name
                                            }
                                          }
                                        );
                                      }}
                                      className="p-1 hover:bg-surface-soft rounded-md text-muted hover:text-primary transition-colors cursor-pointer"
                                      title="View Bill Details (Read-Only)"
                                    >
                                      <Eye className="w-3.5 h-3.5" />
                                    </button>

                                    {activeTab === 'customers' && (
                                      <button
                                        type="button"
                                        onClick={() => handlePrintSale(bill.invoice_number)}
                                        className="p-1 hover:bg-surface-soft rounded-md text-muted hover:text-primary transition-colors cursor-pointer"
                                        title="Quick Print Invoice"
                                      >
                                        <Printer className="w-3.5 h-3.5" />
                                      </button>
                                    )}

                                    <div className="relative">
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setOpenDropdownId(
                                            openDropdownId === `bill-${bill.id}` ? null : `bill-${bill.id}`
                                          );
                                        }}
                                        className="p-1 hover:bg-surface-soft rounded-md text-muted hover:text-ink transition-colors cursor-pointer"
                                        title="More Actions"
                                      >
                                        <MoreVertical className="w-3.5 h-3.5" />
                                      </button>

                                      {openDropdownId === `bill-${bill.id}` && (
                                        <div
                                          className="absolute right-0 top-6 w-36 bg-canvas border border-hairline rounded-lg shadow-lg py-1 z-20 animate-fade-in-up"
                                          onClick={(e) => e.stopPropagation()}
                                        >
                                          <button
                                            type="button"
                                            onClick={() => {
                                              setOpenDropdownId(null);
                                              navigate(
                                                activeTab === 'customers'
                                                  ? `/pos?editId=${bill.id}`
                                                  : `/purchases?editId=${bill.id}`,
                                                {
                                                  state: {
                                                    from: 'contacts',
                                                    partyId: selectedParty.id,
                                                    partyType: activeTab,
                                                    partyName: selectedParty.name
                                                  }
                                                }
                                              );
                                            }}
                                            className="w-full text-left px-3 py-1.5 text-xs text-ink hover:bg-surface-soft flex items-center gap-2 cursor-pointer"
                                          >
                                            <Pencil className="w-3.5 h-3.5 text-primary" />
                                            Edit Bill
                                          </button>

                                          {bill.due_amount > 0 && (
                                            <button
                                              type="button"
                                              onClick={() => {
                                                setOpenDropdownId(null);
                                                openClearBillDueModal(bill);
                                              }}
                                              className="w-full text-left px-3 py-1.5 text-xs text-red-600 hover:bg-red-50 flex items-center gap-2 cursor-pointer font-semibold"
                                            >
                                              <IndianRupee className="w-3.5 h-3.5 text-red-600" />
                                              Clear Due
                                            </button>
                                          )}
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                </td>
                              </tr>
                            );
                          })
                        ) : (
                          <tr>
                            <td colSpan={10} className="p-8 text-center text-muted text-xs">
                              No bills found under selected filter.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* ========================================================= */}
              {/* SUB-TAB 2: CHEQUES REGISTER & 1-CLICK CLEAR CHEQUE        */}
              {/* ========================================================= */}
              {profileActiveTab === 'cheques' && (
                <div>
                  <div className="px-4 py-2.5 border-b border-hairline flex flex-wrap items-center justify-between gap-3 bg-surface-soft/20 text-xs">
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => setChequeFilter('all')}
                        className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                          chequeFilter === 'all'
                            ? 'bg-primary/10 text-primary border border-primary/20 font-semibold'
                            : 'text-muted hover:text-ink hover:bg-surface-soft'
                        }`}
                      >
                        All ({profileData?.cheques?.length || 0})
                      </button>
                      <button
                        onClick={() => setChequeFilter('pdc_pending')}
                        className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                          chequeFilter === 'pdc_pending'
                            ? 'bg-amber-500/10 text-amber-700 border border-amber-500/20 font-semibold'
                            : 'text-muted hover:text-ink hover:bg-surface-soft'
                        }`}
                      >
                        Pending PDCs ({pendingChequesCount})
                      </button>
                      <button
                        onClick={() => setChequeFilter('cleared')}
                        className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                          chequeFilter === 'cleared'
                            ? 'bg-emerald-500/10 text-emerald-700 border border-emerald-500/20 font-semibold'
                            : 'text-muted hover:text-ink hover:bg-surface-soft'
                        }`}
                      >
                        Cleared
                      </button>
                      <button
                        onClick={() => setChequeFilter('bounced')}
                        className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                          chequeFilter === 'bounced'
                            ? 'bg-red-500/10 text-red-700 border border-red-500/20 font-semibold'
                            : 'text-muted hover:text-ink hover:bg-surface-soft'
                        }`}
                      >
                        Bounced
                      </button>
                    </div>

                    <span className="text-[11px] text-muted">
                      Click Clear Cheque once deposited or debited from your bank account
                    </span>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="bg-surface-soft/60 border-b border-hairline text-muted uppercase tracking-wider text-[10px]">
                          <th className="px-5 py-3 font-semibold">Cheque Details</th>
                          <th className="px-5 py-3 font-semibold">Maturity Date</th>
                          <th className="px-5 py-3 font-semibold">Due Status</th>
                          <th className="px-5 py-3 font-semibold">Direction</th>
                          <th className="px-5 py-3 font-semibold text-right">Amount</th>
                          <th className="px-5 py-3 font-semibold text-center">Status</th>
                          <th className="px-5 py-3 font-semibold text-center">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-hairline">
                        {profileCheques.length > 0 ? (
                          profileCheques.map(chq => {
                            const daysLabel = getPdcDaysLabel(chq.cheque_date);
                            const isPending = chq.cheque_status === 'pdc_pending';

                            return (
                              <tr key={chq.id} className="hover:bg-surface-soft/40 transition-colors">
                                <td className="px-5 py-3.5">
                                  <div className="font-bold text-ink font-mono text-xs">
                                    Cheque #{chq.cheque_no || 'N/A'}
                                  </div>
                                  <div className="text-[11px] text-muted mt-0.5">
                                    {chq.bank_name || 'Bank instrument'}
                                  </div>
                                </td>

                                <td className="px-5 py-3.5 text-muted">
                                  {chq.cheque_date || chq.date.split(' ')[0]}
                                </td>

                                <td className="px-5 py-3.5">
                                  {isPending ? (
                                    <span
                                      className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                        daysLabel.isToday
                                          ? 'bg-emerald-500/15 text-emerald-700 border border-emerald-500/30'
                                          : daysLabel.isPast
                                          ? 'bg-red-500/15 text-red-700 border border-red-500/30'
                                          : 'bg-blue-500/10 text-blue-700 border border-blue-500/20'
                                      }`}
                                    >
                                      {daysLabel.text}
                                    </span>
                                  ) : (
                                    <span className="text-[10px] text-muted">-</span>
                                  )}
                                </td>

                                <td className="px-5 py-3.5">
                                  <span
                                    className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                      chq.entity_type === 'customer'
                                        ? 'bg-emerald-500/10 text-emerald-700'
                                        : 'bg-blue-500/10 text-blue-700'
                                    }`}
                                  >
                                    {chq.entity_type === 'customer' ? '↓ Deposit' : '↑ Clear'}
                                  </span>
                                </td>

                                <td className="px-5 py-3.5 text-right font-bold text-ink">
                                  ₹{chq.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                </td>

                                <td className="px-5 py-3.5 text-center">
                                  <span
                                    className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                      chq.cheque_status === 'pdc_pending'
                                        ? 'bg-amber-500/10 text-amber-700 border border-amber-500/20'
                                        : chq.cheque_status === 'bounced'
                                        ? 'bg-red-500/10 text-red-700 border border-red-500/20'
                                        : 'bg-emerald-500/10 text-emerald-700 border border-emerald-500/20'
                                    }`}
                                  >
                                    {chq.cheque_status === 'pdc_pending'
                                      ? 'PDC Pending'
                                      : chq.cheque_status === 'bounced'
                                      ? 'Bounced'
                                      : 'Cleared'}
                                  </span>
                                </td>

                                <td className="px-5 py-3.5 text-center">
                                  {isPending ? (
                                    <div className="flex items-center justify-center gap-1.5">
                                      <button
                                        onClick={() => handleClearCheque(chq.id)}
                                        className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-xs font-semibold shadow-xs transition-colors flex items-center gap-1"
                                        title="Clear this cheque and update balance"
                                      >
                                        <Check className="w-3 h-3" /> Clear
                                      </button>
                                      <button
                                        onClick={() => handleBounceCheque(chq.id)}
                                        className="px-2 py-1 bg-surface-soft hover:bg-red-50 text-red-600 rounded text-xs font-medium border border-hairline transition-colors"
                                        title="Mark as bounced"
                                      >
                                        Bounce
                                      </button>
                                    </div>
                                  ) : (
                                    <span className="text-[11px] text-muted italic">Processed</span>
                                  )}
                                </td>
                              </tr>
                            );
                          })
                        ) : (
                          <tr>
                            <td colSpan={7} className="py-12 text-center text-muted">
                              No cheques recorded for this party.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* ========================================================= */}
              {/* SUB-TAB: TRANSACTION TIMELINE & STATEMENT                 */}
              {/* ========================================================= */}
              {(profileActiveTab === 'ledger' || profileActiveTab === 'payments') && (
                <div>
                  {/* Timeline Header Controls */}
                  <div className="p-4 border-b border-hairline flex flex-col sm:flex-row sm:items-center justify-between bg-surface-soft/40 gap-3">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {/* Filter Chips */}
                      {(['all', 'bills', 'payments', 'advances', 'returns'] as const).map(tabKey => {
                        const count = 
                          tabKey === 'all' ? (profileData?.ledger.length || 0) :
                          tabKey === 'bills' ? (profileData?.ledger.filter(e => e.type === 'Sale' || e.type === 'Purchase').length || 0) :
                          tabKey === 'payments' ? (profileData?.ledger.filter(e => e.type === 'Payment' || e.type === 'Advance').length || 0) :
                          tabKey === 'advances' ? (profileData?.ledger.filter(e => e.type === 'Advance' || e.is_advance || (e.description && e.description.toLowerCase().includes('advance'))).length || 0) :
                          (profileData?.ledger.filter(e => e.type === 'Return').length || 0);

                        const label = 
                          tabKey === 'all' ? 'All Events' :
                          tabKey === 'bills' ? (activeTab === 'customers' ? 'Bills Only' : 'Purchases Only') :
                          tabKey === 'payments' ? 'Payments Only' :
                          tabKey === 'advances' ? 'Advances' : 'Returns';

                        return (
                          <button
                            key={tabKey}
                            onClick={() => setTimelineFilter(tabKey)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer ${
                              timelineFilter === tabKey
                                ? 'bg-primary text-on-primary shadow-xs'
                                : 'bg-canvas text-muted hover:text-ink border border-hairline hover:bg-surface-soft'
                            }`}
                          >
                            <span>{label}</span>
                            <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                              timelineFilter === tabKey ? 'bg-white/20 text-white' : 'bg-surface-soft text-muted'
                            }`}>
                              {count}
                            </span>
                          </button>
                        );
                      })}
                    </div>

                    <div className="flex items-center gap-2 self-end sm:self-auto">
                      {/* Chronology Order Toggle */}
                      <div className="inline-flex items-center bg-canvas border border-hairline rounded-lg p-0.5 text-xs shadow-2xs">
                        <button
                          onClick={() => setLedgerSortOrder('desc')}
                          className={`px-2.5 py-1 rounded-md transition-all text-xs font-medium flex items-center gap-1 cursor-pointer ${
                            ledgerSortOrder === 'desc'
                              ? 'bg-surface-soft text-ink font-semibold shadow-xs border border-hairline'
                              : 'text-muted hover:text-ink'
                          }`}
                          title="Newest transactions at top"
                        >
                          ↓ Newest First
                        </button>
                        <button
                          onClick={() => setLedgerSortOrder('asc')}
                          className={`px-2.5 py-1 rounded-md transition-all text-xs font-medium flex items-center gap-1 cursor-pointer ${
                            ledgerSortOrder === 'asc'
                              ? 'bg-surface-soft text-ink font-semibold shadow-xs border border-hairline'
                              : 'text-muted hover:text-ink'
                          }`}
                          title="Chronological timeline from first transaction"
                        >
                          ↑ Oldest First
                        </button>
                      </div>

                      {/* PDF Print Button */}
                      <button
                        onClick={handlePrintLedgerPDF}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-canvas hover:bg-surface-soft text-ink border border-hairline rounded-lg text-xs font-semibold shadow-2xs transition-colors cursor-pointer"
                        title="Download or Print PDF Statement"
                      >
                        <Printer className="w-3.5 h-3.5 text-muted" /> Statement PDF
                      </button>
                    </div>
                  </div>

                  {/* Timeline Table */}
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="bg-surface-soft/60 border-b border-hairline text-muted uppercase tracking-wider text-[10px]">
                          <th className="px-5 py-3 font-semibold">Date & Time</th>
                          <th className="px-4 py-3 font-semibold">Type</th>
                          <th className="px-5 py-3 font-semibold">Particulars & Reference</th>
                          <th className="px-4 py-3 font-semibold">Instrument / Mode</th>
                          <th className="px-5 py-3 font-semibold text-right">Debit (Dr)</th>
                          <th className="px-5 py-3 font-semibold text-right">Credit (Cr)</th>
                          <th className="px-5 py-3 font-semibold text-right">Running Balance</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-hairline">
                        {displayedLedger && displayedLedger.length > 0 ? (
                          displayedLedger.map(entry => {
                            const dt = formatDateTime(entry.date);
                            const isAdvance = entry.type === 'Advance' || entry.is_advance;
                            const isReturn = entry.type === 'Return';
                            const isSaleOrPurchase = entry.type === 'Sale' || entry.type === 'Purchase';
                            const isPayment = entry.type === 'Payment' && !isAdvance;

                            return (
                              <tr key={entry.id} className="hover:bg-surface-soft/40 transition-colors">
                                {/* Date & Time */}
                                <td className="px-5 py-3.5 text-muted whitespace-nowrap">
                                  <div className="font-semibold text-ink">{dt.date}</div>
                                  {dt.time && <div className="text-[10px] text-muted">{dt.time}</div>}
                                </td>

                                {/* Type Pill */}
                                <td className="px-4 py-3.5 whitespace-nowrap">
                                  {isSaleOrPurchase && (
                                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-semibold bg-blue-500/10 text-blue-700 dark:text-blue-300 border border-blue-500/20">
                                      <Receipt className="w-3 h-3" />
                                      {entry.type}
                                    </span>
                                  )}
                                  {isPayment && (
                                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-semibold bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20">
                                      <IndianRupee className="w-3 h-3" />
                                      Payment
                                    </span>
                                  )}
                                  {isAdvance && (
                                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-semibold bg-cyan-500/10 text-cyan-700 dark:text-cyan-300 border border-cyan-500/20">
                                      <Shield className="w-3 h-3" />
                                      Advance
                                    </span>
                                  )}
                                  {isReturn && (
                                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-semibold bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/20">
                                      <RotateCcw className="w-3 h-3" />
                                      Return
                                    </span>
                                  )}
                                </td>

                                {/* Particulars & Details */}
                                <td className="px-5 py-3.5 text-ink max-w-sm">
                                  <div className="font-medium text-ink leading-snug">{entry.description}</div>
                                  {entry.notes && entry.notes !== entry.description && (
                                    <div className="text-[11px] text-muted mt-0.5">{entry.notes}</div>
                                  )}
                                </td>

                                {/* Instrument / Mode */}
                                <td className="px-4 py-3.5 text-ink whitespace-nowrap">
                                  {entry.payment_mode === 'Cheque' ? (
                                    <div className="space-y-0.5">
                                      <span className="px-2 py-0.5 bg-surface-soft border border-hairline rounded text-[11px] font-semibold text-ink inline-block">
                                        Cheque #{entry.cheque_no || 'N/A'}
                                      </span>
                                      {entry.bank_name && (
                                        <div className="text-[10px] text-muted">{entry.bank_name}</div>
                                      )}
                                      {entry.cheque_status === 'pdc_pending' && (
                                        <span className="inline-block px-1.5 py-0.2 text-[9px] font-bold rounded bg-amber-500/10 text-amber-700 border border-amber-500/20">
                                          PDC Pending
                                        </span>
                                      )}
                                    </div>
                                  ) : entry.payment_mode ? (
                                    <span className="px-2 py-0.5 bg-surface-soft border border-hairline rounded text-[11px] font-semibold text-ink">
                                      {entry.payment_mode}
                                    </span>
                                  ) : entry.reference_no ? (
                                    <span className="text-[11px] text-muted">
                                      Ref: {entry.reference_no}
                                    </span>
                                  ) : (
                                    <span className="text-muted text-xs">-</span>
                                  )}
                                </td>

                                {/* Debit (Dr) */}
                                <td className="px-5 py-3.5 text-right font-semibold text-red-600 tabular-nums whitespace-nowrap">
                                  {entry.debit > 0 ? `₹${entry.debit.toFixed(2)}` : '-'}
                                </td>

                                {/* Credit (Cr) */}
                                <td className="px-5 py-3.5 text-right font-semibold text-emerald-600 tabular-nums whitespace-nowrap">
                                  {entry.credit > 0 ? `₹${entry.credit.toFixed(2)}` : '-'}
                                </td>

                                {/* Running Balance */}
                                <td className="px-5 py-3.5 text-right font-bold text-ink tabular-nums whitespace-nowrap">
                                  {Math.abs(entry.balance) < 0.005 ? (
                                    <span className="text-muted font-normal">₹0.00</span>
                                  ) : (
                                    <span>
                                      ₹{Math.abs(entry.balance).toFixed(2)}{' '}
                                      <span className={
                                        entry.balance > 0
                                          ? 'text-red-600 font-semibold' 
                                          : 'text-emerald-600 font-semibold'
                                      }>
                                        {activeTab === 'customers' 
                                          ? (entry.balance > 0 ? '(Dr)' : '(Cr)') 
                                          : (entry.balance > 0 ? '(Cr)' : '(Dr)')}
                                      </span>
                                    </span>
                                  )}
                                </td>
                              </tr>
                            );
                          })
                        ) : (
                          <tr>
                            <td colSpan={7} className="py-16 text-center text-muted">
                              <History className="w-8 h-8 mx-auto mb-2 opacity-30 stroke-1" />
                              <p className="font-semibold text-ink text-sm">No transaction events found</p>
                              <p className="text-xs text-muted mt-0.5">Try clearing your filter above</p>
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* ========================================================= */}
              {/* SUB-TAB 5: RETURNS                                        */}
              {/* ========================================================= */}
              {profileActiveTab === 'returns' && (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-surface-soft/60 border-b border-hairline text-muted uppercase tracking-wider text-[10px]">
                        <th className="px-5 py-3 font-semibold">Date</th>
                        <th className="px-5 py-3 font-semibold">Invoice Ref</th>
                        <th className="px-5 py-3 font-semibold">Reason</th>
                        <th className="px-5 py-3 font-semibold text-right">Return Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-hairline">
                      {profileData?.returns && profileData.returns.length > 0 ? (
                        profileData.returns.map(ret => (
                          <tr key={ret.id} className="hover:bg-surface-soft/40 transition-colors">
                            <td className="px-5 py-3.5 text-muted">
                              <div className="font-medium text-ink">{formatDateTime(ret.date).date}</div>
                              {formatDateTime(ret.date).time && (
                                <div className="text-[10px] text-muted font-mono">{formatDateTime(ret.date).time}</div>
                              )}
                            </td>
                            <td className="px-5 py-3.5 font-mono text-ink">{ret.invoice_number || '-'}</td>
                            <td className="px-5 py-3.5 text-muted">{ret.reason || 'Sales return'}</td>
                            <td className="px-5 py-3.5 text-right font-bold text-ink">
                              ₹{ret.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={4} className="py-12 text-center text-muted">
                            No return records found.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        ) : (
          /* ========================================================= */
          /* VIEW 2: PARTIES MASTER LIST VIEW                          */
          /* ========================================================= */
          <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 pb-2 border-b border-hairline">
              <div>
                <h1 className="text-2xl md:text-3xl font-display font-semibold text-ink tracking-tight">
                  Parties Management
                </h1>
                <p className="text-xs md:text-sm text-muted mt-1">
                  Manage customers and suppliers, view individual party profiles, bills, and ledgers
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    closeModal();
                    setIsModalOpen(true);
                  }}
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-primary hover:bg-primary-active text-on-primary font-medium text-sm rounded-lg shadow-sm transition-all shadow-primary/20 hover:scale-[1.01]"
                >
                  <Plus className="w-4 h-4" />
                  Add {activeTab === 'customers' ? 'Customer' : 'Supplier'}
                </button>
              </div>
            </div>

            {/* Top KPI Summary Strip */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-canvas rounded-xl border border-hairline shadow-sm p-4 flex flex-col justify-between">
                <div className="flex items-center justify-between text-muted text-xs mb-1">
                  <span className="font-semibold uppercase tracking-wider text-[10px]">
                    Total {activeTab === 'customers' ? 'Customers' : 'Suppliers'}
                  </span>
                  {activeTab === 'customers' ? (
                    <Users className="w-4 h-4 text-blue-500" />
                  ) : (
                    <Truck className="w-4 h-4 text-purple-500" />
                  )}
                </div>
                <div className="text-2xl font-bold font-display text-ink mt-0.5">{partyList.length}</div>
                <span className="text-[11px] text-muted mt-0.5">Active directory records</span>
              </div>

              <div className="bg-canvas rounded-xl border border-hairline shadow-sm p-4 flex flex-col justify-between">
                <div className="flex items-center justify-between text-muted text-xs mb-1">
                  <span className="font-semibold uppercase tracking-wider text-[10px]">
                    {activeTab === 'customers' ? 'Total Receivables' : 'Total Payables'}
                  </span>
                  <IndianRupee className="w-4 h-4 text-amber-500" />
                </div>
                <div className="text-2xl font-bold font-display text-ink mt-0.5">
                  ₹{totalOutstanding.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </div>
                <span className="text-[11px] text-muted mt-0.5">
                  {activeTab === 'customers' ? 'Pending to collect' : 'Pending to pay'}
                </span>
              </div>

              <div
                onClick={() => setFilterBalance(filterBalance === 'due' ? 'all' : 'due')}
                className={`bg-canvas rounded-xl border shadow-sm p-4 flex flex-col justify-between cursor-pointer transition-all hover:border-primary/40 ${
                  filterBalance === 'due' ? 'border-primary ring-2 ring-primary/10' : 'border-hairline'
                }`}
              >
                <div className="flex items-center justify-between text-muted text-xs mb-1">
                  <span className="font-semibold uppercase tracking-wider text-[10px]">Parties with Dues</span>
                  <AlertCircle className="w-4 h-4 text-red-500" />
                </div>
                <div className="text-2xl font-bold font-display text-red-600 mt-0.5">{partiesWithDuesCount}</div>
                <span className="text-[11px] text-muted mt-0.5">Click to filter</span>
              </div>

              <div
                onClick={() => setFilterBalance(filterBalance === 'settled' ? 'all' : 'settled')}
                className={`bg-canvas rounded-xl border shadow-sm p-4 flex flex-col justify-between cursor-pointer transition-all hover:border-primary/40 ${
                  filterBalance === 'settled' ? 'border-primary ring-2 ring-primary/10' : 'border-hairline'
                }`}
              >
                <div className="flex items-center justify-between text-muted text-xs mb-1">
                  <span className="font-semibold uppercase tracking-wider text-[10px]">Settled Accounts</span>
                  <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                </div>
                <div className="text-2xl font-bold font-display text-emerald-600 mt-0.5">{settledPartiesCount}</div>
                <span className="text-[11px] text-muted mt-0.5">Zero balance / Advance</span>
              </div>
            </div>

            {/* Filter Toolbar & Table Container */}
            <div className="bg-canvas rounded-xl border border-hairline shadow-sm overflow-hidden flex flex-col">
              {/* Toolbar */}
              <div className="p-4 border-b border-hairline flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-surface-soft/20">
                {/* Tabs */}
                <div className="flex items-center gap-1.5 p-1 rounded-lg bg-surface-soft border border-hairline self-start">
                  <button
                    onClick={() => {
                      setActiveTab('customers');
                      setFilterBalance('all');
                    }}
                    className={`px-3.5 py-1.5 rounded-md text-xs font-semibold transition-all flex items-center gap-2 ${
                      activeTab === 'customers'
                        ? 'bg-canvas text-ink shadow-xs border border-hairline'
                        : 'text-muted hover:text-ink'
                    }`}
                  >
                    <Users className="w-3.5 h-3.5" />
                    Customers ({customers.length})
                  </button>
                  <button
                    onClick={() => {
                      setActiveTab('suppliers');
                      setFilterBalance('all');
                    }}
                    className={`px-3.5 py-1.5 rounded-md text-xs font-semibold transition-all flex items-center gap-2 ${
                      activeTab === 'suppliers'
                        ? 'bg-canvas text-ink shadow-xs border border-hairline'
                        : 'text-muted hover:text-ink'
                    }`}
                  >
                    <Truck className="w-3.5 h-3.5" />
                    Suppliers ({suppliers.length})
                  </button>
                </div>

                {/* Filters & Search */}
                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setFilterBalance('all')}
                      className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                        filterBalance === 'all'
                          ? 'bg-primary/10 text-primary border border-primary/20 font-semibold'
                          : 'text-muted hover:text-ink hover:bg-surface-soft'
                      }`}
                    >
                      All
                    </button>
                    <button
                      onClick={() => setFilterBalance('due')}
                      className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                        filterBalance === 'due'
                          ? 'bg-red-500/10 text-red-700 border border-red-500/20 font-semibold'
                          : 'text-muted hover:text-ink hover:bg-surface-soft'
                      }`}
                    >
                      With Dues ({partiesWithDuesCount})
                    </button>
                    <button
                      onClick={() => setFilterBalance('settled')}
                      className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                        filterBalance === 'settled'
                          ? 'bg-emerald-500/10 text-emerald-700 border border-emerald-500/20 font-semibold'
                          : 'text-muted hover:text-ink hover:bg-surface-soft'
                      }`}
                    >
                      Settled ({settledPartiesCount})
                    </button>
                  </div>

                  <div className="relative w-64 md:w-72">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted w-3.5 h-3.5" />
                    <input
                      type="text"
                      placeholder={`Search ${activeTab} by name, phone, GST...`}
                      className="w-full pl-9 pr-8 py-1.5 bg-canvas border border-hairline rounded-lg text-xs focus:outline-none focus:border-primary transition-colors text-ink placeholder-muted"
                      value={search}
                      onChange={e => setSearch(e.target.value)}
                    />
                    {search && (
                      <button
                        onClick={() => setSearch('')}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted hover:text-ink"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Table */}
              <div className="overflow-x-auto flex-1">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-surface-soft/60 border-b border-hairline text-muted uppercase tracking-wider text-[10px]">
                      <th className="px-5 py-3 font-semibold">Party Name</th>
                      <th className="px-5 py-3 font-semibold">Contact Info</th>
                      <th className="px-5 py-3 font-semibold">GSTIN</th>
                      <th className="px-5 py-3 font-semibold text-right">Outstanding Balance</th>
                      <th className="px-5 py-3 font-semibold text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-hairline">
                    {loading ? (
                      <tr>
                        <td colSpan={5} className="py-16 text-center text-muted">
                          Loading parties...
                        </td>
                      </tr>
                    ) : filteredParties.length > 0 ? (
                      filteredParties.map(party => (
                        <tr
                          key={party.id}
                          onClick={() => handleSelectParty(party)}
                          className="hover:bg-surface-soft/50 transition-colors cursor-pointer group"
                        >
                          {/* Party Name & Initial */}
                          <td className="px-5 py-3.5">
                            <div className="flex items-center gap-3">
                              <div className="w-9 h-9 rounded-xl bg-primary/10 text-primary font-bold text-xs flex items-center justify-center shrink-0 border border-primary/20 group-hover:scale-105 transition-transform">
                                {getInitials(party.name)}
                              </div>
                              <div className="min-w-0">
                                <span className="font-semibold text-ink group-hover:text-primary transition-colors text-sm truncate block">
                                  {party.name}
                                </span>
                                <span className="text-[11px] text-muted truncate block">
                                  {party.address || 'No address registered'}
                                </span>
                              </div>
                            </div>
                          </td>

                          {/* Contact Info */}
                          <td className="px-5 py-3.5">
                            {party.phone && <div className="font-medium text-ink">{party.phone}</div>}
                            {party.email && <div className="text-[11px] text-muted mt-0.5">{party.email}</div>}
                            {!party.phone && !party.email && <span className="text-muted italic">-</span>}
                          </td>

                          {/* GSTIN */}
                          <td className="px-5 py-3.5">
                            {party.gstin ? (
                              <span className="font-mono text-xs font-medium text-ink bg-surface-soft px-1.5 py-0.5 rounded border border-hairline uppercase">
                                {party.gstin.toUpperCase()}
                              </span>
                            ) : (
                              <span className="text-[11px] text-muted">Unregistered</span>
                            )}
                          </td>

                          {/* Balance */}
                          <td className="px-5 py-3.5 text-right">
                            {party.balance > 0 ? (
                              <div>
                                <span className="font-bold font-display text-sm text-red-600">
                                  ₹{party.balance.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                </span>
                                <span className="text-[10px] text-red-500 font-semibold block">
                                  {activeTab === 'customers' ? 'Due' : 'Payable'}
                                </span>
                              </div>
                            ) : (
                              <div>
                                <span className="font-bold font-display text-sm text-emerald-600">
                                  ₹0.00
                                </span>
                                <span className="text-[10px] text-muted block">Settled</span>
                              </div>
                            )}
                            {(party.advance_balance || 0) > 0 && (
                              <div className="mt-1">
                                <span className="inline-block text-[10px] px-1.5 py-0.5 rounded font-bold bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300">
                                  Adv: ₹{(party.advance_balance || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                </span>
                              </div>
                            )}
                          </td>

                          {/* Actions */}
                          <td className="px-5 py-3.5 text-right" onClick={e => e.stopPropagation()}>
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                onClick={() => handleSelectParty(party)}
                                className="px-2.5 py-1 bg-primary/10 hover:bg-primary/20 text-primary rounded-lg text-xs font-semibold transition-colors flex items-center gap-1"
                              >
                                View Profile <ArrowRight className="w-3 h-3" />
                              </button>

                              <button
                                onClick={() => openPaymentModal(party)}
                                className="px-2.5 py-1 bg-surface-soft hover:bg-surface-soft/80 text-ink rounded-lg text-xs font-medium border border-hairline transition-colors"
                                title={activeTab === 'customers' ? 'Collect Payment' : 'Pay Supplier'}
                              >
                                {activeTab === 'customers' ? '+ Collect' : '+ Pay'}
                              </button>

                              <button
                                onClick={() => openEditModal(party)}
                                className="p-1 text-muted hover:text-ink hover:bg-surface-soft rounded-md transition-colors"
                                title="Edit Party"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={5} className="py-16 text-center text-muted">
                          <div className="flex flex-col items-center justify-center">
                            <div className="w-12 h-12 bg-surface-soft border border-hairline rounded-full flex items-center justify-center mb-3 text-muted">
                              {activeTab === 'customers' ? <Users className="w-6 h-6" /> : <Truck className="w-6 h-6" />}
                            </div>
                            <p className="font-semibold text-ink text-sm">No {activeTab} found</p>
                            <p className="text-xs text-muted mt-0.5">
                              {search ? 'Try clearing your search query' : 'Click the button above to add a new contact'}
                            </p>
                          </div>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Table Footer */}
              <div className="p-3 border-t border-hairline bg-surface-soft/20 flex items-center justify-between text-xs text-muted">
                <span>
                  Showing {filteredParties.length} of {partyList.length} {activeTab}
                </span>
                <span>Click any row to open the complete profile</span>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================= */}
        {/* MODAL 1: ADD / EDIT PARTY MODAL                           */}
        {/* ========================================================= */}
        {isModalOpen && (
          <div className="fixed inset-0 bg-ink/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-canvas rounded-xl shadow-2xl w-full max-w-lg overflow-hidden border border-hairline animate-in fade-in zoom-in duration-200">
              <div className="px-6 py-4 border-b border-hairline flex justify-between items-center bg-surface-soft">
                <h2 className="text-base font-bold text-ink flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-muted" />
                  {editingId ? 'Edit' : 'Add New'} {activeTab === 'customers' ? 'Customer' : 'Supplier'}
                </h2>
                <button onClick={closeModal} className="text-muted hover:text-ink transition-colors p-1 rounded-md">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleSaveParty} onKeyDown={handleFormKeyDown} className="p-6 space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-muted uppercase tracking-wider mb-1.5">
                    Party / Business Name *
                  </label>
                  <input
                    required
                    type="text"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    className="w-full px-3 py-2 bg-canvas border border-hairline rounded-lg text-xs focus:outline-none focus:border-primary transition-colors text-ink placeholder-muted"
                    placeholder="e.g. Acme Corporation or Rajesh Kumar"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-muted uppercase tracking-wider mb-1.5">Phone Number</label>
                    <input
                      type="text"
                      value={phone}
                      onChange={e => setPhone(e.target.value)}
                      className="w-full px-3 py-2 bg-canvas border border-hairline rounded-lg text-xs focus:outline-none focus:border-primary transition-colors text-ink placeholder-muted"
                      placeholder="+91 9876543210"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-muted uppercase tracking-wider mb-1.5">Email Address</label>
                    <input
                      type="email"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      className="w-full px-3 py-2 bg-canvas border border-hairline rounded-lg text-xs focus:outline-none focus:border-primary transition-colors text-ink placeholder-muted"
                      placeholder="accounts@example.com"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-muted uppercase tracking-wider mb-1.5">GSTIN Number</label>
                  <input
                    type="text"
                    value={gstin}
                    onChange={e => setGstin(e.target.value.toUpperCase())}
                    className="w-full px-3 py-2 bg-canvas border border-hairline rounded-lg text-xs uppercase font-mono focus:outline-none focus:border-primary transition-colors text-ink placeholder-muted"
                    placeholder="27ABCDE1234F1Z5"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-muted uppercase tracking-wider mb-1.5">Full Address</label>
                  <textarea
                    rows={3}
                    value={address}
                    onChange={e => setAddress(e.target.value)}
                    className="w-full px-3 py-2 bg-canvas border border-hairline rounded-lg text-xs focus:outline-none focus:border-primary transition-colors text-ink placeholder-muted resize-none"
                    placeholder="Plot 12, Industrial Area, City, State, PIN"
                  />
                </div>

                <div className="pt-3 border-t border-hairline flex justify-end gap-2.5">
                  <button
                    type="button"
                    onClick={closeModal}
                    className="px-4 py-2 text-xs font-medium text-ink hover:bg-surface-soft rounded-lg transition-colors border border-hairline"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 text-xs font-semibold bg-primary hover:bg-primary-active text-on-primary rounded-lg shadow-sm transition-colors"
                  >
                    {editingId ? 'Update' : 'Save'} {activeTab === 'customers' ? 'Customer' : 'Supplier'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ========================================================= */}
        {/* MODAL 2: QUICK PAYMENT MODAL (COLLECT / PAY)              */}
        {/* ========================================================= */}
        {isPaymentModalOpen && paymentParty && (() => {
          const availableAdvance = (paymentParty.advance_balance || 0) > 0 
            ? (paymentParty.advance_balance || 0) 
            : (paymentParty.balance < 0 ? Math.abs(paymentParty.balance) : 0);
          const totalBillsDue = partyDueBills.reduce((sum, b) => sum + (b.due_amount || 0), 0);

          return (
            <div className="fixed inset-0 bg-ink/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
              <div className="bg-canvas rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden border border-hairline animate-in fade-in zoom-in-95 duration-150">
                {/* Header */}
                <div className="px-6 py-4 border-b border-hairline flex justify-between items-center bg-surface-soft/60">
                  <div>
                    <h2 className="text-base font-bold text-ink flex items-center gap-2">
                      <IndianRupee className="w-4 h-4 text-primary" />
                      {activeTab === 'customers' ? 'Collect from Customer' : 'Pay to Supplier'}
                    </h2>
                    <p className="text-xs text-muted mt-0.5">{paymentParty.name}</p>
                  </div>
                  <button
                    onClick={() => {
                      setIsPaymentModalOpen(false);
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
                      if (totalBillsDue > 0) setPaymentAmount(Number(totalBillsDue.toFixed(2)));
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
                      setPaymentAmount('');
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

                <form onSubmit={handleRecordPaymentSubmit} className="p-6 space-y-4 max-h-[78vh] overflow-y-auto">
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
                              disabled={isProcessingPayment}
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
                                  setPaymentAmount(Number(totalBillsDue.toFixed(2)));
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
                              value={paymentAmount}
                              onChange={e => setPaymentAmount(e.target.value === '' ? '' : parseFloat(e.target.value))}
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

                      {/* Cheque Details */}
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
                          {isPdcDate(chequeDate) ? (
                            <div className="p-2.5 bg-amber-500/10 border border-amber-500/30 rounded-lg flex items-start gap-2 text-xs text-amber-700 dark:text-amber-300">
                              <Calendar className="w-4 h-4 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
                              <div>
                                <span className="font-semibold block">Post-Dated Cheque (PDC)</span>
                                Cheque date is in the future ({chequeDate}). Dues will remain pending until cleared in the Cheque Tracker.
                              </div>
                            </div>
                          ) : (
                            <div className="p-2.5 bg-emerald-500/10 border border-emerald-500/30 rounded-lg flex items-start gap-2 text-xs text-emerald-700 dark:text-emerald-300">
                              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-600 dark:text-emerald-400" />
                              <div>
                                <span className="font-semibold block">Present Date Cheque</span>
                                Cheque is marked as Cleared immediately and dues are reduced right now.
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
                              value={paymentAmount}
                              onChange={e => setPaymentAmount(e.target.value === '' ? '' : parseFloat(e.target.value))}
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
                                onClick={() => setPaymentAmount(val)}
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

                      {/* Cheque Details */}
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
                        setIsPaymentModalOpen(false);
                        setTargetedBill(null);
                      }}
                      className="px-4 py-2 text-xs font-medium text-ink hover:bg-surface-soft rounded-xl transition-colors border border-hairline"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isProcessingPayment}
                      className="px-5 py-2 text-xs font-semibold bg-primary hover:bg-primary-active text-on-primary rounded-xl shadow-sm transition-colors disabled:opacity-50"
                    >
                      {isProcessingPayment
                        ? 'Saving...'
                        : paymentModalTab === 'advance'
                        ? `Record Advance (₹${typeof paymentAmount === 'number' ? paymentAmount.toFixed(2) : '0.00'})`
                        : `Record & Clear Dues (₹${typeof paymentAmount === 'number' ? paymentAmount.toFixed(2) : '0.00'})`}
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
