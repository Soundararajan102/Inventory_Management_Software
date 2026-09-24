import { useState, useEffect } from 'react';
import { Search, Printer, IndianRupee, X, Plus, Minus, ShoppingCart, User } from 'lucide-react';
import { getProducts, getCustomers, recordSale } from '../lib/db';
import type { Product, CartItem, Customer } from '../lib/db';

export default function POS() {
  const [search, setSearch] = useState('');
  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  
  const [cart, setCart] = useState<CartItem[]>([]);
  const [discount, setDiscount] = useState<number>(0);
  const [discountType, setDiscountType] = useState<'amount' | 'percentage'>('amount');
  const [isGstEnabled, setIsGstEnabled] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  
  const [customerId, setCustomerId] = useState<number | ''>('');
  const [paidAmount, setPaidAmount] = useState<number | ''>('');

  useEffect(() => {
    loadProducts();
  }, []);

  async function loadProducts() {
    try {
      const data = await getProducts();
      setProducts(data);
      const custData = await getCustomers();
      setCustomers(custData);
    } catch (error) {
      console.error("Failed to load products/customers", error);
    }
  }

  const filteredProducts = search.trim() === '' 
    ? [] 
    : products.filter(p => p.name.toLowerCase().includes(search.toLowerCase()) || (p.model && p.model.toLowerCase().includes(search.toLowerCase())));

  function addToCart(product: Product) {
    if (product.stock_quantity <= 0) {
      alert('This product is out of stock!');
      return;
    }
    setCart(prev => {
      const existing = prev.find(item => item.id === product.id);
      if (existing) {
        if (existing.cart_qty >= product.stock_quantity) {
          alert('Cannot add more than available stock!');
          return prev;
        }
        return prev.map(item => 
          item.id === product.id ? { ...item, cart_qty: item.cart_qty + 1 } : item
        );
      }
      return [...prev, { ...product, cart_qty: 1 }];
    });
    setSearch('');
  }

  function adjustQty(id: number, delta: number) {
    setCart(prev => prev.map(item => {
      if (item.id === id) {
        // Ensure quantity doesn't exceed stock and doesn't go below 1
        const newQty = Math.min(item.stock_quantity, Math.max(1, item.cart_qty + delta));
        return { ...item, cart_qty: newQty };
      }
      return item;
    }));
  }

  function removeFromCart(id: number) {
    setCart(prev => prev.filter(item => item.id !== id));
  }

  async function handleCheckout() {
    if (cart.length === 0) return;
    setIsProcessing(true);
    try {
      const finalCustomerId = customerId === '' ? null : Number(customerId);
      const finalPaidAmount = paidAmount === '' ? grandTotal : Number(paidAmount);
      
      await recordSale(
        cart, 
        subtotal, 
        tax, 
        discountAmount, 
        grandTotal, 
        finalPaidAmount, 
        'Cash', 
        finalCustomerId
      );
      alert('Sale recorded successfully!');
      setCart([]);
      setDiscount(0);
      setDiscountType('amount');
      setIsGstEnabled(true);
      setCustomerId('');
      setPaidAmount('');
      loadProducts(); // refresh stock limits and customer balances
    } catch (error) {
      console.error("Checkout failed", error);
      alert(`Error during checkout: ${error}`);
    } finally {
      setIsProcessing(false);
    }
  }

  const subtotal = cart.reduce((sum, item) => sum + (item.selling_price * item.cart_qty), 0);
  const tax = isGstEnabled ? subtotal * 0.18 : 0; // Flat 18% GST example
  const discountAmount = discountType === 'percentage' ? (subtotal * discount) / 100 : discount;
  const grandTotal = Math.max(0, subtotal + tax - discountAmount);

  return (
    <div className="flex h-full bg-canvas">
      
      {/* Left Side: Product Selection & Search */}
      <div className="flex-1 flex flex-col p-8 border-r border-hairline overflow-hidden">
        <header className="mb-8">
          <h1 className="text-4xl font-display font-medium text-ink tracking-tight">Point of Sale</h1>
          <p className="text-base text-body mt-2">Search products to add to the current bill.</p>
        </header>

        <div className="relative w-full max-w-2xl mx-auto z-20">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-muted w-5 h-5" />
            <input 
              type="text" 
              placeholder="Search products by name or model..." 
              className="w-full pl-12 pr-4 py-3 text-base bg-canvas border border-hairline rounded-sm shadow-none focus:outline-none focus:border-ink transition-colors text-ink placeholder-muted"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              autoFocus
            />
          </div>

          {/* Search Dropdown */}
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
                        <div className="text-sm text-muted">{p.model ? `${p.model} • ` : ''}Stock: {p.stock_quantity}</div>
                      </div>
                      <div className="font-medium text-ink">₹{p.selling_price.toFixed(2)}</div>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="p-6 text-center text-muted">
                  No products found matching "{search}"
                </div>
              )}
            </div>
          )}
        </div>
        
        {/* Empty State Illustration when not searching */}
        {search.trim() === '' && cart.length === 0 && (
           <div className="flex-1 flex flex-col items-center justify-center text-muted pb-20">
             <div className="w-16 h-16 bg-surface-soft border border-hairline rounded-full flex items-center justify-center mb-4">
                <Search className="w-6 h-6 text-muted" />
             </div>
             <p className="font-medium">Start typing to search for products</p>
           </div>
        )}
      </div>

      {/* Right Side: Cart & Invoice */}
      <div className="w-[420px] bg-canvas flex flex-col z-10 relative border-l border-hairline">
        <div className="p-6 border-b border-hairline bg-surface-soft">
          <div className="flex justify-between items-start">
            <div className="w-full">
              <h2 className="text-xl font-medium text-ink">Current Bill</h2>
              <div className="flex items-center gap-3 mt-4 w-full bg-canvas p-2 rounded-sm border border-hairline focus-within:border-ink transition-colors">
                <div className="bg-surface-soft p-1.5 rounded-sm">
                  <User className="w-4 h-4 text-muted" />
                </div>
                <select 
                  className="flex-1 bg-transparent text-sm outline-none text-ink font-medium cursor-pointer pr-2 appearance-none"
                  value={customerId}
                  onChange={(e) => setCustomerId(e.target.value === '' ? '' : Number(e.target.value))}
                >
                  <option value="">Walk-in (No Customer)</option>
                  {customers.map(c => (
                    <option key={c.id} value={c.id}>{c.name} {c.balance > 0 ? `(Owes: ₹${c.balance.toFixed(0)})` : ''}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        </div>
        
        {/* Cart Items */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-canvas">
          {cart.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-muted">
              <ShoppingCart className="w-10 h-10 mb-3 text-muted" />
              <p className="font-medium">Cart is empty</p>
            </div>
          ) : (
            cart.map((item) => (
              <div key={item.id} className="bg-canvas border border-hairline p-4 rounded-lg shadow-none group">
                <div className="flex justify-between items-start mb-3">
                  <div className="flex-1 pr-2">
                    <h3 className="text-sm font-medium text-ink leading-tight">{item.name}</h3>
                    <div className="text-xs text-muted mt-1">₹{item.selling_price.toFixed(2)} / {item.unit}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-ink text-sm">₹{(item.selling_price * item.cart_qty).toFixed(2)}</span>
                    <button 
                      onClick={() => removeFromCart(item.id)}
                      className="text-muted hover:text-ink opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                
                {/* Qty Controls */}
                <div className="flex items-center justify-start mt-2">
                  <div className="flex items-center bg-canvas border border-hairline rounded-sm p-0.5">
                    <button onClick={() => adjustQty(item.id, -1)} className="p-1 hover:bg-surface-soft rounded-xs text-muted transition-colors"><Minus className="w-3 h-3" /></button>
                    <span className="w-8 text-center text-xs font-medium text-ink">{item.cart_qty}</span>
                    <button onClick={() => adjustQty(item.id, 1)} className="p-1 hover:bg-surface-soft rounded-xs text-muted transition-colors"><Plus className="w-3 h-3" /></button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Totals & Checkout */}
        <div className="p-6 border-t border-hairline bg-canvas">
          <div className="space-y-4 mb-6">
            <div className="flex justify-between text-sm text-body">
              <span>Subtotal</span>
              <span className="font-medium text-ink">₹{subtotal.toFixed(2)}</span>
            </div>
            <div className="flex justify-between items-center text-sm text-body">
              <div className="flex items-center gap-2">
                <span>GST (18%)</span>
                <button 
                  onClick={() => setIsGstEnabled(!isGstEnabled)}
                  className={`relative inline-flex h-4 w-7 items-center rounded-full transition-colors ${isGstEnabled ? 'bg-primary' : 'bg-surface-strong'}`}
                  title="Toggle GST"
                >
                  <span className={`inline-block h-3 w-3 transform rounded-full bg-canvas transition-transform ${isGstEnabled ? 'translate-x-3.5' : 'translate-x-0.5'}`} />
                </button>
              </div>
              <span className="font-medium text-ink">₹{tax.toFixed(2)}</span>
            </div>
            <div className="flex justify-between items-center text-sm text-body py-1">
              <span>Discount</span>
              <div className="flex items-center gap-2">
                <button 
                  onClick={() => setDiscountType(prev => prev === 'amount' ? 'percentage' : 'amount')}
                  className="text-xs font-medium bg-surface-soft border border-hairline text-ink hover:bg-canvas px-1.5 py-0.5 rounded-xs transition-colors select-none"
                  title="Toggle discount type"
                >
                  {discountType === 'amount' ? '₹' : '%'}
                </button>
                <input 
                  type="number" 
                  min="0"
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
            
            <div className="flex justify-between items-center text-sm text-body pt-2 pb-1 border-t border-hairline mt-2">
              <span className="font-medium">Amount Paid</span>
              <div className="flex items-center">
                <span className="text-muted font-medium mr-1">₹</span>
                <input 
                  type="number" 
                  min="0"
                  max={grandTotal}
                  value={paidAmount === '' ? '' : paidAmount}
                  onChange={(e) => setPaidAmount(e.target.value === '' ? '' : Number(e.target.value))}
                  placeholder={grandTotal.toFixed(0)}
                  className="w-20 text-right border-b border-hairline bg-transparent py-0.5 focus:outline-none focus:border-ink font-medium text-ink transition-colors"
                />
              </div>
            </div>
            {Number(paidAmount !== '' ? paidAmount : grandTotal) < grandTotal && (
              <div className="flex justify-between items-center text-sm text-signature-coral font-medium pt-1">
                <span>Pending Balance</span>
                <span>₹{(grandTotal - Number(paidAmount)).toFixed(2)}</span>
              </div>
            )}
            {Number(paidAmount !== '' ? paidAmount : grandTotal) < grandTotal && customerId === '' && (
              <div className="text-xs text-signature-coral font-medium mt-1 text-right">
                *Must select a customer for partial payments
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <button 
              onClick={handleCheckout}
              disabled={cart.length === 0 || isProcessing}
              className={`col-span-2 font-medium py-3 rounded-lg flex justify-center items-center text-base transition-colors ${cart.length === 0 || isProcessing ? 'bg-surface-strong text-muted cursor-not-allowed' : 'bg-primary hover:bg-primary-active text-on-primary'}`}
            >
              <IndianRupee className="w-4 h-4 mr-2" /> {isProcessing ? 'Processing...' : 'Pay & Print'}
            </button>
            <button 
              disabled={cart.length === 0}
              className={`border font-medium py-3 rounded-sm flex justify-center items-center transition-colors text-sm ${cart.length === 0 ? 'border-transparent text-muted bg-canvas' : 'bg-canvas border-hairline text-ink hover:bg-surface-soft'}`}
            >
              <Printer className="w-4 h-4 mr-2" /> Invoice
            </button>
            <button 
              onClick={() => setCart([])}
              disabled={cart.length === 0}
              className={`border font-medium py-3 rounded-sm transition-colors text-sm ${cart.length === 0 ? 'border-transparent bg-canvas text-muted cursor-not-allowed' : 'border-hairline bg-canvas text-ink hover:bg-surface-soft'}`}
            >
              Clear All
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

