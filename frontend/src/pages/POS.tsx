import { useState, useEffect, useRef } from 'react';
import { 
  Search, IndianRupee, X, ShoppingCart, User, UserPlus,
  FileText, Clock, CheckCircle2, ArrowRight, Trash2, Printer, Plus, Check,
  CreditCard, Calendar, Store, Building2, Edit, Eye, Truck
} from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { 
  getSellableProducts, getCustomers, addCustomer, recordSale, getSaleById, updateSaleBill,
  createQuotation, updateQuotation, getQuotations, getQuotationById, markQuotationConverted, deleteQuotation,
  getNextInvoiceNumber, getNextQuotationNumber, isPdcDate, getWarehouses
} from '../lib/db';
import type { Product, CartItem, Customer, Quotation, Warehouse, DispatchDetails } from '../lib/db';
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
  const viewSaleIdParam = searchParams.get('viewId');
  const editSaleId = editSaleIdParam ? Number(editSaleIdParam) : undefined;
  const viewSaleId = viewSaleIdParam ? Number(viewSaleIdParam) : undefined;
  const isViewOnly = Boolean(viewSaleId && !editSaleId);
  const activeSaleId = editSaleId || viewSaleId;
  
  const [cart, setCart] = useState<CartItem[]>([]);
  const [discount, setDiscount] = useState<number>(0);
  const [discountType, setDiscountType] = useState<'amount' | 'percentage'>('percentage');
  const [isProcessing, setIsProcessing] = useState(false);
  
  const [customerId, setCustomerId] = useState<number | ''>('');
  const [paidAmount, setPaidAmount] = useState<number | ''>(0);
  const paidInputRef = useRef<HTMLInputElement>(null);
  const [paymentMethod, setPaymentMethod] = useState<'Cash' | 'UPI' | 'Card' | 'Cheque'>('Cash');
  const [posChequeNo, setPosChequeNo] = useState('');
  const [posBankName, setPosBankName] = useState('');
  const getLocalDate = () => {
    const d = new Date();
    const offset = d.getTimezoneOffset() * 60000;
    return new Date(d.getTime() - offset).toISOString().split('T')[0];
  };

  const [billDate, setBillDate] = useState<string>(getLocalDate);
  const [posChequeDate, setPosChequeDate] = useState(getLocalDate);
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
  const [editingQuotationId, setEditingQuotationId] = useState<number | null>(null);
  const [editingQuotationNumber, setEditingQuotationNumber] = useState<string | null>(null);
  const [editingInvoiceNumber, setEditingInvoiceNumber] = useState<string | null>(null);
  const [nextInvoiceNo, setNextInvoiceNo] = useState<string>('');
  const [nextQuotationNo, setNextQuotationNo] = useState<string>('');
  const [quotationNotes, setQuotationNotes] = useState<string>('');

  // Dispatch & Transport Details (required for sales >= 1 Lakh or on-demand delivery)
  const [dispatchDetails, setDispatchDetails] = useState<DispatchDetails>({
    ewayBillNo: '',
    dispatchDocNo: '',
    dispatchedThrough: '',
    destination: '',
    carrierName: '',
    billOfLadingNo: '',
    motorVehicleNo: '',
    termsOfDelivery: ''
  });
  const [showDispatchModal, setShowDispatchModal] = useState(false);

  const hasDispatchDetails = Boolean(
    dispatchDetails.ewayBillNo?.trim() ||
    dispatchDetails.dispatchDocNo?.trim() ||
    dispatchDetails.motorVehicleNo?.trim() ||
    dispatchDetails.dispatchedThrough?.trim() ||
    dispatchDetails.destination?.trim() ||
    dispatchDetails.carrierName?.trim() ||
    dispatchDetails.billOfLadingNo?.trim() ||
    dispatchDetails.termsOfDelivery?.trim()
  );
  
  useEffect(() => {
    if (customerId === '') {
      setCustomerSearch('');
    } else {
      const c = customers.find(c => c.id === customerId);
      if (c) {
        setCustomerSearch(c.name);
      }
    }
  }, [customerId, customers]);

  const filteredCustomers = customers.filter(c => 
    c.name.toLowerCase().includes(customerSearch.toLowerCase()) || 
    (c.phone && c.phone.includes(customerSearch))
  );

  // Quick Add Customer state & handlers
  const [isQuickCustomerModalOpen, setIsQuickCustomerModalOpen] = useState(false);
  const [quickCustomerName, setQuickCustomerName] = useState('');
  const [quickCustomerPhone, setQuickCustomerPhone] = useState('');
  const [quickCustomerGstin, setQuickCustomerGstin] = useState('');
  const [quickCustomerAddress, setQuickCustomerAddress] = useState('');
  const [isSavingQuickCustomer, setIsSavingQuickCustomer] = useState(false);

  function openQuickCustomerModal(initialName: string = '') {
    setQuickCustomerName(initialName);
    setQuickCustomerPhone('');
    setQuickCustomerGstin('');
    setQuickCustomerAddress('');
    setIsQuickCustomerModalOpen(true);
  }

  function closeQuickCustomerModal() {
    setIsQuickCustomerModalOpen(false);
    setQuickCustomerName('');
    setQuickCustomerPhone('');
    setQuickCustomerGstin('');
    setQuickCustomerAddress('');
  }

  async function handleSaveQuickCustomer(e: React.FormEvent) {
    e.preventDefault();
    if (!quickCustomerName.trim()) return;

    try {
      setIsSavingQuickCustomer(true);
      const cleanName = quickCustomerName.trim();
      const cleanPhone = quickCustomerPhone.trim();
      const cleanGstin = quickCustomerGstin.replace(/\s+/g, '').toUpperCase();
      const cleanAddress = quickCustomerAddress.trim();

      const newId = await addCustomer(cleanName, cleanPhone, '', cleanAddress, cleanGstin);
      const updatedList = await getCustomers();
      setCustomers(updatedList);
      setCustomerId(newId);
      setCustomerSearch(cleanName);
      closeQuickCustomerModal();
      setIsCustomerDropdownOpen(false);
    } catch (err) {
      console.error('Failed to create customer:', err);
      alert(`Error creating customer: ${err}`);
    } finally {
      setIsSavingQuickCustomer(false);
    }
  }

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

  // Track original tax method, GST status and sale record when viewing or editing a past bill/quotation
  const [loadedSaleTaxMethod, setLoadedSaleTaxMethod] = useState<'exclusive' | 'inclusive' | null>(null);
  const [loadedSaleEnableGST, setLoadedSaleEnableGST] = useState<boolean | null>(null);
  const [loadedSaleRecord, setLoadedSaleRecord] = useState<any | null>(null);

  // If viewing or editing a past transaction, lock to its original tax method; otherwise use the global setting
  const effectiveSalesTaxMethod: 'exclusive' | 'inclusive' = 
    (activeSaleId || editingQuotationId || convertingQuotationId) && loadedSaleTaxMethod !== null
      ? loadedSaleTaxMethod
      : salesTaxMethod;

  const effectiveEnableSalesGST: boolean = 
    (activeSaleId || editingQuotationId || convertingQuotationId) && loadedSaleEnableGST !== null
      ? loadedSaleEnableGST
      : enableSalesGST;

  useEffect(() => {
    const handlePrefChange = () => {
      const gVal = localStorage.getItem('enableSalesGST');
      setEnableSalesGST(gVal !== null ? gVal !== 'false' : localStorage.getItem('enableGST') !== 'false');
      
      const tVal = localStorage.getItem('salesTaxMethod') as 'exclusive' | 'inclusive';
      setSalesTaxMethod(tVal || (localStorage.getItem('taxMethod') as 'exclusive' | 'inclusive') || 'exclusive');

      refreshNextNumbers();
    };
    window.addEventListener('preferencesUpdated', handlePrefChange);
    return () => window.removeEventListener('preferencesUpdated', handlePrefChange);
  }, []);

  useEffect(() => {
    loadProducts();
    refreshQuotations();
    refreshNextNumbers();
    if (activeSaleId) {
      loadEditData(activeSaleId);
    } else {
      setLoadedSaleRecord(null);
      setLoadedSaleTaxMethod(null);
      setLoadedSaleEnableGST(null);
    }
  }, [activeSaleId]);

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
        setLoadedSaleRecord(s);
        setEditingInvoiceNumber(s.invoice_number || `Bill #${s.id}`);
        if (s.date) setBillDate(s.date.split(' ')[0]);
        if (s.customer_id) setCustomerId(s.customer_id);

        // Detect original tax method & GST status from the saved bill data
        const originalPriceBasis = (s.items || []).reduce(
          (sum: number, i: any) => sum + (Number(i.unit_price || 0) * Number(i.quantity || 0)),
          0
        );
        const netAmount = Number(s.net_amount || 0);
        const taxAmount = Number(s.tax_amount || 0);
        const discountAmount = Number(s.discount || 0);
        const diffInclusive = Math.abs(netAmount - (originalPriceBasis - discountAmount));
        const diffExclusive = Math.abs(netAmount - (originalPriceBasis - discountAmount + taxAmount));
        const isInclusive = taxAmount > 0 ? (diffInclusive < diffExclusive) : (diffInclusive <= 1.0);
        setLoadedSaleTaxMethod(isInclusive ? 'inclusive' : 'exclusive');
        setLoadedSaleEnableGST(taxAmount > 0);

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
          stock_quantity: i.stock_quantity,
          shop_stock: i.shop_stock,
          warehouse_stocks: i.warehouse_stocks,
          item_source_type: i.item_source_type || 'shop',
          item_warehouse_id: i.item_warehouse_id || null,
          item_warehouse_name: i.item_warehouse_name || (i.item_source_type === 'warehouse' ? 'Godown' : 'Main Shop'),
          cart_key: `${i.product_id}_${i.item_source_type || 'shop'}_${i.item_warehouse_id || 0}`
        } as CartItem)));
        if (s.source_type) setSourceType(s.source_type as 'shop' | 'warehouse');
        if (s.source_warehouse_id) setSourceWarehouseId(s.source_warehouse_id);
        setDiscountType('amount');
        setDiscount(s.discount);
        setPaidAmount(s.paid_amount || 0);
        if (s.payment_method) setPaymentMethod(s.payment_method as any);

        if (s.dispatchDetails) {
          setDispatchDetails(s.dispatchDetails);
        } else if (s.dispatch_details) {
          try {
            setDispatchDetails(JSON.parse(s.dispatch_details));
          } catch (e) {
            // ignore
          }
        } else {
          setDispatchDetails({
            ewayBillNo: '',
            dispatchDocNo: '',
            dispatchedThrough: '',
            destination: '',
            carrierName: '',
            billOfLadingNo: '',
            motorVehicleNo: '',
            termsOfDelivery: ''
          });
        }
      }
    } catch (e) {
      console.error(e);
    }
  }

  function handleCancelEditBill() {
    (window as any).__isEditingActive = false;
    setCart([]);
    setCustomerId('');
    setDiscount(0);
    setPaidAmount(0);
    setEditingInvoiceNumber(null);
    setLoadedSaleRecord(null);
    setLoadedSaleTaxMethod(null);
    setLoadedSaleEnableGST(null);
    setBillDate(getLocalDate());
    setDispatchDetails({
      ewayBillNo: '',
      dispatchDocNo: '',
      dispatchedThrough: '',
      destination: '',
      carrierName: '',
      billOfLadingNo: '',
      motorVehicleNo: '',
      termsOfDelivery: ''
    });
    if (location.state?.from === 'contacts' && location.state?.partyId) {
      navigate('/contacts', {
        state: {
          activeTab: location.state.partyType || 'customers',
          selectedPartyId: location.state.partyId
        }
      });
    } else {
      navigate('/daybook', {
        state: location.state || { activeTab: 'sales' }
      });
    }
  }

  function handleCancelEditQuotation() {
    (window as any).__isEditingActive = false;
    setEditingQuotationId(null);
    setEditingQuotationNumber(null);
    setCart([]);
    setDiscount(0);
    setQuotationNotes('');
    setLoadedSaleTaxMethod(null);
    setLoadedSaleEnableGST(null);
    setBillDate(getLocalDate());
    setPosMode('billing');
  }

  // Global Edit Mode Lock flag for app-wide navigation prevention
  useEffect(() => {
    if (activeSaleId || editingQuotationId) {
      (window as any).__isEditingActive = true;
    } else {
      (window as any).__isEditingActive = false;
    }
    return () => {
      (window as any).__isEditingActive = false;
    };
  }, [activeSaleId, editingQuotationId]);

  // Global Escape key handler to cancel active bill or quotation edit
  useEffect(() => {
    const handleGlobalEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (completedSaleModal) return;
        if (showDispatchModal) {
          setShowDispatchModal(false);
          return;
        }
        if (isQuickCustomerModalOpen) {
          setIsQuickCustomerModalOpen(false);
          return;
        }
        if (isQuotationsModalOpen) {
          setIsQuotationsModalOpen(false);
          return;
        }

        if (activeSaleId) {
          e.preventDefault();
          e.stopPropagation();
          handleCancelEditBill();
        } else if (editingQuotationId) {
          e.preventDefault();
          e.stopPropagation();
          handleCancelEditQuotation();
        }
      }
    };
    window.addEventListener('keydown', handleGlobalEsc);
    return () => window.removeEventListener('keydown', handleGlobalEsc);
  }, [activeSaleId, editingQuotationId, completedSaleModal, isQuotationsModalOpen, isQuickCustomerModalOpen, location.state]);

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

  function getItemCartKey(item: { id: number; item_source_type?: string; item_warehouse_id?: number | null }): string {
    return `${item.id}_${item.item_source_type || 'shop'}_${item.item_warehouse_id || 0}`;
  }

  // Reload products dynamically when source inventory location changes
  useEffect(() => {
    const whIdToUse = sourceType === 'warehouse' && sourceWarehouseId !== '' ? Number(sourceWarehouseId) : null;
    getSellableProducts(whIdToUse).then(newProducts => {
      setProducts(newProducts);
      // If currently viewing a bill, cart is strictly read-only and must never be altered or clamped
      if (isViewOnly) return;

      setCart(prevCart => prevCart.map(cartItem => {
        const matching = newProducts.find(p => p.id === cartItem.id);
        const itemSrc = cartItem.item_source_type || 'shop';
        const itemWh = cartItem.item_warehouse_id;
        let availStock = 0;
        if (itemSrc === 'warehouse' && itemWh) {
          availStock = matching?.warehouse_stocks?.[itemWh] ?? 0;
        } else {
          availStock = matching?.shop_stock ?? matching?.stock_quantity ?? 0;
        }

        // When editing an existing bill or in quotation mode, do NOT clamp historical cart quantities
        const shouldClampQty = !activeSaleId && posMode === 'billing';

        return {
          ...cartItem,
          stock_quantity: activeSaleId ? cartItem.stock_quantity : availStock,
          shop_stock: matching?.shop_stock ?? cartItem.shop_stock,
          warehouse_stocks: matching?.warehouse_stocks ?? cartItem.warehouse_stocks,
          cart_qty: shouldClampQty ? Math.min(availStock > 0 ? availStock : 1, cartItem.cart_qty) : cartItem.cart_qty
        };
      }));
    }).catch(console.error);
  }, [sourceType, sourceWarehouseId, isViewOnly, activeSaleId, posMode]);

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

  function addToCart(product: Product, forcedSourceType?: 'shop' | 'warehouse', forcedWhId?: number | null) {
    if (isViewOnly) return;

    // Default source: Main Shop ('shop'), unless forced or if global sourceType is set to warehouse
    const targetSource: 'shop' | 'warehouse' = forcedSourceType || (sourceType === 'warehouse' ? 'warehouse' : 'shop');
    const targetWhId: number | null = targetSource === 'warehouse' 
      ? (forcedWhId !== undefined ? forcedWhId : (sourceWarehouseId !== '' ? Number(sourceWarehouseId) : (warehouses[0]?.id || null)))
      : null;

    let targetAvailStock = 0;
    let targetWhName = 'Main Shop';
    if (targetSource === 'warehouse' && targetWhId) {
      targetAvailStock = product.warehouse_stocks?.[targetWhId] ?? 0;
      targetWhName = warehouses.find(w => w.id === targetWhId)?.name || 'Godown';
    } else {
      targetAvailStock = product.shop_stock ?? product.stock_quantity ?? 0;
    }

    if (posMode === 'billing' && targetAvailStock <= 0) {
      // If adding from Shop and Shop has 0, but a Godown has stock, offer to add from Godown!
      const godownsWithStock = warehouses.filter(w => (product.warehouse_stocks?.[w.id] || 0) > 0);
      if (targetSource === 'shop' && godownsWithStock.length > 0) {
        const firstWh = godownsWithStock[0];
        const confirmAdd = confirm(
          `Main Shop is out of stock for "${product.name}", but "${firstWh.name}" has ${product.warehouse_stocks?.[firstWh.id]} ${product.unit || 'pc'} in stock.\n\nDo you want to add it from "${firstWh.name}"?`
        );
        if (confirmAdd) {
          addToCart(product, 'warehouse', firstWh.id);
          return;
        }
      }
      alert(`"${product.name}" is out of stock in ${targetWhName}!`);
      return;
    }

    const targetKey = `${product.id}_${targetSource}_${targetWhId || 0}`;

    setCart(prev => {
      const existing = prev.find(item => getItemCartKey(item) === targetKey);
      if (existing) {
        if (posMode === 'billing' && existing.cart_qty >= targetAvailStock) {
          alert(`Cannot add more than available stock (${targetAvailStock}) in ${targetWhName}!`);
          return prev;
        }
        return prev.map(item => 
          getItemCartKey(item) === targetKey ? { ...item, cart_qty: item.cart_qty + 1 } : item
        );
      }
      return [
        ...prev, 
        { 
          ...product, 
          cart_qty: 1,
          item_source_type: targetSource,
          item_warehouse_id: targetWhId,
          item_warehouse_name: targetWhName,
          stock_quantity: targetAvailStock,
          cart_key: targetKey
        }
      ];
    });
    setSearch('');
  }

  function handleChangeItemSource(item: CartItem, newSourceStr: string) {
    if (isViewOnly) return;
    
    let newSourceType: 'shop' | 'warehouse' = 'shop';
    let newWhId: number | null = null;
    let newWhName = 'Main Shop';
    let newStock = item.shop_stock ?? 0;

    if (newSourceStr.startsWith('wh_')) {
      newSourceType = 'warehouse';
      newWhId = Number(newSourceStr.replace('wh_', ''));
      const wh = warehouses.find(w => w.id === newWhId);
      newWhName = wh?.name || 'Godown';
      newStock = item.warehouse_stocks?.[newWhId] ?? 0;
    }

    if (posMode === 'billing' && newStock <= 0) {
      alert(`No stock available for "${item.name}" in ${newWhName}! (Stock: 0)`);
      return;
    }

    const currentKey = getItemCartKey(item);
    const newKey = `${item.id}_${newSourceType}_${newWhId || 0}`;

    setCart(prev => {
      const existingNew = prev.find(i => getItemCartKey(i) === newKey);
      if (existingNew && currentKey !== newKey) {
        const combinedQty = posMode === 'billing' 
          ? Math.min(newStock, existingNew.cart_qty + item.cart_qty)
          : existingNew.cart_qty + item.cart_qty;
        
        return prev
          .filter(i => getItemCartKey(i) !== currentKey)
          .map(i => getItemCartKey(i) === newKey ? { ...i, cart_qty: combinedQty, stock_quantity: newStock } : i);
      }

      return prev.map(i => {
        if (getItemCartKey(i) === currentKey) {
          const validQty = posMode === 'billing' ? Math.min(newStock, i.cart_qty) : i.cart_qty;
          return {
            ...i,
            item_source_type: newSourceType,
            item_warehouse_id: newWhId,
            item_warehouse_name: newWhName,
            stock_quantity: newStock,
            cart_qty: Math.max(1, validQty),
            cart_key: newKey
          };
        }
        return i;
      });
    });
  }

  function handleAddFromGodown(item: CartItem, warehouseId: number) {
    if (isViewOnly) return;
    const prod = products.find(p => p.id === item.id) || item;
    addToCart(prod, 'warehouse', warehouseId);
  }

  function setQty(cartKey: string, qty: number) {
    if (isViewOnly) return;
    setCart(prev => prev.map(item => {
      if (getItemCartKey(item) === cartKey) {
        const maxStock = item.stock_quantity;
        const newQty = posMode === 'billing' 
          ? Math.min(maxStock > 0 ? maxStock : 1, Math.max(0, qty))
          : Math.max(0, qty);
        return { ...item, cart_qty: newQty };
      }
      return item;
    }));
  }

  function updateRate(cartKey: string, newRate: number) {
    if (isViewOnly) return;
    setCart(prev => prev.map(item => 
      getItemCartKey(item) === cartKey ? { ...item, selling_price: newRate } : item
    ));
  }

  function removeFromCart(cartKey: string) {
    if (isViewOnly) return;
    setCart(prev => prev.filter(item => getItemCartKey(item) !== cartKey));
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
          if (location.state?.from === 'contacts' && location.state?.partyId) {
            navigate('/contacts', {
              state: {
                activeTab: location.state.partyType || 'customers',
                selectedPartyId: location.state.partyId
              }
            });
          } else {
            navigate('/daybook', { state: { activeTab: 'sales' } });
          }
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
    if (isViewOnly) return;
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
      paidInputRef.current?.focus();
      return;
    }
    if (grandTotal > 0 && (paidAmount === '' || paidAmount === null)) {
      alert("Please enter the Amount Paid by the customer to proceed.");
      paidInputRef.current?.focus();
      paidInputRef.current?.select();
      return;
    }
    if (grandTotal > 0 && finalPaidAmount <= 0 && customerId === '') {
      alert("Please enter the Amount Paid. Walk-in customers cannot have ₹0 payment.");
      paidInputRef.current?.focus();
      paidInputRef.current?.select();
      return;
    }
    if (!editSaleId && isCreditPending && customerId === '') {
      alert(`Walk-in customers cannot take items on credit. Please enter the full amount (₹${grandTotal.toFixed(2)}) or select a registered customer to record balance due.`);
      paidInputRef.current?.focus();
      paidInputRef.current?.select();
      return;
    }
    if (!editSaleId && finalPaidAmount === 0 && customerId !== '') {
      const custObj = customers.find(c => c.id === Number(customerId));
      const custName = custObj ? custObj.name : 'this customer';
      const confirmCredit = confirm(`Amount Paid is ₹0.00.\n\nThe entire bill amount of ₹${grandTotal.toFixed(2)} will be recorded as Credit / Balance Due for ${custName}.\n\nDo you wish to proceed?`);
      if (!confirmCredit) {
        paidInputRef.current?.focus();
        paidInputRef.current?.select();
        return;
      }
    }
    if (finalPaidAmount > 0 && paymentMethod === 'Cheque' && isPdcDate(posChequeDate) && customerId === '') {
      alert("Post-Dated Cheques (PDC) require a registered customer so the pending due can be tracked. Please select or add a Customer.");
      return;
    }
    if (sourceType === 'warehouse' && (sourceWarehouseId === '' || warehouses.length === 0)) {
      alert("Please select a warehouse stock source or create a warehouse first in Inventory.");
      return;
    }

    // High value sale (>= ₹1,00,000 / 1 Lakh) check for mandatory transport & e-Way bill details
    if (grandTotal >= 100000 && !hasDispatchDetails) {
      setShowDispatchModal(true);
      alert("⚠️ High-Value Sale (≥ ₹1,00,000):\nUnder GST guidelines, sales of ₹1 Lakh and above require e-Way Bill and transport / vehicle details.\n\nPlease enter the Dispatch Details to proceed.");
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
          sourceType === 'warehouse' ? Number(sourceWarehouseId) : null,
          billDate,
          hasDispatchDetails ? dispatchDetails : null,
          effectiveSalesTaxMethod
        );
        alert('Sale bill updated successfully!');
      } else {
        const saleRes = await recordSale(
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
          sourceType === 'warehouse' ? Number(sourceWarehouseId) : null,
          billDate,
          hasDispatchDetails ? dispatchDetails : null,
          effectiveSalesTaxMethod
        );
        invoiceNumber = typeof saleRes === 'string' ? saleRes : saleRes.invoiceNumber;
        const actualSaleId = (typeof saleRes === 'string' ? (Number(invoiceNumber.split('-')[1]) || 0) : saleRes.saleId) || 0;

        // If this sale was converted from a quotation, mark quotation as Converted
        if (convertingQuotationId) {
          await markQuotationConverted(convertingQuotationId, actualSaleId, invoiceNumber);
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
        date: new Date(billDate + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }),
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
        taxMethod: effectiveEnableSalesGST ? effectiveSalesTaxMethod : undefined,
        discount: discountAmount,
        netAmount: grandTotal,
        paidAmount: finalPaidAmount,
        paymentMethod,
        chequeNo: paymentMethod === 'Cheque' ? posChequeNo.trim() : undefined,
        bankName: paymentMethod === 'Cheque' ? posBankName.trim() : undefined,
        chequeDate: paymentMethod === 'Cheque' ? posChequeDate : undefined,
        sourceLocationName: sourceType === 'warehouse' ? (whObj ? whObj.name : 'Warehouse') : 'Main Shop',
        dispatchDetails: hasDispatchDetails ? dispatchDetails : undefined
      };

      (window as any).__isEditingActive = false;
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
      setPaidAmount(0);
      setBillDate(getLocalDate());
      setSourceType('shop');
      setDispatchDetails({
        ewayBillNo: '',
        dispatchDocNo: '',
        dispatchedThrough: '',
        destination: '',
        carrierName: '',
        billOfLadingNo: '',
        motorVehicleNo: '',
        termsOfDelivery: ''
      });
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
      let quotationNumber = '';
      if (editingQuotationId) {
        quotationNumber = await updateQuotation(
          editingQuotationId,
          cart,
          subtotal,
          tax,
          discountAmount,
          grandTotal,
          finalCustomerId,
          quotationNotes,
          billDate,
          effectiveSalesTaxMethod
        );
        alert('Quotation updated successfully!');
      } else {
        quotationNumber = await createQuotation(
          cart,
          subtotal,
          tax,
          discountAmount,
          grandTotal,
          finalCustomerId,
          quotationNotes,
          billDate,
          effectiveSalesTaxMethod
        );
      }
      
      const currentCustomerObj = finalCustomerId ? customers.find(c => c.id === finalCustomerId) : null;
      const currentCustomer = currentCustomerObj ? currentCustomerObj.name : 'Walk-in Customer';
      
      const quotePayload: ReceiptData = {
        invoiceNumber: quotationNumber,
        isQuotation: true,
        quotationNumber: quotationNumber,
        date: new Date(billDate + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }),
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
        taxMethod: effectiveEnableSalesGST ? effectiveSalesTaxMethod : undefined,
        discount: discountAmount,
        netAmount: grandTotal,
        paidAmount: 0
      };

      (window as any).__isEditingActive = false;
      setPrintData(quotePayload);
      setCompletedSaleModal(quotePayload);

      setCart([]);
      setDiscount(0);
      setDiscountType('percentage');
      setCustomerId('');
      setQuotationNotes('');
      setEditingQuotationId(null);
      setEditingQuotationNumber(null);
      setBillDate(getLocalDate());
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

  // Handle Editing an Existing Quotation
  async function handleEditQuotation(qId: number) {
    try {
      const fullQ = await getQuotationById(qId);
      if (!fullQ) return;
      
      if (fullQ.customer_id) {
        setCustomerId(fullQ.customer_id);
      } else {
        setCustomerId('');
      }

      if (fullQ.date) {
        setBillDate(fullQ.date.split(' ')[0]);
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

        const originalPriceBasis = fullQ.items.reduce(
          (sum: number, i: any) => sum + (Number(i.unit_price || 0) * Number(i.quantity || 0)),
          0
        );
        const qNet = Number(fullQ.net_amount || 0);
        const qTax = Number(fullQ.tax_amount || 0);
        const qDisc = Number(fullQ.discount || 0);
        const diffInc = Math.abs(qNet - (originalPriceBasis - qDisc));
        const diffExc = Math.abs(qNet - (originalPriceBasis - qDisc + qTax));
        const isInclusive = qTax > 0 ? (diffInc < diffExc) : (diffInc <= 1.0);
        setLoadedSaleTaxMethod(isInclusive ? 'inclusive' : 'exclusive');
        setLoadedSaleEnableGST(qTax > 0);
      }

      setDiscountType('amount');
      setDiscount(fullQ.discount);
      setQuotationNotes(fullQ.notes || '');
      setEditingQuotationId(fullQ.id);
      setEditingQuotationNumber(fullQ.quotation_number);
      setConvertingQuotationId(null);
      setConvertingQuotationNumber(null);
      setPosMode('quotation');
      setIsQuotationsModalOpen(false);
    } catch (e) {
      console.error("Failed to load quotation for editing:", e);
      alert("Error loading quotation details: " + e);
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

        const originalPriceBasis = fullQ.items.reduce(
          (sum: number, i: any) => sum + (Number(i.unit_price || 0) * Number(i.quantity || 0)),
          0
        );
        const qNet = Number(fullQ.net_amount || 0);
        const qTax = Number(fullQ.tax_amount || 0);
        const qDisc = Number(fullQ.discount || 0);
        const diffInc = Math.abs(qNet - (originalPriceBasis - qDisc));
        const diffExc = Math.abs(qNet - (originalPriceBasis - qDisc + qTax));
        const isInclusive = qTax > 0 ? (diffInc < diffExc) : (diffInc <= 1.0);
        setLoadedSaleTaxMethod(isInclusive ? 'inclusive' : 'exclusive');
        setLoadedSaleEnableGST(qTax > 0);
      }

      setDiscountType('amount');
      setDiscount(fullQ.discount);
      setPaidAmount(0);
      setEditingQuotationId(null);
      setEditingQuotationNumber(null);
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

      const qOriginalBasis = (fullQ.items || []).reduce(
        (sum: number, i: any) => sum + (Number(i.unit_price || 0) * Number(i.quantity || 0)),
        0
      );
      const qNet = Number(fullQ.net_amount || 0);
      const qTax = Number(fullQ.tax_amount || 0);
      const qDisc = Number(fullQ.discount || 0);
      const diffInc = Math.abs(qNet - (qOriginalBasis - qDisc));
      const diffExc = Math.abs(qNet - (qOriginalBasis - qDisc + qTax));
      const isQInclusive = qTax > 0 ? (diffInc < diffExc) : (diffInc <= 1.0);
      const qTaxMethod = qTax > 0 ? (isQInclusive ? 'inclusive' : 'exclusive') : undefined;

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
        taxMethod: qTaxMethod,
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
    if (effectiveEnableSalesGST && effectiveSalesTaxMethod === 'inclusive') {
      const gstPercent = (item.cgst_percentage || 0) + (item.sgst_percentage || 0);
      taxableValue = discountedItemPrice / (1 + (gstPercent / 100));
    }

    taxableValueSum += taxableValue;

    if (effectiveEnableSalesGST) {
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

  const exactGrandTotal = isViewOnly && loadedSaleRecord ? loadedSaleRecord.net_amount : Math.max(0, taxableValueSum + taxSum);
  const grandTotal = isViewOnly && loadedSaleRecord ? loadedSaleRecord.net_amount : Math.round(exactGrandTotal);
  const roundOff = isViewOnly && loadedSaleRecord
    ? Number((loadedSaleRecord.net_amount - (loadedSaleRecord.total_amount + (effectiveSalesTaxMethod === 'inclusive' ? 0 : loadedSaleRecord.tax_amount) - (loadedSaleRecord.discount || 0))).toFixed(2))
    : grandTotal - exactGrandTotal;
  const subtotal = isViewOnly && loadedSaleRecord ? (loadedSaleRecord.total_amount || originalPriceBasis) : originalPriceBasis;
  const tax = isViewOnly && loadedSaleRecord ? (loadedSaleRecord.tax_amount ?? taxSum) : taxSum;
  const discountAmount = isViewOnly && loadedSaleRecord ? (loadedSaleRecord.discount || 0) : displayDiscountAmount;
  const effectivePaidAmount = paidAmount === '' ? (isViewOnly && loadedSaleRecord ? (loadedSaleRecord.paid_amount || 0) : 0) : Number(paidAmount);
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
                  if (editingQuotationId) {
                    alert("Currently editing quotation. Press 'Esc' or click (X) on the edit banner to exit edit mode.");
                    return;
                  }
                  setPosMode('billing');
                }}
                disabled={!!editingQuotationId}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md flex items-center gap-1.5 transition-all ${
                  posMode === 'billing'
                    ? 'bg-canvas text-ink shadow-xs'
                    : 'text-muted hover:text-ink'
                } ${editingQuotationId ? 'opacity-40 cursor-not-allowed' : ''}`}
                title={editingQuotationId ? "Currently editing quotation. Press Esc or (X) to exit." : "Sale Bill"}
              >
                <ShoppingCart className="w-3.5 h-3.5 text-primary" />
                <span>Sale Bill</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  if (activeSaleId) {
                    alert("Currently viewing or editing a bill. Press 'Esc' or click Close to exit.");
                    return;
                  }
                  setPosMode('quotation');
                  setConvertingQuotationId(null);
                  setConvertingQuotationNumber(null);
                }}
                disabled={!!activeSaleId}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md flex items-center gap-1.5 transition-all ${
                  posMode === 'quotation'
                    ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400 shadow-xs border border-amber-500/30'
                    : 'text-muted hover:text-ink'
                } ${activeSaleId ? 'opacity-40 cursor-not-allowed' : ''}`}
                title={activeSaleId ? "Currently viewing or editing a bill. Press Esc or Close to exit." : "Quotation"}
              >
                <FileText className="w-3.5 h-3.5 text-amber-500" />
                <span>Quotation</span>
              </button>
            </div>

            {/* Live Bill/Quote Number and Date */}
            <div className="flex items-center gap-2 text-xs">
              <span className="font-bold text-ink bg-surface-soft px-2.5 py-1 rounded-md border border-hairline">
                {posMode === 'billing' 
                  ? (activeSaleId ? (editingInvoiceNumber ? `Bill: ${editingInvoiceNumber}` : `Bill #${activeSaleId}`) : `Bill: ${nextInvoiceNo || '...'}`)
                  : (editingQuotationNumber ? `Quote: ${editingQuotationNumber}` : `Quote: ${nextQuotationNo || '...'}`)}
              </span>
              <div className="flex items-center gap-1.5 bg-surface-soft px-2 py-0.5 rounded-md border border-hairline" title="Bill Date (Click to change date)">
                <Calendar className="w-3.5 h-3.5 text-muted shrink-0" />
                <input
                  type="date"
                  value={billDate}
                  disabled={isViewOnly}
                  onChange={(e) => setBillDate(e.target.value)}
                  className={`bg-transparent text-xs font-semibold text-ink focus:outline-none ${isViewOnly ? 'cursor-not-allowed opacity-80' : 'cursor-pointer'}`}
                />
                {!isViewOnly && billDate !== getLocalDate() && (
                  <button
                    type="button"
                    onClick={() => setBillDate(getLocalDate())}
                    className="text-[10px] text-primary hover:underline font-bold ml-0.5"
                    title="Reset to today"
                  >
                    Today
                  </button>
                )}
              </div>
            </div>

            {/* Viewing Bill Notice Pill (Read-Only) */}
            {isViewOnly && (
              <div className="flex items-center gap-1.5 text-xs bg-primary/10 text-primary border border-primary/25 px-2.5 py-1 rounded-md font-semibold">
                <Eye className="w-3.5 h-3.5 shrink-0" />
                <span>Viewing {editingInvoiceNumber ? `Bill: ${editingInvoiceNumber}` : `Bill #${activeSaleId}`}</span>
                <span className="text-[10px] bg-primary/20 text-primary px-1.5 py-0.2 rounded font-medium">Read-Only</span>
                <button
                  type="button"
                  onClick={handleCancelEditBill}
                  className="ml-2 px-2 py-0.5 text-xs font-semibold bg-canvas text-primary hover:bg-primary hover:text-on-primary rounded border border-primary/30 flex items-center gap-1 cursor-pointer transition-colors shadow-2xs"
                  title={location.state?.from === 'contacts' ? "Close view and return to Customer Profile (Esc)" : "Close view and return to Day Book (Esc)"}
                >
                  <span>Close</span>
                  <X className="w-3 h-3" />
                </button>
              </div>
            )}

            {/* Editing Bill Notice Pill */}
            {editSaleId && (
              <div className="flex items-center gap-1.5 text-xs bg-primary/10 text-primary border border-primary/25 px-2.5 py-1 rounded-md font-semibold">
                <Edit className="w-3.5 h-3.5 shrink-0" />
                <span>Editing {editingInvoiceNumber ? `Bill: ${editingInvoiceNumber}` : `Bill #${editSaleId}`}</span>
                <button
                  type="button"
                  onClick={handleCancelEditBill}
                  className="ml-2 px-2 py-0.5 text-xs font-semibold bg-canvas text-primary hover:bg-primary hover:text-on-primary rounded border border-primary/30 flex items-center gap-1 cursor-pointer transition-colors shadow-2xs"
                  title={location.state?.from === 'contacts' ? "Cancel editing bill and return to Customer Profile (Esc)" : "Cancel editing bill and return to Day Book (Esc)"}
                >
                  <span>Cancel</span>
                  <X className="w-3 h-3" />
                </button>
              </div>
            )}

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

            {/* Editing Quotation Notice Pill */}
            {editingQuotationNumber && (
              <div className="flex items-center gap-1.5 text-xs bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 px-2.5 py-1 rounded-md font-semibold">
                <Edit className="w-3.5 h-3.5 shrink-0" />
                <span>Editing {editingQuotationNumber}</span>
                <button
                  type="button"
                  onClick={handleCancelEditQuotation}
                  className="ml-2 px-2 py-0.5 text-xs text-amber-700 dark:text-amber-300 hover:text-ink hover:bg-amber-500/20 rounded border border-amber-500/30 flex items-center gap-1 cursor-pointer transition-colors"
                  title="Cancel editing quotation (Esc)"
                >
                  <span>Cancel</span>
                  <X className="w-3 h-3" />
                </button>
              </div>
            )}

          </div>

          {/* Right: Quotations List Modal Button */}
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => {
                if (editSaleId || editingQuotationId || isViewOnly) {
                  alert(isViewOnly ? "You are currently viewing a bill. Press 'Esc' or click Close to exit before opening other screens." : "You are currently in edit mode. Press 'Esc' or click Cancel to exit edit mode before opening other screens.");
                  return;
                }
                refreshQuotations();
                setIsQuotationsModalOpen(true);
              }}
              disabled={!!editSaleId || !!editingQuotationId || isViewOnly}
              className={`px-3.5 py-1.5 text-xs font-semibold bg-surface-soft hover:bg-surface-strong border border-hairline rounded-lg text-ink flex items-center gap-2 transition-colors shadow-xs ${
                editSaleId || editingQuotationId || isViewOnly ? 'opacity-40 cursor-not-allowed' : ''
              }`}
              title={editSaleId || editingQuotationId || isViewOnly ? "Exit view/edit mode first to view quotations" : "View and manage saved quotations"}
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
                <div className="flex items-center gap-2 w-full bg-canvas px-3 py-2 rounded-md border border-hairline focus-within:border-primary transition-colors">
                  <User className="w-4 h-4 text-muted shrink-0" />
                  <input
                    type="text"
                    disabled={isViewOnly}
                    placeholder="Search Customer (or leave Walk-in)"
                    className={`flex-1 bg-transparent text-sm outline-none text-ink font-medium placeholder:text-muted ${isViewOnly ? 'cursor-not-allowed opacity-80' : ''}`}
                    value={customerSearch}
                    onChange={(e) => {
                      if (isViewOnly) return;
                      setCustomerSearch(e.target.value);
                      setIsCustomerDropdownOpen(true);
                      if (e.target.value === '') setCustomerId('');
                    }}
                    onFocus={() => { if (!isViewOnly) setIsCustomerDropdownOpen(true); }}
                  />
                  {customerId !== '' && !isViewOnly && (
                    <button onClick={() => { setCustomerId(''); setCustomerSearch(''); }} className="text-muted hover:text-ink p-0.5">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                  {!isViewOnly && (
                    <button
                      type="button"
                      onClick={() => openQuickCustomerModal(customerSearch.trim())}
                      className="px-2 py-0.5 text-xs font-semibold text-primary hover:bg-primary/10 rounded transition-colors flex items-center gap-1 cursor-pointer shrink-0 border border-primary/20"
                      title="Add new customer"
                    >
                      <Plus className="w-3 h-3" />
                      <span>New</span>
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

                        {/* Direct Customer Creation Option */}
                        <li
                          onClick={() => {
                            setIsCustomerDropdownOpen(false);
                            openQuickCustomerModal(customerSearch.trim());
                          }}
                          className="p-3 bg-primary/5 hover:bg-primary/10 text-primary cursor-pointer text-sm font-semibold flex items-center gap-2 transition-colors border-b border-hairline"
                        >
                          <Plus className="w-4 h-4 shrink-0 text-primary" />
                          <span>
                            {customerSearch.trim()
                              ? `+ Add "${customerSearch.trim()}" as New Customer`
                              : '+ Add New Customer'}
                          </span>
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
                              {c.phone && <span className="text-xs text-muted ml-2">{c.phone}</span>}
                            </div>
                            <div className="flex items-center gap-1.5">
                              {c.balance > 0 && <span className="text-xs text-signature-coral font-medium">Owes: ₹{c.balance.toFixed(0)}</span>}
                              {(c.advance_balance || 0) > 0 ? (
                                <span className="text-xs text-emerald-600 font-semibold">Adv: ₹{(c.advance_balance || 0).toFixed(0)}</span>
                              ) : c.balance < 0 ? (
                                <span className="text-xs text-emerald-600 font-semibold">Adv: ₹{Math.abs(c.balance).toFixed(0)}</span>
                              ) : null}
                            </div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </>
                )}
                {customerId !== '' && (() => {
                  const sel = customers.find(c => c.id === customerId);
                  if (!sel) return null;
                  return (
                    <div className="flex items-center justify-between text-xs pt-2 px-1">
                      <span className="text-muted font-medium">Customer Account:</span>
                      <div className="flex items-center gap-2">
                        {sel.balance > 0 && (
                          <span className="text-signature-coral font-bold">Owes: ₹{sel.balance.toFixed(2)}</span>
                        )}
                        {(sel.advance_balance || 0) > 0 ? (
                          <span className="text-emerald-600 font-bold">Adv: ₹{(sel.advance_balance || 0).toFixed(2)}</span>
                        ) : sel.balance < 0 ? (
                          <span className="text-emerald-600 font-bold">Adv: ₹{Math.abs(sel.balance).toFixed(2)}</span>
                        ) : sel.balance <= 0 ? (
                          <span className="text-muted font-medium">Settled (₹0.00)</span>
                        ) : null}
                      </div>
                    </div>
                  );
                })()}
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
                cart.map((item) => {
                  const cartKey = getItemCartKey(item);
                  const isWarehouse = item.item_source_type === 'warehouse';

                  return (
                    <div key={cartKey} className="bg-canvas border-b border-hairline py-3 px-5 group flex items-center justify-between gap-3 hover:bg-surface-soft/40 transition-colors">
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
                              disabled={isViewOnly}
                              value={item.selling_price === 0 ? '' : item.selling_price}
                              onChange={(e) => updateRate(cartKey, Number(e.target.value) || 0)}
                              className={`w-16 bg-transparent border-b border-hairline hover:border-ink focus:border-primary outline-none text-ink font-semibold text-xs text-right transition-colors ${isViewOnly ? 'cursor-not-allowed opacity-80' : ''}`}
                              title="Selling Rate"
                            />
                            <span className="ml-1 text-muted">/ {item.unit || 'pc'}</span>
                          </div>
                          {effectiveEnableSalesGST && <span className="text-primary text-[10px]">({item.cgst_percentage || 0}% CGST, {item.sgst_percentage || 0}% SGST)</span>}

                          {/* Item Stock Source Selector (Shop or Warehouse) */}
                          {isViewOnly ? (
                            <span className={`px-2 py-0.5 rounded text-[11px] font-medium flex items-center gap-1 border ${
                              isWarehouse 
                                ? 'bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/35' 
                                : 'bg-primary/10 text-primary border-primary/25'
                            }`}>
                              {isWarehouse ? <Building2 className="w-3 h-3 shrink-0" /> : <Store className="w-3 h-3 shrink-0" />}
                              <span>{item.item_warehouse_name || (isWarehouse ? 'Godown' : 'Main Shop')}</span>
                            </span>
                          ) : (
                            <div className="flex items-center gap-1.5">
                              <select
                                value={isWarehouse ? `wh_${item.item_warehouse_id}` : 'shop'}
                                onChange={(e) => handleChangeItemSource(item, e.target.value)}
                                className={`text-[11px] font-semibold px-2 py-0.5 rounded border focus:outline-none cursor-pointer transition-colors shadow-2xs ${
                                  isWarehouse 
                                    ? 'bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/35' 
                                    : 'bg-primary/10 text-primary border-primary/30'
                                }`}
                                title="Change stock location for this product"
                              >
                                <option value="shop">🏪 Main Shop ({item.shop_stock ?? 0} in stock)</option>
                                {warehouses.map(wh => (
                                  <option key={wh.id} value={`wh_${wh.id}`}>
                                    🏢 {wh.name} ({item.warehouse_stocks?.[wh.id] ?? 0} in stock)
                                  </option>
                                ))}
                              </select>

                              {/* Quick button to add another line of this item from Godown */}
                              {warehouses.length > 0 && !isWarehouse && (
                                warehouses.some(wh => (item.warehouse_stocks?.[wh.id] || 0) > 0) && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const availWh = warehouses.find(wh => (item.warehouse_stocks?.[wh.id] || 0) > 0) || warehouses[0];
                                      handleAddFromGodown(item, availWh.id);
                                    }}
                                    className="text-[10px] font-semibold text-blue-700 dark:text-blue-400 bg-blue-500/10 hover:bg-blue-500/20 px-1.5 py-0.5 rounded border border-blue-500/30 flex items-center gap-0.5 transition-colors cursor-pointer"
                                    title="Add another line of this item from Godown"
                                  >
                                    <Building2 className="w-2.5 h-2.5" />
                                    <span>+ Godown</span>
                                  </button>
                                )
                              )}
                            </div>
                          )}

                          {/* Live Available Stock Badge */}
                          <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-surface-soft text-muted border border-hairline flex items-center gap-1">
                            <span>Avail: <strong className="text-ink font-semibold">{item.stock_quantity}</strong> {item.unit || 'pc'}</span>
                          </span>

                          {item.cart_qty >= item.stock_quantity && item.stock_quantity > 0 && (
                            <span className="text-[10px] text-amber-600 dark:text-amber-400 font-semibold bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20">
                              Max stock reached
                            </span>
                          )}
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-3 shrink-0">
                        {isViewOnly ? (
                          <div className="px-2.5 py-1 bg-surface-soft border border-hairline rounded-md text-xs font-bold text-ink">
                            Qty: {item.cart_qty}
                          </div>
                        ) : (
                          <div className="flex items-center bg-surface-soft border border-hairline rounded-md p-0.5">
                            <input
                              type="number"
                              min="1"
                              value={item.cart_qty === 0 ? '' : item.cart_qty}
                              onChange={(e) => setQty(cartKey, Number(e.target.value) || 0)}
                              onBlur={() => { if (item.cart_qty < 1) setQty(cartKey, 1); }}
                              className="w-12 text-center text-sm font-bold text-ink bg-transparent focus:outline-none"
                            />
                          </div>
                        )}
                        <div className="w-[70px] text-right">
                          <span className="font-bold text-ink text-sm tabular-nums">₹{(item.selling_price * item.cart_qty).toFixed(2)}</span>
                        </div>
                        {!isViewOnly && (
                          <button 
                            onClick={() => removeFromCart(cartKey)}
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
                {effectiveEnableSalesGST && effectiveSalesTaxMethod === 'inclusive' ? (
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
                
                <div className="flex justify-between items-center text-sm text-body py-0.5">
                  <span>Discount</span>
                  <div className="flex items-center gap-1.5">
                    <button 
                      type="button"
                      disabled={isViewOnly}
                      onClick={() => setDiscountType(prev => prev === 'amount' ? 'percentage' : 'amount')}
                      className={`text-xs font-semibold bg-canvas border border-hairline text-ink hover:bg-surface-strong px-2 py-0.5 rounded transition-colors select-none ${isViewOnly ? 'cursor-not-allowed opacity-60' : ''}`}
                      title="Toggle discount type"
                    >
                      {discountType === 'amount' ? '₹' : '%'}
                    </button>
                    <input 
                      type="number" 
                      min="0"
                      disabled={isViewOnly}
                      max={discountType === 'percentage' ? 100 : undefined}
                      value={discount === 0 ? '' : discount}
                      onChange={(e) => {
                        if (isViewOnly) return;
                        let val = Number(e.target.value) || 0;
                        if (val < 0) val = 0;
                        if (discountType === 'percentage' && val > 100) val = 100;
                        setDiscount(val);
                      }}
                      placeholder="0"
                      className={`w-16 text-right border-b border-hairline bg-transparent py-0.5 focus:outline-none focus:border-primary font-semibold text-ink transition-colors tabular-nums ${isViewOnly ? 'cursor-not-allowed opacity-80' : ''}`}
                    />
                  </div>
                </div>
                
                {discountAmount > 0 && (
                  <div className="flex justify-between text-sm text-success font-medium">
                    <span>Discount Amount</span>
                    <span className="tabular-nums">-₹{discountAmount.toFixed(2)}</span>
                  </div>
                )}
                
                <div className="flex justify-between text-sm text-body mt-2 pt-2 border-t border-hairline">
                  <span className="font-medium">Taxable Value</span>
                  <span className="font-medium text-ink tabular-nums">₹{(isViewOnly && loadedSaleRecord ? (effectiveSalesTaxMethod === 'inclusive' ? loadedSaleRecord.net_amount - loadedSaleRecord.tax_amount : loadedSaleRecord.total_amount) : taxableValueSum).toFixed(2)}</span>
                </div>

                {effectiveEnableSalesGST && (
                  <div className="mt-2 space-y-1.5">
                    {Object.entries(taxBreakdown.cgst).map(([pct, amt]) => (
                      <div key={`cgst-${pct}`} className="flex justify-between items-center text-xs text-body">
                        <span>CGST ({pct}%)</span>
                        <span className="font-medium text-ink tabular-nums">₹{amt.toFixed(2)}</span>
                      </div>
                    ))}
                    {Object.entries(taxBreakdown.sgst).map(([pct, amt]) => (
                      <div key={`sgst-${pct}`} className="flex justify-between items-center text-xs text-body">
                        <span>SGST ({pct}%)</span>
                        <span className="font-medium text-ink tabular-nums">₹{amt.toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                )}
                
                {roundOff !== 0 && (
                  <div className="flex justify-between items-center text-xs text-body">
                    <span>Round off</span>
                    <span className="font-medium text-ink tabular-nums">{roundOff > 0 ? '+' : ''}{roundOff.toFixed(2)}</span>
                  </div>
                )}
                
                <div className="flex justify-between items-end border-t border-hairline pt-3 mt-4">
                  <span className="text-ink font-semibold">Grand Total</span>
                  <span className="text-2xl font-display font-bold text-ink tracking-tight leading-none tabular-nums">₹{grandTotal.toFixed(2)}</span>
                </div>
                
                {posMode === 'billing' ? (
                  <>
                    <div className="flex justify-between items-center text-sm text-body pt-3 pb-1 border-t border-hairline mt-3">
                      <div className="flex items-center gap-1.5">
                        <span className="font-semibold text-ink">Amount Paid</span>
                        {grandTotal > 0 && !isViewOnly && (
                          <button
                            type="button"
                            onClick={() => setPaidAmount(Number(grandTotal.toFixed(2)))}
                            className="text-[10px] px-1.5 py-0.5 rounded font-semibold bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20 transition-colors cursor-pointer"
                            title="Quick fill full bill amount"
                          >
                            Full: ₹{grandTotal.toFixed(2)}
                          </button>
                        )}
                      </div>
                      <div className="flex items-center">
                        <span className="text-muted font-medium mr-1">₹</span>
                        <input 
                          ref={paidInputRef}
                          type="number" 
                          min="0"
                          disabled={isViewOnly}
                          max={grandTotal}
                          value={paidAmount === '' ? '' : paidAmount}
                          onFocus={(e) => {
                            if (paidAmount === 0) {
                              e.target.select();
                            }
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              handleCheckout();
                            }
                          }}
                          onChange={(e) => {
                            if (isViewOnly) return;
                            const raw = e.target.value;
                            if (raw === '') {
                              setPaidAmount('');
                              return;
                            }
                            let val = Number(raw);
                            if (isNaN(val)) return;
                            if (val > grandTotal) val = Number(grandTotal.toFixed(2));
                            setPaidAmount(val);
                          }}
                          placeholder="0"
                          className={`w-24 text-right border-b-2 border-hairline focus:border-primary bg-transparent py-0.5 focus:outline-none font-bold text-ink transition-colors tabular-nums ${isViewOnly ? 'cursor-not-allowed opacity-80' : ''}`}
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
                              disabled={isViewOnly}
                              onClick={() => { if (!isViewOnly) setPaymentMethod(mode); }}
                              className={`py-1.5 px-1 text-[11px] font-medium rounded border transition-colors text-center ${
                                paymentMethod === mode 
                                  ? 'bg-primary text-on-primary border-primary font-semibold shadow-2xs' 
                                  : isViewOnly 
                                    ? 'bg-canvas text-muted/50 border-hairline/50 cursor-not-allowed' 
                                    : 'bg-canvas text-ink border-hairline hover:bg-surface-soft'
                              }`}
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
                                  className="w-full px-2 py-1 bg-canvas border border-hairline rounded text-xs text-ink focus:outline-none focus:border-primary"
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
                      <div className="space-y-1 pt-1">
                        <div className="flex justify-between items-center text-xs text-signature-coral font-semibold">
                          <span>Pending Balance (Due on Bill)</span>
                          <span className="tabular-nums">₹{pendingBalance.toFixed(2)}</span>
                        </div>
                        {customerId === '' && (
                          <div className="text-[11px] text-signature-coral font-medium text-right">
                            *Select a customer to record credit
                          </div>
                        )}
                      </div>
                    )}

                    {/* Dispatch & Transport Details Section */}
                    <div className="pt-2.5 border-t border-hairline/70 mt-2 space-y-1.5">
                      {grandTotal >= 100000 ? (
                        <div className={`p-2.5 rounded-lg border flex flex-col gap-1.5 transition-all ${
                          hasDispatchDetails 
                            ? 'bg-emerald-500/10 border-emerald-500/30 text-ink' 
                            : 'bg-amber-500/15 border-amber-500/50 text-amber-950 dark:text-amber-100 shadow-2xs'
                        }`}>
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1.5 text-xs font-bold">
                              <Truck className={`w-3.5 h-3.5 ${hasDispatchDetails ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`} />
                              <span>Dispatch & e-Way Bill</span>
                            </div>
                            {hasDispatchDetails ? (
                              <span className="text-[10px] px-1.5 py-0.5 rounded-sm bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 font-bold border border-emerald-500/40">
                                Required: ✓ Added
                              </span>
                            ) : (
                              <span className="text-[10px] px-1.5 py-0.5 rounded-sm bg-amber-600 text-white font-bold animate-pulse">
                                Required (≥ ₹1L)
                              </span>
                            )}
                          </div>

                          {hasDispatchDetails && (
                            <div className="text-[11px] text-muted space-y-0.5 leading-tight py-0.5 border-y border-hairline/40">
                              {dispatchDetails.ewayBillNo && <div><span className="font-medium text-ink">e-Way:</span> {dispatchDetails.ewayBillNo}</div>}
                              {dispatchDetails.motorVehicleNo && <div><span className="font-medium text-ink">Vehicle:</span> {dispatchDetails.motorVehicleNo}</div>}
                              {dispatchDetails.destination && <div><span className="font-medium text-ink">Dest:</span> {dispatchDetails.destination}</div>}
                            </div>
                          )}

                          <button
                            type="button"
                            onClick={() => setShowDispatchModal(true)}
                            className={`w-full py-1.5 px-2 text-xs font-semibold rounded-md transition-all text-center flex items-center justify-center gap-1.5 ${
                              hasDispatchDetails
                                ? 'bg-canvas text-ink border border-hairline hover:bg-surface-soft'
                                : 'bg-amber-600 hover:bg-amber-700 text-white shadow-xs active:scale-[0.99]'
                            }`}
                          >
                            <Truck className="w-3.5 h-3.5" />
                            <span>{hasDispatchDetails ? 'Edit Dispatch Details' : '+ Enter Required Dispatch Details'}</span>
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center justify-between text-xs py-0.5">
                          <div className="flex items-center gap-1.5 text-muted">
                            <Truck className="w-3.5 h-3.5" />
                            <span>Dispatch / Transport</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => setShowDispatchModal(true)}
                            className="text-[11px] font-medium text-primary hover:underline hover:text-primary-active py-0.5 px-1.5 rounded hover:bg-primary/5 transition-colors"
                          >
                            {hasDispatchDetails ? '✓ Edit Details' : '+ Add Transport Details'}
                          </button>
                        </div>
                      )}
                    </div>
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
              {isViewOnly ? (
                <div className="flex flex-col gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      if (activeSaleId) {
                        getSaleById(activeSaleId).then(s => {
                          if (s) {
                            const whObj = s.source_type === 'warehouse' ? warehouses.find(w => w.id === s.source_warehouse_id) : null;
                            const customerObj = s.customer_id ? customers.find(c => c.id === s.customer_id) : null;
                            const receiptPayload: ReceiptData = {
                              invoiceNumber: s.invoice_number || `Bill #${s.id}`,
                              isQuotation: false,
                              date: s.date ? new Date(s.date.split(' ')[0] + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '',
                              customerName: customerObj ? customerObj.name : (s.customer_name || 'Walk-in Customer'),
                              customerDetails: customerObj ? {
                                name: customerObj.name,
                                phone: customerObj.phone || undefined,
                                email: customerObj.email || undefined,
                                address: customerObj.address || undefined,
                                gstin: customerObj.gstin ? customerObj.gstin.toUpperCase() : undefined
                              } : undefined,
                              items: s.items.map((i: any) => ({
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
                                stock_quantity: i.stock_quantity || 0,
                                purchase_price: 0,
                                mrp: 0,
                                min_stock: 0,
                                parent_id: null,
                                is_group: false,
                                barcode: '',
                                cart_key: `${i.product_id}_shop_0`
                              })),
                              subtotal: s.total_amount ?? subtotal,
                              taxAmount: s.tax_amount ?? tax,
                              taxBreakdown: s.tax_amount > 0 ? taxBreakdown : { cgst: {}, sgst: {} },
                              taxMethod: s.tax_amount > 0 ? effectiveSalesTaxMethod : undefined,
                              discount: s.discount ?? discountAmount,
                              netAmount: s.net_amount ?? grandTotal,
                              paidAmount: s.paid_amount ?? effectivePaidAmount,
                              paymentMethod: s.payment_method || 'Cash',
                              sourceLocationName: s.source_type === 'warehouse' ? (whObj ? whObj.name : 'Warehouse') : 'Main Shop',
                              dispatchDetails: s.dispatchDetails || (s.dispatch_details ? (typeof s.dispatch_details === 'string' ? JSON.parse(s.dispatch_details) : s.dispatch_details) : undefined)
                            };
                            setPrintData(receiptPayload);
                            setTimeout(() => window.print(), 100);
                          }
                        });
                      }
                    }}
                    className="w-full font-semibold py-2.5 rounded-lg transition-colors text-xs bg-emerald-600 hover:bg-emerald-700 text-white flex items-center justify-center gap-2 shadow-sm cursor-pointer"
                  >
                    <Printer className="w-4 h-4" />
                    <span>Print Invoice</span>
                  </button>
                  <button 
                    type="button"
                    onClick={handleCancelEditBill}
                    className="w-full font-semibold py-2.5 rounded-lg transition-colors text-xs bg-surface-strong hover:bg-surface-soft text-ink flex items-center justify-center gap-2 border border-hairline shadow-sm cursor-pointer"
                    title={location.state?.from === 'contacts' ? "Close bill view and return to Customer Profile (Esc)" : "Close bill view and return to Day Book (Esc)"}
                  >
                    <X className="w-4 h-4" />
                    <span>
                      {location.state?.from === 'contacts' ? 'Close View & Exit to Customer Profile (Esc)' : 'Close View & Exit to Day Book (Esc)'}
                    </span>
                  </button>
                </div>
              ) : (
                <>
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
                      {isProcessing 
                        ? (editingQuotationId ? 'Updating Quotation...' : 'Saving Quotation...') 
                        : (editingQuotationId ? 'Update Quotation (Ctrl+S)' : 'Save & Print Quotation (Ctrl+S)')}
                    </button>
                  )}

                  {/* Dedicated Cancel Edit Buttons */}
                  {editSaleId && (
                    <button 
                      type="button"
                      onClick={handleCancelEditBill}
                      className="w-full font-semibold py-2 rounded-lg transition-colors text-xs border border-danger/30 text-danger hover:bg-danger/10 flex items-center justify-center gap-1.5 shadow-2xs cursor-pointer"
                      title={location.state?.from === 'contacts' ? "Cancel bill editing and return to Customer Profile (Esc)" : "Cancel bill editing and return to Day Book (Esc)"}
                    >
                      <X className="w-3.5 h-3.5" />
                      <span>
                        {location.state?.from === 'contacts' ? 'Cancel Edit & Exit to Customer Profile (Esc)' : 'Cancel Edit & Exit to Day Book (Esc)'}
                      </span>
                    </button>
                  )}

                  {editingQuotationId && (
                    <button 
                      type="button"
                      onClick={handleCancelEditQuotation}
                      className="w-full font-semibold py-2 rounded-lg transition-colors text-xs border border-danger/30 text-danger hover:bg-danger/10 flex items-center justify-center gap-1.5 shadow-2xs cursor-pointer"
                      title="Cancel quotation editing and return to new bill (Esc)"
                    >
                      <X className="w-3.5 h-3.5" />
                      <span>Cancel Quotation Edit (Esc)</span>
                    </button>
                  )}

                  <button 
                    type="button"
                    onClick={() => {
                      setCart([]);
                      setConvertingQuotationId(null);
                      setConvertingQuotationNumber(null);
                      setEditingQuotationId(null);
                      setEditingQuotationNumber(null);
                      setBillDate(getLocalDate());
                      setDispatchDetails({
                        ewayBillNo: '',
                        dispatchDocNo: '',
                        dispatchedThrough: '',
                        destination: '',
                        carrierName: '',
                        billOfLadingNo: '',
                        motorVehicleNo: '',
                        termsOfDelivery: ''
                      });
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
                </>
              )}
            </div>
          </div>

          {/* Column 3: Products Catalog & Search */}
          <div className="w-[350px] flex flex-col p-5 overflow-hidden bg-surface-soft border-l border-hairline shrink-0">
            <header className="mb-3 shrink-0">
              <h2 className="text-lg font-display font-medium text-ink tracking-tight">Products</h2>
              <p className="text-xs text-muted mt-0.5">
                {isViewOnly ? (
                  <span className="text-primary font-semibold">Bill is in Read-Only View mode</span>
                ) : (
                  posMode === 'quotation' 
                    ? 'Add products to quotation voucher' 
                    : 'Click product to add (Defaults to Main Shop)'
                )}
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
                    const totalInCart = cart.filter(c => c.id === p.id).reduce((sum, c) => sum + c.cart_qty, 0);
                    const isSelected = index === selectedIndex;
                    const shopStock = p.shop_stock ?? p.stock_quantity ?? 0;
                    const godownStocks = warehouses.map(wh => ({
                      id: wh.id,
                      name: wh.name,
                      quantity: p.warehouse_stocks?.[wh.id] || 0
                    })).filter(g => g.quantity > 0);
                    const totalStock = shopStock + godownStocks.reduce((sum, g) => sum + g.quantity, 0);
                    const isOutOfStock = totalStock <= 0;
                    
                    return (
                      <div 
                        key={p.id} 
                        onClick={() => { if (!isViewOnly) addToCart(p); }}
                        onMouseEnter={() => setSelectedIndex(index)}
                        className={`px-3.5 py-3 ${isViewOnly ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'} transition-colors flex items-center justify-between gap-3 ${
                          isSelected && !isViewOnly ? 'bg-primary/5' : 'hover:bg-surface-soft'
                        }`}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-ink text-sm truncate">{p.name}</span>
                            {p.model && (
                              <span className="text-xs text-muted truncate">({p.model})</span>
                            )}
                          </div>
                          <div className="text-xs text-muted mt-1 flex items-center gap-2 flex-wrap">
                            {isOutOfStock ? (
                              <span className="text-danger font-medium text-xs">Out of stock (0)</span>
                            ) : (
                              <>
                                <span className={`px-1.5 py-0.2 rounded font-medium text-[11px] ${
                                  shopStock > 0 ? 'bg-surface-soft text-ink' : 'bg-red-50 text-red-600'
                                }`}>
                                  🏪 Shop: <strong>{shopStock}</strong>
                                </span>
                                {godownStocks.map(g => (
                                  <span key={g.id} className="text-amber-700 dark:text-amber-400 font-medium text-[11px] bg-amber-500/10 px-1.5 py-0.2 rounded border border-amber-500/20">
                                    🏢 {g.name}: <strong>{g.quantity}</strong>
                                  </span>
                                ))}
                              </>
                            )}
                            {totalInCart > 0 && (
                              <>
                                <span className="text-muted/40">•</span>
                                <span className="text-[11px] font-semibold text-primary">
                                  {totalInCart} in cart
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                        
                        <div className="text-right shrink-0">
                          <div className="font-bold text-ink text-sm tabular-nums">₹{p.selling_price.toFixed(2)}</div>
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
                          <td className="py-3 px-4 font-bold text-ink">
                            {q.quotation_number}
                          </td>
                          <td className="py-3 px-4 text-muted">
                            {new Date(q.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                          </td>
                          <td className="py-3 px-4 font-medium text-ink">
                            {q.customer_name || 'Walk-in Customer'}
                          </td>
                          <td className="py-3 px-4 text-right font-semibold text-ink tabular-nums">
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
                                <>
                                  <button
                                    type="button"
                                    onClick={() => handleEditQuotation(q.id)}
                                    className="px-2.5 py-1 text-xs font-semibold bg-amber-500/15 text-amber-600 dark:text-amber-400 hover:bg-amber-500/25 border border-amber-500/30 rounded flex items-center gap-1 transition-colors"
                                    title="Edit quotation products, rates, or quantities"
                                  >
                                    <Edit className="w-3.5 h-3.5" />
                                    <span>Edit</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleConvertQuotation(q.id)}
                                    className="px-2.5 py-1 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white rounded flex items-center gap-1 shadow-xs transition-colors"
                                    title="Convert to active Sale Bill in POS cart"
                                  >
                                    <ArrowRight className="w-3.5 h-3.5" />
                                    <span>Convert to Bill</span>
                                  </button>
                                </>
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
                      if (location.state?.from === 'contacts' && location.state?.partyId) {
                        navigate('/contacts', {
                          state: {
                            activeTab: location.state.partyType || 'customers',
                            selectedPartyId: location.state.partyId
                          }
                        });
                      } else {
                        navigate('/daybook', { state: { activeTab: 'sales' } });
                      }
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
                            <div className="text-[11px] text-muted mt-1">
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
                            <div className="text-[11px] text-muted">
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
                      if (location.state?.from === 'contacts' && location.state?.partyId) {
                        navigate('/contacts', {
                          state: {
                            activeTab: location.state.partyType || 'customers',
                            selectedPartyId: location.state.partyId
                          }
                        });
                      } else {
                        navigate('/daybook', { state: { activeTab: 'sales' } });
                      }
                    } else {
                      setCompletedSaleModal(null);
                      setTimeout(() => searchInputRef.current?.focus(), 50);
                    }
                  }}
                  className="px-4 py-2 text-xs font-medium rounded-lg border border-hairline bg-canvas hover:bg-surface-strong text-ink transition-colors flex items-center gap-1.5 shadow-2xs cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5 text-muted" />
                  <span>
                    {editSaleId
                      ? location.state?.from === 'contacts'
                        ? 'Done / Back to Profile'
                        : 'Done / Back to DayBook'
                      : 'Next Sale'}
                  </span>
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

      {/* Dispatch & Transport Details Modal (GST & e-Way Bill) */}
      {showDispatchModal && (
        <div 
          className="fixed inset-0 bg-ink/40 backdrop-blur-xs flex items-center justify-center z-50 p-4"
          onKeyDown={e => {
            if (e.key === 'Escape') {
              e.stopPropagation();
              setShowDispatchModal(false);
            }
          }}
        >
          <div className="bg-canvas rounded-xl shadow-2xl w-full max-w-lg overflow-hidden border border-hairline animate-in fade-in zoom-in duration-150 flex flex-col max-h-[90vh]">
            {/* Modal Header */}
            <div className="px-5 py-3.5 border-b border-hairline flex justify-between items-center bg-surface-soft shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                  <Truck className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-ink">Dispatch & Transport Details</h2>
                  <p className="text-[11px] text-muted">e-Way Bill & movement info printed on Tax Invoice</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowDispatchModal(false)}
                className="text-muted hover:text-ink transition-colors p-1.5 rounded-md hover:bg-surface-strong cursor-pointer"
                title="Close (Esc)"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body */}
            <form 
              onSubmit={e => {
                e.preventDefault();
                setShowDispatchModal(false);
              }}
              className="p-5 overflow-y-auto space-y-4"
            >
              {grandTotal >= 100000 && (
                <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg text-xs text-amber-900 dark:text-amber-200 flex items-start gap-2">
                  <span className="text-base shrink-0 leading-none mt-0.5">⚠️</span>
                  <div>
                    <span className="font-semibold block">Required for Sales ≥ ₹1,00,000</span>
                    Total sale amount is <span className="font-bold tabular-nums">₹{grandTotal.toFixed(2)}</span>. Under GST movement rules, e-Way Bill and vehicle dispatch details are mandatory on the Tax Invoice.
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3 text-xs">
                {/* e-Way Bill No */}
                <div className="col-span-2 sm:col-span-1">
                  <label className="text-[11px] font-semibold text-ink block mb-1">
                    e-Way Bill No. {grandTotal >= 100000 && <span className="text-amber-600 font-bold">*</span>}
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. 562030054740"
                    value={dispatchDetails.ewayBillNo || ''}
                    onChange={e => setDispatchDetails(prev => ({ ...prev, ewayBillNo: e.target.value }))}
                    className="w-full px-3 py-2 bg-canvas border border-hairline rounded-lg text-ink placeholder:text-muted focus:outline-none focus:border-primary font-mono text-xs shadow-2xs"
                    autoFocus
                  />
                </div>

                {/* Motor Vehicle No */}
                <div className="col-span-2 sm:col-span-1">
                  <label className="text-[11px] font-semibold text-ink block mb-1">
                    Motor Vehicle No. {grandTotal >= 100000 && <span className="text-amber-600 font-bold">*</span>}
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. TN28BB1685"
                    value={dispatchDetails.motorVehicleNo || ''}
                    onChange={e => setDispatchDetails(prev => ({ ...prev, motorVehicleNo: e.target.value.toUpperCase() }))}
                    className="w-full px-3 py-2 bg-canvas border border-hairline rounded-lg text-ink placeholder:text-muted focus:outline-none focus:border-primary font-mono uppercase text-xs shadow-2xs"
                  />
                </div>

                {/* Dispatch Doc No */}
                <div>
                  <label className="text-[11px] font-semibold text-ink block mb-1">
                    Dispatch Doc No. / Delivery Note
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. DN-1428086"
                    value={dispatchDetails.dispatchDocNo || ''}
                    onChange={e => setDispatchDetails(prev => ({ ...prev, dispatchDocNo: e.target.value }))}
                    className="w-full px-3 py-2 bg-canvas border border-hairline rounded-lg text-ink placeholder:text-muted focus:outline-none focus:border-primary text-xs shadow-2xs"
                  />
                </div>

                {/* Dispatched Through */}
                <div>
                  <label className="text-[11px] font-semibold text-ink block mb-1">
                    Dispatched Through
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Road / VRL / Tempo"
                    value={dispatchDetails.dispatchedThrough || ''}
                    onChange={e => setDispatchDetails(prev => ({ ...prev, dispatchedThrough: e.target.value }))}
                    className="w-full px-3 py-2 bg-canvas border border-hairline rounded-lg text-ink placeholder:text-muted focus:outline-none focus:border-primary text-xs shadow-2xs"
                  />
                </div>

                {/* Destination */}
                <div>
                  <label className="text-[11px] font-semibold text-ink block mb-1">
                    Destination
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Coimbatore, Salem, City"
                    value={dispatchDetails.destination || ''}
                    onChange={e => setDispatchDetails(prev => ({ ...prev, destination: e.target.value }))}
                    className="w-full px-3 py-2 bg-canvas border border-hairline rounded-lg text-ink placeholder:text-muted focus:outline-none focus:border-primary text-xs shadow-2xs"
                  />
                </div>

                {/* Carrier Name / Agent */}
                <div>
                  <label className="text-[11px] font-semibold text-ink block mb-1">
                    Carrier Name / Agent
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Transporter Name"
                    value={dispatchDetails.carrierName || ''}
                    onChange={e => setDispatchDetails(prev => ({ ...prev, carrierName: e.target.value }))}
                    className="w-full px-3 py-2 bg-canvas border border-hairline rounded-lg text-ink placeholder:text-muted focus:outline-none focus:border-primary text-xs shadow-2xs"
                  />
                </div>

                {/* Bill of Lading / LR-RR No */}
                <div>
                  <label className="text-[11px] font-semibold text-ink block mb-1">
                    Bill of Lading / LR-RR No.
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. LR-40912"
                    value={dispatchDetails.billOfLadingNo || ''}
                    onChange={e => setDispatchDetails(prev => ({ ...prev, billOfLadingNo: e.target.value }))}
                    className="w-full px-3 py-2 bg-canvas border border-hairline rounded-lg text-ink placeholder:text-muted focus:outline-none focus:border-primary text-xs shadow-2xs"
                  />
                </div>

                {/* Terms of Delivery */}
                <div>
                  <label className="text-[11px] font-semibold text-ink block mb-1">
                    Terms of Delivery
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Door Delivery / Paid"
                    value={dispatchDetails.termsOfDelivery || ''}
                    onChange={e => setDispatchDetails(prev => ({ ...prev, termsOfDelivery: e.target.value }))}
                    className="w-full px-3 py-2 bg-canvas border border-hairline rounded-lg text-ink placeholder:text-muted focus:outline-none focus:border-primary text-xs shadow-2xs"
                  />
                </div>
              </div>

              {/* Modal Footer Inside Form for Enter Key Handling */}
              <div className="pt-3 border-t border-hairline flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => {
                    setDispatchDetails({
                      ewayBillNo: '',
                      dispatchDocNo: '',
                      dispatchedThrough: '',
                      destination: '',
                      carrierName: '',
                      billOfLadingNo: '',
                      motorVehicleNo: '',
                      termsOfDelivery: ''
                    });
                  }}
                  className="px-3 py-1.5 text-xs text-muted hover:text-signature-coral transition-colors font-medium cursor-pointer"
                >
                  Clear Details
                </button>

                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-semibold rounded-lg bg-primary hover:bg-primary-active text-on-primary transition-all shadow-sm cursor-pointer flex items-center gap-1.5"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>Save & Apply (Enter)</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Quick Add Customer Modal */}
      {isQuickCustomerModalOpen && (
        <div 
          className="fixed inset-0 bg-ink/40 backdrop-blur-xs flex items-center justify-center z-50 p-4"
          onKeyDown={e => {
            if (e.key === 'Escape') {
              e.stopPropagation();
              closeQuickCustomerModal();
            }
          }}
        >
          <div className="bg-canvas rounded-xl shadow-2xl w-full max-w-md overflow-hidden border border-hairline animate-in fade-in zoom-in duration-150">
            <div className="px-5 py-3.5 border-b border-hairline flex justify-between items-center bg-surface-soft">
              <h2 className="text-sm font-bold text-ink flex items-center gap-2">
                <UserPlus className="w-4 h-4 text-primary" />
                Add New Customer
              </h2>
              <button
                type="button"
                onClick={closeQuickCustomerModal}
                disabled={isSavingQuickCustomer}
                className="text-muted hover:text-ink transition-colors p-1 rounded-md"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveQuickCustomer} className="p-5 space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-muted uppercase tracking-wider mb-1">
                  Customer / Business Name *
                </label>
                <input
                  required
                  autoFocus
                  type="text"
                  value={quickCustomerName}
                  onChange={e => setQuickCustomerName(e.target.value)}
                  className="w-full px-3 py-2 bg-canvas border border-hairline rounded-lg text-sm focus:outline-none focus:border-primary transition-colors text-ink placeholder-muted font-medium"
                  placeholder="e.g. Suresh Traders or Rajesh Kumar"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-muted uppercase tracking-wider mb-1">
                  Phone Number
                </label>
                <input
                  type="text"
                  value={quickCustomerPhone}
                  onChange={e => setQuickCustomerPhone(e.target.value)}
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
                  value={quickCustomerGstin}
                  onChange={e => setQuickCustomerGstin(e.target.value.toUpperCase())}
                  className="w-full px-3 py-2 bg-canvas border border-hairline rounded-lg text-sm uppercase focus:outline-none focus:border-primary transition-colors text-ink placeholder-muted"
                  placeholder="27ABCDE1234F1Z5"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-muted uppercase tracking-wider mb-1">
                  Address / City
                </label>
                <textarea
                  rows={2}
                  value={quickCustomerAddress}
                  onChange={e => setQuickCustomerAddress(e.target.value)}
                  className="w-full px-3 py-2 bg-canvas border border-hairline rounded-lg text-sm focus:outline-none focus:border-primary transition-colors text-ink placeholder-muted resize-none"
                  placeholder="City, Area or complete address"
                />
              </div>

              <div className="pt-3 border-t border-hairline flex justify-end gap-2.5">
                <button
                  type="button"
                  onClick={closeQuickCustomerModal}
                  disabled={isSavingQuickCustomer}
                  className="px-4 py-2 text-xs font-medium text-ink hover:bg-surface-soft rounded-lg transition-colors border border-hairline"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingQuickCustomer || !quickCustomerName.trim()}
                  className="px-5 py-2 text-xs font-semibold bg-primary hover:bg-primary-active text-on-primary rounded-lg shadow-sm transition-colors disabled:opacity-50 flex items-center gap-1.5"
                >
                  {isSavingQuickCustomer && <span className="inline-block w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin mr-1" />}
                  {isSavingQuickCustomer ? 'Saving...' : 'Save & Select'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
