import { useState, useEffect } from 'react';
import { X, Users, Truck, RotateCcw } from 'lucide-react';
import { getProducts, getCustomers, getSuppliers, getReturns, recordReturn } from '../lib/db';
import type { Product, Customer, Supplier, ReturnRecord } from '../lib/db';

export default function Returns() {
  const [activeTab, setActiveTab] = useState<'customers' | 'suppliers'>('customers');
  
  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [returns, setReturns] = useState<ReturnRecord[]>([]);
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  // Form State
  const [entityId, setEntityId] = useState<number | ''>('');
  const [productId, setProductId] = useState<number | ''>('');
  const [quantity, setQuantity] = useState<number | ''>('');
  const [amount, setAmount] = useState<number | ''>('');
  const [reason, setReason] = useState('');

  useEffect(() => {
    loadData();
  }, [activeTab]);

  async function loadData() {
    try {
      setProducts(await getProducts());
      if (activeTab === 'customers') {
        setCustomers(await getCustomers());
      } else {
        setSuppliers(await getSuppliers());
      }
      const entityType = activeTab === 'customers' ? 'customer' : 'supplier';
      setReturns(await getReturns(entityType));
    } catch (e) {
      console.error(e);
    }
  }

  async function handleRecordReturn(e: React.FormEvent) {
    e.preventDefault();
    if (entityId === '' || productId === '' || quantity === '' || amount === '') return;
    
    // Logic Loophole Fix: Prevent negative stock on Supplier Returns
    if (activeTab === 'suppliers') {
      const selectedProduct = products.find(p => p.id === Number(productId));
      if (selectedProduct && Number(quantity) > selectedProduct.stock_quantity) {
        alert(`Loophole prevented: You cannot return more stock to a supplier than you currently have! (Available: ${selectedProduct.stock_quantity})`);
        return;
      }
    }
    
    setIsProcessing(true);
    try {
      const entityType = activeTab === 'customers' ? 'customer' : 'supplier';
      await recordReturn(
        entityType,
        Number(entityId),
        Number(productId),
        Number(quantity),
        Number(amount),
        reason
      );
      
      alert('Return recorded successfully! Stock and balances updated.');
      setIsModalOpen(false);
      setEntityId('');
      setProductId('');
      setQuantity('');
      setAmount('');
      setReason('');
      loadData();
    } catch (error) {
      console.error(error);
      alert(`Error recording return: ${error}`);
    } finally {
      setIsProcessing(false);
    }
  }

  const getProductName = (id: number) => products.find(p => p.id === id)?.name || 'Unknown Product';
  const getEntityName = (id: number) => {
    if (activeTab === 'customers') return customers.find(c => c.id === id)?.name || 'Unknown';
    return suppliers.find(s => s.id === id)?.name || 'Unknown';
  };

  return (
    <div className="p-8 h-full flex flex-col relative bg-slate-50">
      <header className="mb-6 flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-slate-800 tracking-tight">Returns Management</h1>
          <p className="text-slate-500 mt-1">Manage Sales Returns (Customer to Us) and Purchase Returns (Us to Supplier)</p>
        </div>
        <button 
          onClick={() => setIsModalOpen(true)}
          className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-xl font-semibold shadow-sm hover:shadow flex items-center transition-all"
        >
          <RotateCcw className="w-5 h-5 mr-2" />
          Record Return
        </button>
      </header>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 flex-1 flex flex-col overflow-hidden">
        {/* Tabs */}
        <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-slate-50/50">
          <div className="flex gap-2">
            <button 
              onClick={() => setActiveTab('customers')}
              className={`px-5 py-2.5 rounded-lg font-bold flex items-center transition-all ${activeTab === 'customers' ? 'bg-white text-emerald-600 shadow-sm border border-slate-200' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100'}`}
            >
              <Users className="w-4 h-4 mr-2" />
              Sales Returns (From Customers)
            </button>
            <button 
              onClick={() => setActiveTab('suppliers')}
              className={`px-5 py-2.5 rounded-lg font-bold flex items-center transition-all ${activeTab === 'suppliers' ? 'bg-white text-orange-600 shadow-sm border border-slate-200' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100'}`}
            >
              <Truck className="w-4 h-4 mr-2" />
              Purchase Returns (To Suppliers)
            </button>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto flex-1">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/80 backdrop-blur-sm border-b border-slate-200 text-slate-500 text-xs font-bold uppercase tracking-wider sticky top-0 z-10">
                <th className="px-6 py-4">{activeTab === 'customers' ? 'Customer' : 'Supplier'}</th>
                <th className="px-6 py-4">Product</th>
                <th className="px-6 py-4 text-center">Qty</th>
                <th className="px-6 py-4 text-right">Refund Amount (₹)</th>
                <th className="px-6 py-4">Reason</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {returns.map((ret) => (
                <tr key={ret.id} className="hover:bg-slate-50/50 transition-colors border-b border-slate-50 last:border-0">
                  <td className="px-6 py-4 font-bold text-slate-800">
                    {getEntityName(ret.entity_id)}
                  </td>
                  <td className="px-6 py-4 text-slate-700 font-medium">
                    {getProductName(ret.product_id)}
                  </td>
                  <td className="px-6 py-4 text-center font-bold text-slate-700">
                    {ret.quantity}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <span className={`font-bold ${activeTab === 'customers' ? 'text-red-600' : 'text-emerald-600'}`}>
                      {activeTab === 'customers' ? '-' : '+'}₹{ret.amount.toFixed(2)}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-slate-500 text-sm">
                    {ret.reason || '-'}
                  </td>
                </tr>
              ))}
              {returns.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-16 text-center text-slate-500">
                    <div className="flex flex-col items-center justify-center">
                      <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mb-4">
                        <RotateCcw className="w-8 h-8 text-slate-300" />
                      </div>
                      <p className="font-medium text-slate-600">No returns found in this category.</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Return Modal */}
      {isModalOpen && (
        <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden border border-slate-200 animate-in fade-in zoom-in duration-200">
            <div className={`px-6 py-5 border-b border-slate-100 flex justify-between items-center ${activeTab === 'customers' ? 'bg-emerald-50' : 'bg-orange-50'}`}>
              <div>
                <h2 className="text-lg font-bold text-slate-800">
                  Record {activeTab === 'customers' ? 'Sales Return' : 'Purchase Return'}
                </h2>
              </div>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600 transition-colors bg-white rounded-full p-1 shadow-sm">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <form onSubmit={handleRecordReturn} className="p-6 flex flex-col gap-4">
              
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                  {activeTab === 'customers' ? 'Select Customer *' : 'Select Supplier *'}
                </label>
                <select 
                  required
                  value={entityId} 
                  onChange={e => setEntityId(e.target.value === '' ? '' : Number(e.target.value))} 
                  className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium text-slate-800"
                >
                  <option value="">-- Select --</option>
                  {activeTab === 'customers' 
                    ? customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)
                    : suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)
                  }
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Product Returned *</label>
                <select 
                  required
                  value={productId} 
                  onChange={e => setProductId(e.target.value === '' ? '' : Number(e.target.value))} 
                  className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium text-slate-800"
                >
                  <option value="">-- Select Product --</option>
                  {products.map(p => <option key={p.id} value={p.id}>{p.name} (Stock: {p.stock_quantity})</option>)}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Quantity *</label>
                  <input 
                    required 
                    type="number" 
                    min="1"
                    value={quantity} 
                    onChange={e => setQuantity(e.target.value === '' ? '' : Number(e.target.value))} 
                    className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium text-slate-800"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Refund Amount (₹) *</label>
                  <input 
                    required 
                    type="number" 
                    step="0.01"
                    min="0"
                    value={amount} 
                    onChange={e => setAmount(e.target.value === '' ? '' : Number(e.target.value))} 
                    className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium text-slate-800" 
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Reason</label>
                <textarea 
                  rows={2} 
                  value={reason} 
                  onChange={e => setReason(e.target.value)} 
                  className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none font-medium text-slate-800 placeholder-slate-400" 
                  placeholder="Defective, damaged, etc..." 
                />
              </div>
              
              <div className="mt-2 pt-4 border-t border-slate-100">
                <button 
                  type="submit" 
                  disabled={isProcessing || entityId === '' || productId === '' || quantity === '' || amount === ''}
                  className={`w-full py-3 rounded-xl font-bold text-lg flex items-center justify-center transition-all shadow-md
                    ${isProcessing || entityId === '' || productId === '' || quantity === '' || amount === ''
                      ? 'bg-slate-200 text-slate-400 shadow-none cursor-not-allowed' 
                      : 'bg-blue-600 hover:bg-blue-700 text-white shadow-blue-500/20'}`}
                >
                  {isProcessing ? 'Processing...' : 'Confirm Return'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
