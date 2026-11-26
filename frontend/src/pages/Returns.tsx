import { useState, useEffect } from 'react';
import { X, Search, RotateCcw, Users, Truck } from 'lucide-react';
import { getSaleDetails, getPurchaseDetails, getReturns, recordReturn, getSellableProducts, getCustomers, getSuppliers } from '../lib/db';
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

  // Return quantities: unique item key -> qty
  const [returnQtys, setReturnQtys] = useState<Record<string, number>>({});
  const [reason, setReason] = useState('');
  const [refundMethod, setRefundMethod] = useState<'credit' | 'cash'>('credit');

  const getItemKey = (item: any, idx: number) => (item.id !== undefined && item.id !== null ? String(item.id) : `${item.product_id}_${idx}`);

  useEffect(() => {
    loadReturns();
  }, [activeTab]);

  async function loadReturns() {
    try {
      setProducts(await getSellableProducts());
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

  function getEffectivePrice(item: TransactionDetail['items'][0], tx: TransactionDetail | null): number {
    if (!item || !item.quantity || item.quantity <= 0) return item.unit_price;
    // When line-level net_amount is stored in database (Zero-Guess Architecture), use it directly!
    if (item.net_amount !== undefined && item.net_amount > 0) {
      return Number((item.net_amount / item.quantity).toFixed(2));
    }
    const isInclusive = tx?.tax_method === 'inclusive';
    const lineGrossAndTax = isInclusive 
      ? (item.unit_price * item.quantity) 
      : ((item.unit_price * item.quantity) + (item.tax || 0));

    if (!tx || !tx.discount || tx.discount <= 0) {
      return Number((lineGrossAndTax / item.quantity).toFixed(2));
    }
    const totalGrossAndTax = tx.items.reduce((s, it) => {
      const itInclusive = tx?.tax_method === 'inclusive';
      return s + (it.unit_price * it.quantity) + (itInclusive ? 0 : (it.tax || 0));
    }, 0);
    if (totalGrossAndTax <= 0) {
      return Number((lineGrossAndTax / item.quantity).toFixed(2));
    }
    const discountRatio = tx.discount / totalGrossAndTax;
    const effTotalLine = lineGrossAndTax * (1 - discountRatio);
    return Number((effTotalLine / item.quantity).toFixed(2));
  }

  function getAvailableStock(productId: number, tx: TransactionDetail | null): number {
    const prod = products.find(p => p.id === productId);
    if (!prod) return 0;
    if (tx?.destination_type === 'warehouse' && tx.destination_warehouse_id && (prod as any)?.warehouse_stocks) {
      return (prod as any).warehouse_stocks[tx.destination_warehouse_id] || 0;
    }
    return (prod as any)?.total_stock !== undefined ? (prod as any).total_stock : (prod.stock_quantity || 0);
  }

  function formatReturnDate(dateStr?: string | null) {
    if (!dateStr) return { date: '-', time: '' };
    try {
      const cleanStr = dateStr.includes('T') ? dateStr : dateStr.replace(' ', 'T');
      const d = new Date(cleanStr);
      if (isNaN(d.getTime())) return { date: dateStr.split(' ')[0], time: '' };
      return {
        date: d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
        time: dateStr.includes(' ') || dateStr.includes('T') ? d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }) : ''
      };
    } catch (e) {
      return { date: dateStr.split(' ')[0], time: '' };
    }
  }

  function handleSelectTx(tx: TransactionDetail) {
    setSelectedTx(tx);
    setReturnQtys({});
    if (!tx.entity_id || tx.entity_id <= 0) {
      setRefundMethod('cash');
    } else {
      setRefundMethod('credit');
    }
  }

  function handleQtyChange(key: string, qty: number, maxQty: number) {
    if (qty < 0) qty = 0;
    if (qty > maxQty) qty = maxQty;
    
    setReturnQtys(prev => ({
      ...prev,
      [key]: qty
    }));
  }

  async function handleSubmitReturn() {
    if (!selectedTx) return;
    
    const itemsToReturn: { item: any; key: string; qty: number }[] = [];
    selectedTx.items.forEach((item, idx) => {
      const key = getItemKey(item, idx);
      const qty = returnQtys[key] || 0;
      if (qty > 0) {
        itemsToReturn.push({ item, key, qty });
      }
    });

    if (itemsToReturn.length === 0) {
      alert("Please enter a return quantity for at least one item.");
      return;
    }

    // For supplier returns, validate that the location actually has enough stock to return
    if (activeTab === 'suppliers') {
      for (const { item, qty } of itemsToReturn) {
        const availableStock = getAvailableStock(item.product_id, selectedTx);
        if (qty > availableStock) {
          const locName = (selectedTx.destination_type === 'warehouse' && selectedTx.destination_warehouse_id) ? 'selected warehouse' : 'shop';
          alert(`Cannot return ${qty} of "${item.name}". Only ${availableStock} currently available in ${locName}.`);
          return;
        }
      }
    }

    setIsProcessing(true);
    try {
      const entityType = activeTab === 'customers' ? 'customer' : 'supplier';
      
      // Loop over each item and record it in the DB (recordReturn handles stock, balance/cash refund, and status)
      for (const { item, qty } of itemsToReturn) {
        const effPrice = getEffectivePrice(item, selectedTx);
        const amount = Number((qty * effPrice).toFixed(2));
        await recordReturn(
          entityType,
          selectedTx.entity_id || 0,
          selectedTx.id,
          item.product_id,
          qty,
          amount,
          reason,
          refundMethod
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
    } catch (e: any) {
      console.error(e);
      alert(`Error processing return: ${e?.message || e}`);
    } finally {
      setIsProcessing(false);
    }
  }

  const totalRefundAmount = selectedTx ? selectedTx.items.reduce((sum, item, idx) => {
    const key = getItemKey(item, idx);
    const effPrice = getEffectivePrice(item, selectedTx);
    return sum + ((returnQtys[key] || 0) * effPrice);
  }, 0) : 0;

  const getProductName = (id: number) => products.find(p => p.id === id)?.name || `Product #${id}`;
  const getEntityName = (id: number) => {
    if (!id) return 'Walk-in Customer';
    if (activeTab === 'customers') return customers.find(c => c.id === id)?.name || `Entity #${id}`;
    return suppliers.find(s => s.id === id)?.name || `Entity #${id}`;
  };

  return (
    <div className="p-6 md:p-8 h-full flex flex-col relative bg-canvas">
      <header className="mb-6 flex flex-wrap justify-between items-center gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-display font-bold text-ink tracking-tight">Returns Management</h1>
          <p className="text-muted text-sm mt-1">Manage Sales Returns (Customer to Us) and Purchase Returns (Us to Supplier)</p>
        </div>
        <button 
          onClick={() => {
            setIsModalOpen(true);
            setSearchQuery('');
            setSearchResults([]);
            setSelectedTx(null);
          }}
          className="bg-primary hover:bg-primary-active text-on-primary px-5 py-2.5 rounded-xl font-semibold shadow-sm hover:shadow flex items-center transition-all"
        >
          <RotateCcw className="w-4 h-4 mr-2" />
          Process New Return
        </button>
      </header>

      {/* Tabs */}
      <div className="flex space-x-1 bg-surface-soft border border-hairline p-1 rounded-xl mb-6 w-fit">
        <button 
          className={`px-4 py-2 rounded-lg font-medium text-sm transition-all flex items-center ${activeTab === 'customers' ? 'bg-surface text-primary shadow-sm font-semibold' : 'text-muted hover:text-ink hover:bg-surface/50'}`}
          onClick={() => setActiveTab('customers')}
        >
          <Users className="w-4 h-4 mr-2" />
          Sales Returns (From Customers)
        </button>
        <button 
          className={`px-4 py-2 rounded-lg font-medium text-sm transition-all flex items-center ${activeTab === 'suppliers' ? 'bg-surface text-primary shadow-sm font-semibold' : 'text-muted hover:text-ink hover:bg-surface/50'}`}
          onClick={() => setActiveTab('suppliers')}
        >
          <Truck className="w-4 h-4 mr-2" />
          Purchase Returns (To Suppliers)
        </button>
      </div>

      <div className="bg-surface rounded-xl shadow-sm border border-hairline flex-1 flex flex-col overflow-hidden">
        <div className="overflow-x-auto flex-1">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-surface-soft border-b border-hairline text-muted text-xs uppercase tracking-wider sticky top-0 z-10">
                <th className="px-6 py-4 font-semibold">Date</th>
                <th className="px-6 py-4 font-semibold">{activeTab === 'customers' ? 'Customer' : 'Supplier'}</th>
                <th className="px-6 py-4 font-semibold">Product</th>
                <th className="px-6 py-4 font-semibold text-right">Quantity</th>
                <th className="px-6 py-4 font-semibold text-right">{activeTab === 'customers' ? 'Amount Refunded (₹)' : 'Settlement Amount (₹)'}</th>
                <th className="px-6 py-4 font-semibold">Reason</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline">
              {returns.map((r) => {
                const dt = formatReturnDate(r.date);
                return (
                  <tr key={r.id} className="hover:bg-surface-soft/50 transition-colors">
                    <td className="px-6 py-4 text-muted">
                      <div className="font-medium text-ink">{dt.date}</div>
                      {dt.time && <div className="text-[11px] text-muted/80 font-mono">{dt.time}</div>}
                    </td>
                    <td className="px-6 py-4 font-medium text-ink">{getEntityName(r.entity_id)}</td>
                    <td className="px-6 py-4 text-muted">{getProductName(r.product_id)}</td>
                    <td className="px-6 py-4 text-right font-medium text-ink">{r.quantity}</td>
                    <td className="px-6 py-4 text-right text-ink font-semibold text-base">₹{r.amount.toFixed(2)}</td>
                    <td className="px-6 py-4 text-muted text-sm max-w-xs truncate">{r.reason || '-'}</td>
                  </tr>
                );
              })}
              {returns.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-12 text-center text-muted">
                    <RotateCcw className="w-12 h-12 text-muted/30 mx-auto mb-4" />
                    <p className="text-lg font-medium text-ink">No returns found</p>
                    <p className="text-sm mt-1">Process a return to see it listed here.</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-ink/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-canvas rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col border border-hairline">
            <div className="px-6 py-4 border-b border-hairline flex justify-between items-center bg-surface">
              <h2 className="text-xl font-bold text-ink">
                Process {activeTab === 'customers' ? 'Sales Return' : 'Purchase Return'}
              </h2>
              <button onClick={() => setIsModalOpen(false)} className="text-muted hover:text-ink transition-colors p-1 hover:bg-surface-soft rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-6 flex flex-col gap-6 overflow-y-auto flex-1">
              
              {/* Step 1: Search Bill */}
              {!selectedTx && (
                <div>
                  <h3 className="text-xs font-bold text-ink uppercase tracking-wider mb-3">1. Find Original Bill</h3>
                  <form onSubmit={handleSearch} className="flex gap-3 mb-6">
                    <div className="relative flex-1">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted w-4 h-4" />
                      <input 
                        type="text" 
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search by Bill No (e.g. 26-1), Date, or Name..." 
                        className="w-full pl-10 pr-4 py-2.5 bg-surface border border-hairline rounded-xl focus:outline-none focus:ring-1 focus:ring-primary/20 focus:border-primary transition-all text-ink text-sm"
                      />
                    </div>
                    <button type="submit" className="bg-primary hover:bg-primary-active text-on-primary px-6 py-2.5 rounded-xl font-medium transition-colors text-sm shadow-sm">
                      Search
                    </button>
                  </form>

                  {searchResults.length > 0 && (
                    <div className="border border-hairline rounded-xl overflow-hidden shadow-sm bg-surface">
                      <table className="w-full text-left">
                        <thead className="bg-surface-soft border-b border-hairline">
                          <tr>
                            <th className="px-4 py-3 text-xs font-semibold text-muted uppercase tracking-wider">Bill No</th>
                            <th className="px-4 py-3 text-xs font-semibold text-muted uppercase tracking-wider">Date</th>
                            <th className="px-4 py-3 text-xs font-semibold text-muted uppercase tracking-wider">{activeTab === 'customers' ? 'Customer' : 'Supplier'}</th>
                            <th className="px-4 py-3 text-right"></th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-hairline">
                          {searchResults.map(tx => (
                            <tr key={tx.id} className="hover:bg-surface-soft/50 cursor-pointer transition-colors" onClick={() => handleSelectTx(tx)}>
                              <td className="px-4 py-3 font-medium text-ink">{tx.invoice_number || tx.id}</td>
                              <td className="px-4 py-3 text-muted text-sm">{tx.date.split(' ')[0]}</td>
                              <td className="px-4 py-3 text-ink text-sm">{tx.entity_name}</td>
                              <td className="px-4 py-3 text-right">
                                <button className="text-primary font-medium hover:text-primary-active text-xs bg-primary/10 hover:bg-primary/20 px-3 py-1.5 rounded-lg transition-colors">
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
                    <div className="text-center py-8 text-muted bg-surface-soft rounded-xl border border-hairline border-dashed text-sm">
                      No bills found matching your search. Try another Bill Number or Date.
                    </div>
                  )}
                </div>
              )}

              {/* Step 2: Process Return */}
              {selectedTx && (
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-xs font-bold text-ink uppercase tracking-wider">2. Select Items to Return</h3>
                    <button onClick={() => setSelectedTx(null)} className="text-sm text-primary hover:text-primary-active font-medium">
                      ← Back to Search
                    </button>
                  </div>

                  <div className="bg-surface-soft p-4 rounded-xl border border-hairline mb-6 flex flex-wrap gap-8 shadow-sm">
                    <div>
                      <p className="text-xs text-muted font-medium mb-1">BILL NO</p>
                      <p className="font-semibold text-ink text-base md:text-lg">{selectedTx.invoice_number || selectedTx.id}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted font-medium mb-1">{activeTab === 'customers' ? 'CUSTOMER' : 'SUPPLIER'}</p>
                      <p className="font-semibold text-ink text-base md:text-lg">{selectedTx.entity_name}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted font-medium mb-1">DATE</p>
                      <p className="font-semibold text-ink text-base md:text-lg">
                        {formatReturnDate(selectedTx.date).date}
                        {formatReturnDate(selectedTx.date).time && (
                          <span className="text-xs font-normal text-muted block">{formatReturnDate(selectedTx.date).time}</span>
                        )}
                      </p>
                    </div>
                  </div>

                  <div className="border border-hairline rounded-xl overflow-hidden mb-6 shadow-sm bg-surface">
                    <table className="w-full text-left">
                      <thead className="bg-surface-soft border-b border-hairline">
                        <tr>
                          <th className="px-4 py-3 text-xs font-semibold text-muted uppercase tracking-wider">Product</th>
                          <th className="px-4 py-3 text-xs font-semibold text-muted uppercase tracking-wider text-right">Billed Rate (Incl. GST)</th>
                          <th className="px-4 py-3 text-xs font-semibold text-muted uppercase tracking-wider text-right">{activeTab === 'customers' ? 'Sold Qty' : 'Purchased Qty'}</th>
                          {activeTab === 'suppliers' && (
                            <th className="px-4 py-3 text-xs font-semibold text-muted uppercase tracking-wider text-right">In-Stock Available</th>
                          )}
                          <th className="px-4 py-3 text-xs font-semibold text-muted uppercase tracking-wider text-right">Return Qty</th>
                          <th className="px-4 py-3 text-xs font-semibold text-muted uppercase tracking-wider text-right">Amount</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-hairline">
                        {selectedTx.items.map((item, idx) => {
                          const itemKey = getItemKey(item, idx);
                          const returnedQty = item.returned_quantity || 0;
                          let maxReturnable = Math.max(0, item.quantity - returnedQty);
                          const availableStock = getAvailableStock(item.product_id, selectedTx);
                          if (activeTab === 'suppliers') {
                            maxReturnable = Math.min(maxReturnable, availableStock);
                          }
                          const returnQty = returnQtys[itemKey] || 0;
                          const effPrice = getEffectivePrice(item, selectedTx);
                          const hasDiscount = (selectedTx.discount || 0) > 0;
                          return (
                            <tr key={itemKey} className={returnQty > 0 ? "bg-primary/5" : ""}>
                              <td className="px-4 py-4">
                                <p className="font-medium text-ink">{item.name}</p>
                                {item.model && <p className="text-xs text-muted">{item.model}</p>}
                              </td>
                              <td className="px-4 py-4 text-right text-muted font-medium text-sm">
                                ₹{effPrice.toFixed(2)}
                                <span className="block text-[10px] text-muted/70 font-normal">
                                  Base ₹{item.unit_price.toFixed(2)}{item.tax ? ` + Tax` : ''}{hasDiscount ? ` (Disc)` : ''}
                                </span>
                              </td>
                              <td className="px-4 py-4 text-right text-muted text-sm">
                                <div>{item.quantity} {item.unit}</div>
                                {returnedQty > 0 && (
                                  <div className="text-[11px] text-amber-600 font-medium">
                                    {returnedQty} returned
                                  </div>
                                )}
                              </td>
                              {activeTab === 'suppliers' && (
                                <td className="px-4 py-4 text-right text-sm">
                                  <span className={`px-2 py-0.5 rounded text-xs font-semibold ${availableStock > 0 ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' : 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300'}`}>
                                    {availableStock} in stock
                                  </span>
                                </td>
                              )}
                              <td className="px-4 py-4 text-right">
                                <input 
                                  type="number" 
                                  min="0" 
                                  step="any"
                                  max={maxReturnable} 
                                  disabled={maxReturnable <= 0}
                                  value={returnQty || ''} 
                                  onChange={(e) => handleQtyChange(itemKey, parseFloat(e.target.value) || 0, maxReturnable)}
                                  className="w-24 px-3 py-1.5 text-right font-semibold border border-hairline bg-surface text-ink rounded-lg focus:outline-none focus:ring-1 focus:ring-primary/20 focus:border-primary transition-all disabled:opacity-50"
                                  placeholder={maxReturnable <= 0 ? "Done" : "0"}
                                />
                              </td>
                              <td className="px-4 py-4 text-right font-bold text-ink text-sm">
                                ₹{(returnQty * effPrice).toFixed(2)}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  <div className="flex flex-col md:flex-row gap-6 items-stretch">
                    <div className="flex-1 flex flex-col gap-5">
                      <div>
                        <label className="block text-xs font-bold text-ink uppercase tracking-wider mb-2">Reason for Return (Optional)</label>
                        <input 
                          type="text" 
                          value={reason} 
                          onChange={e => setReason(e.target.value)} 
                          className="w-full px-4 py-2.5 bg-surface border border-hairline rounded-xl focus:outline-none focus:ring-1 focus:ring-primary/20 focus:border-primary transition-all text-ink text-sm shadow-sm" 
                          placeholder="e.g. Damaged, Wrong Item, Defective" 
                        />
                      </div>
                      
                      {selectedTx.entity_id > 0 ? (
                        <div>
                          <label className="block text-xs font-bold text-ink uppercase tracking-wider mb-2">
                            {activeTab === 'customers' ? 'Refund Method' : 'Settlement Method'}
                          </label>
                          <div className="grid grid-cols-2 gap-3">
                            <label className={`flex items-center gap-3 p-3 border rounded-xl cursor-pointer transition-all ${refundMethod === 'credit' ? 'border-primary bg-primary/10 ring-1 ring-primary' : 'border-hairline bg-surface hover:border-hairline/80'}`}>
                              <input 
                                type="radio" 
                                name="refundMethod" 
                                value="credit" 
                                checked={refundMethod === 'credit'} 
                                onChange={() => setRefundMethod('credit')}
                                className="w-4 h-4 text-primary focus:ring-primary"
                              />
                              <span className="text-ink font-medium text-sm">
                                {activeTab === 'customers' 
                                  ? 'Credit to Customer Account (Add Credit)' 
                                  : 'Debit Supplier Account (Reduce Payable / Advance)'}
                              </span>
                            </label>
                            <label className={`flex items-center gap-3 p-3 border rounded-xl cursor-pointer transition-all ${refundMethod === 'cash' ? 'border-primary bg-primary/10 ring-1 ring-primary' : 'border-hairline bg-surface hover:border-hairline/80'}`}>
                              <input 
                                type="radio" 
                                name="refundMethod" 
                                value="cash" 
                                checked={refundMethod === 'cash'} 
                                onChange={() => setRefundMethod('cash')}
                                className="w-4 h-4 text-primary focus:ring-primary"
                              />
                              <span className="text-ink font-medium text-sm">
                                {activeTab === 'customers'
                                  ? 'Immediate Cash / UPI Refund'
                                  : 'Cash Received from Supplier'}
                              </span>
                            </label>
                          </div>
                        </div>
                      ) : (
                        <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3 text-amber-700 dark:text-amber-300 text-xs font-medium">
                          Method: <strong>Immediate Cash / UPI</strong> (Walk-in Customer has no ledger account)
                        </div>
                      )}
                    </div>
                    <div className="bg-surface-soft p-6 rounded-xl border border-hairline shadow-inner flex flex-col justify-center items-center min-w-[220px]">
                      <p className="text-xs uppercase font-bold text-muted tracking-wider mb-1">
                        {activeTab === 'customers' ? 'Total Refund' : 'Total Settlement'}
                      </p>
                      <p className="text-3xl font-bold text-primary">₹{totalRefundAmount.toFixed(2)}</p>
                    </div>
                  </div>

                </div>
              )}
            </div>

            <div className="p-6 border-t border-hairline flex justify-end gap-3 bg-surface mt-auto">
              <button 
                type="button" 
                onClick={() => setIsModalOpen(false)} 
                className="px-6 py-2.5 text-muted font-medium hover:bg-surface-soft rounded-xl transition-colors text-sm"
              >
                Cancel
              </button>
              {selectedTx && (
                <button 
                  onClick={handleSubmitReturn} 
                  disabled={isProcessing || totalRefundAmount === 0}
                  className="px-8 py-2.5 bg-primary hover:bg-primary-active disabled:bg-slate-300 disabled:text-slate-500 disabled:cursor-not-allowed text-on-primary font-bold rounded-xl shadow-md transition-all flex items-center text-sm"
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
