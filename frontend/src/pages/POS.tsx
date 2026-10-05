import { useState, useEffect } from 'react';
import { Search, IndianRupee, X, ShoppingCart, User } from 'lucide-react';
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



  function setQty(id: number, qty: number) {
    setCart(prev => prev.map(item => {
      if (item.id === id) {
        const newQty = Math.min(item.stock_quantity, Math.max(0, qty));
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
      const finalPaidAmount = paidAmount === '' ? 0 : Number(paidAmount);
      
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

  const exactGrandTotal = Math.max(0, taxableValueSum + taxSum);
  const grandTotal = Math.round(exactGrandTotal);
  const roundOff = grandTotal - exactGrandTotal;
  const subtotal = originalPriceBasis;
  const tax = taxSum;
  const discountAmount = displayDiscountAmount;

  return (
    <>
      <Receipt data={printData} />
      <div className="flex flex-row h-full bg-canvas print:hidden">
      
      {/* 1. Left Column: Cart Items */}
      <div className="flex-1 bg-canvas flex flex-col z-10 relative border-r border-hairline">
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
                    placeholder="Walk-in Customer"
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
                          Walk-in Customer
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
                    <input
                      type="number"
                      min="1"
                      value={item.cart_qty === 0 ? '' : item.cart_qty}
                      onChange={(e) => setQty(item.id, Number(e.target.value) || 0)}
                      className="w-12 text-center text-sm font-medium text-ink bg-transparent focus:outline-none"
                    />
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
      </div>
      {/* 2. Middle Column: Totals & Checkout */}
      <div className="w-[350px] bg-surface-soft flex flex-col z-10 relative border-r border-hairline shrink-0">
        <div className="flex-1 overflow-y-auto p-6">
          <h2 className="font-display font-medium text-xl mb-6 text-ink">Summary</h2>
          <div className="space-y-3">
            {enableSalesGST && salesTaxMethod === 'inclusive' ? (
              <div className="flex justify-between text-sm text-body">
                <span>Original Price (GST Inc)</span>
                <span className="font-medium text-ink">₹{subtotal.toFixed(2)}</span>
              </div>
            ) : (
              <div className="flex justify-between text-sm text-body">
                <span>Original Price (GST Exc)</span>
                <span className="font-medium text-ink">₹{subtotal.toFixed(2)}</span>
              </div>
            )}
            
            <div className="flex justify-between items-center text-sm text-body py-1">
              <span>Discount</span>
              <div className="flex items-center gap-2">
                <button 
                  onClick={() => setDiscountType(prev => prev === 'amount' ? 'percentage' : 'amount')}
                  className="text-xs font-medium bg-canvas border border-hairline text-ink hover:bg-surface-strong px-1.5 py-0.5 rounded-xs transition-colors select-none"
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
            
            <div className="flex justify-between text-sm text-body mt-2 pt-2 border-t border-hairline">
              <span className="font-medium">Taxable Value</span>
              <span className="font-medium text-ink">₹{taxableValueSum.toFixed(2)}</span>
            </div>

            {enableSalesGST && (
              <div className="mt-2 space-y-1.5">
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
            
            {roundOff !== 0 && (
              <div className="flex justify-between items-center text-sm text-body">
                <span>Round off</span>
                <span className="font-medium text-ink">{roundOff > 0 ? '+' : ''}{roundOff.toFixed(2)}</span>
              </div>
            )}
            
            <div className="flex justify-between items-end border-t border-hairline pt-4 mt-6">
              <span className="text-ink font-medium">Grand Total</span>
              <span className="text-2xl font-display text-ink tracking-tight leading-none">₹{grandTotal.toFixed(2)}</span>
            </div>
            
            <div className="flex justify-between items-center text-sm text-body pt-4 pb-2 border-t border-hairline mt-4">
              <span className="font-medium">Amount Paid</span>
              <div className="flex items-center">
                <span className="text-muted font-medium mr-1">₹</span>
                <input 
                  type="number" 
                  min="0"
                  max={grandTotal}
                  value={paidAmount === '' ? '' : paidAmount}
                  onChange={(e) => setPaidAmount(e.target.value === '' ? '' : Number(e.target.value))}
                  placeholder="0"
                  className="w-20 text-right border-b border-hairline bg-transparent py-0.5 focus:outline-none focus:border-ink font-medium text-ink transition-colors"
                />
              </div>
            </div>
            {Number(paidAmount !== '' ? paidAmount : 0) < grandTotal && (
              <div className="flex justify-between items-center text-sm text-signature-coral font-medium pt-1">
                <span>Pending Balance</span>
                <span>₹{(grandTotal - Number(paidAmount !== '' ? paidAmount : 0)).toFixed(2)}</span>
              </div>
            )}
            {Number(paidAmount !== '' ? paidAmount : 0) < grandTotal && customerId === '' && (
              <div className="text-xs text-signature-coral font-medium mt-1 text-right">
                *Select a customer
              </div>
            )}
          </div>
        </div>

        {/* Checkout Buttons */}
        <div className="p-4 bg-canvas border-t border-hairline flex flex-col gap-3">
          <button 
            onClick={handleCheckout}
            disabled={cart.length === 0 || isProcessing || (Number(paidAmount !== '' ? paidAmount : grandTotal) < grandTotal && customerId === '')}
            className={`w-full font-medium py-3 rounded-lg flex justify-center items-center text-base transition-colors ${(cart.length === 0 || isProcessing || (Number(paidAmount !== '' ? paidAmount : grandTotal) < grandTotal && customerId === '')) ? 'bg-surface-strong text-muted cursor-not-allowed' : 'bg-primary hover:bg-primary-active text-on-primary'}`}
          >
            <IndianRupee className="w-4 h-4 mr-2" /> {isProcessing ? 'Processing...' : 'Complete Sale'}
          </button>
          <button 
            onClick={() => setCart([])}
            disabled={cart.length === 0}
            className={`w-full font-medium py-2 rounded-lg transition-colors text-sm ${cart.length === 0 ? 'bg-transparent text-muted cursor-not-allowed' : 'bg-transparent text-muted hover:bg-surface-strong hover:text-danger'}`}
          >
            Clear Cart
          </button>
        </div>
      </div>

      {/* 3. Right Column: Product Search */}
      <div className="w-[350px] flex flex-col p-6 overflow-hidden bg-surface-soft border-l border-hairline">
        <header className="mb-6 text-center">
          <h1 className="text-2xl font-display font-medium text-ink tracking-tight">Products</h1>
          <p className="text-sm text-body mt-1">Add to bill</p>
        </header>

        <div className="relative w-full mb-6 z-20 shrink-0">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted w-4 h-4" />
            <input 
              type="text" 
              placeholder="Search by name/model..." 
              className="w-full pl-9 pr-3 py-2.5 text-sm bg-canvas border border-hairline rounded-sm shadow-sm focus:outline-none focus:border-primary transition-colors text-ink placeholder-muted"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={handleKeyDown}
              autoFocus
            />
          </div>

          {/* Search Dropdown */}
          {search.trim() !== '' && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-canvas border border-hairline rounded-lg shadow-xl max-h-96 overflow-y-auto">
              {filteredProducts.length > 0 ? (
                <ul className="divide-y divide-hairline">
                  {filteredProducts.map((p, index) => (
                    <li 
                      key={p.id} 
                      onClick={() => addToCart(p)}
                      onMouseEnter={() => setSelectedIndex(index)}
                      className={`p-3 cursor-pointer flex justify-between items-center transition-colors ${index === selectedIndex ? 'bg-surface-soft' : 'hover:bg-surface-soft'}`}
                    >
                      <div>
                        <div className="font-medium text-ink text-sm">{p.name}</div>
                        <div className="text-xs text-muted mt-0.5">{p.model ? `${p.model} • ` : ''}Stock: {p.stock_quantity}</div>
                      </div>
                      <div className="font-medium text-ink text-sm">₹{p.selling_price.toFixed(2)}</div>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="p-4 text-center text-sm text-muted">
                  No products found
                </div>
              )}
            </div>
          )}
        </div>

        {/* Empty State Illustration */}
        {search.trim() === '' && cart.length === 0 && (
           <div className="flex-1 flex flex-col items-center justify-center text-muted h-full opacity-60">
             <Search className="w-10 h-10 mb-4" />
             <p className="font-medium text-sm">Type to search</p>
           </div>
        )}
      </div>

    </div>
    </>
  );
}

