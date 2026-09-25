import { useState, useEffect } from 'react';
import { Search, X, Users, Truck, IndianRupee, Clock } from 'lucide-react';
import { getCustomers, getSuppliers, recordPayment, getPaymentsHistory } from '../lib/db';
import type { Customer, Supplier, PaymentHistory } from '../lib/db';

export default function Payments() {
  const [activeTab, setActiveTab] = useState<'customers' | 'suppliers'>('customers');
  const [search, setSearch] = useState('');
  
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  
  const [selectedEntity, setSelectedEntity] = useState<Customer | Supplier | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [history, setHistory] = useState<PaymentHistory[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  
  // Payment Form State
  const [amount, setAmount] = useState<number | ''>('');
  const [paymentMode, setPaymentMode] = useState('Cash');
  const [referenceNo, setReferenceNo] = useState('');
  const [notes, setNotes] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    loadData();
  }, [activeTab]);

  async function loadData() {
    try {
      setCustomers(await getCustomers());
      setSuppliers(await getSuppliers());
      const type = activeTab === 'customers' ? 'customer' : 'supplier';
      setHistory(await getPaymentsHistory(type));
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
    <div className="p-8 h-full flex flex-col relative bg-canvas overflow-y-auto">
      <header className="mb-12 flex justify-between items-end">
        <div>
          <h1 className="text-4xl font-display font-medium text-ink tracking-tight">Payments & Outstanding</h1>
          <p className="text-body text-base mt-2">Track receivables from customers and payables to suppliers.</p>
        </div>
        <div className="flex gap-4">
          <div className="bg-signature-forest text-on-primary px-6 py-4 rounded-lg min-w-[200px]">
            <div className="text-xs font-medium text-on-primary/80 uppercase tracking-wider mb-2">Total Receivables</div>
            <div className="text-3xl font-display text-on-primary">₹{totalReceivables.toFixed(2)}</div>
          </div>
          <div className="bg-signature-coral text-on-primary px-6 py-4 rounded-lg min-w-[200px]">
            <div className="text-xs font-medium text-on-primary/80 uppercase tracking-wider mb-2">Total Payables</div>
            <div className="text-3xl font-display text-on-primary">₹{totalPayables.toFixed(2)}</div>
          </div>
        </div>
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
              Customer Receivables
            </button>
            <button 
              onClick={() => setActiveTab('suppliers')}
              className={`px-4 py-2 rounded-md font-medium text-sm flex items-center transition-colors ${activeTab === 'suppliers' ? 'bg-surface-soft text-ink border border-hairline' : 'text-muted hover:text-ink hover:bg-surface-soft border border-transparent'}`}
            >
              <Truck className="w-4 h-4 mr-2" />
              Supplier Payables
            </button>
          </div>

          <div className="flex items-center gap-3">
            <button 
              onClick={() => setShowHistory(!showHistory)}
              className={`px-4 py-2 rounded-md font-medium text-sm flex items-center transition-colors border ${showHistory ? 'bg-primary text-on-primary border-transparent' : 'bg-canvas text-ink border-hairline hover:bg-surface-soft'}`}
            >
              <Clock className="w-4 h-4 mr-2" />
              {showHistory ? 'View Outstanding' : 'View History'}
            </button>
            <div className="relative w-80">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted w-4 h-4" />
              <input 
                type="text" 
                placeholder={`Search ${activeTab}...`}
                className="w-full pl-9 pr-4 py-2 bg-canvas border border-hairline rounded-sm focus:outline-none focus:border-ink transition-colors text-ink placeholder-muted text-sm"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto flex-1 bg-canvas">
          {!showHistory ? (
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-surface-soft border-b border-hairline text-muted text-xs font-medium uppercase tracking-wider sticky top-0 z-10">
                  <th className="px-6 py-4">{activeTab === 'customers' ? 'Customer' : 'Supplier'} Name</th>
                  <th className="px-6 py-4">Contact</th>
                  <th className="px-6 py-4 text-right">Outstanding Balance (₹)</th>
                  <th className="px-6 py-4 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-hairline">
                {(activeTab === 'customers' ? filteredCustomers : filteredSuppliers).map((entity: any) => (
                  <tr key={entity.id} className="hover:bg-surface-soft transition-colors border-b border-hairline last:border-0">
                    <td className="px-6 py-4">
                      <div className="font-medium text-ink">{entity.name}</div>
                      <div className="text-xs text-muted mt-0.5">ID: #{entity.id}</div>
                    </td>
                    <td className="px-6 py-4 text-muted text-sm">
                      {entity.phone || entity.email || <span className="italic">N/A</span>}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <span className="font-medium text-ink text-base">
                        ₹{entity.balance.toFixed(2)}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <button 
                        onClick={() => openPaymentModal(entity)}
                        className="px-4 py-2 rounded-sm font-medium transition-colors text-sm inline-flex items-center bg-canvas text-ink border border-hairline hover:bg-surface-soft"
                      >
                        <IndianRupee className="w-4 h-4 mr-1.5" /> 
                        {activeTab === 'customers' ? 'Receive Payment' : 'Pay Supplier'}
                      </button>
                    </td>
                  </tr>
                ))}
                {(activeTab === 'customers' ? filteredCustomers : filteredSuppliers).length === 0 && (
                  <tr>
                    <td colSpan={4} className="p-16 text-center text-muted">
                      <div className="flex flex-col items-center justify-center">
                        <div className="w-16 h-16 bg-surface-soft rounded-full flex items-center justify-center mb-4 border border-hairline">
                          <IndianRupee className="w-6 h-6 text-muted" />
                        </div>
                        <p className="font-medium text-ink">No outstanding {activeTab === 'customers' ? 'receivables' : 'payables'} found.</p>
                        <p className="text-sm mt-1">All dues are settled.</p>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          ) : (
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-canvas border-b border-hairline text-muted text-xs font-medium uppercase tracking-wider sticky top-0 z-10">
                  <th className="px-6 py-4">Date</th>
                  <th className="px-6 py-4">{activeTab === 'customers' ? 'Customer' : 'Supplier'} Name</th>
                  <th className="px-6 py-4">Mode</th>
                  <th className="px-6 py-4 text-right">Amount (₹)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-hairline">
                {history.map((record) => (
                  <tr key={record.id} className="hover:bg-surface-soft transition-colors border-b border-hairline last:border-0">
                    <td className="px-6 py-4 text-muted text-sm font-medium">{record.date.split(' ')[0]}</td>
                    <td className="px-6 py-4">
                      <div className="font-medium text-ink">{record.entity_name}</div>
                      <div className="text-xs text-muted mt-0.5">ID: #{record.entity_id}</div>
                    </td>
                    <td className="px-6 py-4 text-muted text-sm">{record.payment_mode}</td>
                    <td className="px-6 py-4 text-right font-medium text-ink text-base">₹{record.amount.toFixed(2)}</td>
                  </tr>
                ))}
                {history.length === 0 && (
                  <tr>
                    <td colSpan={4} className="p-16 text-center text-muted">
                      <p className="font-medium text-sm">No payment history found.</p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Payment Modal */}
      {isModalOpen && selectedEntity && (
        <div className="absolute inset-0 bg-ink/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-canvas rounded-lg shadow-xl w-full max-w-md overflow-hidden border border-hairline">
            <div className="px-6 py-5 border-b border-hairline flex justify-between items-center bg-surface-soft">
              <div>
                <h2 className="text-lg font-medium text-ink">
                  {activeTab === 'customers' ? 'Receive Payment' : 'Make Payment'}
                </h2>
                <p className="text-sm text-muted mt-0.5">{selectedEntity.name}</p>
              </div>
              <button onClick={() => setIsModalOpen(false)} className="text-muted hover:text-ink transition-colors p-1">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <form onSubmit={handleRecordPayment} className="p-6 flex flex-col gap-6">
              
              <div className="bg-surface-soft rounded-md p-4 border border-hairline flex justify-between items-center">
                <span className="text-sm font-medium text-muted uppercase tracking-wider">Current Balance</span>
                <span className="text-xl font-display text-ink">₹{selectedEntity.balance.toFixed(2)}</span>
              </div>

              <div>
                <label className="block text-xs font-medium text-muted uppercase tracking-wider mb-2">Amount (₹)</label>
                <input 
                  required 
                  type="number" 
                  step="0.01"
                  min="0.01"
                  max={selectedEntity.balance}
                  value={amount} 
                  onChange={e => setAmount(e.target.value === '' ? '' : Number(e.target.value))} 
                  className="w-full px-4 py-3 bg-canvas border border-hairline rounded-sm focus:outline-none focus:border-ink text-base text-ink transition-colors" 
                  placeholder="0.00" 
                />
              </div>


              
              <div className="mt-4">
                <button 
                  type="submit" 
                  disabled={isProcessing || amount === '' || amount <= 0}
                  className={`w-full py-3 rounded-lg font-medium text-base flex items-center justify-center transition-colors
                    ${isProcessing || amount === '' || amount <= 0 
                      ? 'bg-surface-strong text-muted cursor-not-allowed' 
                      : 'bg-primary hover:bg-primary-active text-on-primary'}`}
                >
                  <IndianRupee className="w-4 h-4 mr-2" /> 
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
