import React, { useState, useEffect } from 'react';
import { Search, Plus, X, Edit2, ChevronDown, ChevronRight, Trash2 } from 'lucide-react';
import { getProducts, addProduct, updateProduct } from '../lib/db';
import type { Product, ProductVariantData } from '../lib/db';

export default function Inventory() {
  const [search, setSearch] = useState('');
  const [products, setProducts] = useState<Product[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editProductId, setEditProductId] = useState<number | null>(null);
  const [expandedGroups, setExpandedGroups] = useState<Record<number, boolean>>({});

  // Form state
  const [name, setName] = useState('');
  const [hsn, setHsn] = useState('');
  const [unit, setUnit] = useState('Piece');
  const [gstPercentage, setGstPercentage] = useState('18');
  
  // Simple product state
  const [hasVariants, setHasVariants] = useState(false);
  const [model, setModel] = useState('');
  const [purchasePrice, setPurchasePrice] = useState('');
  const [sellingPrice, setSellingPrice] = useState('');
  const [mrp, setMrp] = useState('');
  const [minStock, setMinStock] = useState('0');
  const [stock, setStock] = useState('');

  // Variants state
  const [variants, setVariants] = useState<ProductVariantData[]>([
    { model: '', purchase_price: 0, selling_price: 0, mrp: 0, min_stock: 0, stock: 0, barcode: '' }
  ]);

  useEffect(() => {
    loadProducts();
  }, []);

  async function loadProducts() {
    try {
      const data = await getProducts();
      setProducts(data);
    } catch (error) {
      console.error("Failed to load products from database", error);
    }
  }

  function toggleGroup(id: number) {
    setExpandedGroups(prev => ({ ...prev, [id]: !prev[id] }));
  }

  function openEditModal(p: Product) {
    setEditProductId(p.id);
    setName(p.name);
    setModel(p.model || '');
    setHsn(p.hsn_code || '');
    setPurchasePrice(p.purchase_price?.toString() || '');
    setSellingPrice(p.selling_price?.toString() || '');
    setMrp(p.mrp?.toString() || '');
    setUnit(p.unit);
    setGstPercentage(p.gst_percentage?.toString() || '18');
    setMinStock(p.min_stock?.toString() || '0');
    setStock(p.stock_quantity?.toString() || '0');
    setHasVariants(false);
    setIsModalOpen(true);
  }

  function resetForm() {
    setEditProductId(null);
    setName(''); setModel(''); setHsn('');
    setPurchasePrice(''); setSellingPrice(''); setMrp('');
    setUnit('Piece'); setMinStock('0'); setStock(''); setGstPercentage('18');
    setHasVariants(false);
    setVariants([{ model: '', purchase_price: 0, selling_price: 0, mrp: 0, min_stock: 0, stock: 0, barcode: '' }]);
  }

  async function handleAddProduct(e: React.FormEvent) {
    e.preventDefault();
    try {
      if (editProductId) {
        const existing = products.find(p => p.id === editProductId);
        const barcode = existing ? (existing.barcode || `SKU-${Date.now()}`) : `SKU-${Date.now()}`;
        await updateProduct(
          editProductId,
          name, barcode, model, hsn,
          parseFloat(purchasePrice) || 0,
          parseFloat(sellingPrice),
          parseFloat(mrp) || 0,
          unit,
          parseInt(minStock) || 0,
          parseInt(stock) || 0,
          parseFloat(gstPercentage) || 0
        );
      } else {
        const generatedBarcode = `SKU-${Date.now()}`;
        
        const baseData = {
          barcode: generatedBarcode,
          model,
          hsn_code: hsn,
          purchase_price: parseFloat(purchasePrice) || 0,
          selling_price: parseFloat(sellingPrice) || 0,
          mrp: parseFloat(mrp) || 0,
          unit,
          min_stock: parseInt(minStock) || 0,
          stock: parseInt(stock) || 0,
          gst_percentage: parseFloat(gstPercentage) || 0
        };

        const finalVariants = hasVariants ? variants.map((v, i) => ({
          ...v,
          barcode: `SKU-${Date.now()}-${i}`
        })) : [];

        await addProduct(name, baseData, finalVariants);
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
        <button 
          onClick={() => { resetForm(); setIsModalOpen(true); }}
          className="bg-primary hover:bg-primary-active text-on-primary px-6 py-3 rounded-lg font-medium shadow-none flex items-center transition-colors"
        >
          <Plus className="w-5 h-5 mr-2" />
          Add Product
        </button>
      </header>

      <div className="bg-canvas rounded-lg border border-hairline flex-1 flex flex-col overflow-hidden">
        <div className="p-4 border-b border-hairline flex justify-between items-center bg-canvas">
          <div className="relative flex-1 max-w-md">
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
                const isExpanded = expandedGroups[p.id];
                return (
                  <React.Fragment key={p.id}>
                    <tr className="hover:bg-surface-soft transition-colors border-b border-hairline last:border-0 group">
                      <td className="px-4 py-4 text-center">
                        {!!p.is_group && p.variants && p.variants.length > 0 && (
                          <button onClick={() => toggleGroup(p.id)} className="p-1 hover:bg-surface rounded-sm">
                            {isExpanded ? <ChevronDown className="w-4 h-4 text-ink" /> : <ChevronRight className="w-4 h-4 text-muted" />}
                          </button>
                        )}
                      </td>
                      <td className="px-6 py-4 font-medium text-ink flex items-center">
                        {p.is_group ? <span className="font-semibold">{p.name}</span> : p.name}
                        {!!p.is_group && <span className="ml-2 text-xs bg-surface-soft border border-hairline px-2 py-0.5 rounded text-muted">{p.variants?.length} variants</span>}
                      </td>
                      <td className="px-6 py-4 text-muted text-sm">{p.hsn_code || '-'}</td>
                      <td className="px-6 py-4 text-muted text-sm">{p.model || '-'}</td>
                      <td className="px-6 py-4 text-muted text-sm">{p.unit}</td>
                      <td className="px-6 py-4 text-right">
                        {!p.is_group && (
                          <span className={p.stock_quantity <= p.min_stock ? 'text-signature-coral font-medium' : 'text-ink font-medium'}>
                            {p.stock_quantity}
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-right text-muted text-sm">{!p.is_group ? `₹${p.purchase_price?.toFixed(2) || '0.00'}` : '-'}</td>
                      <td className="px-6 py-4 text-right text-ink font-medium text-base">{!p.is_group ? `₹${p.selling_price?.toFixed(2) || '0.00'}` : '-'}</td>
                      <td className="px-6 py-4 text-right">
                        {!p.is_group && (
                          <button onClick={() => openEditModal(p)} className="p-2 text-muted hover:text-primary transition-colors rounded-sm hover:bg-surface-soft">
                            <Edit2 className="w-4 h-4" />
                          </button>
                        )}
                      </td>
                    </tr>
                    {!!p.is_group && isExpanded && p.variants?.map(v => (
                      <tr key={v.id} className="bg-surface-soft/30 hover:bg-surface-soft transition-colors border-b border-hairline last:border-0">
                        <td className="px-4 py-3"></td>
                        <td className="px-6 py-3 pl-12 text-ink text-sm">↳ {v.name}</td>
                        <td className="px-6 py-3 text-muted text-sm">{v.hsn_code || '-'}</td>
                        <td className="px-6 py-3 text-muted text-sm font-medium">{v.model || '-'}</td>
                        <td className="px-6 py-3 text-muted text-sm">{v.unit}</td>
                        <td className="px-6 py-3 text-right">
                          <span className={v.stock_quantity <= v.min_stock ? 'text-signature-coral font-medium' : 'text-ink font-medium'}>
                            {v.stock_quantity}
                          </span>
                        </td>
                        <td className="px-6 py-3 text-right text-muted text-sm">₹{v.purchase_price?.toFixed(2) || '0.00'}</td>
                        <td className="px-6 py-3 text-right text-ink font-medium">₹{v.selling_price?.toFixed(2) || '0.00'}</td>
                        <td className="px-6 py-3 text-right">
                          <button onClick={() => openEditModal(v)} className="p-2 text-muted hover:text-primary transition-colors rounded-sm hover:bg-surface">
                            <Edit2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </React.Fragment>
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
            
            <form onSubmit={handleAddProduct} className="flex flex-col flex-1 overflow-hidden">
              <div className="p-6 overflow-y-auto flex-1 flex flex-col gap-6">
                
                {/* Basic Info */}
                <div className="grid grid-cols-3 gap-5">
                  <div className="col-span-3">
                    <label className="block text-xs font-medium text-muted uppercase tracking-wider mb-2">Product Base Name *</label>
                    <input required type="text" value={name} onChange={e => setName(e.target.value)} className="w-full px-3 py-2 bg-canvas border border-hairline rounded-sm focus:outline-none focus:border-ink transition-colors text-ink text-sm" placeholder="e.g. Havells Switch" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-muted uppercase tracking-wider mb-2">HSN Code</label>
                    <input type="text" value={hsn} onChange={e => setHsn(e.target.value)} className="w-full px-3 py-2 bg-canvas border border-hairline rounded-sm focus:outline-none focus:border-ink transition-colors text-ink text-sm" placeholder="e.g. 8536" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-muted uppercase tracking-wider mb-2">Unit</label>
                    <select value={unit} onChange={e => setUnit(e.target.value)} className="w-full px-3 py-2 bg-canvas border border-hairline rounded-sm focus:outline-none focus:border-ink transition-colors text-ink text-sm">
                      <option value="Piece">Piece</option>
                      <option value="Box">Box</option>
                      <option value="Meter">Meter</option>
                      <option value="Roll">Roll</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-muted uppercase tracking-wider mb-2">GST % *</label>
                    <input required type="number" min="0" max="100" step="0.1" value={gstPercentage} onChange={e => setGstPercentage(e.target.value)} className="w-full px-3 py-2 bg-canvas border border-hairline rounded-sm focus:outline-none focus:border-ink transition-colors text-ink text-sm" placeholder="18" />
                  </div>
                </div>

                {!editProductId && (
                  <div className="flex items-center p-4 bg-surface-soft rounded-lg border border-hairline">
                    <input type="checkbox" id="hasVariants" className="mr-3 w-4 h-4 accent-primary" checked={hasVariants} onChange={e => setHasVariants(e.target.checked)} />
                    <div>
                      <label htmlFor="hasVariants" className="font-medium text-ink block cursor-pointer">This product has variants</label>
                      <p className="text-xs text-muted mt-0.5">Check this if the product comes in multiple sizes, ratings, or models (e.g., 10A, 20A, 30A).</p>
                    </div>
                  </div>
                )}

                {/* Simple Product Fields */}
                {(!hasVariants || editProductId) && (
                  <div className="grid grid-cols-2 gap-5 border-t border-hairline pt-5">
                    <div className="col-span-2">
                      <label className="block text-xs font-medium text-muted uppercase tracking-wider mb-2">Model / Spec</label>
                      <input type="text" value={model} onChange={e => setModel(e.target.value)} className="w-full px-3 py-2 bg-canvas border border-hairline rounded-sm focus:outline-none focus:border-ink transition-colors text-ink text-sm" placeholder="e.g. 10A" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-muted uppercase tracking-wider mb-2">Purchase (₹) *</label>
                      <input required={!hasVariants} type="number" step="0.01" min="0" value={purchasePrice} onChange={e => setPurchasePrice(e.target.value)} className="w-full px-3 py-2 bg-canvas border border-hairline rounded-sm focus:outline-none focus:border-ink transition-colors text-ink text-sm" placeholder="0.00" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-muted uppercase tracking-wider mb-2">Selling (₹) *</label>
                      <input required={!hasVariants} type="number" step="0.01" min="0" value={sellingPrice} onChange={e => setSellingPrice(e.target.value)} className="w-full px-3 py-2 bg-canvas border border-hairline rounded-sm focus:outline-none focus:border-ink transition-colors text-ink text-sm" placeholder="0.00" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-muted uppercase tracking-wider mb-2">MRP (₹)</label>
                      <input type="number" step="0.01" min="0" value={mrp} onChange={e => setMrp(e.target.value)} className="w-full px-3 py-2 bg-canvas border border-hairline rounded-sm focus:outline-none focus:border-ink transition-colors text-ink text-sm" placeholder="0.00" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-muted uppercase tracking-wider mb-2">Current Stock *</label>
                      <input required={!hasVariants} type="number" min="0" value={stock} onChange={e => setStock(e.target.value)} className="w-full px-3 py-2 bg-canvas border border-hairline rounded-sm focus:outline-none focus:border-ink transition-colors text-ink text-sm" placeholder="0" />
                    </div>
                  </div>
                )}

                {/* Variants Grid */}
                {hasVariants && !editProductId && (
                  <div className="border-t border-hairline pt-5">
                    <div className="flex justify-between items-center mb-4">
                      <h3 className="text-sm font-medium text-ink">Product Variants</h3>
                      <button type="button" onClick={() => setVariants([...variants, { model: '', purchase_price: 0, selling_price: 0, mrp: 0, min_stock: 0, stock: 0, barcode: '' }])} className="text-primary text-sm font-medium hover:underline flex items-center">
                        <Plus className="w-4 h-4 mr-1" /> Add Variant
                      </button>
                    </div>
                    
                    <div className="space-y-4">
                      {variants.map((v, index) => (
                        <div key={index} className="flex gap-3 items-end p-4 bg-surface-soft rounded border border-hairline">
                          <div className="flex-1">
                            <label className="block text-xs text-muted mb-1">Model / Variant *</label>
                            <input required type="text" placeholder="e.g. 10A" value={v.model} onChange={e => { const newV = [...variants]; newV[index].model = e.target.value; setVariants(newV); }} className="w-full px-2 py-1.5 text-sm bg-canvas border border-hairline rounded-sm focus:border-ink focus:outline-none" />
                          </div>
                          <div className="w-24">
                            <label className="block text-xs text-muted mb-1">Purchase (₹)</label>
                            <input required type="number" value={v.purchase_price || ''} onChange={e => { const newV = [...variants]; newV[index].purchase_price = parseFloat(e.target.value); setVariants(newV); }} className="w-full px-2 py-1.5 text-sm bg-canvas border border-hairline rounded-sm focus:border-ink focus:outline-none" />
                          </div>
                          <div className="w-24">
                            <label className="block text-xs text-muted mb-1">Selling (₹)</label>
                            <input required type="number" value={v.selling_price || ''} onChange={e => { const newV = [...variants]; newV[index].selling_price = parseFloat(e.target.value); setVariants(newV); }} className="w-full px-2 py-1.5 text-sm bg-canvas border border-hairline rounded-sm focus:border-ink focus:outline-none" />
                          </div>
                          <div className="w-24">
                            <label className="block text-xs text-muted mb-1">Stock</label>
                            <input required type="number" value={v.stock || ''} onChange={e => { const newV = [...variants]; newV[index].stock = parseInt(e.target.value); setVariants(newV); }} className="w-full px-2 py-1.5 text-sm bg-canvas border border-hairline rounded-sm focus:border-ink focus:outline-none" />
                          </div>
                          {variants.length > 1 && (
                            <button type="button" onClick={() => { const newV = variants.filter((_, i) => i !== index); setVariants(newV); }} className="p-1.5 text-muted hover:text-signature-coral bg-canvas border border-hairline rounded-sm transition-colors mb-0.5">
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

              </div>
              <div className="p-6 border-t border-hairline flex justify-end gap-3 bg-canvas flex-shrink-0">
                <button type="button" onClick={() => { setIsModalOpen(false); resetForm(); }} className="px-4 py-2 text-ink font-medium bg-canvas border border-hairline hover:bg-surface-soft rounded-sm transition-colors text-sm">Cancel</button>
                <button type="submit" className="px-6 py-2 bg-primary hover:bg-primary-active text-on-primary font-medium rounded-lg transition-colors text-sm">{editProductId ? 'Save Changes' : 'Save Product'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
