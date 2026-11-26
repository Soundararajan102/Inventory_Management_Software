import { useState, useEffect, useRef } from 'react';
import { Search, X, Truck, FileText, IndianRupee, Store, Building2, Edit, Eye, Plus, ShoppingCart, Calendar, Printer } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { getSellableProducts, getSuppliers, recordPurchase, getPurchaseById, updatePurchaseBill, getWarehouses, addSupplier } from '../lib/db';
import type { Product, Supplier, PurchaseItem, Warehouse } from '../lib/db';
import { PrintableReport } from '../components/PrintableReport';
import type { PrintableReportData } from '../components/PrintableReport';

export default function Purchases() {
  const [paymentMethod, setPaymentMethod] = useState<'Cash' | 'Bank Transfer' | 'Cheque' | 'UPI'>('Cash');
  const [purchasePrintData, setPurchasePrintData] = useState<PrintableReportData | null>(null);

  useEffect(() => {
    const handleAfterPrint = () => setPurchasePrintData(null);
    window.addEventListener('afterprint', handleAfterPrint);
    return () => window.removeEventListener('afterprint', handleAfterPrint);
  }, []);
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
  const viewPurchaseIdParam = searchParams.get('viewId');
  const editPurchaseId = editPurchaseIdParam ? Number(editPurchaseIdParam) : undefined;
  const viewPurchaseId = viewPurchaseIdParam ? Number(viewPurchaseIdParam) : undefined;
  const isPurchaseViewOnly = Boolean(viewPurchaseId && !editPurchaseId);
  const activePurchaseId = editPurchaseId || viewPurchaseId;

  const [cart, setCart] = useState<PurchaseItem[]>([]);
  const [editingPurchaseInvoiceNo, setEditingPurchaseInvoiceNo] = useState<string | null>(null);
  const [loadedPurchaseRecord, setLoadedPurchaseRecord] = useState<any>(null);

  // Global Edit Mode Lock flag for app-wide navigation prevention
  useEffect(() => {
    if (activePurchaseId) {
      (window as any).__isEditingActive = true;
    } else {
      (window as any).__isEditingActive = false;
    }
    return () => {
      (window as any).__isEditingActive = false;
    };
  }, [activePurchaseId]);

  function handleExitPurchase() {
    (window as any).__isEditingActive = false;
    if (location.state?.from === 'contacts' && location.state?.partyId) {
      navigate('/contacts', {
        state: {
          activeTab: location.state.partyType || 'suppliers',
          selectedPartyId: location.state.partyId
        }
      });
    } else {
      navigate('/daybook', { 
        state: { 
          activeTab: 'purchases',
          startDate: (location.state as any)?.startDate,
          endDate: (location.state as any)?.endDate
        } 
      });
    }
  }

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

  // Quick Add Supplier state & handlers
  const [isQuickSupplierModalOpen, setIsQuickSupplierModalOpen] = useState(false);
  const [quickSupplierName, setQuickSupplierName] = useState('');
  const [quickSupplierPhone, setQuickSupplierPhone] = useState('');
  const [quickSupplierGstin, setQuickSupplierGstin] = useState('');
  const [quickSupplierAddress, setQuickSupplierAddress] = useState('');
  const [isSavingQuickSupplier, setIsSavingQuickSupplier] = useState(false);

  function openQuickSupplierModal(initialName: string = '') {
    setQuickSupplierName(initialName);
    setQuickSupplierPhone('');
    setQuickSupplierGstin('');
    setQuickSupplierAddress('');
    setIsQuickSupplierModalOpen(true);
  }

  function closeQuickSupplierModal() {
    setIsQuickSupplierModalOpen(false);
    setQuickSupplierName('');
    setQuickSupplierPhone('');
    setQuickSupplierGstin('');
    setQuickSupplierAddress('');
  }

  async function handleSaveQuickSupplier(e: React.FormEvent) {
    e.preventDefault();
    if (!quickSupplierName.trim()) return;

    try {
      setIsSavingQuickSupplier(true);
      const cleanName = quickSupplierName.trim();
      const cleanPhone = quickSupplierPhone.trim();
      const cleanGstin = quickSupplierGstin.replace(/\s+/g, '').toUpperCase();
      const cleanAddress = quickSupplierAddress.trim();

      const newId = await addSupplier(cleanName, cleanPhone, '', cleanAddress, cleanGstin);
      const updatedList = await getSuppliers();
      setSuppliers(updatedList);
      setSupplierId(newId);
      setSupplierSearch(cleanName);
      closeQuickSupplierModal();
      setIsSupplierDropdownOpen(false);
    } catch (err) {
      console.error('Failed to create supplier:', err);
      alert(`Error creating supplier: ${err}`);
    } finally {
      setIsSavingQuickSupplier(false);
    }
  }

  // Global Escape key handler to cancel active purchase view/edit or close quick supplier modal
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isQuickSupplierModalOpen) {
          setIsQuickSupplierModalOpen(false);
          return;
        }
        if (isSupplierDropdownOpen) {
          setIsSupplierDropdownOpen(false);
          return;
        }
        if (activePurchaseId) {
          e.preventDefault();
          handleExitPurchase();
        }
      }
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [activePurchaseId, isQuickSupplierModalOpen, isSupplierDropdownOpen, location.state]);

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
    if (activePurchaseId) {
      loadEditData(activePurchaseId);
    }
  }, [activePurchaseId]);

  async function loadEditData(id: number) {
    try {
      const p = await getPurchaseById(id);
      if (p) {
        if (editPurchaseId && (p.status === 'Returned' || (p.items && p.items.some(i => (i.returned_quantity || 0) > 0)))) {
          alert(`Purchase #${p.invoice_number || id} has return records and cannot be edited. Opening in Read-Only View mode.`);
          navigate(`/purchases?viewId=${id}`, { replace: true });
          return;
        }

        setLoadedPurchaseRecord(p);
        setEditingPurchaseInvoiceNo(p.invoice_number || `Purchase #${p.id}`);
        setSupplierId(p.entity_id);
        setInvoiceNo(p.invoice_number || '');
        if (p.date) setSupplierInvoiceDate(p.date.split(' ')[0]);
        if (p.destination_type) {
          setDestinationType(p.destination_type as 'shop' | 'warehouse');
        }
        if (p.destination_warehouse_id) {
          setDestinationWarehouseId(p.destination_warehouse_id);
        }
        setCart(p.items.map(i => {
          const lineGross = Number(i.unit_price || 0) * Number(i.quantity || 0);
          let pct = Number((i as any).discount_percent || 0);
          if ((pct <= 0 || pct > 100) && Number((i as any).discount || 0) > 0 && lineGross > 0) {
            pct = Math.min(100, Math.max(0, Number(((Number((i as any).discount) / lineGross) * 100).toFixed(2))));
          } else {
            pct = Math.min(100, Math.max(0, pct));
          }
          return {
            id: i.product_id,
            name: i.name,
            model: i.model,
            purchase_price: i.unit_price,
            purchase_qty: i.quantity,
            unit: i.unit,
            hsn_code: i.hsn_code,
            cgst_percentage: i.cgst_percentage,
            sgst_percentage: i.sgst_percentage,
            gst_percentage: i.gst_percentage,
            discount: pct,
            discount_type: 'percentage',
            discount_percent: pct
          } as PurchaseItem;
        }));

        let billPct = Number(p.discount_percent || 0);
        if ((billPct <= 0 || billPct > 100) && Number(p.discount || 0) > 0) {
          const totalGross = p.items.reduce((sum, item) => sum + (Number(item.unit_price || 0) * Number(item.quantity || 0)), 0);
          const totalItemDiscs = p.items.reduce((sum, item) => sum + Number((item as any).discount || 0), 0);
          const netBasis = Math.max(1, totalGross - totalItemDiscs);
          billPct = Math.min(100, Math.max(0, Number(((Number(p.discount) / netBasis) * 100).toFixed(2))));
        } else {
          billPct = Math.min(100, Math.max(0, billPct));
        }
        setDiscountType('percentage');
        setDiscount(billPct);
        if (p.tax_method) {
          setPurchaseTaxMethod(p.tax_method);
        }
        setPaidAmount(p.paid_amount || 0);
        if (p.payment_method) setPaymentMethod(p.payment_method as any);
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
    if (isPurchaseViewOnly) return;
    setCart(prev => {
      const existing = prev.find(item => item.id === product.id);
      if (existing) {
        return prev.map(item =>
          item.id === product.id ? { ...item, purchase_qty: item.purchase_qty + 1 } : item
        );
      }
      return [...prev, { ...product, purchase_qty: 1, discount: 0, discount_type: 'percentage', discount_percent: 0 }];
    });
    setSearch('');
  }

  function setQty(id: number, qty: number) {
    if (isPurchaseViewOnly) return;
    setCart(prev => prev.map(item => {
      if (item.id === id) {
        return { ...item, purchase_qty: Math.max(0, qty) };
      }
      return item;
    }));
  }

  function updateRate(id: number, newRate: number) {
    if (isPurchaseViewOnly) return;
    const cleanRate = Math.max(0, Number(newRate) || 0);
    setCart(prev => prev.map(item => {
      if (item.id === id) {
        return { ...item, purchase_price: cleanRate };
      }
      return item;
    }));
  }

  function removeFromCart(id: number) {
    if (isPurchaseViewOnly) return;
    setCart(prev => prev.filter(item => item.id !== id));
  }

  function updateItemDiscount(id: number, val: number) {
    if (isPurchaseViewOnly) return;
    setCart(prev => prev.map(item => {
      if (item.id !== id) return item;
      let cleanVal = Math.max(0, val);
      if (cleanVal > 100) cleanVal = 100;
      return {
        ...item,
        discount: cleanVal,
        discount_percent: cleanVal,
        discount_type: 'percentage'
      };
    }));
  }

  // Step 1: Calculate Gross Price and Product-Wise Discounts (% only)
  let originalPriceBasis = 0;
  let totalItemDiscounts = 0;
  let netPriceBasisAfterItemDiscounts = 0;

  cart.forEach(item => {
    const lineGross = (item.purchase_price || 0) * (item.purchase_qty || 0);
    const discPct = Math.min(100, Math.max(0, item.discount_percent !== undefined ? item.discount_percent : (item.discount || 0)));
    const lineDiscAmt = (lineGross * discPct) / 100;
    const lineNet = Math.max(0, lineGross - lineDiscAmt);

    originalPriceBasis += lineGross;
    totalItemDiscounts += lineDiscAmt;
    netPriceBasisAfterItemDiscounts += lineNet;
  });

  // Step 2: Calculate the Displayed Bill Discount Amount (% only)
  const sanitizedDiscount = Math.min(100, Math.max(0, discount));
  const displayDiscountAmount = (netPriceBasisAfterItemDiscounts * sanitizedDiscount) / 100;

  // Calculate the ratio of discount to remaining net price (strictly clamped between 0 and 1)
  const discountRatio = netPriceBasisAfterItemDiscounts > 0 ? Math.min(1, displayDiscountAmount / netPriceBasisAfterItemDiscounts) : 0;

  // Step 3: Iterate through items and calculate Taxable Value and Tax per item
  let taxableValueSum = 0;
  let taxSum = 0;
  const taxBreakdown = { cgst: {} as Record<number, number>, sgst: {} as Record<number, number> };

  cart.forEach(item => {
    const lineGross = (item.purchase_price || 0) * (item.purchase_qty || 0);
    const discPct = Math.min(100, Math.max(0, item.discount_percent !== undefined ? item.discount_percent : (item.discount || 0)));
    const lineDiscAmt = (lineGross * discPct) / 100;
    const lineNet = Math.max(0, lineGross - lineDiscAmt);
    const discountedItemPrice = lineNet * (1 - discountRatio); // Amount after bill discount
    
    let cgst = item.cgst_percentage || 0;
    let sgst = item.sgst_percentage || 0;
    const totalGst = item.gst_percentage !== undefined ? item.gst_percentage : (cgst + sgst);
    if (totalGst > 0 && cgst === 0 && sgst === 0) {
      cgst = totalGst / 2;
      sgst = totalGst / 2;
    }
    const gstPercent = cgst + sgst;
    
    let taxableValue = discountedItemPrice;
    if (enablePurchaseGST && purchaseTaxMethod === 'inclusive') {
      taxableValue = gstPercent > 0 ? discountedItemPrice / (1 + (gstPercent / 100)) : discountedItemPrice;
    }

    taxableValueSum += taxableValue;

    if (enablePurchaseGST) {
      if (cgst > 0) {
        taxBreakdown.cgst[cgst] = (taxBreakdown.cgst[cgst] || 0) + (taxableValue * (cgst / 100));
      }
      if (sgst > 0) {
        taxBreakdown.sgst[sgst] = (taxBreakdown.sgst[sgst] || 0) + (taxableValue * (sgst / 100));
      }
      
      taxSum += taxableValue * ((cgst + sgst) / 100);
    }
  });

  if (isPurchaseViewOnly && loadedPurchaseRecord) {
    if (loadedPurchaseRecord.status === 'Returned') {
      taxableValueSum = 0;
      taxSum = 0;
      taxBreakdown.cgst = {};
      taxBreakdown.sgst = {};
    } else {
      if (loadedPurchaseRecord.taxable_amount !== undefined && loadedPurchaseRecord.taxable_amount !== null) {
        taxableValueSum = loadedPurchaseRecord.taxable_amount;
      }
      if (loadedPurchaseRecord.item_discount_amount !== undefined && loadedPurchaseRecord.item_discount_amount !== null) {
        totalItemDiscounts = loadedPurchaseRecord.item_discount_amount;
      }
      if (loadedPurchaseRecord.items && Array.isArray(loadedPurchaseRecord.items)) {
        const dbCgst: Record<number, number> = {};
        const dbSgst: Record<number, number> = {};
        let activeTaxSum = 0;
        let hasLineTaxes = false;

        loadedPurchaseRecord.items.forEach((it: any) => {
          const cgstPct = it.cgst_percentage || 0;
          const sgstPct = it.sgst_percentage || 0;
          const origQty = it.quantity || 1;
          const retQty = Math.min(origQty, Number(it.returned_quantity || 0));
          const activeQty = Math.max(0, origQty - retQty);
          const activeRatio = origQty > 0 ? (activeQty / origQty) : 1;
          const lineTax = (it.tax || 0) * activeRatio;

          if (cgstPct > 0 || sgstPct > 0) {
            hasLineTaxes = true;
            const halfTax = lineTax > 0 ? (lineTax / 2) : 0;
            if (cgstPct > 0) dbCgst[cgstPct] = (dbCgst[cgstPct] || 0) + halfTax;
            if (sgstPct > 0) dbSgst[sgstPct] = (dbSgst[sgstPct] || 0) + halfTax;
            activeTaxSum += lineTax;
          }
        });

        // Scale active line taxes to match loadedPurchaseRecord.tax_amount exactly
        const expectedTax = loadedPurchaseRecord.tax_amount !== undefined && loadedPurchaseRecord.tax_amount !== null
          ? Number(Number(loadedPurchaseRecord.tax_amount).toFixed(2))
          : Number(activeTaxSum.toFixed(2));

        if (expectedTax === 0) {
          taxBreakdown.cgst = {};
          taxBreakdown.sgst = {};
        } else if (hasLineTaxes && activeTaxSum > 0) {
          const scale = expectedTax / activeTaxSum;
          const scaledCgst: Record<number, number> = {};
          const scaledSgst: Record<number, number> = {};
          let allocatedTax = 0;
          for (const [k, v] of Object.entries(dbCgst)) {
            const val = Math.round(v * scale * 100) / 100;
            scaledCgst[Number(k)] = val;
            allocatedTax += val;
          }
          for (const [k, v] of Object.entries(dbSgst)) {
            const val = Math.round(v * scale * 100) / 100;
            scaledSgst[Number(k)] = val;
            allocatedTax += val;
          }
          const diff = Math.round((expectedTax - allocatedTax) * 100) / 100;
          if (diff !== 0) {
            const firstSgstKey = Number(Object.keys(scaledSgst)[0]);
            const firstCgstKey = Number(Object.keys(scaledCgst)[0]);
            if (!isNaN(firstSgstKey) && scaledSgst[firstSgstKey] !== undefined) {
              scaledSgst[firstSgstKey] = Number((scaledSgst[firstSgstKey] + diff).toFixed(2));
            } else if (!isNaN(firstCgstKey) && scaledCgst[firstCgstKey] !== undefined) {
              scaledCgst[firstCgstKey] = Number((scaledCgst[firstCgstKey] + diff).toFixed(2));
            }
          }
          taxBreakdown.cgst = scaledCgst;
          taxBreakdown.sgst = scaledSgst;
        } else if (hasLineTaxes) {
          taxBreakdown.cgst = dbCgst;
          taxBreakdown.sgst = dbSgst;
        }
      }
    }
  }

  const rawExactGrandTotal = Math.max(0, taxableValueSum + taxSum);
  const grandTotal: number = isPurchaseViewOnly && loadedPurchaseRecord ? loadedPurchaseRecord.net_amount : Math.round(rawExactGrandTotal);
  const roundOff: number = isPurchaseViewOnly && loadedPurchaseRecord
    ? (loadedPurchaseRecord.round_off !== undefined && loadedPurchaseRecord.round_off !== null ? loadedPurchaseRecord.round_off : 0)
    : Number((grandTotal - rawExactGrandTotal).toFixed(2));
  const subtotal = isPurchaseViewOnly && loadedPurchaseRecord ? (loadedPurchaseRecord.total_amount || originalPriceBasis) : originalPriceBasis;
  const tax = isPurchaseViewOnly && loadedPurchaseRecord ? (loadedPurchaseRecord.tax_amount ?? taxSum) : taxSum;
  const discountAmount = isPurchaseViewOnly && loadedPurchaseRecord ? (loadedPurchaseRecord.discount || 0) : displayDiscountAmount;
  const returnedAmountSum = isPurchaseViewOnly && loadedPurchaseRecord && loadedPurchaseRecord.items
    ? Number(loadedPurchaseRecord.items.reduce((sum: number, it: any) => {
        const effPrice = (it.net_amount && it.quantity > 0) ? (it.net_amount / it.quantity) : Number(it.unit_price || 0);
        return sum + (Number(it.returned_quantity || 0) * effPrice);
      }, 0).toFixed(2))
    : 0;

  const originalNetBasis = Math.max(0, subtotal - totalItemDiscounts - discountAmount);
  const returnedGoodsDeduction = isPurchaseViewOnly && loadedPurchaseRecord
    ? (loadedPurchaseRecord.status === 'Returned' 
        ? (purchaseTaxMethod === 'exclusive' ? Number(((loadedPurchaseRecord.taxable_amount || subtotal) + (loadedPurchaseRecord.tax_amount || 0) - discountAmount).toFixed(2)) : originalNetBasis)
        : (returnedAmountSum > 0 ? returnedAmountSum : Math.max(0, originalNetBasis - grandTotal)))
    : 0;

  // Auto-fill paid amount with grand total if they want to pay in full
  function payInFull() {
    setPaidAmount(Number(grandTotal.toFixed(2)));
  }

  const handlePrintPurchase = () => {
    if (!loadedPurchaseRecord) return;
    const supp = suppliers.find(s => s.id === loadedPurchaseRecord.entity_id);
    setPurchasePrintData({
      reportTitle: 'PURCHASE INWARD VOUCHER',
      subTitle: `Invoice #${loadedPurchaseRecord.invoice_number || ''}`,
      dateRange: loadedPurchaseRecord.date ? loadedPurchaseRecord.date.split(' ')[0] : '',
      partyDetails: {
        name: loadedPurchaseRecord.entity_name || 'Supplier',
        phone: supp?.phone || undefined,
        address: supp?.address || undefined,
        gstin: supp?.gstin ? supp.gstin.toUpperCase() : undefined,
        type: 'Supplier'
      },
      summaryCards: [
        { label: 'Subtotal', value: `₹${(loadedPurchaseRecord.total_amount || subtotal).toFixed(2)}` },
        { label: 'Total Tax', value: `₹${(loadedPurchaseRecord.tax_amount || tax).toFixed(2)}` },
        { label: 'Grand Total', value: `₹${(loadedPurchaseRecord.net_amount || grandTotal).toFixed(2)}`, highlight: true },
        { label: 'Paid / Method', value: `₹${(loadedPurchaseRecord.paid_amount || paidAmount).toFixed(2)} (${paymentMethod})` }
      ],
      columns: [
        { header: 'Product', accessor: 'name' },
        { header: 'Model', accessor: 'model' },
        { header: 'Qty', accessor: 'qtyDisplay', align: 'center' },
        { header: 'Rate (₹)', accessor: 'rateDisplay', align: 'right' },
        { header: 'Disc %', accessor: 'discDisplay', align: 'right' },
        { header: 'Taxable (₹)', accessor: 'taxableDisplay', align: 'right' },
        { header: 'GST %', accessor: 'gstDisplay', align: 'center' },
        { header: 'Total (₹)', accessor: 'totalDisplay', align: 'right' }
      ],
      rows: cart.map(i => {
        const lineGross = (i.purchase_price || 0) * (i.purchase_qty || 0);
        const lineDisc = (lineGross * Number(i.discount || 0)) / 100;
        const lineAfterDisc = Math.max(0, lineGross - lineDisc);
        const gstPct = i.gst_percentage || 0;
        let taxable = (i as any).taxable_amount;
        let netTotal = (i as any).net_amount;
        const effectiveTaxMethod = (loadedPurchaseRecord as any)?.tax_method || purchaseTaxMethod;
        if (taxable === undefined || netTotal === undefined) {
          if (effectiveTaxMethod === 'inclusive') {
            taxable = gstPct > 0 ? lineAfterDisc / (1 + gstPct / 100) : lineAfterDisc;
            netTotal = lineAfterDisc;
          } else {
            taxable = lineAfterDisc;
            netTotal = taxable + taxable * (gstPct / 100);
          }
        }
        return {
          name: i.name,
          model: i.model || '-',
          qtyDisplay: `${i.purchase_qty} ${i.unit || ''}`,
          rateDisplay: `₹${(i.purchase_price || 0).toFixed(2)}`,
          discDisplay: Number(i.discount || 0) > 0 ? `${i.discount}%` : '-',
          taxableDisplay: `₹${taxable.toFixed(2)}`,
          gstDisplay: `${gstPct}%`,
          totalDisplay: `₹${netTotal.toFixed(2)}`
        };
      }),
      totalRow: {
        name: '',
        model: '',
        qtyDisplay: `${cart.reduce((s, i) => s + i.purchase_qty, 0)} Items`,
        rateDisplay: '',
        discDisplay: '',
        taxableDisplay: `₹${taxableValueSum.toFixed(2)}`,
        gstDisplay: `₹${tax.toFixed(2)}`,
        totalDisplay: `₹${grandTotal.toFixed(2)}`
      }
    });

    setTimeout(() => {
      window.print();
    }, 150);
  };

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
      const effectivePaid = Math.min(paidAmount, grandTotal);
      const discountPct = discountType === 'percentage' ? discount : (netPriceBasisAfterItemDiscounts > 0 ? Number(((discountAmount / netPriceBasisAfterItemDiscounts) * 100).toFixed(2)) : 0);

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
          effectivePaid,
          destinationType,
          destinationType === 'warehouse' ? Number(destinationWarehouseId) : null,
          discountType,
          discountPct,
          purchaseTaxMethod,
          roundOff,
          taxableValueSum,
          paymentMethod
        );
        alert('Purchase bill updated successfully!');
        (window as any).__isEditingActive = false;
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
          effectivePaid,
          destinationType,
          destinationType === 'warehouse' ? Number(destinationWarehouseId) : null,
          discountType,
          discountPct,
          purchaseTaxMethod,
          roundOff,
          taxableValueSum,
          paymentMethod
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
    <>
      <PrintableReport data={purchasePrintData} />
      {/* Main Full-Height Container with Unified Full-Width Header */}
      <div className="flex flex-col h-full bg-canvas print:hidden overflow-hidden">
        
        {/* Unified Top Header Bar Across All 3 Columns */}
        <header className="h-14 px-6 border-b border-hairline bg-canvas flex items-center justify-between shrink-0 z-20">
          
          {/* Left: Mode Badge & Realtime Invoice Info */}
          <div className="flex items-center gap-4">
            
            {/* Purchase Mode Badge */}
            <div className="flex items-center bg-surface-soft p-1 rounded-lg border border-hairline">
              <div className="px-3 py-1.5 text-xs font-semibold rounded-md flex items-center gap-1.5 bg-canvas text-ink shadow-xs">
                <Truck className="w-3.5 h-3.5 text-primary" />
                <span>Purchase Inward</span>
              </div>
            </div>

            {/* Live Invoice Number & Date Input Pills */}
            <div className="flex items-center gap-2.5">
              <div className="h-9 flex items-center gap-2 bg-surface-soft px-3 rounded-lg border border-hairline shadow-2xs focus-within:border-primary focus-within:bg-canvas transition-colors" title="Supplier Invoice Number">
                <span className="text-xs font-semibold text-muted uppercase">Inv:</span>
                <input
                  type="text"
                  disabled={isPurchaseViewOnly}
                  value={invoiceNo}
                  onChange={e => setInvoiceNo(e.target.value)}
                  placeholder="INV-1001"
                  className={`bg-transparent text-sm font-bold text-ink tracking-tight font-display w-28 focus:outline-none placeholder:text-muted/60 placeholder:font-normal ${isPurchaseViewOnly ? 'cursor-not-allowed opacity-80' : ''}`}
                />
              </div>

              <div className="h-9 flex items-center gap-2 bg-surface-soft px-3 rounded-lg border border-hairline shadow-2xs" title="Invoice Date (Click to change date)">
                <Calendar className="w-4 h-4 text-primary shrink-0" />
                <input
                  type="date"
                  value={supplierInvoiceDate}
                  disabled={isPurchaseViewOnly}
                  onChange={(e) => setSupplierInvoiceDate(e.target.value)}
                  className={`bg-transparent text-sm font-semibold text-ink focus:outline-none ${isPurchaseViewOnly ? 'cursor-not-allowed opacity-80' : 'cursor-pointer'}`}
                />
                {!isPurchaseViewOnly && supplierInvoiceDate !== getLocalDate() && (
                  <button
                    type="button"
                    onClick={() => setSupplierInvoiceDate(getLocalDate())}
                    className="text-[11px] text-primary hover:underline font-bold px-1.5 py-0.5 rounded bg-primary/10 ml-0.5"
                    title="Reset to today"
                  >
                    Today
                  </button>
                )}
              </div>
            </div>

            {/* Viewing Bill Notice Pill (Read-Only) */}
            {isPurchaseViewOnly && (
              <div className={`h-9 flex items-center gap-1.5 text-xs ${
                loadedPurchaseRecord?.status === 'Returned'
                  ? 'bg-red-500/10 text-red-700 dark:text-red-400 border border-red-500/30'
                  : loadedPurchaseRecord?.status === 'Partially Returned'
                  ? 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/30'
                  : 'bg-primary/10 text-primary border border-primary/25'
              } px-3 rounded-lg font-semibold shadow-2xs`}>
                <Eye className="w-4 h-4 shrink-0" />
                <span>Viewing {editingPurchaseInvoiceNo || invoiceNo || `#${activePurchaseId}`}</span>
                {loadedPurchaseRecord?.status === 'Returned' ? (
                  <span className="text-[10px] bg-red-600 text-white px-2 py-0.5 rounded font-bold uppercase tracking-wider shadow-2xs">
                    RETURNED / VOID
                  </span>
                ) : loadedPurchaseRecord?.status === 'Partially Returned' ? (
                  <span className="text-[10px] bg-amber-600 text-white px-2 py-0.5 rounded font-bold uppercase tracking-wider shadow-2xs">
                    PARTIALLY RETURNED
                  </span>
                ) : (
                  <span className="text-[10px] bg-primary/20 text-primary px-1.5 py-0.5 rounded font-medium">Read-Only</span>
                )}
                <button
                  type="button"
                  onClick={handleExitPurchase}
                  className={`ml-2 px-2 py-0.5 text-xs font-semibold bg-canvas ${
                    loadedPurchaseRecord?.status === 'Returned'
                      ? 'text-red-700 hover:bg-red-600 hover:text-white border-red-500/30'
                      : 'text-primary hover:bg-primary hover:text-on-primary border-primary/30'
                  } rounded border flex items-center gap-1 cursor-pointer transition-colors shadow-2xs`}
                  title={location.state?.from === 'contacts' ? "Close viewing purchase bill and return to Supplier Profile (Esc)" : "Close viewing purchase bill and return to Day Book (Esc)"}
                >
                  <span>Close</span>
                  <X className="w-3 h-3" />
                </button>
              </div>
            )}

            {/* Editing Bill Notice Pill */}
            {editPurchaseId && (
              <div className="h-9 flex items-center gap-1.5 text-xs bg-primary/10 text-primary border border-primary/25 px-3 rounded-lg font-semibold shadow-2xs">
                <Edit className="w-4 h-4 shrink-0" />
                <span>Editing {editingPurchaseInvoiceNo || invoiceNo || `#${editPurchaseId}`}</span>
                <button
                  type="button"
                  onClick={handleExitPurchase}
                  className="ml-2 px-2 py-0.5 text-xs font-semibold bg-canvas text-primary hover:bg-primary hover:text-on-primary rounded border border-primary/30 flex items-center gap-1 cursor-pointer transition-colors shadow-2xs"
                  title={location.state?.from === 'contacts' ? "Cancel editing purchase bill and return to Supplier Profile (Esc)" : "Cancel editing purchase bill and return to Day Book (Esc)"}
                >
                  <span>Cancel</span>
                  <X className="w-3 h-3" />
                </button>
              </div>
            )}

          </div>

          {/* Right: Quick DayBook (Purchases) Button */}
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={handleExitPurchase}
              className="px-3.5 py-1.5 text-xs font-semibold bg-surface-soft hover:bg-surface-strong border border-hairline rounded-lg text-ink flex items-center gap-2 transition-colors shadow-xs cursor-pointer"
              title={location.state?.from === 'contacts' ? "Return to Supplier Profile" : "View Purchases in Day Book"}
            >
              <FileText className="w-3.5 h-3.5 text-primary" />
              <span>Purchases List</span>
            </button>
          </div>
        </header>

        {/* 3 Columns Body - Perfectly Aligned at the Exact Same Baseline */}
        <div className="flex flex-row flex-1 overflow-hidden">
          
          {/* Column 1: Supplier, Stock Destination & Cart Items */}
          <div className="flex-1 flex flex-col p-5 overflow-hidden border-r border-hairline min-w-0">
            
            {/* Row 1: Supplier Selection Row (1:1 with POS Customer Selection) */}
            <div className="flex items-center gap-3 mb-3 shrink-0">
              <div className="relative flex-1">
                <Truck className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted w-4 h-4 pointer-events-none" />
                <input
                  type="text"
                  placeholder="Search Supplier (or select)..."
                  disabled={isPurchaseViewOnly}
                  className={`w-full pl-10 pr-9 py-2.5 bg-canvas border border-hairline rounded-lg text-sm focus:outline-none focus:border-primary transition-colors text-ink placeholder-muted font-medium ${isPurchaseViewOnly ? 'opacity-80 cursor-not-allowed' : ''}`}
                  value={supplierSearch}
                  onChange={(e) => {
                    setSupplierSearch(e.target.value);
                    setIsSupplierDropdownOpen(true);
                    if (e.target.value === '') setSupplierId('');
                  }}
                  onFocus={() => { if (!isPurchaseViewOnly) setIsSupplierDropdownOpen(true); }}
                />
                {supplierSearch && !isPurchaseViewOnly && (
                  <button
                    type="button"
                    onClick={() => {
                      setSupplierSearch('');
                      setSupplierId('');
                    }}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-ink p-0.5"
                    title="Clear Supplier"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}

                {isSupplierDropdownOpen && !isPurchaseViewOnly && (
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
                          className="p-3 hover:bg-surface-soft cursor-pointer text-sm font-medium text-muted"
                        >
                          -- Select Supplier --
                        </li>
                        {filteredSuppliers.length === 0 && supplierSearch.trim() !== '' && (
                          <li className="p-3 text-center text-xs text-muted">
                            No suppliers found
                          </li>
                        )}
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
                            <div className="flex items-center gap-1.5">
                              {s.balance > 0 && <span className="text-xs text-signature-coral font-medium">Due: ₹{s.balance.toFixed(0)}</span>}
                              {(s.advance_balance || 0) > 0 && <span className="text-xs text-emerald-600 font-semibold">Adv: ₹{(s.advance_balance || 0).toFixed(0)}</span>}
                            </div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </>
                )}
              </div>

              {!isPurchaseViewOnly && (
                <button
                  type="button"
                  onClick={() => openQuickSupplierModal(supplierSearch.trim())}
                  className="px-3.5 py-2.5 text-xs font-semibold text-primary hover:bg-surface-soft border border-hairline rounded-lg transition-colors flex items-center gap-1.5 shrink-0 shadow-2xs cursor-pointer active:scale-95"
                  title="Add new supplier"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>New</span>
                </button>
              )}
            </div>

            {/* Row 2: Stock Inward Destination Segmented Bar */}
            <div className="mb-4 bg-surface-soft border border-hairline rounded-lg p-2.5 shrink-0 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-muted uppercase tracking-wider flex items-center gap-1.5">
                  <Store className="w-3.5 h-3.5 text-primary" />
                  <span>Stock Inward Destination *</span>
                </span>
                <span className="text-[11px] font-medium text-muted">
                  {destinationType === 'shop' ? 'Direct to Main Store' : 'Direct to Godown'}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  disabled={isPurchaseViewOnly}
                  onClick={() => setDestinationType('shop')}
                  className={`flex items-center justify-center gap-2 py-2 px-3 text-xs font-semibold rounded-md border transition-all cursor-pointer ${
                    destinationType === 'shop'
                      ? 'bg-ink text-canvas border-ink shadow-xs'
                      : 'bg-canvas text-muted hover:text-ink border-hairline hover:bg-surface-soft'
                  } ${isPurchaseViewOnly ? 'opacity-80 cursor-not-allowed' : ''}`}
                >
                  <Store className="w-3.5 h-3.5" />
                  <span>Main Shop</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-normal ${
                    destinationType === 'shop' ? 'bg-canvas/20 text-canvas' : 'bg-surface-soft text-muted'
                  }`}>Default</span>
                </button>

                <button
                  type="button"
                  disabled={isPurchaseViewOnly}
                  onClick={() => setDestinationType('warehouse')}
                  className={`flex items-center justify-center gap-2 py-2 px-3 text-xs font-semibold rounded-md border transition-all cursor-pointer ${
                    destinationType === 'warehouse'
                      ? 'bg-ink text-canvas border-ink shadow-xs'
                      : 'bg-canvas text-muted hover:text-ink border-hairline hover:bg-surface-soft'
                  } ${isPurchaseViewOnly ? 'opacity-80 cursor-not-allowed' : ''}`}
                >
                  <Building2 className="w-3.5 h-3.5" />
                  <span>Warehouse / Godown</span>
                  {warehouses.length > 0 && (
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-normal ${
                      destinationType === 'warehouse' ? 'bg-canvas/20 text-canvas' : 'bg-surface-soft text-muted'
                    }`}>
                      {warehouses.length}
                    </span>
                  )}
                </button>
              </div>

              {destinationType === 'warehouse' && (
                <div className="pt-0.5">
                  {warehouses.length > 0 ? (
                    <div className="flex items-center gap-2 bg-canvas px-3 py-1.5 rounded-md border border-hairline shadow-2xs">
                      <Building2 className="w-3.5 h-3.5 text-primary shrink-0" />
                      <span className="text-[11px] font-semibold text-muted uppercase shrink-0">Select Godown:</span>
                      <select
                        value={destinationWarehouseId}
                        disabled={isPurchaseViewOnly}
                        onChange={(e) => setDestinationWarehouseId(Number(e.target.value))}
                        className={`flex-1 bg-transparent text-xs font-semibold text-ink focus:outline-none cursor-pointer truncate ${isPurchaseViewOnly ? 'cursor-not-allowed opacity-80' : ''}`}
                      >
                        {warehouses.map((wh) => (
                          <option key={wh.id} value={wh.id}>
                            🏢 {wh.name} {wh.location ? `(${wh.location})` : ''} {wh.total_quantity ? `— ${wh.total_quantity} pcs stored` : ''}
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : (
                    <div className="text-xs text-amber-700 bg-amber-500/10 p-2 rounded border border-amber-500/30 flex items-center justify-between">
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

            {/* Cart Items List with Empty State */}
            <div className="flex-1 overflow-y-auto space-y-3 min-h-0 pr-1">
              {cart.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-muted select-none py-12">
                  <ShoppingCart className="w-12 h-12 mb-3 text-muted/30 stroke-1" />
                  <p className="font-semibold text-ink text-sm">Cart is empty</p>
                  <p className="text-xs text-muted mt-1 text-center max-w-[260px]">
                    Search or click products on the right catalog to add them to this purchase bill.
                  </p>
                </div>
              ) : (
                cart.map((item) => {
                  const itemGross = (item.purchase_price || 0) * (item.purchase_qty || 0);
                  const discPct = Math.min(100, Math.max(0, item.discount_percent !== undefined ? item.discount_percent : (item.discount || 0)));
                  const itemDiscAmt = (itemGross * discPct) / 100;
                  const itemNet = Math.max(0, itemGross - itemDiscAmt);

                  return (
                    <div key={item.id} className="p-3 bg-canvas border border-hairline rounded-lg shadow-2xs flex items-center justify-between gap-4 transition-all hover:border-hairline/80 group">
                      <div className="flex-1 min-w-0 pr-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-semibold text-ink text-xs truncate leading-tight">{item.name}</h3>
                          {item.model && <span className="text-[11px] text-muted truncate">({item.model})</span>}
                          {(loadedPurchaseRecord?.status === 'Returned' || Number((item as any).returned_quantity || 0) > 0) && (
                            <span className="text-[10px] bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 px-1.5 py-0.2 rounded font-semibold border border-red-200 dark:border-red-800">
                              {loadedPurchaseRecord?.status === 'Returned' ? 'Returned' : `Returned: ${(item as any).returned_quantity} pcs`}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                          <div className={`flex items-center border border-hairline bg-surface-soft px-2 py-0.5 rounded ${isPurchaseViewOnly ? 'opacity-80' : 'focus-within:border-primary focus-within:bg-canvas'} transition-colors`}>
                            <span className="text-muted text-xs mr-0.5 font-medium select-none">₹</span>
                            <input
                              type="number"
                              disabled={isPurchaseViewOnly}
                              value={item.purchase_price === 0 ? '' : item.purchase_price}
                              onChange={(e) => updateRate(item.id, Number(e.target.value) || 0)}
                              className={`w-16 bg-transparent outline-none text-ink font-semibold text-xs text-right tabular-nums ${isPurchaseViewOnly ? 'cursor-not-allowed' : ''}`}
                              title="Purchase Cost Rate"
                            />
                          </div>
                          <span className="text-xs text-muted font-medium">/ {item.unit || 'pc'}</span>
                          <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-surface-soft text-muted border border-hairline flex items-center gap-1">
                            <span>Stock: <strong className="text-ink font-semibold">{item.stock_quantity}</strong></span>
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 shrink-0">
                        {isPurchaseViewOnly ? (
                          <div className="px-2.5 py-1 bg-surface-soft border border-hairline rounded-md text-xs font-bold text-ink">
                            Qty: {item.purchase_qty}
                          </div>
                        ) : (
                          <div className="flex items-center bg-surface-soft border border-hairline rounded-md p-0.5">
                            <input
                              type="number"
                              min="1"
                              value={item.purchase_qty === 0 ? '' : item.purchase_qty}
                              onChange={(e) => setQty(item.id, Number(e.target.value) || 0)}
                              onBlur={() => { if (item.purchase_qty < 1) setQty(item.id, 1); }}
                              className="w-12 text-center text-sm font-bold text-ink bg-transparent focus:outline-none"
                            />
                          </div>
                        )}

                        {/* Product-wise Discount Input / Badge (% only) */}
                        {isPurchaseViewOnly ? (
                          itemDiscAmt > 0 ? (
                            <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/25">
                              Disc: {discPct}%
                            </span>
                          ) : null
                        ) : (
                          <div className="flex items-center gap-1 bg-surface-soft border border-hairline rounded-md px-2 py-1">
                            <span className="text-[11px] text-muted font-medium select-none">Disc:</span>
                            <input
                              type="number"
                              min="0"
                              max="100"
                              value={item.discount === 0 || !item.discount ? '' : item.discount}
                              onChange={(e) => updateItemDiscount(item.id, Number(e.target.value) || 0)}
                              placeholder="0"
                              className="w-10 text-right bg-transparent text-xs font-semibold text-ink focus:outline-none tabular-nums"
                              title="Product Discount (%)"
                            />
                            <span className="text-xs font-bold text-muted select-none">%</span>
                          </div>
                        )}

                        <div className="w-[85px] text-right flex flex-col justify-center">
                          <span className="font-bold text-ink text-sm tabular-nums">₹{itemNet.toFixed(2)}</span>
                          {itemDiscAmt > 0 && (
                            <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold tabular-nums">
                              -₹{itemDiscAmt.toFixed(2)}
                            </span>
                          )}
                        </div>

                        {!isPurchaseViewOnly && (
                          <button 
                            onClick={() => removeFromCart(item.id)} 
                            className="text-muted hover:text-danger opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-surface-strong cursor-pointer"
                            title="Remove item"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Column 2: Middle Column (Summary & Record) */}
          <div className="w-[290px] xl:w-[350px] bg-surface-soft flex flex-col z-10 relative border-r border-hairline shrink-0 overflow-hidden">
            <div className="flex-1 overflow-y-auto p-5">
              <div className="flex items-center justify-between mb-5">
                <h2 className="font-display font-medium text-lg text-ink">Purchase Summary</h2>
                <span className="text-[11px] px-2 py-0.5 bg-primary/10 text-primary font-semibold rounded border border-primary/20">
                  Tax Inward
                </span>
              </div>

              <div className="space-y-3">
                {enablePurchaseGST && purchaseTaxMethod === 'inclusive' ? (
                  <div className="flex justify-between text-sm text-body">
                    <span>Original Price (GST Inc)</span>
                    <span className="font-medium text-ink tabular-nums">₹{subtotal.toFixed(2)}</span>
                  </div>
                ) : (
                  <div className="flex justify-between text-sm text-body">
                    <span>Original Price (GST Exc)</span>
                    <span className="font-medium text-ink tabular-nums">₹{subtotal.toFixed(2)}</span>
                  </div>
                )}

                {loadedPurchaseRecord?.status === 'Returned' && (
                  <div className="flex justify-between text-sm text-red-600 dark:text-red-400 font-medium">
                    <span>Returned Goods Deduction</span>
                    <span className="tabular-nums">-₹{subtotal.toFixed(2)}</span>
                  </div>
                )}

                {totalItemDiscounts > 0 && (
                  <div className="flex justify-between text-sm text-emerald-600 dark:text-emerald-400 font-medium">
                    <span>Product Discounts</span>
                    <span className="tabular-nums">-₹{totalItemDiscounts.toFixed(2)}</span>
                  </div>
                )}

                <div className="flex justify-between items-center text-sm text-body py-1">
                  <span>Bill Discount</span>
                  <div className="flex items-center border-b border-hairline focus-within:border-ink transition-colors">
                    <input
                      type="number"
                      min="0"
                      max="100"
                      disabled={isPurchaseViewOnly}
                      value={discount === 0 ? '' : discount}
                      onChange={(e) => {
                        let val = Number(e.target.value) || 0;
                        if (val < 0) val = 0;
                        if (val > 100) val = 100;
                        setDiscount(val);
                      }}
                      placeholder="0"
                      className={`w-16 text-right bg-transparent py-0.5 focus:outline-none font-medium text-ink transition-colors tabular-nums ${
                        isPurchaseViewOnly ? 'cursor-not-allowed opacity-70' : ''
                      }`}
                    />
                    <span className="text-muted text-xs ml-0.5 font-bold select-none">%</span>
                  </div>
                </div>

                {displayDiscountAmount > 0 && (
                  <div className="flex justify-between text-sm text-emerald-600 dark:text-emerald-400 font-medium">
                    <span>Bill Discount Amount</span>
                    <span className="tabular-nums">-₹{displayDiscountAmount.toFixed(2)}</span>
                  </div>
                )}

                {isPurchaseViewOnly && loadedPurchaseRecord && returnedGoodsDeduction > 0 && (
                  <div className="flex justify-between text-sm text-red-600 dark:text-red-400 font-medium">
                    <span>Returned Goods Deduction</span>
                    <span className="tabular-nums">-₹{returnedGoodsDeduction.toFixed(2)}</span>
                  </div>
                )}
                
                <div className="flex justify-between text-sm text-body mt-2 pt-2 border-t border-hairline">
                  <span className="font-medium">Taxable Value</span>
                  <span className="font-medium text-ink tabular-nums">₹{taxableValueSum.toFixed(2)}</span>
                </div>

                {enablePurchaseGST && (
                  <div className="mt-2 space-y-1.5">
                    {Object.entries(taxBreakdown.cgst).map(([pct, amt]) => (
                      <div key={`cgst-${pct}`} className="flex justify-between items-center text-sm text-body">
                        <span>CGST ({pct}%)</span>
                        <span className="font-medium text-ink tabular-nums">₹{amt.toFixed(2)}</span>
                      </div>
                    ))}
                    {Object.entries(taxBreakdown.sgst).map(([pct, amt]) => (
                      <div key={`sgst-${pct}`} className="flex justify-between items-center text-sm text-body">
                        <span>SGST ({pct}%)</span>
                        <span className="font-medium text-ink tabular-nums">₹{amt.toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                )}

                {roundOff !== 0 && (
                  <div className="flex justify-between items-center text-sm text-body">
                    <span>Round off</span>
                    <span className="font-medium text-ink tabular-nums">{roundOff >= 0 ? `+₹${roundOff.toFixed(2)}` : `-₹${Math.abs(roundOff).toFixed(2)}`}</span>
                  </div>
                )}

                <div className="flex justify-between items-end border-t border-hairline pt-4 mt-6">
                  <span className="text-ink font-medium">Grand Total</span>
                  <span className="text-2xl font-display text-ink tracking-tight leading-none tabular-nums">₹{grandTotal.toFixed(2)}</span>
                </div>

                {loadedPurchaseRecord?.status === 'Returned' && (
                  <div className="p-2.5 rounded-lg bg-red-500/10 border border-red-500/20 text-xs text-red-700 dark:text-red-400 space-y-1 mt-3">
                    <div className="flex justify-between items-center font-bold">
                      <span>Status</span>
                      <span className="uppercase">Full Return Recorded</span>
                    </div>
                    <div className="text-[11px] text-muted">
                      This purchase has been fully returned to the supplier. Stock has been deducted and net payable is ₹0.00.
                    </div>
                  </div>
                )}

                {loadedPurchaseRecord?.status === 'Partially Returned' && (
                  <div className="p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs text-amber-700 dark:text-amber-400 space-y-1 mt-3">
                    <div className="flex justify-between items-center font-bold">
                      <span>Status</span>
                      <span className="uppercase">Partially Returned</span>
                    </div>
                    <div className="text-[11px] text-muted">
                      A portion of goods on this purchase was returned. Net amount and taxes reflect remaining active items.
                    </div>
                  </div>
                )}

                {/* Amount Paid */}
                <>
                  <div className="flex justify-between items-center text-sm text-body pt-4 pb-2 border-t border-hairline mt-4">
                    <span className="font-medium text-ink">Amount Paid</span>
                    <div className="flex items-center gap-2">
                      {!isPurchaseViewOnly && (
                        <button onClick={payInFull} className="text-xs text-primary font-medium hover:underline cursor-pointer">Pay Full</button>
                      )}
                      <div className={`flex items-center border-b border-hairline bg-transparent ${isPurchaseViewOnly ? 'opacity-70' : 'focus-within:border-ink'} transition-colors`}>
                        <span className="text-muted font-medium mr-1">₹</span>
                        <input
                          type="number" min="0" max={grandTotal}
                          disabled={isPurchaseViewOnly}
                          value={paidAmount === 0 ? '' : paidAmount}
                          onChange={(e) => {
                            let val = Number(e.target.value) || 0;
                            if (val < 0) val = 0;
                            if (val > grandTotal) val = Number(grandTotal.toFixed(2));
                            setPaidAmount(val);
                          }}
                          placeholder="0"
                          className={`w-20 text-right bg-transparent focus:outline-none font-medium text-ink py-0.5 ${isPurchaseViewOnly ? 'cursor-not-allowed' : ''}`}
                        />
                      </div>
                    </div>
                  </div>
                  {Math.min(paidAmount, grandTotal) < grandTotal && grandTotal > 0 && (
                    <div className="text-right text-xs text-signature-coral font-medium mt-1">
                      Balance ₹{(grandTotal - Math.min(paidAmount, grandTotal)).toFixed(2)} added to Supplier
                    </div>
                  )}

                  {/* Payment Mode Selector */}
                  {(paidAmount > 0 || cart.length > 0) && (
                    <div className="pt-2 pb-1 border-t border-hairline/60 mt-1.5 space-y-2">
                      <div className="flex items-center justify-between text-xs text-muted font-medium">
                        <span>Payment Mode:</span>
                        <span className="font-semibold text-ink">{paymentMethod}</span>
                      </div>
                      <div className="grid grid-cols-4 gap-1.5">
                        {(['Cash', 'Bank Transfer', 'Cheque', 'UPI'] as const).map(mode => (
                          <button
                            key={mode}
                            type="button"
                            disabled={isPurchaseViewOnly}
                            onClick={() => { if (!isPurchaseViewOnly) setPaymentMethod(mode); }}
                            className={`py-1.5 px-1 text-[11px] font-medium rounded border transition-colors text-center ${
                              paymentMethod === mode 
                                ? 'bg-primary text-on-primary border-primary font-semibold shadow-2xs' 
                                : isPurchaseViewOnly 
                                  ? 'bg-canvas text-muted/50 border-hairline/50 cursor-not-allowed' 
                                  : 'bg-canvas text-ink border-hairline hover:bg-surface-soft'
                            }`}
                          >
                            {mode}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              </div>
            </div>
            
            {/* Checkout Buttons */}
            <div className="p-4 bg-canvas border-t border-hairline flex flex-col gap-2.5 shrink-0">
              {isPurchaseViewOnly ? (
                <div className="space-y-2 w-full">
                  <button
                    type="button"
                    onClick={handlePrintPurchase}
                    className="w-full font-semibold py-2.5 rounded-lg transition-colors text-xs bg-primary hover:bg-primary-active text-on-primary flex items-center justify-center gap-1.5 shadow-sm cursor-pointer active:scale-[0.99]"
                    title="Print Purchase Inward Voucher"
                  >
                    <Printer className="w-4 h-4" />
                    <span>Print Inward Voucher</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleExitPurchase}
                    className="w-full font-semibold py-2 rounded-lg transition-colors text-xs bg-surface-strong hover:bg-surface-soft text-ink flex items-center justify-center gap-1.5 border border-hairline shadow-sm cursor-pointer"
                    title={location.state?.from === 'contacts' ? "Close viewing purchase bill and return to Supplier Profile (Esc)" : "Close viewing purchase bill and return to Day Book (Esc)"}
                  >
                    <X className="w-3.5 h-3.5" />
                    <span>
                      {location.state?.from === 'contacts' ? 'Close View & Exit to Supplier Profile (Esc)' : 'Close View & Exit to Day Book (Esc)'}
                    </span>
                  </button>
                </div>
              ) : (
                <>
                  <button
                    onClick={handleRecord}
                    disabled={cart.length === 0 || supplierId === '' || invoiceNo.trim() === '' || isProcessing}
                    title="Save / Record Purchase (Ctrl+S)"
                    className={`w-full font-semibold py-2.5 rounded-lg flex justify-center items-center text-sm transition-colors cursor-pointer ${cart.length === 0 || supplierId === '' || invoiceNo.trim() === '' || isProcessing ? 'bg-surface-strong text-muted cursor-not-allowed' : 'bg-primary hover:bg-primary-active text-on-primary shadow-xs'}`}
                  >
                    <IndianRupee className="w-4 h-4 mr-1.5" /> {isProcessing ? 'Processing...' : (editPurchaseId ? 'Update Purchase Bill (Ctrl+S)' : 'Record Purchase (Ctrl+S)')}
                  </button>

                  {editPurchaseId && (
                    <button 
                      type="button"
                      onClick={handleExitPurchase}
                      className="w-full font-semibold py-2 rounded-lg transition-colors text-xs border border-danger/30 text-danger hover:bg-danger/10 flex items-center justify-center gap-1.5 shadow-2xs cursor-pointer"
                      title={location.state?.from === 'contacts' ? "Cancel editing purchase bill and return to Supplier Profile (Esc)" : "Cancel editing purchase bill and return to Day Book (Esc)"}
                    >
                      <X className="w-3.5 h-3.5" />
                      <span>
                        {location.state?.from === 'contacts' ? 'Cancel Edit & Exit to Supplier Profile (Esc)' : 'Cancel Edit & Exit to Day Book (Esc)'}
                      </span>
                    </button>
                  )}
                  <button 
                    onClick={() => {
                      setCart([]);
                      setSupplierId('');
                      setSupplierSearch('');
                      setInvoiceNo('');
                    }}
                    disabled={cart.length === 0}
                    className={`w-full font-medium py-1.5 rounded-lg transition-colors text-xs cursor-pointer ${cart.length === 0 ? 'bg-transparent text-muted cursor-not-allowed' : 'bg-transparent text-muted hover:bg-surface-strong hover:text-danger'}`}
                  >
                    Clear Cart
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Column 3: Products Catalog & Search */}
          <div className="w-[280px] xl:w-[320px] flex flex-col p-5 overflow-hidden bg-surface-soft shrink-0">
            <header className="mb-3 shrink-0">
              <h2 className="text-lg font-display font-medium text-ink tracking-tight">Products</h2>
              <p className="text-xs text-muted mt-0.5">
                {isPurchaseViewOnly ? (
                  <span className="text-primary font-semibold">Purchase bill is in Read-Only View mode</span>
                ) : (
                  'Click product to add to purchase'
                )}
              </p>
            </header>

            <div className="relative w-full mb-3 shrink-0">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted w-4 h-4" />
              <input 
                type="text" 
                placeholder="Search by name/model..." 
                disabled={isPurchaseViewOnly}
                className={`w-full pl-9 pr-8 py-2 text-xs bg-canvas border border-hairline rounded-md shadow-xs focus:outline-none focus:border-primary transition-colors text-ink placeholder-muted ${isPurchaseViewOnly ? 'opacity-70 cursor-not-allowed' : ''}`}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={handleKeyDown}
                autoFocus={!isPurchaseViewOnly}
              />
              {search.trim() !== '' && !isPurchaseViewOnly && (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted hover:text-ink p-0.5"
                  title="Clear search"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Products Search Results Container */}
            <div className="flex-1 overflow-y-auto min-h-0">
              {search.trim() === '' ? (
                <div className="py-16 text-center text-xs text-muted flex flex-col items-center justify-center select-none">
                  <Search className="w-10 h-10 mb-3 text-muted/30 stroke-1" />
                  <p className="font-medium text-ink text-xs">Search for products</p>
                  <p className="text-[11px] text-muted mt-1 max-w-[200px]">
                    Type product name or model number to search and add to purchase bill
                  </p>
                </div>
              ) : filteredProducts.length > 0 ? (
                <ul className="divide-y divide-hairline bg-canvas rounded-lg border border-hairline overflow-hidden shadow-xs">
                  {filteredProducts.map((p, index) => (
                    <li
                      key={p.id}
                      onClick={() => !isPurchaseViewOnly && addToCart(p)}
                      onMouseEnter={() => !isPurchaseViewOnly && setSelectedIndex(index)}
                      className={`p-2.5 flex justify-between items-center transition-colors ${
                        isPurchaseViewOnly 
                          ? 'opacity-60 cursor-not-allowed' 
                          : index === selectedIndex 
                            ? 'bg-surface-soft cursor-pointer' 
                            : 'hover:bg-surface-soft cursor-pointer'
                      }`}
                    >
                      <div className="min-w-0 pr-2">
                        <div className="font-medium text-ink text-xs truncate">{p.name}</div>
                        <div className="text-[11px] text-muted mt-0.5">Stock: {p.stock_quantity} {p.unit || 'pc'}</div>
                      </div>
                      <div className="font-semibold text-ink text-xs shrink-0 tabular-nums">₹{p.purchase_price.toFixed(2)}</div>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="p-4 text-center text-xs text-muted">No products found</div>
              )}
            </div>
          </div>

        </div>
      </div>

      {/* Quick Add Supplier Modal */}
      {isQuickSupplierModalOpen && (
        <div 
          className="fixed inset-0 bg-ink/40 backdrop-blur-xs flex items-center justify-center z-50 p-4"
          onKeyDown={e => {
            if (e.key === 'Escape') {
              e.stopPropagation();
              closeQuickSupplierModal();
            }
          }}
        >
          <div className="bg-canvas rounded-xl shadow-2xl w-full max-w-md overflow-hidden border border-hairline animate-in fade-in zoom-in duration-150">
            <div className="px-5 py-3.5 border-b border-hairline flex justify-between items-center bg-surface-soft">
              <h2 className="text-sm font-bold text-ink flex items-center gap-2">
                <Truck className="w-4 h-4 text-primary" />
                Add New Supplier
              </h2>
              <button
                type="button"
                onClick={closeQuickSupplierModal}
                disabled={isSavingQuickSupplier}
                className="text-muted hover:text-ink transition-colors p-1 rounded-md"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveQuickSupplier} className="p-5 space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-muted uppercase tracking-wider mb-1">
                  Supplier / Business Name *
                </label>
                <input
                  required
                  autoFocus
                  type="text"
                  value={quickSupplierName}
                  onChange={e => setQuickSupplierName(e.target.value)}
                  className="w-full px-3 py-2 bg-canvas border border-hairline rounded-lg text-sm focus:outline-none focus:border-primary transition-colors text-ink placeholder-muted font-medium"
                  placeholder="e.g. Mahesh Pipe Center"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-muted uppercase tracking-wider mb-1">
                  Phone Number
                </label>
                <input
                  type="text"
                  value={quickSupplierPhone}
                  onChange={e => setQuickSupplierPhone(e.target.value)}
                  className="w-full px-3 py-2 bg-canvas border border-hairline rounded-lg text-sm focus:outline-none focus:border-primary transition-colors text-ink placeholder-muted"
                  placeholder="+91 9876543210"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-muted uppercase tracking-wider mb-1">
                  GSTIN Number
                </label>
                <input
                  type="text"
                  value={quickSupplierGstin}
                  onChange={e => setQuickSupplierGstin(e.target.value.toUpperCase())}
                  className="w-full px-3 py-2 bg-canvas border border-hairline rounded-lg text-sm uppercase font-mono focus:outline-none focus:border-primary transition-colors text-ink placeholder-muted"
                  placeholder="27ABCDE1234F1Z5"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-muted uppercase tracking-wider mb-1">
                  Address / City
                </label>
                <textarea
                  rows={2}
                  value={quickSupplierAddress}
                  onChange={e => setQuickSupplierAddress(e.target.value)}
                  className="w-full px-3 py-2 bg-canvas border border-hairline rounded-lg text-sm focus:outline-none focus:border-primary transition-colors text-ink placeholder-muted resize-none"
                  placeholder="City, State or complete address"
                />
              </div>

              <div className="pt-3 border-t border-hairline flex justify-end gap-2.5">
                <button
                  type="button"
                  onClick={closeQuickSupplierModal}
                  disabled={isSavingQuickSupplier}
                  className="px-4 py-2 text-xs font-medium text-ink hover:bg-surface-soft rounded-lg transition-colors border border-hairline"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingQuickSupplier || !quickSupplierName.trim()}
                  className="px-5 py-2 text-xs font-semibold bg-primary hover:bg-primary-active text-on-primary rounded-lg shadow-sm transition-colors disabled:opacity-50 flex items-center gap-1.5"
                >
                  {isSavingQuickSupplier && <span className="inline-block w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin mr-1" />}
                  {isSavingQuickSupplier ? 'Saving...' : 'Save & Select'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
