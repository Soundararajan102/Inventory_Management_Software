import { IndianRupee, TrendingUp, AlertCircle, ShoppingBag, Package, Receipt, Truck } from 'lucide-react';
import { useState, useEffect } from 'react';
import { getDashboardStats } from '../lib/db';
import type { DashboardStats } from '../lib/db';

export default function Dashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null);

  useEffect(() => {
    loadStats();
  }, []);

  async function loadStats() {
    try {
      setStats(await getDashboardStats());
    } catch (error) {
      console.error("Failed to load dashboard stats", error);
    }
  }

  return (
    <div className="p-8 h-full flex flex-col bg-slate-50 overflow-y-auto">
      <header className="mb-8">
        <h1 className="text-3xl font-bold text-slate-800 tracking-tight">Business Dashboard</h1>
        <p className="text-slate-500 mt-1">Real-time overview of your business metrics</p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 mb-8">
        <StatCard 
          title="Inventory Value" 
          value={stats ? `₹${stats.totalInventoryValue.toLocaleString(undefined, {minimumFractionDigits: 2})}` : '...'} 
          icon={Package} 
          color="bg-blue-100 text-blue-600" 
        />
        <StatCard 
          title="Total Receivables" 
          value={stats ? `₹${stats.totalReceivables.toLocaleString(undefined, {minimumFractionDigits: 2})}` : '...'} 
          icon={TrendingUp} 
          color="bg-emerald-100 text-emerald-600" 
        />
        <StatCard 
          title="Total Payables" 
          value={stats ? `₹${stats.totalPayables.toLocaleString(undefined, {minimumFractionDigits: 2})}` : '...'} 
          icon={Truck} 
          color="bg-orange-100 text-orange-600" 
        />
        <StatCard 
          title="Total Expenses" 
          value={stats ? `₹${stats.totalExpenses.toLocaleString(undefined, {minimumFractionDigits: 2})}` : '...'} 
          icon={Receipt} 
          color="bg-red-100 text-red-600" 
        />
        <StatCard 
          title="Total Products" 
          value={stats ? stats.totalProducts.toString() : '...'} 
          icon={ShoppingBag} 
          color="bg-purple-100 text-purple-600" 
        />
        <StatCard 
          title="Low Stock Items" 
          value={stats ? stats.lowStockItems.toString() : '...'} 
          icon={AlertCircle} 
          color={stats && stats.lowStockItems > 0 ? "bg-red-100 text-red-600" : "bg-green-100 text-green-600"} 
        />
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 flex-1">
        <h2 className="text-xl font-semibold mb-4 text-slate-800">Quick Actions</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <div className="p-6 border border-slate-100 rounded-xl bg-slate-50 flex flex-col items-center justify-center text-center">
             <IndianRupee className="w-10 h-10 text-emerald-500 mb-3" />
             <h3 className="font-bold text-slate-800">Record a Sale</h3>
             <p className="text-sm text-slate-500 mt-1">Go to POS / Billing</p>
          </div>
          <div className="p-6 border border-slate-100 rounded-xl bg-slate-50 flex flex-col items-center justify-center text-center">
             <Truck className="w-10 h-10 text-orange-500 mb-3" />
             <h3 className="font-bold text-slate-800">Restock Items</h3>
             <p className="text-sm text-slate-500 mt-1">Go to Purchases</p>
          </div>
          <div className="p-6 border border-slate-100 rounded-xl bg-slate-50 flex flex-col items-center justify-center text-center">
             <Receipt className="w-10 h-10 text-blue-500 mb-3" />
             <h3 className="font-bold text-slate-800">Log Expenses</h3>
             <p className="text-sm text-slate-500 mt-1">Go to Expenses</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ title, value, icon: Icon, color }: { title: string, value: string, icon: any, color: string }) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 flex items-center">
      <div className={`p-4 rounded-full mr-4 ${color}`}>
        <Icon className="w-6 h-6" />
      </div>
      <div>
        <p className="text-sm text-gray-500 font-medium">{title}</p>
        <p className="text-2xl font-bold text-gray-800">{value}</p>
      </div>
    </div>
  );
}
