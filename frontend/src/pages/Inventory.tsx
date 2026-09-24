import { useState, useEffect } from 'react';
import { Search, Plus, X } from 'lucide-react';
import { getProducts, addProduct } from '../lib/db';
import type { Product } from '../lib/db';

export default function Inventory() {
  const [search, setSearch] = useState('');
  const [products, setProducts] = useState<Product[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Form state
  const [name, setName] = useState('');
  const [model, setModel] = useState('');
  const [hsn, setHsn] = useState('');
  const [purchasePrice, setPurchasePrice] = useState('');
  const [sellingPrice, setSellingPrice] = useState('');
  const [mrp, setMrp] = useState('');
  const [unit, setUnit] = useState('Piece');
  const [minStock, setMinStock] = useState('0');
  const [stock, setStock] = useState('');

  // Load products from SQLite on mount
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

  async function handleAddProduct(e: React.FormEvent) {
    e.preventDefault();
    try {
      const generatedBarcode = `SKU-${Date.now()}`;
      await addProduct(
        name, generatedBarcode, model, hsn,
        parseFloat(purchasePrice) || 0,
        parseFloat(sellingPrice),
        parseFloat(mrp) || 0,
        unit,
        parseInt(minStock) || 0,
        parseInt(stock)
      );
      setIsModalOpen(false);
      // Reset form
      setName(''); setModel(''); setHsn('');
      setPurchasePrice(''); setSellingPrice(''); setMrp('');
      setUnit('Piece'); setMinStock('0'); setStock('');
      // Reload table
      loadProducts();
    } catch (error) {
      console.error("Failed to add product", error);
      alert(`Error adding product: ${error}`);
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
          <p className="text-base text-body mt-2">Manage products, stock levels, and pricing.</p>
        </div>
        <button 
          onClick={() => setIsModalOpen(true)}
          className="bg-primary hover:bg-primary-active text-on-primary px-6 py-3 rounded-lg font-medium shadow-none flex items-center transition-colors"
        >
          <Plus className="w-5 h-5 mr-2" />
          Add Product
        </button>
      </header>

      <div className="bg-canvas rounded-lg border border-hairline flex-1 flex flex-col overflow-hidden">
        {/* Toolbar */}
        <div className="p-4 border-b border-hairline flex justify-between items-center bg-canvas">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted w-4 h-4" />
            <input 
              type="text" 
              placeholder="Search products by name..." 
              className="w-full pl-9 pr-4 py-2 bg-canvas border border-hairline rounded-sm shadow-none focus:outline-none focus:border-ink transition-colors text-ink placeholder-muted text-sm"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto flex-1 bg-canvas">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-surface-soft border-b border-hairline text-muted text-xs font-medium uppercase tracking-wider sticky top-0 z-10">
                <th className="px-6 py-4">ID</th>
                <th className="px-6 py-4">Product Name</th>
                <th className="px-6 py-4">HSN/Model</th>
                <th className="px-6 py-4 text-right">Stock</th>
                <th className="px-6 py-4 text-right">Price (₹)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline">
              {filteredProducts.map((p) => (
                <tr key={p.id} className="hover:bg-surface-soft transition-colors border-b border-hairline last:border-0">
                  <td className="px-6 py-4 text-muted text-sm font-medium">#{p.id}</td>
                  <td className="px-6 py-4 font-medium text-ink">{p.name}</td>
                  <td className="px-6 py-4 text-muted text-sm">
                    {p.hsn_code && <div className="text-ink">HSN: <span className="text-muted">{p.hsn_code}</span></div>}
                    {p.model && <div className="text-xs text-muted mt-0.5">{p.model}</div>}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <span className={`inline-flex items-center px-2 py-1 rounded-sm text-xs font-medium border ${p.stock_quantity <= p.min_stock ? 'bg-canvas text-signature-coral border-signature-coral/30' : 'bg-canvas text-ink border-hairline'}`}>
                      {p.stock_quantity} {p.unit}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right text-ink font-medium text-base">₹{p.selling_price.toFixed(2)}</td>
                </tr>
              ))}
              {filteredProducts.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-muted">
                    No products found in the database. Add one to get started.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Product Modal */}
      {isModalOpen && (
        <div className="absolute inset-0 bg-ink/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-canvas rounded-lg shadow-xl w-full max-w-md overflow-hidden border border-hairline">
            <div className="px-6 py-5 border-b border-hairline flex justify-between items-center bg-surface-soft">
              <h2 className="text-lg font-medium text-ink">Add New Product</h2>
              <button onClick={() => setIsModalOpen(false)} className="text-muted hover:text-ink transition-colors p-1">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleAddProduct} className="p-6 flex flex-col gap-5 overflow-y-auto max-h-[80vh]">
              <div className="grid grid-cols-2 gap-5">
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-muted uppercase tracking-wider mb-2">Product Name *</label>
                  <input required type="text" value={name} onChange={e => setName(e.target.value)} className="w-full px-3 py-2 bg-canvas border border-hairline rounded-sm focus:outline-none focus:border-ink transition-colors text-ink text-sm" placeholder="e.g. Havells Switch" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted uppercase tracking-wider mb-2">Model / Spec</label>
                  <input type="text" value={model} onChange={e => setModel(e.target.value)} className="w-full px-3 py-2 bg-canvas border border-hairline rounded-sm focus:outline-none focus:border-ink transition-colors text-ink text-sm" placeholder="e.g. 10A 240V" />
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
              <div className="mt-6 flex justify-end gap-3">
                <button type="button" onClick={() => setIsModalOpen(false)} className="px-4 py-2 text-ink font-medium bg-canvas border border-hairline hover:bg-surface-soft rounded-sm transition-colors text-sm">Cancel</button>
                <button type="submit" className="px-6 py-2 bg-primary hover:bg-primary-active text-on-primary font-medium rounded-lg transition-colors text-sm">Save Product</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
