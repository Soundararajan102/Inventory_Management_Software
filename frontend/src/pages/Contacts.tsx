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
    <div className="p-8 h-full flex flex-col relative bg-canvas overflow-y-auto">
      <header className="mb-12 flex justify-between items-end">
        <div>
          <h1 className="text-4xl font-display font-medium text-ink tracking-tight">Contacts Management</h1>
          <p className="text-base text-body mt-2">Manage your customers and suppliers in one place.</p>
        </div>
        <button 
          onClick={() => setIsModalOpen(true)}
          className="bg-primary hover:bg-primary-active text-on-primary px-6 py-3 rounded-lg font-medium shadow-none flex items-center transition-colors"
        >
          <Plus className="w-5 h-5 mr-2" />
          Add {activeTab === 'customers' ? 'Customer' : 'Supplier'}
        </button>
      </header>

      <div className="bg-canvas rounded-lg border border-hairline flex-1 flex flex-col overflow-hidden">
        {/* Toolbar & Tabs */}
        <div className="p-4 border-b border-hairline flex justify-between items-center bg-canvas">
          <div className="flex gap-2">
            <button 
              onClick={() => setActiveTab('customers')}
              className={`px-4 py-2 rounded-md font-medium text-sm flex items-center transition-colors ${activeTab === 'customers' ? 'bg-surface-soft text-ink border border-hairline' : 'text-muted hover:text-ink hover:bg-surface-soft border border-transparent'}`}
            >
              <Users className="w-4 h-4 mr-2" />
              Customers
            </button>
            <button 
              onClick={() => setActiveTab('suppliers')}
              className={`px-4 py-2 rounded-md font-medium text-sm flex items-center transition-colors ${activeTab === 'suppliers' ? 'bg-surface-soft text-ink border border-hairline' : 'text-muted hover:text-ink hover:bg-surface-soft border border-transparent'}`}
            >
              <Truck className="w-4 h-4 mr-2" />
              Suppliers
            </button>
          </div>

          <div className="relative w-80">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted w-4 h-4" />
            <input 
              type="text" 
              placeholder={`Search ${activeTab}...`}
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
                <th className="px-6 py-4">Name</th>
                <th className="px-6 py-4">Contact Info</th>
                <th className="px-6 py-4">GSTIN</th>
                <th className="px-6 py-4 text-right">Outstanding Balance (₹)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline">
              {(activeTab === 'customers' ? filteredCustomers : filteredSuppliers).map((contact: any) => (
                <tr key={contact.id} className="hover:bg-surface-soft transition-colors border-b border-hairline last:border-0">
                  <td className="px-6 py-4">
                    <div className="font-medium text-ink">{contact.name}</div>
                    <div className="text-xs text-muted mt-0.5">{contact.address || 'No Address'}</div>
                  </td>
                  <td className="px-6 py-4 text-muted text-sm">
                    {contact.phone && <div className="text-ink">{contact.phone}</div>}
                    {contact.email && <div className="text-xs mt-0.5">{contact.email}</div>}
                    {!contact.phone && !contact.email && <span className="italic text-muted/50">None</span>}
                  </td>
                  <td className="px-6 py-4 font-mono text-muted text-sm">
                    {contact.gstin || <span className="italic text-muted/50">N/A</span>}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <span className={`font-medium ${contact.balance > 0 ? 'text-signature-coral' : 'text-ink'}`}>
                      ₹{contact.balance.toFixed(2)}
                    </span>
                  </td>
                </tr>
              ))}
              {(activeTab === 'customers' ? filteredCustomers : filteredSuppliers).length === 0 && (
                <tr>
                  <td colSpan={4} className="p-16 text-center text-muted">
                    <div className="flex flex-col items-center justify-center">
                      <div className="w-16 h-16 bg-surface-soft border border-hairline rounded-full flex items-center justify-center mb-4">
                        {activeTab === 'customers' ? <Users className="w-6 h-6 text-muted" /> : <Truck className="w-6 h-6 text-muted" />}
                      </div>
                      <p className="font-medium text-ink">No {activeTab} found.</p>
                      <p className="text-sm mt-1">Click the button above to add one.</p>
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
        <div className="absolute inset-0 bg-ink/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-canvas rounded-lg shadow-xl w-full max-w-md overflow-hidden border border-hairline">
            <div className="px-6 py-5 border-b border-hairline flex justify-between items-center bg-surface-soft">
              <h2 className="text-lg font-medium text-ink">Add New {activeTab === 'customers' ? 'Customer' : 'Supplier'}</h2>
              <button onClick={() => setIsModalOpen(false)} className="text-muted hover:text-ink transition-colors p-1">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleAddContact} className="p-6 flex flex-col gap-5 overflow-y-auto max-h-[80vh]">
              <div>
                <label className="block text-xs font-medium text-muted uppercase tracking-wider mb-2">Name *</label>
                <input required type="text" value={name} onChange={e => setName(e.target.value)} className="w-full px-3 py-2 bg-canvas border border-hairline rounded-sm focus:outline-none focus:border-ink transition-colors text-ink text-sm" placeholder="Business or Person Name" />
              </div>
              <div className="grid grid-cols-2 gap-5">
                <div>
                  <label className="block text-xs font-medium text-muted uppercase tracking-wider mb-2">Phone</label>
                  <input type="text" value={phone} onChange={e => setPhone(e.target.value)} className="w-full px-3 py-2 bg-canvas border border-hairline rounded-sm focus:outline-none focus:border-ink transition-colors text-ink text-sm" placeholder="+91..." />
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted uppercase tracking-wider mb-2">Email</label>
                  <input type="email" value={email} onChange={e => setEmail(e.target.value)} className="w-full px-3 py-2 bg-canvas border border-hairline rounded-sm focus:outline-none focus:border-ink transition-colors text-ink text-sm" placeholder="email@example.com" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-muted uppercase tracking-wider mb-2">GSTIN</label>
                <input type="text" value={gstin} onChange={e => setGstin(e.target.value)} className="w-full px-3 py-2 bg-canvas border border-hairline rounded-sm focus:outline-none focus:border-ink transition-colors text-ink text-sm uppercase" placeholder="27XXXXX1234X1X1" />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted uppercase tracking-wider mb-2">Full Address</label>
                <textarea rows={3} value={address} onChange={e => setAddress(e.target.value)} className="w-full px-3 py-2 bg-canvas border border-hairline rounded-sm focus:outline-none focus:border-ink transition-colors text-ink text-sm resize-none" placeholder="123 Street Name, City, State, PIN" />
              </div>
              
              <div className="mt-6 flex justify-end gap-3">
                <button type="button" onClick={() => setIsModalOpen(false)} className="px-4 py-2 text-ink font-medium bg-canvas border border-hairline hover:bg-surface-soft rounded-sm transition-colors text-sm">Cancel</button>
                <button type="submit" className="px-6 py-2 bg-primary hover:bg-primary-active text-on-primary font-medium rounded-lg transition-colors text-sm">Save {activeTab === 'customers' ? 'Customer' : 'Supplier'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
