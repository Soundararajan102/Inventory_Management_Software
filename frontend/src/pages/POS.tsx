import { useState, useEffect, useRef } from 'react';
import { 
  Search, IndianRupee, X, ShoppingCart, User, 
  FileText, Clock, CheckCircle2, ArrowRight, Trash2, Printer, Plus, Check,
  CreditCard, Calendar, Store, Building2
} from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { 
  getSellableProducts, getCustomers, recordSale, getSaleById, updateSaleBill,
  createQuotation, getQuotations, getQuotationById, markQuotationConverted, deleteQuotation,
  getNextInvoiceNumber, getNextQuotationNumber, isPdcDate, getWarehouses
} from '../lib/db';
import type { Product, CartItem, Customer, Quotation, Warehouse } from '../lib/db';
import { Receipt } from '../components/Receipt';
import type { ReceiptData } from '../components/Receipt';

export default function POS() {
  const [search, setSearch] = useState('');
  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [sourceType, setSourceType] = useState<'shop' | 'warehouse'>('shop');
  const [sourceWarehouseId, setSourceWarehouseId] = useState<number | ''>('');
  
  const location = useLocation();
  const navigate = useNavigate();
  const searchParams = new URLSearchParams(location.search);
  const editSaleIdParam = searchParams.get('editId');
  const editSaleId = editSaleIdParam ? Number(editSaleIdParam) : undefined;
  
  const [cart, setCart] = useState<CartItem[]>([]);
  const [discount, setDiscount] = useState<number>(0);
  const [discountType, setDiscountType] = useState<'amount' | 'percentage'>('percentage');
  const [isProcessing, setIsProcessing] = useState(false);
  
  const [customerId, setCustomerId] = useState<number | ''>('');
  const [paidAmount, setPaidAmount] = useState<number | ''>('');
  const [paymentMethod, setPaymentMethod] = useState<'Cash' | 'UPI' | 'Card' | 'Cheque'>('Cash');
  const [posChequeNo, setPosChequeNo] = useState('');
  const [posBankName, setPosBankName] = useState('');
  const [posChequeDate, setPosChequeDate] = useState(() => {
    const d = new Date();
    const offset = d.getTimezoneOffset() * 60000;
    return new Date(d.getTime() - offset).toISOString().split('T')[0];
  });
  const [printData, setPrintData] = useState<ReceiptData | null>(null);
  
  const [customerSearch, setCustomerSearch] = useState('');
  const [isCustomerDropdownOpen, setIsCustomerDropdownOpen] = useState(false);
  const [completedSaleModal, setCompletedSaleModal] = useState<ReceiptData | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  // Quotation System States
  const [posMode, setPosMode] = useState<'billing' | 'quotation'>('billing');
  const [isQuotationsModalOpen, setIsQuotationsModalOpen] = useState(false);
  const [quotationsList, setQuotationsList] = useState<Quotation[]>([]);
  const [quotationSearch, setQuotationSearch] = useState('');
  const [quotationStatusFilter, setQuotationStatusFilter] = useState<'All' | 'Pending' | 'Converted'>('All');
  const [convertingQuotationId, setConvertingQuotationId] = useState<number | null>(null);
  const [convertingQuotationNumber, setConvertingQuotationNumber] = useState<string | null>(null);
  const [nextInvoiceNo, setNextInvoiceNo] = useState<string>('');
  const [nextQuotationNo, setNextQuotationNo] = useState<string>('');
  const [quotationNotes, setQuotationNotes] = useState<string>('');
  
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
    refreshQuotations();
    refreshNextNumbers();
    if (editSaleId) {
      loadEditData(editSaleId);
    }
  }, [editSaleId]);

  async function refreshQuotations() {
    try {
      const list = await getQuotations();
      setQuotationsList(list);
    } catch (e) {
      console.error("Failed to load quotations:", e);
    }
  }

  async function refreshNextNumbers() {
    try {
      const inv = await getNextInvoiceNumber();
      setNextInvoiceNo(inv);
      const q = await getNextQuotationNumber();
      setNextQuotationNo(q);
    } catch (e) {
      console.error("Failed to load next numbers:", e);
    }
  }

  async function loadEditData(id: number) {
    try {
      const s = await getSaleById(id);
      if (s) {
        if (s.customer_id) setCustomerId(s.customer_id);
        setCart(s.items.map((i: any) => ({
          id: i.product_id,
          name: i.name,
          model: i.model,
          selling_price: i.unit_price,
          cart_qty: i.quantity,
          unit: i.unit,
          hsn_code: i.hsn_code,
          cgst_percentage: i.cgst_percentage,
          sgst_percentage: i.sgst_percentage,
          gst_percentage: i.gst_percentage,
          stock_quantity: i.stock_quantity
        } as CartItem)));
        if (s.source_type) setSourceType(s.source_type as 'shop' | 'warehouse');
        if (s.source_warehouse_id) setSourceWarehouseId(s.source_warehouse_id);
        setDiscountType('amount');
        setDiscount(s.discount);
        setPaidAmount(s.paid_amount || 0);
        if (s.payment_method) setPaymentMethod(s.payment_method as any);
      }
    } catch (e) {
      console.error(e);
    }
  }

  async function loadProducts(st?: 'shop' | 'warehouse', whId?: number | null) {
    try {
      const whList = await getWarehouses();
      setWarehouses(whList);
      if (whList.length > 0 && sourceWarehouseId === '') {
        setSourceWarehouseId(whList[0].id);
      }
      const activeSt = st ?? sourceType;
      const activeWhId = whId !== undefined ? whId : (activeSt === 'warehouse' && sourceWarehouseId !== '' ? Number(sourceWarehouseId) : null);
      const data = await getSellableProducts(activeWhId);
      setProducts(data);
      const custData = await getCustomers();
      setCustomers(custData);
    } catch (error) {
      console.error("Failed to load products/customers", error);
    }
  }

  // Reload products dynamically when source inventory location changes
  useEffect(() => {
    const whIdToUse = sourceType === 'warehouse' && sourceWarehouseId !== '' ? Number(sourceWarehouseId) : null;
    getSellableProducts(whIdToUse).then(newProducts => {
      setProducts(newProducts);
      setCart(prevCart => prevCart.map(cartItem => {
        const matching = newProducts.find(p => p.id === cartItem.id);
        const availStock = matching ? matching.stock_quantity : 0;
        return {
          ...cartItem,
          stock_quantity: availStock,
          cart_qty: posMode === 'billing' ? Math.min(availStock, cartItem.cart_qty) : cartItem.cart_qty
        };
      }));
    }).catch(console.error);
  }, [sourceType, sourceWarehouseId]);

  const displayProducts = search.trim() === '' 
    ? [] 
    : products.filter(p => 
        p.name.toLowerCase().includes(search.toLowerCase()) || 
        (p.model && p.model.toLowerCase().includes(search.toLowerCase())) ||
        (p.barcode && p.barcode.toLowerCase().includes(search.toLowerCase()))
      );

  const [selectedIndex, setSelectedIndex] = useState(0);

  useEffect(() => {
    setSelectedIndex(0);
  }, [search]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setSearch('');
      return;
    }
    
    if (displayProducts.length === 0) return;
    
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => (prev < displayProducts.length - 1 ? prev + 1 : prev));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => (prev > 0 ? prev - 1 : prev));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (displayProducts[selectedIndex]) {
        addToCart(displayProducts[selectedIndex]);
      }
    }
  };

  function addToCart(product: Product) {
    if (posMode === 'billing' && product.stock_quantity <= 0) {
      alert('This product is out of stock!');
      return;
    }
    setCart(prev => {
      const existing = prev.find(item => item.id === product.id);
      if (existing) {
        if (posMode === 'billing' && existing.cart_qty >= product.stock_quantity) {
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
        const newQty = posMode === 'billing' 
          ? Math.min(item.stock_quantity, Math.max(0, qty))
          : Math.max(0, qty);
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

  // Global Ctrl + S shortcut handler
  const handleSaveActionRef = useRef<(() => void) | undefined>(undefined);
  handleSaveActionRef.current = () => {
    if (isProcessing) return;
    if (posMode === 'quotation') {
      handleSaveQuotation();
    } else {
      handleCheckout();
    }
  };

  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        e.stopPropagation();
        handleSaveActionRef.current?.();
      }
    };
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, []);

  // Keyboard navigation when Completed Sale Modal is open (Enter to print, Esc for Next Sale)
  useEffect(() => {
    if (!completedSaleModal) return;
    const handleModalKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        if (editSaleId) {
          navigate('/daybook', { state: { activeTab: 'sales' } });
        } else {
          setCompletedSaleModal(null);
          setTimeout(() => searchInputRef.current?.focus(), 50);
        }
      } else if (e.key === 'Enter') {
        e.preventDefault();
        window.print();
      }
    };
    window.addEventListener('keydown', handleModalKeyDown);
    return () => window.removeEventListener('keydown', handleModalKeyDown);
  }, [completedSaleModal, editSaleId]);

  // Handle Checkout for active Sale Bill
  async function handleCheckout() {
    if (cart.length === 0) {
      alert("Cart is empty! Please add products before saving.");
      return;
    }
    const invalidItem = cart.find(i => i.cart_qty <= 0);
    if (invalidItem) {
      alert(`Item "${invalidItem.name}" has an invalid quantity. Quantity must be at least 1.`);
      return;
    }
    // Hard stock validation for active billing mode
    if (posMode === 'billing') {
      const overStockItem = cart.find(i => i.cart_qty > i.stock_quantity);
      if (overStockItem) {
        alert(`Item "${overStockItem.name}" quantity (${overStockItem.cart_qty}) exceeds available stock (${overStockItem.stock_quantity}) in the selected location.`);
        return;
      }
    }
    const finalPaidAmount = effectivePaidAmount;
    if (finalPaidAmount < 0) {
      alert("Paid amount cannot be negative.");
      return;
    }
    if (!editSaleId && isCreditPending && customerId === '') {
      alert("Please select a customer to record credit / pending balance.");
      return;
    }
    if (finalPaidAmount > 0 && paymentMethod === 'Cheque' && isPdcDate(posChequeDate) && customerId === '') {
      alert("Post-Dated Cheques (PDC) require a registered customer so the pending due can be tracked. Please select or add a Customer.");
      return;
    }
    if (sourceType === 'warehouse' && (sourceWarehouseId === '' || warehouses.length === 0)) {
      alert("Please select a warehouse stock source or create a warehouse first in Inventory.");
      return;
    }
    setIsProcessing(true);
    try {
      const finalCustomerId = customerId === '' ? null : Number(customerId);
      
      if (finalPaidAmount > 0 && paymentMethod === 'Cheque' && !posChequeNo.trim()) {
        alert('Please enter the Cheque Number for cheque payment.');
        setIsProcessing(false);
        return;
      }
      
      let invoiceNumber = '';
      if (editSaleId) {
        invoiceNumber = await updateSaleBill(
          editSaleId,
          finalCustomerId,
          cart,
          subtotal,
          tax,
          discountAmount,
          grandTotal,
          finalPaidAmount,
          paymentMethod,
          paymentMethod === 'Cheque' ? posChequeNo.trim() : null,
          paymentMethod === 'Cheque' ? posBankName.trim() : null,
          paymentMethod === 'Cheque' ? posChequeDate : null,
          sourceType,
          sourceType === 'warehouse' ? Number(sourceWarehouseId) : null
        );
        alert('Sale bill updated successfully!');
      } else {
        invoiceNumber = await recordSale(
          cart, 
          subtotal, 
          tax, 
          discountAmount, 
          grandTotal, 
          finalPaidAmount, 
          paymentMethod, 
          finalCustomerId,
          paymentMethod === 'Cheque' ? posChequeNo.trim() : null,
          paymentMethod === 'Cheque' ? posBankName.trim() : null,
          paymentMethod === 'Cheque' ? posChequeDate : null,
          sourceType,
          sourceType === 'warehouse' ? Number(sourceWarehouseId) : null
        );

        // If this sale was converted from a quotation, mark quotation as Converted
        if (convertingQuotationId) {
          const saleIdNum = Number(invoiceNumber.split('-')[1]) || 0;
          await markQuotationConverted(convertingQuotationId, saleIdNum, invoiceNumber);
          setConvertingQuotationId(null);
          setConvertingQuotationNumber(null);
          await refreshQuotations();
        }
      }
      
      const currentCustomerObj = finalCustomerId ? customers.find(c => c.id === finalCustomerId) : null;
      const currentCustomer = currentCustomerObj ? currentCustomerObj.name : 'Walk-in Customer';
      const whObj = sourceType === 'warehouse' ? warehouses.find(w => w.id === sourceWarehouseId) : null;
      
      const receiptPayload: ReceiptData = {
        invoiceNumber,
        isQuotation: false,
        date: new Date().toLocaleDateString('en-IN'),
        customerName: currentCustomer,
        customerDetails: currentCustomerObj ? {
          name: currentCustomerObj.name,
          phone: currentCustomerObj.phone || undefined,
          email: currentCustomerObj.email || undefined,
          address: currentCustomerObj.address || undefined,
          gstin: currentCustomerObj.gstin ? currentCustomerObj.gstin.toUpperCase() : undefined,
        } : undefined,
        items: [...cart],
        subtotal,
        taxAmount: tax,
        taxBreakdown,
        taxMethod: enableSalesGST ? salesTaxMethod : undefined,
        discount: discountAmount,
        netAmount: grandTotal,
        paidAmount: finalPaidAmount,
        paymentMethod,
        chequeNo: paymentMethod === 'Cheque' ? posChequeNo.trim() : undefined,
        bankName: paymentMethod === 'Cheque' ? posBankName.trim() : undefined,
        chequeDate: paymentMethod === 'Cheque' ? posChequeDate : undefined,
        sourceLocationName: sourceType === 'warehouse' ? (whObj ? whObj.name : 'Warehouse') : 'Main Shop'
      };

      setPrintData(receiptPayload);
      setCompletedSaleModal(receiptPayload);

      // Reset state after checkout so the cashier is immediately ready
      setPaymentMethod('Cash');
      setPosChequeNo('');
      setPosBankName('');
      setCart([]);
      setDiscount(0);
      setDiscountType('percentage');
      setCustomerId('');
      setPaidAmount('');
      setSourceType('shop');
      if (warehouses.length > 0) setSourceWarehouseId(warehouses[0].id);
      loadProducts('shop', null);
      refreshNextNumbers();
    } catch (error) {
      console.error("Checkout failed", error);
      alert(`Error during checkout: ${error}`);
    } finally {
      setIsProcessing(false);
    }
  }

  // Handle Save & Print for Quotation (No stock deduction, no customer balance update)
  async function handleSaveQuotation() {
    if (cart.length === 0) {
      alert("Quotation is empty! Please add products before saving.");
      return;
    }
    const invalidItem = cart.find(i => i.cart_qty <= 0);
    if (invalidItem) {
      alert(`Item "${invalidItem.name}" has an invalid quantity. Quantity must be at least 1.`);
      return;
    }
    setIsProcessing(true);
    try {
      const finalCustomerId = customerId === '' ? null : Number(customerId);
      const quotationNumber = await createQuotation(
        cart,
        subtotal,
        tax,
        discountAmount,
        grandTotal,
        finalCustomerId,
        quotationNotes
      );
      
      const currentCustomerObj = finalCustomerId ? customers.find(c => c.id === finalCustomerId) : null;
      const currentCustomer = currentCustomerObj ? currentCustomerObj.name : 'Walk-in Customer';
      
      const quotePayload: ReceiptData = {
        invoiceNumber: quotationNumber,
        isQuotation: true,
        quotationNumber: quotationNumber,
        date: new Date().toLocaleDateString('en-IN'),
        customerName: currentCustomer,
        customerDetails: currentCustomerObj ? {
          name: currentCustomerObj.name,
          phone: currentCustomerObj.phone || undefined,
          email: currentCustomerObj.email || undefined,
          address: currentCustomerObj.address || undefined,
          gstin: currentCustomerObj.gstin ? currentCustomerObj.gstin.toUpperCase() : undefined,
        } : undefined,
        items: [...cart],
        subtotal,
        taxAmount: tax,
        taxBreakdown,
        taxMethod: enableSalesGST ? salesTaxMethod : undefined,
        discount: discountAmount,
        netAmount: grandTotal,
        paidAmount: 0
      };

      setPrintData(quotePayload);
      setCompletedSaleModal(quotePayload);

      setCart([]);
      setDiscount(0);
      setDiscountType('percentage');
      setCustomerId('');
      setQuotationNotes('');
      setPosMode('billing');
      await refreshQuotations();
      await refreshNextNumbers();
    } catch (error) {
      console.error("Save quotation failed", error);
      alert(`Error saving quotation: ${error}`);
    } finally {
      setIsProcessing(false);
    }
  }

  // Handle Converting Quotation directly into POS Cart for billing
  async function handleConvertQuotation(qId: number) {
    try {
      const fullQ = await getQuotationById(qId);
      if (!fullQ) return;
      
      if (fullQ.customer_id) {
        setCustomerId(fullQ.customer_id);
      } else {
        setCustomerId('');
      }

      if (fullQ.items) {
        setCart(fullQ.items.map((i: any) => ({
          id: i.product_id,
          name: i.name,
          model: i.model,
          selling_price: i.unit_price,
          cart_qty: i.quantity,
          unit: i.unit,
          hsn_code: i.hsn_code,
          cgst_percentage: i.cgst_percentage,
          sgst_percentage: i.sgst_percentage,
          gst_percentage: i.gst_percentage,
          stock_quantity: i.stock_quantity
        } as CartItem)));
      }

      setDiscountType('amount');
      setDiscount(fullQ.discount);
      setPaidAmount(0);
      setConvertingQuotationId(fullQ.id);
      setConvertingQuotationNumber(fullQ.quotation_number);
      setPosMode('billing');
      setIsQuotationsModalOpen(false);
    } catch (e) {
      console.error("Failed to convert quotation:", e);
      alert("Error loading quotation details: " + e);
    }
  }

  // Handle Print Quotation from list
  async function handlePrintQuotation(qId: number) {
    try {
      const fullQ = await getQuotationById(qId);
      if (!fullQ) return;
      
      let custDetails: any = undefined;
      if (fullQ.customer_snapshot) {
        try { custDetails = JSON.parse(fullQ.customer_snapshot); } catch (e) {}
      } else if (fullQ.customer_id) {
        const c = customers.find(x => x.id === fullQ.customer_id);
        if (c) custDetails = c;
      }

      const mappedCart: CartItem[] = (fullQ.items || []).map((i: any) => ({
        id: i.product_id,
        name: i.name,
        model: i.model,
        selling_price: i.unit_price,
        cart_qty: i.quantity,
        unit: i.unit,
        hsn_code: i.hsn_code,
        cgst_percentage: i.cgst_percentage,
        sgst_percentage: i.sgst_percentage,
        gst_percentage: i.gst_percentage,
        stock_quantity: i.stock_quantity
      } as CartItem));

      setPrintData({
        invoiceNumber: fullQ.quotation_number,
        isQuotation: true,
        quotationNumber: fullQ.quotation_number,
        date: new Date(fullQ.date).toLocaleDateString('en-IN'),
        customerName: fullQ.customer_name || 'Walk-in Customer',
        customerDetails: custDetails,
        items: mappedCart,
        subtotal: fullQ.total_amount,
        taxAmount: fullQ.tax_amount,
        taxMethod: enableSalesGST ? salesTaxMethod : undefined,
        discount: fullQ.discount,
        netAmount: fullQ.net_amount,
        paidAmount: 0
      });

      setTimeout(() => {
        window.print();
      }, 100);
    } catch (e) {
      console.error("Failed to print quotation:", e);
      alert("Failed to print quotation: " + e);
    }
  }

  // Handle Delete Quotation
  async function handleDeleteQuotation(qId: number) {
    if (!confirm('Are you sure you want to delete this quotation?')) return;
    try {
      await deleteQuotation(qId);
      await refreshQuotations();
      await refreshNextNumbers();
    } catch (e) {
      console.error(e);
      alert('Failed to delete quotation: ' + e);
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
    const discountedItemPrice = originalItemPrice * (1 - discountRatio);
    
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
  const effectivePaidAmount = paidAmount === '' ? grandTotal : Number(paidAmount);
  const pendingBalance = Math.max(0, grandTotal - effectivePaidAmount);
  const isCreditPending = effectivePaidAmount < grandTotal && grandTotal > 0;

  // Filtered quotations for modal
  const pendingQuotationsCount = quotationsList.filter(q => q.status === 'Pending').length;
  const filteredQuotations = quotationsList.filter(q => {
    const matchesSearch = 
      q.quotation_number.toLowerCase().includes(quotationSearch.toLowerCase()) ||
      (q.customer_name && q.customer_name.toLowerCase().includes(quotationSearch.toLowerCase())) ||
      q.date.includes(quotationSearch);
    if (!matchesSearch) return false;
    if (quotationStatusFilter === 'All') return true;
    return q.status === quotationStatusFilter;
  });

  return (
    <>
      <Receipt data={printData} />
      
      {/* Main Full-Height Container with Unified Full-Width Header */}
      <div className="flex flex-col h-full bg-canvas print:hidden overflow-hidden">
        
        {/* Unified Top Header Bar Across All 3 Columns */}
        <header className="h-14 px-6 border-b border-hairline bg-canvas flex items-center justify-between shrink-0 z-20">
          
          {/* Left: Mode Switcher & Realtime Bill/Quote Info */}
          <div className="flex items-center gap-4">
            
            {/* Segmented Mode Switcher */}
            <div className="flex items-center bg-surface-soft p-1 rounded-lg border border-hairline">
              <button
                type="button"
                onClick={() => {
                  setPosMode('billing');
                }}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md flex items-center gap-1.5 transition-all ${
                  posMode === 'billing'
                    ? 'bg-canvas text-ink shadow-xs'
                    : 'text-muted hover:text-ink'
                }`}
              >
                <ShoppingCart className="w-3.5 h-3.5 text-primary" />
                <span>Sale Bill</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setPosMode('quotation');
                  setConvertingQuotationId(null);
                  setConvertingQuotationNumber(null);
                }}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md flex items-center gap-1.5 transition-all ${
                  posMode === 'quotation'
                    ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400 shadow-xs border border-amber-500/30'
                    : 'text-muted hover:text-ink'
                }`}
              >
                <FileText className="w-3.5 h-3.5 text-amber-500" />
                <span>Quotation</span>
              </button>
            </div>

            {/* Live Bill/Quote Number and Date */}
            <div className="flex items-center gap-2.5 text-xs">
              <span className="font-mono font-bold text-ink bg-surface-soft px-2.5 py-1 rounded-md border border-hairline">
                {posMode === 'billing' 
                  ? (editSaleId ? `Bill #${editSaleId}` : `Bill: ${nextInvoiceNo || '...'}`)
                  : `Quote: ${nextQuotationNo || '...'}`}
              </span>
              <span className="text-muted flex items-center gap-1 font-medium">
                <span>•</span>
                <span>{new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
              </span>
            </div>

            {/* Converting Quotation Notice Pill */}
            {convertingQuotationNumber && (
              <div className="flex items-center gap-1.5 text-xs bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 px-2.5 py-1 rounded-md font-semibold">
                <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                <span>Converting {convertingQuotationNumber}</span>
                <button
                  type="button"
                  onClick={() => { setConvertingQuotationId(null); setConvertingQuotationNumber(null); }}
                  className="ml-1 text-muted hover:text-ink"
                  title="Cancel conversion"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            )}

            {/* Stock Source Selector (Shop vs Godown) */}
            {posMode === 'billing' && (
              <div className="flex items-center gap-1.5 ml-1 pl-3 border-l border-hairline">
                <div className="flex items-center bg-surface-soft p-0.5 rounded-lg border border-hairline">
                  <button
                    type="button"
                    onClick={() => setSourceType('shop')}
                    className={`px-2.5 py-1 text-xs font-semibold rounded-md flex items-center gap-1.5 transition-all ${
                      sourceType === 'shop' ? 'bg-ink text-canvas shadow-xs' : 'text-muted hover:text-ink'
                    }`}
                    title="Sell from Main Shop stock"
                  >
                    <Store className="w-3.5 h-3.5" />
                    <span>Shop Stock</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSourceType('warehouse');
                      if (warehouses.length > 0 && sourceWarehouseId === '') {
                        setSourceWarehouseId(warehouses[0].id);
                      }
                    }}
                    className={`px-2.5 py-1 text-xs font-semibold rounded-md flex items-center gap-1.5 transition-all ${
                      sourceType === 'warehouse' ? 'bg-ink text-canvas shadow-xs' : 'text-muted hover:text-ink'
                    }`}
                    title="Sell from Warehouse / Godown"
                  >
                    <Building2 className="w-3.5 h-3.5" />
                    <span>Godown Stock</span>
                  </button>
                </div>

                {sourceType === 'warehouse' && (
                  <div className="flex items-center">
                    {warehouses.length > 0 ? (
                      <select
                        value={sourceWarehouseId}
                        onChange={(e) => setSourceWarehouseId(Number(e.target.value))}
                        className="px-2.5 py-1 text-xs font-semibold bg-canvas text-ink border border-hairline rounded-md focus:outline-none focus:border-ink cursor-pointer shadow-xs"
                      >
                        {warehouses.map(wh => (
                          <option key={wh.id} value={wh.id}>
                            🏢 {wh.name} {wh.location ? `(${wh.location})` : ''}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span className="text-[11px] text-amber-600 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded">
                        No godowns
                      </span>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Right: Quotations List Modal Button */}
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => { refreshQuotations(); setIsQuotationsModalOpen(true); }}
              className="px-3.5 py-1.5 text-xs font-semibold bg-surface-soft hover:bg-surface-strong border border-hairline rounded-lg text-ink flex items-center gap-2 transition-colors shadow-xs"
              title="View and manage saved quotations"
            >
              <FileText className="w-3.5 h-3.5 text-primary" />
              <span>Quotations List</span>
              {pendingQuotationsCount > 0 && (
                <span className="bg-amber-500 text-white text-[10px] font-bold px-1.5 py-0.2 rounded-full">
                  {pendingQuotationsCount}
                </span>
              )}
            </button>
          </div>
        </header>

        {/* 3 Columns Body - Perfectly Aligned at the Exact Same Baseline */}
        <div className="flex flex-row flex-1 overflow-hidden">
          
          {/* Column 1: Cart Items */}
          <div className="flex-1 bg-canvas flex flex-col z-10 relative border-r border-hairline overflow-hidden">
            
            {/* Customer Selector */}
            <div className="p-4 border-b border-hairline bg-surface-soft shrink-0">
              <div className="relative">
                <div className="flex items-center gap-3 w-full bg-canvas px-3 py-2 rounded-md border border-hairline focus-within:border-primary transition-colors">
                  <User className="w-4 h-4 text-muted shrink-0" />
                  <input
                    type="text"
                    placeholder="Search Customer (or leave Walk-in)"
                    className="flex-1 bg-transparent text-sm outline-none text-ink font-medium placeholder:text-muted"
                    value={customerSearch}
                    onChange={(e) => {
                      setCustomerSearch(e.target.value);
                      setIsCustomerDropdownOpen(true);
                      if (e.target.value === '') setCustomerId('');
                    }}
                    onFocus={() => setIsCustomerDropdownOpen(true)}
                  />
                  {customerId !== '' && (
                    <button onClick={() => { setCustomerId(''); setCustomerSearch(''); }} className="text-muted hover:text-ink p-0.5">
                      <X className="w-3.5 h-3.5" />
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
                          className="p-3 hover:bg-surface-soft cursor-pointer text-sm font-medium text-ink flex items-center justify-between"
                        >
                          <span>Walk-in Customer</span>
                          <span className="text-xs text-muted">Default</span>
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
                            <div>
                              <span className="font-medium text-ink">{c.name}</span>
                              {c.phone && <span className="text-xs text-muted ml-2 font-mono">{c.phone}</span>}
                            </div>
                            {c.balance > 0 && <span className="text-xs text-signature-coral font-medium">Owes: ₹{c.balance.toFixed(0)}</span>}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Cart Items List */}
            <div className="flex-1 overflow-y-auto bg-canvas">
              {cart.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-muted p-8 text-center select-none">
                  {posMode === 'quotation' ? (
                    <FileText className="w-12 h-12 mb-3 text-muted/40 stroke-1" />
                  ) : (
                    <ShoppingCart className="w-12 h-12 mb-3 text-muted/40 stroke-1" />
                  )}
                  <p className="font-medium text-base text-ink">
                    {posMode === 'quotation' ? 'Quotation is empty' : 'Cart is empty'}
                  </p>
                  <p className="text-xs text-muted mt-1 max-w-xs">
                    Search or click products on the right catalog to add them to this {posMode === 'quotation' ? 'quotation voucher' : 'sale bill'}.
                  </p>
                </div>
              ) : (
                cart.map((item) => (
                  <div key={item.id} className="bg-canvas border-b border-hairline py-3 px-5 group flex items-center justify-between gap-3 hover:bg-surface-soft/40 transition-colors">
                    <div className="flex-1 min-w-0 pr-2">
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-medium text-ink truncate leading-tight">{item.name}</h3>
                        {item.model && <span className="text-xs text-muted truncate">({item.model})</span>}
                      </div>
                      <div className="text-xs text-muted mt-1.5 flex items-center gap-2 flex-wrap">
                        <div className="flex items-center">
                          <span className="text-muted mr-0.5">₹</span>
                          <input
                            type="number"
                            value={item.selling_price === 0 ? '' : item.selling_price}
                            onChange={(e) => updateRate(item.id, Number(e.target.value) || 0)}
                            className="w-16 bg-transparent border-b border-hairline hover:border-ink focus:border-primary outline-none text-ink font-semibold text-xs text-right transition-colors"
                            title="Selling Rate"
                          />
                          <span className="ml-1 text-muted">/ {item.unit || 'pc'}</span>
                        </div>
                        {enableSalesGST && <span className="text-primary text-[10px]">({item.cgst_percentage || 0}% CGST, {item.sgst_percentage || 0}% SGST)</span>}
                        {/* Live Stock Count */}
                        <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-surface-soft text-muted border border-hairline flex items-center gap-1" title={`Available stock in ${sourceType === 'warehouse' ? (warehouses.find(w => w.id === sourceWarehouseId)?.name || 'Godown') : 'Main Shop'}`}>
                          {sourceType === 'warehouse' ? <Building2 className="w-3 h-3 shrink-0 text-muted" /> : <Store className="w-3 h-3 shrink-0 text-muted" />}
                          <span>Stock: <strong className="text-ink font-semibold">{item.stock_quantity}</strong> {item.unit || 'pc'}</span>
                        </span>
                        {item.cart_qty >= item.stock_quantity && item.stock_quantity > 0 && (
                          <span className="text-[10px] text-amber-600 dark:text-amber-400 font-semibold bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20">
                            Max stock reached
                          </span>
                        )}
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-3 shrink-0">
                      <div className="flex items-center bg-surface-soft border border-hairline rounded-md p-0.5">
                        <input
                          type="number"
                          min="1"
                          value={item.cart_qty === 0 ? '' : item.cart_qty}
                          onChange={(e) => setQty(item.id, Number(e.target.value) || 0)}
                          onBlur={() => { if (item.cart_qty < 1) setQty(item.id, 1); }}
                          className="w-12 text-center text-sm font-bold text-ink bg-transparent focus:outline-none"
                        />
                      </div>
                      <div className="w-[70px] text-right">
                        <span className="font-bold text-ink text-sm font-mono">₹{(item.selling_price * item.cart_qty).toFixed(2)}</span>
                      </div>
                      <button 
                        onClick={() => removeFromCart(item.id)}
                        className="text-muted hover:text-danger opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-surface-strong"
                        title="Remove item"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Column 2: Middle Column (Summary & Checkout) */}
          <div className="w-[350px] bg-surface-soft flex flex-col z-10 relative border-r border-hairline shrink-0 overflow-hidden">
            <div className="flex-1 overflow-y-auto p-5">
              
              <div className="flex items-center justify-between mb-5">
                <h2 className="font-display font-medium text-lg text-ink">
                  {posMode === 'quotation' ? 'Quotation Summary' : 'Bill Summary'}
                </h2>
                {posMode === 'quotation' ? (
                  <span className="text-[11px] px-2 py-0.5 bg-amber-500/15 text-amber-600 dark:text-amber-400 font-semibold rounded border border-amber-500/30">
                    Estimate Voucher
                  </span>
                ) : (
                  <span className="text-[11px] px-2 py-0.5 bg-primary/10 text-primary font-semibold rounded border border-primary/20">
                    Tax Invoice
                  </span>
                )}
              </div>

              <div className="space-y-3">
                {enableSalesGST && salesTaxMethod === 'inclusive' ? (
                  <div className="flex justify-between text-sm text-body">
                    <span>Original Price (GST Inc)</span>
                    <span className="font-medium text-ink font-mono">₹{subtotal.toFixed(2)}</span>
                  </div>
                ) : (
                  <div className="flex justify-between text-sm text-body">
                    <span>Original Price (GST Exc)</span>
                    <span className="font-medium text-ink font-mono">₹{subtotal.toFixed(2)}</span>
                  </div>
                )}
                
                <div className="flex justify-between items-center text-sm text-body py-0.5">
                  <span>Discount</span>
                  <div className="flex items-center gap-1.5">
                    <button 
                      onClick={() => setDiscountType(prev => prev === 'amount' ? 'percentage' : 'amount')}
                      className="text-xs font-semibold bg-canvas border border-hairline text-ink hover:bg-surface-strong px-2 py-0.5 rounded transition-colors select-none"
                      title="Toggle discount type"
                    >
                      {discountType === 'amount' ? '₹' : '%'}
                    </button>
                    <input 
                      type="number" 
                      min="0"
                      max={discountType === 'percentage' ? 100 : undefined}
                      value={discount === 0 ? '' : discount}
                      onChange={(e) => {
                        let val = Number(e.target.value) || 0;
                        if (val < 0) val = 0;
                        if (discountType === 'percentage' && val > 100) val = 100;
                        setDiscount(val);
                      }}
                      placeholder="0"
                      className="w-16 text-right border-b border-hairline bg-transparent py-0.5 focus:outline-none focus:border-primary font-semibold text-ink transition-colors font-mono"
                    />
                  </div>
                </div>
                
                {discountAmount > 0 && (
                  <div className="flex justify-between text-sm text-success font-medium">
                    <span>Discount Amount</span>
                    <span className="font-mono">-₹{discountAmount.toFixed(2)}</span>
                  </div>
                )}
                
                <div className="flex justify-between text-sm text-body mt-2 pt-2 border-t border-hairline">
                  <span className="font-medium">Taxable Value</span>
                  <span className="font-medium text-ink font-mono">₹{taxableValueSum.toFixed(2)}</span>
                </div>

                {enableSalesGST && (
                  <div className="mt-2 space-y-1.5">
                    {Object.entries(taxBreakdown.cgst).map(([pct, amt]) => (
                      <div key={`cgst-${pct}`} className="flex justify-between items-center text-xs text-body">
                        <span>CGST ({pct}%)</span>
                        <span className="font-medium text-ink font-mono">₹{amt.toFixed(2)}</span>
                      </div>
                    ))}
                    {Object.entries(taxBreakdown.sgst).map(([pct, amt]) => (
                      <div key={`sgst-${pct}`} className="flex justify-between items-center text-xs text-body">
                        <span>SGST ({pct}%)</span>
                        <span className="font-medium text-ink font-mono">₹{amt.toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                )}
                
                {roundOff !== 0 && (
                  <div className="flex justify-between items-center text-xs text-body">
                    <span>Round off</span>
                    <span className="font-medium text-ink font-mono">{roundOff > 0 ? '+' : ''}{roundOff.toFixed(2)}</span>
                  </div>
                )}
                
                <div className="flex justify-between items-end border-t border-hairline pt-3 mt-4">
                  <span className="text-ink font-semibold">Grand Total</span>
                  <span className="text-2xl font-display font-bold text-ink tracking-tight leading-none font-mono">₹{grandTotal.toFixed(2)}</span>
                </div>
                
                {posMode === 'billing' ? (
                  <>
                    <div className="flex justify-between items-center text-sm text-body pt-3 pb-1 border-t border-hairline mt-3">
                      <span className="font-medium">Amount Paid</span>
                      <div className="flex items-center">
                        <span className="text-muted font-medium mr-1">₹</span>
                        <input 
                          type="number" 
                          min="0"
                          max={grandTotal}
                          value={paidAmount === '' ? '' : paidAmount}
                          onChange={(e) => {
                            let val: number | string = e.target.value === '' ? '' : Number(e.target.value);
                            if (typeof val === 'number' && val > grandTotal) val = Number(grandTotal.toFixed(2));
                            setPaidAmount(val as number | '');
                          }}
                          placeholder={grandTotal > 0 ? grandTotal.toFixed(2) : '0'}
                          className="w-20 text-right border-b border-hairline bg-transparent py-0.5 focus:outline-none focus:border-primary font-bold text-ink transition-colors font-mono"
                        />
                      </div>
                    </div>

                    {/* Payment Mode Selector */}
                    {effectivePaidAmount > 0 && (
                      <div className="pt-2 pb-1 border-t border-hairline/60 mt-1.5 space-y-2">
                        <div className="flex items-center justify-between text-xs text-muted font-medium">
                          <span>Payment Mode:</span>
                          <span className="font-semibold text-ink">{paymentMethod}</span>
                        </div>
                        <div className="grid grid-cols-4 gap-1.5">
                          {(['Cash', 'UPI', 'Card', 'Cheque'] as const).map(mode => (
                            <button
                              key={mode}
                              type="button"
                              onClick={() => setPaymentMethod(mode)}
                              className={`py-1.5 px-1 text-[11px] font-medium rounded border transition-colors text-center ${paymentMethod === mode ? 'bg-primary text-on-primary border-primary font-semibold shadow-2xs' : 'bg-canvas text-ink border-hairline hover:bg-surface-soft'}`}
                            >
                              {mode}
                            </button>
                          ))}
                        </div>

                        {/* Cheque Details Sub-Box */}
                        {paymentMethod === 'Cheque' && (
                          <div className="p-2.5 bg-surface-soft border border-hairline rounded-md text-xs space-y-2 animate-in fade-in duration-150">
                            <div className="flex items-center gap-1 font-semibold text-ink text-[11px] uppercase tracking-wider">
                              <CreditCard className="w-3.5 h-3.5 text-primary" />
                              Cheque Details
                            </div>
                            
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <label className="text-[10px] text-muted block mb-0.5 uppercase">Cheque No *</label>
                                <input
                                  type="text"
                                  placeholder="004128"
                                  value={posChequeNo}
                                  onChange={e => setPosChequeNo(e.target.value)}
                                  className="w-full px-2 py-1 bg-canvas border border-hairline rounded text-xs text-ink focus:outline-none focus:border-primary font-mono"
                                />
                              </div>
                              <div>
                                <label className="text-[10px] text-muted block mb-0.5 uppercase">Bank Name</label>
                                <input
                                  type="text"
                                  placeholder="HDFC / SBI"
                                  value={posBankName}
                                  onChange={e => setPosBankName(e.target.value)}
                                  className="w-full px-2 py-1 bg-canvas border border-hairline rounded text-xs text-ink focus:outline-none focus:border-primary"
                                />
                              </div>
                            </div>

                            <div>
                              <label className="text-[10px] text-muted block mb-0.5 uppercase">Cheque Date *</label>
                              <input
                                type="date"
                                value={posChequeDate}
                                onChange={e => setPosChequeDate(e.target.value)}
                                className="w-full px-2 py-1 bg-canvas border border-hairline rounded text-xs text-ink focus:outline-none focus:border-primary"
                              />
                            </div>

                            {/* Live Badge */}
                            {isPdcDate(posChequeDate) ? (
                              <div className="p-1.5 bg-amber-500/10 border border-amber-500/25 rounded text-[11px] text-amber-700 dark:text-amber-300 flex items-start gap-1.5">
                                <Calendar className="w-3.5 h-3.5 shrink-0 mt-0.5 text-amber-600" />
                                <div>
                                  <span className="font-semibold block">Post-Dated Cheque (PDC)</span>
                                  Balance remains pending until cleared in Cheque Tracker.
                                </div>
                              </div>
                            ) : (
                              <div className="p-1.5 bg-emerald-500/10 border border-emerald-500/25 rounded text-[11px] text-emerald-700 dark:text-emerald-300 flex items-start gap-1.5">
                                <CheckCircle2 className="w-3.5 h-3.5 shrink-0 mt-0.5 text-emerald-600" />
                                <div>
                                  <span className="font-semibold block">Present Date Cheque</span>
                                  Cleared immediately upon sale completion.
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    {isCreditPending && (
                      <div className="flex justify-between items-center text-xs text-signature-coral font-semibold pt-1">
                        <span>Pending Balance</span>
                        <span className="font-mono">₹{pendingBalance.toFixed(2)}</span>
                      </div>
                    )}
                    {isCreditPending && customerId === '' && (
                      <div className="text-[11px] text-signature-coral font-medium mt-1 text-right">
                        *Select a customer to record credit
                      </div>
                    )}
                  </>
                ) : (
                  <div className="pt-3 border-t border-hairline mt-3">
                    <label className="text-xs text-muted block mb-1 font-medium">Remarks / Validity (Optional)</label>
                    <input
                      type="text"
                      placeholder="e.g. Valid for 15 days, prices subject to confirmation..."
                      value={quotationNotes}
                      onChange={(e) => setQuotationNotes(e.target.value)}
                      className="w-full text-xs bg-canvas border border-hairline rounded-md px-3 py-2 text-ink placeholder:text-muted focus:outline-none focus:border-primary transition-colors"
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Checkout / Save Buttons */}
            <div className="p-4 bg-canvas border-t border-hairline flex flex-col gap-2 shrink-0">
              {posMode === 'billing' ? (
                <button 
                  type="button"
                  onClick={handleCheckout}
                  disabled={cart.length === 0 || isProcessing || (!editSaleId && isCreditPending && customerId === '')}
                  className={`w-full font-semibold py-3 rounded-lg flex justify-center items-center text-sm transition-all shadow-sm ${
                    (cart.length === 0 || isProcessing || (!editSaleId && isCreditPending && customerId === '')) 
                      ? 'bg-surface-strong text-muted cursor-not-allowed' 
                      : 'bg-primary hover:bg-primary-active text-on-primary active:scale-[0.99]'
                  }`}
                  title="Press Ctrl+S to complete sale"
                >
                  <IndianRupee className="w-4 h-4 mr-2" /> 
                  {isProcessing ? 'Processing...' : editSaleId ? 'Update Sale (Ctrl+S)' : convertingQuotationId ? 'Complete Sale & Convert (Ctrl+S)' : 'Complete Sale (Ctrl+S)'}
                </button>
              ) : (
                <button 
                  type="button"
                  onClick={handleSaveQuotation}
                  disabled={cart.length === 0 || isProcessing}
                  className={`w-full font-semibold py-3 rounded-lg flex justify-center items-center text-sm transition-all shadow-sm ${
                    (cart.length === 0 || isProcessing) 
                      ? 'bg-surface-strong text-muted cursor-not-allowed' 
                      : 'bg-amber-600 hover:bg-amber-700 text-white active:scale-[0.99]'
                  }`}
                  title="Press Ctrl+S to save quotation"
                >
                  <Printer className="w-4 h-4 mr-2" /> 
                  {isProcessing ? 'Saving Quotation...' : 'Save & Print Quotation (Ctrl+S)'}
                </button>
              )}

              <button 
                type="button"
                onClick={() => {
                  setCart([]);
                  setConvertingQuotationId(null);
                  setConvertingQuotationNumber(null);
                }}
                disabled={cart.length === 0}
                className={`w-full font-medium py-1.5 rounded-lg transition-colors text-xs ${
                  cart.length === 0 
                    ? 'bg-transparent text-muted/40 cursor-not-allowed' 
                    : 'bg-transparent text-muted hover:bg-surface-strong hover:text-danger'
                }`}
              >
                Clear Cart
              </button>
            </div>
          </div>

          {/* Column 3: Products Catalog & Search */}
          <div className="w-[350px] flex flex-col p-5 overflow-hidden bg-surface-soft border-l border-hairline shrink-0">
            <header className="mb-3 shrink-0">
              <h2 className="text-lg font-display font-medium text-ink tracking-tight">Products</h2>
              <p className="text-xs text-muted mt-0.5">
                {posMode === 'quotation' 
                  ? 'Add products to quotation voucher' 
                  : (sourceType === 'warehouse' 
                      ? `Stock from: 🏢 ${warehouses.find(w => w.id === sourceWarehouseId)?.name || 'Godown'}`
                      : 'Stock from: 🏪 Main Shop')}
              </p>
            </header>

            <div className="relative w-full mb-3 shrink-0">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted w-4 h-4" />
              <input 
                ref={searchInputRef}
                type="text" 
                placeholder="Search by name/model..." 
                className="w-full pl-9 pr-8 py-2 text-xs bg-canvas border border-hairline rounded-md shadow-xs focus:outline-none focus:border-primary transition-colors text-ink placeholder-muted"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={handleKeyDown}
                autoFocus
              />
              {search.trim() !== '' && (
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
                    Type product name or model number to search and add to bill
                  </p>
                </div>
              ) : displayProducts.length > 0 ? (
                <div className="bg-canvas border border-hairline rounded-lg shadow-xs overflow-hidden divide-y divide-hairline">
                  {displayProducts.map((p, index) => {
                    const inCartItem = cart.find(c => c.id === p.id);
                    const isSelected = index === selectedIndex;
                    const isOutOfStock = p.stock_quantity <= 0;
                    
                    return (
                      <div 
                        key={p.id} 
                        onClick={() => addToCart(p)}
                        onMouseEnter={() => setSelectedIndex(index)}
                        className={`px-3.5 py-3 cursor-pointer transition-colors flex items-center justify-between gap-3 ${
                          isSelected ? 'bg-primary/5' : 'hover:bg-surface-soft'
                        }`}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-ink text-sm truncate">{p.name}</span>
                            {p.model && (
                              <span className="text-xs text-muted truncate">({p.model})</span>
                            )}
                          </div>
                          <div className="text-xs text-muted mt-0.5 flex items-center gap-2 flex-wrap">
                            {isOutOfStock ? (
                              <span className="text-danger font-medium text-xs">Out of stock (0)</span>
                            ) : (
                              <span>
                                Stock: <strong className="text-ink font-semibold">{p.stock_quantity}</strong> {p.unit || 'pc'}
                              </span>
                            )}
                            {inCartItem && (
                              <>
                                <span className="text-muted/40">•</span>
                                <span className="text-[11px] font-semibold text-primary">
                                  {inCartItem.cart_qty} in cart
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                        
                        <div className="text-right shrink-0">
                          <div className="font-bold text-ink text-sm font-mono">₹{p.selling_price.toFixed(2)}</div>
                          {p.unit && <div className="text-[10px] text-muted">/ {p.unit}</div>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="py-12 text-center text-xs text-muted bg-canvas border border-hairline rounded-lg">
                  <Search className="w-8 h-8 mx-auto mb-2 text-muted/30 stroke-1" />
                  <p className="font-medium text-ink">No products found</p>
                  <p className="text-[11px] text-muted mt-0.5">Try searching with a different name or model</p>
                </div>
              )}
            </div>
          </div>

        </div>

      </div>

      {/* Quotations Modal */}
      {isQuotationsModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-4xl bg-canvas border border-hairline rounded-xl shadow-2xl flex flex-col max-h-[85vh] overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-hairline flex items-center justify-between bg-surface-soft">
              <div>
                <h2 className="text-lg font-display font-medium text-ink flex items-center gap-2">
                  <FileText className="w-5 h-5 text-primary" />
                  Quotations & Estimates
                </h2>
                <p className="text-xs text-muted mt-0.5">
                  Manage saved quotes, print estimates for customers, or convert them directly to sale bills.
                </p>
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setPosMode('quotation');
                    setConvertingQuotationId(null);
                    setConvertingQuotationNumber(null);
                    setCart([]);
                    setIsQuotationsModalOpen(false);
                  }}
                  className="px-3.5 py-1.5 text-xs font-semibold bg-primary hover:bg-primary-active text-on-primary rounded-md flex items-center gap-1.5 transition-colors shadow-xs"
                >
                  <Plus className="w-4 h-4" />
                  + New Quotation
                </button>
                <button
                  type="button"
                  onClick={() => setIsQuotationsModalOpen(false)}
                  className="p-1.5 text-muted hover:text-ink hover:bg-surface-strong rounded-md transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Search and Filter Tabs */}
            <div className="p-4 border-b border-hairline bg-canvas flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="relative w-full sm:w-80">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
                <input
                  type="text"
                  placeholder="Search quote no, customer, date..."
                  value={quotationSearch}
                  onChange={(e) => setQuotationSearch(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 text-xs bg-surface-soft border border-hairline rounded-md text-ink placeholder-muted focus:outline-none focus:border-primary"
                />
              </div>

              <div className="flex items-center gap-1 bg-surface-soft p-1 rounded-md border border-hairline text-xs font-medium">
                {(['All', 'Pending', 'Converted'] as const).map(tab => (
                  <button
                    type="button"
                    key={tab}
                    onClick={() => setQuotationStatusFilter(tab)}
                    className={`px-3 py-1 rounded transition-colors ${
                      quotationStatusFilter === tab 
                        ? 'bg-canvas text-ink shadow-xs font-semibold' 
                        : 'text-muted hover:text-ink'
                    }`}
                  >
                    {tab}
                    <span className="ml-1 text-[10px] opacity-70">
                      ({tab === 'All' ? quotationsList.length : quotationsList.filter(q => q.status === tab).length})
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Quotations List */}
            <div className="flex-1 overflow-y-auto p-4 bg-canvas">
              {filteredQuotations.length === 0 ? (
                <div className="py-16 text-center text-muted flex flex-col items-center">
                  <FileText className="w-12 h-12 mb-3 opacity-30" />
                  <p className="font-medium text-sm text-ink">No quotations found</p>
                  <p className="text-xs text-muted mt-1 max-w-sm">
                    {quotationSearch ? 'No quotations match your search query.' : 'Create your first quotation by clicking "+ New Quotation" above.'}
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-hairline border border-hairline rounded-lg overflow-hidden">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-surface-soft text-muted font-medium border-b border-hairline">
                      <tr>
                        <th className="py-2.5 px-4">Quote No</th>
                        <th className="py-2.5 px-4">Date</th>
                        <th className="py-2.5 px-4">Customer</th>
                        <th className="py-2.5 px-4 text-right">Amount</th>
                        <th className="py-2.5 px-4 text-center">Status</th>
                        <th className="py-2.5 px-4 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-hairline bg-canvas">
                      {filteredQuotations.map(q => (
                        <tr key={q.id} className="hover:bg-surface-soft/60 transition-colors">
                          <td className="py-3 px-4 font-mono font-bold text-ink">
                            {q.quotation_number}
                          </td>
                          <td className="py-3 px-4 text-muted">
                            {new Date(q.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                          </td>
                          <td className="py-3 px-4 font-medium text-ink">
                            {q.customer_name || 'Walk-in Customer'}
                          </td>
                          <td className="py-3 px-4 text-right font-semibold text-ink font-mono">
                            ₹{q.net_amount.toFixed(2)}
                          </td>
                          <td className="py-3 px-4 text-center">
                            {q.status === 'Pending' ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30">
                                <Clock className="w-3 h-3" /> Pending
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20" title={`Converted to Sale Bill ${q.converted_invoice_no || ''}`}>
                                <CheckCircle2 className="w-3 h-3" /> Bill: {q.converted_invoice_no || 'Done'}
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              {q.status === 'Pending' && (
                                <button
                                  type="button"
                                  onClick={() => handleConvertQuotation(q.id)}
                                  className="px-2.5 py-1 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white rounded flex items-center gap-1 shadow-xs transition-colors"
                                  title="Convert to active Sale Bill in POS cart"
                                >
                                  <ArrowRight className="w-3.5 h-3.5" />
                                  <span>Convert to Bill</span>
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => handlePrintQuotation(q.id)}
                                className="px-2.5 py-1 text-xs font-medium bg-surface-soft hover:bg-surface-strong text-ink border border-hairline rounded flex items-center gap-1 transition-colors"
                                title="Print Estimate Voucher"
                              >
                                <Printer className="w-3.5 h-3.5 text-muted" />
                                <span>Print</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteQuotation(q.id)}
                                className="p-1 text-muted hover:text-danger rounded hover:bg-surface-strong transition-colors"
                                title="Delete quotation"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-3 border-t border-hairline bg-surface-soft flex items-center justify-between text-xs text-muted">
              <span>Showing {filteredQuotations.length} of {quotationsList.length} quotations</span>
              <button
                type="button"
                onClick={() => setIsQuotationsModalOpen(false)}
                className="px-4 py-1.5 bg-canvas hover:bg-surface-strong border border-hairline rounded text-ink font-medium transition-colors"
              >
                Close
              </button>
            </div>

          </div>
        </div>
      )}
      {/* 2. SALE / QUOTATION COMPLETED DETAILS POPUP MODAL */}
      {completedSaleModal && (
        <div className="fixed inset-0 bg-ink/50 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-canvas border border-hairline rounded-2xl shadow-2xl w-full max-w-xl max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            
            {/* Header: Clean Hero */}
            <div className="px-6 pt-6 pb-5 border-b border-hairline bg-surface-soft/60 shrink-0">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center border border-emerald-500/20 shrink-0 shadow-xs">
                    <CheckCircle2 className="w-6 h-6" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-base font-bold text-ink">
                        {completedSaleModal.isQuotation ? 'Quotation Saved' : (editSaleId ? 'Sale Bill Updated' : 'Sale Completed Successfully')}
                      </h2>
                      <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                        {completedSaleModal.isQuotation ? 'Quotation' : 'Recorded'}
                      </span>
                    </div>
                    <p className="text-xs text-muted mt-0.5">
                      {completedSaleModal.isQuotation ? `Quote #${completedSaleModal.invoiceNumber}` : `Invoice #${completedSaleModal.invoiceNumber}`} • {completedSaleModal.date}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    if (editSaleId) {
                      navigate('/daybook', { state: { activeTab: 'sales' } });
                    } else {
                      setCompletedSaleModal(null);
                      setTimeout(() => searchInputRef.current?.focus(), 50);
                    }
                  }}
                  className="p-1.5 text-muted hover:text-ink hover:bg-surface-strong rounded-lg transition-colors cursor-pointer"
                  title="Close (Esc)"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Grand Total Hero Banner */}
              <div className="mt-4 p-4 rounded-xl bg-canvas border border-hairline flex items-center justify-between shadow-xs">
                <div>
                  <span className="text-[11px] font-medium text-muted uppercase tracking-wider block">Total Amount</span>
                  <div className="text-2xl font-bold text-ink tracking-tight tabular-nums mt-0.5">
                    ₹{completedSaleModal.netAmount.toFixed(2)}
                  </div>
                </div>
                <div className="text-right">
                  {!completedSaleModal.isQuotation ? (
                    <div>
                      {completedSaleModal.paidAmount >= completedSaleModal.netAmount ? (
                        <div className="text-right">
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                            <Check className="w-3.5 h-3.5" /> Fully Paid ({completedSaleModal.paymentMethod || 'Cash'})
                          </span>
                          {completedSaleModal.chequeNo && (
                            <div className="text-[11px] text-muted mt-1 font-mono">
                              Chq #{completedSaleModal.chequeNo} {completedSaleModal.bankName ? `(${completedSaleModal.bankName})` : ''}
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="space-y-0.5 text-right">
                          <div className="text-xs font-semibold text-ink tabular-nums">
                            Paid: ₹{completedSaleModal.paidAmount.toFixed(2)} ({completedSaleModal.paymentMethod || 'Cash'})
                          </div>
                          {completedSaleModal.chequeNo && (
                            <div className="text-[11px] text-muted font-mono">
                              Chq #{completedSaleModal.chequeNo} {completedSaleModal.bankName ? `(${completedSaleModal.bankName})` : ''}
                            </div>
                          )}
                          <div className="text-xs font-semibold text-signature-coral tabular-nums">
                            Balance Due: ₹{(completedSaleModal.netAmount - completedSaleModal.paidAmount).toFixed(2)}
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <span className="text-xs font-medium text-muted">Estimate Voucher</span>
                  )}
                </div>
              </div>
            </div>

            {/* Scrollable Body: Customer Details + Items + Breakdown */}
            <div className="p-6 overflow-y-auto flex-1 space-y-4">
              
              {/* Customer Info Row */}
              <div className="flex items-center justify-between text-xs py-2 px-3 bg-surface-soft/60 rounded-lg border border-hairline">
                <div className="flex items-center gap-2">
                  <User className="w-4 h-4 text-muted shrink-0" />
                  <span className="text-muted">Customer:</span>
                  <span className="font-semibold text-ink">{completedSaleModal.customerName}</span>
                </div>
                {completedSaleModal.customerDetails?.phone && (
                  <span className="text-muted font-medium">{completedSaleModal.customerDetails.phone}</span>
                )}
                {completedSaleModal.customerDetails?.gstin && (
                  <span className="text-[11px] text-muted">GSTIN: <span className="font-medium text-ink uppercase">{completedSaleModal.customerDetails.gstin}</span></span>
                )}
              </div>

              {/* Items Table */}
              <div>
                <div className="flex items-center justify-between text-[11px] font-semibold text-muted uppercase tracking-wider mb-2 px-1">
                  <span>Purchased Items ({completedSaleModal.items.length})</span>
                  <span>Amount</span>
                </div>

                <div className="border border-hairline rounded-xl overflow-hidden divide-y divide-hairline">
                  {completedSaleModal.items.map((item, idx) => {
                    const itemTotal = item.selling_price * item.cart_qty;
                    return (
                      <div key={idx} className="p-3 bg-canvas flex items-center justify-between text-xs hover:bg-surface-soft/40 transition-colors">
                        <div className="pr-3">
                          <div className="font-semibold text-ink">{item.name}</div>
                          <div className="text-[11px] text-muted mt-0.5 flex items-center gap-1.5 flex-wrap">
                            {item.model && <span className="px-1.5 py-0.5 bg-surface-soft border border-hairline rounded text-[10px] text-body">{item.model}</span>}
                            <span>{item.cart_qty} {item.unit || 'Nos'} × ₹{item.selling_price.toFixed(2)}</span>
                            {item.gst_percentage ? <span className="text-muted">(GST {item.gst_percentage}%)</span> : null}
                          </div>
                        </div>
                        <div className="font-semibold text-ink text-right tabular-nums text-sm shrink-0">
                          ₹{itemTotal.toFixed(2)}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Subtotal & Tax Breakdown */}
              <div className="p-3.5 bg-surface-soft/50 rounded-xl border border-hairline space-y-2 text-xs">
                <div className="flex justify-between text-muted">
                  <span>Subtotal</span>
                  <span className="font-medium text-ink tabular-nums">₹{completedSaleModal.subtotal.toFixed(2)}</span>
                </div>
                {completedSaleModal.discount > 0 && (
                  <div className="flex justify-between text-emerald-600 dark:text-emerald-400">
                    <span>Discount</span>
                    <span className="font-medium tabular-nums">-₹{completedSaleModal.discount.toFixed(2)}</span>
                  </div>
                )}
                {completedSaleModal.taxAmount > 0 && (
                  <div className="flex justify-between text-muted">
                    <span>Tax (GST)</span>
                    <span className="font-medium text-ink tabular-nums">+₹{completedSaleModal.taxAmount.toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between items-center text-xs font-semibold text-ink pt-2 border-t border-hairline">
                  <span>Total Payable</span>
                  <span className="font-bold text-sm text-ink tabular-nums">₹{completedSaleModal.netAmount.toFixed(2)}</span>
                </div>
              </div>

            </div>

            {/* Footer with clean actions */}
            <div className="px-6 py-4 border-t border-hairline bg-surface-soft flex items-center justify-between shrink-0">
              <div className="flex items-center gap-1.5 text-[11px] text-muted">
                <span>Press</span>
                <span className="px-1.5 py-0.5 bg-canvas border border-hairline rounded font-semibold text-[10px] text-ink shadow-2xs">Enter</span>
                <span>to Print,</span>
                <span className="px-1.5 py-0.5 bg-canvas border border-hairline rounded font-semibold text-[10px] text-ink shadow-2xs">Esc</span>
                <span>for Next Sale</span>
              </div>

              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => {
                    if (editSaleId) {
                      navigate('/daybook', { state: { activeTab: 'sales' } });
                    } else {
                      setCompletedSaleModal(null);
                      setTimeout(() => searchInputRef.current?.focus(), 50);
                    }
                  }}
                  className="px-4 py-2 text-xs font-medium rounded-lg border border-hairline bg-canvas hover:bg-surface-strong text-ink transition-colors flex items-center gap-1.5 shadow-2xs cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5 text-muted" />
                  <span>{editSaleId ? 'Done / Back to DayBook' : 'Next Sale'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    window.print();
                  }}
                  className="px-5 py-2 text-xs font-semibold rounded-lg bg-primary hover:bg-primary-active text-on-primary transition-all shadow-sm flex items-center gap-2 cursor-pointer active:scale-[0.98]"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>{completedSaleModal.isQuotation ? 'Print Quotation' : 'Print Invoice'}</span>
                </button>
              </div>
            </div>

          </div>
        </div>
      )}
    </>
  );
}
