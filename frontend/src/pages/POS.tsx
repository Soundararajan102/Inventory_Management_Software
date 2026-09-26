import { useState, useEffect } from 'react';
import { Search, IndianRupee, X, Plus, Minus, ShoppingCart, User } from 'lucide-react';
import { getSellableProducts, getCustomers, recordSale } from '../lib/db';
import type { Product, CartItem, Customer } from '../lib/db';
import { Receipt } from '../components/Receipt';
import type { ReceiptData } from '../components/Receipt';

export default function POS() {
  const [search, setSearch] = useState('');
  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  
  const [cart, setCart] = useState<CartItem[]>([]);
  const [discount, setDiscount] = useState<number>(0);
  const [discountType, setDiscountType] = useState<'amount' | 'percentage'>('percentage');
  const [isProcessing, setIsProcessing] = useState(false);
  
  const [customerId, setCustomerId] = useState<number | ''>('');
  const [paidAmount, setPaidAmount] = useState<number | ''>('');
  const [printData, setPrintData] = useState<ReceiptData | null>(null);
  
  const [customerSearch, setCustomerSearch] = useState('');
  const [isCustomerDropdownOpen, setIsCustomerDropdownOpen] = useState(false);
  
  useEffect(() => {
    if (customerId === '') {
      setCustomerSearch('');
    } else {
      const c = customers.find(c => c.id === customerId);
      if (c) setCustomerSearch(c.name);
    }
  }, [customerId, customers]);

  const filteredCustomers = customers.filter(c => 
    c.name.toLowerCase().includes(customerSearch.toLowerCase()) || 
    (c.phone && c.phone.includes(customerSearch))
  );

  const [enableSalesGST, setEnableSalesGST] = useState(() => {
    const val = localStorage.getItem('enableSalesGST');
    if (val !== null) return val !== 'false';
    return localStorage.getItem('enableGST') !== 'false';
  });
  const [salesTaxMethod, setSalesTaxMethod] = useState<'exclusive' | 'inclusive'>(() => {
    const val = localStorage.getItem('salesTaxMethod') as 'exclusive' | 'inclusive';
    if (val) return val;
    return (localStorage.getItem('taxMethod') as 'exclusive' | 'inclusive') || 'exclusive';
  });

  useEffect(() => {
    const handlePrefChange = () => {
      const gVal = localStorage.getItem('enableSalesGST');
      setEnableSalesGST(gVal !== null ? gVal !== 'false' : localStorage.getItem('enableGST') !== 'false');
      
      const tVal = localStorage.getItem('salesTaxMethod') as 'exclusive' | 'inclusive';
      setSalesTaxMethod(tVal || (localStorage.getItem('taxMethod') as 'exclusive' | 'inclusive') || 'exclusive');
    };
    window.addEventListener('preferencesUpdated', handlePrefChange);
    return () => window.removeEventListener('preferencesUpdated', handlePrefChange);
  }, []);

  useEffect(() => {
    loadProducts();
  }, []);

  async function loadProducts() {
    try {
      const data = await getSellableProducts();
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

  const [selectedIndex, setSelectedIndex] = useState(0);

  useEffect(() => {
    setSelectedIndex(0);
  }, [search]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setSearch('');
      return;
    }
    
    if (search.trim() === '' || filteredProducts.length === 0) return;
    
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => (prev < filteredProducts.length - 1 ? prev + 1 : prev));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => (prev > 0 ? prev - 1 : prev));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      addToCart(filteredProducts[selectedIndex]);
    }
  };

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

  function updateRate(id: number, newRate: number) {
    setCart(prev => prev.map(item => 
      item.id === id ? { ...item, selling_price: newRate } : item
    ));
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
      
      const invoiceNumber = await recordSale(
        cart, 
        subtotal, 
        tax, 
        discountAmount, 
        grandTotal, 
        finalPaidAmount, 
        'Cash', 
        finalCustomerId
      );
      
      const currentCustomerObj = finalCustomerId ? customers.find(c => c.id === finalCustomerId) : null;
      const currentCustomer = currentCustomerObj ? currentCustomerObj.name : '';
      
      setPrintData({
        invoiceNumber,
        date: new Date().toLocaleDateString('en-IN'),
        customerName: currentCustomer,
        customerDetails: currentCustomerObj ? {
          name: currentCustomerObj.name,
          phone: currentCustomerObj.phone || undefined,
          email: currentCustomerObj.email || undefined,
          address: currentCustomerObj.address || undefined,
          gstin: currentCustomerObj.gstin || undefined,
        } : undefined,
        items: cart,
        subtotal,
        taxAmount: tax,
        taxBreakdown,
        taxMethod: enableSalesGST ? salesTaxMethod : undefined,
        discount: discountAmount,
        netAmount: grandTotal,
        paidAmount: finalPaidAmount
      });

      setTimeout(() => {
        window.print();
      }, 100);

      // We clear the state after printing or right away because printData holds the copy
      setCart([]);
      setDiscount(0);
      setDiscountType('percentage');
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

  // Step 1: Calculate the Original Price (Basis)
  let originalPriceBasis = 0;
  cart.forEach(item => {
    originalPriceBasis += item.selling_price * item.cart_qty;
  });

  // Step 2: Calculate the Displayed Discount Amount
  const displayDiscountAmount = discountType === 'percentage' 
    ? (originalPriceBasis * discount) / 100 
    : discount;

  // Calculate the ratio of discount to original price
  const discountRatio = originalPriceBasis > 0 ? (displayDiscountAmount / originalPriceBasis) : 0;

  // Step 3: Iterate through items and calculate Taxable Value and Tax per item
  let taxableValueSum = 0;
  let taxSum = 0;
  const taxBreakdown = { cgst: {} as Record<number, number>, sgst: {} as Record<number, number> };

  cart.forEach(item => {
    const originalItemPrice = item.selling_price * item.cart_qty;
    const discountedItemPrice = originalItemPrice * (1 - discountRatio); // Amount after discount
    
    let taxableValue = discountedItemPrice;
    if (enableSalesGST && salesTaxMethod === 'inclusive') {
      const gstPercent = (item.cgst_percentage || 0) + (item.sgst_percentage || 0);
      taxableValue = discountedItemPrice / (1 + (gstPercent / 100));
    }

    taxableValueSum += taxableValue;

    if (enableSalesGST) {
      const cgst = item.cgst_percentage || 0;
      const sgst = item.sgst_percentage || 0;
      
      if (cgst > 0) {
        taxBreakdown.cgst[cgst] = (taxBreakdown.cgst[cgst] || 0) + (taxableValue * (cgst / 100));
      }
      if (sgst > 0) {
        taxBreakdown.sgst[sgst] = (taxBreakdown.sgst[sgst] || 0) + (taxableValue * (sgst / 100));
      }
      
      taxSum += taxableValue * ((cgst + sgst) / 100);
    }
  });

  const grandTotal = Math.max(0, taxableValueSum + taxSum);
  const subtotal = originalPriceBasis;
  const tax = taxSum;
  const discountAmount = displayDiscountAmount;

  return (
    <>
      <Receipt data={printData} />
      <div className="flex flex-row-reverse h-full bg-canvas print:hidden">
      
      {/* Right Side Visually: Product Selection & Search */}
      <div className="flex-1 flex flex-col p-8 overflow-hidden">
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
              onKeyDown={handleKeyDown}
              autoFocus
            />
          </div>

          {/* Search Dropdown */}
          {search.trim() !== '' && (
            <div className="absolute top-full left-0 right-0 mt-2 bg-canvas border border-hairline rounded-lg shadow-xl max-h-96 overflow-y-auto">
              {filteredProducts.length > 0 ? (
                <ul className="divide-y divide-hairline p-2">
                  {filteredProducts.map((p, index) => (
                    <li 
                      key={p.id} 
                      onClick={() => addToCart(p)}
                      onMouseEnter={() => setSelectedIndex(index)}
                      className={`p-3 rounded-md cursor-pointer flex justify-between items-center transition-colors ${index === selectedIndex ? 'bg-surface-soft' : 'hover:bg-surface-soft'}`}
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

      {/* Left Side Visually: Cart & Invoice */}
      <div className="w-[420px] bg-canvas flex flex-col z-10 relative border-r border-hairline">
        <div className="p-6 border-b border-hairline bg-surface-soft">
          <div className="flex justify-between items-start">
            <div className="w-full">
              <div className="relative">
                <div className="flex items-center gap-3 w-full bg-canvas p-2 rounded-sm border border-hairline focus-within:border-ink transition-colors">
                  <div className="bg-surface-soft p-1.5 rounded-sm">
                    <User className="w-4 h-4 text-muted" />
                  </div>
                  <input
                    type="text"
                    placeholder="Walk-in (No Customer)"
                    className="flex-1 bg-transparent text-sm outline-none text-ink font-medium placeholder-ink"
                    value={customerSearch}
                    onChange={(e) => {
                      setCustomerSearch(e.target.value);
                      setIsCustomerDropdownOpen(true);
                      if (e.target.value === '') setCustomerId('');
                    }}
                    onFocus={() => setIsCustomerDropdownOpen(true)}
                  />
                  {customerId !== '' && (
                    <button onClick={() => { setCustomerId(''); setCustomerSearch(''); }} className="text-muted hover:text-ink">
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>
                
                {isCustomerDropdownOpen && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setIsCustomerDropdownOpen(false)} />
                    <div className="absolute top-full left-0 right-0 mt-1 bg-canvas border border-hairline rounded-lg shadow-xl max-h-60 overflow-y-auto z-50">
                      <ul className="divide-y divide-hairline">
                        <li 
                          onClick={() => {
                            setCustomerId('');
                            setCustomerSearch('');
                            setIsCustomerDropdownOpen(false);
                          }}
                          className="p-3 hover:bg-surface-soft cursor-pointer text-sm font-medium text-ink"
                        >
                          Walk-in (No Customer)
                        </li>
                        {filteredCustomers.map(c => (
                          <li 
                            key={c.id}
                            onClick={() => {
                              setCustomerId(c.id);
                              setCustomerSearch(c.name);
                              setIsCustomerDropdownOpen(false);
                            }}
                            className="p-3 hover:bg-surface-soft cursor-pointer text-sm flex justify-between items-center"
                          >
                            <span className="font-medium text-ink">{c.name}</span>
                            {c.balance > 0 && <span className="text-xs text-signature-coral font-medium">Owes: ₹{c.balance.toFixed(0)}</span>}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
        
        {/* Cart Items */}
        <div className="flex-1 overflow-y-auto bg-canvas">
          {cart.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-muted p-4">
              <ShoppingCart className="w-10 h-10 mb-3 text-muted" />
              <p className="font-medium">Cart is empty</p>
            </div>
          ) : (
            cart.map((item) => (
              <div key={item.id} className="bg-canvas border-b border-hairline py-3 px-4 group flex items-center justify-between gap-3">
                <div className="flex-1 min-w-0 pr-2">
                  <h3 className="text-sm font-medium text-ink truncate leading-tight">{item.name}</h3>
                  <div className="text-xs text-muted mt-0.5 flex flex-col gap-0.5">
                    <div className="flex items-center">
                      <span className="text-muted mr-0.5">₹</span>
                      <input
                        type="number"
                        value={item.selling_price === 0 ? '' : item.selling_price}
                        onChange={(e) => updateRate(item.id, Number(e.target.value) || 0)}
                        className="w-16 bg-transparent border-b border-transparent hover:border-hairline focus:border-ink outline-none text-ink font-medium text-xs text-right transition-colors"
                        title="Selling Rate"
                      />
                      <span className="ml-1 text-muted">/ {item.unit}</span>
                    </div>
                    {enableSalesGST && <span className="text-primary text-[10px]">({item.cgst_percentage || 0}% CGST, {item.sgst_percentage || 0}% SGST)</span>}
                  </div>
                </div>
                
                <div className="flex items-center gap-3 shrink-0">
                  <div className="flex items-center bg-surface-soft border border-hairline rounded-sm p-0.5">
                    <button onClick={() => adjustQty(item.id, -1)} className="p-0.5 hover:bg-canvas rounded-xs text-muted transition-colors"><Minus className="w-3 h-3" /></button>
                    <span className="w-6 text-center text-xs font-medium text-ink">{item.cart_qty}</span>
                    <button onClick={() => adjustQty(item.id, 1)} className="p-0.5 hover:bg-canvas rounded-xs text-muted transition-colors"><Plus className="w-3 h-3" /></button>
                  </div>
                  <div className="w-[60px] text-right">
                    <span className="font-medium text-ink text-sm">₹{(item.selling_price * item.cart_qty).toFixed(0)}</span>
                  </div>
                  <button 
                    onClick={() => removeFromCart(item.id)}
                    className="text-muted hover:text-ink opacity-0 group-hover:opacity-100 transition-opacity p-1"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Totals & Checkout */}
        <div className="p-4 border-t border-hairline bg-canvas">
          <div className="space-y-2 mb-4">
            {enableSalesGST && salesTaxMethod === 'inclusive' ? (
              <div className="flex justify-between text-sm text-body">
                <span>Original Price (GST Inclusive)</span>
                <span className="font-medium text-ink">₹{subtotal.toFixed(2)}</span>
              </div>
            ) : (
              <div className="flex justify-between text-sm text-body">
                <span>Original Price (GST Exclusive)</span>
                <span className="font-medium text-ink">₹{subtotal.toFixed(2)}</span>
              </div>
            )}
            
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
            
            {discountAmount > 0 && (
              <div className="flex justify-between text-sm text-success">
                <span>Discount Amount</span>
                <span>-₹{discountAmount.toFixed(2)}</span>
              </div>
            )}
            
            <div className="flex justify-between text-sm text-body mt-1 pt-1 border-t border-hairline">
              <span className="font-medium">Taxable Value</span>
              <span className="font-medium text-ink">₹{taxableValueSum.toFixed(2)}</span>
            </div>

            {enableSalesGST && (
              <div className="mt-1 space-y-1">
                {Object.entries(taxBreakdown.cgst).map(([pct, amt]) => (
                  <div key={`cgst-${pct}`} className="flex justify-between items-center text-sm text-body">
                    <span>CGST ({pct}%)</span>
                    <span className="font-medium text-ink">₹{amt.toFixed(2)}</span>
                  </div>
                ))}
                {Object.entries(taxBreakdown.sgst).map(([pct, amt]) => (
                  <div key={`sgst-${pct}`} className="flex justify-between items-center text-sm text-body">
                    <span>SGST ({pct}%)</span>
                    <span className="font-medium text-ink">₹{amt.toFixed(2)}</span>
                  </div>
                ))}
              </div>
            )}
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

          <div className="flex gap-3">
            <button 
              onClick={() => setCart([])}
              disabled={cart.length === 0}
              className={`w-28 border font-medium py-3 rounded-lg transition-colors text-sm ${cart.length === 0 ? 'border-transparent bg-canvas text-muted cursor-not-allowed' : 'border-hairline bg-canvas text-ink hover:bg-surface-soft'}`}
            >
              Clear All
            </button>
            <button 
              onClick={handleCheckout}
              disabled={cart.length === 0 || isProcessing || (Number(paidAmount !== '' ? paidAmount : grandTotal) < grandTotal && customerId === '')}
              className={`flex-1 font-medium py-3 rounded-lg flex justify-center items-center text-base transition-colors ${(cart.length === 0 || isProcessing || (Number(paidAmount !== '' ? paidAmount : grandTotal) < grandTotal && customerId === '')) ? 'bg-surface-strong text-muted cursor-not-allowed' : 'bg-primary hover:bg-primary-active text-on-primary'}`}
            >
              <IndianRupee className="w-4 h-4 mr-2" /> {isProcessing ? 'Processing...' : 'Complete Sale'}
            </button>
          </div>
        </div>
      </div>
    </div>
    </>
  );
}

