import { useState, useEffect } from 'react';
import { Calendar, IndianRupee, Truck, Printer, Receipt as ReceiptIcon } from 'lucide-react';
import { getSalesReport, getPurchaseReport, getSaleDetails, getDayBookProfitAndExpenses, getCustomers } from '../lib/db';
import type { SalesReportItem, PurchaseReportItem } from '../lib/db';
import { Receipt } from '../components/Receipt';
import type { ReceiptData } from '../components/Receipt';

export default function DayBook() {
  const [startDate, setStartDate] = useState(getDaysAgo(0));
  const [endDate, setEndDate] = useState(getDaysAgo(0));
  const [activeTab, setActiveTab] = useState<'sales' | 'purchases'>('sales');

  const [sales, setSales] = useState<SalesReportItem[]>([]);
  const [purchases, setPurchases] = useState<PurchaseReportItem[]>([]);
  const [printData, setPrintData] = useState<ReceiptData | null>(null);
  
  const [profit, setProfit] = useState(0);
  const [expenses, setExpenses] = useState(0);

  function getDaysAgo(days: number) {
    const d = new Date();
    d.setDate(d.getDate() - days);
    return d.toISOString().split('T')[0];
  }

  useEffect(() => {
    loadData();
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
          gstin: customer.gstin || ''
        } : undefined,
        items,
        subtotal,
        taxAmount: sale.tax_amount,
        taxMethod,
        discount: sale.discount || 0,
        netAmount: sale.net_amount,
        paidAmount: sale.status === 'Paid' ? sale.net_amount : (sale.status === 'Unpaid' ? 0 : sale.net_amount / 2) // Approximation for partial
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
      <header className="mb-8 flex justify-between items-end flex-wrap gap-4">
        <div>
          <h1 className="text-4xl font-display font-medium text-ink tracking-tight">Day Book</h1>
          <p className="text-base text-body mt-2">View sales and purchases for a specific date range.</p>
        </div>
        
        <div className="flex items-center gap-3 bg-surface-soft p-2 rounded-lg border border-hairline">
          <Calendar className="w-5 h-5 text-muted ml-2" />
          <input 
            type="date" 
            value={startDate}
            onChange={e => setStartDate(e.target.value)}
            className="px-3 py-2 bg-canvas border border-hairline rounded-md shadow-sm focus:outline-none focus:border-primary transition-colors text-ink text-sm"
          />
          <span className="text-muted text-sm font-medium">to</span>
          <input 
            type="date" 
            value={endDate}
            onChange={e => setEndDate(e.target.value)}
            className="px-3 py-2 bg-canvas border border-hairline rounded-md shadow-sm focus:outline-none focus:border-primary transition-colors text-ink text-sm"
          />
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
            className={`px-4 py-2 font-medium text-sm rounded-t-lg transition-colors border-b-2 ${
              activeTab === 'sales'
                ? 'bg-canvas text-primary border-primary'
                : 'text-muted hover:text-ink hover:bg-canvas border-transparent'
            }`}
          >
            Sales Records
          </button>
          <button
            onClick={() => setActiveTab('purchases')}
            className={`px-4 py-2 font-medium text-sm rounded-t-lg transition-colors border-b-2 ${
              activeTab === 'purchases'
                ? 'bg-canvas text-primary border-primary'
                : 'text-muted hover:text-ink hover:bg-canvas border-transparent'
            }`}
          >
            Purchase Records
          </button>
        </div>

        <div className="overflow-x-auto flex-1">
          {activeTab === 'sales' ? (
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-hairline text-muted text-xs font-medium uppercase tracking-wider sticky top-0 bg-canvas">
                  <th className="px-6 py-4 whitespace-nowrap">Date</th>
                  <th className="px-6 py-4 whitespace-nowrap">Bill No</th>
                  <th className="px-6 py-4 whitespace-nowrap">Customer</th>
                  <th className="px-6 py-4 min-w-[300px]">Products Bought</th>
                  <th className="px-6 py-4 whitespace-nowrap">Total Qty</th>
                  <th className="px-6 py-4 text-right whitespace-nowrap">Amount (₹)</th>
                  <th className="px-6 py-4 text-right whitespace-nowrap">Tax (₹)</th>
                  <th className="px-6 py-4 text-right whitespace-nowrap">Net Amount (₹)</th>
                  <th className="px-6 py-4 text-center whitespace-nowrap">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-hairline">
                {sales.map((sale) => (
                  <tr key={sale.id} className={`hover:bg-surface-soft transition-colors align-top ${sale.status === 'Returned' ? 'bg-red-50/30' : ''}`}>
                    <td className="px-6 py-4 text-muted text-sm font-medium whitespace-nowrap">{sale.date.split(' ')[0]}</td>
                    <td className="px-6 py-4 font-medium text-ink whitespace-nowrap">{sale.invoice_number || sale.id}</td>
                    <td className="px-6 py-4 font-medium text-ink whitespace-nowrap">{sale.customer_name || 'Walk-in'}</td>
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
                    <td className="px-6 py-4 text-center whitespace-nowrap">
                      <button 
                        onClick={() => handlePrint(sale)}
                        className="p-2 bg-surface-soft hover:bg-canvas border border-hairline rounded shadow-sm text-primary transition-colors"
                        title="Print Receipt"
                      >
                        <Printer className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
                {sales.length === 0 && (
                  <tr>
                    <td colSpan={9} className="p-8 text-center text-muted text-sm">No sales found.</td>
                  </tr>
                )}
              </tbody>
            </table>
          ) : (
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-hairline text-muted text-xs font-medium uppercase tracking-wider sticky top-0 bg-canvas">
                  <th className="px-6 py-4 whitespace-nowrap">Date</th>
                  <th className="px-6 py-4 whitespace-nowrap">Supplier</th>
                  <th className="px-6 py-4 whitespace-nowrap">Invoice #</th>
                  <th className="px-6 py-4 min-w-[300px]">Products Bought</th>
                  <th className="px-6 py-4 whitespace-nowrap">Total Qty</th>
                  <th className="px-6 py-4 text-right whitespace-nowrap">Amount (₹)</th>
                  <th className="px-6 py-4 text-right whitespace-nowrap">Tax (₹)</th>
                  <th className="px-6 py-4 text-right whitespace-nowrap">Net Amount (₹)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-hairline">
                {purchases.map((purchase) => (
                  <tr key={purchase.id} className={`hover:bg-surface-soft transition-colors align-top ${purchase.status === 'Returned' ? 'bg-red-50/30' : ''}`}>
                    <td className="px-6 py-4 text-muted text-sm font-medium whitespace-nowrap">{purchase.date.split(' ')[0]}</td>
                    <td className="px-6 py-4 font-medium text-ink whitespace-nowrap">{purchase.supplier_name}</td>
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
                  </tr>
                ))}
                {purchases.length === 0 && (
                  <tr>
                    <td colSpan={8} className="p-8 text-center text-muted text-sm">No purchases found.</td>
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
