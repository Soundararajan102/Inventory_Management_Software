import React, { useState, useEffect } from 'react';
import { Search, Plus, X, Edit2, ChevronDown, ChevronRight, Trash2 } from 'lucide-react';
import { getProducts, addProduct, updateProduct, getItemGroups, getBrands, addGroup, addBrand, deleteGroup, deleteBrand } from '../lib/db';
import type { Product, ItemGroup, Brand } from '../lib/db';
import { confirm } from '@tauri-apps/plugin-dialog';
import { handleFormKeyDown } from '../lib/keyboard';

export default function Inventory() {
  const [search, setSearch] = useState('');
  const [products, setProducts] = useState<Product[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editProductId, setEditProductId] = useState<number | null>(null);
  const [viewMode, setViewMode] = useState<'items' | 'groups' | 'brands'>('items');
  const [expandedMasterGroups, setExpandedMasterGroups] = useState<Record<string, boolean>>({});
  const [addMasterModal, setAddMasterModal] = useState<'group' | 'brand' | null>(null);

  
  const [newGroupName, setNewGroupName] = useState('');
  const [newBrandName, setNewBrandName] = useState('');

  const [itemGroups, setItemGroups] = useState<ItemGroup[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);

  // Form state
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
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsModalOpen(false);
        setAddMasterModal(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
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

  function toggleMasterGroup(name: string) {
    setExpandedMasterGroups(prev => ({ ...prev, [name]: !prev[name] }));
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
    setIsModalOpen(true);
  }

  function resetForm() {
    setEditProductId(null);
    setName(''); setGroupId(null); setBrandId(null); setModel(''); setHsn('');
    setPurchasePrice(''); setSellingPrice(''); setMrp('');
    setUnit('Piece'); setMinStock('0'); setStock(''); setGstPercentage('18'); setCgstPercentage('9'); setSgstPercentage('9');
  }

  async function handleAddProduct(e: React.FormEvent) {
    e.preventDefault();
    try {
      if (editProductId) {
        const existing = products.find(p => p.id === editProductId);
        const barcode = existing ? (existing.barcode || `SKU-${Date.now()}`) : `SKU-${Date.now()}`;
        await updateProduct(
          editProductId,
          name, groupId, brandId, barcode, model, hsn,
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
        const generatedBarcode = `SKU-${Date.now()}`;
        
        const baseData = {
          group_id: groupId,
          brand_id: brandId,
          barcode: generatedBarcode,
          model,
          hsn_code: hsn,
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

        await addProduct(name, baseData);
      }
      setIsModalOpen(false);
      resetForm();
      loadProducts();
    } catch (error) {
      console.error("Failed to save product", error);
      alert(`Error saving product: ${error}`);
    }
  }

  const filteredProducts = products.filter(p => 
    p.name.toLowerCase().includes(search.toLowerCase()) || 
    (p.barcode && p.barcode.includes(search))
  );

  return (
    <div className="p-8 h-full flex flex-col relative bg-canvas overflow-y-auto">
      <header className="mb-12 flex justify-between items-end">
        <div>
          <h1 className="text-4xl font-display font-medium text-ink tracking-tight">Inventory Management</h1>
          <p className="text-base text-body mt-2">Manage products, variants, and stock levels.</p>
        </div>
        <div className="flex gap-4">
          {viewMode === 'items' && (
            <button 
              onClick={() => { resetForm(); setIsModalOpen(true); }}
              className="bg-primary hover:bg-primary-active text-on-primary px-6 py-3 rounded-lg font-medium shadow-none flex items-center transition-colors"
            >
              <Plus className="w-5 h-5 mr-2" />
              Add Product
            </button>
          )}
          {viewMode === 'groups' && (
            <button 
              onClick={() => { setNewGroupName(''); setAddMasterModal('group'); }}
              className="bg-primary hover:bg-primary-active text-on-primary px-6 py-3 rounded-lg font-medium shadow-none flex items-center transition-colors"
            >
              <Plus className="w-5 h-5 mr-2" />
              Add Group
            </button>
          )}
          {viewMode === 'brands' && (
            <button 
              onClick={() => { setNewBrandName(''); setAddMasterModal('brand'); }}
              className="bg-primary hover:bg-primary-active text-on-primary px-6 py-3 rounded-lg font-medium shadow-none flex items-center transition-colors"
            >
              <Plus className="w-5 h-5 mr-2" />
              Add Brand
            </button>
          )}
        </div>
      </header>

      <div className="bg-canvas rounded-lg border border-hairline flex-1 flex flex-col overflow-hidden">
        <div className="p-4 border-b border-hairline flex justify-between items-center bg-canvas">
          <div className="flex gap-4">
            <button 
              onClick={() => setViewMode('items')} 
              className={`px-4 py-2 font-medium text-sm transition-colors border-b-2 ${viewMode === 'items' ? 'border-primary text-primary' : 'border-transparent text-muted hover:text-ink'}`}
            >
              ITEM
            </button>
            <button 
              onClick={() => setViewMode('groups')} 
              className={`px-4 py-2 font-medium text-sm transition-colors border-b-2 ${viewMode === 'groups' ? 'border-primary text-primary' : 'border-transparent text-muted hover:text-ink'}`}
            >
              GROUP
            </button>
            <button 
              onClick={() => setViewMode('brands')} 
              className={`px-4 py-2 font-medium text-sm transition-colors border-b-2 ${viewMode === 'brands' ? 'border-primary text-primary' : 'border-transparent text-muted hover:text-ink'}`}
            >
              BRAND
            </button>
          </div>
          <div className="relative flex-1 max-w-md ml-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted w-4 h-4" />
            <input 
              type="text" 
              placeholder="Search products by name or SKU..." 
              className="w-full pl-9 pr-4 py-2 bg-canvas border border-hairline rounded-sm shadow-none focus:outline-none focus:border-ink transition-colors text-ink placeholder-muted text-sm"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        <div className="overflow-x-auto flex-1 bg-canvas">
          {viewMode === 'items' && (
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-surface-soft border-b border-hairline text-muted text-xs font-medium uppercase tracking-wider sticky top-0 z-10">
                  <th className="px-6 py-4 w-10"></th>
                  <th className="px-6 py-4">Product Name</th>
                  <th className="px-6 py-4">HSN</th>
                  <th className="px-6 py-4">Model</th>
                  <th className="px-6 py-4">Unit</th>
                  <th className="px-6 py-4 text-right">Stock</th>
                  <th className="px-6 py-4 text-right">Purchase (₹)</th>
                  <th className="px-6 py-4 text-right">Selling (₹)</th>
                  <th className="px-6 py-4"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-hairline">
                {filteredProducts.map((p) => {
                return (
                  <tr key={p.id} className="hover:bg-surface-soft transition-colors border-b border-hairline last:border-0 group">
                    <td className="px-4 py-4 text-center"></td>
                    <td className="px-6 py-4 font-medium text-ink flex items-center">
                      {p.name}
                    </td>
                    <td className="px-6 py-4 text-muted text-sm">{p.hsn_code || '-'}</td>
                    <td className="px-6 py-4 text-muted text-sm">{p.model || '-'}</td>
                    <td className="px-6 py-4 text-muted text-sm">{p.unit}</td>
                    <td className="px-6 py-4 text-right">
                      <span className={p.stock_quantity <= p.min_stock ? 'text-signature-coral font-medium' : 'text-ink font-medium'}>
                        {p.stock_quantity}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right text-muted text-sm">₹{p.purchase_price?.toFixed(2) || '0.00'}</td>
                    <td className="px-6 py-4 text-right text-ink font-medium text-base">₹{p.selling_price?.toFixed(2) || '0.00'}</td>
                    <td className="px-6 py-4 text-right">
                      <button onClick={() => openEditModal(p)} className="p-2 text-muted hover:text-primary transition-colors rounded-sm hover:bg-surface-soft">
                        <Edit2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                );
              })}
              
              {filteredProducts.length === 0 && (
                <tr>
                  <td colSpan={9} className="p-8 text-center text-muted">
                    No products found in the database. Add one to get started.
                  </td>
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
                              className="p-5 flex justify-between items-center cursor-pointer hover:bg-surface-soft transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-inset"
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
                                <button 
                                  onClick={(e) => { e.stopPropagation(); handleDeleteGroup(group.id, group.name); }}
                                  className="p-2 text-muted hover:text-signature-coral hover:bg-signature-coral/10 rounded-md transition-colors"
                                  title="Delete Group"
                                >
                                  <Trash2 className="w-5 h-5" />
                                </button>
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
                                <button 
                                  onClick={(e) => { e.stopPropagation(); handleDeleteBrand(brand.id, brand.name); }}
                                  className="p-2 text-muted hover:text-signature-coral hover:bg-signature-coral/10 rounded-md transition-colors"
                                  title="Delete Brand"
                                >
                                  <Trash2 className="w-5 h-5" />
                                </button>
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
        </div>
      </div>

      {isModalOpen && (
        <div className="absolute inset-0 bg-ink/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-canvas rounded-lg shadow-xl w-full max-w-2xl overflow-hidden border border-hairline flex flex-col max-h-[90vh]">
            <div className="px-6 py-5 border-b border-hairline flex justify-between items-center bg-surface-soft flex-shrink-0">
              <h2 className="text-lg font-medium text-ink">{editProductId ? 'Edit Product' : 'Add New Product'}</h2>
              <button onClick={() => { setIsModalOpen(false); resetForm(); }} className="text-muted hover:text-ink transition-colors p-1">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <form onSubmit={handleAddProduct} onKeyDown={handleFormKeyDown} className="flex flex-col flex-1 overflow-hidden">
              <div className="p-6 overflow-y-auto flex-1 flex flex-col gap-6">
                
                {/* Basic Info */}
                <div className="grid grid-cols-4 gap-5">
                  <div className="col-span-1">
                    <label className="block text-xs font-medium text-muted uppercase tracking-wider mb-2 flex justify-between">
                      <span>Group *</span>
                    </label>
                    <select required value={groupId || ''} onChange={e => setGroupId(Number(e.target.value) || null)} className="w-full px-3 py-2 bg-canvas border border-hairline rounded-sm focus:outline-none focus:border-ink transition-colors text-ink text-sm">
                      <option value="">Select Group</option>
                      {itemGroups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                    </select>
                  </div>
                  <div className="col-span-1">
                    <label className="block text-xs font-medium text-muted uppercase tracking-wider mb-2">Brand *</label>
                    <select required value={brandId || ''} onChange={e => setBrandId(Number(e.target.value) || null)} className="w-full px-3 py-2 bg-canvas border border-hairline rounded-sm focus:outline-none focus:border-ink transition-colors text-ink text-sm">
                      <option value="">Select Brand</option>
                      {brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                    </select>
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs font-medium text-muted uppercase tracking-wider mb-2">Product Name *</label>
                    <input required type="text" value={name} onChange={e => setName(e.target.value)} className="w-full px-3 py-2 bg-canvas border border-hairline rounded-sm focus:outline-none focus:border-ink transition-colors text-ink text-sm" placeholder="e.g. Ventil Air 150MM" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-muted uppercase tracking-wider mb-2">HSN Code</label>
                    <input type="text" value={hsn} onChange={e => setHsn(e.target.value)} className="w-full px-3 py-2 bg-canvas border border-hairline rounded-sm focus:outline-none focus:border-ink transition-colors text-ink text-sm" placeholder="e.g. 8536" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-muted uppercase tracking-wider mb-2">Unit</label>
                    <select value={unit} onChange={e => setUnit(e.target.value)} className="w-full px-3 py-2 bg-canvas border border-hairline rounded-sm focus:outline-none focus:border-ink transition-colors text-ink text-sm">
                      {unitOptions.map(u => (
                        <option key={u} value={u}>{u}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-muted uppercase tracking-wider mb-2">Total GST % *</label>
                    <input required type="number" min="0" max="100" step="0.1" value={gstPercentage} onChange={e => {
                      const val = e.target.value;
                      setGstPercentage(val);
                      setCgstPercentage((parseFloat(val || '0') / 2).toString());
                      setSgstPercentage((parseFloat(val || '0') / 2).toString());
                    }} className="w-full px-3 py-2 bg-canvas border border-hairline rounded-sm focus:outline-none focus:border-ink transition-colors text-ink text-sm" placeholder="18" />
                    <div className="flex gap-2 mt-1.5">
                      <div className="flex-1">
                        <label className="block text-[10px] font-medium text-muted uppercase mb-1">CGST %</label>
                        <input required type="number" min="0" max="100" step="0.1" value={cgstPercentage} onChange={e => { const val = e.target.value; setCgstPercentage(val); setGstPercentage((parseFloat(val || "0") + parseFloat(sgstPercentage || "0")).toString()); }} className="w-full px-2 py-1 bg-surface-soft border border-hairline rounded-sm focus:outline-none focus:border-ink text-ink text-xs" />
                      </div>
                      <div className="flex-1">
                        <label className="block text-[10px] font-medium text-muted uppercase mb-1">SGST %</label>
                        <input required type="number" min="0" max="100" step="0.1" value={sgstPercentage} onChange={e => { const val = e.target.value; setSgstPercentage(val); setGstPercentage((parseFloat(cgstPercentage || "0") + parseFloat(val || "0")).toString()); }} className="w-full px-2 py-1 bg-surface-soft border border-hairline rounded-sm focus:outline-none focus:border-ink text-ink text-xs" />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Product Fields */}
                <div className="grid grid-cols-2 gap-5 border-t border-hairline pt-5">
                  <div className="col-span-2">
                    <label className="block text-xs font-medium text-muted uppercase tracking-wider mb-2">Model / Spec</label>
                    <input type="text" value={model} onChange={e => setModel(e.target.value)} className="w-full px-3 py-2 bg-canvas border border-hairline rounded-sm focus:outline-none focus:border-ink transition-colors text-ink text-sm" placeholder="e.g. 10A" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-muted uppercase tracking-wider mb-2">Purchase (₹) *</label>
                    <input required type="number" step="0.01" min="0" value={purchasePrice} onChange={e => setPurchasePrice(e.target.value)} className="w-full px-3 py-2 bg-canvas border border-hairline rounded-sm focus:outline-none focus:border-ink transition-colors text-ink text-sm" placeholder="0.00" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-muted uppercase tracking-wider mb-2">Selling (₹) *</label>
                    <input required type="number" step="0.01" min="0" value={sellingPrice} onChange={e => setSellingPrice(e.target.value)} className="w-full px-3 py-2 bg-canvas border border-hairline rounded-sm focus:outline-none focus:border-ink transition-colors text-ink text-sm" placeholder="0.00" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-muted uppercase tracking-wider mb-2">MRP (₹)</label>
                    <input type="number" step="0.01" min="0" value={mrp} onChange={e => setMrp(e.target.value)} className="w-full px-3 py-2 bg-canvas border border-hairline rounded-sm focus:outline-none focus:border-ink transition-colors text-ink text-sm" placeholder="0.00" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-muted uppercase tracking-wider mb-2">Current Stock *</label>
                    <input required type="number" min="0" value={stock} onChange={e => setStock(e.target.value)} className="w-full px-3 py-2 bg-canvas border border-hairline rounded-sm focus:outline-none focus:border-ink transition-colors text-ink text-sm" placeholder="0" />
                  </div>
                </div>

              </div>
              <div className="p-6 border-t border-hairline flex justify-end gap-3 bg-canvas flex-shrink-0">
                <button type="button" onClick={() => { setIsModalOpen(false); resetForm(); }} className="px-4 py-2 text-ink font-medium bg-canvas border border-hairline hover:bg-surface-soft rounded-sm transition-colors text-sm">Cancel</button>
                <button type="submit" className="px-6 py-2 bg-primary hover:bg-primary-active text-on-primary font-medium rounded-lg transition-colors text-sm">{editProductId ? 'Save Changes' : 'Save Product'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

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
    </div>
  );
}
