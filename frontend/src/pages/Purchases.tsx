import { useState, useEffect, useRef } from 'react';
import { Search, X, Truck, FileText, IndianRupee, Store, Building2 } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { getSellableProducts, getSuppliers, recordPurchase, getPurchaseById, updatePurchaseBill, getWarehouses } from '../lib/db';
import type { Product, Supplier, PurchaseItem, Warehouse } from '../lib/db';

export default function Purchases() {
  const [search, setSearch] = useState('');
  const [products, setProducts] = useState<Product[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [destinationType, setDestinationType] = useState<'shop' | 'warehouse'>('shop');
  const [destinationWarehouseId, setDestinationWarehouseId] = useState<number | ''>('');

  const location = useLocation();
  const navigate = useNavigate();
  const searchParams = new URLSearchParams(location.search);
  const editPurchaseIdParam = searchParams.get('editId');
  const editPurchaseId = editPurchaseIdParam ? Number(editPurchaseIdParam) : undefined;

  const [cart, setCart] = useState<PurchaseItem[]>([]);
  const getLocalDate = () => {
    const d = new Date();
    const offset = d.getTimezoneOffset() * 60000;
    return new Date(d.getTime() - offset).toISOString().split('T')[0];
  };

  const [supplierId, setSupplierId] = useState<number | ''>('');
  const [invoiceNo, setInvoiceNo] = useState('');
  const [supplierInvoiceDate, setSupplierInvoiceDate] = useState(getLocalDate());

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
    if (editPurchaseId) {
      loadEditData(editPurchaseId);
    }
  }, [editPurchaseId]);

  async function loadEditData(id: number) {
    try {
      const p = await getPurchaseById(id);
      if (p) {
        setSupplierId(p.entity_id);
        setInvoiceNo(p.invoice_number || '');
        if (p.date) setSupplierInvoiceDate(p.date.split(' ')[0]);
        if (p.destination_type) {
          setDestinationType(p.destination_type as 'shop' | 'warehouse');
        }
        if (p.destination_warehouse_id) {
          setDestinationWarehouseId(p.destination_warehouse_id);
        }
        setCart(p.items.map(i => ({
          id: i.product_id,
          name: i.name,
          model: i.model,
          purchase_price: i.unit_price,
          purchase_qty: i.quantity,
          unit: i.unit,
          hsn_code: i.hsn_code,
          cgst_percentage: i.cgst_percentage,
          sgst_percentage: i.sgst_percentage,
          gst_percentage: i.gst_percentage
        } as PurchaseItem)));
        setDiscountType('amount');
        setDiscount(p.discount || 0);
        setPaidAmount(p.paid_amount || 0);
      }
    } catch (e) {
      console.error(e);
    }
  }

  async function loadData() {
    try {
      setProducts(await getSellableProducts());
      setSuppliers(await getSuppliers());
      const whList = await getWarehouses();
      setWarehouses(whList);
      if (whList.length > 0 && destinationWarehouseId === '') {
        setDestinationWarehouseId(whList[0].id);
      }
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



  function setQty(id: number, qty: number) {
    setCart(prev => prev.map(item => {
      if (item.id === id) {
        return { ...item, purchase_qty: Math.max(0, qty) };
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

  const exactGrandTotal = Math.max(0, taxableValueSum + taxSum);
  const grandTotal = Math.round(exactGrandTotal);
  const roundOff = grandTotal - exactGrandTotal;
  const subtotal = originalPriceBasis;
  const tax = taxSum;
  const discountAmount = displayDiscountAmount;

  // Auto-fill paid amount with grand total if they want to pay in full
  function payInFull() {
    setPaidAmount(Number(grandTotal.toFixed(2)));
  }

  // Global Ctrl + S shortcut handler
  const handleRecordActionRef = useRef<(() => void) | undefined>(undefined);
  handleRecordActionRef.current = () => {
    if (isProcessing) return;
    handleRecord();
  };

  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        e.stopPropagation();
        handleRecordActionRef.current?.();
      }
    };
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, []);

  async function handleRecord() {
    if (cart.length === 0) {
      alert("Purchase bill is empty! Please add products before saving.");
      return;
    }
    const invalidItem = cart.find(i => i.purchase_qty <= 0);
    if (invalidItem) {
      alert(`Item "${invalidItem.name}" has an invalid quantity. Quantity must be at least 1.`);
      return;
    }
    if (supplierId === '') {
      alert("Please select a supplier for this purchase.");
      return;
    }
    if (invoiceNo.trim() === '') {
      alert("Please enter a supplier invoice number.");
      return;
    }

    if (destinationType === 'warehouse' && (destinationWarehouseId === '' || warehouses.length === 0)) {
      alert('Please select a warehouse destination or create a warehouse first in Inventory.');
      return;
    }

    setIsProcessing(true);
    try {
      if (editPurchaseId) {
        await updatePurchaseBill(
          editPurchaseId,
          Number(supplierId),
          invoiceNo,
          supplierInvoiceDate,
          cart,
          subtotal,
          tax,
          discountAmount,
          grandTotal,
          paidAmount,
          destinationType,
          destinationType === 'warehouse' ? Number(destinationWarehouseId) : null
        );
        alert('Purchase bill updated successfully!');
        navigate('/daybook', { 
          state: { 
            activeTab: 'purchases',
            startDate: (location.state as any)?.startDate,
            endDate: (location.state as any)?.endDate
          } 
        });
      } else {
        await recordPurchase(
          Number(supplierId),
          invoiceNo,
          supplierInvoiceDate,
          cart,
          subtotal,
          tax,
          discountAmount,
          grandTotal,
          paidAmount,
          destinationType,
          destinationType === 'warehouse' ? Number(destinationWarehouseId) : null
        );
        alert('Purchase recorded successfully! Stock and Supplier Balance updated.');
      }

      // Reset Form
      setCart([]);
      setSupplierId('');
      setInvoiceNo('');
      setSupplierInvoiceDate(getLocalDate());
      setDiscount(0);
      setDiscountType('percentage');
      setPaidAmount(0);
      setDestinationType('shop');
      if (warehouses.length > 0) setDestinationWarehouseId(warehouses[0].id);
      loadData();
    } catch (error) {
      console.error(error);
      alert(`Failed to record purchase: ${error}`);
    } finally {
      setIsProcessing(false);
    }
  }

  return (
    <div className="flex flex-row h-full bg-canvas print:hidden">
      
      {/* 1. Left Column: Purchase Details & Cart */}
      <div className="flex-1 bg-canvas flex flex-col z-10 relative border-r border-hairline">
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

          <div className="flex gap-4">
            <div className="flex-1">
              <label className="block text-xs font-medium text-muted uppercase tracking-wider mb-2 flex items-center"><FileText className="w-3.5 h-3.5 mr-1" /> Invoice No *</label>
              <input
                type="text"
                value={invoiceNo}
                onChange={e => setInvoiceNo(e.target.value)}
                placeholder="e.g. INV-1001"
                className="w-full px-3 py-2 bg-canvas border border-hairline rounded-sm focus:outline-none focus:border-ink font-medium text-ink uppercase text-sm placeholder-muted"
              />
            </div>
            <div className="w-1/3">
              <label className="block text-xs font-medium text-muted uppercase tracking-wider mb-2 flex items-center">Invoice Date</label>
              <input
                type="date"
                value={supplierInvoiceDate}
                onChange={e => setSupplierInvoiceDate(e.target.value)}
                className="w-full px-3 py-2 bg-canvas border border-hairline rounded-sm focus:outline-none focus:border-ink font-medium text-ink text-sm"
              />
            </div>
          </div>

          {/* Stock Destination Selector */}
          <div className="pt-3 border-t border-hairline">
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium text-muted uppercase tracking-wider flex items-center gap-1.5">
                <Store className="w-3.5 h-3.5 text-primary" /> Stock Inward Destination *
              </label>
              <span className="text-[11px] font-normal text-muted">
                {destinationType === 'shop' ? 'Direct to Main Store' : 'Direct to Godown'}
              </span>
            </div>
            
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setDestinationType('shop')}
                className={`flex items-center justify-center gap-2 px-3 py-2 text-xs font-semibold rounded-sm border transition-all ${
                  destinationType === 'shop'
                    ? 'bg-ink text-canvas border-ink shadow-sm'
                    : 'bg-canvas text-muted hover:text-ink border-hairline hover:border-ink/40'
                }`}
              >
                <Store className="w-3.5 h-3.5" />
                <span>Main Shop</span>
                <span className={`text-[10px] px-1 py-0.2 rounded font-normal ${destinationType === 'shop' ? 'bg-canvas/20 text-canvas' : 'bg-surface-soft text-muted'}`}>Default</span>
              </button>
              
              <button
                type="button"
                onClick={() => setDestinationType('warehouse')}
                className={`flex items-center justify-center gap-2 px-3 py-2 text-xs font-semibold rounded-sm border transition-all ${
                  destinationType === 'warehouse'
                    ? 'bg-ink text-canvas border-ink shadow-sm'
                    : 'bg-canvas text-muted hover:text-ink border-hairline hover:border-ink/40'
                }`}
              >
                <Building2 className="w-3.5 h-3.5" />
                <span>Warehouse / Godown</span>
                {warehouses.length > 0 && (
                  <span className={`text-[10px] px-1.5 py-0.2 rounded font-normal ${destinationType === 'warehouse' ? 'bg-canvas/20 text-canvas' : 'bg-surface-soft text-muted'}`}>
                    {warehouses.length}
                  </span>
                )}
              </button>
            </div>

            {destinationType === 'warehouse' && (
              <div className="mt-2.5 bg-surface-soft border border-hairline p-2.5 rounded-sm animate-fade-in-up">
                {warehouses.length > 0 ? (
                  <div>
                    <label className="block text-[11px] font-medium text-muted uppercase tracking-wider mb-1.5 flex items-center gap-1">
                      <Building2 className="w-3 h-3 text-muted" /> Select Target Godown
                    </label>
                    <select
                      value={destinationWarehouseId}
                      onChange={(e) => setDestinationWarehouseId(Number(e.target.value))}
                      className="w-full px-3 py-2 bg-canvas border border-hairline rounded-sm focus:outline-none focus:border-ink font-medium text-ink text-xs cursor-pointer shadow-sm"
                    >
                      {warehouses.map((wh) => (
                        <option key={wh.id} value={wh.id}>
                          🏢 {wh.name} {wh.location ? `(${wh.location})` : ''} — {wh.total_quantity || 0} units stored
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <div className="text-xs text-amber-700 bg-amber-50 p-2.5 rounded border border-amber-200 flex items-center justify-between">
                    <span>No warehouses created yet.</span>
                    <button
                      type="button"
                      onClick={() => navigate('/inventory')}
                      className="underline font-semibold hover:text-amber-900 ml-2"
                    >
                      Add in Warehouses tab
                    </button>
                  </div>
                )}
              </div>
            )}
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
                  <input
                    type="number"
                    min="1"
                    value={item.purchase_qty === 0 ? '' : item.purchase_qty}
                    onChange={(e) => setQty(item.id, Number(e.target.value) || 0)}
                    className="w-12 text-center text-sm font-medium text-ink bg-transparent focus:outline-none"
                  />
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
      </div>

      {/* 2. Middle Column: Totals & Checkout */}
      <div className="w-[350px] bg-surface-soft flex flex-col z-10 relative border-r border-hairline shrink-0">
        <div className="flex-1 overflow-y-auto p-6">
          <h2 className="font-display font-medium text-xl mb-6 text-ink">Summary</h2>
          <div className="space-y-3">
            {enablePurchaseGST && purchaseTaxMethod === 'inclusive' ? (
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
            
            <div className="flex justify-between text-sm text-body mt-2 pt-2 border-t border-hairline">
              <span className="font-medium">Taxable Value</span>
              <span className="font-medium text-ink">₹{taxableValueSum.toFixed(2)}</span>
            </div>

            {enablePurchaseGST && (
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

            {/* Amount Paid */}
            <>
                <div className="flex justify-between items-center text-sm text-body pt-4 pb-2 border-t border-hairline mt-4">
                  <span className="font-medium text-ink">Amount Paid</span>
                  <div className="flex items-center gap-2">
                    <button onClick={payInFull} className="text-xs text-primary font-medium hover:underline">Pay Full</button>
                    <div className="flex items-center border-b border-hairline bg-transparent focus-within:border-ink transition-colors">
                      <span className="text-muted font-medium mr-1">₹</span>
                      <input
                        type="number" min="0" max={grandTotal}
                        value={paidAmount === 0 ? '' : paidAmount}
                        onChange={(e) => {
                          let val = Number(e.target.value) || 0;
                          if (val > grandTotal) val = Number(grandTotal.toFixed(2));
                          setPaidAmount(val);
                        }}
                        placeholder="0"
                        className="w-20 text-right bg-transparent focus:outline-none font-medium text-ink py-0.5"
                      />
                    </div>
                  </div>
                </div>
                {paidAmount < grandTotal && grandTotal > 0 && (
                  <div className="text-right text-xs text-signature-coral font-medium mt-1">
                    Balance ₹{(grandTotal - paidAmount).toFixed(2)} added to Supplier
                  </div>
                )}
              </>
          </div>
        </div>
        
        {/* Checkout Buttons */}
        <div className="p-4 bg-canvas border-t border-hairline flex flex-col gap-3">
          <button
            onClick={handleRecord}
            disabled={cart.length === 0 || supplierId === '' || invoiceNo.trim() === '' || isProcessing}
            title="Save / Record Purchase (Ctrl+S)"
            className={`w-full font-medium py-3 rounded-lg flex justify-center items-center text-base transition-colors ${cart.length === 0 || supplierId === '' || invoiceNo.trim() === '' || isProcessing ? 'bg-surface-strong text-muted cursor-not-allowed' : 'bg-primary hover:bg-primary-active text-on-primary'}`}
          >
            <IndianRupee className="w-4 h-4 mr-2" /> {isProcessing ? 'Processing...' : (editPurchaseId ? 'Update Purchase Bill (Ctrl+S)' : 'Record Purchase (Ctrl+S)')}
          </button>
          <button 
            onClick={() => {
              setCart([]);
              setSupplierId('');
              setSupplierSearch('');
              setInvoiceNo('');
            }}
            disabled={cart.length === 0}
            className={`w-full font-medium py-2 rounded-lg transition-colors text-sm ${cart.length === 0 ? 'bg-transparent text-muted cursor-not-allowed' : 'bg-transparent text-muted hover:bg-surface-strong hover:text-danger'}`}
          >
            Clear Cart
          </button>
        </div>
      </div>

      {/* 3. Right Column: Product Search */}
      <div className="w-[350px] flex flex-col p-6 border-l border-hairline overflow-hidden bg-surface-soft">
        <header className="mb-6 text-center">
          <h1 className="text-2xl font-display font-medium text-ink tracking-tight">Products</h1>
          <p className="text-sm text-body mt-1">Add to purchase</p>
        </header>

        <div className="relative w-full mb-6 z-20 shrink-0">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted w-4 h-4" />
            <input
              type="text"
              placeholder="Search products to add..."
              className="w-full pl-9 pr-3 py-2.5 text-sm bg-canvas border border-hairline rounded-sm shadow-sm focus:outline-none focus:border-primary transition-colors text-ink placeholder-muted"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={handleKeyDown}
              autoFocus
            />
          </div>

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
                        <div className="text-xs text-muted mt-0.5">Current Stock: {p.stock_quantity}</div>
                      </div>
                      <div className="font-medium text-ink text-sm">₹{p.purchase_price.toFixed(2)}</div>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="p-4 text-center text-sm text-muted">No products found</div>
              )}
            </div>
          )}
        </div>

        {search.trim() === '' && cart.length === 0 && (
          <div className="flex-1 flex flex-col items-center justify-center text-muted opacity-60">
            <Search className="w-10 h-10 mb-4" />
            <p className="font-medium text-sm">Type to search</p>
          </div>
        )}
      </div>

    </div>
  );
}
