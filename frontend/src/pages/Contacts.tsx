import { useState, useEffect } from 'react';
import { Search, Plus, X, Users, Truck } from 'lucide-react';
import { getCustomers, addCustomer, getSuppliers, addSupplier } from '../lib/db';
import type { Customer, Supplier } from '../lib/db';

export default function Contacts() {
  const [activeTab, setActiveTab] = useState<'customers' | 'suppliers'>('customers');
  const [search, setSearch] = useState('');
  
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  
  // Form State
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [gstin, setGstin] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      setCustomers(await getCustomers());
      setSuppliers(await getSuppliers());
    } catch (e) {
      console.error("Failed to load contacts", e);
    }
  }

  async function handleAddContact(e: React.FormEvent) {
    e.preventDefault();
    try {
      if (activeTab === 'customers') {
        await addCustomer(name, phone, email, address, gstin);
      } else {
        await addSupplier(name, phone, email, address, gstin);
      }
      setIsModalOpen(false);
      setName(''); setPhone(''); setEmail(''); setAddress(''); setGstin('');
      loadData();
    } catch (error) {
      console.error("Failed to add contact", error);
      alert(`Error adding contact: ${error}`);
    }
  }

  const filteredCustomers = customers.filter(c => 
    c.name.toLowerCase().includes(search.toLowerCase()) || 
    (c.phone && c.phone.includes(search))
  );

  const filteredSuppliers = suppliers.filter(s => 
    s.name.toLowerCase().includes(search.toLowerCase()) || 
    (s.phone && s.phone.includes(search))
  );

  return (
    <div className="p-8 h-full flex flex-col relative bg-slate-50 overflow-hidden">
      <header className="mb-6 flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-800">Contacts Management</h1>
          <p className="text-gray-500 mt-1">Manage your customers and suppliers in one place</p>
        </div>
        <button 
          onClick={() => setIsModalOpen(true)}
          className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-xl font-semibold shadow-sm hover:shadow flex items-center transition-all"
        >
          <Plus className="w-5 h-5 mr-2" />
          Add {activeTab === 'customers' ? 'Customer' : 'Supplier'}
        </button>
      </header>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 flex-1 flex flex-col overflow-hidden">
        {/* Toolbar & Tabs */}
        <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-slate-50/50">
          <div className="flex gap-2">
            <button 
              onClick={() => setActiveTab('customers')}
              className={`px-4 py-2 rounded-lg font-medium flex items-center transition-colors ${activeTab === 'customers' ? 'bg-white text-blue-600 shadow-sm border border-slate-200' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100'}`}
            >
              <Users className="w-4 h-4 mr-2" />
              Customers
            </button>
            <button 
              onClick={() => setActiveTab('suppliers')}
              className={`px-4 py-2 rounded-lg font-medium flex items-center transition-colors ${activeTab === 'suppliers' ? 'bg-white text-blue-600 shadow-sm border border-slate-200' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100'}`}
            >
              <Truck className="w-4 h-4 mr-2" />
              Suppliers
            </button>
          </div>

          <div className="relative w-80">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input 
              type="text" 
              placeholder={`Search ${activeTab}...`}
              className="w-full pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-slate-800 placeholder-slate-400"
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
                <th className="px-6 py-4">Name</th>
                <th className="px-6 py-4">Contact Info</th>
                <th className="px-6 py-4">GSTIN</th>
                <th className="px-6 py-4 text-right">Outstanding Balance (₹)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {(activeTab === 'customers' ? filteredCustomers : filteredSuppliers).map((contact: any) => (
                <tr key={contact.id} className="hover:bg-slate-50/50 transition-colors border-b border-slate-50 last:border-0 group">
                  <td className="px-6 py-4">
                    <div className="font-semibold text-slate-800">{contact.name}</div>
                    <div className="text-xs text-slate-400 mt-0.5">{contact.address || 'No Address'}</div>
                  </td>
                  <td className="px-6 py-4 text-slate-500 text-sm">
                    {contact.phone && <div>{contact.phone}</div>}
                    {contact.email && <div className="text-xs mt-0.5">{contact.email}</div>}
                    {!contact.phone && !contact.email && <span className="text-slate-300 italic">None</span>}
                  </td>
                  <td className="px-6 py-4 font-mono text-slate-500 text-sm">
                    {contact.gstin || <span className="text-slate-300 italic">N/A</span>}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <span className={`font-bold ${contact.balance > 0 ? 'text-red-600' : 'text-slate-800'}`}>
                      ₹{contact.balance.toFixed(2)}
                    </span>
                  </td>
                </tr>
              ))}
              {(activeTab === 'customers' ? filteredCustomers : filteredSuppliers).length === 0 && (
                <tr>
                  <td colSpan={4} className="p-12 text-center text-gray-500">
                    <div className="flex flex-col items-center justify-center">
                      {activeTab === 'customers' ? <Users className="w-12 h-12 text-slate-200 mb-3" /> : <Truck className="w-12 h-12 text-slate-200 mb-3" />}
                      <p>No {activeTab} found. Click the button above to add one.</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Contact Modal */}
      {isModalOpen && (
        <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
              <h2 className="text-xl font-bold text-gray-800">Add New {activeTab === 'customers' ? 'Customer' : 'Supplier'}</h2>
              <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-6 h-6" />
              </button>
            </div>
            <form onSubmit={handleAddContact} className="p-6 flex flex-col gap-4 overflow-y-auto max-h-[80vh]">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
                <input required type="text" value={name} onChange={e => setName(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="Business or Person Name" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                  <input type="text" value={phone} onChange={e => setPhone(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="+91..." />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                  <input type="email" value={email} onChange={e => setEmail(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="email@example.com" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">GSTIN</label>
                <input type="text" value={gstin} onChange={e => setGstin(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 uppercase" placeholder="27XXXXX1234X1X1" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Full Address</label>
                <textarea rows={3} value={address} onChange={e => setAddress(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" placeholder="123 Street Name, City, State, PIN" />
              </div>
              
              <div className="mt-2 flex justify-end gap-3 pt-4 border-t border-gray-100">
                <button type="button" onClick={() => setIsModalOpen(false)} className="px-4 py-2 text-gray-600 font-medium hover:bg-gray-100 rounded-lg transition-colors">Cancel</button>
                <button type="submit" className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors">Save {activeTab === 'customers' ? 'Customer' : 'Supplier'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
