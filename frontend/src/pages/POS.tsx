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
    <div className="flex h-full bg-slate-50">
      
      {/* Left Side: Product Selection & Search */}
      <div className="flex-1 flex flex-col p-8 border-r border-slate-200 overflow-hidden">
        <header className="mb-8">
          <h1 className="text-3xl font-bold text-slate-800 tracking-tight">Point of Sale</h1>
          <p className="text-slate-500 mt-1">Search products to add to the current bill.</p>
        </header>

        <div className="relative w-full max-w-2xl mx-auto z-20">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 w-6 h-6" />
            <input 
              type="text" 
              placeholder="Search products by name or model..." 
              className="w-full pl-14 pr-4 py-4 text-lg bg-white border border-slate-200 rounded-2xl shadow-sm focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all text-slate-800 placeholder-slate-400"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              autoFocus
            />
          </div>

          {/* Search Dropdown */}
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
                        <div className="text-sm text-slate-500">{p.model ? `${p.model} • ` : ''}Stock: {p.stock_quantity}</div>
                      </div>
                      <div className="font-bold text-slate-800">₹{p.selling_price.toFixed(2)}</div>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="p-6 text-center text-slate-500">
                  No products found matching "{search}"
                </div>
              )}
            </div>
          )}
        </div>
        
        {/* Empty State Illustration when not searching */}
        {search.trim() === '' && cart.length === 0 && (
           <div className="flex-1 flex flex-col items-center justify-center text-slate-400 pb-20">
             <div className="w-24 h-24 bg-slate-100 rounded-full flex items-center justify-center mb-4">
                <Search className="w-10 h-10 text-slate-300" />
             </div>
             <p>Start typing to search for products</p>
           </div>
        )}
      </div>

      {/* Right Side: Cart & Invoice */}
      <div className="w-[420px] bg-white flex flex-col shadow-2xl z-10 relative border-l border-slate-200">
        <div className="p-6 border-b border-slate-100 bg-slate-50/50 backdrop-blur-sm">
          <div className="flex justify-between items-start">
            <div className="w-full">
              <h2 className="text-xl font-bold text-slate-800">Current Bill</h2>
              <div className="flex items-center gap-3 mt-3 w-full bg-white p-2 rounded-xl border border-slate-200 shadow-sm focus-within:ring-2 focus-within:ring-blue-500/20 focus-within:border-blue-500 transition-all">
                <div className="bg-slate-50 p-2 rounded-lg">
                  <User className="w-4 h-4 text-slate-500" />
                </div>
                <select 
                  className="flex-1 bg-transparent text-sm outline-none text-slate-700 font-bold cursor-pointer pr-2 appearance-none"
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
        <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50/30">
          {cart.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-slate-400">
              <ShoppingCart className="w-12 h-12 mb-2 text-slate-200" />
              <p>Cart is empty</p>
            </div>
          ) : (
            cart.map((item) => (
              <div key={item.id} className="bg-white border border-slate-100 p-4 rounded-xl shadow-sm group">
                <div className="flex justify-between items-start mb-3">
                  <div className="flex-1 pr-2">
                    <h3 className="text-sm font-bold text-slate-800 leading-tight">{item.name}</h3>
                    <div className="text-xs text-slate-500 mt-1">₹{item.selling_price.toFixed(2)} / {item.unit}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-slate-800">₹{(item.selling_price * item.cart_qty).toFixed(2)}</span>
                    <button 
                      onClick={() => removeFromCart(item.id)}
                      className="text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                
                {/* Qty Controls */}
                <div className="flex items-center justify-start mt-2">
                  <div className="flex items-center bg-slate-50 border border-slate-200 rounded-lg p-0.5">
                    <button onClick={() => adjustQty(item.id, -1)} className="p-1 hover:bg-white hover:shadow-sm rounded-md text-slate-500 transition-all"><Minus className="w-4 h-4" /></button>
                    <span className="w-10 text-center text-sm font-semibold text-slate-700">{item.cart_qty}</span>
                    <button onClick={() => adjustQty(item.id, 1)} className="p-1 hover:bg-white hover:shadow-sm rounded-md text-slate-500 transition-all"><Plus className="w-4 h-4" /></button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Totals & Checkout */}
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
                  className={`relative inline-flex h-4 w-7 items-center rounded-full transition-colors ${isGstEnabled ? 'bg-blue-500' : 'bg-slate-300'}`}
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
                  className="text-xs font-bold bg-slate-100 text-slate-500 hover:text-slate-700 hover:bg-slate-200 px-1.5 py-0.5 rounded transition-colors select-none"
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
                  className="w-16 text-center border-b-2 border-slate-200 bg-transparent py-0.5 focus:outline-none focus:border-blue-500 font-medium text-slate-800 transition-colors"
                />
              </div>
            </div>
            <div className="flex justify-between items-end border-t border-slate-100 pt-4 mt-4">
              <span className="text-slate-800 font-bold">Grand Total</span>
              <span className="text-3xl font-black text-blue-600 tracking-tight leading-none">₹{grandTotal.toFixed(2)}</span>
            </div>
            
            <div className="flex justify-between items-center text-sm text-slate-600 pt-2 pb-1 border-t border-slate-100 mt-2">
              <span className="font-semibold">Amount Paid</span>
              <div className="flex items-center">
                <span className="text-slate-400 font-bold mr-1">₹</span>
                <input 
                  type="number" 
                  min="0"
                  max={grandTotal}
                  value={paidAmount === '' ? '' : paidAmount}
                  onChange={(e) => setPaidAmount(e.target.value === '' ? '' : Number(e.target.value))}
                  placeholder={grandTotal.toFixed(0)}
                  className="w-20 text-right border-b-2 border-slate-200 bg-transparent py-0.5 focus:outline-none focus:border-blue-500 font-bold text-slate-800 transition-colors"
                />
              </div>
            </div>
            {Number(paidAmount !== '' ? paidAmount : grandTotal) < grandTotal && (
              <div className="flex justify-between items-center text-sm text-orange-600 font-bold pt-1">
                <span>Pending Balance</span>
                <span>₹{(grandTotal - Number(paidAmount)).toFixed(2)}</span>
              </div>
            )}
            {Number(paidAmount !== '' ? paidAmount : grandTotal) < grandTotal && customerId === '' && (
              <div className="text-xs text-red-500 font-semibold mt-1 text-right">
                *Must select a customer for partial payments
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <button 
              onClick={handleCheckout}
              disabled={cart.length === 0 || isProcessing}
              className={`col-span-2 text-white font-bold py-3.5 rounded-xl flex justify-center items-center text-lg transition-all shadow-lg shadow-blue-500/20 ${cart.length === 0 || isProcessing ? 'bg-slate-300 shadow-none cursor-not-allowed' : 'bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-700 hover:to-blue-600 hover:-translate-y-0.5'}`}
            >
              <IndianRupee className="w-5 h-5 mr-2" /> {isProcessing ? 'Processing...' : 'Pay & Print'}
            </button>
            <button 
              disabled={cart.length === 0}
              className={`border font-bold py-3 rounded-xl flex justify-center items-center transition-all ${cart.length === 0 ? 'border-slate-200 text-slate-400 bg-slate-50' : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-slate-300'}`}
            >
              <Printer className="w-4 h-4 mr-2" /> Invoice
            </button>
            <button 
              onClick={() => setCart([])}
              disabled={cart.length === 0}
              className={`border font-bold py-3 rounded-xl transition-all ${cart.length === 0 ? 'border-transparent bg-slate-50 text-slate-400' : 'border-transparent bg-red-50 text-red-600 hover:bg-red-100'}`}
            >
              Clear All
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

