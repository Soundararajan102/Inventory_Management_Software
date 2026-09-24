import { useState, useEffect } from 'react';
import { Search, Plus, Minus, X, Truck, FileText, IndianRupee } from 'lucide-react';
import { getProducts, getSuppliers, recordPurchase } from '../lib/db';
import type { Product, Supplier, PurchaseItem } from '../lib/db';

export default function Purchases() {
  const [search, setSearch] = useState('');
  const [products, setProducts] = useState<Product[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  
  const [cart, setCart] = useState<PurchaseItem[]>([]);
  const [supplierId, setSupplierId] = useState<number | ''>('');
  const [invoiceNo, setInvoiceNo] = useState('');
  
  const [discount, setDiscount] = useState<number>(0);
  const [discountType, setDiscountType] = useState<'amount' | 'percentage'>('amount');
  const [isGstEnabled, setIsGstEnabled] = useState(true);
  const [paidAmount, setPaidAmount] = useState<number>(0);
  
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      setProducts(await getProducts());
      setSuppliers(await getSuppliers());
    } catch (e) {
      console.error(e);
    }
  }

  const filteredProducts = search.trim() === '' 
    ? [] 
    : products.filter(p => p.name.toLowerCase().includes(search.toLowerCase()) || (p.model && p.model.toLowerCase().includes(search.toLowerCase())));

  function addToCart(product: Product) {
    setCart(prev => {
      const existing = prev.find(item => item.id === product.id);
      if (existing) {
        return prev.map(item => 
          item.id === product.id ? { ...item, purchase_qty: item.purchase_qty + 1 } : item
        );
      }
      return [...prev, { ...product, purchase_qty: 1 }];
    });
    setSearch('');
  }

  function adjustQty(id: number, delta: number) {
    setCart(prev => prev.map(item => {
      if (item.id === id) {
        return { ...item, purchase_qty: Math.max(1, item.purchase_qty + delta) };
      }
      return item;
    }));
  }

  function updateRate(id: number, newRate: number) {
    setCart(prev => prev.map(item => {
      if (item.id === id) {
        return { ...item, purchase_price: newRate };
      }
      return item;
    }));
  }

  function removeFromCart(id: number) {
    setCart(prev => prev.filter(item => item.id !== id));
  }

  const subtotal = cart.reduce((sum, item) => sum + (item.purchase_price * item.purchase_qty), 0);
  const tax = isGstEnabled ? subtotal * 0.18 : 0; // Simple 18% assumption for demo
  const discountAmount = discountType === 'percentage' ? (subtotal * discount) / 100 : discount;
  const grandTotal = Math.max(0, subtotal + tax - discountAmount);

  // Auto-fill paid amount with grand total if they want to pay in full
  function payInFull() {
    setPaidAmount(Number(grandTotal.toFixed(2)));
  }

  async function handleRecord() {
    if (cart.length === 0 || supplierId === '' || invoiceNo.trim() === '') {
      alert("Please select a supplier, enter an invoice number, and add items.");
      return;
    }
    
    setIsProcessing(true);
    try {
      await recordPurchase(
        Number(supplierId), 
        invoiceNo, 
        cart, 
        subtotal, 
        tax, 
        discountAmount, 
        grandTotal, 
        paidAmount
      );
      
      alert('Purchase recorded successfully! Stock and Supplier Balance updated.');
      
      // Reset Form
      setCart([]);
      setSupplierId('');
      setInvoiceNo('');
      setDiscount(0);
      setDiscountType('amount');
      setIsGstEnabled(true);
      setPaidAmount(0);
      loadData();
    } catch (error) {
      console.error(error);
      alert(`Failed to record purchase: ${error}`);
    } finally {
      setIsProcessing(false);
    }
  }

  return (
    <div className="flex h-full bg-slate-50">
      {/* Left: Product Search */}
      <div className="flex-1 flex flex-col p-8 border-r border-slate-200 overflow-hidden">
        <header className="mb-8">
          <h1 className="text-3xl font-bold text-slate-800 tracking-tight">Purchase Invoice</h1>
          <p className="text-slate-500 mt-1">Record items bought from suppliers to update stock.</p>
        </header>

        <div className="relative w-full max-w-2xl mx-auto z-20">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 w-6 h-6" />
            <input 
              type="text" 
              placeholder="Search products to add to purchase..." 
              className="w-full pl-14 pr-4 py-4 text-lg bg-white border border-slate-200 rounded-2xl shadow-sm focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all text-slate-800 placeholder-slate-400"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {search.trim() !== '' && (
            <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-slate-200 rounded-xl shadow-2xl max-h-96 overflow-y-auto">
              {filteredProducts.length > 0 ? (
                <ul className="divide-y divide-slate-100 p-2">
                  {filteredProducts.map(p => (
                    <li 
                      key={p.id} 
                      onClick={() => addToCart(p)}
                      className="p-3 hover:bg-slate-50 rounded-lg cursor-pointer flex justify-between items-center transition-colors"
                    >
                      <div>
                        <div className="font-semibold text-slate-800">{p.name}</div>
                        <div className="text-sm text-slate-500">Current Stock: {p.stock_quantity}</div>
                      </div>
                      <div className="font-bold text-slate-800">₹{p.purchase_price.toFixed(2)}</div>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="p-6 text-center text-slate-500">No products found</div>
              )}
            </div>
          )}
        </div>

        {search.trim() === '' && cart.length === 0 && (
           <div className="flex-1 flex flex-col items-center justify-center text-slate-400 pb-20">
             <div className="w-24 h-24 bg-slate-100 rounded-full flex items-center justify-center mb-4">
                <FileText className="w-10 h-10 text-slate-300" />
             </div>
             <p>Start typing to search for products to purchase</p>
           </div>
        )}
      </div>

      {/* Right: Purchase Details & Cart */}
      <div className="w-[450px] bg-white flex flex-col shadow-2xl z-10 relative border-l border-slate-200">
        <div className="p-6 border-b border-slate-100 bg-slate-50/50 backdrop-blur-sm space-y-4">
          
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5 flex items-center"><Truck className="w-3.5 h-3.5 mr-1" /> Supplier *</label>
            <select 
              value={supplierId} 
              onChange={e => setSupplierId(e.target.value === '' ? '' : Number(e.target.value))}
              className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium text-slate-800"
            >
              <option value="">-- Select Supplier --</option>
              {suppliers.map(s => (
                <option key={s.id} value={s.id}>{s.name} (Bal: ₹{s.balance.toFixed(2)})</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5 flex items-center"><FileText className="w-3.5 h-3.5 mr-1" /> Invoice No *</label>
            <input 
              type="text" 
              value={invoiceNo}
              onChange={e => setInvoiceNo(e.target.value)}
              placeholder="e.g. INV-1001"
              className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium text-slate-800 uppercase"
            />
          </div>

        </div>
        
        {/* Cart Items */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50/30">
          {cart.map((item) => (
            <div key={item.id} className="bg-white border border-slate-100 p-4 rounded-xl shadow-sm group">
              <div className="flex justify-between items-start mb-3">
                <div className="flex-1 pr-2">
                  <h3 className="text-sm font-bold text-slate-800 leading-tight">{item.name}</h3>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-slate-800">₹{(item.purchase_price * item.purchase_qty).toFixed(2)}</span>
                  <button onClick={() => removeFromCart(item.id)} className="text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
              
              <div className="flex items-center justify-between mt-2 gap-4">
                <div className="flex items-center bg-slate-50 border border-slate-200 rounded-lg p-0.5">
                  <button onClick={() => adjustQty(item.id, -1)} className="p-1 hover:bg-white hover:shadow-sm rounded-md text-slate-500"><Minus className="w-4 h-4" /></button>
                  <span className="w-10 text-center text-sm font-semibold text-slate-700">{item.purchase_qty}</span>
                  <button onClick={() => adjustQty(item.id, 1)} className="p-1 hover:bg-white hover:shadow-sm rounded-md text-slate-500"><Plus className="w-4 h-4" /></button>
                </div>
                
                <div className="flex items-center border-b border-slate-200 pb-0.5">
                  <span className="text-slate-400 text-sm mr-1">₹</span>
                  <input 
                    type="number" 
                    value={item.purchase_price === 0 ? '' : item.purchase_price}
                    onChange={(e) => updateRate(item.id, Number(e.target.value) || 0)}
                    className="w-16 text-right bg-transparent focus:outline-none font-medium text-slate-800 text-sm"
                    title="Purchase Rate"
                  />
                  <span className="text-slate-400 text-xs ml-1">/ {item.unit}</span>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Totals & Submit */}
        <div className="p-6 border-t border-slate-200 bg-white">
          <div className="space-y-3 mb-6">
            <div className="flex justify-between text-sm text-slate-600">
              <span>Subtotal</span>
              <span className="font-medium text-slate-800">₹{subtotal.toFixed(2)}</span>
            </div>
            <div className="flex justify-between items-center text-sm text-slate-600">
              <div className="flex items-center gap-2">
                <span>GST (18%)</span>
                <button 
                  onClick={() => setIsGstEnabled(!isGstEnabled)}
                  className={`relative inline-flex h-4 w-7 items-center rounded-full transition-colors ${isGstEnabled ? 'bg-purple-500' : 'bg-slate-300'}`}
                  title="Toggle GST"
                >
                  <span className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${isGstEnabled ? 'translate-x-3.5' : 'translate-x-0.5'}`} />
                </button>
              </div>
              <span className="font-medium text-slate-800">₹{tax.toFixed(2)}</span>
            </div>
            
            <div className="flex justify-between items-center text-sm text-slate-600 py-1">
              <span>Discount</span>
              <div className="flex items-center gap-1">
                <button 
                  onClick={() => setDiscountType(prev => prev === 'amount' ? 'percentage' : 'amount')}
                  className="text-xs font-bold bg-slate-100 text-slate-500 hover:text-slate-700 px-1.5 py-0.5 rounded select-none"
                >
                  {discountType === 'amount' ? '₹' : '%'}
                </button>
                <input 
                  type="number" min="0" 
                  max={discountType === 'percentage' ? 100 : undefined}
                  value={discount === 0 ? '' : discount}
                  onChange={(e) => setDiscount(Number(e.target.value) || 0)}
                  placeholder="0"
                  className="w-16 text-center border-b-2 border-slate-200 bg-transparent py-0.5 focus:outline-none font-medium text-slate-800"
                />
              </div>
            </div>

            <div className="flex justify-between items-end border-t border-slate-100 pt-3 mt-3">
              <span className="text-slate-800 font-bold">Grand Total</span>
              <span className="text-2xl font-black text-slate-800 tracking-tight leading-none">₹{grandTotal.toFixed(2)}</span>
            </div>
            
            <div className="flex justify-between items-center text-sm text-slate-600 pt-2 border-t border-dashed border-slate-200 mt-2">
              <span className="font-bold text-slate-700">Amount Paid Now</span>
              <div className="flex items-center gap-2">
                <button onClick={payInFull} className="text-xs text-blue-600 font-bold hover:underline">Pay Full</button>
                <div className="flex items-center border border-slate-300 rounded-lg px-2 py-1 bg-slate-50">
                  <span className="text-slate-400 font-medium">₹</span>
                  <input 
                    type="number" min="0" max={grandTotal}
                    value={paidAmount === 0 ? '' : paidAmount}
                    onChange={(e) => setPaidAmount(Number(e.target.value) || 0)}
                    placeholder="0"
                    className="w-20 text-right bg-transparent focus:outline-none font-bold text-blue-700"
                  />
                </div>
              </div>
            </div>
            {paidAmount < grandTotal && grandTotal > 0 && (
              <div className="text-right text-xs text-orange-600 font-semibold mt-1">
                Balance ₹{(grandTotal - paidAmount).toFixed(2)} will be added to Supplier.
              </div>
            )}
          </div>

          <button 
            onClick={handleRecord}
            disabled={cart.length === 0 || supplierId === '' || invoiceNo.trim() === '' || isProcessing}
            className={`w-full text-white font-bold py-3.5 rounded-xl flex justify-center items-center text-lg transition-all shadow-lg ${cart.length === 0 || supplierId === '' || invoiceNo.trim() === '' || isProcessing ? 'bg-slate-300 shadow-none cursor-not-allowed' : 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 shadow-blue-500/20 hover:-translate-y-0.5'}`}
          >
            <IndianRupee className="w-5 h-5 mr-2" /> {isProcessing ? 'Processing...' : 'Record Purchase'}
          </button>
        </div>
      </div>
    </div>
  );
}
