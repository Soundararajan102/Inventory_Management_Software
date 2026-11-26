import { useState, useEffect, useMemo } from 'react';
import { Plus, X, Receipt, Banknote, Building, Wrench, Edit, Trash2, Calendar, TrendingUp } from 'lucide-react';
import { getExpenses, recordExpense, updateExpense, deleteExpense } from '../lib/db';
import type { Expense } from '../lib/db';
import { confirm } from '@tauri-apps/plugin-dialog';

const CATEGORIES = ['Rent', 'Salary', 'Maintenance', 'Utilities', 'Transport', 'Other'] as const;

export default function Expenses() {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>('All');

  // Form State
  const [category, setCategory] = useState<string>('Rent');
  const [amount, setAmount] = useState<number | ''>('');
  const [description, setDescription] = useState('');
  const [expenseDate, setExpenseDate] = useState(() => new Date().toISOString().split('T')[0]);

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

  async function handleSaveExpense(e: React.FormEvent) {
    e.preventDefault();
    if (amount === '' || amount <= 0) return;
    
    setIsProcessing(true);
    try {
      const formattedDate = expenseDate ? `${expenseDate} 12:00:00` : undefined;
      if (editingExpense) {
        await updateExpense(editingExpense.id, category, Number(amount), description, formattedDate);
      } else {
        await recordExpense(category, Number(amount), description, formattedDate);
      }
      setIsModalOpen(false);
      setEditingExpense(null);
      setCategory('Rent');
      setAmount('');
      setDescription('');
      setExpenseDate(new Date().toISOString().split('T')[0]);
      await loadExpenses();
    } catch (error) {
      console.error(error);
      alert(`Error saving expense: ${error}`);
    } finally {
      setIsProcessing(false);
    }
  }

  async function handleDeleteExpense(expense: Expense) {
    let isConfirmed = false;
    try {
      isConfirmed = await confirm(`Are you sure you want to delete this ${expense.category} expense of ₹${expense.amount.toFixed(2)}?`, {
        title: 'Delete Expense',
        kind: 'warning'
      });
    } catch {
      isConfirmed = window.confirm(`Are you sure you want to delete this ${expense.category} expense of ₹${expense.amount.toFixed(2)}?`);
    }

    if (!isConfirmed) return;

    setIsProcessing(true);
    try {
      await deleteExpense(expense.id);
      if (isModalOpen && editingExpense?.id === expense.id) {
        setIsModalOpen(false);
        setEditingExpense(null);
      }
      await loadExpenses();
    } catch (error) {
      console.error(error);
      alert(`Error deleting expense: ${error}`);
    } finally {
      setIsProcessing(false);
    }
  }

  function openNewExpenseModal() {
    setEditingExpense(null);
    setCategory('Rent');
    setAmount('');
    setDescription('');
    setExpenseDate(new Date().toISOString().split('T')[0]);
    setIsModalOpen(true);
  }

  function openEditExpenseModal(expense: Expense) {
    setEditingExpense(expense);
    setCategory(expense.category);
    setAmount(expense.amount);
    setDescription(expense.description || '');
    const cleanDate = expense.date ? expense.date.split(' ')[0].split('T')[0] : new Date().toISOString().split('T')[0];
    setExpenseDate(cleanDate);
    setIsModalOpen(true);
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

  const filteredExpenses = useMemo(() => {
    if (selectedCategory === 'All') return expenses;
    return expenses.filter(e => e.category === selectedCategory);
  }, [expenses, selectedCategory]);

  const summary = useMemo(() => {
    const total = expenses.reduce((s, e) => s + (e.amount || 0), 0);
    const now = new Date();
    const currentMonthPrefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const thisMonthTotal = expenses
      .filter(e => e.date && e.date.startsWith(currentMonthPrefix))
      .reduce((s, e) => s + (e.amount || 0), 0);
    return {
      total,
      thisMonthTotal,
      count: expenses.length,
      filteredTotal: filteredExpenses.reduce((s, e) => s + (e.amount || 0), 0)
    };
  }, [expenses, filteredExpenses]);

  return (
    <div className="p-6 md:p-8 h-full flex flex-col relative bg-canvas">
      <header className="mb-6 flex flex-wrap justify-between items-center gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-display font-bold text-ink tracking-tight">Expenses</h1>
          <p className="text-muted text-sm mt-1">Track business overheads and day-to-day spending</p>
        </div>
        <button 
          onClick={openNewExpenseModal}
          className="bg-primary hover:bg-primary-active text-on-primary px-5 py-2.5 rounded-xl font-semibold shadow-sm hover:shadow flex items-center transition-all text-sm"
        >
          <Plus className="w-4 h-4 mr-2" />
          Add Expense
        </button>
      </header>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div className="bg-surface border border-hairline rounded-xl p-4 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-muted uppercase tracking-wider">Total Recorded</p>
            <p className="text-2xl font-bold text-ink mt-1">₹{summary.total.toFixed(2)}</p>
            <p className="text-xs text-muted mt-0.5">{summary.count} entries</p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
            <TrendingUp className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-surface border border-hairline rounded-xl p-4 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-muted uppercase tracking-wider">This Month</p>
            <p className="text-2xl font-bold text-primary mt-1">₹{summary.thisMonthTotal.toFixed(2)}</p>
            <p className="text-xs text-muted mt-0.5">Current billing cycle</p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-surface-soft text-muted flex items-center justify-center border border-hairline">
            <Calendar className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-surface border border-hairline rounded-xl p-4 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-muted uppercase tracking-wider">{selectedCategory === 'All' ? 'Active View' : `${selectedCategory} Total`}</p>
            <p className="text-2xl font-bold text-ink mt-1">₹{summary.filteredTotal.toFixed(2)}</p>
            <p className="text-xs text-muted mt-0.5">{filteredExpenses.length} matching</p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-surface-soft text-muted flex items-center justify-center border border-hairline">
            <Receipt className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Category Filter Chips */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2 mb-4">
        <button
          type="button"
          onClick={() => setSelectedCategory('All')}
          className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all shrink-0 border ${
            selectedCategory === 'All'
              ? 'bg-primary text-on-primary border-primary shadow-sm'
              : 'bg-surface text-muted hover:text-ink border-hairline hover:bg-surface-soft'
          }`}
        >
          All Categories ({expenses.length})
        </button>
        {CATEGORIES.map(cat => {
          const catCount = expenses.filter(e => e.category === cat).length;
          return (
            <button
              key={cat}
              type="button"
              onClick={() => setSelectedCategory(cat)}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all shrink-0 border flex items-center gap-1.5 ${
                selectedCategory === cat
                  ? 'bg-primary text-on-primary border-primary shadow-sm'
                  : 'bg-surface text-muted hover:text-ink border-hairline hover:bg-surface-soft'
              }`}
            >
              <span>{cat}</span>
              <span className="opacity-70 text-[10px]">({catCount})</span>
            </button>
          );
        })}
      </div>

      <div className="bg-surface rounded-xl shadow-sm border border-hairline flex-1 flex flex-col overflow-hidden">
        {/* Table */}
        <div className="overflow-x-auto flex-1">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-surface-soft border-b border-hairline text-muted text-xs font-bold uppercase tracking-wider sticky top-0 z-10">
                <th className="px-6 py-4">Category</th>
                <th className="px-6 py-4">Description</th>
                <th className="px-6 py-4">Date</th>
                <th className="px-6 py-4 text-right">Amount (₹)</th>
                <th className="px-6 py-4 w-24 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline">
              {filteredExpenses.map((expense) => (
                <tr key={expense.id} className="hover:bg-surface-soft/50 transition-colors border-b border-hairline/50 last:border-0 group">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0">
                        {getCategoryIcon(expense.category)}
                      </div>
                      <span className="font-bold text-ink text-sm">{expense.category}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-muted text-sm">
                    {expense.description || <span className="italic text-muted/50">None</span>}
                  </td>
                  <td className="px-6 py-4 text-muted text-sm">
                    {new Date(expense.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <span className="font-bold text-ink text-base">₹{expense.amount.toFixed(2)}</span>
                  </td>
                  <td className="px-6 py-4 text-center">
                    <div className="flex items-center justify-center gap-1 opacity-80 group-hover:opacity-100 transition-opacity">
                      <button 
                        onClick={() => openEditExpenseModal(expense)}
                        className="p-1.5 text-muted hover:text-primary hover:bg-surface-soft rounded-lg transition-colors"
                        title="Edit Expense"
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                      <button 
                        onClick={() => handleDeleteExpense(expense)}
                        className="p-1.5 text-muted hover:text-red-600 hover:bg-red-500/10 rounded-lg transition-colors"
                        title="Delete Expense"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filteredExpenses.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-16 text-center text-muted">
                    <div className="flex flex-col items-center justify-center">
                      <div className="w-14 h-14 bg-surface-soft rounded-full flex items-center justify-center mb-4 border border-hairline">
                        <Banknote className="w-7 h-7 text-muted/40" />
                      </div>
                      <p className="font-medium text-ink">No expenses found</p>
                      <p className="text-xs text-muted mt-1">
                        {selectedCategory === 'All' ? 'Record an expense to track it here.' : `No expenses found in category "${selectedCategory}".`}
                      </p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add / Edit Expense Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-ink/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-canvas rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden border border-hairline animate-in fade-in zoom-in duration-200">
            <div className="px-6 py-4 border-b border-hairline flex justify-between items-center bg-surface">
              <h2 className="text-base font-bold text-ink">{editingExpense ? 'Edit Expense' : 'Record Expense'}</h2>
              <button onClick={() => setIsModalOpen(false)} className="text-muted hover:text-ink transition-colors bg-surface-soft rounded-full p-1 border border-hairline">
                <X className="w-4 h-4" />
              </button>
            </div>
            
            <form onSubmit={handleSaveExpense} className="p-6 flex flex-col gap-4">
              <div>
                <label className="block text-xs font-bold text-ink uppercase tracking-wider mb-1.5">Category *</label>
                <select 
                  value={category} 
                  onChange={e => setCategory(e.target.value)} 
                  className="w-full px-3 py-2 bg-surface border border-hairline rounded-lg focus:outline-none focus:ring-1 focus:ring-primary/20 focus:border-primary font-medium text-ink text-sm"
                >
                  {CATEGORIES.map(cat => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-ink uppercase tracking-wider mb-1.5">Date *</label>
                <input 
                  required
                  type="date"
                  value={expenseDate}
                  onChange={e => setExpenseDate(e.target.value)}
                  className="w-full px-3 py-2 bg-surface border border-hairline rounded-lg focus:outline-none focus:ring-1 focus:ring-primary/20 focus:border-primary font-medium text-ink text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-ink uppercase tracking-wider mb-1.5">Amount (₹) *</label>
                <input 
                  required 
                  type="number" 
                  step="0.01"
                  min="0.01"
                  value={amount} 
                  onChange={e => setAmount(e.target.value === '' ? '' : Number(e.target.value))} 
                  className="w-full px-3 py-2 bg-surface border border-hairline rounded-lg focus:outline-none focus:ring-1 focus:ring-primary/20 focus:border-primary text-lg font-bold text-ink" 
                  placeholder="0.00" 
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-ink uppercase tracking-wider mb-1.5">Description</label>
                <textarea 
                  rows={2} 
                  value={description} 
                  onChange={e => setDescription(e.target.value)} 
                  className="w-full px-3 py-2 bg-surface border border-hairline rounded-lg focus:outline-none focus:ring-1 focus:ring-primary/20 focus:border-primary resize-none font-medium text-ink text-sm" 
                  placeholder="What was this expense for?" 
                />
              </div>
              
              <div className="mt-2 pt-4 border-t border-hairline flex gap-2">
                {editingExpense && (
                  <button 
                    type="button"
                    onClick={() => handleDeleteExpense(editingExpense)}
                    disabled={isProcessing}
                    className="px-3 py-2.5 rounded-lg font-bold text-xs text-red-600 hover:bg-red-500/10 border border-red-500/20 transition-colors flex items-center justify-center gap-1 shrink-0"
                    title="Delete Expense"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Delete</span>
                  </button>
                )}
                <button 
                  type="submit" 
                  disabled={isProcessing || amount === '' || amount <= 0}
                  className="flex-1 py-2.5 rounded-lg font-bold text-sm flex items-center justify-center transition-all shadow-sm bg-primary hover:bg-primary-active disabled:bg-slate-300 disabled:text-slate-500 disabled:cursor-not-allowed text-on-primary"
                >
                  {isProcessing ? 'Saving...' : (editingExpense ? 'Update Expense' : 'Save Expense')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
