import { useState, useEffect } from 'react';
import { FileText, Download, Calendar } from 'lucide-react';
import { getSalesReport, getPurchaseReport } from '../lib/db';
import type { SalesReportItem, PurchaseReportItem } from '../lib/db';

export default function Reports() {
  const [activeTab, setActiveTab] = useState<'sales' | 'purchases'>('sales');
  
  // Date filters
  const [startDate, setStartDate] = useState(getDaysAgo(30));
  const [endDate, setEndDate] = useState(getDaysAgo(0));

  const [sales, setSales] = useState<SalesReportItem[]>([]);
  const [purchases, setPurchases] = useState<PurchaseReportItem[]>([]);

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
      } else {
        setPurchases(await getPurchaseReport(startDate, endDate));
      }
    } catch (e) {
      console.error(e);
    }
  }

  const exportCSV = async () => {
    let csv = '';
    if (activeTab === 'sales') {
      csv = 'Date,Customer,Payment Method,Tax,Net Amount\n';
      sales.forEach(s => {
        csv += `${s.date.split(' ')[0]},"${s.customer_name || 'Walk-in'}",${s.payment_method},${s.tax_amount},${s.net_amount}\n`;
      });
    } else {
      csv = 'Date,Supplier,Invoice,Status,Tax,Net Amount\n';
      purchases.forEach(p => {
        csv += `${p.date.split(' ')[0]},"${p.supplier_name}",${p.invoice_number},${p.status},${p.tax_amount},${p.net_amount}\n`;
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
        await writeTextFile(savePath, csv);
        alert('Report exported successfully!');
      }
    } catch (e: any) {
      console.error(e);
      alert('Failed to export report: ' + e.message);
    }
  };

  const totalSalesAmount = sales.reduce((sum, s) => sum + s.net_amount, 0);
  const totalPurchasesAmount = purchases.reduce((sum, p) => sum + p.net_amount, 0);

  return (
    <div className="p-8 h-full flex flex-col relative bg-slate-50">
      <header className="mb-6 flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-slate-800 tracking-tight">Business Reports</h1>
          <p className="text-slate-500 mt-1">Generate and export detailed transaction reports</p>
        </div>
        <button 
          onClick={exportCSV}
          className="bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2.5 rounded-xl font-semibold shadow-sm hover:shadow flex items-center transition-all"
        >
          <Download className="w-5 h-5 mr-2" />
          Export to CSV
        </button>
      </header>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 flex-1 flex flex-col overflow-hidden">
        {/* Toolbar */}
        <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-slate-50/50 flex-wrap gap-4">
          <div className="flex gap-2">
            <button 
              onClick={() => setActiveTab('sales')}
              className={`px-5 py-2.5 rounded-lg font-bold flex items-center transition-all ${activeTab === 'sales' ? 'bg-white text-blue-600 shadow-sm border border-slate-200' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100'}`}
            >
              <FileText className="w-4 h-4 mr-2" />
              Sales Report
            </button>
            <button 
              onClick={() => setActiveTab('purchases')}
              className={`px-5 py-2.5 rounded-lg font-bold flex items-center transition-all ${activeTab === 'purchases' ? 'bg-white text-purple-600 shadow-sm border border-slate-200' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100'}`}
            >
              <FileText className="w-4 h-4 mr-2" />
              Purchases Report
            </button>
          </div>

          <div className="flex items-center gap-3">
            <Calendar className="w-5 h-5 text-slate-400" />
            <input 
              type="date" 
              value={startDate}
              onChange={e => setStartDate(e.target.value)}
              className="px-3 py-2 bg-white border border-slate-200 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 font-medium text-slate-700"
            />
            <span className="text-slate-400 font-bold">to</span>
            <input 
              type="date" 
              value={endDate}
              onChange={e => setEndDate(e.target.value)}
              className="px-3 py-2 bg-white border border-slate-200 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 font-medium text-slate-700"
            />
          </div>
        </div>

        {/* Totals Banner */}
        <div className="p-4 border-b border-slate-100 bg-slate-50 flex justify-end">
           <div className="text-right">
             <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
               Total {activeTab === 'sales' ? 'Sales' : 'Purchases'} (Selected Period)
             </div>
             <div className={`text-2xl font-black ${activeTab === 'sales' ? 'text-blue-700' : 'text-purple-700'}`}>
               ₹{(activeTab === 'sales' ? totalSalesAmount : totalPurchasesAmount).toFixed(2)}
             </div>
           </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto flex-1">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/80 backdrop-blur-sm border-b border-slate-200 text-slate-500 text-xs font-bold uppercase tracking-wider sticky top-0 z-10">
                <th className="px-6 py-4">Date</th>
                {activeTab === 'sales' ? (
                  <>
                    <th className="px-6 py-4">Customer</th>
                    <th className="px-6 py-4">Payment Method</th>
                  </>
                ) : (
                  <>
                    <th className="px-6 py-4">Supplier</th>
                    <th className="px-6 py-4">Invoice #</th>
                    <th className="px-6 py-4">Status</th>
                  </>
                )}
                <th className="px-6 py-4 text-right">Tax Amount (₹)</th>
                <th className="px-6 py-4 text-right">Net Amount (₹)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {activeTab === 'sales' && sales.map((sale) => (
                <tr key={sale.id} className="hover:bg-slate-50/50 transition-colors border-b border-slate-50 last:border-0">
                  <td className="px-6 py-4 text-slate-500 text-sm font-medium">{new Date(sale.date).toLocaleString()}</td>
                  <td className="px-6 py-4 font-bold text-slate-800">{sale.customer_name || 'Walk-in Customer'}</td>
                  <td className="px-6 py-4 text-slate-600 font-medium">{sale.payment_method}</td>
                  <td className="px-6 py-4 text-right text-slate-500">{sale.tax_amount.toFixed(2)}</td>
                  <td className="px-6 py-4 text-right font-black text-slate-800 text-lg">₹{sale.net_amount.toFixed(2)}</td>
                </tr>
              ))}

              {activeTab === 'purchases' && purchases.map((purchase) => (
                <tr key={purchase.id} className="hover:bg-slate-50/50 transition-colors border-b border-slate-50 last:border-0">
                  <td className="px-6 py-4 text-slate-500 text-sm font-medium">{new Date(purchase.date).toLocaleString()}</td>
                  <td className="px-6 py-4 font-bold text-slate-800">{purchase.supplier_name}</td>
                  <td className="px-6 py-4 text-slate-600 font-medium">{purchase.invoice_number}</td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 rounded text-xs font-bold ${
                      purchase.status === 'Paid' ? 'bg-emerald-100 text-emerald-700' :
                      purchase.status === 'Partial' ? 'bg-orange-100 text-orange-700' :
                      'bg-red-100 text-red-700'
                    }`}>
                      {purchase.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right text-slate-500">{purchase.tax_amount.toFixed(2)}</td>
                  <td className="px-6 py-4 text-right font-black text-slate-800 text-lg">₹{purchase.net_amount.toFixed(2)}</td>
                </tr>
              ))}

              {(activeTab === 'sales' ? sales : purchases).length === 0 && (
                <tr>
                  <td colSpan={6} className="p-16 text-center text-slate-500">
                    <p className="font-medium">No records found for the selected period.</p>
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
