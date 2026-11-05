import { useState, useEffect } from 'react';
import { 
  Download, Calendar, Printer, Package, 
  IndianRupee, ShoppingCart, Users, Truck, ArrowUpDown, Search 
} from 'lucide-react';
import { 
  getSalesReport, getPurchaseReport, getExpenseReport, getProductWiseSalesReport,
  getInventoryValuationReport, getPartyDetailedLedger, getCustomers, getSuppliers
} from '../lib/db';
import type { 
  SalesReportItem, PurchaseReportItem, Expense, ProductWiseSale, 
  InventoryValuationItem, Customer, Supplier, DetailedLedgerResult 
} from '../lib/db';
import { PrintableReport } from '../components/PrintableReport';
import type { PrintableReportData } from '../components/PrintableReport';

export default function Reports() {
  const [activeTab, setActiveTab] = useState<'sales' | 'purchases' | 'inventory' | 'expenses' | 'ledger' | 'products'>('sales');
  
  // Date filters
  const [startDate, setStartDate] = useState(getDaysAgo(30));
  const [endDate, setEndDate] = useState(getDaysAgo(0));

  // Report Data States
  const [sales, setSales] = useState<SalesReportItem[]>([]);
  const [purchases, setPurchases] = useState<PurchaseReportItem[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [productSales, setProductSales] = useState<ProductWiseSale[]>([]);
  const [inventory, setInventory] = useState<InventoryValuationItem[]>([]);
  const [inventorySearch, setInventorySearch] = useState('');
  const [inventoryFilter, setInventoryFilter] = useState<'all' | 'low_stock' | 'out_of_stock'>('all');

  // Party Ledger Filter States
  const [partyType, setPartyType] = useState<'customer' | 'supplier'>('customer');
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [selectedPartyId, setSelectedPartyId] = useState<number | ''>('');
  const [partyLedgerResult, setPartyLedgerResult] = useState<DetailedLedgerResult | null>(null);

  // Print Data State
  const [printReportData, setPrintReportData] = useState<PrintableReportData | null>(null);

  function getDaysAgo(days: number) {
    const d = new Date();
    d.setDate(d.getDate() - days);
    const offset = d.getTimezoneOffset() * 60000;
    const localDate = new Date(d.getTime() - offset);
    return localDate.toISOString().split('T')[0];
  }

  // Quick Preset Handlers
  function applyPreset(preset: 'today' | 'yesterday' | 'week' | 'month' | 'year' | 'all') {
    const today = getDaysAgo(0);
    if (preset === 'today') {
      setStartDate(today);
      setEndDate(today);
    } else if (preset === 'yesterday') {
      const y = getDaysAgo(1);
      setStartDate(y);
      setEndDate(y);
    } else if (preset === 'week') {
      setStartDate(getDaysAgo(7));
      setEndDate(today);
    } else if (preset === 'month') {
      setStartDate(getDaysAgo(30));
      setEndDate(today);
    } else if (preset === 'year') {
      setStartDate(getDaysAgo(365));
      setEndDate(today);
    } else if (preset === 'all') {
      setStartDate('2020-01-01');
      setEndDate(today);
    }
  }

  useEffect(() => {
    loadPartyOptions();
  }, []);

  async function loadPartyOptions() {
    try {
      const c = await getCustomers();
      setCustomers(c);
      const s = await getSuppliers();
      setSuppliers(s);
      if (c.length > 0 && selectedPartyId === '') {
        setSelectedPartyId(c[0].id);
      }
    } catch (e) {
      console.error(e);
    }
  }

  useEffect(() => {
    loadReports();
  }, [activeTab, startDate, endDate, partyType, selectedPartyId]);

  async function loadReports() {
    try {
      if (activeTab === 'sales') {
        setSales(await getSalesReport(startDate, endDate));
      } else if (activeTab === 'purchases') {
        setPurchases(await getPurchaseReport(startDate, endDate));
      } else if (activeTab === 'inventory') {
        setInventory(await getInventoryValuationReport());
      } else if (activeTab === 'products') {
        setProductSales(await getProductWiseSalesReport(startDate, endDate));
      } else if (activeTab === 'expenses') {
        setExpenses(await getExpenseReport(startDate, endDate));
      } else if (activeTab === 'ledger') {
        if (selectedPartyId !== '') {
          const res = await getPartyDetailedLedger(partyType, Number(selectedPartyId), startDate, endDate);
          setPartyLedgerResult(res);
        } else {
          setPartyLedgerResult(null);
        }
      }
    } catch (e) {
      console.error(e);
    }
  }

  // Totals Calculations
  const totalSalesAmount = sales.reduce((sum, s) => sum + s.net_amount, 0);
  const totalSalesTax = sales.reduce((sum, s) => sum + (s.tax_amount || 0), 0);
  const totalSalesQty = sales.reduce((sum, s) => sum + (s.total_quantity || 0), 0);

  const totalPurchasesAmount = purchases.reduce((sum, p) => sum + p.net_amount, 0);
  const totalPurchasesTax = purchases.reduce((sum, p) => sum + (p.tax_amount || 0), 0);
  const totalPurchasesQty = purchases.reduce((sum, p) => sum + (p.total_quantity || 0), 0);

  const totalExpensesAmount = expenses.reduce((sum, e) => sum + e.amount, 0);
  const totalProductSalesAmount = productSales.reduce((sum, ps) => sum + ps.total_revenue, 0);

  // Filtered inventory calculations
  const filteredInventory = inventory.filter(item => {
    const q = inventorySearch.toLowerCase().trim();
    const matchesSearch = !q || (
      item.name.toLowerCase().includes(q) ||
      (item.model && item.model.toLowerCase().includes(q)) ||
      (item.group_name && item.group_name.toLowerCase().includes(q)) ||
      (item.brand_name && item.brand_name.toLowerCase().includes(q))
    );
    if (!matchesSearch) return false;

    if (inventoryFilter === 'low_stock') {
      return item.stock_quantity <= (item.min_stock ?? 5) && item.stock_quantity > 0;
    }
    if (inventoryFilter === 'out_of_stock') {
      return item.stock_quantity <= 0;
    }
    return true;
  });

  const totalStockValuation = filteredInventory.reduce((sum, i) => sum + (i.stock_valuation || 0), 0);
  const totalRetailValuation = filteredInventory.reduce((sum, i) => sum + (i.retail_valuation || 0), 0);
  const totalStockUnits = filteredInventory.reduce((sum, i) => sum + (i.stock_quantity || 0), 0);
  const lowStockCount = inventory.filter(i => i.stock_quantity <= (i.min_stock ?? 5) && i.stock_quantity > 0).length;
  const outOfStockCount = inventory.filter(i => i.stock_quantity <= 0).length;

  // Trigger PDF Report Generation & Print Dialog
  const handleExportPDF = () => {
    let reportData: PrintableReportData | null = null;
    const formattedRange = `${startDate} to ${endDate}`;

    if (activeTab === 'sales') {
      reportData = {
        reportTitle: 'SALES TRANSACTION REPORT',
        dateRange: formattedRange,
        summaryCards: [
          { label: 'Total Sales Revenue', value: `₹${totalSalesAmount.toFixed(2)}`, highlight: true },
          { label: 'Total GST Tax Collected', value: `₹${totalSalesTax.toFixed(2)}` },
          { label: 'Total Invoices', value: sales.length },
          { label: 'Total Units Sold', value: totalSalesQty }
        ],
        columns: [
          { header: 'Date', accessor: 'formattedDate' },
          { header: 'Invoice #', accessor: 'invoice_number' },
          { header: 'Customer', accessor: 'customer_name' },
          { header: 'Items / Qty', accessor: 'products_bought' },
          { header: 'Total Qty', accessor: 'total_quantity', align: 'center' },
          { header: 'Tax (₹)', accessor: 'formattedTax', align: 'right' },
          { header: 'Net Amount (₹)', accessor: 'formattedNet', align: 'right' }
        ],
        rows: sales.map(s => ({
          ...s,
          formattedDate: s.date.split(' ')[0],
          invoice_number: s.invoice_number || `INV-${s.id}`,
          customer_name: s.customer_name || 'Walk-in Customer',
          formattedTax: (s.tax_amount || 0).toFixed(2),
          formattedNet: `₹${s.net_amount.toFixed(2)}`
        })),
        totalRow: {
          formattedDate: '',
          invoice_number: '',
          customer_name: '',
          products_bought: `${sales.length} Bills`,
          total_quantity: totalSalesQty,
          formattedTax: `₹${totalSalesTax.toFixed(2)}`,
          formattedNet: `₹${totalSalesAmount.toFixed(2)}`
        }
      };
    } else if (activeTab === 'purchases') {
      reportData = {
        reportTitle: 'PURCHASE TRANSACTION REPORT',
        dateRange: formattedRange,
        summaryCards: [
          { label: 'Total Purchases Value', value: `₹${totalPurchasesAmount.toFixed(2)}`, highlight: true },
          { label: 'Total GST Paid', value: `₹${totalPurchasesTax.toFixed(2)}` },
          { label: 'Total Invoices', value: purchases.length },
          { label: 'Total Units Purchased', value: totalPurchasesQty }
        ],
        columns: [
          { header: 'Date', accessor: 'formattedDate' },
          { header: 'Supplier', accessor: 'supplier_name' },
          { header: 'Supplier Inv #', accessor: 'invoice_number' },
          { header: 'Items / Details', accessor: 'products_bought' },
          { header: 'Total Qty', accessor: 'total_quantity', align: 'center' },
          { header: 'Status', accessor: 'status', align: 'center' },
          { header: 'Tax (₹)', accessor: 'formattedTax', align: 'right' },
          { header: 'Net Amount (₹)', accessor: 'formattedNet', align: 'right' }
        ],
        rows: purchases.map(p => ({
          ...p,
          formattedDate: p.date.split(' ')[0],
          formattedTax: (p.tax_amount || 0).toFixed(2),
          formattedNet: `₹${p.net_amount.toFixed(2)}`
        })),
        totalRow: {
          formattedDate: '',
          supplier_name: '',
          invoice_number: '',
          products_bought: `${purchases.length} Purchases`,
          total_quantity: totalPurchasesQty,
          status: '',
          formattedTax: `₹${totalPurchasesTax.toFixed(2)}`,
          formattedNet: `₹${totalPurchasesAmount.toFixed(2)}`
        }
      };
    } else if (activeTab === 'inventory') {
      if (filteredInventory.length === 0) {
        alert("No inventory records found matching your search or filter.");
        return;
      }

      const reportTitle = inventoryFilter === 'low_stock'
        ? 'LOW STOCK INVENTORY REPORT'
        : inventoryFilter === 'out_of_stock'
        ? 'OUT OF STOCK INVENTORY REPORT'
        : inventorySearch.trim()
        ? `INVENTORY STOCK REPORT (Search: "${inventorySearch.trim()}")`
        : 'INVENTORY STOCK & VALUATION REPORT';

      const filterSubtitle = inventoryFilter === 'low_stock'
        ? 'Filter: Low Stock (Below Reorder Level)'
        : inventoryFilter === 'out_of_stock'
        ? 'Filter: Out of Stock'
        : inventorySearch.trim()
        ? `Search: "${inventorySearch.trim()}"`
        : 'All Active Inventory Items';

      reportData = {
        reportTitle,
        subTitle: `As of ${new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })} • ${filterSubtitle}`,
        summaryCards: [
          { label: 'Total Stock Valuation (Cost)', value: `₹${totalStockValuation.toFixed(2)}`, highlight: true },
          { label: 'Potential Retail Value', value: `₹${totalRetailValuation.toFixed(2)}` },
          { label: 'Total Product Items (SKUs)', value: filteredInventory.length },
          { label: 'Total Stock Units', value: totalStockUnits }
        ],
        columns: [
          { header: 'Item Name', accessor: 'name' },
          { header: 'Model / Spec', accessor: 'model' },
          { header: 'Category', accessor: 'group_name' },
          { header: 'Brand', accessor: 'brand_name' },
          { header: 'Stock Qty', accessor: 'stock_display', align: 'center' },
          { header: 'Cost Price (₹)', accessor: 'formattedPurchase', align: 'right' },
          { header: 'Selling Price (₹)', accessor: 'formattedSelling', align: 'right' },
          { header: 'Stock Value (₹)', accessor: 'formattedValuation', align: 'right' }
        ],
        rows: filteredInventory.map(item => ({
          ...item,
          model: item.model || '-',
          brand_name: item.brand_name || '-',
          stock_display: `${item.stock_quantity} ${item.unit}`,
          formattedPurchase: `₹${item.purchase_price.toFixed(2)}`,
          formattedSelling: `₹${item.selling_price.toFixed(2)}`,
          formattedValuation: `₹${item.stock_valuation.toFixed(2)}`
        })),
        totalRow: {
          name: '',
          model: '',
          group_name: `${filteredInventory.length} Items`,
          brand_name: '',
          stock_display: `${totalStockUnits} Units`,
          formattedPurchase: '',
          formattedSelling: `₹${totalRetailValuation.toFixed(2)}`,
          formattedValuation: `₹${totalStockValuation.toFixed(2)}`
        }
      };
    } else if (activeTab === 'expenses') {
      reportData = {
        reportTitle: 'EXPENSES SUMMARY REPORT',
        dateRange: formattedRange,
        summaryCards: [
          { label: 'Total Expenses Incurred', value: `₹${totalExpensesAmount.toFixed(2)}`, highlight: true },
          { label: 'Total Expense Entries', value: expenses.length }
        ],
        columns: [
          { header: 'Date', accessor: 'formattedDate' },
          { header: 'Category', accessor: 'category' },
          { header: 'Description / Particulars', accessor: 'description' },
          { header: 'Amount (₹)', accessor: 'formattedAmount', align: 'right' }
        ],
        rows: expenses.map(e => ({
          ...e,
          formattedDate: e.date.split(' ')[0],
          description: e.description || '-',
          formattedAmount: `₹${e.amount.toFixed(2)}`
        })),
        totalRow: {
          formattedDate: '',
          category: '',
          description: `${expenses.length} Records`,
          formattedAmount: `₹${totalExpensesAmount.toFixed(2)}`
        }
      };
    } else if (activeTab === 'ledger') {
      const activeParty = (partyType === 'customer' ? customers : suppliers).find(p => p.id === Number(selectedPartyId));
      if (!activeParty || !partyLedgerResult) {
        alert('Please select a party to generate the ledger statement.');
        return;
      }

      reportData = {
        reportTitle: `${partyType === 'customer' ? 'CUSTOMER' : 'SUPPLIER'} LEDGER STATEMENT`,
        dateRange: formattedRange,
        partyDetails: {
          name: activeParty.name,
          phone: activeParty.phone || undefined,
          address: activeParty.address || undefined,
          gstin: activeParty.gstin ? activeParty.gstin.toUpperCase() : undefined,
          type: partyType === 'customer' ? 'Customer' : 'Supplier',
          openingBalance: partyLedgerResult.openingBalance,
          closingBalance: partyLedgerResult.closingBalance
        },
        summaryCards: [
          { 
            label: 'Opening Balance', 
            value: `₹${Math.abs(partyLedgerResult.openingBalance).toFixed(2)} ${partyLedgerResult.openingBalance >= 0 ? '(Dr)' : '(Cr)'}` 
          },
          { label: 'Total Debited (+)', value: `₹${partyLedgerResult.totalDebit.toFixed(2)}` },
          { label: 'Total Credited (-)', value: `₹${partyLedgerResult.totalCredit.toFixed(2)}` },
          { 
            label: 'Closing Balance', 
            value: `₹${Math.abs(partyLedgerResult.closingBalance).toFixed(2)} ${partyLedgerResult.closingBalance >= 0 ? '(Dr)' : '(Cr)'}`, 
            highlight: true 
          }
        ],
        columns: [
          { header: 'Date', accessor: 'formattedDate' },
          { header: 'Voucher Type', accessor: 'type' },
          { header: 'Particulars / Reference', accessor: 'description' },
          { header: 'Debit (₹)', accessor: 'formattedDebit', align: 'right' },
          { header: 'Credit (₹)', accessor: 'formattedCredit', align: 'right' },
          { header: 'Balance (₹)', accessor: 'formattedBalance', align: 'right' }
        ],
        rows: partyLedgerResult.entries.map(e => ({
          ...e,
          formattedDate: e.date.split(' ')[0],
          formattedDebit: e.debit > 0 ? `₹${e.debit.toFixed(2)}` : '-',
          formattedCredit: e.credit > 0 ? `₹${e.credit.toFixed(2)}` : '-',
          formattedBalance: `₹${Math.abs(e.balance).toFixed(2)} ${e.balance >= 0 ? '(Dr)' : '(Cr)'}`
        })),
        totalRow: {
          formattedDate: '',
          type: '',
          description: 'Total Transactions',
          formattedDebit: `₹${partyLedgerResult.totalDebit.toFixed(2)}`,
          formattedCredit: `₹${partyLedgerResult.totalCredit.toFixed(2)}`,
          formattedBalance: `₹${Math.abs(partyLedgerResult.closingBalance).toFixed(2)} ${partyLedgerResult.closingBalance >= 0 ? '(Dr)' : '(Cr)'}`
        }
      };
    }

    if (!reportData) return;

    setPrintReportData(reportData);
    setTimeout(() => {
      window.print();
    }, 150);
  };

  // Export CSV Handler
  const exportCSV = async () => {
    let csv = '';
    if (activeTab === 'sales') {
      csv = 'Date,Bill No,Customer,Products Bought,Total Qty,Amount,Tax,Net Amount\n';
      sales.forEach(s => {
        csv += `${s.date.split(' ')[0]},"${s.invoice_number || s.id}","${s.customer_name || 'Walk-in Customer'}","${(s.products_bought || '').replace(/"/g, '""')}",${s.total_quantity || 0},${(s.net_amount - s.tax_amount).toFixed(2)},${s.tax_amount},${s.net_amount}\n`;
      });
    } else if (activeTab === 'purchases') {
      csv = 'Date,Supplier,Supplier Invoice No,Invoice Date,Products Bought,Total Qty,Status,Amount,Tax,Net Amount\n';
      purchases.forEach(p => {
        csv += `${p.date.split(' ')[0]},"${p.supplier_name}","${p.invoice_number}","${p.supplier_invoice_date || ''}","${(p.products_bought || '').replace(/"/g, '""')}",${p.total_quantity || 0},${p.status},${(p.net_amount - p.tax_amount).toFixed(2)},${p.tax_amount},${p.net_amount}\n`;
      });
    } else if (activeTab === 'inventory') {
      if (filteredInventory.length === 0) {
        alert("No inventory records found matching your search or filter.");
        return;
      }
      csv = 'Product ID,Item Name,Model,Category,Brand,Stock Quantity,Unit,Cost Price,Selling Price,Stock Valuation,Retail Valuation\n';
      filteredInventory.forEach(i => {
        csv += `${i.id},"${i.name}","${i.model || ''}","${i.group_name || ''}","${i.brand_name || ''}",${i.stock_quantity},"${i.unit}",${i.purchase_price},${i.selling_price},${i.stock_valuation},${i.retail_valuation}\n`;
      });
    } else if (activeTab === 'products') {
      csv = 'Product ID,Product Name,Model,Units Sold,Net Revenue\n';
      productSales.forEach(ps => {
        csv += `${ps.product_id},"${ps.product_name}","${ps.model || ''}",${ps.total_quantity},${ps.total_revenue.toFixed(2)}\n`;
      });
    } else if (activeTab === 'expenses') {
      csv = 'Date,Category,Amount,Description\n';
      expenses.forEach(e => {
        csv += `${e.date.split(' ')[0]},"${e.category}",${e.amount},"${(e.description || '').replace(/"/g, '""')}"\n`;
      });
    } else if (activeTab === 'ledger') {
      const activeParty = (partyType === 'customer' ? customers : suppliers).find(p => p.id === Number(selectedPartyId));
      csv = `Ledger Statement for: ${activeParty ? activeParty.name : ''} (${partyType})\n`;
      csv += `Period: ${startDate} to ${endDate}\n`;
      csv += `Opening Balance: ${partyLedgerResult?.openingBalance || 0}\n\n`;
      csv += 'Date,Type,Description,Debit,Credit,Running Balance\n';
      partyLedgerResult?.entries.forEach(e => {
        csv += `${e.date.split(' ')[0]},"${e.type}","${(e.description || '').replace(/"/g, '""')}",${e.debit},${e.credit},${e.balance}\n`;
      });
      csv += `\nClosing Balance: ${partyLedgerResult?.closingBalance || 0}\n`;
    }
    
    try {
      const { save } = await import('@tauri-apps/plugin-dialog');
      const { writeTextFile } = await import('@tauri-apps/plugin-fs');
      
      const savePath = await save({
        filters: [{
          name: 'CSV File',
          extensions: ['csv']
        }],
        defaultPath: activeTab === 'inventory'
          ? `inventory_stock_report_${new Date().toISOString().split('T')[0]}.csv`
          : `${activeTab}_report_${startDate}_to_${endDate}.csv`
      });

      if (savePath) {
        await writeTextFile(savePath, '\ufeff' + csv);
        alert('Report exported successfully to CSV!');
      }
    } catch (e: any) {
      console.error(e);
      alert('Failed to export CSV: ' + e.message);
    }
  };

  return (
    <>
      {/* 1. Invisible PDF/Print Document Portal */}
      <PrintableReport data={printReportData} />

      {/* 2. Main On-Screen Reports Interface */}
      <div className="p-8 h-full flex flex-col relative bg-canvas overflow-y-auto print:hidden">
        
        {/* Top Header */}
        <header className="mb-8 flex justify-between items-start gap-4 flex-wrap">
          <div>
            <h1 className="text-3xl font-display font-medium text-ink tracking-tight">Business Reports & Statements</h1>
            <p className="text-sm text-body mt-1">Export professional PDF reports and financial ledger statements.</p>
          </div>

          <div className="flex items-center gap-2.5">
            <button 
              onClick={exportCSV}
              className="bg-canvas hover:bg-surface-soft text-ink border border-hairline px-4 py-2.5 rounded-lg font-medium text-sm flex items-center transition-colors shadow-2xs"
              title="Download Excel / CSV spreadsheet"
            >
              <Download className="w-4 h-4 mr-2 text-muted" />
              Export CSV
            </button>

            <button 
              onClick={handleExportPDF}
              className="bg-primary hover:bg-primary-active text-on-primary px-5 py-2.5 rounded-lg font-medium text-sm flex items-center transition-colors shadow-sm"
              title="Print or Save as PDF"
            >
              <Printer className="w-4 h-4 mr-2" />
              Export PDF / Print
            </button>
          </div>
        </header>

        {/* Main Card */}
        <div className="bg-canvas rounded-xl shadow-xs border border-hairline flex-1 flex flex-col overflow-hidden">
          
          {/* Tabs & Filters Toolbar */}
          <div className="p-4 border-b border-hairline flex justify-between items-center bg-canvas flex-wrap gap-4">
            
            {/* Tabs */}
            <div className="flex gap-1.5 overflow-x-auto pb-1 md:pb-0">
              <button 
                onClick={() => setActiveTab('sales')}
                className={`px-3.5 py-2 rounded-lg font-medium text-xs flex items-center transition-all ${activeTab === 'sales' ? 'bg-primary text-on-primary shadow-2xs' : 'text-muted hover:text-ink hover:bg-surface-soft'}`}
              >
                <ShoppingCart className="w-3.5 h-3.5 mr-1.5" />
                Sales Report
              </button>

              <button 
                onClick={() => setActiveTab('purchases')}
                className={`px-3.5 py-2 rounded-lg font-medium text-xs flex items-center transition-all ${activeTab === 'purchases' ? 'bg-primary text-on-primary shadow-2xs' : 'text-muted hover:text-ink hover:bg-surface-soft'}`}
              >
                <Truck className="w-3.5 h-3.5 mr-1.5" />
                Purchases Report
              </button>

              <button 
                onClick={() => setActiveTab('inventory')}
                className={`px-3.5 py-2 rounded-lg font-medium text-xs flex items-center transition-all ${activeTab === 'inventory' ? 'bg-primary text-on-primary shadow-2xs' : 'text-muted hover:text-ink hover:bg-surface-soft'}`}
              >
                <Package className="w-3.5 h-3.5 mr-1.5" />
                Inventory Stock Report
              </button>

              <button 
                onClick={() => setActiveTab('expenses')}
                className={`px-3.5 py-2 rounded-lg font-medium text-xs flex items-center transition-all ${activeTab === 'expenses' ? 'bg-primary text-on-primary shadow-2xs' : 'text-muted hover:text-ink hover:bg-surface-soft'}`}
              >
                <IndianRupee className="w-3.5 h-3.5 mr-1.5" />
                Expenses Report
              </button>

              <button 
                onClick={() => setActiveTab('ledger')}
                className={`px-3.5 py-2 rounded-lg font-medium text-xs flex items-center transition-all ${activeTab === 'ledger' ? 'bg-primary text-on-primary shadow-2xs' : 'text-muted hover:text-ink hover:bg-surface-soft'}`}
              >
                <Users className="w-3.5 h-3.5 mr-1.5" />
                Party Ledger Statement
              </button>

              <button 
                onClick={() => setActiveTab('products')}
                className={`px-3.5 py-2 rounded-lg font-medium text-xs flex items-center transition-all ${activeTab === 'products' ? 'bg-primary text-on-primary shadow-2xs' : 'text-muted hover:text-ink hover:bg-surface-soft'}`}
              >
                <ArrowUpDown className="w-3.5 h-3.5 mr-1.5" />
                Product Sales
              </button>
            </div>

            {/* Inventory Filters (Search, Stock Status, Export Stock PDF) */}
            {activeTab === 'inventory' && (
              <div className="flex items-center gap-2 flex-wrap text-xs">
                {/* Search */}
                <div className="flex items-center gap-1.5 bg-canvas px-2.5 py-1.5 border border-hairline rounded-md focus-within:border-primary">
                  <Search className="w-3.5 h-3.5 text-muted shrink-0" />
                  <input
                    type="text"
                    placeholder="Search stock..."
                    value={inventorySearch}
                    onChange={e => setInventorySearch(e.target.value)}
                    className="bg-transparent text-ink text-xs focus:outline-none w-36 sm:w-44 placeholder-muted font-medium"
                  />
                  {inventorySearch && (
                    <button onClick={() => setInventorySearch('')} className="text-muted hover:text-ink text-xs font-bold leading-none">×</button>
                  )}
                </div>

                {/* Filter Pills */}
                <div className="flex items-center bg-surface-soft p-1 rounded-md border border-hairline gap-1">
                  <button 
                    onClick={() => setInventoryFilter('all')} 
                    className={`px-2.5 py-1 rounded font-medium transition-colors ${inventoryFilter === 'all' ? 'bg-primary text-on-primary shadow-2xs' : 'text-muted hover:text-ink hover:bg-canvas'}`}
                  >
                    All ({inventory.length})
                  </button>
                  <button 
                    onClick={() => setInventoryFilter('low_stock')} 
                    className={`px-2.5 py-1 rounded font-medium transition-colors ${inventoryFilter === 'low_stock' ? 'bg-amber-600 text-white shadow-2xs' : 'text-muted hover:text-amber-600 hover:bg-canvas'}`}
                  >
                    Low Stock ({lowStockCount})
                  </button>
                  <button 
                    onClick={() => setInventoryFilter('out_of_stock')} 
                    className={`px-2.5 py-1 rounded font-medium transition-colors ${inventoryFilter === 'out_of_stock' ? 'bg-rose-600 text-white shadow-2xs' : 'text-muted hover:text-rose-600 hover:bg-canvas'}`}
                  >
                    Out of Stock ({outOfStockCount})
                  </button>
                </div>

                <button
                  onClick={handleExportPDF}
                  className="bg-primary hover:bg-primary-active text-on-primary px-3 py-1.5 rounded-md font-semibold text-xs flex items-center gap-1.5 transition-colors shadow-2xs cursor-pointer"
                  title="Export Stock Summary as PDF / Print"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Export Stock PDF</span>
                </button>
              </div>
            )}

            {/* Date Range Pickers (Except for Inventory which is as-of-now) */}
            {activeTab !== 'inventory' && (
              <div className="flex items-center gap-2 flex-wrap text-xs">
                {/* Date Presets */}
                <div className="flex items-center bg-surface-soft p-1 rounded-md border border-hairline gap-1">
                  <button onClick={() => applyPreset('today')} className="px-2 py-1 rounded text-muted hover:text-ink hover:bg-canvas">Today</button>
                  <button onClick={() => applyPreset('yesterday')} className="px-2 py-1 rounded text-muted hover:text-ink hover:bg-canvas">Yesterday</button>
                  <button onClick={() => applyPreset('week')} className="px-2 py-1 rounded text-muted hover:text-ink hover:bg-canvas">7 Days</button>
                  <button onClick={() => applyPreset('month')} className="px-2 py-1 rounded text-muted hover:text-ink hover:bg-canvas">30 Days</button>
                  <button onClick={() => applyPreset('all')} className="px-2 py-1 rounded text-muted hover:text-ink hover:bg-canvas">All</button>
                </div>

                <div className="flex items-center gap-1.5 bg-canvas px-2.5 py-1.5 border border-hairline rounded-md">
                  <Calendar className="w-3.5 h-3.5 text-muted" />
                  <input 
                    type="date" 
                    value={startDate}
                    onChange={e => setStartDate(e.target.value)}
                    className="bg-transparent text-ink text-xs focus:outline-none"
                  />
                  <span className="text-muted">to</span>
                  <input 
                    type="date" 
                    value={endDate}
                    onChange={e => setEndDate(e.target.value)}
                    className="bg-transparent text-ink text-xs focus:outline-none"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Sub-bar for Party Ledger Selection */}
          {activeTab === 'ledger' && (
            <div className="px-4 py-3 bg-surface-soft/60 border-b border-hairline flex items-center gap-4 flex-wrap text-xs">
              <div className="flex items-center gap-1 bg-canvas p-1 rounded-md border border-hairline">
                <button
                  onClick={() => {
                    setPartyType('customer');
                    if (customers.length > 0) setSelectedPartyId(customers[0].id);
                  }}
                  className={`px-3 py-1 rounded font-medium ${partyType === 'customer' ? 'bg-primary text-on-primary shadow-2xs' : 'text-muted hover:text-ink'}`}
                >
                  Customer Ledger
                </button>
                <button
                  onClick={() => {
                    setPartyType('supplier');
                    if (suppliers.length > 0) setSelectedPartyId(suppliers[0].id);
                  }}
                  className={`px-3 py-1 rounded font-medium ${partyType === 'supplier' ? 'bg-primary text-on-primary shadow-2xs' : 'text-muted hover:text-ink'}`}
                >
                  Supplier Ledger
                </button>
              </div>

              <div className="flex items-center gap-2 flex-1 max-w-sm">
                <span className="font-semibold text-muted uppercase tracking-wider text-[11px]">Select Party:</span>
                <select
                  value={selectedPartyId}
                  onChange={e => setSelectedPartyId(Number(e.target.value) || '')}
                  className="flex-1 px-3 py-1.5 bg-canvas border border-hairline rounded-md text-xs font-semibold text-ink focus:outline-none focus:border-primary"
                >
                  {(partyType === 'customer' ? customers : suppliers).map(p => (
                    <option key={p.id} value={p.id}>
                      {p.name} {p.phone ? `(${p.phone})` : ''} - Bal: ₹{p.balance.toFixed(2)}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {/* KPI Summary Banner */}
          <div className="p-4 border-b border-hairline bg-surface-soft/60 grid grid-cols-2 md:grid-cols-4 gap-4">
            {activeTab === 'sales' ? (
              <>
                <div className="p-3 bg-canvas rounded-lg border border-hairline">
                  <span className="text-[11px] font-semibold uppercase text-muted block">Total Sales</span>
                  <span className="text-xl font-bold text-ink tabular-nums mt-0.5 block">₹{totalSalesAmount.toFixed(2)}</span>
                </div>
                <div className="p-3 bg-canvas rounded-lg border border-hairline">
                  <span className="text-[11px] font-semibold uppercase text-muted block">Total GST Collected</span>
                  <span className="text-xl font-bold text-ink tabular-nums mt-0.5 block">₹{totalSalesTax.toFixed(2)}</span>
                </div>
                <div className="p-3 bg-canvas rounded-lg border border-hairline">
                  <span className="text-[11px] font-semibold uppercase text-muted block">Total Bills</span>
                  <span className="text-xl font-bold text-ink tabular-nums mt-0.5 block">{sales.length}</span>
                </div>
                <div className="p-3 bg-canvas rounded-lg border border-hairline">
                  <span className="text-[11px] font-semibold uppercase text-muted block">Units Sold</span>
                  <span className="text-xl font-bold text-ink tabular-nums mt-0.5 block">{totalSalesQty}</span>
                </div>
              </>
            ) : activeTab === 'purchases' ? (
              <>
                <div className="p-3 bg-canvas rounded-lg border border-hairline">
                  <span className="text-[11px] font-semibold uppercase text-muted block">Total Purchases</span>
                  <span className="text-xl font-bold text-ink tabular-nums mt-0.5 block">₹{totalPurchasesAmount.toFixed(2)}</span>
                </div>
                <div className="p-3 bg-canvas rounded-lg border border-hairline">
                  <span className="text-[11px] font-semibold uppercase text-muted block">Total GST Paid</span>
                  <span className="text-xl font-bold text-ink tabular-nums mt-0.5 block">₹{totalPurchasesTax.toFixed(2)}</span>
                </div>
                <div className="p-3 bg-canvas rounded-lg border border-hairline">
                  <span className="text-[11px] font-semibold uppercase text-muted block">Purchase Invoices</span>
                  <span className="text-xl font-bold text-ink tabular-nums mt-0.5 block">{purchases.length}</span>
                </div>
                <div className="p-3 bg-canvas rounded-lg border border-hairline">
                  <span className="text-[11px] font-semibold uppercase text-muted block">Units Purchased</span>
                  <span className="text-xl font-bold text-ink tabular-nums mt-0.5 block">{totalPurchasesQty}</span>
                </div>
              </>
            ) : activeTab === 'inventory' ? (
              <>
                <div className="p-3 bg-canvas rounded-lg border border-hairline">
                  <span className="text-[11px] font-semibold uppercase text-muted block">Stock Valuation (Cost)</span>
                  <span className="text-xl font-bold text-ink tabular-nums mt-0.5 block">₹{totalStockValuation.toFixed(2)}</span>
                </div>
                <div className="p-3 bg-canvas rounded-lg border border-hairline">
                  <span className="text-[11px] font-semibold uppercase text-muted block">Retail Value (MRP/Sale)</span>
                  <span className="text-xl font-bold text-ink tabular-nums mt-0.5 block">₹{totalRetailValuation.toFixed(2)}</span>
                </div>
                <div className="p-3 bg-canvas rounded-lg border border-hairline">
                  <span className="text-[11px] font-semibold uppercase text-muted block">Product Count (SKUs)</span>
                  <span className="text-xl font-bold text-ink tabular-nums mt-0.5 block">{filteredInventory.length}</span>
                </div>
                <div className="p-3 bg-canvas rounded-lg border border-hairline">
                  <span className="text-[11px] font-semibold uppercase text-muted block">Total Stock Units</span>
                  <span className="text-xl font-bold text-ink tabular-nums mt-0.5 block">{totalStockUnits}</span>
                </div>
              </>
            ) : activeTab === 'expenses' ? (
              <>
                <div className="p-3 bg-canvas rounded-lg border border-hairline col-span-2">
                  <span className="text-[11px] font-semibold uppercase text-muted block">Total Expenses</span>
                  <span className="text-xl font-bold text-ink tabular-nums mt-0.5 block">₹{totalExpensesAmount.toFixed(2)}</span>
                </div>
                <div className="p-3 bg-canvas rounded-lg border border-hairline col-span-2">
                  <span className="text-[11px] font-semibold uppercase text-muted block">Expense Entries</span>
                  <span className="text-xl font-bold text-ink tabular-nums mt-0.5 block">{expenses.length}</span>
                </div>
              </>
            ) : activeTab === 'ledger' && partyLedgerResult ? (
              <>
                <div className="p-3 bg-canvas rounded-lg border border-hairline">
                  <span className="text-[11px] font-semibold uppercase text-muted block">Opening Balance</span>
                  <span className="text-base font-bold text-ink tabular-nums mt-0.5 block">
                    ₹{Math.abs(partyLedgerResult.openingBalance).toFixed(2)} {partyLedgerResult.openingBalance >= 0 ? '(Dr)' : '(Cr)'}
                  </span>
                </div>
                <div className="p-3 bg-canvas rounded-lg border border-hairline">
                  <span className="text-[11px] font-semibold uppercase text-muted block">Total Debited (+)</span>
                  <span className="text-base font-bold text-ink tabular-nums mt-0.5 block">₹{partyLedgerResult.totalDebit.toFixed(2)}</span>
                </div>
                <div className="p-3 bg-canvas rounded-lg border border-hairline">
                  <span className="text-[11px] font-semibold uppercase text-muted block">Total Credited (-)</span>
                  <span className="text-base font-bold text-ink tabular-nums mt-0.5 block">₹{partyLedgerResult.totalCredit.toFixed(2)}</span>
                </div>
                <div className="p-3 bg-canvas rounded-lg border border-hairline">
                  <span className="text-[11px] font-semibold uppercase text-muted block">Closing Balance</span>
                  <span className="text-base font-bold text-primary tabular-nums mt-0.5 block">
                    ₹{Math.abs(partyLedgerResult.closingBalance).toFixed(2)} {partyLedgerResult.closingBalance >= 0 ? '(Dr)' : '(Cr)'}
                  </span>
                </div>
              </>
            ) : (
              <div className="p-3 bg-canvas rounded-lg border border-hairline col-span-4">
                <span className="text-[11px] font-semibold uppercase text-muted block">Product Net Revenue</span>
                <span className="text-xl font-bold text-ink tabular-nums mt-0.5 block">₹{totalProductSalesAmount.toFixed(2)}</span>
              </div>
            )}
          </div>

          {/* On-Screen Table */}
          <div className="overflow-x-auto flex-1 bg-canvas">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-surface-soft border-b border-hairline text-muted text-[11px] font-semibold uppercase tracking-wider sticky top-0 z-10">
                  <th className="px-4 py-3 whitespace-nowrap">#</th>
                  {activeTab !== 'inventory' && activeTab !== 'products' && (
                    <th className="px-4 py-3 whitespace-nowrap">Date</th>
                  )}

                  {activeTab === 'sales' && (
                    <>
                      <th className="px-4 py-3 whitespace-nowrap">Bill No</th>
                      <th className="px-4 py-3 whitespace-nowrap">Customer</th>
                      <th className="px-4 py-3 min-w-64">Items / Products</th>
                      <th className="px-4 py-3 text-center whitespace-nowrap">Total Qty</th>
                      <th className="px-4 py-3 text-right whitespace-nowrap">Tax (₹)</th>
                      <th className="px-4 py-3 text-right whitespace-nowrap">Net Amount (₹)</th>
                    </>
                  )}

                  {activeTab === 'purchases' && (
                    <>
                      <th className="px-4 py-3 whitespace-nowrap">Supplier</th>
                      <th className="px-4 py-3 whitespace-nowrap">Invoice #</th>
                      <th className="px-4 py-3 whitespace-nowrap">Invoice Date</th>
                      <th className="px-4 py-3 min-w-64">Items / Details</th>
                      <th className="px-4 py-3 text-center whitespace-nowrap">Total Qty</th>
                      <th className="px-4 py-3 whitespace-nowrap">Status</th>
                      <th className="px-4 py-3 text-right whitespace-nowrap">Tax (₹)</th>
                      <th className="px-4 py-3 text-right whitespace-nowrap">Net Amount (₹)</th>
                    </>
                  )}

                  {activeTab === 'inventory' && (
                    <>
                      <th className="px-4 py-3 whitespace-nowrap">Item Name</th>
                      <th className="px-4 py-3 whitespace-nowrap">Model / Spec</th>
                      <th className="px-4 py-3 whitespace-nowrap">Category</th>
                      <th className="px-4 py-3 whitespace-nowrap">Brand</th>
                      <th className="px-4 py-3 text-center whitespace-nowrap">Stock Qty</th>
                      <th className="px-4 py-3 text-right whitespace-nowrap">Cost Price (₹)</th>
                      <th className="px-4 py-3 text-right whitespace-nowrap">Selling Price (₹)</th>
                      <th className="px-4 py-3 text-right whitespace-nowrap font-bold">Stock Value (₹)</th>
                    </>
                  )}

                  {activeTab === 'expenses' && (
                    <>
                      <th className="px-4 py-3 whitespace-nowrap">Category</th>
                      <th className="px-4 py-3 min-w-64">Particulars / Description</th>
                      <th className="px-4 py-3 text-right whitespace-nowrap">Amount (₹)</th>
                    </>
                  )}

                  {activeTab === 'ledger' && (
                    <>
                      <th className="px-4 py-3 whitespace-nowrap">Voucher Type</th>
                      <th className="px-4 py-3 min-w-64">Particulars</th>
                      <th className="px-4 py-3 text-right whitespace-nowrap">Debit (₹)</th>
                      <th className="px-4 py-3 text-right whitespace-nowrap">Credit (₹)</th>
                      <th className="px-4 py-3 text-right whitespace-nowrap font-bold">Running Balance (₹)</th>
                    </>
                  )}

                  {activeTab === 'products' && (
                    <>
                      <th className="px-4 py-3 whitespace-nowrap">Product Name</th>
                      <th className="px-4 py-3 whitespace-nowrap">Model</th>
                      <th className="px-4 py-3 text-center whitespace-nowrap">Units Sold</th>
                      <th className="px-4 py-3 text-right whitespace-nowrap">Net Revenue (₹)</th>
                    </>
                  )}
                </tr>
              </thead>

              <tbody className="divide-y divide-hairline">
                {/* 1. SALES ROWS */}
                {activeTab === 'sales' && sales.map((sale, idx) => (
                  <tr key={sale.id} className="hover:bg-surface-soft/60 transition-colors">
                    <td className="px-4 py-3 text-muted">{idx + 1}</td>
                    <td className="px-4 py-3 text-muted whitespace-nowrap">{sale.date.split(' ')[0]}</td>
                    <td className="px-4 py-3 font-semibold text-ink whitespace-nowrap">{sale.invoice_number || `INV-${sale.id}`}</td>
                    <td className="px-4 py-3 font-medium text-ink whitespace-nowrap">{sale.customer_name || 'Walk-in Customer'}</td>
                    <td className="px-4 py-3 text-body max-w-xs truncate">{sale.products_bought || '-'}</td>
                    <td className="px-4 py-3 text-center font-medium text-ink tabular-nums">{sale.total_quantity || 0}</td>
                    <td className="px-4 py-3 text-right text-muted tabular-nums">₹{(sale.tax_amount || 0).toFixed(2)}</td>
                    <td className="px-4 py-3 text-right font-semibold text-ink tabular-nums">₹{sale.net_amount.toFixed(2)}</td>
                  </tr>
                ))}

                {/* 2. PURCHASES ROWS */}
                {activeTab === 'purchases' && purchases.map((purchase, idx) => (
                  <tr key={purchase.id} className="hover:bg-surface-soft/60 transition-colors">
                    <td className="px-4 py-3 text-muted">{idx + 1}</td>
                    <td className="px-4 py-3 text-muted whitespace-nowrap">{purchase.date.split(' ')[0]}</td>
                    <td className="px-4 py-3 font-semibold text-ink whitespace-nowrap">{purchase.supplier_name}</td>
                    <td className="px-4 py-3 text-muted whitespace-nowrap">{purchase.invoice_number}</td>
                    <td className="px-4 py-3 text-muted whitespace-nowrap">{purchase.supplier_invoice_date || '-'}</td>
                    <td className="px-4 py-3 text-body max-w-xs truncate">{purchase.products_bought || '-'}</td>
                    <td className="px-4 py-3 text-center font-medium text-ink tabular-nums">{purchase.total_quantity || 0}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
                        {purchase.status || 'Recorded'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-muted tabular-nums">₹{(purchase.tax_amount || 0).toFixed(2)}</td>
                    <td className="px-4 py-3 text-right font-semibold text-ink tabular-nums">₹{purchase.net_amount.toFixed(2)}</td>
                  </tr>
                ))}

                {/* 3. INVENTORY STOCK ROWS */}
                {activeTab === 'inventory' && filteredInventory.map((item, idx) => {
                  const isOutOfStock = item.stock_quantity <= 0;
                  const isLowStock = !isOutOfStock && item.stock_quantity <= (item.min_stock ?? 5);
                  return (
                    <tr key={item.id} className="hover:bg-surface-soft/60 transition-colors">
                      <td className="px-4 py-3 text-muted">{idx + 1}</td>
                      <td className="px-4 py-3 font-semibold text-ink whitespace-nowrap">{item.name}</td>
                      <td className="px-4 py-3 text-muted whitespace-nowrap">{item.model || '-'}</td>
                      <td className="px-4 py-3 text-muted whitespace-nowrap">{item.group_name}</td>
                      <td className="px-4 py-3 text-muted whitespace-nowrap">{item.brand_name}</td>
                      <td className="px-4 py-3 text-center font-semibold tabular-nums whitespace-nowrap">
                        <span className={isOutOfStock ? 'text-rose-600 font-bold' : isLowStock ? 'text-amber-600 font-bold' : 'text-ink'}>
                          {item.stock_quantity} {item.unit}
                        </span>
                        {isLowStock && <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-600 font-medium">Low</span>}
                        {isOutOfStock && <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded bg-rose-500/10 text-rose-600 font-medium">Out</span>}
                      </td>
                      <td className="px-4 py-3 text-right text-muted tabular-nums whitespace-nowrap">₹{item.purchase_price.toFixed(2)}</td>
                      <td className="px-4 py-3 text-right text-muted tabular-nums whitespace-nowrap">₹{item.selling_price.toFixed(2)}</td>
                      <td className="px-4 py-3 text-right font-bold text-ink tabular-nums whitespace-nowrap">₹{item.stock_valuation.toFixed(2)}</td>
                    </tr>
                  );
                })}

                {/* 4. EXPENSES ROWS */}
                {activeTab === 'expenses' && expenses.map((expense, idx) => (
                  <tr key={expense.id} className="hover:bg-surface-soft/60 transition-colors">
                    <td className="px-4 py-3 text-muted">{idx + 1}</td>
                    <td className="px-4 py-3 text-muted whitespace-nowrap">{expense.date.split(' ')[0]}</td>
                    <td className="px-4 py-3 font-semibold text-ink whitespace-nowrap">{expense.category}</td>
                    <td className="px-4 py-3 text-body">{expense.description || '-'}</td>
                    <td className="px-4 py-3 text-right font-semibold text-ink tabular-nums">₹{expense.amount.toFixed(2)}</td>
                  </tr>
                ))}

                {/* 5. PARTY LEDGER ROWS */}
                {activeTab === 'ledger' && partyLedgerResult && partyLedgerResult.entries.map((entry, idx) => (
                  <tr key={idx} className="hover:bg-surface-soft/60 transition-colors">
                    <td className="px-4 py-3 text-muted">{idx + 1}</td>
                    <td className="px-4 py-3 text-muted whitespace-nowrap">{entry.date.split(' ')[0]}</td>
                    <td className="px-4 py-3 font-semibold text-ink whitespace-nowrap">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        entry.type === 'Sale' ? 'bg-primary/10 text-primary' :
                        entry.type === 'Purchase' ? 'bg-amber-500/10 text-amber-600' :
                        entry.type === 'Payment' ? 'bg-emerald-500/10 text-emerald-600' :
                        'bg-rose-500/10 text-rose-600'
                      }`}>
                        {entry.type}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-body">{entry.description}</td>
                    <td className="px-4 py-3 text-right font-medium text-ink tabular-nums">
                      {entry.debit > 0 ? `₹${entry.debit.toFixed(2)}` : '-'}
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-emerald-600 dark:text-emerald-400 tabular-nums">
                      {entry.credit > 0 ? `₹${entry.credit.toFixed(2)}` : '-'}
                    </td>
                    <td className="px-4 py-3 text-right font-bold text-ink tabular-nums whitespace-nowrap">
                      ₹{Math.abs(entry.balance).toFixed(2)} {entry.balance >= 0 ? '(Dr)' : '(Cr)'}
                    </td>
                  </tr>
                ))}

                {/* 6. PRODUCT SALES ROWS */}
                {activeTab === 'products' && productSales.map((ps, idx) => (
                  <tr key={idx} className="hover:bg-surface-soft/60 transition-colors">
                    <td className="px-4 py-3 text-muted">{idx + 1}</td>
                    <td className="px-4 py-3 font-semibold text-ink">{ps.product_name}</td>
                    <td className="px-4 py-3 text-muted">{ps.model || '-'}</td>
                    <td className="px-4 py-3 text-center font-medium text-ink tabular-nums">{ps.total_quantity} {ps.unit || ''}</td>
                    <td className="px-4 py-3 text-right font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">₹{ps.total_revenue.toFixed(2)}</td>
                  </tr>
                ))}

                {/* Empty State */}
                {((activeTab === 'sales' && sales.length === 0) ||
                  (activeTab === 'purchases' && purchases.length === 0) ||
                  (activeTab === 'inventory' && filteredInventory.length === 0) ||
                  (activeTab === 'expenses' && expenses.length === 0) ||
                  (activeTab === 'ledger' && (!partyLedgerResult || partyLedgerResult.entries.length === 0)) ||
                  (activeTab === 'products' && productSales.length === 0)) && (
                  <tr>
                    <td colSpan={10} className="p-16 text-center text-muted">
                      <p className="font-semibold text-sm text-ink">No records found</p>
                      <p className="text-xs text-muted mt-1">Try adjusting the date range or selection criteria above.</p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

        </div>

      </div>
    </>
  );
}
