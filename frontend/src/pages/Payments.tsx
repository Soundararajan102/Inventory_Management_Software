import { useState, useEffect } from 'react';
import { Search, X, Users, Truck, IndianRupee } from 'lucide-react';
import { getCustomers, getSuppliers, recordPayment } from '../lib/db';
import type { Customer, Supplier } from '../lib/db';

export default function Payments() {
  const [activeTab, setActiveTab] = useState<'customers' | 'suppliers'>('customers');
  const [search, setSearch] = useState('');
  
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  
  const [selectedEntity, setSelectedEntity] = useState<Customer | Supplier | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  
  // Payment Form State
  const [amount, setAmount] = useState<number | ''>('');
  const [paymentMode, setPaymentMode] = useState('Cash');
  const [referenceNo, setReferenceNo] = useState('');
  const [notes, setNotes] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      setCustomers(await getCustomers());
      setSuppliers(await getSuppliers());
    } catch (e) {
      console.error(e);
    }
  }

  const openPaymentModal = (entity: Customer | Supplier) => {
    setSelectedEntity(entity);
    setAmount(entity.balance); // Default to full balance
    setPaymentMode('Cash');
    setReferenceNo('');
    setNotes('');
    setIsModalOpen(true);
  };

  async function handleRecordPayment(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedEntity || amount === '' || amount <= 0) return;
    
    setIsProcessing(true);
    try {
      const type = activeTab === 'customers' ? 'customer' : 'supplier';
      await recordPayment(
        type, 
        selectedEntity.id, 
        Number(amount), 
        paymentMode, 
        referenceNo, 
        notes
      );
      
      alert('Payment recorded successfully! Balance updated.');
      setIsModalOpen(false);
      loadData();
    } catch (error) {
      console.error(error);
      alert(`Failed to record payment: ${error}`);
    } finally {
      setIsProcessing(false);
    }
  }

  // Only show entities with a balance, plus allow search
  const filteredCustomers = customers.filter(c => 
    c.balance > 0 && 
    (c.name.toLowerCase().includes(search.toLowerCase()) || (c.phone && c.phone.includes(search)))
  );

  const filteredSuppliers = suppliers.filter(s => 
    s.balance > 0 && 
    (s.name.toLowerCase().includes(search.toLowerCase()) || (s.phone && s.phone.includes(search)))
  );

  const totalReceivables = customers.reduce((sum, c) => sum + Math.max(0, c.balance), 0);
  const totalPayables = suppliers.reduce((sum, s) => sum + Math.max(0, s.balance), 0);

  return (
    <div className="p-8 h-full flex flex-col relative bg-slate-50">
      <header className="mb-6 flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-bold text-slate-800 tracking-tight">Payments & Outstanding</h1>
          <p className="text-slate-500 mt-1">Track receivables from customers and payables to suppliers.</p>
        </div>
        <div className="flex gap-4">
          <div className="bg-emerald-50 border border-emerald-100 px-5 py-3 rounded-xl shadow-sm">
            <div className="text-xs font-bold text-emerald-600 uppercase tracking-wider mb-1">Total Receivables</div>
            <div className="text-2xl font-black text-emerald-700">₹{totalReceivables.toFixed(2)}</div>
          </div>
          <div className="bg-orange-50 border border-orange-100 px-5 py-3 rounded-xl shadow-sm">
            <div className="text-xs font-bold text-orange-600 uppercase tracking-wider mb-1">Total Payables</div>
            <div className="text-2xl font-black text-orange-700">₹{totalPayables.toFixed(2)}</div>
          </div>
        </div>
      </header>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 flex-1 flex flex-col overflow-hidden">
        {/* Toolbar & Tabs */}
        <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-slate-50/50 backdrop-blur-sm">
          <div className="flex gap-2">
            <button 
              onClick={() => setActiveTab('customers')}
              className={`px-5 py-2.5 rounded-lg font-bold flex items-center transition-all ${activeTab === 'customers' ? 'bg-white text-blue-600 shadow-sm border border-slate-200' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100'}`}
            >
              <Users className="w-4 h-4 mr-2" />
              Customer Receivables
            </button>
            <button 
              onClick={() => setActiveTab('suppliers')}
              className={`px-5 py-2.5 rounded-lg font-bold flex items-center transition-all ${activeTab === 'suppliers' ? 'bg-white text-orange-600 shadow-sm border border-slate-200' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100'}`}
            >
              <Truck className="w-4 h-4 mr-2" />
              Supplier Payables
            </button>
          </div>

          <div className="relative w-80">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5" />
            <input 
              type="text" 
              placeholder={`Search ${activeTab}...`}
              className="w-full pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-slate-800 placeholder-slate-400 font-medium"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto flex-1 bg-white">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/80 backdrop-blur-sm border-b border-slate-200 text-slate-500 text-xs font-bold uppercase tracking-wider sticky top-0 z-10">
                <th className="px-6 py-4">{activeTab === 'customers' ? 'Customer' : 'Supplier'} Name</th>
                <th className="px-6 py-4">Contact</th>
                <th className="px-6 py-4 text-right">Outstanding Balance (₹)</th>
                <th className="px-6 py-4 text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {(activeTab === 'customers' ? filteredCustomers : filteredSuppliers).map((entity: any) => (
                <tr key={entity.id} className="hover:bg-slate-50/50 transition-colors border-b border-slate-50 last:border-0">
                  <td className="px-6 py-4">
                    <div className="font-bold text-slate-800">{entity.name}</div>
                    <div className="text-xs text-slate-400 mt-0.5">ID: #{entity.id}</div>
                  </td>
                  <td className="px-6 py-4 text-slate-500 text-sm font-medium">
                    {entity.phone || entity.email || <span className="text-slate-300 italic">N/A</span>}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <span className="font-black text-slate-800 text-lg">
                      ₹{entity.balance.toFixed(2)}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-center">
                    <button 
                      onClick={() => openPaymentModal(entity)}
                      className={`px-4 py-2 rounded-lg font-bold shadow-sm transition-all text-sm inline-flex items-center
                        ${activeTab === 'customers' 
                          ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200' 
                          : 'bg-orange-100 text-orange-700 hover:bg-orange-200'}`}
                    >
                      <IndianRupee className="w-4 h-4 mr-1.5" /> 
                      {activeTab === 'customers' ? 'Receive Payment' : 'Pay Supplier'}
                    </button>
                  </td>
                </tr>
              ))}
              {(activeTab === 'customers' ? filteredCustomers : filteredSuppliers).length === 0 && (
                <tr>
                  <td colSpan={4} className="p-16 text-center text-slate-500">
                    <div className="flex flex-col items-center justify-center">
                      <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mb-4">
                        <IndianRupee className="w-8 h-8 text-slate-300" />
                      </div>
                      <p className="font-medium text-slate-600">No outstanding {activeTab === 'customers' ? 'receivables' : 'payables'} found.</p>
                      <p className="text-sm mt-1">All dues are settled!</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Payment Modal */}
      {isModalOpen && selectedEntity && (
        <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden border border-slate-200 animate-in fade-in zoom-in duration-200">
            <div className={`px-6 py-5 border-b border-slate-100 flex justify-between items-center ${activeTab === 'customers' ? 'bg-emerald-50' : 'bg-orange-50'}`}>
              <div>
                <h2 className="text-lg font-bold text-slate-800">
                  {activeTab === 'customers' ? 'Receive Payment' : 'Make Payment'}
                </h2>
                <p className="text-sm font-medium text-slate-500 mt-0.5">{selectedEntity.name}</p>
              </div>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600 transition-colors bg-white rounded-full p-1 shadow-sm">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <form onSubmit={handleRecordPayment} className="p-6 flex flex-col gap-5">
              
              <div className="bg-slate-50 rounded-xl p-4 border border-slate-200 flex justify-between items-center">
                <span className="text-sm font-bold text-slate-500 uppercase tracking-wider">Current Balance</span>
                <span className="text-xl font-black text-slate-800">₹{selectedEntity.balance.toFixed(2)}</span>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Amount (₹) *</label>
                <input 
                  required 
                  type="number" 
                  step="0.01"
                  min="0.01"
                  max={selectedEntity.balance}
                  value={amount} 
                  onChange={e => setAmount(e.target.value === '' ? '' : Number(e.target.value))} 
                  className="w-full px-4 py-3 bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 text-lg font-bold text-slate-800 transition-all" 
                  placeholder="0.00" 
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Payment Mode *</label>
                  <select 
                    value={paymentMode} 
                    onChange={e => setPaymentMode(e.target.value)} 
                    className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium text-slate-800"
                  >
                    <option value="Cash">Cash</option>
                    <option value="UPI">UPI</option>
                    <option value="Bank Transfer">Bank Transfer</option>
                    <option value="Cheque">Cheque</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Reference No</label>
                  <input 
                    type="text" 
                    value={referenceNo} 
                    onChange={e => setReferenceNo(e.target.value)} 
                    className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium text-slate-800 placeholder-slate-400" 
                    placeholder="Txn ID / Cheque No" 
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Notes</label>
                <textarea 
                  rows={2} 
                  value={notes} 
                  onChange={e => setNotes(e.target.value)} 
                  className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none font-medium text-slate-800 placeholder-slate-400" 
                  placeholder="Optional details..." 
                />
              </div>
              
              <div className="mt-2 pt-5 border-t border-slate-100">
                <button 
                  type="submit" 
                  disabled={isProcessing || amount === '' || amount <= 0}
                  className={`w-full py-3.5 rounded-xl font-bold text-lg flex items-center justify-center transition-all shadow-lg
                    ${isProcessing || amount === '' || amount <= 0 
                      ? 'bg-slate-200 text-slate-400 shadow-none cursor-not-allowed' 
                      : activeTab === 'customers' 
                        ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-500/20' 
                        : 'bg-orange-600 hover:bg-orange-700 text-white shadow-orange-500/20'}`}
                >
                  <IndianRupee className="w-5 h-5 mr-2" /> 
                  {isProcessing ? 'Processing...' : `Record ${activeTab === 'customers' ? 'Receipt' : 'Payment'}`}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
