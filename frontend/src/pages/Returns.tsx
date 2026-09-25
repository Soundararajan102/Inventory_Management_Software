import { useState, useEffect } from 'react';
import { X, Search, RotateCcw, Users, Truck } from 'lucide-react';
import { getSaleDetails, getPurchaseDetails, getReturns, recordReturn, getProducts, getCustomers, getSuppliers } from '../lib/db';
import type { ReturnRecord, TransactionDetail, Product, Customer, Supplier } from '../lib/db';

export default function Returns() {
  const [activeTab, setActiveTab] = useState<'customers' | 'suppliers'>('customers');
  const [returns, setReturns] = useState<ReturnRecord[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<TransactionDetail[]>([]);
  const [selectedTx, setSelectedTx] = useState<TransactionDetail | null>(null);

  // Return quantities: product_id -> qty
  const [returnQtys, setReturnQtys] = useState<Record<number, number>>({});
  const [reason, setReason] = useState('');

  useEffect(() => {
    loadReturns();
  }, [activeTab]);

  async function loadReturns() {
    try {
      setProducts(await getProducts());
      setCustomers(await getCustomers());
      setSuppliers(await getSuppliers());
      
      const entityType = activeTab === 'customers' ? 'customer' : 'supplier';
      setReturns(await getReturns(entityType));
    } catch (e) {
      console.error(e);
    }
  }

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    
    try {
      if (activeTab === 'customers') {
        setSearchResults(await getSaleDetails(searchQuery));
      } else {
        setSearchResults(await getPurchaseDetails(searchQuery));
      }
      setSelectedTx(null);
      setReturnQtys({});
    } catch (e) {
      console.error(e);
    }
  }

  function handleSelectTx(tx: TransactionDetail) {
    setSelectedTx(tx);
    setReturnQtys({});
  }

  function handleQtyChange(productId: number, qty: number, maxQty: number) {
    if (qty < 0) qty = 0;
    if (qty > maxQty) qty = maxQty;
    
    setReturnQtys(prev => ({
      ...prev,
      [productId]: qty
    }));
  }

  async function handleSubmitReturn() {
    if (!selectedTx) return;
    
    const itemsToReturn = selectedTx.items.filter(i => (returnQtys[i.product_id] || 0) > 0);
    if (itemsToReturn.length === 0) {
      alert("Please select at least one item to return.");
      return;
    }

    setIsProcessing(true);
    try {
      const entityType = activeTab === 'customers' ? 'customer' : 'supplier';
      
      // We loop over each item and record it in the DB
      for (const item of itemsToReturn) {
        const qty = returnQtys[item.product_id];
        const amount = qty * item.unit_price;
        await recordReturn(
          entityType,
          selectedTx.entity_id || 0, // Walk-in customers might have entity_id = 0/null in DB conceptually, handled in DB layer
          selectedTx.id, // transactionId
          item.product_id,
          qty,
          amount,
          reason
        );
      }
      
      alert('Return processed successfully!');
      setIsModalOpen(false);
      setSearchQuery('');
      setSearchResults([]);
      setSelectedTx(null);
      setReturnQtys({});
      setReason('');
      loadReturns();
    } catch (e) {
      console.error(e);
      alert(`Error processing return: ${e}`);
    } finally {
      setIsProcessing(false);
    }
  }

  const totalRefundAmount = selectedTx ? selectedTx.items.reduce((sum, item) => {
    return sum + ((returnQtys[item.product_id] || 0) * item.unit_price);
  }, 0) : 0;

  const getProductName = (id: number) => products.find(p => p.id === id)?.name || `Product #${id}`;
  const getEntityName = (id: number) => {
    if (!id) return 'Walk-in';
    if (activeTab === 'customers') return customers.find(c => c.id === id)?.name || `Entity #${id}`;
    return suppliers.find(s => s.id === id)?.name || `Entity #${id}`;
  };

  return (
    <div className="p-8 h-full flex flex-col relative bg-slate-50">
      <header className="mb-6 flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-slate-800 tracking-tight">Returns Management</h1>
          <p className="text-slate-500 mt-1">Manage Sales Returns (Customer to Us) and Purchase Returns (Us to Supplier)</p>
        </div>
        <button 
          onClick={() => {
            setIsModalOpen(true);
            setSearchQuery('');
            setSearchResults([]);
            setSelectedTx(null);
          }}
          className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-xl font-semibold shadow-sm hover:shadow flex items-center transition-all"
        >
          <RotateCcw className="w-5 h-5 mr-2" />
          Process New Return
        </button>
      </header>

      {/* Tabs */}
      <div className="flex space-x-1 bg-slate-200/50 p-1 rounded-xl mb-6 w-fit">
        <button 
          className={`px-5 py-2 rounded-lg font-medium text-sm transition-all flex items-center ${activeTab === 'customers' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200'}`}
          onClick={() => setActiveTab('customers')}
        >
          <Users className="w-4 h-4 mr-2" />
          Sales Returns (From Customers)
        </button>
        <button 
          className={`px-5 py-2 rounded-lg font-medium text-sm transition-all flex items-center ${activeTab === 'suppliers' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200'}`}
          onClick={() => setActiveTab('suppliers')}
        >
          <Truck className="w-4 h-4 mr-2" />
          Purchase Returns (To Suppliers)
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 flex-1 flex flex-col overflow-hidden">
        <div className="overflow-x-auto flex-1">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 text-xs uppercase tracking-wider sticky top-0 z-10">
                <th className="px-6 py-4 font-semibold">Date</th>
                <th className="px-6 py-4 font-semibold">{activeTab === 'customers' ? 'Customer' : 'Supplier'}</th>
                <th className="px-6 py-4 font-semibold">Product</th>
                <th className="px-6 py-4 font-semibold text-right">Quantity</th>
                <th className="px-6 py-4 font-semibold text-right">Amount Refunded (₹)</th>
                <th className="px-6 py-4 font-semibold">Reason</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {returns.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-6 py-4 text-slate-600">{r.date.split(' ')[0]}</td>
                  <td className="px-6 py-4 font-medium text-slate-800">{getEntityName(r.entity_id)}</td>
                  <td className="px-6 py-4 text-slate-600">{getProductName(r.product_id)}</td>
                  <td className="px-6 py-4 text-right font-medium">{r.quantity}</td>
                  <td className="px-6 py-4 text-right text-slate-800 font-semibold text-lg">₹{r.amount.toFixed(2)}</td>
                  <td className="px-6 py-4 text-slate-500 text-sm max-w-xs truncate">{r.reason || '-'}</td>
                </tr>
              ))}
              {returns.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-12 text-center text-slate-500">
                    <RotateCcw className="w-12 h-12 text-slate-300 mx-auto mb-4" />
                    <p className="text-lg font-medium text-slate-700">No returns found</p>
                    <p className="text-sm mt-1">Process a return to see it listed here.</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {isModalOpen && (
        <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
              <h2 className="text-xl font-bold text-slate-800">
                Process {activeTab === 'customers' ? 'Sales Return' : 'Purchase Return'}
              </h2>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600 transition-colors p-1 hover:bg-slate-100 rounded-lg">
                <X className="w-6 h-6" />
              </button>
            </div>
            
            <div className="p-6 flex flex-col gap-6 overflow-y-auto flex-1">
              
              {/* Step 1: Search Bill */}
              {!selectedTx && (
                <div>
                  <h3 className="text-sm font-semibold text-slate-800 uppercase tracking-wider mb-3">1. Find Original Bill</h3>
                  <form onSubmit={handleSearch} className="flex gap-3 mb-6">
                    <div className="relative flex-1">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5" />
                      <input 
                        type="text" 
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search by Bill No (e.g. 26-1), Date, or Name..." 
                        className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-slate-800"
                      />
                    </div>
                    <button type="submit" className="bg-slate-800 hover:bg-slate-900 text-white px-6 py-3 rounded-xl font-medium transition-colors">
                      Search
                    </button>
                  </form>

                  {searchResults.length > 0 && (
                    <div className="border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                      <table className="w-full text-left">
                        <thead className="bg-slate-50 border-b border-slate-200">
                          <tr>
                            <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Bill No</th>
                            <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Date</th>
                            <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">{activeTab === 'customers' ? 'Customer' : 'Supplier'}</th>
                            <th className="px-4 py-3 text-right"></th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {searchResults.map(tx => (
                            <tr key={tx.id} className="hover:bg-slate-50 cursor-pointer" onClick={() => handleSelectTx(tx)}>
                              <td className="px-4 py-3 font-medium text-slate-800">{tx.invoice_number || tx.id}</td>
                              <td className="px-4 py-3 text-slate-600">{tx.date.split(' ')[0]}</td>
                              <td className="px-4 py-3 text-slate-600">{tx.entity_name}</td>
                              <td className="px-4 py-3 text-right">
                                <button className="text-blue-600 font-medium hover:text-blue-800 text-sm bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-lg transition-colors">
                                  Select
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                  {searchQuery && searchResults.length === 0 && (
                    <div className="text-center py-8 text-slate-500 bg-slate-50 rounded-xl border border-slate-200 border-dashed">
                      No bills found matching your search. Try another Bill Number or Date.
                    </div>
                  )}
                </div>
              )}

              {/* Step 2: Process Return */}
              {selectedTx && (
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-semibold text-slate-800 uppercase tracking-wider">2. Select Items to Return</h3>
                    <button onClick={() => setSelectedTx(null)} className="text-sm text-slate-500 hover:text-slate-800 font-medium">
                      ← Back to Search
                    </button>
                  </div>

                  <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 mb-6 flex gap-8 shadow-sm">
                    <div>
                      <p className="text-xs text-slate-500 font-medium mb-1">BILL NO</p>
                      <p className="font-semibold text-slate-800 text-lg">{selectedTx.invoice_number || selectedTx.id}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500 font-medium mb-1">{activeTab === 'customers' ? 'CUSTOMER' : 'SUPPLIER'}</p>
                      <p className="font-semibold text-slate-800 text-lg">{selectedTx.entity_name}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500 font-medium mb-1">DATE</p>
                      <p className="font-semibold text-slate-800 text-lg">{selectedTx.date.split(' ')[0]}</p>
                    </div>
                  </div>

                  <div className="border border-slate-200 rounded-xl overflow-hidden mb-6 shadow-sm">
                    <table className="w-full text-left">
                      <thead className="bg-slate-50 border-b border-slate-200">
                        <tr>
                          <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Product</th>
                          <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider text-right">Billed Price</th>
                          <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider text-right">Purchased Qty</th>
                          <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider text-right">Return Qty</th>
                          <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider text-right">Refund</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {selectedTx.items.map(item => {
                          const returnQty = returnQtys[item.product_id] || 0;
                          return (
                            <tr key={item.product_id} className={returnQty > 0 ? "bg-blue-50/50" : ""}>
                              <td className="px-4 py-4">
                                <p className="font-medium text-slate-800">{item.name}</p>
                                {item.model && <p className="text-xs text-slate-500">{item.model}</p>}
                              </td>
                              <td className="px-4 py-4 text-right text-slate-600 font-medium">₹{item.unit_price.toFixed(2)}</td>
                              <td className="px-4 py-4 text-right text-slate-600">{item.quantity} {item.unit}</td>
                              <td className="px-4 py-4 flex justify-end">
                                <input 
                                  type="number" 
                                  min="0" 
                                  max={item.quantity} 
                                  value={returnQty || ''} 
                                  onChange={(e) => handleQtyChange(item.product_id, parseInt(e.target.value) || 0, item.quantity)}
                                  className="w-24 px-3 py-2 text-right font-semibold border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all"
                                  placeholder="0"
                                />
                              </td>
                              <td className="px-4 py-4 text-right font-bold text-slate-800">
                                ₹{(returnQty * item.unit_price).toFixed(2)}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  <div className="flex gap-6 items-start">
                    <div className="flex-1">
                      <label className="block text-sm font-medium text-slate-700 mb-2">Reason for Return (Optional)</label>
                      <input 
                        type="text" 
                        value={reason} 
                        onChange={e => setReason(e.target.value)} 
                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-slate-800" 
                        placeholder="e.g. Damaged, Wrong Item" 
                      />
                    </div>
                    <div className="bg-gradient-to-br from-blue-50 to-indigo-50 p-5 rounded-xl border border-blue-100 min-w-[200px] shadow-inner text-right">
                      <p className="text-sm text-blue-800 font-medium mb-1">Total Refund</p>
                      <p className="text-4xl font-bold text-blue-900">₹{totalRefundAmount.toFixed(2)}</p>
                    </div>
                  </div>

                </div>
              )}
            </div>

            <div className="p-6 border-t border-slate-100 flex justify-end gap-3 bg-slate-50/50 mt-auto">
              <button 
                type="button" 
                onClick={() => setIsModalOpen(false)} 
                className="px-6 py-3 text-slate-600 font-medium hover:bg-slate-200 rounded-xl transition-colors"
              >
                Cancel
              </button>
              {selectedTx && (
                <button 
                  onClick={handleSubmitReturn} 
                  disabled={isProcessing || totalRefundAmount === 0}
                  className="px-8 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 disabled:text-slate-500 disabled:cursor-not-allowed text-white font-bold rounded-xl shadow-md hover:shadow-lg transition-all flex items-center"
                >
                  {isProcessing ? 'Processing...' : 'Confirm Return'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
