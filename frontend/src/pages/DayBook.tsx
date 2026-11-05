import { useState, useEffect } from 'react';
import { 
  Calendar, 
  IndianRupee, 
  Truck, 
  Printer, 
  Receipt as ReceiptIcon, 
  ChevronLeft, 
  ChevronRight, 
  Edit, 
  MoreVertical,
  Search,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Filter,
  X,
  SlidersHorizontal,
  RotateCcw,
  Eye,
  Trash2,
  Plus
} from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { 
  getSalesReport, 
  getPurchaseReport, 
  getSaleDetails, 
  getDayBookProfitAndExpenses, 
  getCustomers,
  getExpenseReport,
  deleteExpense
} from '../lib/db';
import type { SalesReportItem, PurchaseReportItem, Expense } from '../lib/db';
import { Receipt } from '../components/Receipt';
import type { ReceiptData } from '../components/Receipt';

type SortField = 'date' | 'invoice_number' | 'entity_name' | 'total_quantity' | 'net_amount' | 'tax_amount' | 'category' | 'amount';
type SortOrder = 'asc' | 'desc';

export default function DayBook() {
  const navigate = useNavigate();
  const location = useLocation();
  const [startDate, setStartDate] = useState((location.state as any)?.startDate || getDaysAgo(0));
  const [endDate, setEndDate] = useState((location.state as any)?.endDate || getDaysAgo(0));
  const [activeTab, setActiveTab] = useState<'sales' | 'purchases' | 'expenses'>((location.state as any)?.activeTab || 'sales');
  const [openDropdownId, setOpenDropdownId] = useState<string | null>(null);

  // Search, Filter & Sort State
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [sortField, setSortField] = useState<SortField>('date');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [expandedProducts, setExpandedProducts] = useState<Record<string, boolean>>({});

  function toggleProductExpand(id: string) {
    setExpandedProducts(prev => ({ ...prev, [id]: !prev[id] }));
  }

  useEffect(() => {
    const handleClickOutside = () => setOpenDropdownId(null);
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  const [sales, setSales] = useState<SalesReportItem[]>([]);
  const [purchases, setPurchases] = useState<PurchaseReportItem[]>([]);
  const [expenseRecords, setExpenseRecords] = useState<Expense[]>([]);
  const [printData, setPrintData] = useState<ReceiptData | null>(null);
  
  const [profit, setProfit] = useState(0);
  const [expenses, setExpenses] = useState(0);

  function getDaysAgo(days: number) {
    const d = new Date();
    d.setDate(d.getDate() - days);
    const offset = d.getTimezoneOffset() * 60000;
    const localDate = new Date(d.getTime() - offset);
    return localDate.toISOString().split('T')[0];
  }

  function adjustDays(days: number) {
    const s = new Date(startDate);
    s.setDate(s.getDate() + days);
    setStartDate(s.toISOString().split('T')[0]);
    
    const e = new Date(endDate);
    e.setDate(e.getDate() + days);
    setEndDate(e.toISOString().split('T')[0]);
  }

  useEffect(() => {
    loadData();
    const handlePrefChange = () => { loadData(); };
    window.addEventListener('preferencesUpdated', handlePrefChange);
    return () => window.removeEventListener('preferencesUpdated', handlePrefChange);
  }, [startDate, endDate]);

  async function loadData() {
    try {
      setSales(await getSalesReport(startDate, endDate));
      setPurchases(await getPurchaseReport(startDate, endDate));
      setExpenseRecords(await getExpenseReport(startDate, endDate));
      const stats = await getDayBookProfitAndExpenses(startDate, endDate);
      setProfit(stats.netProfit);
      setExpenses(stats.expenses);
    } catch (e) {
      console.error(e);
    }
  }

  const totalSales = sales.reduce((sum, s) => sum + s.net_amount, 0);
  const totalPurchases = purchases.reduce((sum, p) => sum + p.net_amount, 0);

  // Sorting & Filtering logic
  const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

  function handleHeaderSort(field: SortField) {
    if (sortField === field) {
      setSortOrder(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      if (field === 'invoice_number' || field === 'entity_name') {
        setSortOrder('asc');
      } else {
        setSortOrder('desc');
      }
    }
  }

  const hasActiveFilters = Boolean(searchQuery.trim() || statusFilter !== 'all' || sortField !== 'date' || sortOrder !== 'desc');

  function resetFilters() {
    setSearchQuery('');
    setStatusFilter('all');
    setSortField('date');
    setSortOrder('desc');
  }

  // Filtered & Sorted Sales
  const filteredSales = sales.filter((sale) => {
    if (statusFilter !== 'all') {
      if (statusFilter === 'Unpaid') {
        if (sale.status && sale.status !== 'Unpaid') return false;
      } else {
        if (sale.status !== statusFilter) return false;
      }
    }
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      const inv = (sale.invoice_number || '').toLowerCase();
      const idStr = String(sale.id);
      const cust = (sale.customer_name || 'walk-in customer').toLowerCase();
      const prods = (sale.products_bought || '').toLowerCase();
      if (!inv.includes(q) && !idStr.includes(q) && !cust.includes(q) && !prods.includes(q)) {
        return false;
      }
    }
    return true;
  });

  const sortedSales = [...filteredSales].sort((a, b) => {
    let cmp = 0;
    if (sortField === 'date') {
      const aTime = new Date(a.date).getTime() || 0;
      const bTime = new Date(b.date).getTime() || 0;
      cmp = aTime !== bTime ? aTime - bTime : a.id - b.id;
    } else if (sortField === 'invoice_number') {
      const aVal = a.invoice_number || String(a.id);
      const bVal = b.invoice_number || String(b.id);
      cmp = collator.compare(aVal, bVal);
    } else if (sortField === 'entity_name') {
      const aVal = a.customer_name || 'Walk-in Customer';
      const bVal = b.customer_name || 'Walk-in Customer';
      cmp = collator.compare(aVal, bVal);
    } else if (sortField === 'total_quantity') {
      cmp = (a.total_quantity || 0) - (b.total_quantity || 0);
    } else if (sortField === 'tax_amount') {
      cmp = (a.tax_amount || 0) - (b.tax_amount || 0);
    } else if (sortField === 'net_amount') {
      cmp = (a.net_amount || 0) - (b.net_amount || 0);
    }
    return sortOrder === 'asc' ? cmp : -cmp;
  });

  // Filtered & Sorted Purchases
  const filteredPurchases = purchases.filter((purchase) => {
    if (statusFilter !== 'all') {
      if (statusFilter === 'Unpaid') {
        if (purchase.status && purchase.status !== 'Unpaid') return false;
      } else {
        if (purchase.status !== statusFilter) return false;
      }
    }
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      const inv = (purchase.invoice_number || '').toLowerCase();
      const idStr = String(purchase.id);
      const supp = (purchase.supplier_name || '').toLowerCase();
      const prods = (purchase.products_bought || '').toLowerCase();
      if (!inv.includes(q) && !idStr.includes(q) && !supp.includes(q) && !prods.includes(q)) {
        return false;
      }
    }
    return true;
  });

  const sortedPurchases = [...filteredPurchases].sort((a, b) => {
    let cmp = 0;
    if (sortField === 'date') {
      const aTime = new Date(a.date).getTime() || 0;
      const bTime = new Date(b.date).getTime() || 0;
      cmp = aTime !== bTime ? aTime - bTime : a.id - b.id;
    } else if (sortField === 'invoice_number') {
      const aVal = a.invoice_number || String(a.id);
      const bVal = b.invoice_number || String(b.id);
      cmp = collator.compare(aVal, bVal);
    } else if (sortField === 'entity_name') {
      const aVal = a.supplier_name || '';
      const bVal = b.supplier_name || '';
      cmp = collator.compare(aVal, bVal);
    } else if (sortField === 'total_quantity') {
      cmp = (a.total_quantity || 0) - (b.total_quantity || 0);
    } else if (sortField === 'tax_amount') {
      cmp = (a.tax_amount || 0) - (b.tax_amount || 0);
    } else if (sortField === 'net_amount') {
      cmp = (a.net_amount || 0) - (b.net_amount || 0);
    }
    return sortOrder === 'asc' ? cmp : -cmp;
  });

  // Filtered & Sorted Expenses
  const filteredExpenses = expenseRecords.filter((exp) => {
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchesCategory = exp.category.toLowerCase().includes(q);
      const matchesDesc = (exp.description || '').toLowerCase().includes(q);
      const matchesAmount = exp.amount.toString().includes(q);
      if (!matchesCategory && !matchesDesc && !matchesAmount) {
        return false;
      }
    }
    return true;
  });

  const sortedExpenses = [...filteredExpenses].sort((a, b) => {
    let cmp = 0;
    if (sortField === 'date') {
      const aTime = new Date(a.date).getTime() || 0;
      const bTime = new Date(b.date).getTime() || 0;
      cmp = aTime !== bTime ? aTime - bTime : a.id - b.id;
    } else if (sortField === 'entity_name' || sortField === 'category') {
      cmp = collator.compare(a.category, b.category);
    } else if (sortField === 'net_amount' || sortField === 'amount') {
      cmp = (a.amount || 0) - (b.amount || 0);
    } else {
      const aTime = new Date(a.date).getTime() || 0;
      const bTime = new Date(b.date).getTime() || 0;
      cmp = aTime !== bTime ? aTime - bTime : a.id - b.id;
    }
    return sortOrder === 'asc' ? cmp : -cmp;
  });

  const filteredSalesTotal = filteredSales.reduce((sum, s) => sum + s.net_amount, 0);
  const filteredPurchasesTotal = filteredPurchases.reduce((sum, p) => sum + p.net_amount, 0);
  const filteredExpensesTotal = filteredExpenses.reduce((sum, e) => sum + e.amount, 0);

  const renderSortHeader = (label: string, field: SortField, align: 'left' | 'right' | 'center' = 'left') => {
    const isActive = sortField === field;
    return (
      <th
        onClick={() => handleHeaderSort(field)}
        className={`px-4 py-2.5 text-xs font-semibold uppercase tracking-wider whitespace-nowrap cursor-pointer hover:bg-surface-soft select-none transition-colors group ${
          align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left'
        }`}
        title={`Sort by ${label} (${isActive && sortOrder === 'asc' ? 'Click for Descending' : 'Click for Ascending'})`}
      >
        <div className={`inline-flex items-center gap-1.5 ${align === 'right' ? 'justify-end' : align === 'center' ? 'justify-center' : 'justify-start'}`}>
          <span>{label}</span>
          {isActive ? (
            sortOrder === 'asc' ? (
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

  async function handlePrint(sale: SalesReportItem) {
    if (!sale.invoice_number) return;
    try {
      const details = await getSaleDetails(sale.invoice_number);
      const detail = details.find(d => d.id === sale.id);
      if (!detail) {
        alert('Could not fetch sale details for printing.');
        return;
      }
      
      let customer = null;
      if (detail.customer_snapshot) {
        try {
          customer = JSON.parse(detail.customer_snapshot);
        } catch (e) {}
      } else {
        const allCustomers = await getCustomers();
        customer = allCustomers.find(c => c.id === detail.entity_id);
      }
      
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

      const subtotal = sale.net_amount - sale.tax_amount + sale.discount;
      const originalPriceBasis = items.reduce((sum, i) => sum + (i.selling_price * i.cart_qty), 0);
      const isInclusive = Math.abs(sale.net_amount - (originalPriceBasis - sale.discount)) < 0.1;
      const taxMethod = isInclusive ? 'inclusive' : 'exclusive';

      setPrintData({
        invoiceNumber: sale.invoice_number,
        date: sale.date.split(' ')[0],
        customerName: sale.customer_name || '',
        customerDetails: customer ? {
          name: customer.name,
          address: customer.address || '',
          phone: customer.phone || '',
          email: customer.email || '',
          gstin: (customer.gstin || '').toUpperCase()
        } : undefined,
        sourceLocationName: detail.source_type === 'warehouse' ? (detail.source_warehouse_name || 'Warehouse') : undefined,
        items,
        subtotal,
        taxAmount: sale.tax_amount,
        taxMethod,
        discount: sale.discount || 0,
        netAmount: sale.net_amount,
        paidAmount: detail.paid_amount ?? (sale.status === 'Paid' ? sale.net_amount : (sale.status === 'Unpaid' ? 0 : sale.net_amount)),
        dispatchDetails: (detail as any).dispatchDetails || ((detail as any).dispatch_details ? (typeof (detail as any).dispatch_details === 'string' ? JSON.parse((detail as any).dispatch_details) : (detail as any).dispatch_details) : undefined)
      });

      setTimeout(() => {
        window.print();
      }, 100);
    } catch (e) {
      console.error(e);
      alert('Error preparing print data');
    }
  }

  return (
    <>
      <Receipt data={printData} />
      <div className="p-4 sm:p-5 h-full flex flex-col bg-canvas overflow-hidden print:hidden gap-3">
        {/* Header with Title & Date Range on ONE single row */}
        <header className="flex flex-wrap items-center justify-between gap-3 flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-display font-bold text-ink tracking-tight">Day Book</h1>
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-primary/10 text-primary font-semibold border border-primary/20">
              {sales.length + purchases.length + expenseRecords.length} total entries
            </span>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Date Navigator */}
            <div className="flex items-center gap-1.5 bg-surface-soft px-2 py-1 rounded-lg border border-hairline shadow-2xs">
              <button onClick={() => adjustDays(-1)} className="p-1 hover:bg-canvas rounded text-muted hover:text-ink transition-colors cursor-pointer" title="Previous Day">
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
              <Calendar className="w-3.5 h-3.5 text-muted ml-0.5" />
              <input 
                type="date" 
                value={startDate}
                onChange={e => setStartDate(e.target.value)}
                className="px-1.5 py-0.5 bg-canvas border border-hairline rounded text-ink text-xs focus:outline-none focus:border-primary transition-colors cursor-pointer"
              />
              <span className="text-muted text-xs font-medium">to</span>
              <input 
                type="date" 
                value={endDate}
                onChange={e => setEndDate(e.target.value)}
                className="px-1.5 py-0.5 bg-canvas border border-hairline rounded text-ink text-xs focus:outline-none focus:border-primary transition-colors cursor-pointer"
              />
              <button onClick={() => adjustDays(1)} className="p-1 hover:bg-canvas rounded text-muted hover:text-ink transition-colors cursor-pointer" title="Next Day">
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Quick Preset Buttons */}
            <div className="flex items-center bg-surface-soft p-0.5 rounded-lg border border-hairline text-xs shadow-2xs">
              <button onClick={() => { setStartDate(getDaysAgo(1)); setEndDate(getDaysAgo(1)); }} className="px-2.5 py-1 text-muted hover:text-ink hover:bg-canvas rounded transition-colors whitespace-nowrap cursor-pointer">Yesterday</button>
              <button onClick={() => { setStartDate(getDaysAgo(0)); setEndDate(getDaysAgo(0)); }} className="px-2.5 py-1 text-muted hover:text-ink hover:bg-canvas rounded transition-colors whitespace-nowrap cursor-pointer">Today</button>
              <button onClick={() => { 
                const d = new Date();
                const day = d.getDay();
                const diff = d.getDate() - day + (day === 0 ? -6 : 1);
                const monday = new Date(d.setDate(diff));
                setStartDate(monday.toISOString().split('T')[0]);
                setEndDate(new Date().toISOString().split('T')[0]);
              }} className="px-2.5 py-1 text-muted hover:text-ink hover:bg-canvas rounded transition-colors whitespace-nowrap cursor-pointer">This Week</button>
              <button onClick={() => {
                const d = new Date();
                const firstDay = new Date(d.getFullYear(), d.getMonth(), 1);
                setStartDate(firstDay.toISOString().split('T')[0]);
                setEndDate(new Date().toISOString().split('T')[0]);
              }} className="px-2.5 py-1 text-muted hover:text-ink hover:bg-canvas rounded transition-colors whitespace-nowrap cursor-pointer">This Month</button>
            </div>
          </div>
        </header>

        {/* Sleek Horizontal Stats Strip (Takes only 44px!) */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 flex-shrink-0">
          <div 
            onClick={() => setActiveTab('sales')}
            className={`rounded-lg border px-3.5 py-1.5 flex items-center justify-between shadow-2xs cursor-pointer transition-colors ${
              activeTab === 'sales' ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'bg-canvas border-hairline hover:bg-surface-soft/60'
            }`}
            title="Click to view Sales Records"
          >
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-md bg-emerald-50 text-emerald-600 flex items-center justify-center">
                <IndianRupee className="w-3.5 h-3.5" />
              </div>
              <div>
                <p className="text-[10px] font-semibold text-muted uppercase tracking-wider">Total Sales</p>
                <p className="text-sm font-bold text-ink">₹{totalSales.toFixed(2)}</p>
              </div>
            </div>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-surface-soft text-muted border border-hairline">
              {sales.length}
            </span>
          </div>

          <div 
            onClick={() => setActiveTab('purchases')}
            className={`rounded-lg border px-3.5 py-1.5 flex items-center justify-between shadow-2xs cursor-pointer transition-colors ${
              activeTab === 'purchases' ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'bg-canvas border-hairline hover:bg-surface-soft/60'
            }`}
            title="Click to view Purchase Records"
          >
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-md bg-orange-50 text-orange-600 flex items-center justify-center">
                <Truck className="w-3.5 h-3.5" />
              </div>
              <div>
                <p className="text-[10px] font-semibold text-muted uppercase tracking-wider">Total Purchases</p>
                <p className="text-sm font-bold text-ink">₹{totalPurchases.toFixed(2)}</p>
              </div>
            </div>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-surface-soft text-muted border border-hairline">
              {purchases.length}
            </span>
          </div>

          <div 
            onClick={() => setActiveTab('expenses')}
            className={`rounded-lg border px-3.5 py-1.5 flex items-center justify-between shadow-2xs cursor-pointer transition-colors ${
              activeTab === 'expenses' ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'bg-canvas border-hairline hover:bg-surface-soft/60'
            }`}
            title="Click to view Expense Records"
          >
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-md bg-red-50 text-red-600 flex items-center justify-center">
                <ReceiptIcon className="w-3.5 h-3.5" />
              </div>
              <div>
                <p className="text-[10px] font-semibold text-muted uppercase tracking-wider">Expenses</p>
                <p className="text-sm font-bold text-ink">₹{expenses.toFixed(2)}</p>
              </div>
            </div>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-surface-soft text-muted border border-hairline">
              {expenseRecords.length}
            </span>
          </div>

          <div className="bg-canvas rounded-lg border border-hairline px-3.5 py-1.5 flex items-center justify-between shadow-2xs">
            <div className="flex items-center gap-2">
              <div className={`w-6 h-6 rounded-md flex items-center justify-center ${
                profit >= 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'
              }`}>
                <IndianRupee className="w-3.5 h-3.5" />
              </div>
              <div>
                <p className="text-[10px] font-semibold text-muted uppercase tracking-wider">Net Profit</p>
                <p className={`text-sm font-bold ${profit >= 0 ? 'text-emerald-700' : 'text-signature-coral'}`}>
                  ₹{profit.toFixed(2)}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Main Records Container - High Density Ledger Table */}
        <div className="bg-canvas rounded-xl shadow-xs border border-hairline flex flex-col overflow-hidden flex-1 min-h-0">
          {/* Unified Tabs & Filter Toolbar */}
          <div className="p-2.5 bg-surface-soft/60 border-b border-hairline flex flex-wrap items-center justify-between gap-2.5 flex-shrink-0">
            {/* Tab Pill Buttons */}
            <div className="flex items-center bg-canvas p-0.5 rounded-lg border border-hairline shadow-2xs">
              <button
                onClick={() => setActiveTab('sales')}
                className={`px-3 py-1.5 font-semibold text-xs rounded-md transition-all flex items-center gap-1.5 cursor-pointer ${
                  activeTab === 'sales'
                    ? 'bg-primary text-white shadow-xs'
                    : 'text-muted hover:text-ink hover:bg-surface-soft'
                }`}
              >
                <span>Sales Records</span>
                <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                  activeTab === 'sales' ? 'bg-white/25 text-white' : 'bg-surface-soft text-muted'
                }`}>
                  {sales.length}
                </span>
              </button>
              <button
                onClick={() => setActiveTab('purchases')}
                className={`px-3 py-1.5 font-semibold text-xs rounded-md transition-all flex items-center gap-1.5 cursor-pointer ${
                  activeTab === 'purchases'
                    ? 'bg-primary text-white shadow-xs'
                    : 'text-muted hover:text-ink hover:bg-surface-soft'
                }`}
              >
                <span>Purchase Records</span>
                <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                  activeTab === 'purchases' ? 'bg-white/25 text-white' : 'bg-surface-soft text-muted'
                }`}>
                  {purchases.length}
                </span>
              </button>
              <button
                onClick={() => setActiveTab('expenses')}
                className={`px-3 py-1.5 font-semibold text-xs rounded-md transition-all flex items-center gap-1.5 cursor-pointer ${
                  activeTab === 'expenses'
                    ? 'bg-primary text-white shadow-xs'
                    : 'text-muted hover:text-ink hover:bg-surface-soft'
                }`}
              >
                <span>Expense Records</span>
                <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                  activeTab === 'expenses' ? 'bg-white/25 text-white' : 'bg-surface-soft text-muted'
                }`}>
                  {expenseRecords.length}
                </span>
              </button>
            </div>

            {/* Search, Filter & Sort Controls */}
            <div className="flex flex-wrap items-center gap-2 flex-1 justify-end">
              {/* Search */}
              <div className="relative min-w-[180px] max-w-xs flex-1">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder={
                    activeTab === 'sales' 
                      ? "Search bill, customer, item..." 
                      : activeTab === 'purchases' 
                      ? "Search invoice, supplier, item..." 
                      : "Search category, note, amount..."
                  }
                  className="w-full pl-8 pr-7 py-1 text-xs bg-canvas border border-hairline rounded-lg focus:outline-none focus:border-primary text-ink transition-colors placeholder:text-muted/60"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted hover:text-ink p-0.5 rounded-full cursor-pointer"
                    title="Clear search"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>

              {/* Status Filter (Sales and Purchases only) */}
              {activeTab !== 'expenses' && (
                <div className="flex items-center gap-1 bg-canvas px-2 py-1 rounded-lg border border-hairline text-xs">
                  <Filter className="w-3 h-3 text-muted" />
                  <select
                    value={statusFilter}
                    onChange={e => setStatusFilter(e.target.value)}
                    className="text-xs bg-transparent text-ink font-medium focus:outline-none cursor-pointer"
                  >
                    <option value="all">All Status</option>
                    <option value="Paid">Paid</option>
                    <option value="Unpaid">Unpaid</option>
                    <option value="Returned">Returned</option>
                  </select>
                </div>
              )}

              {/* Sort Dropdown */}
              <div className="flex items-center gap-1 bg-canvas px-2 py-1 rounded-lg border border-hairline text-xs">
                <SlidersHorizontal className="w-3 h-3 text-muted" />
                <select
                  value={sortField}
                  onChange={e => setSortField(e.target.value as SortField)}
                  className="text-xs bg-transparent text-ink font-medium focus:outline-none cursor-pointer"
                >
                  <option value="date">Date</option>
                  {activeTab !== 'expenses' ? (
                    <>
                      <option value="invoice_number">{activeTab === 'sales' ? 'Bill No' : 'Invoice #'}</option>
                      <option value="entity_name">{activeTab === 'sales' ? 'Customer' : 'Supplier'}</option>
                      <option value="net_amount">Net Amount</option>
                      <option value="total_quantity">Total Qty</option>
                      <option value="tax_amount">Tax</option>
                    </>
                  ) : (
                    <>
                      <option value="entity_name">Category</option>
                      <option value="net_amount">Amount</option>
                    </>
                  )}
                </select>
                <button
                  type="button"
                  onClick={() => setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')}
                  className="p-0.5 hover:bg-surface-soft rounded text-muted hover:text-ink ml-0.5 cursor-pointer"
                  title={sortOrder === 'asc' ? "Ascending (Click for Descending)" : "Descending (Click for Ascending)"}
                >
                  {sortOrder === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />}
                </button>
              </div>

              {/* Filtered Total Badge */}
              <div className="text-xs px-2.5 py-1 bg-canvas border border-hairline rounded-lg font-medium text-ink whitespace-nowrap shadow-2xs">
                Total: <span className="font-bold text-primary">₹{(
                  activeTab === 'sales' 
                    ? filteredSalesTotal 
                    : activeTab === 'purchases' 
                    ? filteredPurchasesTotal 
                    : filteredExpensesTotal
                ).toFixed(2)}</span>
              </div>

              {activeTab === 'expenses' && (
                <button
                  type="button"
                  onClick={() => navigate('/expenses')}
                  className="px-2.5 py-1 text-xs font-semibold bg-primary text-white rounded-lg flex items-center gap-1 hover:opacity-90 shadow-2xs cursor-pointer"
                  title="Add New Expense in Expenses Manager"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>New Expense</span>
                </button>
              )}

              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={resetFilters}
                  className="p-1 text-muted hover:text-ink hover:bg-canvas rounded-lg border border-hairline transition-colors cursor-pointer"
                  title="Reset filters"
                >
                  <RotateCcw className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>

          {/* Table Container - Fills Remaining Screen */}
          <div className="overflow-x-auto overflow-y-auto flex-1">
            {activeTab === 'sales' ? (
              <table className="w-full text-left border-collapse">
                <thead className="sticky top-0 bg-surface-soft border-b border-hairline z-10">
                  <tr className="text-muted text-xs">
                    {renderSortHeader('Date', 'date')}
                    {renderSortHeader('Bill No', 'invoice_number')}
                    {renderSortHeader('Customer', 'entity_name')}
                    <th className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wider min-w-[240px]">Products Bought</th>
                    {renderSortHeader('Total Qty', 'total_quantity', 'center')}
                    <th className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-right whitespace-nowrap">Taxable (₹)</th>
                    {renderSortHeader('Tax (₹)', 'tax_amount', 'right')}
                    {renderSortHeader('Net Amount (₹)', 'net_amount', 'right')}
                    <th className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-center whitespace-nowrap">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-hairline">
                  {sortedSales.map((sale) => {
                    const productLines = sale.products_bought ? sale.products_bought.split('\n').filter(Boolean) : [];
                    const isExpanded = !!expandedProducts[`sale-${sale.id}`];
                    return (
                      <tr key={sale.id} className={`hover:bg-surface-soft/60 transition-colors align-middle text-xs ${sale.status === 'Returned' ? 'bg-red-50/20' : ''}`}>
                        <td className="px-4 py-2.5 text-muted font-medium whitespace-nowrap">{sale.date.split(' ')[0]}</td>
                        <td className="px-4 py-2.5 font-medium whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => {
                              navigate(`/pos?viewId=${sale.id}`, { state: { startDate, endDate, activeTab: 'sales' } });
                            }}
                            className="text-primary hover:underline font-mono font-bold cursor-pointer"
                            title="Click to view full bill details (Read-Only)"
                          >
                            {sale.invoice_number || sale.id}
                          </button>
                        </td>
                        <td className="px-4 py-2.5 font-medium text-ink whitespace-nowrap">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span>{sale.customer_name || 'Walk-in Customer'}</span>
                            {sale.status && sale.status !== 'Paid' && (
                              <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider ${
                                sale.status === 'Returned' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'
                              }`}>
                                {sale.status}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-2.5 text-xs">
                          {productLines.length === 0 ? (
                            <span className="text-muted">-</span>
                          ) : productLines.length === 1 ? (
                            <span className="font-medium text-ink truncate max-w-[260px] inline-block" title={productLines[0]}>
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
                                  onClick={() => toggleProductExpand(`sale-${sale.id}`)}
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
                        <td className="px-4 py-2.5 text-center font-bold text-ink whitespace-nowrap">{sale.total_quantity || 0}</td>
                        <td className="px-4 py-2.5 text-right text-muted whitespace-nowrap">{(sale.net_amount - sale.tax_amount).toFixed(2)}</td>
                        <td className="px-4 py-2.5 text-right text-muted whitespace-nowrap">{sale.tax_amount.toFixed(2)}</td>
                        <td className="px-4 py-2.5 text-right font-bold text-ink text-sm whitespace-nowrap">₹{sale.net_amount.toFixed(2)}</td>
                        <td className="px-4 py-2.5 text-center whitespace-nowrap">
                          <div className="flex items-center justify-center gap-1">
                            <button
                              type="button"
                              onClick={() => navigate(`/pos?viewId=${sale.id}`, { state: { startDate, endDate, activeTab: 'sales' } })}
                              className="p-1 hover:bg-surface-soft rounded-md text-muted hover:text-primary transition-colors cursor-pointer"
                              title="View Bill Details (Read-Only)"
                            >
                              <Eye className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handlePrint(sale)}
                              className="p-1 hover:bg-surface-soft rounded-md text-muted hover:text-primary transition-colors cursor-pointer"
                              title="Quick Print Invoice"
                            >
                              <Printer className="w-3.5 h-3.5" />
                            </button>
                            <div className="relative">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setOpenDropdownId(openDropdownId === `sale-${sale.id}` ? null : `sale-${sale.id}`);
                                }}
                                className="p-1 hover:bg-surface-soft rounded-md text-muted hover:text-ink transition-colors cursor-pointer"
                                title="More Actions"
                              >
                                <MoreVertical className="w-3.5 h-3.5" />
                              </button>
                              {openDropdownId === `sale-${sale.id}` && (
                                <div 
                                  className="absolute right-0 top-6 w-32 bg-canvas border border-hairline rounded-lg shadow-lg py-1 z-20 animate-fade-in-up"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <button 
                                    onClick={() => {
                                      setOpenDropdownId(null);
                                      navigate(`/pos?editId=${sale.id}`, { state: { startDate, endDate, activeTab: 'sales' } });
                                    }}
                                    className="w-full text-left px-3 py-1.5 text-xs text-ink hover:bg-surface-soft flex items-center gap-2 cursor-pointer"
                                  >
                                    <Edit className="w-3.5 h-3.5 text-primary" />
                                    Edit Bill
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {sortedSales.length === 0 && (
                    <tr>
                      <td colSpan={9} className="p-8 text-center text-muted text-xs">
                        {sales.length === 0 ? (
                          'No sales found for the selected date range.'
                        ) : (
                          <div className="flex flex-col items-center justify-center gap-2">
                            <p className="font-semibold text-ink">No sales match your search or filter.</p>
                            <p className="text-muted">Try clearing the search query or status filter.</p>
                            <button
                              onClick={resetFilters}
                              className="mt-1 px-3 py-1 text-xs bg-surface-soft hover:bg-canvas border border-hairline rounded-lg text-ink font-medium transition-colors cursor-pointer"
                            >
                              Clear Filters
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            ) : activeTab === 'purchases' ? (
              <table className="w-full text-left border-collapse">
                <thead className="sticky top-0 bg-surface-soft border-b border-hairline z-10">
                  <tr className="text-muted text-xs">
                    {renderSortHeader('Date', 'date')}
                    {renderSortHeader('Supplier', 'entity_name')}
                    {renderSortHeader('Invoice #', 'invoice_number')}
                    <th className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wider min-w-[240px]">Products Bought</th>
                    {renderSortHeader('Total Qty', 'total_quantity', 'center')}
                    <th className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-right whitespace-nowrap">Taxable (₹)</th>
                    {renderSortHeader('Tax (₹)', 'tax_amount', 'right')}
                    {renderSortHeader('Net Amount (₹)', 'net_amount', 'right')}
                    <th className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-center whitespace-nowrap">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-hairline">
                  {sortedPurchases.map((purchase) => {
                    const productLines = purchase.products_bought ? purchase.products_bought.split('\n').filter(Boolean) : [];
                    const isExpanded = !!expandedProducts[`purchase-${purchase.id}`];
                    return (
                      <tr key={purchase.id} className={`hover:bg-surface-soft/60 transition-colors align-middle text-xs ${purchase.status === 'Returned' ? 'bg-red-50/20' : ''}`}>
                        <td className="px-4 py-2.5 text-muted font-medium whitespace-nowrap">{purchase.date.split(' ')[0]}</td>
                        <td className="px-4 py-2.5 font-medium text-ink whitespace-nowrap">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span>{purchase.supplier_name}</span>
                            {purchase.status && purchase.status !== 'Paid' && (
                              <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider ${
                                purchase.status === 'Returned' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'
                              }`}>
                                {purchase.status}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-2.5 font-medium whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => {
                              navigate(`/purchases?viewId=${purchase.id}`, { state: { startDate, endDate, activeTab: 'purchases' } });
                            }}
                            className="text-primary hover:underline font-mono font-bold cursor-pointer"
                            title="Click to view full purchase details (Read-Only)"
                          >
                            {purchase.invoice_number}
                          </button>
                        </td>
                        <td className="px-4 py-2.5 text-xs">
                          {productLines.length === 0 ? (
                            <span className="text-muted">-</span>
                          ) : productLines.length === 1 ? (
                            <span className="font-medium text-ink truncate max-w-[260px] inline-block" title={productLines[0]}>
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
                                  onClick={() => toggleProductExpand(`purchase-${purchase.id}`)}
                                  className="text-[10px] font-semibold px-1.5 py-0.2 rounded bg-surface-soft hover:bg-hairline text-primary border border-hairline transition-colors cursor-pointer"
                                  title="Click to view all items in this purchase"
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
                        <td className="px-4 py-2.5 text-center font-bold text-ink whitespace-nowrap">{purchase.total_quantity || 0}</td>
                        <td className="px-4 py-2.5 text-right text-muted whitespace-nowrap">{(purchase.net_amount - purchase.tax_amount).toFixed(2)}</td>
                        <td className="px-4 py-2.5 text-right text-muted whitespace-nowrap">{purchase.tax_amount.toFixed(2)}</td>
                        <td className="px-4 py-2.5 text-right font-bold text-ink text-sm whitespace-nowrap">₹{purchase.net_amount.toFixed(2)}</td>
                        <td className="px-4 py-2.5 text-center whitespace-nowrap">
                          <div className="flex items-center justify-center gap-1">
                            <button
                              type="button"
                              onClick={() => navigate(`/purchases?viewId=${purchase.id}`, { state: { startDate, endDate, activeTab: 'purchases' } })}
                              className="p-1 hover:bg-surface-soft rounded-md text-muted hover:text-primary transition-colors cursor-pointer"
                              title="View Purchase Details (Read-Only)"
                            >
                              <Eye className="w-3.5 h-3.5" />
                            </button>
                            <div className="relative">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setOpenDropdownId(openDropdownId === `purchase-${purchase.id}` ? null : `purchase-${purchase.id}`);
                                }}
                                className="p-1 hover:bg-surface-soft rounded-md text-muted hover:text-ink transition-colors cursor-pointer"
                                title="More Actions"
                              >
                                <MoreVertical className="w-3.5 h-3.5" />
                              </button>
                              {openDropdownId === `purchase-${purchase.id}` && (
                                <div 
                                  className="absolute right-0 top-6 w-32 bg-canvas border border-hairline rounded-lg shadow-lg py-1 z-20 animate-fade-in-up"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <button 
                                    onClick={() => {
                                      setOpenDropdownId(null);
                                      navigate(`/purchases?editId=${purchase.id}`, { state: { startDate, endDate, activeTab: 'purchases' } });
                                    }}
                                    className="w-full text-left px-3 py-1.5 text-xs text-ink hover:bg-surface-soft flex items-center gap-2 cursor-pointer"
                                  >
                                    <Edit className="w-3.5 h-3.5 text-primary" />
                                    Edit Bill
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {sortedPurchases.length === 0 && (
                    <tr>
                      <td colSpan={9} className="p-8 text-center text-muted text-xs">
                        {purchases.length === 0 ? (
                          'No purchases found for the selected date range.'
                        ) : (
                          <div className="flex flex-col items-center justify-center gap-2">
                            <p className="font-semibold text-ink">No purchases match your search or filter.</p>
                            <p className="text-muted">Try clearing the search query or status filter.</p>
                            <button
                              onClick={resetFilters}
                              className="mt-1 px-3 py-1 text-xs bg-surface-soft hover:bg-canvas border border-hairline rounded-lg text-ink font-medium transition-colors cursor-pointer"
                            >
                              Clear Filters
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            ) : (
              <table className="w-full text-left border-collapse">
                <thead className="sticky top-0 bg-surface-soft border-b border-hairline z-10">
                  <tr className="text-muted text-xs">
                    {renderSortHeader('Date', 'date')}
                    {renderSortHeader('Category', 'entity_name')}
                    <th className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wider min-w-[280px]">Description / Remarks</th>
                    {renderSortHeader('Amount (₹)', 'net_amount', 'right')}
                    <th className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-center whitespace-nowrap">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-hairline">
                  {sortedExpenses.map((exp) => (
                    <tr key={exp.id} className="hover:bg-surface-soft/60 transition-colors align-middle text-xs">
                      <td className="px-4 py-2.5 text-muted font-medium whitespace-nowrap">{exp.date.split(' ')[0]}</td>
                      <td className="px-4 py-2.5 font-medium text-ink whitespace-nowrap">
                        {exp.category}
                      </td>
                      <td className="px-4 py-2.5 text-xs text-ink">
                        {exp.description ? (
                          <span className="font-medium text-body truncate max-w-[360px] inline-block" title={exp.description}>
                            {exp.description}
                          </span>
                        ) : (
                          <span className="text-muted">-</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-right font-bold text-ink text-sm whitespace-nowrap">
                        ₹{exp.amount.toFixed(2)}
                      </td>
                      <td className="px-4 py-2.5 text-center whitespace-nowrap">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            type="button"
                            onClick={() => navigate('/expenses')}
                            className="p-1 hover:bg-surface-soft rounded-md text-muted hover:text-primary transition-colors cursor-pointer"
                            title="Manage in Expenses"
                          >
                            <Edit className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={async () => {
                              if (window.confirm(`Are you sure you want to delete this ${exp.category} expense of ₹${exp.amount.toFixed(2)}?`)) {
                                await deleteExpense(exp.id);
                                loadData();
                              }
                            }}
                            className="p-1 hover:bg-red-50 rounded-md text-muted hover:text-signature-coral transition-colors cursor-pointer"
                            title="Delete Expense"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {sortedExpenses.length === 0 && (
                    <tr>
                      <td colSpan={5} className="p-8 text-center text-muted text-xs">
                        {expenseRecords.length === 0 ? (
                          'No expenses found for the selected date range.'
                        ) : (
                          <div className="flex flex-col items-center justify-center gap-2">
                            <p className="font-semibold text-ink">No expenses match your search.</p>
                            <p className="text-muted">Try clearing the search query.</p>
                            <button
                              onClick={resetFilters}
                              className="mt-1 px-3 py-1 text-xs bg-surface-soft hover:bg-canvas border border-hairline rounded-lg text-ink font-medium transition-colors cursor-pointer"
                            >
                              Clear Filters
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

