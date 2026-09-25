import { useState, useEffect } from 'react';
import { FileText, Download, Calendar } from 'lucide-react';
import { getSalesReport, getPurchaseReport, getExpenseReport } from '../lib/db';
import type { SalesReportItem, PurchaseReportItem, Expense } from '../lib/db';

export default function Reports() {
  const [activeTab, setActiveTab] = useState<'sales' | 'purchases' | 'expenses'>('sales');
  
  // Date filters
  const [startDate, setStartDate] = useState(getDaysAgo(30));
  const [endDate, setEndDate] = useState(getDaysAgo(0));

  const [sales, setSales] = useState<SalesReportItem[]>([]);
  const [purchases, setPurchases] = useState<PurchaseReportItem[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);

  function getDaysAgo(days: number) {
    const d = new Date();
    d.setDate(d.getDate() - days);
    return d.toISOString().split('T')[0];
  }

  useEffect(() => {
    loadReports();
  }, [activeTab, startDate, endDate]);

  async function loadReports() {
    try {
      if (activeTab === 'sales') {
        setSales(await getSalesReport(startDate, endDate));
      } else if (activeTab === 'purchases') {
        setPurchases(await getPurchaseReport(startDate, endDate));
      } else {
        setExpenses(await getExpenseReport(startDate, endDate));
      }
    } catch (e) {
      console.error(e);
    }
  }

  const exportCSV = async () => {
    let csv = '';
    if (activeTab === 'sales') {
      csv = 'Date,Customer,Products Bought,Total Qty,Amount,Tax,Net Amount\n';
      sales.forEach(s => {
        csv += `${s.date.split(' ')[0]},"${s.customer_name || 'Walk-in'}","${s.products_bought || ''}",${s.total_quantity || 0},${(s.net_amount - s.tax_amount).toFixed(2)},${s.tax_amount},${s.net_amount}\n`;
      });
    } else if (activeTab === 'purchases') {
      csv = 'Date,Supplier,Invoice,Products Bought,Total Qty,Status,Amount,Tax,Net Amount\n';
      purchases.forEach(p => {
        csv += `${p.date.split(' ')[0]},"${p.supplier_name}",${p.invoice_number},"${p.products_bought || ''}",${p.total_quantity || 0},${p.status},${(p.net_amount - p.tax_amount).toFixed(2)},${p.tax_amount},${p.net_amount}\n`;
      });
    } else {
      csv = 'Date,Category,Amount,Description\n';
      expenses.forEach(e => {
        csv += `${e.date.split(' ')[0]},"${e.category}",${e.amount},"${e.description || ''}"\n`;
      });
    }
    
    try {
      const { save } = await import('@tauri-apps/plugin-dialog');
      const { writeTextFile } = await import('@tauri-apps/plugin-fs');
      
      const savePath = await save({
        filters: [{
          name: 'CSV File',
          extensions: ['csv']
        }],
        defaultPath: `${activeTab}_report_${startDate}_to_${endDate}.csv`
      });

      if (savePath) {
        await writeTextFile(savePath, '\ufeff' + csv);
        alert('Report exported successfully!');
      }
    } catch (e: any) {
      console.error(e);
      alert('Failed to export report: ' + e.message);
    }
  };

  const totalSalesAmount = sales.reduce((sum, s) => sum + s.net_amount, 0);
  const totalPurchasesAmount = purchases.reduce((sum, p) => sum + p.net_amount, 0);
  const totalExpensesAmount = expenses.reduce((sum, e) => sum + e.amount, 0);

  return (
    <div className="p-8 h-full flex flex-col relative bg-canvas overflow-y-auto">
      <header className="mb-12 flex justify-between items-end">
        <div>
          <h1 className="text-4xl font-display font-medium text-ink tracking-tight">Business Reports</h1>
          <p className="text-base text-body mt-2">Generate and export detailed transaction reports.</p>
        </div>
        <button 
          onClick={exportCSV}
          className="bg-primary hover:bg-primary-active text-on-primary px-6 py-3 rounded-lg font-medium shadow-md hover:shadow-lg flex items-center transition-all"
        >
          <Download className="w-5 h-5 mr-2" />
          Export to CSV
        </button>
      </header>

      <div className="bg-canvas rounded-xl shadow-sm border border-hairline flex-1 flex flex-col overflow-hidden">
        {/* Toolbar */}
        <div className="p-4 border-b border-hairline flex justify-between items-center bg-canvas flex-wrap gap-4">
          <div className="flex gap-2">
            <button 
              onClick={() => setActiveTab('sales')}
              className={`px-4 py-2 rounded-md font-medium text-sm flex items-center transition-colors ${activeTab === 'sales' ? 'bg-surface-soft text-ink border border-hairline' : 'text-muted hover:text-ink hover:bg-surface-soft border border-transparent'}`}
            >
              <FileText className="w-4 h-4 mr-2" />
              Sales Report
            </button>
            <button 
              onClick={() => setActiveTab('purchases')}
              className={`px-4 py-2 rounded-md font-medium text-sm flex items-center transition-colors ${activeTab === 'purchases' ? 'bg-surface-soft text-ink border border-hairline' : 'text-muted hover:text-ink hover:bg-surface-soft border border-transparent'}`}
            >
              <FileText className="w-4 h-4 mr-2" />
              Purchases Report
            </button>
            <button 
              onClick={() => setActiveTab('expenses')}
              className={`px-4 py-2 rounded-md font-medium text-sm flex items-center transition-colors ${activeTab === 'expenses' ? 'bg-surface-soft text-ink border border-hairline' : 'text-muted hover:text-ink hover:bg-surface-soft border border-transparent'}`}
            >
              <FileText className="w-4 h-4 mr-2" />
              Expenses Report
            </button>
          </div>

          <div className="flex items-center gap-3">
            <Calendar className="w-5 h-5 text-muted" />
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
        </div>

        {/* Totals Banner */}
        <div className="p-4 border-b border-hairline bg-surface-soft flex justify-end">
           <div className="text-right">
             <div className="text-xs font-medium text-muted uppercase tracking-wider mb-1">
               Total {activeTab === 'sales' ? 'Sales' : activeTab === 'purchases' ? 'Purchases' : 'Expenses'} (Selected Period)
             </div>
             <div className="text-2xl font-bold text-ink">
               ₹{(activeTab === 'sales' ? totalSalesAmount : activeTab === 'purchases' ? totalPurchasesAmount : totalExpensesAmount).toFixed(2)}
             </div>
           </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto flex-1 bg-canvas">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-surface-soft border-b border-hairline text-muted text-xs font-medium uppercase tracking-wider sticky top-0 z-10">
                <th className="px-6 py-4 whitespace-nowrap">Date</th>
                {activeTab === 'sales' ? (
                  <>
                    <th className="px-6 py-4 whitespace-nowrap">Bill No</th>
                    <th className="px-6 py-4 whitespace-nowrap">Customer</th>
                    <th className="px-6 py-4 min-w-[300px]">Products Bought</th>
                    <th className="px-6 py-4 text-center whitespace-nowrap">Total Qty</th>
                    <th className="px-6 py-4 whitespace-nowrap">Status</th>
                    <th className="px-6 py-4 text-right whitespace-nowrap">Amount (₹)</th>
                    <th className="px-6 py-4 text-right whitespace-nowrap">Tax (₹)</th>
                  </>
                ) : activeTab === 'purchases' ? (
                  <>
                    <th className="px-6 py-4 whitespace-nowrap">Supplier</th>
                    <th className="px-6 py-4 whitespace-nowrap">Invoice #</th>
                    <th className="px-6 py-4 min-w-[300px]">Products Bought</th>
                    <th className="px-6 py-4 text-center whitespace-nowrap">Total Qty</th>
                    <th className="px-6 py-4 whitespace-nowrap">Status</th>
                    <th className="px-6 py-4 text-right whitespace-nowrap">Amount (₹)</th>
                    <th className="px-6 py-4 text-right whitespace-nowrap">Tax (₹)</th>
                  </>
                ) : (
                  <>
                    <th className="px-6 py-4 whitespace-nowrap">Category</th>
                    <th className="px-6 py-4">Description</th>
                  </>
                )}
                <th className="px-6 py-4 text-right whitespace-nowrap">{activeTab === 'expenses' ? 'Amount (₹)' : 'Net Amount (₹)'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline">
              {activeTab === 'sales' && sales.map((sale) => (
                <tr key={sale.id} className={`hover:bg-surface-soft transition-colors border-b border-hairline last:border-0 align-top ${sale.status === 'Returned' ? 'bg-red-50/30' : ''}`}>
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
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-2 py-1 rounded text-xs font-medium ${
                      sale.status === 'Paid' ? 'bg-success/10 text-success' :
                      sale.status === 'Returned' ? 'bg-signature-coral/10 text-signature-coral' :
                      sale.status === 'Partial' ? 'bg-signature-mustard/10 text-signature-mustard' :
                      'bg-slate-200 text-slate-600'
                    }`}>
                      {sale.status || 'Paid'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right text-muted text-sm whitespace-nowrap">{(sale.net_amount - sale.tax_amount).toFixed(2)}</td>
                  <td className="px-6 py-4 text-right text-muted text-sm whitespace-nowrap">{sale.tax_amount.toFixed(2)}</td>
                  <td className="px-6 py-4 text-right font-medium text-ink text-base whitespace-nowrap">₹{sale.net_amount.toFixed(2)}</td>
                </tr>
              ))}

              {activeTab === 'purchases' && purchases.map((purchase) => (
                <tr key={purchase.id} className={`hover:bg-surface-soft transition-colors border-b border-hairline last:border-0 align-top ${purchase.status === 'Returned' ? 'bg-red-50/30' : ''}`}>
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
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-2 py-1 rounded text-xs font-medium ${
                      purchase.status === 'Paid' ? 'bg-success/10 text-success' :
                      purchase.status === 'Returned' ? 'bg-signature-coral/10 text-signature-coral' :
                      purchase.status === 'Partial' ? 'bg-signature-mustard/10 text-signature-mustard' :
                      'bg-slate-200 text-slate-600'
                    }`}>
                      {purchase.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right text-muted text-sm whitespace-nowrap">{(purchase.net_amount - purchase.tax_amount).toFixed(2)}</td>
                  <td className="px-6 py-4 text-right text-muted text-sm whitespace-nowrap">{purchase.tax_amount.toFixed(2)}</td>
                  <td className="px-6 py-4 text-right font-medium text-ink text-base whitespace-nowrap">₹{purchase.net_amount.toFixed(2)}</td>
                </tr>
              ))}

              {activeTab === 'expenses' && expenses.map((expense) => (
                <tr key={expense.id} className="hover:bg-surface-soft transition-colors border-b border-hairline last:border-0 align-top">
                  <td className="px-6 py-4 text-muted text-sm font-medium whitespace-nowrap">{new Date(expense.date).toLocaleString()}</td>
                  <td className="px-6 py-4 font-medium text-ink whitespace-nowrap">{expense.category}</td>
                  <td className="px-6 py-4 text-muted text-sm leading-relaxed">{expense.description || '-'}</td>
                  <td className="px-6 py-4 text-right font-medium text-ink text-base whitespace-nowrap">₹{expense.amount.toFixed(2)}</td>
                </tr>
              ))}

              {(activeTab === 'sales' ? sales : activeTab === 'purchases' ? purchases : expenses).length === 0 && (
                <tr>
                  <td colSpan={6} className="p-16 text-center text-muted">
                    <p className="font-medium text-sm">No records found for the selected period.</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
