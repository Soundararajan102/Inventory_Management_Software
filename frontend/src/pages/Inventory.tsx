import React, { useState, useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { 
  Search, Plus, X, Edit2, ChevronDown, ChevronRight, Trash2, 
  ArrowLeftRight, Warehouse as WarehouseIcon, MapPin, Phone, ArrowLeft, ArrowUpRight,
  History, ShieldAlert
} from 'lucide-react';
import { 
  getProducts, addProduct, updateProduct, deleteProduct, getItemGroups, getBrands, 
  addGroup, addBrand, updateGroup, updateBrand, deleteGroup, deleteBrand,
  getWarehouses, addWarehouse, updateWarehouse, deleteWarehouse, getWarehouseStock, moveStock,
  addStockDirectlyToWarehouse, getStockMovements
} from '../lib/db';
import type { Product, ItemGroup, Brand, Warehouse, WarehouseItem, StockMovement } from '../lib/db';
import { confirm } from '@tauri-apps/plugin-dialog';
import { handleFormKeyDown } from '../lib/keyboard';

export default function Inventory() {
  const location = useLocation();
  const [filterLowStock, setFilterLowStock] = useState<boolean>((location.state as any)?.filterLowStock || false);
  const [search, setSearch] = useState('');
  const [products, setProducts] = useState<Product[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editProductId, setEditProductId] = useState<number | null>(null);
  const productFormRef = useRef<HTMLFormElement | null>(null);
  const [viewMode, setViewMode] = useState<'items' | 'groups' | 'brands' | 'warehouses'>('items');
  const [warehouseViewMode, setWarehouseViewMode] = useState<'items' | 'groups' | 'brands'>('items');
  const [expandedMasterGroups, setExpandedMasterGroups] = useState<Record<string, boolean>>({});
  const [expandedWhGroups, setExpandedWhGroups] = useState<Record<string, boolean>>({});
  const [addMasterModal, setAddMasterModal] = useState<'group' | 'brand' | null>(null);

  // Rename master modal (Group / Brand)
  const [editMasterModal, setEditMasterModal] = useState<{ type: 'group' | 'brand'; id: number; name: string } | null>(null);
  const [editMasterName, setEditMasterName] = useState('');

  // Stock Movement History modal
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [stockMovements, setStockMovements] = useState<StockMovement[]>([]);

  useEffect(() => {
    if (location.state && (location.state as any).filterLowStock) {
      setFilterLowStock(true);
      setViewMode('items');
      setSelectedWarehouse(null);
    }
  }, [location.state]);

  // Warehouses / Godowns state
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [selectedWarehouse, setSelectedWarehouse] = useState<Warehouse | null>(null);
  const [warehouseStock, setWarehouseStock] = useState<WarehouseItem[]>([]);
  const [loadingWhStock, setLoadingWhStock] = useState(false);

  // Warehouse CRUD modal (Create / Edit)
  const [isWarehouseModalOpen, setIsWarehouseModalOpen] = useState(false);
  const [editWarehouseId, setEditWarehouseId] = useState<number | null>(null);
  const [whName, setWhName] = useState('');
  const [whLocation, setWhLocation] = useState('');
  const [whPhone, setWhPhone] = useState('');

  // Add stock directly to warehouse modal (Independent stock addition)
  const [isWhAddStockOpen, setIsWhAddStockOpen] = useState(false);
  const [whAddProductId, setWhAddProductId] = useState<number | ''>('');
  const [whAddQty, setWhAddQty] = useState<string>('1');
  const [whAddNotes, setWhAddNotes] = useState<string>('');
  const [isAddingStock, setIsAddingStock] = useState(false);

  // Transfer stock modal (between godown and shop)
  const [isWhTransferOpen, setIsWhTransferOpen] = useState(false);
  const [transferDirection, setTransferDirection] = useState<'to_shop' | 'from_shop'>('to_shop');
  const [transferWarehouseId, setTransferWarehouseId] = useState<number | ''>('');
  const [transferProductId, setTransferProductId] = useState<number | ''>('');
  const [transferQty, setTransferQty] = useState<string>('1');
  const [transferNotes, setTransferNotes] = useState<string>('');
  const [isTransferring, setIsTransferring] = useState(false);
  const [transferWhStock, setTransferWhStock] = useState<WarehouseItem[]>([]);

  // Target warehouse for initial stock of newly created products
  const [targetWarehouseId, setTargetWarehouseId] = useState<number | null>(null);

  const [newGroupName, setNewGroupName] = useState('');
  const [newBrandName, setNewBrandName] = useState('');

  const [itemGroups, setItemGroups] = useState<ItemGroup[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);

  // Product Form state
  const [name, setName] = useState('');
  const [groupId, setGroupId] = useState<number | null>(null);
  const [brandId, setBrandId] = useState<number | null>(null);
  const [hsn, setHsn] = useState('');
  const [unit, setUnit] = useState('Piece');
  const [gstPercentage, setGstPercentage] = useState('18');
  const [cgstPercentage, setCgstPercentage] = useState('9');
  const [sgstPercentage, setSgstPercentage] = useState('9');
  
  const [model, setModel] = useState('');
  const [purchasePrice, setPurchasePrice] = useState('');
  const [sellingPrice, setSellingPrice] = useState('');
  const [mrp, setMrp] = useState('');
  const [minStock, setMinStock] = useState('0');
  const [stock, setStock] = useState('');

  const [unitOptions, setUnitOptions] = useState<string[]>(['Piece', 'Box', 'Meter', 'Roll']);

  useEffect(() => {
    const handlePrefChange = () => {
      const savedUnits = localStorage.getItem('customUnits');
      if (savedUnits) {
        setUnitOptions(JSON.parse(savedUnits));
      }
    };
    handlePrefChange();
    window.addEventListener('preferencesUpdated', handlePrefChange);
    return () => window.removeEventListener('preferencesUpdated', handlePrefChange);
  }, []);

  useEffect(() => {
    loadProducts();
    loadWarehouses();
  }, []);

  useEffect(() => {
    if (selectedWarehouse) {
      loadWarehouseStock(selectedWarehouse.id);
    }
  }, [selectedWarehouse?.id]);

  // Global Ctrl + S shortcut handler
  const handleSaveShortcutRef = useRef<(() => void) | undefined>(undefined);
  handleSaveShortcutRef.current = () => {
    if (isModalOpen && productFormRef.current) {
      productFormRef.current.requestSubmit();
    } else if (!isModalOpen && !addMasterModal && !isWarehouseModalOpen && !isWhAddStockOpen && !isWhTransferOpen && !isHistoryOpen && !editMasterModal) {
      resetForm();
      setIsModalOpen(true);
      setViewMode('items');
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        e.stopPropagation();
        handleSaveShortcutRef.current?.();
        return;
      }

      if (e.key === 'Escape') {
        setIsModalOpen(false);
        setAddMasterModal(null);
        setIsWarehouseModalOpen(false);
        setIsWhAddStockOpen(false);
        setIsWhTransferOpen(false);
      }
    };
    
    const handleOpenAdd = () => {
      resetForm();
      setIsModalOpen(true);
      setViewMode('items');
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('openAddProduct', handleOpenAdd);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('openAddProduct', handleOpenAdd);
    };
  }, []);

  async function loadProducts() {
    try {
      const data = await getProducts();
      setProducts(data);
      const groups = await getItemGroups();
      setItemGroups(groups);
      const b = await getBrands();
      setBrands(b);
    } catch (error) {
      console.error("Failed to load products from database", error);
    }
  }

  async function loadWarehouses() {
    try {
      const data = await getWarehouses();
      setWarehouses(data);
      if (selectedWarehouse) {
        const refreshed = data.find(w => w.id === selectedWarehouse.id);
        if (refreshed) setSelectedWarehouse(refreshed);
      }
    } catch (error) {
      console.error("Failed to load warehouses", error);
    }
  }

  async function loadWarehouseStock(warehouseId: number) {
    setLoadingWhStock(true);
    try {
      const data = await getWarehouseStock(warehouseId);
      setWarehouseStock(data);
    } catch (error) {
      console.error("Failed to load warehouse stock", error);
    } finally {
      setLoadingWhStock(false);
    }
  }

  function openAddWarehouseModal() {
    setEditWarehouseId(null);
    setWhName('');
    setWhLocation('');
    setWhPhone('');
    setIsWarehouseModalOpen(true);
  }

  function openEditWarehouseModal(wh: Warehouse) {
    setEditWarehouseId(wh.id);
    setWhName(wh.name);
    setWhLocation(wh.location || '');
    setWhPhone(wh.phone || '');
    setIsWarehouseModalOpen(true);
  }

  async function handleSaveWarehouse(e: React.FormEvent) {
    e.preventDefault();
    if (!whName.trim()) {
      alert("Warehouse name is required.");
      return;
    }
    try {
      if (editWarehouseId) {
        await updateWarehouse(editWarehouseId, whName, whLocation, whPhone);
        if (selectedWarehouse?.id === editWarehouseId) {
          setSelectedWarehouse(prev => prev ? { ...prev, name: whName.trim(), location: whLocation.trim(), phone: whPhone.trim() } : null);
        }
      } else {
        const newId = await addWarehouse(whName, whLocation, whPhone);
        const whList = await getWarehouses();
        setWarehouses(whList);
        const created: Warehouse = whList.find(w => w.id === newId) || { 
          id: newId, 
          name: whName.trim(), 
          location: whLocation.trim(), 
          phone: whPhone.trim(), 
          notes: '',
          created_at: '',
          total_items: 0,
          total_quantity: 0
        };
        setSelectedWarehouse(created);
        await loadWarehouseStock(newId);
      }
      setIsWarehouseModalOpen(false);
      loadWarehouses();
    } catch (err: any) {
      alert("Error saving warehouse: " + (err.message || err));
    }
  }

  async function handleDeleteWarehouse(wh: Warehouse) {
    const isConfirmed = await confirm(`Are you sure you want to delete warehouse "${wh.name}"?`, {
      title: 'Confirm Warehouse Deletion',
      kind: 'warning'
    });
    if (!isConfirmed) return;
    try {
      await deleteWarehouse(wh.id);
      if (selectedWarehouse?.id === wh.id) {
        setSelectedWarehouse(null);
      }
      loadWarehouses();
    } catch (err: any) {
      alert(err.message || err);
    }
  }

  function openWhAddStockModal(pId?: number) {
    if (pId) {
      setWhAddProductId(pId);
    } else if (products.length > 0) {
      setWhAddProductId(products[0].id);
    } else {
      setWhAddProductId('');
    }
    setWhAddQty('1');
    setWhAddNotes('Direct Inward');
    setIsWhAddStockOpen(true);
  }

  async function handleWhAddStock(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedWarehouse) return;
    if (!whAddProductId) {
      alert("Please select a product.");
      return;
    }
    const qty = parseInt(whAddQty, 10);
    if (!qty || qty <= 0) {
      alert("Please enter a valid quantity greater than 0.");
      return;
    }
    setIsAddingStock(true);
    try {
      await addStockDirectlyToWarehouse(
        selectedWarehouse.id,
        Number(whAddProductId),
        qty,
        whAddNotes || 'Direct Inward Stock'
      );
      setIsWhAddStockOpen(false);
      await loadWarehouseStock(selectedWarehouse.id);
      await loadWarehouses();
      await loadProducts();
    } catch (err: any) {
      alert("Error adding stock: " + (err.message || err));
    } finally {
      setIsAddingStock(false);
    }
  }

  async function loadTransferWhStock(whId: number) {
    if (!whId) {
      setTransferWhStock([]);
      return;
    }
    try {
      const data = await getWarehouseStock(whId);
      setTransferWhStock(data);
    } catch (e) {
      console.error("Failed to load warehouse stock for transfer", e);
      setTransferWhStock([]);
    }
  }

  function openWhTransferModal(direction: 'to_shop' | 'from_shop', pId?: number) {
    setTransferDirection(direction);
    const initialWhId = selectedWarehouse ? selectedWarehouse.id : (warehouses.length > 0 ? warehouses[0].id : '');
    setTransferWarehouseId(initialWhId);
    if (initialWhId) {
      loadTransferWhStock(Number(initialWhId));
    }
    if (pId) {
      setTransferProductId(pId);
    } else if (direction === 'to_shop' && warehouseStock.length > 0) {
      setTransferProductId(warehouseStock[0].product_id);
    } else if (products.length > 0) {
      setTransferProductId(products[0].id);
    } else {
      setTransferProductId('');
    }
    setTransferQty('1');
    setTransferNotes(direction === 'to_shop' ? 'Restock Shop Floor' : 'Offload to Storage');
    setIsWhTransferOpen(true);
  }

  async function openStockHistoryModal() {
    try {
      const list = await getStockMovements(100);
      setStockMovements(list);
      setIsHistoryOpen(true);
    } catch (e) {
      console.error("Failed to load stock movements", e);
    }
  }

  async function handleWhTransfer(e: React.FormEvent) {
    e.preventDefault();
    const whId = selectedWarehouse ? selectedWarehouse.id : Number(transferWarehouseId);
    if (!whId) {
      alert("Please select a warehouse.");
      return;
    }
    if (!transferProductId) {
      alert("Please select a product to transfer.");
      return;
    }
    const qty = parseInt(transferQty, 10);
    if (!qty || qty <= 0) {
      alert("Please enter a valid quantity greater than 0.");
      return;
    }

    setIsTransferring(true);
    try {
      if (transferDirection === 'to_shop') {
        await moveStock('warehouse', whId, 'shop', 0, Number(transferProductId), qty, transferNotes || 'Transferred to Shop');
      } else {
        await moveStock('shop', 0, 'warehouse', whId, Number(transferProductId), qty, transferNotes || 'Transferred to Godown');
      }
      setIsWhTransferOpen(false);
      if (selectedWarehouse) {
        await loadWarehouseStock(selectedWarehouse.id);
      }
      if (whId) {
        await loadTransferWhStock(whId);
      }
      await loadWarehouses();
      await loadProducts();
    } catch (err: any) {
      alert("Error transferring stock: " + (err.message || err));
    } finally {
      setIsTransferring(false);
    }
  }

  function toggleMasterGroup(name: string) {
    setExpandedMasterGroups(prev => ({ ...prev, [name]: !prev[name] }));
  }

  function toggleWhGroup(name: string) {
    setExpandedWhGroups(prev => ({ ...prev, [name]: !prev[name] }));
  }

  async function handleAddGroup(e: React.FormEvent) {
    e.preventDefault();
    try {
      if (newGroupName.trim()) {
        await addGroup(newGroupName.trim());
        setNewGroupName('');
        loadProducts();
      }
    } catch (error) {
      console.error(error);
      alert(`Error adding group: ${error}`);
    }
  }

  async function handleAddBrand(e: React.FormEvent) {
    e.preventDefault();
    try {
      if (newBrandName.trim()) {
        await addBrand(newBrandName.trim());
        setNewBrandName('');
        loadProducts();
      }
    } catch (error) {
      console.error(error);
      alert(`Error adding brand: ${error}`);
    }
  }

  function openEditGroup(group: ItemGroup) {
    setEditMasterModal({ type: 'group', id: group.id, name: group.name });
    setEditMasterName(group.name);
  }

  function openEditBrand(brand: Brand) {
    setEditMasterModal({ type: 'brand', id: brand.id, name: brand.name });
    setEditMasterName(brand.name);
  }

  async function handleUpdateMaster(e: React.FormEvent) {
    e.preventDefault();
    if (!editMasterModal || !editMasterName.trim()) return;
    try {
      if (editMasterModal.type === 'group') {
        await updateGroup(editMasterModal.id, editMasterName.trim());
      } else {
        await updateBrand(editMasterModal.id, editMasterName.trim());
      }
      setEditMasterModal(null);
      await loadProducts();
    } catch (err: any) {
      alert(`Error updating ${editMasterModal.type}: ${err.message || err}`);
    }
  }

  async function handleDeleteGroup(id: number, name: string) {
    const isConfirmed = await confirm(`Are you sure you want to delete the group "${name}"?`, {
      title: 'Confirm Deletion',
      kind: 'warning'
    });
    if (!isConfirmed) return;
    try {
      await deleteGroup(id);
      loadProducts();
    } catch (error) {
      console.error(error);
      alert(`Error deleting group: ${error}`);
    }
  }

  async function handleDeleteBrand(id: number, name: string) {
    const isConfirmed = await confirm(`Are you sure you want to delete the brand "${name}"?`, {
      title: 'Confirm Deletion',
      kind: 'warning'
    });
    if (!isConfirmed) return;
    try {
      await deleteBrand(id);
      loadProducts();
    } catch (error) {
      console.error(error);
      alert(`Error deleting brand: ${error}`);
    }
  }

  async function handleDeleteProduct(p: Product) {
    const isConfirmed = await confirm(`Are you sure you want to delete product "${p.name}"? This action cannot be undone.`, {
      title: 'Confirm Product Deletion',
      kind: 'warning'
    });
    if (!isConfirmed) return;
    try {
      await deleteProduct(p.id);
      if (isModalOpen && editProductId === p.id) {
        setIsModalOpen(false);
        resetForm();
      }
      await loadProducts();
      await loadWarehouses();
    } catch (err: any) {
      alert(err.message || err);
    }
  }

  function handleGstPreset(preset: number) {
    setGstPercentage(preset.toString());
    const half = (preset / 2).toString();
    setCgstPercentage(half);
    setSgstPercentage(half);
  }

  function handleCustomGstChange(val: string) {
    setGstPercentage(val);
    const num = parseFloat(val) || 0;
    const half = (num / 2).toString();
    setCgstPercentage(half);
    setSgstPercentage(half);
  }

  function openEditModal(p: Product) {
    setEditProductId(p.id);
    setName(p.name);
    setGroupId(p.group_id);
    setBrandId(p.brand_id);
    setModel(p.model || '');
    setHsn(p.hsn_code || '');
    setPurchasePrice(p.purchase_price?.toString() || '');
    setSellingPrice(p.selling_price?.toString() || '');
    setMrp(p.mrp?.toString() || '');
    setUnit(p.unit);
    setGstPercentage(p.gst_percentage?.toString() || '18');
    setCgstPercentage(p.cgst_percentage?.toString() || '9');
    setSgstPercentage(p.sgst_percentage?.toString() || '9');
    setMinStock(p.min_stock?.toString() || '0');
    setStock(p.stock_quantity?.toString() || '0');
    setTargetWarehouseId(null);
    setIsModalOpen(true);
  }

  function resetForm() {
    setEditProductId(null);
    setName(''); setGroupId(null); setBrandId(null); setModel(''); setHsn('');
    setPurchasePrice(''); setSellingPrice(''); setMrp('');
    setUnit('Piece'); setMinStock('0'); setStock(''); setGstPercentage('18'); setCgstPercentage('9'); setSgstPercentage('9');
    setTargetWarehouseId(null);
  }

  async function handleAddProduct(e: React.FormEvent) {
    e.preventDefault();
    try {
      const existingBarcode = editProductId ? (products.find(p => p.id === editProductId)?.barcode || null) : null;
      if (editProductId) {
        await updateProduct(
          editProductId,
          name.trim(), groupId, brandId, existingBarcode, model.trim(), hsn.trim(),
          parseFloat(purchasePrice) || 0,
          parseFloat(sellingPrice) || 0,
          parseFloat(mrp) || 0,
          unit,
          parseInt(minStock) || 0,
          parseInt(stock) || 0,
          parseFloat(gstPercentage) || 0,
          parseFloat(cgstPercentage) || 0,
          parseFloat(sgstPercentage) || 0
        );
      } else {
        const baseData = {
          group_id: groupId,
          brand_id: brandId,
          barcode: null,
          model: model.trim(),
          hsn_code: hsn.trim(),
          purchase_price: parseFloat(purchasePrice) || 0,
          selling_price: parseFloat(sellingPrice) || 0,
          mrp: parseFloat(mrp) || 0,
          unit,
          min_stock: parseInt(minStock) || 0,
          stock: parseInt(stock) || 0,
          gst_percentage: parseFloat(gstPercentage) || 0,
          cgst_percentage: parseFloat(cgstPercentage) || 0,
          sgst_percentage: parseFloat(sgstPercentage) || 0
        };

        await addProduct(name.trim(), baseData, targetWarehouseId);
      }
      setIsModalOpen(false);
      resetForm();
      await loadProducts();
      await loadWarehouses();
    } catch (error) {
      console.error("Failed to save product", error);
      alert(`Error saving product: ${error}`);
    }
  }

  // Filter products for main shop floor
  const lowStockThreshold = parseInt(localStorage.getItem('lowStockThreshold') || '10', 10);
  const filteredProducts = products.filter(p => {
    if (filterLowStock && p.stock_quantity >= lowStockThreshold) {
      return false;
    }
    const q = search.toLowerCase();
    return (
      p.name.toLowerCase().includes(q) || 
      (p.model && p.model.toLowerCase().includes(q)) ||
      (p.group_name && p.group_name.toLowerCase().includes(q)) ||
      (p.brand_name && p.brand_name.toLowerCase().includes(q)) ||
      (p.hsn_code && p.hsn_code.toLowerCase().includes(q))
    );
  });

  // Filter warehouses list
  const filteredWarehouses = warehouses.filter(w =>
    w.name.toLowerCase().includes(search.toLowerCase()) ||
    (w.location && w.location.toLowerCase().includes(search.toLowerCase())) ||
    (w.phone && w.phone.includes(search))
  );

  // Filter items for selected warehouse
  const filteredWarehouseItems = warehouseStock.filter(item =>
    item.name.toLowerCase().includes(search.toLowerCase()) ||
    (item.model && item.model.toLowerCase().includes(search.toLowerCase())) ||
    (item.group_name && item.group_name.toLowerCase().includes(search.toLowerCase())) ||
    (item.brand_name && item.brand_name.toLowerCase().includes(search.toLowerCase()))
  );

  // Calculation for transfer modal stock availability
  const currentTransferProduct = products.find(p => p.id === Number(transferProductId));
  let transferAvailableStock: number | null = null;
  if (transferProductId) {
    if (transferDirection === 'to_shop') {
      const sourceList = selectedWarehouse ? warehouseStock : transferWhStock;
      const whItem = sourceList.find(i => i.product_id === Number(transferProductId));
      transferAvailableStock = whItem ? whItem.quantity : 0;
    } else {
      transferAvailableStock = currentTransferProduct ? currentTransferProduct.stock_quantity : 0;
    }
  }

  // Warehouse stats
  const selectedWhTotalUnits = warehouseStock.reduce((sum, item) => sum + (item.quantity || 0), 0);
  const selectedWhTotalValue = warehouseStock.reduce((sum, item) => sum + ((item.quantity || 0) * (item.purchase_price || 0)), 0);

  return (
    <div className="p-8 h-full flex flex-col relative bg-canvas overflow-y-auto">
      
      {/* Header Section */}
      <header className="mb-8 flex flex-wrap justify-between items-end gap-4">
        <div>
          {selectedWarehouse ? (
            <div className="flex items-center gap-3.5">
              <button
                onClick={() => { setSelectedWarehouse(null); setViewMode('warehouses'); setSearch(''); }}
                className="p-2.5 bg-surface hover:bg-surface-soft border border-hairline rounded-lg text-muted hover:text-ink transition-colors flex items-center gap-1.5 text-xs font-semibold shadow-sm"
                title="Back to All Warehouses"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Warehouses</span>
              </button>
              <div>
                <h1 className="text-3xl font-display font-medium text-ink tracking-tight flex items-center gap-2.5">
                  <span>{selectedWarehouse.name}</span>
                  <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-primary/10 text-primary uppercase tracking-wider">Godown Inventory</span>
                </h1>
                <p className="text-sm text-body mt-1">
                  {selectedWarehouse.location ? `${selectedWarehouse.location} • ` : ''}
                  <span className="font-semibold text-ink">{selectedWhTotalUnits}</span> units in stock
                  <span className="text-muted mx-1.5">•</span>
                  Valuation: <span className="font-semibold text-emerald-600">₹{selectedWhTotalValue.toFixed(2)}</span>
                </p>
              </div>
            </div>
          ) : (
            <>
              <h1 className="text-4xl font-display font-medium text-ink tracking-tight">Inventory Management</h1>
              <p className="text-base text-body mt-2">Manage products, variants, item groups, and warehouses.</p>
            </>
          )}
        </div>

        {/* Header Action Buttons */}
        <div className="flex items-center gap-2.5">
          <button 
            onClick={openStockHistoryModal}
            className="bg-surface hover:bg-surface-soft border border-hairline text-ink px-4 py-3 rounded-lg font-medium flex items-center transition-colors shadow-sm text-sm"
            title="View Stock Movement & Transfer History"
          >
            <History className="w-4 h-4 mr-2 text-muted" />
            Stock History
          </button>

          {viewMode === 'items' && !selectedWarehouse && (
            <>
              {warehouses.length > 0 && (
                <button 
                  onClick={() => openWhTransferModal('from_shop')}
                  className="bg-surface hover:bg-surface-soft border border-hairline text-ink px-4 py-3 rounded-lg font-medium flex items-center transition-colors shadow-sm text-sm"
                  title="Move stock between shop floor and godown"
                >
                  <ArrowLeftRight className="w-4 h-4 mr-2 text-primary" />
                  Transfer Stock
                </button>
              )}
              <button 
                onClick={() => { resetForm(); setIsModalOpen(true); }}
                title="Add New Product (Ctrl+S)"
                className="bg-primary hover:bg-primary-active text-on-primary px-6 py-3 rounded-lg font-medium shadow-none flex items-center transition-colors text-sm"
              >
                <Plus className="w-5 h-5 mr-2" />
                Add Product
              </button>
            </>
          )}

          {viewMode === 'groups' && !selectedWarehouse && (
            <button 
              onClick={() => { setNewGroupName(''); setAddMasterModal('group'); }}
              className="bg-primary hover:bg-primary-active text-on-primary px-6 py-3 rounded-lg font-medium shadow-none flex items-center transition-colors"
            >
              <Plus className="w-5 h-5 mr-2" />
              Add Group
            </button>
          )}

          {viewMode === 'brands' && !selectedWarehouse && (
            <button 
              onClick={() => { setNewBrandName(''); setAddMasterModal('brand'); }}
              className="bg-primary hover:bg-primary-active text-on-primary px-6 py-3 rounded-lg font-medium shadow-none flex items-center transition-colors"
            >
              <Plus className="w-5 h-5 mr-2" />
              Add Brand
            </button>
          )}

          {selectedWarehouse ? (
            <>
              <button 
                onClick={() => openWhTransferModal('to_shop')}
                className="bg-surface hover:bg-surface-soft border border-hairline text-ink px-4 py-2.5 rounded-lg font-medium flex items-center transition-colors shadow-sm text-sm"
                title="Transfer stock between warehouse and main inventory"
              >
                <ArrowLeftRight className="w-4 h-4 mr-2 text-primary" />
                Transfer Stock
              </button>
              <button 
                onClick={() => openWhAddStockModal()}
                className="bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2.5 rounded-lg font-medium shadow-sm flex items-center transition-colors text-sm"
                title="Add stock directly into this warehouse"
              >
                <Plus className="w-4 h-4 mr-1.5" />
                Add Stock
              </button>
              <button
                onClick={() => openEditWarehouseModal(selectedWarehouse)}
                className="p-2.5 text-muted hover:text-ink bg-surface border border-hairline rounded-lg transition-colors shadow-sm"
                title="Edit Warehouse Details"
              >
                <Edit2 className="w-4 h-4" />
              </button>
              <button
                onClick={() => handleDeleteWarehouse(selectedWarehouse)}
                className="p-2.5 text-muted hover:text-signature-coral bg-surface border border-hairline rounded-lg transition-colors shadow-sm"
                title="Delete Warehouse"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </>
          ) : viewMode === 'warehouses' && (
            <button 
              onClick={openAddWarehouseModal}
              className="bg-primary hover:bg-primary-active text-on-primary px-6 py-3 rounded-lg font-medium shadow-none flex items-center transition-colors"
            >
              <Plus className="w-5 h-5 mr-2" />
              Add Warehouse
            </button>
          )}
        </div>
      </header>

      {/* Main Content Card */}
      <div className="bg-canvas rounded-lg border border-hairline flex-1 flex flex-col overflow-hidden">
        
        {/* Navigation / Search Bar */}
        {selectedWarehouse === null ? (
          <div className="p-4 border-b border-hairline flex justify-between items-center bg-canvas">
            <div className="flex gap-4 items-center">
              <button 
                onClick={() => { setViewMode('items'); setSelectedWarehouse(null); setSearch(''); }} 
                className={`px-4 py-2 font-medium text-sm transition-colors border-b-2 ${viewMode === 'items' ? 'border-primary text-primary font-bold' : 'border-transparent text-muted hover:text-ink'}`}
              >
                ITEM
              </button>
              <button 
                onClick={() => { setViewMode('groups'); setSelectedWarehouse(null); setSearch(''); }} 
                className={`px-4 py-2 font-medium text-sm transition-colors border-b-2 ${viewMode === 'groups' ? 'border-primary text-primary font-bold' : 'border-transparent text-muted hover:text-ink'}`}
              >
                GROUP
              </button>
              <button 
                onClick={() => { setViewMode('brands'); setSelectedWarehouse(null); setSearch(''); }} 
                className={`px-4 py-2 font-medium text-sm transition-colors border-b-2 ${viewMode === 'brands' ? 'border-primary text-primary font-bold' : 'border-transparent text-muted hover:text-ink'}`}
              >
                BRAND
              </button>
              <button 
                onClick={() => { setViewMode('warehouses'); setSearch(''); }} 
                className={`px-4 py-2 font-medium text-sm transition-colors border-b-2 flex items-center gap-1.5 ${viewMode === 'warehouses' ? 'border-primary text-primary font-bold' : 'border-transparent text-muted hover:text-ink'}`}
              >
                <WarehouseIcon className="w-4 h-4" />
                <span>WAREHOUSE</span>
                {warehouses.length > 0 && (
                  <span className={`text-xs px-2 py-0.5 rounded-full ${viewMode === 'warehouses' ? 'bg-primary/10 text-primary' : 'bg-surface text-muted border border-hairline'}`}>
                    {warehouses.length}
                  </span>
                )}
              </button>
            </div>

            <div className="flex items-center gap-3 flex-1 max-w-lg ml-4 justify-end">
              {filterLowStock && (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-red-100 text-red-700 text-xs font-semibold whitespace-nowrap shrink-0">
                  Low Stock (&lt; {lowStockThreshold})
                  <button onClick={() => setFilterLowStock(false)} className="hover:text-red-900" title="Show all products">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </span>
              )}
              <div className="relative w-full max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted w-4 h-4" />
                <input 
                  type="text" 
                  placeholder={
                    viewMode === 'warehouses' 
                      ? "Search warehouses..." 
                      : viewMode === 'groups' 
                        ? "Search item groups..." 
                        : viewMode === 'brands' 
                          ? "Search brands..." 
                          : "Search products by name or model..."
                  } 
                  className="w-full pl-9 pr-4 py-2 bg-canvas border border-hairline rounded-sm shadow-none focus:outline-none focus:border-ink transition-colors text-ink placeholder-muted text-sm"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            </div>
          </div>
        ) : (
          /* Clean, Simple Navigation Bar for Warehouse Inventory */
          <div className="p-4 border-b border-hairline flex flex-wrap justify-between items-center gap-4 bg-canvas">
            <div className="flex items-center gap-4">
              {/* Warehouse View Tabs */}
              <div className="flex gap-4">
                <button 
                  onClick={() => { setWarehouseViewMode('items'); setSearch(''); }} 
                  className={`px-4 py-2 font-medium text-sm transition-colors border-b-2 ${warehouseViewMode === 'items' ? 'border-primary text-primary font-bold' : 'border-transparent text-muted hover:text-ink'}`}
                >
                  ITEM
                </button>
                <button 
                  onClick={() => { setWarehouseViewMode('groups'); setSearch(''); }} 
                  className={`px-4 py-2 font-medium text-sm transition-colors border-b-2 ${warehouseViewMode === 'groups' ? 'border-primary text-primary font-bold' : 'border-transparent text-muted hover:text-ink'}`}
                >
                  GROUP
                </button>
                <button 
                  onClick={() => { setWarehouseViewMode('brands'); setSearch(''); }} 
                  className={`px-4 py-2 font-medium text-sm transition-colors border-b-2 ${warehouseViewMode === 'brands' ? 'border-primary text-primary font-bold' : 'border-transparent text-muted hover:text-ink'}`}
                >
                  BRAND
                </button>
              </div>

              {/* Godown Switcher (if user has multiple godowns) */}
              {warehouses.length > 1 && (
                <>
                  <div className="h-5 w-px bg-hairline" />
                  <div className="flex items-center gap-1.5 overflow-x-auto">
                    {warehouses.map(w => (
                      <button
                        key={w.id}
                        onClick={() => {
                          setSelectedWarehouse(w);
                          setSearch('');
                          loadWarehouseStock(w.id);
                        }}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
                          selectedWarehouse.id === w.id
                            ? 'bg-primary text-on-primary shadow-sm'
                            : 'bg-surface text-ink border border-hairline hover:bg-surface-soft'
                        }`}
                      >
                        <WarehouseIcon className="w-3.5 h-3.5" />
                        <span>{w.name}</span>
                      </button>
                    ))}
                    <button
                      onClick={openAddWarehouseModal}
                      className="p-1.5 text-muted hover:text-ink hover:bg-surface rounded-lg transition-colors border border-dashed border-hairline"
                      title="Add new warehouse"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </>
              )}
            </div>

            {/* Warehouse Search Input */}
            <div className="relative flex-1 max-w-md ml-4">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted w-4 h-4" />
              <input 
                type="text" 
                placeholder={
                  warehouseViewMode === 'items' 
                    ? `Search items in ${selectedWarehouse.name}...` 
                    : warehouseViewMode === 'groups' 
                      ? `Search groups in ${selectedWarehouse.name}...` 
                      : `Search brands in ${selectedWarehouse.name}...`
                } 
                className="w-full pl-9 pr-4 py-2 bg-canvas border border-hairline rounded-sm shadow-none focus:outline-none focus:border-ink transition-colors text-ink placeholder-muted text-sm"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>
        )}

        {/* Content Area */}
        <div className="overflow-x-auto flex-1 bg-canvas flex flex-col">
          
          {/* ========================================================================= */}
          {/* 1. WAREHOUSE VIEW MODE */}
          {/* ========================================================================= */}
          {viewMode === 'warehouses' && (
            <>
              {selectedWarehouse === null ? (
                /* WAREHOUSES DIRECTORY (Select Warehouse to view its inventory) */
                <div className="p-6 flex-1 overflow-y-auto">
                  <div className="flex justify-between items-center mb-6">
                    <div>
                      <h2 className="text-xl font-bold text-ink">Storage Warehouses & Godowns</h2>
                      <p className="text-sm text-muted mt-0.5">Click any warehouse below to open and manage its independent stock inventory.</p>
                    </div>
                    <button
                      onClick={openAddWarehouseModal}
                      className="px-4 py-2 bg-primary text-on-primary font-semibold rounded-lg text-sm flex items-center gap-1.5 hover:bg-primary-active transition-colors shadow-sm"
                    >
                      <Plus className="w-4 h-4" />
                      Add Warehouse
                    </button>
                  </div>

                  {filteredWarehouses.length === 0 ? (
                    <div className="text-center py-16 bg-surface-soft/50 rounded-xl border border-dashed border-hairline max-w-md mx-auto my-8">
                      <WarehouseIcon className="w-12 h-12 text-muted mx-auto mb-3 opacity-40" />
                      <h3 className="text-base font-semibold text-ink">No Warehouses Found</h3>
                      <p className="text-sm text-muted mt-1 mb-5">Create an independent godown or storage unit to manage extra inventory.</p>
                      <button
                        onClick={openAddWarehouseModal}
                        className="px-4 py-2 bg-primary text-on-primary rounded-lg text-sm font-semibold inline-flex items-center gap-1.5 hover:bg-primary-active transition-colors"
                      >
                        <Plus className="w-4 h-4" />
                        Add First Warehouse
                      </button>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                      {filteredWarehouses.map(wh => (
                        <div
                          key={wh.id}
                          className="bg-surface border border-hairline rounded-xl p-5 hover:border-ink/30 transition-all flex flex-col justify-between shadow-sm group"
                        >
                          <div>
                            <div className="flex items-start justify-between">
                              <div className="flex items-center gap-2.5">
                                <div className="p-2.5 rounded-lg bg-primary/10 text-primary">
                                  <WarehouseIcon className="w-5 h-5" />
                                </div>
                                <div>
                                  <h3 className="font-bold text-lg text-ink group-hover:text-primary transition-colors">{wh.name}</h3>
                                  <span className="text-[11px] font-semibold text-muted uppercase tracking-wider">Independent Godown</span>
                                </div>
                              </div>
                              <div className="flex items-center gap-1">
                                <button
                                  onClick={(e) => { e.stopPropagation(); openEditWarehouseModal(wh); }}
                                  className="p-1.5 text-muted hover:text-ink hover:bg-surface-soft rounded transition-colors"
                                  title="Edit Warehouse Details"
                                >
                                  <Edit2 className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={(e) => { e.stopPropagation(); handleDeleteWarehouse(wh); }}
                                  className="p-1.5 text-muted hover:text-signature-coral hover:bg-signature-coral/10 rounded transition-colors"
                                  title="Delete Warehouse"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </div>

                            <div className="mt-4 space-y-1 text-xs text-muted">
                              {wh.location ? (
                                <p className="flex items-center gap-1.5">
                                  <MapPin className="w-3.5 h-3.5 text-muted/70 flex-shrink-0" />
                                  <span className="truncate">{wh.location}</span>
                                </p>
                              ) : (
                                <p className="text-muted/60 italic">No location provided</p>
                              )}
                              {wh.phone && (
                                <p className="flex items-center gap-1.5">
                                  <Phone className="w-3.5 h-3.5 text-muted/70 flex-shrink-0" />
                                  <span>{wh.phone}</span>
                                </p>
                              )}
                            </div>

                            <div className="mt-5 pt-4 border-t border-hairline grid grid-cols-2 gap-2 text-center">
                              <div className="bg-canvas p-2 rounded-lg border border-hairline">
                                <span className="block text-[10px] uppercase font-bold text-muted tracking-wider">Total Items</span>
                                <span className="block text-base font-bold text-ink">{wh.total_items || 0}</span>
                              </div>
                              <div className="bg-canvas p-2 rounded-lg border border-hairline">
                                <span className="block text-[10px] uppercase font-bold text-muted tracking-wider">Total Units</span>
                                <span className="block text-base font-bold text-primary">{wh.total_quantity || 0}</span>
                              </div>
                            </div>
                          </div>

                          <div className="mt-5 pt-2">
                            <button
                              onClick={() => {
                                setSelectedWarehouse(wh);
                                setWarehouseViewMode('items');
                                setSearch('');
                                loadWarehouseStock(wh.id);
                              }}
                              className="w-full py-2.5 px-4 bg-canvas hover:bg-primary hover:text-on-primary border border-hairline rounded-lg text-sm font-semibold text-ink flex items-center justify-center gap-2 transition-all shadow-sm"
                            >
                              <span>Open Inventory</span>
                              <ArrowUpRight className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      ))}

                      {/* Add Warehouse Card Shortcut */}
                      <button
                        onClick={openAddWarehouseModal}
                        className="bg-surface/40 hover:bg-surface border-2 border-dashed border-hairline hover:border-primary/50 rounded-xl p-8 flex flex-col items-center justify-center gap-2 transition-all text-muted hover:text-primary group min-h-[220px]"
                      >
                        <div className="p-3 rounded-full bg-surface border border-hairline group-hover:scale-110 transition-transform">
                          <Plus className="w-6 h-6 text-primary" />
                        </div>
                        <span className="font-semibold text-sm">Add New Warehouse</span>
                        <span className="text-xs text-muted">Create storage godown</span>
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                /* INDEPENDENT WAREHOUSE INVENTORY (With ITEM, GROUP, and BRAND Views!) */
                <div className="flex-1 flex flex-col overflow-hidden">
                  
                  {/* 1A. Warehouse ITEMS View */}
                  {warehouseViewMode === 'items' && (
                    <div className="overflow-x-auto flex-1 bg-canvas">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="bg-surface-soft border-b border-hairline text-muted text-xs font-semibold uppercase tracking-wider sticky top-0 z-10">
                            <th className="px-6 py-4">Product Name</th>
                            <th className="px-6 py-4">Group</th>
                            <th className="px-6 py-4">Brand</th>
                            <th className="px-6 py-4">Model / Spec</th>
                            <th className="px-6 py-4">Unit</th>
                            <th className="px-6 py-4 text-right">Warehouse Stock</th>
                            <th className="px-6 py-4 text-right">Purchase (₹)</th>
                            <th className="px-6 py-4 text-right">Stock Value (₹)</th>
                            <th className="px-6 py-4 text-right">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-hairline">
                          {filteredWarehouseItems.map(item => (
                            <tr key={item.id} className="hover:bg-surface-soft transition-colors border-b border-hairline last:border-0">
                              <td className="px-6 py-4 font-medium text-ink">{item.name}</td>
                              <td className="px-6 py-4 text-muted text-sm">{item.group_name || '-'}</td>
                              <td className="px-6 py-4 text-muted text-sm">{item.brand_name || '-'}</td>
                              <td className="px-6 py-4 text-muted text-sm">{item.model || '-'}</td>
                              <td className="px-6 py-4 text-muted text-sm">{item.unit}</td>
                              <td className="px-6 py-4 text-right">
                                <span className="font-bold text-ink text-sm px-2.5 py-1 bg-primary/10 text-primary rounded-md">
                                  {item.quantity}
                                </span>
                              </td>
                              <td className="px-6 py-4 text-right text-sm text-muted">₹{item.purchase_price.toFixed(2)}</td>
                              <td className="px-6 py-4 text-right font-semibold text-emerald-600 text-sm">
                                ₹{(item.quantity * item.purchase_price).toFixed(2)}
                              </td>
                              <td className="px-6 py-4 text-right">
                                <div className="flex justify-end gap-2">
                                  <button
                                    onClick={() => openWhAddStockModal(item.product_id)}
                                    className="text-xs bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-700 font-semibold px-2.5 py-1.5 rounded-lg transition-colors inline-flex items-center gap-1"
                                    title="Add more stock directly to this warehouse"
                                  >
                                    <Plus className="w-3.5 h-3.5" />
                                    Add Stock
                                  </button>
                                  <button
                                    onClick={() => openWhTransferModal('to_shop', item.product_id)}
                                    className="text-xs bg-primary/10 hover:bg-primary/20 text-primary font-semibold px-2.5 py-1.5 rounded-lg transition-colors inline-flex items-center gap-1"
                                    title="Transfer to Main Inventory"
                                  >
                                    <ArrowLeftRight className="w-3.5 h-3.5" />
                                    Transfer
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                          {filteredWarehouseItems.length === 0 && !loadingWhStock && (
                            <tr>
                              <td colSpan={9} className="text-center py-16 text-muted">
                                <WarehouseIcon className="w-12 h-12 text-muted mx-auto mb-3 opacity-30" />
                                <p className="text-base font-semibold text-ink">No items in this warehouse yet</p>
                                <p className="text-sm text-muted mt-1 mb-5">You can add stock directly into this warehouse or transfer items from main inventory.</p>
                                <div className="flex justify-center gap-3">
                                  <button
                                    onClick={() => openWhAddStockModal()}
                                    className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg text-sm font-semibold inline-flex items-center gap-1.5 transition-colors shadow-sm"
                                  >
                                    <Plus className="w-4 h-4" />
                                    Add Stock
                                  </button>
                                  <button
                                    onClick={() => openWhTransferModal('from_shop')}
                                    className="bg-surface hover:bg-surface-soft border border-hairline text-ink px-4 py-2 rounded-lg text-sm font-semibold inline-flex items-center gap-1.5 transition-colors"
                                  >
                                    <ArrowLeftRight className="w-4 h-4 text-primary" />
                                    Transfer Stock
                                  </button>
                                </div>
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {/* 1B. Warehouse GROUPS View */}
                  {warehouseViewMode === 'groups' && (
                    <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-canvas min-h-[500px]">
                      {itemGroups.filter(g => g.name.toLowerCase().includes(search.toLowerCase())).map(group => {
                        const groupWhItems = warehouseStock.filter(item => 
                          (item.group_id && item.group_id === group.id) || item.group_name === group.name
                        );
                        const isExpanded = expandedWhGroups[`wh_g_${group.id}`];
                        const brandsInGroup = Array.from(new Set(groupWhItems.map(item => item.brand_name || 'UNBRANDED')));
                        const totalStock = groupWhItems.reduce((sum, item) => sum + (item.quantity || 0), 0);
                        const totalVal = groupWhItems.reduce((sum, item) => sum + ((item.quantity || 0) * (item.purchase_price || 0)), 0);

                        return (
                          <div key={group.id} className="bg-surface border border-hairline rounded-lg overflow-hidden transition-all shadow-sm">
                            <div 
                              className="p-5 flex justify-between items-center cursor-pointer hover:bg-surface-soft transition-colors"
                              onClick={() => toggleWhGroup(`wh_g_${group.id}`)}
                              tabIndex={0}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                  e.preventDefault();
                                  toggleWhGroup(`wh_g_${group.id}`);
                                }
                              }}
                            >
                              <div className="flex items-center gap-4">
                                <div className={`p-2 rounded-md ${isExpanded ? 'bg-primary/10 text-primary' : 'bg-canvas border border-hairline text-muted'}`}>
                                  {isExpanded ? <ChevronDown className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}
                                </div>
                                <div>
                                  <h3 className="font-bold text-lg text-ink uppercase tracking-wider">{group.name}</h3>
                                  <p className="text-muted text-sm mt-0.5">
                                    <span className="font-medium text-ink">{brandsInGroup.length}</span> Brands • <span className="font-medium text-ink">{groupWhItems.length}</span> Products in Godown
                                  </p>
                                </div>
                              </div>
                              <div className="flex items-center gap-6">
                                <div className="text-right">
                                  <p className="text-xs text-muted uppercase font-bold tracking-wider mb-0.5">Godown Stock</p>
                                  <p className="text-xl font-display font-medium text-ink">{totalStock} <span className="text-xs font-normal text-muted">(₹{totalVal.toFixed(2)})</span></p>
                                </div>
                              </div>
                            </div>
                            
                            {isExpanded && (
                              <div className="border-t border-hairline bg-canvas p-4 space-y-3">
                                {brandsInGroup.length === 0 && groupWhItems.length === 0 ? (
                                  <div className="text-center py-6 text-muted">
                                    <p className="text-sm">No products from "{group.name}" currently stored in {selectedWarehouse.name}.</p>
                                    <button
                                      onClick={() => openWhAddStockModal()}
                                      className="mt-2 text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-semibold px-3 py-1.5 rounded-md inline-flex items-center gap-1 transition-colors"
                                    >
                                      <Plus className="w-3.5 h-3.5" />
                                      Deposit Items into Godown
                                    </button>
                                  </div>
                                ) : brandsInGroup.map(brandName => {
                                  const brandItems = groupWhItems.filter(item => (item.brand_name || 'UNBRANDED') === brandName);
                                  const isBrandExpanded = expandedWhGroups[`wh_g_${group.id}_b_${brandName}`];
                                  const brandStock = brandItems.reduce((sum, item) => sum + (item.quantity || 0), 0);
                                  
                                  return (
                                    <div key={brandName} className="border border-hairline rounded-lg overflow-hidden">
                                      <div 
                                        className="p-3 bg-surface-soft flex justify-between items-center cursor-pointer hover:bg-surface transition-colors"
                                        onClick={() => toggleWhGroup(`wh_g_${group.id}_b_${brandName}`)}
                                        tabIndex={0}
                                        onKeyDown={(e) => {
                                          if (e.key === 'Enter' || e.key === ' ') {
                                            e.preventDefault();
                                            toggleWhGroup(`wh_g_${group.id}_b_${brandName}`);
                                          }
                                        }}
                                      >
                                        <div className="flex items-center gap-3">
                                          {isBrandExpanded ? <ChevronDown className="w-4 h-4 text-ink" /> : <ChevronRight className="w-4 h-4 text-muted" />}
                                          <span className="font-semibold text-ink">{brandName}</span>
                                          <span className="text-xs bg-canvas px-2 py-0.5 rounded-full text-muted border border-hairline">{brandItems.length} Items</span>
                                        </div>
                                        <div className="font-medium text-ink pr-4">{brandStock} in Godown</div>
                                      </div>
                                      
                                      {isBrandExpanded && (
                                        <div className="p-2">
                                          <table className="w-full text-left text-sm">
                                            <thead className="text-xs text-muted font-medium uppercase tracking-wider">
                                              <tr>
                                                <th className="px-4 py-2">Item Name</th>
                                                <th className="px-4 py-2">HSN</th>
                                                <th className="px-4 py-2">Model</th>
                                                <th className="px-4 py-2">Unit</th>
                                                <th className="px-4 py-2 text-right">Godown Stock</th>
                                                <th className="px-4 py-2 text-right">Purchase (₹)</th>
                                                <th className="px-4 py-2 text-right">Stock Value (₹)</th>
                                                <th className="px-4 py-2 text-right">Actions</th>
                                              </tr>
                                            </thead>
                                            <tbody className="divide-y divide-hairline">
                                              {brandItems.map(item => (
                                                <tr key={item.id} className="hover:bg-surface-soft transition-colors group/item">
                                                  <td className="px-4 py-2.5 font-medium text-ink">{item.name}</td>
                                                  <td className="px-4 py-2.5 text-muted">{item.hsn_code || '-'}</td>
                                                  <td className="px-4 py-2.5 text-muted">{item.model || '-'}</td>
                                                  <td className="px-4 py-2.5 text-muted">{item.unit}</td>
                                                  <td className="px-4 py-2.5 text-right">
                                                    <span className="font-bold text-ink px-2 py-0.5 bg-primary/10 text-primary rounded-md">
                                                      {item.quantity}
                                                    </span>
                                                  </td>
                                                  <td className="px-4 py-2.5 text-right text-muted">₹{item.purchase_price?.toFixed(2) || '0.00'}</td>
                                                  <td className="px-4 py-2.5 text-right font-semibold text-emerald-600">₹{(item.quantity * item.purchase_price).toFixed(2)}</td>
                                                  <td className="px-4 py-2.5 text-right">
                                                    <div className="flex justify-end gap-1.5">
                                                      <button 
                                                        onClick={() => openWhAddStockModal(item.product_id)} 
                                                        className="text-xs bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-700 px-2 py-1 rounded font-semibold transition-colors"
                                                        title="Add stock directly to godown"
                                                      >
                                                        + Stock
                                                      </button>
                                                      <button 
                                                        onClick={() => openWhTransferModal('to_shop', item.product_id)} 
                                                        className="text-xs bg-primary/10 hover:bg-primary/20 text-primary px-2 py-1 rounded font-semibold transition-colors"
                                                        title="Transfer to shop"
                                                      >
                                                        To Shop
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
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      })}
                      {itemGroups.length === 0 && (
                        <div className="text-center py-12 text-muted">No item groups created yet.</div>
                      )}
                    </div>
                  )}

                  {/* 1C. Warehouse BRANDS View */}
                  {warehouseViewMode === 'brands' && (
                    <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-canvas min-h-[500px]">
                      {brands.filter(b => b.name.toLowerCase().includes(search.toLowerCase())).map(brand => {
                        const brandWhItems = warehouseStock.filter(item => 
                          (item.brand_id && item.brand_id === brand.id) || item.brand_name === brand.name
                        );
                        const isExpanded = expandedWhGroups[`wh_b_${brand.id}`];
                        const groupsInBrand = Array.from(new Set(brandWhItems.map(item => item.group_name || 'UNGROUPED')));
                        const totalStock = brandWhItems.reduce((sum, item) => sum + (item.quantity || 0), 0);
                        const totalVal = brandWhItems.reduce((sum, item) => sum + ((item.quantity || 0) * (item.purchase_price || 0)), 0);

                        return (
                          <div key={brand.id} className="bg-surface border border-hairline rounded-lg overflow-hidden transition-all shadow-sm">
                            <div 
                              className="p-5 flex justify-between items-center cursor-pointer hover:bg-surface-soft transition-colors"
                              onClick={() => toggleWhGroup(`wh_b_${brand.id}`)}
                              tabIndex={0}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                  e.preventDefault();
                                  toggleWhGroup(`wh_b_${brand.id}`);
                                }
                              }}
                            >
                              <div className="flex items-center gap-4">
                                <div className={`p-2 rounded-md ${isExpanded ? 'bg-primary/10 text-primary' : 'bg-canvas border border-hairline text-muted'}`}>
                                  {isExpanded ? <ChevronDown className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}
                                </div>
                                <div>
                                  <h3 className="font-bold text-lg text-ink uppercase tracking-wider">{brand.name}</h3>
                                  <p className="text-muted text-sm mt-0.5">
                                    <span className="font-medium text-ink">{groupsInBrand.length}</span> Groups • <span className="font-medium text-ink">{brandWhItems.length}</span> Products in Godown
                                  </p>
                                </div>
                              </div>
                              <div className="flex items-center gap-6">
                                <div className="text-right">
                                  <p className="text-xs text-muted uppercase font-bold tracking-wider mb-0.5">Godown Stock</p>
                                  <p className="text-xl font-display font-medium text-ink">{totalStock} <span className="text-xs font-normal text-muted">(₹{totalVal.toFixed(2)})</span></p>
                                </div>
                              </div>
                            </div>
                            
                            {isExpanded && (
                              <div className="border-t border-hairline bg-canvas p-4 space-y-3">
                                {groupsInBrand.length === 0 && brandWhItems.length === 0 ? (
                                  <div className="text-center py-6 text-muted">
                                    <p className="text-sm">No products from "{brand.name}" currently stored in {selectedWarehouse.name}.</p>
                                    <button
                                      onClick={() => openWhAddStockModal()}
                                      className="mt-2 text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-semibold px-3 py-1.5 rounded-md inline-flex items-center gap-1 transition-colors"
                                    >
                                      <Plus className="w-3.5 h-3.5" />
                                      Deposit Items into Godown
                                    </button>
                                  </div>
                                ) : groupsInBrand.map(groupName => {
                                  const groupItems = brandWhItems.filter(item => (item.group_name || 'UNGROUPED') === groupName);
                                  const isGroupExpanded = expandedWhGroups[`wh_b_${brand.id}_g_${groupName}`];
                                  const groupStock = groupItems.reduce((sum, item) => sum + (item.quantity || 0), 0);
                                  
                                  return (
                                    <div key={groupName} className="border border-hairline rounded-lg overflow-hidden">
                                      <div 
                                        className="p-3 bg-surface-soft flex justify-between items-center cursor-pointer hover:bg-surface transition-colors"
                                        onClick={() => toggleWhGroup(`wh_b_${brand.id}_g_${groupName}`)}
                                        tabIndex={0}
                                        onKeyDown={(e) => {
                                          if (e.key === 'Enter' || e.key === ' ') {
                                            e.preventDefault();
                                            toggleWhGroup(`wh_b_${brand.id}_g_${groupName}`);
                                          }
                                        }}
                                      >
                                        <div className="flex items-center gap-3">
                                          {isGroupExpanded ? <ChevronDown className="w-4 h-4 text-ink" /> : <ChevronRight className="w-4 h-4 text-muted" />}
                                          <span className="font-semibold text-ink">{groupName}</span>
                                          <span className="text-xs bg-canvas px-2 py-0.5 rounded-full text-muted border border-hairline">{groupItems.length} Items</span>
                                        </div>
                                        <div className="font-medium text-ink pr-4">{groupStock} in Godown</div>
                                      </div>
                                      
                                      {isGroupExpanded && (
                                        <div className="p-2">
                                          <table className="w-full text-left text-sm">
                                            <thead className="text-xs text-muted font-medium uppercase tracking-wider">
                                              <tr>
                                                <th className="px-4 py-2">Item Name</th>
                                                <th className="px-4 py-2">HSN</th>
                                                <th className="px-4 py-2">Model</th>
                                                <th className="px-4 py-2">Unit</th>
                                                <th className="px-4 py-2 text-right">Godown Stock</th>
                                                <th className="px-4 py-2 text-right">Purchase (₹)</th>
                                                <th className="px-4 py-2 text-right">Stock Value (₹)</th>
                                                <th className="px-4 py-2 text-right">Actions</th>
                                              </tr>
                                            </thead>
                                            <tbody className="divide-y divide-hairline">
                                              {groupItems.map(item => (
                                                <tr key={item.id} className="hover:bg-surface-soft transition-colors group/item">
                                                  <td className="px-4 py-2.5 font-medium text-ink">{item.name}</td>
                                                  <td className="px-4 py-2.5 text-muted">{item.hsn_code || '-'}</td>
                                                  <td className="px-4 py-2.5 text-muted">{item.model || '-'}</td>
                                                  <td className="px-4 py-2.5 text-muted">{item.unit}</td>
                                                  <td className="px-4 py-2.5 text-right">
                                                    <span className="font-bold text-ink px-2 py-0.5 bg-primary/10 text-primary rounded-md">
                                                      {item.quantity}
                                                    </span>
                                                  </td>
                                                  <td className="px-4 py-2.5 text-right text-muted">₹{item.purchase_price?.toFixed(2) || '0.00'}</td>
                                                  <td className="px-4 py-2.5 text-right font-semibold text-emerald-600">₹{(item.quantity * item.purchase_price).toFixed(2)}</td>
                                                  <td className="px-4 py-2.5 text-right">
                                                    <div className="flex justify-end gap-1.5">
                                                      <button 
                                                        onClick={() => openWhAddStockModal(item.product_id)} 
                                                        className="text-xs bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-700 px-2 py-1 rounded font-semibold transition-colors"
                                                        title="Add stock directly to godown"
                                                      >
                                                        + Stock
                                                      </button>
                                                      <button 
                                                        onClick={() => openWhTransferModal('to_shop', item.product_id)} 
                                                        className="text-xs bg-primary/10 hover:bg-primary/20 text-primary px-2 py-1 rounded font-semibold transition-colors"
                                                        title="Transfer to shop"
                                                      >
                                                        To Shop
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
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      })}
                      {brands.length === 0 && (
                        <div className="text-center py-12 text-muted">No brands created yet.</div>
                      )}
                    </div>
                  )}

                </div>
              )}
            </>
          )}

          {/* ========================================================================= */}
          {/* 2. MAIN SHOP FLOOR INVENTORY (Item / Group / Brand) */}
          {/* ========================================================================= */}
          {viewMode !== 'warehouses' && (
            <>
              {viewMode === 'items' && (
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-surface-soft border-b border-hairline text-muted text-xs font-semibold uppercase tracking-wider sticky top-0 z-10">
                      <th className="px-6 py-4">Product Name</th>
                      <th className="px-6 py-4">HSN</th>
                      <th className="px-6 py-4">Model</th>
                      <th className="px-6 py-4">Unit</th>
                      <th className="px-6 py-4 text-right">Stock</th>
                      <th className="px-6 py-4 text-right">Purchase (₹)</th>
                      <th className="px-6 py-4 text-right">Selling (₹)</th>
                      <th className="px-6 py-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-hairline">
                    {filteredProducts.map((p) => {
                      const isLowStock = p.stock_quantity <= p.min_stock;
                      return (
                        <tr key={p.id} className="hover:bg-surface-soft transition-colors border-b border-hairline last:border-0 group">
                          <td className="px-6 py-4 font-medium text-ink">
                            <div className="font-semibold text-ink text-base">{p.name}</div>
                            <div className="text-xs text-muted flex flex-wrap items-center gap-2 mt-1">
                              {p.group_name && (
                                <span className="bg-surface px-2 py-0.5 rounded text-[11px] font-medium border border-hairline uppercase tracking-wider text-muted">
                                  {p.group_name}
                                </span>
                              )}
                              {p.brand_name && (
                                <span className="bg-primary/5 text-primary px-2 py-0.5 rounded text-[11px] font-medium">
                                  {p.brand_name}
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-6 py-4 text-muted text-sm">{p.hsn_code || '-'}</td>
                          <td className="px-6 py-4 text-muted text-sm">{p.model || '-'}</td>
                          <td className="px-6 py-4 text-muted text-sm">{p.unit}</td>
                          <td className="px-6 py-4 text-right">
                            <div className="flex flex-col items-end">
                              <span className={`font-semibold inline-flex items-center gap-1.5 ${isLowStock ? 'text-signature-coral' : 'text-ink'}`}>
                                {isLowStock && <ShieldAlert className="w-3.5 h-3.5 text-signature-coral" />}
                                {p.stock_quantity}
                              </span>
                              {p.min_stock > 0 && (
                                <span className="text-[10px] text-muted">Min: {p.min_stock}</span>
                              )}
                            </div>
                          </td>
                          <td className="px-6 py-4 text-right text-muted text-sm">₹{p.purchase_price?.toFixed(2) || '0.00'}</td>
                          <td className="px-6 py-4 text-right font-medium text-ink text-sm">₹{p.selling_price?.toFixed(2) || '0.00'}</td>
                          <td className="px-6 py-4 text-right">
                            <div className="flex justify-end gap-1">
                              {warehouses.length > 0 && (
                                <button
                                  onClick={() => openWhTransferModal('from_shop', p.id)}
                                  className="text-xs text-muted hover:text-primary p-1.5 hover:bg-surface rounded transition-colors"
                                  title="Transfer stock to a godown"
                                >
                                  <ArrowLeftRight className="w-4 h-4" />
                                </button>
                              )}
                              <button 
                                onClick={() => openEditModal(p)}
                                className="text-muted hover:text-ink p-1.5 hover:bg-surface rounded transition-colors"
                                title="Edit Product"
                              >
                                <Edit2 className="w-4 h-4" />
                              </button>
                              <button 
                                onClick={() => handleDeleteProduct(p)}
                                className="text-muted hover:text-signature-coral p-1.5 hover:bg-signature-coral/10 rounded transition-colors"
                                title="Delete Product"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                    {filteredProducts.length === 0 && (
                      <tr>
                        <td colSpan={8} className="text-center py-12 text-muted">No products found.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              )}

              {viewMode === 'groups' && (
                <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-canvas min-h-[500px]">
                  {itemGroups.filter(g => g.name.toLowerCase().includes(search.toLowerCase())).map(group => {
                    const groupProducts = products.filter(p => p.group_id === group.id);
                    const isExpanded = expandedMasterGroups[`g_${group.id}`];
                    const brandsInGroup = Array.from(new Set(groupProducts.map(p => p.brand_name || 'UNBRANDED')));
                    const totalStock = groupProducts.reduce((sum, p) => sum + (p.stock_quantity || 0), 0);

                    return (
                      <div key={group.id} className="bg-surface border border-hairline rounded-lg overflow-hidden transition-all shadow-sm">
                        <div 
                          className="p-5 flex justify-between items-center cursor-pointer hover:bg-surface-soft transition-colors"
                          onClick={() => toggleMasterGroup(`g_${group.id}`)}
                          tabIndex={0}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              toggleMasterGroup(`g_${group.id}`);
                            }
                          }}
                        >
                          <div className="flex items-center gap-4">
                            <div className={`p-2 rounded-md ${isExpanded ? 'bg-primary/10 text-primary' : 'bg-canvas border border-hairline text-muted'}`}>
                              {isExpanded ? <ChevronDown className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}
                            </div>
                            <div>
                              <h3 className="font-bold text-lg text-ink uppercase tracking-wider">{group.name}</h3>
                              <p className="text-muted text-sm mt-0.5">
                                <span className="font-medium text-ink">{brandsInGroup.length}</span> Brands • <span className="font-medium text-ink">{groupProducts.length}</span> Items
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-6">
                            <div className="text-right">
                              <p className="text-xs text-muted uppercase font-bold tracking-wider mb-0.5">Total Stock</p>
                              <p className="text-xl font-display font-medium text-ink">{totalStock}</p>
                            </div>
                            <div className="flex items-center gap-1">
                              <button 
                                onClick={(e) => { e.stopPropagation(); openEditGroup(group); }}
                                className="p-2 text-muted hover:text-ink hover:bg-surface-soft rounded-md transition-colors"
                                title="Edit Group Name"
                              >
                                <Edit2 className="w-4 h-4" />
                              </button>
                              <button 
                                onClick={(e) => { e.stopPropagation(); handleDeleteGroup(group.id, group.name); }}
                                className="p-2 text-muted hover:text-signature-coral hover:bg-signature-coral/10 rounded-md transition-colors"
                                title="Delete Group"
                              >
                                <Trash2 className="w-5 h-5" />
                              </button>
                            </div>
                          </div>
                        </div>
                        
                        {isExpanded && (
                          <div className="border-t border-hairline bg-canvas p-4 space-y-3">
                            {brandsInGroup.length === 0 && groupProducts.length === 0 ? (
                              <p className="text-center text-muted py-4">No products in this group.</p>
                            ) : brandsInGroup.map(brandName => {
                              const brandProducts = groupProducts.filter(p => (p.brand_name || 'UNBRANDED') === brandName);
                              const isBrandExpanded = expandedMasterGroups[`g_${group.id}_b_${brandName}`];
                              const brandStock = brandProducts.reduce((sum, p) => sum + (p.stock_quantity || 0), 0);
                              
                              return (
                                <div key={brandName} className="border border-hairline rounded-lg overflow-hidden">
                                  <div 
                                    className="p-3 bg-surface-soft flex justify-between items-center cursor-pointer hover:bg-surface transition-colors"
                                    onClick={() => toggleMasterGroup(`g_${group.id}_b_${brandName}`)}
                                    tabIndex={0}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter' || e.key === ' ') {
                                        e.preventDefault();
                                        toggleMasterGroup(`g_${group.id}_b_${brandName}`);
                                      }
                                    }}
                                  >
                                    <div className="flex items-center gap-3">
                                      {isBrandExpanded ? <ChevronDown className="w-4 h-4 text-ink" /> : <ChevronRight className="w-4 h-4 text-muted" />}
                                      <span className="font-semibold text-ink">{brandName}</span>
                                      <span className="text-xs bg-canvas px-2 py-0.5 rounded-full text-muted border border-hairline">{brandProducts.length} Items</span>
                                    </div>
                                    <div className="font-medium text-ink pr-4">{brandStock} in stock</div>
                                  </div>
                                  
                                  {isBrandExpanded && (
                                    <div className="p-2">
                                      <table className="w-full text-left text-sm">
                                        <thead className="text-xs text-muted font-medium uppercase tracking-wider">
                                          <tr>
                                            <th className="px-4 py-2">Item Name</th>
                                            <th className="px-4 py-2">HSN</th>
                                            <th className="px-4 py-2">Model</th>
                                            <th className="px-4 py-2">Unit</th>
                                            <th className="px-4 py-2 text-right">Stock</th>
                                            <th className="px-4 py-2 text-right">Purchase (₹)</th>
                                            <th className="px-4 py-2 text-right">Selling (₹)</th>
                                            <th className="px-4 py-2"></th>
                                          </tr>
                                        </thead>
                                        <tbody className="divide-y divide-hairline">
                                          {brandProducts.map(p => (
                                            <tr key={p.id} className="hover:bg-surface-soft transition-colors group/item focus-within:bg-surface-soft focus-within:outline-none focus:bg-surface-soft focus:outline-none" tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter') openEditModal(p); }}>
                                              <td className="px-4 py-2.5 font-medium text-ink">{p.name}</td>
                                              <td className="px-4 py-2.5 text-muted">{p.hsn_code || '-'}</td>
                                              <td className="px-4 py-2.5 text-muted">{p.model || '-'}</td>
                                              <td className="px-4 py-2.5 text-muted">{p.unit}</td>
                                              <td className="px-4 py-2.5 text-right">
                                                <span className={p.stock_quantity <= p.min_stock ? 'text-signature-coral font-medium' : 'text-ink font-medium'}>
                                                  {p.stock_quantity}
                                                </span>
                                              </td>
                                              <td className="px-4 py-2.5 text-right text-muted">₹{p.purchase_price?.toFixed(2) || '0.00'}</td>
                                              <td className="px-4 py-2.5 text-right font-medium text-ink">₹{p.selling_price?.toFixed(2) || '0.00'}</td>
                                              <td className="px-4 py-2.5 text-right opacity-0 group-hover/item:opacity-100 transition-opacity">
                                                <button onClick={() => openEditModal(p)} className="text-primary hover:text-primary-active p-1"><Edit2 className="w-3.5 h-3.5" /></button>
                                              </td>
                                            </tr>
                                          ))}
                                        </tbody>
                                      </table>
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {itemGroups.length === 0 && (
                    <div className="text-center py-12 text-muted">No groups created yet. Click "Add Group" to create one.</div>
                  )}
                </div>
              )}

              {viewMode === 'brands' && (
                <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-canvas min-h-[500px]">
                  {brands.filter(b => b.name.toLowerCase().includes(search.toLowerCase())).map(brand => {
                    const brandProducts = products.filter(p => p.brand_id === brand.id);
                    const isExpanded = expandedMasterGroups[`b_${brand.id}`];
                    const groupsInBrand = Array.from(new Set(brandProducts.map(p => p.group_name || 'UNGROUPED')));
                    const totalStock = brandProducts.reduce((sum, p) => sum + (p.stock_quantity || 0), 0);

                    return (
                      <div key={brand.id} className="bg-surface border border-hairline rounded-lg overflow-hidden transition-all shadow-sm">
                        <div 
                          className="p-5 flex justify-between items-center cursor-pointer hover:bg-surface-soft transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-inset"
                          onClick={() => toggleMasterGroup(`b_${brand.id}`)}
                          tabIndex={0}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              toggleMasterGroup(`b_${brand.id}`);
                            }
                          }}
                        >
                          <div className="flex items-center gap-4">
                            <div className={`p-2 rounded-md ${isExpanded ? 'bg-primary/10 text-primary' : 'bg-canvas border border-hairline text-muted'}`}>
                              {isExpanded ? <ChevronDown className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}
                            </div>
                            <div>
                              <h3 className="font-bold text-lg text-ink uppercase tracking-wider">{brand.name}</h3>
                              <p className="text-muted text-sm mt-0.5">
                                <span className="font-medium text-ink">{groupsInBrand.length}</span> Groups • <span className="font-medium text-ink">{brandProducts.length}</span> Items
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-6">
                            <div className="text-right">
                              <p className="text-xs text-muted uppercase font-bold tracking-wider mb-0.5">Total Stock</p>
                              <p className="text-xl font-display font-medium text-ink">{totalStock}</p>
                            </div>
                            <div className="flex items-center gap-1">
                              <button 
                                onClick={(e) => { e.stopPropagation(); openEditBrand(brand); }}
                                className="p-2 text-muted hover:text-ink hover:bg-surface-soft rounded-md transition-colors"
                                title="Edit Brand Name"
                              >
                                <Edit2 className="w-4 h-4" />
                              </button>
                              <button 
                                onClick={(e) => { e.stopPropagation(); handleDeleteBrand(brand.id, brand.name); }}
                                className="p-2 text-muted hover:text-signature-coral hover:bg-signature-coral/10 rounded-md transition-colors"
                                title="Delete Brand"
                              >
                                <Trash2 className="w-5 h-5" />
                              </button>
                            </div>
                          </div>
                        </div>
                        
                        {isExpanded && (
                          <div className="border-t border-hairline bg-canvas p-4 space-y-3">
                            {groupsInBrand.length === 0 && brandProducts.length === 0 ? (
                              <p className="text-center text-muted py-4">No products in this brand.</p>
                            ) : groupsInBrand.map(groupName => {
                              const groupProducts = brandProducts.filter(p => (p.group_name || 'UNGROUPED') === groupName);
                              const isGroupExpanded = expandedMasterGroups[`b_${brand.id}_g_${groupName}`];
                              const groupStock = groupProducts.reduce((sum, p) => sum + (p.stock_quantity || 0), 0);
                              
                              return (
                                <div key={groupName} className="border border-hairline rounded-lg overflow-hidden">
                                  <div 
                                    className="p-3 bg-surface-soft flex justify-between items-center cursor-pointer hover:bg-surface transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-inset"
                                    onClick={() => toggleMasterGroup(`b_${brand.id}_g_${groupName}`)}
                                    tabIndex={0}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter' || e.key === ' ') {
                                        e.preventDefault();
                                        toggleMasterGroup(`b_${brand.id}_g_${groupName}`);
                                      }
                                    }}
                                  >
                                    <div className="flex items-center gap-3">
                                      {isGroupExpanded ? <ChevronDown className="w-4 h-4 text-ink" /> : <ChevronRight className="w-4 h-4 text-muted" />}
                                      <span className="font-semibold text-ink">{groupName}</span>
                                      <span className="text-xs bg-canvas px-2 py-0.5 rounded-full text-muted border border-hairline">{groupProducts.length} Items</span>
                                    </div>
                                    <div className="font-medium text-ink pr-4">{groupStock} in stock</div>
                                  </div>
                                  
                                  {isGroupExpanded && (
                                    <div className="p-2">
                                      <table className="w-full text-left text-sm">
                                        <thead className="text-xs text-muted font-medium uppercase tracking-wider">
                                          <tr>
                                            <th className="px-4 py-2">Item Name</th>
                                            <th className="px-4 py-2">HSN</th>
                                            <th className="px-4 py-2">Model</th>
                                            <th className="px-4 py-2">Unit</th>
                                            <th className="px-4 py-2 text-right">Stock</th>
                                            <th className="px-4 py-2 text-right">Purchase (₹)</th>
                                            <th className="px-4 py-2 text-right">Selling (₹)</th>
                                            <th className="px-4 py-2"></th>
                                          </tr>
                                        </thead>
                                        <tbody className="divide-y divide-hairline">
                                          {groupProducts.map(p => (
                                            <tr key={p.id} className="hover:bg-surface-soft transition-colors group/item focus-within:bg-surface-soft focus-within:outline-none focus:bg-surface-soft focus:outline-none" tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter') openEditModal(p); }}>
                                              <td className="px-4 py-2.5 font-medium text-ink">{p.name}</td>
                                              <td className="px-4 py-2.5 text-muted">{p.hsn_code || '-'}</td>
                                              <td className="px-4 py-2.5 text-muted">{p.model || '-'}</td>
                                              <td className="px-4 py-2.5 text-muted">{p.unit}</td>
                                              <td className="px-4 py-2.5 text-right">
                                                <span className={p.stock_quantity <= p.min_stock ? 'text-signature-coral font-medium' : 'text-ink font-medium'}>
                                                  {p.stock_quantity}
                                                </span>
                                              </td>
                                              <td className="px-4 py-2.5 text-right text-muted">₹{p.purchase_price?.toFixed(2) || '0.00'}</td>
                                              <td className="px-4 py-2.5 text-right font-medium text-ink">₹{p.selling_price?.toFixed(2) || '0.00'}</td>
                                              <td className="px-4 py-2.5 text-right opacity-0 group-hover/item:opacity-100 transition-opacity">
                                                <button onClick={() => openEditModal(p)} className="text-primary hover:text-primary-active p-1"><Edit2 className="w-3.5 h-3.5" /></button>
                                              </td>
                                            </tr>
                                          ))}
                                        </tbody>
                                      </table>
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {brands.length === 0 && (
                    <div className="text-center py-12 text-muted">No brands created yet. Click "Add Brand" to create one.</div>
                  )}
                </div>
              )}
            </>
          )}

        </div>
      </div>

      {/* ========================================================================= */}
      {/* MODALS */}
      {/* ========================================================================= */}

      {/* 1. ADD / EDIT PRODUCT MODAL */}
      {isModalOpen && (
        <div className="absolute inset-0 bg-ink/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-canvas rounded-xl shadow-2xl w-full max-w-3xl overflow-hidden border border-hairline flex flex-col max-h-[90vh]">
            <div className="px-6 py-4 border-b border-hairline flex justify-between items-center bg-surface-soft flex-shrink-0">
              <h2 className="text-lg font-bold text-ink">{editProductId ? 'Edit Product' : 'Add New Product'}</h2>
              <button onClick={() => { setIsModalOpen(false); resetForm(); }} className="text-muted hover:text-ink transition-colors p-1 rounded-md hover:bg-surface">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <form ref={productFormRef} onSubmit={handleAddProduct} onKeyDown={handleFormKeyDown} className="flex flex-col flex-1 overflow-hidden">
              <div className="p-6 overflow-y-auto flex-1 flex flex-col gap-5">
                
                {/* Row 1: Item Name & Model / Spec */}
                <div className="grid grid-cols-12 gap-4">
                  <div className="col-span-7">
                    <label className="block text-xs font-semibold text-muted uppercase tracking-wider mb-1.5">
                      Item Name <span className="text-signature-coral">*</span>
                    </label>
                    <input 
                      autoFocus 
                      required 
                      type="text" 
                      value={name} 
                      onChange={e => setName(e.target.value)} 
                      className="w-full px-3.5 py-2 bg-canvas border border-hairline rounded-md focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 transition-all text-ink text-sm font-medium" 
                      placeholder="e.g. Havells Fan 1200mm" 
                    />
                  </div>
                  <div className="col-span-5">
                    <label className="block text-xs font-semibold text-muted uppercase tracking-wider mb-1.5">
                      Model / Spec
                    </label>
                    <input 
                      type="text" 
                      value={model} 
                      onChange={e => setModel(e.target.value)} 
                      className="w-full px-3.5 py-2 bg-canvas border border-hairline rounded-md focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 transition-all text-ink text-sm" 
                      placeholder="e.g. 1200mm White" 
                    />
                  </div>
                </div>

                {/* Row 2: Group, Brand, HSN Code, Unit (4 Balanced Columns) */}
                <div className="grid grid-cols-4 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-muted uppercase tracking-wider mb-1.5">
                      Group <span className="text-signature-coral">*</span>
                    </label>
                    <select 
                      required 
                      value={groupId || ''} 
                      onChange={e => setGroupId(Number(e.target.value) || null)} 
                      className="w-full px-3 py-2 bg-canvas border border-hairline rounded-md focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 transition-all text-ink text-sm"
                    >
                      <option value="">Select Group</option>
                      {itemGroups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-muted uppercase tracking-wider mb-1.5">
                      Brand
                    </label>
                    <select 
                      value={brandId || ''} 
                      onChange={e => setBrandId(Number(e.target.value) || null)} 
                      className="w-full px-3 py-2 bg-canvas border border-hairline rounded-md focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 transition-all text-ink text-sm"
                    >
                      <option value="">None</option>
                      {brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-muted uppercase tracking-wider mb-1.5">
                      HSN Code
                    </label>
                    <input 
                      type="text" 
                      value={hsn} 
                      onChange={e => setHsn(e.target.value)} 
                      className="w-full px-3.5 py-2 bg-canvas border border-hairline rounded-md focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 transition-all text-ink text-sm" 
                      placeholder="e.g. 8414" 
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-muted uppercase tracking-wider mb-1.5">
                      Unit
                    </label>
                    <select 
                      value={unit} 
                      onChange={e => setUnit(e.target.value)} 
                      className="w-full px-3 py-2 bg-canvas border border-hairline rounded-md focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 transition-all text-ink text-sm"
                    >
                      {unitOptions.map(u => <option key={u} value={u}>{u}</option>)}
                    </select>
                  </div>
                </div>

                {/* Row 3: Pricing & Stock (5 Columns with clean no-wrap labels) */}
                <div className="grid grid-cols-5 gap-3.5">
                  <div>
                    <label className="block text-[11px] font-semibold text-muted uppercase tracking-wider mb-1.5 whitespace-nowrap">
                      Purchase (₹) <span className="text-signature-coral">*</span>
                    </label>
                    <input 
                      required 
                      type="number" 
                      step="0.01" 
                      min="0" 
                      value={purchasePrice} 
                      onChange={e => setPurchasePrice(e.target.value)} 
                      className="w-full px-3 py-2 bg-canvas border border-hairline rounded-md focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 transition-all text-ink text-sm" 
                      placeholder="0.00" 
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-muted uppercase tracking-wider mb-1.5 whitespace-nowrap">
                      Selling (₹) <span className="text-signature-coral">*</span>
                    </label>
                    <input 
                      required 
                      type="number" 
                      step="0.01" 
                      min="0" 
                      value={sellingPrice} 
                      onChange={e => setSellingPrice(e.target.value)} 
                      className="w-full px-3 py-2 bg-canvas border border-hairline rounded-md focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 transition-all text-ink text-sm font-semibold" 
                      placeholder="0.00" 
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-muted uppercase tracking-wider mb-1.5 whitespace-nowrap">
                      MRP (₹)
                    </label>
                    <input 
                      type="number" 
                      step="0.01" 
                      min="0" 
                      value={mrp} 
                      onChange={e => setMrp(e.target.value)} 
                      className="w-full px-3 py-2 bg-canvas border border-hairline rounded-md focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 transition-all text-ink text-sm" 
                      placeholder="0.00" 
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-muted uppercase tracking-wider mb-1.5 whitespace-nowrap">
                      Stock Qty <span className="text-signature-coral">*</span>
                    </label>
                    <input 
                      required 
                      type="number" 
                      min="0" 
                      value={stock} 
                      onChange={e => setStock(e.target.value)} 
                      className="w-full px-3 py-2 bg-canvas border border-hairline rounded-md focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 transition-all text-ink text-sm" 
                      placeholder="0" 
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-muted uppercase tracking-wider mb-1.5 whitespace-nowrap" title="Units below this trigger low stock warning">
                      Min Alert
                    </label>
                    <input 
                      type="number" 
                      min="0" 
                      value={minStock} 
                      onChange={e => setMinStock(e.target.value)} 
                      className="w-full px-3 py-2 bg-canvas border border-hairline rounded-md focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 transition-all text-ink text-sm" 
                      placeholder="0" 
                    />
                  </div>
                </div>

                {/* GST Rate Configuration */}
                <div className="bg-surface-soft p-4 rounded-lg border border-hairline">
                  <div className="flex flex-wrap items-center justify-between gap-3 mb-2.5">
                    <label className="block text-xs font-bold text-ink uppercase tracking-wider">
                      GST Rate (%)
                    </label>
                    <div className="flex items-center gap-2">
                      <span className="text-xs px-2.5 py-1 bg-surface border border-hairline rounded text-muted font-medium">
                        CGST: <strong className="text-ink">{cgstPercentage}%</strong>
                      </span>
                      <span className="text-xs px-2.5 py-1 bg-surface border border-hairline rounded text-muted font-medium">
                        SGST: <strong className="text-ink">{sgstPercentage}%</strong>
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {[0, 5, 12, 18, 28].map(rate => (
                      <button
                        key={rate}
                        type="button"
                        onClick={() => handleGstPreset(rate)}
                        className={`px-3 py-1.5 rounded text-xs font-semibold border transition-colors ${
                          gstPercentage === rate.toString()
                            ? 'bg-primary text-on-primary border-primary'
                            : 'bg-canvas text-ink border-hairline hover:bg-surface'
                        }`}
                      >
                        {rate === 0 ? '0% (Exempt)' : `${rate}%`}
                      </button>
                    ))}
                    <div className="flex items-center gap-1.5 ml-auto">
                      <span className="text-xs text-muted">Custom %:</span>
                      <input
                        type="number"
                        step="0.1"
                        min="0"
                        max="100"
                        value={gstPercentage}
                        onChange={e => handleCustomGstChange(e.target.value)}
                        className="w-20 px-2.5 py-1.5 bg-canvas border border-hairline rounded text-xs font-semibold text-ink focus:outline-none focus:border-ink text-center"
                        placeholder="18"
                      />
                    </div>
                  </div>
                </div>

                {/* Storage Location for Opening Stock (Only for New Products) */}
                {!editProductId && warehouses.length > 0 && (
                  <div className="border-t border-hairline pt-4 bg-surface-soft p-4 rounded-lg border border-hairline">
                    <label className="block text-xs font-bold text-ink uppercase tracking-wider mb-2 flex items-center gap-1.5">
                      <WarehouseIcon className="w-4 h-4 text-primary" />
                      <span>Store Initial Stock At:</span>
                    </label>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <label className={`flex items-center gap-2 p-3 rounded-md border cursor-pointer transition-all ${targetWarehouseId === null ? 'border-primary bg-primary/10 text-primary font-semibold' : 'border-hairline bg-canvas text-ink'}`}>
                        <input
                          type="radio"
                          name="targetLocation"
                          checked={targetWarehouseId === null}
                          onChange={() => setTargetWarehouseId(null)}
                          className="accent-primary"
                        />
                        <div>
                          <span className="text-sm block font-medium">🏪 Main Shop Floor</span>
                          <span className="text-[11px] text-muted block">Directly sellable at POS</span>
                        </div>
                      </label>

                      <div className="flex flex-col justify-center">
                        <select
                          value={targetWarehouseId || ''}
                          onChange={e => setTargetWarehouseId(Number(e.target.value) || null)}
                          className={`p-2.5 rounded-md border text-sm text-ink bg-canvas focus:outline-none focus:border-ink ${targetWarehouseId !== null ? 'border-emerald-500 font-semibold text-emerald-800' : 'border-hairline'}`}
                        >
                          <option value="">🏢 Or Select Godown / Warehouse...</option>
                          {warehouses.map(w => (
                            <option key={w.id} value={w.id}>
                              🏢 {w.name} {w.location ? `(${w.location})` : ''}
                            </option>
                          ))}
                        </select>
                        <span className="text-[11px] text-muted mt-1 px-1">Initial stock will be deposited directly into this godown</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
              <div className="p-6 border-t border-hairline flex justify-between items-center bg-canvas flex-shrink-0">
                <div>
                  {editProductId && (
                    <button
                      type="button"
                      onClick={() => {
                        const prod = products.find(p => p.id === editProductId);
                        if (prod) handleDeleteProduct(prod);
                      }}
                      className="px-3.5 py-2 text-signature-coral hover:bg-signature-coral/10 border border-signature-coral/30 rounded-lg font-medium text-sm transition-colors flex items-center gap-1.5"
                    >
                      <Trash2 className="w-4 h-4" />
                      <span>Delete Product</span>
                    </button>
                  )}
                </div>
                <div className="flex gap-3">
                  <button type="button" onClick={() => { setIsModalOpen(false); resetForm(); }} className="px-4 py-2 text-ink font-medium bg-canvas border border-hairline hover:bg-surface-soft rounded-lg transition-colors text-sm">Cancel</button>
                  <button type="submit" className="px-6 py-2 bg-primary hover:bg-primary-active text-on-primary font-medium rounded-lg transition-colors text-sm">{editProductId ? 'Save Changes (Ctrl+S)' : 'Save Product (Ctrl+S)'}</button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 2. ADD ITEM GROUP MODAL */}
      {addMasterModal === 'group' && (
        <div className="fixed inset-0 bg-ink/50 backdrop-blur-sm z-50 flex items-center justify-center">
          <div className="bg-canvas rounded-xl shadow-2xl w-full max-w-sm border border-hairline overflow-hidden">
            <div className="p-5 border-b border-hairline flex justify-between items-center bg-surface">
              <h2 className="text-xl font-display font-medium text-ink">Add Item Group</h2>
              <button onClick={() => setAddMasterModal(null)} className="text-muted hover:text-ink"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={(e) => { handleAddGroup(e); setAddMasterModal(null); }} onKeyDown={handleFormKeyDown} className="p-5">
              <label className="block text-sm font-bold text-ink mb-1.5 uppercase tracking-wider">Group Name</label>
              <input autoFocus required type="text" value={newGroupName} onChange={e => setNewGroupName(e.target.value)} className="w-full p-2.5 bg-surface border border-hairline rounded-md focus:border-ink focus:outline-none transition-colors mb-6" placeholder="e.g. FANS" />
              
              <div className="flex justify-end gap-3">
                <button type="button" onClick={() => setAddMasterModal(null)} className="px-4 py-2 font-bold text-muted hover:bg-surface rounded-md">Cancel</button>
                <button type="submit" className="px-4 py-2 bg-primary hover:bg-primary-active text-on-primary font-bold rounded-md">Save</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 3. ADD BRAND MODAL */}
      {addMasterModal === 'brand' && (
        <div className="fixed inset-0 bg-ink/50 backdrop-blur-sm z-50 flex items-center justify-center">
          <div className="bg-canvas rounded-xl shadow-2xl w-full max-w-sm border border-hairline overflow-hidden">
            <div className="p-5 border-b border-hairline flex justify-between items-center bg-surface">
              <h2 className="text-xl font-display font-medium text-ink">Add Brand</h2>
              <button onClick={() => setAddMasterModal(null)} className="text-muted hover:text-ink"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={(e) => { handleAddBrand(e); setAddMasterModal(null); }} onKeyDown={handleFormKeyDown} className="p-5">
              <label className="block text-sm font-bold text-ink mb-1.5 uppercase tracking-wider">Brand Name</label>
              <input autoFocus required type="text" value={newBrandName} onChange={e => setNewBrandName(e.target.value)} className="w-full p-2.5 bg-surface border border-hairline rounded-md focus:border-ink focus:outline-none transition-colors mb-6" placeholder="e.g. HAVELLS" />
              
              <div className="flex justify-end gap-3">
                <button type="button" onClick={() => setAddMasterModal(null)} className="px-4 py-2 font-bold text-muted hover:bg-surface rounded-md">Cancel</button>
                <button type="submit" className="px-4 py-2 bg-primary hover:bg-primary-active text-on-primary font-bold rounded-md">Save</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 3B. EDIT MASTER MODAL (Group / Brand Renaming) */}
      {editMasterModal && (
        <div className="fixed inset-0 bg-ink/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-canvas rounded-xl shadow-2xl w-full max-w-sm border border-hairline overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="p-5 border-b border-hairline flex justify-between items-center bg-surface">
              <h2 className="text-xl font-display font-medium text-ink">
                Edit {editMasterModal.type === 'group' ? 'Item Group' : 'Brand'}
              </h2>
              <button onClick={() => setEditMasterModal(null)} className="text-muted hover:text-ink">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleUpdateMaster} onKeyDown={handleFormKeyDown} className="p-5">
              <label className="block text-xs font-bold text-ink mb-1.5 uppercase tracking-wider">
                {editMasterModal.type === 'group' ? 'Group Name' : 'Brand Name'} *
              </label>
              <input
                autoFocus
                required
                type="text"
                value={editMasterName}
                onChange={e => setEditMasterName(e.target.value)}
                className="w-full p-2.5 bg-surface border border-hairline rounded-md focus:border-ink focus:outline-none transition-colors text-sm mb-6"
              />
              <div className="flex justify-end gap-3">
                <button type="button" onClick={() => setEditMasterModal(null)} className="px-4 py-2 font-bold text-muted hover:bg-surface rounded-md text-sm">Cancel</button>
                <button type="submit" className="px-4 py-2 bg-primary hover:bg-primary-active text-on-primary font-bold rounded-md text-sm">Save Changes</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 3C. STOCK MOVEMENT & TRANSFER HISTORY MODAL */}
      {isHistoryOpen && (
        <div className="fixed inset-0 bg-ink/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-canvas rounded-xl shadow-2xl w-full max-w-3xl border border-hairline overflow-hidden flex flex-col max-h-[85vh] animate-in fade-in zoom-in duration-200">
            <div className="p-5 border-b border-hairline flex justify-between items-center bg-surface flex-shrink-0">
              <div>
                <h2 className="text-xl font-display font-medium text-ink flex items-center gap-2">
                  <History className="w-5 h-5 text-primary" />
                  <span>Stock Transfer & Movement History</span>
                </h2>
                <p className="text-xs text-muted mt-0.5">Audit log of stock transfers between shop floor and storage godowns.</p>
              </div>
              <button onClick={() => setIsHistoryOpen(false)} className="text-muted hover:text-ink p-1">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 overflow-y-auto flex-1">
              {stockMovements.length === 0 ? (
                <div className="text-center py-12 text-muted">
                  <History className="w-10 h-10 mx-auto mb-2 opacity-30" />
                  <p className="font-semibold text-sm">No stock movements recorded yet</p>
                  <p className="text-xs text-muted mt-1">Transfers between shop and godowns will appear here automatically.</p>
                </div>
              ) : (
                <table className="w-full text-left border-collapse text-sm">
                  <thead>
                    <tr className="bg-surface-soft border-b border-hairline text-xs font-semibold text-muted uppercase tracking-wider sticky top-0">
                      <th className="px-4 py-3">Date</th>
                      <th className="px-4 py-3">Product</th>
                      <th className="px-4 py-3">Movement Route</th>
                      <th className="px-4 py-3 text-right">Qty</th>
                      <th className="px-4 py-3">Notes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-hairline">
                    {stockMovements.map(m => (
                      <tr key={m.id} className="hover:bg-surface-soft transition-colors">
                        <td className="px-4 py-3 text-xs text-muted whitespace-nowrap">
                          {new Date(m.date).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' })}
                        </td>
                        <td className="px-4 py-3 font-medium text-ink">
                          {m.product_name || `Product #${m.product_id}`}
                        </td>
                        <td className="px-4 py-3 text-xs">
                          <span className="font-medium text-ink">{m.from_location_name}</span>
                          <span className="mx-1.5 text-primary font-bold">➔</span>
                          <span className="font-medium text-ink">{m.to_location_name}</span>
                        </td>
                        <td className="px-4 py-3 text-right font-bold text-ink">
                          <span className="px-2 py-0.5 rounded bg-primary/10 text-primary">
                            {m.quantity}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-xs text-muted">
                          {m.notes || '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div className="p-4 border-t border-hairline flex justify-end bg-surface flex-shrink-0">
              <button
                onClick={() => setIsHistoryOpen(false)}
                className="px-5 py-2 bg-surface hover:bg-surface-soft border border-hairline rounded-lg text-sm font-semibold text-ink"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 4. CREATE / EDIT WAREHOUSE MODAL */}
      {isWarehouseModalOpen && (
        <div className="fixed inset-0 bg-ink/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-canvas rounded-xl shadow-2xl w-full max-w-md border border-hairline overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="p-5 border-b border-hairline flex justify-between items-center bg-surface">
              <h2 className="text-xl font-display font-medium text-ink flex items-center gap-2">
                <WarehouseIcon className="w-5 h-5 text-primary" />
                {editWarehouseId ? 'Edit Warehouse' : 'Add New Warehouse'}
              </h2>
              <button onClick={() => setIsWarehouseModalOpen(false)} className="text-muted hover:text-ink">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSaveWarehouse} onKeyDown={handleFormKeyDown} className="p-6 flex flex-col gap-4">
              <div>
                <label className="block text-xs font-bold text-ink uppercase tracking-wider mb-1.5">Warehouse / Godown Name *</label>
                <input
                  autoFocus
                  required
                  type="text"
                  value={whName}
                  onChange={e => setWhName(e.target.value)}
                  className="w-full px-3 py-2 bg-surface border border-hairline rounded-md focus:border-ink focus:outline-none transition-colors text-ink text-sm"
                  placeholder="e.g. Main Godown, Basement Storage"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-ink uppercase tracking-wider mb-1.5">Location / Address</label>
                <input
                  type="text"
                  value={whLocation}
                  onChange={e => setWhLocation(e.target.value)}
                  className="w-full px-3 py-2 bg-surface border border-hairline rounded-md focus:border-ink focus:outline-none transition-colors text-ink text-sm"
                  placeholder="e.g. Plot 12, Industrial Area"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-ink uppercase tracking-wider mb-1.5">Contact Phone</label>
                <input
                  type="text"
                  value={whPhone}
                  onChange={e => setWhPhone(e.target.value)}
                  className="w-full px-3 py-2 bg-surface border border-hairline rounded-md focus:border-ink focus:outline-none transition-colors text-ink text-sm"
                  placeholder="e.g. 9876543210"
                />
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-hairline mt-2">
                <button
                  type="button"
                  onClick={() => setIsWarehouseModalOpen(false)}
                  className="px-4 py-2 font-bold text-muted hover:bg-surface rounded-md text-sm"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-primary hover:bg-primary-active text-on-primary font-bold rounded-md text-sm transition-colors"
                >
                  {editWarehouseId ? 'Save Changes' : 'Create Warehouse'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 5. ADD STOCK DIRECTLY TO GODOWN MODAL (Independent Stock Deposit) */}
      {isWhAddStockOpen && selectedWarehouse && (
        <div className="fixed inset-0 bg-ink/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-canvas rounded-xl shadow-2xl w-full max-w-md border border-hairline overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="p-5 border-b border-hairline flex justify-between items-center bg-surface">
              <h2 className="text-xl font-display font-medium text-ink flex items-center gap-2">
                <Plus className="w-5 h-5 text-emerald-600" />
                Add Stock to {selectedWarehouse.name}
              </h2>
              <button onClick={() => setIsWhAddStockOpen(false)} className="text-muted hover:text-ink">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleWhAddStock} onKeyDown={handleFormKeyDown} className="p-6 flex flex-col gap-4">
              <div>
                <label className="block text-xs font-bold text-ink uppercase tracking-wider mb-1.5">Product to Inward *</label>
                <select
                  required
                  value={whAddProductId}
                  onChange={e => setWhAddProductId(Number(e.target.value) || '')}
                  className="w-full px-3 py-2 bg-surface border border-hairline rounded-md text-sm text-ink focus:outline-none focus:border-ink font-medium"
                >
                  <option value="">Select Product...</option>
                  {products.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.name} {p.model ? `(${p.model})` : ''} - Current Stock: {p.stock_quantity} {p.unit}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-ink uppercase tracking-wider mb-1.5">Quantity to Add *</label>
                <input
                  required
                  type="number"
                  min="1"
                  value={whAddQty}
                  onChange={e => setWhAddQty(e.target.value)}
                  className="w-full px-3 py-2 bg-surface border border-hairline rounded-md text-sm text-ink font-semibold focus:outline-none focus:border-ink"
                  placeholder="1"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-ink uppercase tracking-wider mb-1.5">Notes / Supplier Details (Optional)</label>
                <input
                  type="text"
                  value={whAddNotes}
                  onChange={e => setWhAddNotes(e.target.value)}
                  className="w-full px-3 py-2 bg-surface border border-hairline rounded-md text-sm text-ink focus:outline-none focus:border-ink"
                  placeholder="e.g. Direct inward from distributor / new consignment"
                />
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-hairline mt-2">
                <button
                  type="button"
                  onClick={() => setIsWhAddStockOpen(false)}
                  className="px-4 py-2 font-bold text-muted hover:bg-surface rounded-md text-sm"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isAddingStock}
                  className="px-6 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 disabled:text-slate-500 text-white font-bold rounded-md text-sm transition-colors flex items-center gap-1.5 shadow-sm"
                >
                  <Plus className="w-4 h-4" />
                  {isAddingStock ? 'Adding Stock...' : 'Add Stock to Godown'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 6. TRANSFER STOCK MODAL (Between Godown and Shop) */}
      {isWhTransferOpen && (
        <div className="fixed inset-0 bg-ink/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-canvas rounded-xl shadow-2xl w-full max-w-lg border border-hairline overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="p-5 border-b border-hairline flex justify-between items-center bg-surface">
              <h2 className="text-xl font-display font-medium text-ink flex items-center gap-2">
                <ArrowLeftRight className="w-5 h-5 text-primary" />
                Transfer Stock
              </h2>
              <button onClick={() => setIsWhTransferOpen(false)} className="text-muted hover:text-ink">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleWhTransfer} onKeyDown={handleFormKeyDown} className="p-6 flex flex-col gap-4">
              
              {/* Direction Toggle */}
              <div>
                <label className="block text-xs font-bold text-ink uppercase tracking-wider mb-2">Transfer Direction</label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setTransferDirection('to_shop')}
                    className={`p-3 rounded-lg border text-sm font-semibold flex flex-col items-center justify-center gap-1 transition-all ${
                      transferDirection === 'to_shop' 
                        ? 'border-primary bg-primary/10 text-primary ring-1 ring-primary' 
                        : 'border-hairline bg-surface text-muted hover:text-ink'
                    }`}
                  >
                    <span>🏢 Godown ➔ 📦 Main Inventory</span>
                    <span className="text-xs font-normal opacity-75">Transfer to Main Inventory</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setTransferDirection('from_shop')}
                    className={`p-3 rounded-lg border text-sm font-semibold flex flex-col items-center justify-center gap-1 transition-all ${
                      transferDirection === 'from_shop' 
                        ? 'border-primary bg-primary/10 text-primary ring-1 ring-primary' 
                        : 'border-hairline bg-surface text-muted hover:text-ink'
                    }`}
                  >
                    <span>📦 Main Inventory ➔ 🏢 Godown</span>
                    <span className="text-xs font-normal opacity-75">Transfer to Warehouse Storage</span>
                  </button>
                </div>
              </div>

              {/* Warehouse selector (if not inside warehouse view) */}
              <div>
                <label className="block text-xs font-bold text-ink uppercase tracking-wider mb-1.5">Target Godown / Warehouse</label>
                {selectedWarehouse ? (
                  <div className="px-3 py-2 bg-surface border border-hairline rounded text-sm font-semibold text-ink">
                    🏢 {selectedWarehouse.name} {selectedWarehouse.location && `(${selectedWarehouse.location})`}
                  </div>
                ) : (
                  <select
                    required
                    value={transferWarehouseId}
                    onChange={e => {
                      const id = Number(e.target.value) || '';
                      setTransferWarehouseId(id);
                      if (id) loadTransferWhStock(Number(id));
                    }}
                    className="w-full px-3 py-2 bg-surface border border-hairline rounded text-sm text-ink focus:outline-none focus:border-ink font-medium"
                  >
                    <option value="">Select Godown...</option>
                    {warehouses.map(w => (
                      <option key={w.id} value={w.id}>🏢 {w.name} {w.location ? `(${w.location})` : ''}</option>
                    ))}
                  </select>
                )}
              </div>

              {/* Product selector */}
              <div>
                <label className="block text-xs font-bold text-ink uppercase tracking-wider mb-1.5">Product to Transfer *</label>
                <select
                  required
                  value={transferProductId}
                  onChange={e => setTransferProductId(Number(e.target.value) || '')}
                  className="w-full px-3 py-2 bg-surface border border-hairline rounded-md text-sm text-ink focus:outline-none focus:border-ink font-medium"
                >
                  <option value="">Select Product...</option>
                  {transferDirection === 'to_shop' ? (
                    (selectedWarehouse ? warehouseStock : transferWhStock).length > 0 ? (
                      (selectedWarehouse ? warehouseStock : transferWhStock).map(p => (
                        <option key={p.product_id} value={p.product_id}>
                          {p.name} {p.model ? `(${p.model})` : ''} - Godown Stock: {p.quantity} {p.unit}
                        </option>
                      ))
                    ) : (
                      <option disabled value="">No items currently stored in this godown</option>
                    )
                  ) : (
                    products.map(p => (
                      <option key={p.id} value={p.id}>
                        {p.name} {p.model ? `(${p.model})` : ''} - Shop Stock: {p.stock_quantity} {p.unit}
                      </option>
                    ))
                  )}
                </select>
              </div>

              {/* Quantity */}
              <div>
                <div className="flex justify-between items-center mb-1.5">
                  <label className="text-xs font-bold text-ink uppercase tracking-wider">Quantity to Transfer *</label>
                  {transferAvailableStock !== null && (
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded ${transferAvailableStock > 0 ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'}`}>
                      Available in Source: {transferAvailableStock}
                    </span>
                  )}
                </div>
                <input
                  required
                  type="number"
                  min="1"
                  max={transferAvailableStock !== null && transferAvailableStock > 0 ? transferAvailableStock : undefined}
                  value={transferQty}
                  onChange={e => setTransferQty(e.target.value)}
                  className="w-full px-3 py-2 bg-surface border border-hairline rounded-md text-sm text-ink font-semibold focus:outline-none focus:border-ink"
                  placeholder="1"
                />
              </div>

              {/* Notes */}
              <div>
                <label className="block text-xs font-bold text-ink uppercase tracking-wider mb-1.5">Notes (Optional)</label>
                <input
                  type="text"
                  value={transferNotes}
                  onChange={e => setTransferNotes(e.target.value)}
                  className="w-full px-3 py-2 bg-surface border border-hairline rounded-md text-sm text-ink focus:outline-none focus:border-ink"
                  placeholder="e.g. Front store replenishment"
                />
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-hairline mt-2">
                <button
                  type="button"
                  onClick={() => setIsWhTransferOpen(false)}
                  className="px-4 py-2 font-bold text-muted hover:bg-surface rounded-md text-sm"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isTransferring || (transferAvailableStock !== null && transferAvailableStock <= 0)}
                  className="px-6 py-2 bg-primary hover:bg-primary-active disabled:bg-slate-300 disabled:text-slate-500 disabled:cursor-not-allowed text-on-primary font-bold rounded-md text-sm transition-colors flex items-center gap-1.5 shadow-sm"
                >
                  <ArrowLeftRight className="w-4 h-4" />
                  {isTransferring ? 'Transferring...' : 'Confirm Transfer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
