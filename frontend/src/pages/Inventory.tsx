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
    <div className="p-8 h-full flex flex-col relative bg-slate-50 overflow-hidden">
      <header className="mb-6 flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-800">Inventory Management</h1>
          <p className="text-gray-500 mt-1">Manage products, stock levels, and pricing</p>
        </div>
        <button 
          onClick={() => setIsModalOpen(true)}
          className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-xl font-semibold shadow-sm hover:shadow flex items-center transition-all"
        >
          <Plus className="w-5 h-5 mr-2" />
          Add Product
        </button>
      </header>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 flex-1 flex flex-col overflow-hidden">
        {/* Toolbar */}
        <div className="p-4 border-b border-gray-100 flex gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input 
              type="text" 
              placeholder="Search products by name..." 
              className="w-full pl-10 pr-4 py-2.5 bg-slate-50/50 border border-slate-200 rounded-xl shadow-inner focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-slate-800 placeholder-slate-400"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto flex-1">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/80 backdrop-blur-sm border-b border-slate-100 text-slate-500 text-xs font-bold uppercase tracking-wider sticky top-0 z-10">
                <th className="px-6 py-4">ID</th>
                <th className="px-6 py-4">Product Name</th>
                <th className="px-6 py-4">HSN/Model</th>
                <th className="px-6 py-4 text-right">Stock</th>
                <th className="px-6 py-4 text-right">Price (₹)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredProducts.map((p) => (
                <tr key={p.id} className="hover:bg-slate-50/50 transition-colors border-b border-slate-50 last:border-0 group">
                  <td className="px-6 py-4 text-slate-400 text-sm font-medium">#{p.id}</td>
                  <td className="px-6 py-4 font-semibold text-slate-800">{p.name}</td>
                  <td className="px-6 py-4 text-slate-500 text-sm">
                    {p.hsn_code && <div className="text-slate-600">HSN: <span className="font-mono text-slate-500">{p.hsn_code}</span></div>}
                    {p.model && <div className="text-xs text-slate-400 mt-0.5">{p.model}</div>}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <span className={`inline-flex items-center px-2.5 py-1 rounded-md text-xs font-bold border shadow-sm ${p.stock_quantity <= p.min_stock ? 'bg-red-50 text-red-700 border-red-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200'}`}>
                      {p.stock_quantity} {p.unit}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right text-slate-800 font-bold">₹{p.selling_price.toFixed(2)}</td>
                </tr>
              ))}
              {filteredProducts.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-gray-500">
                    No products found in the database. Add one to get started!
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Product Modal */}
      {isModalOpen && (
        <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
              <h2 className="text-xl font-bold text-gray-800">Add New Product</h2>
              <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-6 h-6" />
              </button>
            </div>
            <form onSubmit={handleAddProduct} className="p-6 flex flex-col gap-4 overflow-y-auto max-h-[80vh]">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Product Name *</label>
                  <input required type="text" value={name} onChange={e => setName(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="e.g. Havells Switch" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Model / Specification</label>
                  <input type="text" value={model} onChange={e => setModel(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="e.g. 10A 240V" />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">HSN Code</label>
                  <input type="text" value={hsn} onChange={e => setHsn(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="e.g. 8536" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Unit</label>
                  <select value={unit} onChange={e => setUnit(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="Piece">Piece</option>
                    <option value="Box">Box</option>
                    <option value="Meter">Meter</option>
                    <option value="Roll">Roll</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Purchase Price (₹)</label>
                  <input type="number" step="0.01" min="0" value={purchasePrice} onChange={e => setPurchasePrice(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="0.00" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Selling Price (₹) *</label>
                  <input required type="number" step="0.01" min="0" value={sellingPrice} onChange={e => setSellingPrice(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="0.00" />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">MRP (₹)</label>
                  <input type="number" step="0.01" min="0" value={mrp} onChange={e => setMrp(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="0.00" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Current Stock *</label>
                  <input required type="number" min="0" value={stock} onChange={e => setStock(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="0" />
                </div>
              </div>
              <div className="mt-4 flex justify-end gap-3">
                <button type="button" onClick={() => setIsModalOpen(false)} className="px-4 py-2 text-gray-600 font-medium hover:bg-gray-100 rounded-lg transition-colors">Cancel</button>
                <button type="submit" className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors">Save Product</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
