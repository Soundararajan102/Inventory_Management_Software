import { useState, useEffect } from 'react';
import { Plus, X, Receipt, Banknote, Building, Wrench } from 'lucide-react';
import { getExpenses, recordExpense } from '../lib/db';
import type { Expense } from '../lib/db';

export default function Expenses() {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  // Form State
  const [category, setCategory] = useState('Rent');
  const [amount, setAmount] = useState<number | ''>('');
  const [description, setDescription] = useState('');

  useEffect(() => {
    loadExpenses();
  }, []);

  async function loadExpenses() {
    try {
      setExpenses(await getExpenses());
    } catch (e) {
      console.error(e);
    }
  }

  async function handleAddExpense(e: React.FormEvent) {
    e.preventDefault();
    if (amount === '' || amount <= 0) return;
    
    setIsProcessing(true);
    try {
      await recordExpense(category, Number(amount), description);
      setIsModalOpen(false);
      setCategory('Rent');
      setAmount('');
      setDescription('');
      loadExpenses();
    } catch (error) {
      console.error(error);
      alert(`Error adding expense: ${error}`);
    } finally {
      setIsProcessing(false);
    }
  }

  const getCategoryIcon = (cat: string) => {
    if (cat === 'Rent') return <Building className="w-5 h-5" />;
    if (cat === 'Maintenance') return <Wrench className="w-5 h-5" />;
    if (cat === 'Salary') return <UsersIcon className="w-5 h-5" />;
    return <Receipt className="w-5 h-5" />;
  };

  const UsersIcon = ({ className }: { className?: string }) => (
    <svg className={className} xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
  );

  return (
    <div className="p-8 h-full flex flex-col relative bg-slate-50">
      <header className="mb-6 flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-slate-800 tracking-tight">Expenses</h1>
          <p className="text-slate-500 mt-1">Track business overheads and day-to-day spending</p>
        </div>
        <button 
          onClick={() => setIsModalOpen(true)}
          className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-xl font-semibold shadow-sm hover:shadow flex items-center transition-all"
        >
          <Plus className="w-5 h-5 mr-2" />
          Add Expense
        </button>
      </header>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 flex-1 flex flex-col overflow-hidden">
        {/* Table */}
        <div className="overflow-x-auto flex-1">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/80 backdrop-blur-sm border-b border-slate-200 text-slate-500 text-xs font-bold uppercase tracking-wider sticky top-0 z-10">
                <th className="px-6 py-4">Category</th>
                <th className="px-6 py-4">Description</th>
                <th className="px-6 py-4">Date</th>
                <th className="px-6 py-4 text-right">Amount (₹)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {expenses.map((expense) => (
                <tr key={expense.id} className="hover:bg-slate-50/50 transition-colors border-b border-slate-50 last:border-0 group">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center">
                        {getCategoryIcon(expense.category)}
                      </div>
                      <span className="font-bold text-slate-800">{expense.category}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-slate-600 text-sm">
                    {expense.description || <span className="italic text-slate-400">None</span>}
                  </td>
                  <td className="px-6 py-4 text-slate-500 text-sm">
                    {new Date(expense.date).toLocaleString()}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <span className="font-bold text-slate-800">₹{expense.amount.toFixed(2)}</span>
                  </td>
                </tr>
              ))}
              {expenses.length === 0 && (
                <tr>
                  <td colSpan={4} className="p-16 text-center text-slate-500">
                    <div className="flex flex-col items-center justify-center">
                      <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mb-4">
                        <Banknote className="w-8 h-8 text-slate-300" />
                      </div>
                      <p className="font-medium text-slate-600">No expenses recorded yet.</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Expense Modal */}
      {isModalOpen && (
        <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden border border-slate-200 animate-in fade-in zoom-in duration-200">
            <div className="px-6 py-5 border-b border-slate-100 flex justify-between items-center bg-blue-50">
              <h2 className="text-lg font-bold text-slate-800">Record Expense</h2>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600 transition-colors bg-white rounded-full p-1 shadow-sm">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <form onSubmit={handleAddExpense} className="p-6 flex flex-col gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Category *</label>
                <select 
                  value={category} 
                  onChange={e => setCategory(e.target.value)} 
                  className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium text-slate-800"
                >
                  <option value="Rent">Rent</option>
                  <option value="Salary">Salary</option>
                  <option value="Maintenance">Maintenance</option>
                  <option value="Utilities">Utilities (Electricity/Water)</option>
                  <option value="Transport">Transport / Logistics</option>
                  <option value="Other">Other</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Amount (₹) *</label>
                <input 
                  required 
                  type="number" 
                  step="0.01"
                  min="0.01"
                  value={amount} 
                  onChange={e => setAmount(e.target.value === '' ? '' : Number(e.target.value))} 
                  className="w-full px-4 py-3 bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 text-lg font-bold text-slate-800" 
                  placeholder="0.00" 
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Description</label>
                <textarea 
                  rows={2} 
                  value={description} 
                  onChange={e => setDescription(e.target.value)} 
                  className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none font-medium text-slate-800" 
                  placeholder="What was this expense for?" 
                />
              </div>
              
              <div className="mt-2 pt-4 border-t border-slate-100">
                <button 
                  type="submit" 
                  disabled={isProcessing || amount === '' || amount <= 0}
                  className={`w-full py-3 rounded-xl font-bold text-lg flex items-center justify-center transition-all shadow-md
                    ${isProcessing || amount === '' || amount <= 0 
                      ? 'bg-slate-200 text-slate-400 shadow-none cursor-not-allowed' 
                      : 'bg-blue-600 hover:bg-blue-700 text-white shadow-blue-500/20'}`}
                >
                  {isProcessing ? 'Saving...' : 'Save Expense'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
