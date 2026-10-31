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
  RotateCcw
} from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { getSalesReport, getPurchaseReport, getSaleDetails, getDayBookProfitAndExpenses, getCustomers } from '../lib/db';
import type { SalesReportItem, PurchaseReportItem } from '../lib/db';
import { Receipt } from '../components/Receipt';
import type { ReceiptData } from '../components/Receipt';

type SortField = 'date' | 'invoice_number' | 'entity_name' | 'total_quantity' | 'net_amount' | 'tax_amount';
type SortOrder = 'asc' | 'desc';

export default function DayBook() {
  const navigate = useNavigate();
  const location = useLocation();
  const [startDate, setStartDate] = useState((location.state as any)?.startDate || getDaysAgo(0));
  const [endDate, setEndDate] = useState((location.state as any)?.endDate || getDaysAgo(0));
  const [activeTab, setActiveTab] = useState<'sales' | 'purchases'>((location.state as any)?.activeTab || 'sales');
  const [openDropdownId, setOpenDropdownId] = useState<string | null>(null);

  // Search, Filter & Sort State
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [sortField, setSortField] = useState<SortField>('date');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');

  useEffect(() => {
    const handleClickOutside = () => setOpenDropdownId(null);
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  const [sales, setSales] = useState<SalesReportItem[]>([]);
  const [purchases, setPurchases] = useState<PurchaseReportItem[]>([]);
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

  const filteredSalesTotal = filteredSales.reduce((sum, s) => sum + s.net_amount, 0);
  const filteredPurchasesTotal = filteredPurchases.reduce((sum, p) => sum + p.net_amount, 0);

  const renderSortHeader = (label: string, field: SortField, align: 'left' | 'right' | 'center' = 'left') => {
    const isActive = sortField === field;
    return (
      <th
        onClick={() => handleHeaderSort(field)}
        className={`px-6 py-4 whitespace-nowrap cursor-pointer hover:bg-surface-soft/80 select-none transition-colors group ${
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
        paidAmount: detail.paid_amount ?? (sale.status === 'Paid' ? sale.net_amount : (sale.status === 'Unpaid' ? 0 : sale.net_amount))
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
      <div className="p-8 h-full flex flex-col bg-canvas overflow-y-auto print:hidden">
      <header className="mb-8 flex justify-between items-start gap-4">
        <div>
          <h1 className="text-4xl font-display font-medium text-ink tracking-tight">Day Book</h1>
          <p className="text-base text-body mt-2">View sales and purchases for a specific date range.</p>
        </div>
        
        <div className="flex flex-col items-end gap-2">
          <div className="flex items-center gap-2 bg-surface-soft p-1.5 rounded-lg border border-hairline">
            <button onClick={() => adjustDays(-1)} className="p-1 hover:bg-canvas rounded-md text-muted hover:text-ink transition-colors" title="Previous Day">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <Calendar className="w-4 h-4 text-muted mx-1" />
            <input 
              type="date" 
              value={startDate}
              onChange={e => setStartDate(e.target.value)}
              className="px-2 py-1 bg-canvas border border-hairline rounded-md shadow-sm focus:outline-none focus:border-primary transition-colors text-ink text-sm"
            />
            <span className="text-muted text-sm font-medium">to</span>
            <input 
              type="date" 
              value={endDate}
              onChange={e => setEndDate(e.target.value)}
              className="px-2 py-1 bg-canvas border border-hairline rounded-md shadow-sm focus:outline-none focus:border-primary transition-colors text-ink text-sm"
            />
            <button onClick={() => adjustDays(1)} className="p-1 hover:bg-canvas rounded-md text-muted hover:text-ink transition-colors" title="Next Day">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
          
          <div className="flex items-center gap-1 bg-surface-soft p-1 rounded-lg border border-hairline max-w-full overflow-x-auto">
            <button onClick={() => { setStartDate(getDaysAgo(1)); setEndDate(getDaysAgo(1)); }} className="px-3 py-1 text-xs font-medium text-muted hover:text-ink hover:bg-canvas rounded-md transition-colors whitespace-nowrap">Yesterday</button>
            <button onClick={() => { setStartDate(getDaysAgo(0)); setEndDate(getDaysAgo(0)); }} className="px-3 py-1 text-xs font-medium text-muted hover:text-ink hover:bg-canvas rounded-md transition-colors whitespace-nowrap">Today</button>
            <button onClick={() => { 
              const d = new Date();
              const day = d.getDay();
              const diff = d.getDate() - day + (day === 0 ? -6 : 1);
              const monday = new Date(d.setDate(diff));
              setStartDate(monday.toISOString().split('T')[0]);
              setEndDate(new Date().toISOString().split('T')[0]);
            }} className="px-3 py-1 text-xs font-medium text-muted hover:text-ink hover:bg-canvas rounded-md transition-colors whitespace-nowrap">This Week</button>
            <button onClick={() => {
              const d = new Date();
              const firstDay = new Date(d.getFullYear(), d.getMonth(), 1);
              setStartDate(firstDay.toISOString().split('T')[0]);
              setEndDate(new Date().toISOString().split('T')[0]);
            }} className="px-3 py-1 text-xs font-medium text-muted hover:text-ink hover:bg-canvas rounded-md transition-colors whitespace-nowrap">This Month</button>
          </div>
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <div className="bg-canvas rounded-xl shadow-sm border border-hairline p-6 flex items-center">
          <div className="p-4 rounded-full mr-4 bg-emerald-100 text-emerald-600">
            <IndianRupee className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sm text-muted font-medium">Total Sales</p>
            <p className="text-2xl font-bold text-ink">₹{totalSales.toFixed(2)}</p>
          </div>
        </div>
        
        <div className="bg-canvas rounded-xl shadow-sm border border-hairline p-6 flex items-center">
          <div className="p-4 rounded-full mr-4 bg-orange-100 text-orange-600">
            <Truck className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sm text-muted font-medium">Total Purchases</p>
            <p className="text-2xl font-bold text-ink">₹{totalPurchases.toFixed(2)}</p>
          </div>
        </div>

        <div className="bg-canvas rounded-xl shadow-sm border border-hairline p-6 flex items-center">
          <div className="p-4 rounded-full mr-4 bg-red-100 text-red-600">
            <ReceiptIcon className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sm text-muted font-medium">Total Expenses</p>
            <p className="text-2xl font-bold text-ink">₹{expenses.toFixed(2)}</p>
          </div>
        </div>
        
        <div className="bg-canvas rounded-xl shadow-sm border border-hairline p-6 flex items-center">
          <div className={`p-4 rounded-full mr-4 ${profit >= 0 ? 'bg-emerald-100 text-emerald-600' : 'bg-red-100 text-red-600'}`}>
            <IndianRupee className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sm text-muted font-medium">Net Profit</p>
            <p className={`text-2xl font-bold ${profit >= 0 ? 'text-ink' : 'text-signature-coral'}`}>₹{profit.toFixed(2)}</p>
          </div>
        </div>
      </div>

      <div className="bg-canvas rounded-xl shadow-sm border border-hairline flex flex-col overflow-hidden flex-1">
        {/* Tabs */}
        <div className="flex border-b border-hairline bg-surface-soft px-4 pt-4 gap-2">
          <button
            onClick={() => setActiveTab('sales')}
            className={`px-4 py-2 font-medium text-sm rounded-t-lg transition-colors border-b-2 flex items-center gap-2 ${
              activeTab === 'sales'
                ? 'bg-canvas text-primary border-primary'
                : 'text-muted hover:text-ink hover:bg-canvas border-transparent'
            }`}
          >
            <span>Sales Records</span>
            <span className="px-2 py-0.5 text-xs rounded-full bg-surface-soft border border-hairline font-semibold text-muted">
              {sales.length}
            </span>
          </button>
          <button
            onClick={() => setActiveTab('purchases')}
            className={`px-4 py-2 font-medium text-sm rounded-t-lg transition-colors border-b-2 flex items-center gap-2 ${
              activeTab === 'purchases'
                ? 'bg-canvas text-primary border-primary'
                : 'text-muted hover:text-ink hover:bg-canvas border-transparent'
            }`}
          >
            <span>Purchase Records</span>
            <span className="px-2 py-0.5 text-xs rounded-full bg-surface-soft border border-hairline font-semibold text-muted">
              {purchases.length}
            </span>
          </button>
        </div>

        {/* Filter and Sort Toolbar */}
        <div className="p-4 bg-canvas border-b border-hairline flex flex-wrap items-center justify-between gap-3">
          {/* Search Bar */}
          <div className="flex items-center gap-2 flex-1 min-w-[260px] max-w-md">
            <div className="relative w-full">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder={activeTab === 'sales' ? "Filter by Bill No, Customer, or Product..." : "Filter by Invoice #, Supplier, or Product..."}
                className="w-full pl-9 pr-8 py-2 text-sm bg-surface-soft border border-hairline rounded-lg focus:outline-none focus:border-primary text-ink transition-colors placeholder:text-muted/60"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted hover:text-ink p-0.5 rounded-full hover:bg-hairline"
                  title="Clear search"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Status Filter */}
            <div className="flex items-center gap-1.5 bg-surface-soft px-2.5 py-1.5 rounded-lg border border-hairline">
              <Filter className="w-3.5 h-3.5 text-muted" />
              <span className="text-xs text-muted font-medium">Status:</span>
              <select
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value)}
                className="text-xs bg-transparent text-ink font-medium focus:outline-none cursor-pointer"
              >
                <option value="all">All Statuses</option>
                <option value="Paid">Paid</option>
                <option value="Unpaid">Unpaid</option>
                <option value="Returned">Returned</option>
              </select>
            </div>

            {/* Sort Field Selector */}
            <div className="flex items-center gap-1.5 bg-surface-soft px-2.5 py-1.5 rounded-lg border border-hairline">
              <SlidersHorizontal className="w-3.5 h-3.5 text-muted" />
              <span className="text-xs text-muted font-medium">Sort by:</span>
              <select
                value={sortField}
                onChange={e => setSortField(e.target.value as SortField)}
                className="text-xs bg-transparent text-ink font-medium focus:outline-none cursor-pointer"
              >
                <option value="date">Date</option>
                <option value="invoice_number">{activeTab === 'sales' ? 'Bill No' : 'Invoice #'}</option>
                <option value="entity_name">{activeTab === 'sales' ? 'Customer' : 'Supplier'}</option>
                <option value="net_amount">Net Amount</option>
                <option value="total_quantity">Total Qty</option>
                <option value="tax_amount">Tax</option>
              </select>
            </div>

            {/* Ascending / Descending Order Selector */}
            <div className="flex items-center bg-surface-soft p-0.5 rounded-lg border border-hairline">
              <button
                type="button"
                onClick={() => setSortOrder('asc')}
                className={`px-2.5 py-1 text-xs font-medium rounded-md flex items-center gap-1 transition-all ${
                  sortOrder === 'asc'
                    ? 'bg-canvas text-primary font-semibold shadow-xs border border-hairline/60'
                    : 'text-muted hover:text-ink'
                }`}
                title="Sort in Ascending Order (A-Z, 0-9, Oldest First)"
              >
                <ArrowUp className="w-3.5 h-3.5" />
                <span>Ascending</span>
              </button>
              <button
                type="button"
                onClick={() => setSortOrder('desc')}
                className={`px-2.5 py-1 text-xs font-medium rounded-md flex items-center gap-1 transition-all ${
                  sortOrder === 'desc'
                    ? 'bg-canvas text-primary font-semibold shadow-xs border border-hairline/60'
                    : 'text-muted hover:text-ink'
                }`}
                title="Sort in Descending Order (Z-A, 9-0, Newest First)"
              >
                <ArrowDown className="w-3.5 h-3.5" />
                <span>Descending</span>
              </button>
            </div>

            {/* Reset Button */}
            {hasActiveFilters && (
              <button
                type="button"
                onClick={resetFilters}
                className="px-2.5 py-1.5 text-xs text-muted hover:text-ink hover:bg-surface-soft rounded-lg border border-hairline flex items-center gap-1 transition-colors"
                title="Reset filters and sorting"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Reset</span>
              </button>
            )}
          </div>
        </div>

        {/* Results summary bar */}
        <div className="px-6 py-2.5 bg-surface-soft/60 border-b border-hairline flex items-center justify-between text-xs text-muted">
          <div className="flex items-center gap-2 flex-wrap">
            <span>
              Showing <strong className="text-ink font-semibold">{activeTab === 'sales' ? sortedSales.length : sortedPurchases.length}</strong> of{' '}
              {activeTab === 'sales' ? sales.length : purchases.length} records
            </span>
            {searchQuery && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-canvas border border-hairline rounded text-[11px] text-ink">
                Query: "{searchQuery}"
              </span>
            )}
            {statusFilter !== 'all' && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-canvas border border-hairline rounded text-[11px] text-ink">
                Status: {statusFilter}
              </span>
            )}
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-canvas border border-hairline rounded text-[11px] text-muted">
              Order: {sortOrder === 'asc' ? 'Ascending ↑' : 'Descending ↓'}
            </span>
          </div>
          <div className="font-medium text-ink whitespace-nowrap">
            Filtered Total:{' '}
            <span className="font-bold text-ink">
              ₹{(activeTab === 'sales' ? filteredSalesTotal : filteredPurchasesTotal).toFixed(2)}
            </span>
          </div>
        </div>

        <div className="overflow-x-auto flex-1">
          {activeTab === 'sales' ? (
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-hairline text-muted text-xs font-medium uppercase tracking-wider sticky top-0 bg-canvas">
                  {renderSortHeader('Date', 'date')}
                  {renderSortHeader('Bill No', 'invoice_number')}
                  {renderSortHeader('Customer', 'entity_name')}
                  <th className="px-6 py-4 min-w-[300px]">Products Bought</th>
                  {renderSortHeader('Total Qty', 'total_quantity', 'center')}
                  <th className="px-6 py-4 text-right whitespace-nowrap">Amount (₹)</th>
                  {renderSortHeader('Tax (₹)', 'tax_amount', 'right')}
                  {renderSortHeader('Net Amount (₹)', 'net_amount', 'right')}
                  <th className="px-6 py-4 text-center whitespace-nowrap">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-hairline">
                {sortedSales.map((sale) => (
                  <tr key={sale.id} className={`hover:bg-surface-soft transition-colors align-top ${sale.status === 'Returned' ? 'bg-red-50/30' : ''}`}>
                    <td className="px-6 py-4 text-muted text-sm font-medium whitespace-nowrap">{sale.date.split(' ')[0]}</td>
                    <td className="px-6 py-4 font-medium text-ink whitespace-nowrap">{sale.invoice_number || sale.id}</td>
                    <td className="px-6 py-4 font-medium text-ink whitespace-nowrap">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span>{sale.customer_name || 'Walk-in Customer'}</span>
                        {sale.status && sale.status !== 'Paid' && (
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider ${
                            sale.status === 'Returned' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'
                          }`}>
                            {sale.status}
                          </span>
                        )}
                        {sale.source_type === 'warehouse' ? (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200" title="Stock sold from Godown">
                            🏢 {sale.source_warehouse_name || 'Warehouse'}
                          </span>
                        ) : (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-600 border border-slate-200" title="Stock sold from Main Shop">
                            🏪 Shop
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm leading-relaxed">
                      <div className="flex flex-col gap-1">
                        {sale.products_bought ? sale.products_bought.split('\n').map((line, i) => (
                          <div key={i} className="bg-slate-100 px-2 py-1 rounded text-slate-700 font-medium inline-block w-max">
                            {line}
                          </div>
                        )) : '-'}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-center font-medium text-ink whitespace-nowrap">{sale.total_quantity || 0}</td>
                    <td className="px-6 py-4 text-right text-muted text-sm whitespace-nowrap">{(sale.net_amount - sale.tax_amount).toFixed(2)}</td>
                    <td className="px-6 py-4 text-right text-muted text-sm whitespace-nowrap">{sale.tax_amount.toFixed(2)}</td>
                    <td className="px-6 py-4 text-right font-medium text-ink text-base whitespace-nowrap">₹{sale.net_amount.toFixed(2)}</td>
                    <td className="px-6 py-4 text-center whitespace-nowrap relative">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setOpenDropdownId(openDropdownId === `sale-${sale.id}` ? null : `sale-${sale.id}`);
                        }}
                        className="p-1 hover:bg-surface-soft rounded-full transition-colors text-muted hover:text-ink"
                      >
                        <MoreVertical className="w-5 h-5" />
                      </button>
                      
                      {openDropdownId === `sale-${sale.id}` && (
                        <div 
                          className="absolute right-6 top-10 w-36 bg-canvas border border-hairline rounded-lg shadow-lg py-1 z-10 animate-fade-in-up"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button 
                            onClick={() => {
                              setOpenDropdownId(null);
                              navigate(`/pos?editId=${sale.id}`, { state: { startDate, endDate, activeTab: 'sales' } });
                            }}
                            className="w-full text-left px-4 py-2 text-sm text-ink hover:bg-surface-soft flex items-center gap-2"
                          >
                            <Edit className="w-4 h-4 text-primary" />
                            Edit Bill
                          </button>
                          <button 
                            onClick={() => {
                              setOpenDropdownId(null);
                              handlePrint(sale);
                            }}
                            className="w-full text-left px-4 py-2 text-sm text-ink hover:bg-surface-soft flex items-center gap-2"
                          >
                            <Printer className="w-4 h-4 text-primary" />
                            Print Receipt
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
                {sortedSales.length === 0 && (
                  <tr>
                    <td colSpan={9} className="p-12 text-center text-muted text-sm">
                      {sales.length === 0 ? (
                        'No sales found for the selected date range.'
                      ) : (
                        <div className="flex flex-col items-center justify-center gap-2">
                          <p className="font-medium text-ink">No sales match your search or filter.</p>
                          <p className="text-xs text-muted">Try clearing the search query or status filter.</p>
                          <button
                            onClick={resetFilters}
                            className="mt-2 px-3 py-1.5 text-xs bg-surface-soft hover:bg-canvas border border-hairline rounded-lg text-ink font-medium transition-colors"
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
              <thead>
                <tr className="border-b border-hairline text-muted text-xs font-medium uppercase tracking-wider sticky top-0 bg-canvas">
                  {renderSortHeader('Date', 'date')}
                  {renderSortHeader('Supplier', 'entity_name')}
                  {renderSortHeader('Invoice #', 'invoice_number')}
                  <th className="px-6 py-4 min-w-[300px]">Products Bought</th>
                  {renderSortHeader('Total Qty', 'total_quantity', 'center')}
                  <th className="px-6 py-4 text-right whitespace-nowrap">Amount (₹)</th>
                  {renderSortHeader('Tax (₹)', 'tax_amount', 'right')}
                  {renderSortHeader('Net Amount (₹)', 'net_amount', 'right')}
                  <th className="px-6 py-4 text-center whitespace-nowrap">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-hairline">
                {sortedPurchases.map((purchase) => (
                  <tr key={purchase.id} className={`hover:bg-surface-soft transition-colors align-top ${purchase.status === 'Returned' ? 'bg-red-50/30' : ''}`}>
                    <td className="px-6 py-4 text-muted text-sm font-medium whitespace-nowrap">{purchase.date.split(' ')[0]}</td>
                    <td className="px-6 py-4 font-medium text-ink whitespace-nowrap">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span>{purchase.supplier_name}</span>
                        {purchase.status && purchase.status !== 'Paid' && (
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider ${
                            purchase.status === 'Returned' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'
                          }`}>
                            {purchase.status}
                          </span>
                        )}
                        {purchase.destination_type === 'warehouse' ? (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200" title="Stock allocated to Warehouse">
                            🏢 {purchase.destination_warehouse_name || 'Warehouse'}
                          </span>
                        ) : (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-600 border border-slate-200" title="Stock allocated to Main Shop">
                            🏪 Shop
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-muted text-sm whitespace-nowrap">{purchase.invoice_number}</td>
                    <td className="px-6 py-4 text-sm leading-relaxed">
                      <div className="flex flex-col gap-1">
                        {purchase.products_bought ? purchase.products_bought.split('\n').map((line, i) => (
                          <div key={i} className="bg-slate-100 px-2 py-1 rounded text-slate-700 font-medium inline-block w-max">
                            {line}
                          </div>
                        )) : '-'}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-center font-medium text-ink whitespace-nowrap">{purchase.total_quantity || 0}</td>
                    <td className="px-6 py-4 text-right text-muted text-sm whitespace-nowrap">{(purchase.net_amount - purchase.tax_amount).toFixed(2)}</td>
                    <td className="px-6 py-4 text-right text-muted text-sm whitespace-nowrap">{purchase.tax_amount.toFixed(2)}</td>
                    <td className="px-6 py-4 text-right font-medium text-ink text-base whitespace-nowrap">₹{purchase.net_amount.toFixed(2)}</td>
                    <td className="px-6 py-4 text-center whitespace-nowrap relative">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setOpenDropdownId(openDropdownId === `purchase-${purchase.id}` ? null : `purchase-${purchase.id}`);
                        }}
                        className="p-1 hover:bg-surface-soft rounded-full transition-colors text-muted hover:text-ink"
                      >
                        <MoreVertical className="w-5 h-5" />
                      </button>
                      
                      {openDropdownId === `purchase-${purchase.id}` && (
                        <div 
                          className="absolute right-6 top-10 w-36 bg-canvas border border-hairline rounded-lg shadow-lg py-1 z-10 animate-fade-in-up"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button 
                            onClick={() => {
                              setOpenDropdownId(null);
                              navigate(`/purchases?editId=${purchase.id}`, { state: { startDate, endDate, activeTab: 'purchases' } });
                            }}
                            className="w-full text-left px-4 py-2 text-sm text-ink hover:bg-surface-soft flex items-center gap-2"
                          >
                            <Edit className="w-4 h-4 text-primary" />
                            Edit Bill
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
                {sortedPurchases.length === 0 && (
                  <tr>
                    <td colSpan={9} className="p-12 text-center text-muted text-sm">
                      {purchases.length === 0 ? (
                        'No purchases found for the selected date range.'
                      ) : (
                        <div className="flex flex-col items-center justify-center gap-2">
                          <p className="font-medium text-ink">No purchases match your search or filter.</p>
                          <p className="text-xs text-muted">Try clearing the search query or status filter.</p>
                          <button
                            onClick={resetFilters}
                            className="mt-2 px-3 py-1.5 text-xs bg-surface-soft hover:bg-canvas border border-hairline rounded-lg text-ink font-medium transition-colors"
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

