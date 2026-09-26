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

  const [supplierSearch, setSupplierSearch] = useState('');
  const [isSupplierDropdownOpen, setIsSupplierDropdownOpen] = useState(false);

  useEffect(() => {
    if (supplierId === '') {
      setSupplierSearch('');
    } else {
      const s = suppliers.find(s => s.id === supplierId);
      if (s) setSupplierSearch(s.name);
    }
  }, [supplierId, suppliers]);

  const filteredSuppliers = suppliers.filter(s =>
    s.name.toLowerCase().includes(supplierSearch.toLowerCase()) ||
    (s.phone && s.phone.includes(supplierSearch))
  );

  const [discount, setDiscount] = useState<number>(0);
  const [discountType, setDiscountType] = useState<'amount' | 'percentage'>('percentage');
  const [paidAmount, setPaidAmount] = useState<number>(0);

  const [isProcessing, setIsProcessing] = useState(false);

  const [enablePurchaseGST, setEnablePurchaseGST] = useState(() => {
    const val = localStorage.getItem('enablePurchaseGST');
    if (val !== null) return val !== 'false';
    return localStorage.getItem('enableGST') !== 'false';
  });
  const [purchaseTaxMethod, setPurchaseTaxMethod] = useState<'exclusive' | 'inclusive'>(() => {
    const val = localStorage.getItem('purchaseTaxMethod') as 'exclusive' | 'inclusive';
    if (val) return val;
    return (localStorage.getItem('taxMethod') as 'exclusive' | 'inclusive') || 'exclusive';
  });

  useEffect(() => {
    const handlePrefChange = () => {
      const gVal = localStorage.getItem('enablePurchaseGST');
      setEnablePurchaseGST(gVal !== null ? gVal !== 'false' : localStorage.getItem('enableGST') !== 'false');
      
      const tVal = localStorage.getItem('purchaseTaxMethod') as 'exclusive' | 'inclusive';
      setPurchaseTaxMethod(tVal || (localStorage.getItem('taxMethod') as 'exclusive' | 'inclusive') || 'exclusive');
    };
    window.addEventListener('preferencesUpdated', handlePrefChange);
    return () => window.removeEventListener('preferencesUpdated', handlePrefChange);
  }, []);

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

  // Step 1: Calculate the Original Price (Basis)
  let originalPriceBasis = 0;
  cart.forEach(item => {
    originalPriceBasis += item.purchase_price * item.purchase_qty;
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
    const originalItemPrice = item.purchase_price * item.purchase_qty;
    const discountedItemPrice = originalItemPrice * (1 - discountRatio); // Amount after discount
    
    let taxableValue = discountedItemPrice;
    if (enablePurchaseGST && purchaseTaxMethod === 'inclusive') {
      const gstPercent = (item.cgst_percentage || 0) + (item.sgst_percentage || 0);
      taxableValue = discountedItemPrice / (1 + (gstPercent / 100));
    }

    taxableValueSum += taxableValue;

    if (enablePurchaseGST) {
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
      setDiscountType('percentage');
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
              onKeyDown={handleKeyDown}
              autoFocus
            />
          </div>

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

          <div className="relative">
            <label className="block text-xs font-medium text-muted uppercase tracking-wider mb-2 flex items-center"><Truck className="w-3.5 h-3.5 mr-1" /> Supplier *</label>
            <div className="flex items-center w-full bg-canvas rounded-sm border border-hairline focus-within:border-ink transition-colors">
              <input
                type="text"
                placeholder="-- Select Supplier --"
                className="flex-1 bg-transparent px-3 py-2 text-sm outline-none text-ink font-medium placeholder-ink"
                value={supplierSearch}
                onChange={(e) => {
                  setSupplierSearch(e.target.value);
                  setIsSupplierDropdownOpen(true);
                  if (e.target.value === '') setSupplierId('');
                }}
                onFocus={() => setIsSupplierDropdownOpen(true)}
              />
              {supplierId !== '' && (
                <button onClick={() => { setSupplierId(''); setSupplierSearch(''); }} className="px-3 text-muted hover:text-ink">
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {isSupplierDropdownOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setIsSupplierDropdownOpen(false)} />
                <div className="absolute top-full left-0 right-0 mt-1 bg-canvas border border-hairline rounded-lg shadow-xl max-h-60 overflow-y-auto z-50">
                  <ul className="divide-y divide-hairline">
                    <li
                      onClick={() => {
                        setSupplierId('');
                        setSupplierSearch('');
                        setIsSupplierDropdownOpen(false);
                      }}
                      className="p-3 hover:bg-surface-soft cursor-pointer text-sm font-medium text-ink"
                    >
                      -- Select Supplier --
                    </li>
                    {filteredSuppliers.map(s => (
                      <li
                        key={s.id}
                        onClick={() => {
                          setSupplierId(s.id);
                          setSupplierSearch(s.name);
                          setIsSupplierDropdownOpen(false);
                        }}
                        className="p-3 hover:bg-surface-soft cursor-pointer text-sm flex justify-between items-center"
                      >
                        <span className="font-medium text-ink">{s.name}</span>
                        {s.balance > 0 && <span className="text-xs text-signature-coral font-medium">Bal: ₹{s.balance.toFixed(0)}</span>}
                      </li>
                    ))}
                  </ul>
                </div>
              </>
            )}
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
        <div className="flex-1 overflow-y-auto bg-canvas">
          {cart.map((item) => (
            <div key={item.id} className="bg-canvas border-b border-hairline py-3 px-4 group flex items-center justify-between gap-3">
              <div className="flex-1 min-w-0 pr-2">
                <h3 className="text-sm font-medium text-ink truncate leading-tight">{item.name}</h3>
                <div className="text-xs text-muted mt-1 flex flex-col gap-0.5">
                  <div className="flex items-center">
                    <div className="flex items-center border-b border-hairline focus-within:border-ink transition-colors">
                      <span className="text-muted mr-0.5">₹</span>
                      <input
                        type="number"
                        value={item.purchase_price === 0 ? '' : item.purchase_price}
                        onChange={(e) => updateRate(item.id, Number(e.target.value) || 0)}
                        className="w-16 bg-transparent outline-none text-ink font-medium text-xs text-right"
                        title="Purchase Rate"
                      />
                    </div>
                    <span className="ml-1 text-muted">/ {item.unit}</span>
                  </div>
                  {enablePurchaseGST && <span className="text-primary text-[10px]">({item.cgst_percentage || 0}% CGST, {item.sgst_percentage || 0}% SGST)</span>}
                </div>
              </div>

              <div className="flex items-center gap-3 shrink-0">
                <div className="flex items-center bg-surface-soft border border-hairline rounded-sm p-0.5">
                  <button onClick={() => adjustQty(item.id, -1)} className="p-0.5 hover:bg-canvas rounded-xs text-muted transition-colors"><Minus className="w-3 h-3" /></button>
                  <span className="w-6 text-center text-xs font-medium text-ink">{item.purchase_qty}</span>
                  <button onClick={() => adjustQty(item.id, 1)} className="p-0.5 hover:bg-canvas rounded-xs text-muted transition-colors"><Plus className="w-3 h-3" /></button>
                </div>
                <div className="w-[60px] text-right">
                  <span className="font-medium text-ink text-sm">₹{(item.purchase_price * item.purchase_qty).toFixed(0)}</span>
                </div>
                <button onClick={() => removeFromCart(item.id)} className="text-muted hover:text-ink opacity-0 group-hover:opacity-100 transition-opacity p-1">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Totals & Submit */}
        <div className="p-6 border-t border-hairline bg-canvas">
          <div className="space-y-4 mb-6">
            {enablePurchaseGST && purchaseTaxMethod === 'inclusive' ? (
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

            {enablePurchaseGST && (
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
            )}          </div>

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
