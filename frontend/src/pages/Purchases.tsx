import { useState, useEffect } from 'react';
import { Search, Plus, Minus, X, Truck, FileText, IndianRupee } from 'lucide-react';
import { getSellableProducts, getSuppliers, recordPurchase } from '../lib/db';
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
  const [paidAmount, setPaidAmount] = useState<number>(0);
  
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      setProducts(await getSellableProducts());
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
  const tax = cart.reduce((sum, item) => sum + (item.purchase_price * item.purchase_qty * ((item.gst_percentage || 0) / 100)), 0);
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
    <div className="flex h-full bg-canvas">
      {/* Left: Product Search */}
      <div className="flex-1 flex flex-col p-8 border-r border-hairline overflow-hidden">
        <header className="mb-8">
          <h1 className="text-4xl font-display font-medium text-ink tracking-tight">Purchase Invoice</h1>
          <p className="text-base text-body mt-2">Record items bought from suppliers to update stock.</p>
        </header>

        <div className="relative w-full max-w-2xl mx-auto z-20">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-muted w-5 h-5" />
            <input 
              type="text" 
              placeholder="Search products to add to purchase..." 
              className="w-full pl-12 pr-4 py-3 text-base bg-canvas border border-hairline rounded-sm shadow-none focus:outline-none focus:border-ink transition-colors text-ink placeholder-muted"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {search.trim() !== '' && (
            <div className="absolute top-full left-0 right-0 mt-2 bg-canvas border border-hairline rounded-lg shadow-xl max-h-96 overflow-y-auto">
              {filteredProducts.length > 0 ? (
                <ul className="divide-y divide-hairline p-2">
                  {filteredProducts.map(p => (
                    <li 
                      key={p.id} 
                      onClick={() => addToCart(p)}
                      className="p-3 hover:bg-surface-soft rounded-md cursor-pointer flex justify-between items-center transition-colors"
                    >
                      <div>
                        <div className="font-medium text-ink">{p.name}</div>
                        <div className="text-sm text-muted">Current Stock: {p.stock_quantity}</div>
                      </div>
                      <div className="font-medium text-ink">₹{p.purchase_price.toFixed(2)}</div>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="p-6 text-center text-muted">No products found</div>
              )}
            </div>
          )}
        </div>

        {search.trim() === '' && cart.length === 0 && (
           <div className="flex-1 flex flex-col items-center justify-center text-muted pb-20">
             <div className="w-16 h-16 bg-surface-soft border border-hairline rounded-full flex items-center justify-center mb-4">
                <FileText className="w-6 h-6 text-muted" />
             </div>
             <p className="font-medium">Start typing to search for products to purchase</p>
           </div>
        )}
      </div>

      {/* Right: Purchase Details & Cart */}
      <div className="w-[450px] bg-canvas flex flex-col z-10 relative border-l border-hairline">
        <div className="p-6 border-b border-hairline bg-surface-soft space-y-4">
          
          <div>
            <label className="block text-xs font-medium text-muted uppercase tracking-wider mb-2 flex items-center"><Truck className="w-3.5 h-3.5 mr-1" /> Supplier *</label>
            <select 
              value={supplierId} 
              onChange={e => setSupplierId(e.target.value === '' ? '' : Number(e.target.value))}
              className="w-full px-3 py-2 bg-canvas border border-hairline rounded-sm focus:outline-none focus:border-ink font-medium text-ink text-sm"
            >
              <option value="">-- Select Supplier --</option>
              {suppliers.map(s => (
                <option key={s.id} value={s.id}>{s.name} (Bal: ₹{s.balance.toFixed(2)})</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-muted uppercase tracking-wider mb-2 flex items-center"><FileText className="w-3.5 h-3.5 mr-1" /> Invoice No *</label>
            <input 
              type="text" 
              value={invoiceNo}
              onChange={e => setInvoiceNo(e.target.value)}
              placeholder="e.g. INV-1001"
              className="w-full px-3 py-2 bg-canvas border border-hairline rounded-sm focus:outline-none focus:border-ink font-medium text-ink uppercase text-sm placeholder-muted"
            />
          </div>

        </div>
        
        {/* Cart Items */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-canvas">
          {cart.map((item) => (
            <div key={item.id} className="bg-canvas border border-hairline p-4 rounded-lg shadow-none group">
              <div className="flex justify-between items-start mb-3">
                <div className="flex-1 pr-2">
                  <h3 className="text-sm font-medium text-ink leading-tight">{item.name}</h3>
                  <div className="text-xs text-muted mt-1">
                    <span className="text-primary font-medium">GST: {item.gst_percentage || 0}%</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-medium text-ink text-sm">₹{(item.purchase_price * item.purchase_qty).toFixed(2)}</span>
                  <button onClick={() => removeFromCart(item.id)} className="text-muted hover:text-ink opacity-0 group-hover:opacity-100 transition-opacity">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
              
              <div className="flex items-center justify-between mt-2 gap-4">
                <div className="flex items-center bg-canvas border border-hairline rounded-sm p-0.5">
                  <button onClick={() => adjustQty(item.id, -1)} className="p-1 hover:bg-surface-soft rounded-xs text-muted transition-colors"><Minus className="w-3 h-3" /></button>
                  <span className="w-8 text-center text-xs font-medium text-ink">{item.purchase_qty}</span>
                  <button onClick={() => adjustQty(item.id, 1)} className="p-1 hover:bg-surface-soft rounded-xs text-muted transition-colors"><Plus className="w-3 h-3" /></button>
                </div>
                
                <div className="flex items-center border-b border-hairline pb-0.5 focus-within:border-ink transition-colors">
                  <span className="text-muted text-sm mr-1">₹</span>
                  <input 
                    type="number" 
                    value={item.purchase_price === 0 ? '' : item.purchase_price}
                    onChange={(e) => updateRate(item.id, Number(e.target.value) || 0)}
                    className="w-16 text-right bg-transparent focus:outline-none font-medium text-ink text-sm"
                    title="Purchase Rate"
                  />
                  <span className="text-muted text-xs ml-1">/ {item.unit}</span>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Totals & Submit */}
        <div className="p-6 border-t border-hairline bg-canvas">
          <div className="space-y-4 mb-6">
            <div className="flex justify-between text-sm text-body">
              <span>Subtotal</span>
              <span className="font-medium text-ink">₹{subtotal.toFixed(2)}</span>
            </div>
            <div className="flex justify-between items-center text-sm text-body">
              <span>Tax (GST)</span>
              <span className="font-medium text-ink">₹{tax.toFixed(2)}</span>
            </div>
            
            <div className="flex justify-between items-center text-sm text-body py-1">
              <span>Discount</span>
              <div className="flex items-center gap-2">
                <button 
                  onClick={() => setDiscountType(prev => prev === 'amount' ? 'percentage' : 'amount')}
                  className="text-xs font-medium bg-surface-soft border border-hairline text-ink hover:bg-canvas px-1.5 py-0.5 rounded-xs transition-colors select-none"
                >
                  {discountType === 'amount' ? '₹' : '%'}
                </button>
                <input 
                  type="number" min="0" 
                  max={discountType === 'percentage' ? 100 : undefined}
                  value={discount === 0 ? '' : discount}
                  onChange={(e) => setDiscount(Number(e.target.value) || 0)}
                  placeholder="0"
                  className="w-16 text-right border-b border-hairline bg-transparent py-0.5 focus:outline-none focus:border-ink font-medium text-ink transition-colors"
                />
              </div>
            </div>

            <div className="flex justify-between items-end border-t border-hairline pt-4 mt-4">
              <span className="text-ink font-medium">Grand Total</span>
              <span className="text-3xl font-display text-ink tracking-tight leading-none">₹{grandTotal.toFixed(2)}</span>
            </div>
            
            <div className="flex justify-between items-center text-sm text-body pt-2 border-t border-hairline mt-2">
              <span className="font-medium text-ink">Amount Paid Now</span>
              <div className="flex items-center gap-2">
                <button onClick={payInFull} className="text-xs text-primary font-medium hover:underline">Pay Full</button>
                <div className="flex items-center border-b border-hairline bg-transparent focus-within:border-ink transition-colors">
                  <span className="text-muted font-medium mr-1">₹</span>
                  <input 
                    type="number" min="0" max={grandTotal}
                    value={paidAmount === 0 ? '' : paidAmount}
                    onChange={(e) => setPaidAmount(Number(e.target.value) || 0)}
                    placeholder="0"
                    className="w-20 text-right bg-transparent focus:outline-none font-medium text-ink py-0.5"
                  />
                </div>
              </div>
            </div>
            {paidAmount < grandTotal && grandTotal > 0 && (
              <div className="text-right text-xs text-signature-coral font-medium mt-1">
                Balance ₹{(grandTotal - paidAmount).toFixed(2)} will be added to Supplier.
              </div>
            )}
          </div>

          <button 
            onClick={handleRecord}
            disabled={cart.length === 0 || supplierId === '' || invoiceNo.trim() === '' || isProcessing}
            className={`w-full font-medium py-3 rounded-lg flex justify-center items-center text-base transition-colors ${cart.length === 0 || supplierId === '' || invoiceNo.trim() === '' || isProcessing ? 'bg-surface-strong text-muted cursor-not-allowed' : 'bg-primary hover:bg-primary-active text-on-primary'}`}
          >
            <IndianRupee className="w-4 h-4 mr-2" /> {isProcessing ? 'Processing...' : 'Record Purchase'}
          </button>
        </div>
      </div>
    </div>
  );
}
