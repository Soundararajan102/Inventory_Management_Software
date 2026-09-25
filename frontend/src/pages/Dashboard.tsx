import { IndianRupee, TrendingUp, AlertCircle, ShoppingBag, Package, Receipt, Truck, LineChart, Users, FileText, RotateCcw, Settings, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { getDashboardStats } from '../lib/db';
import type { DashboardStats } from '../lib/db';

const ALL_QUICK_ACTIONS = [
  { id: 'pos', title: 'Record a Sale', desc: 'Go to POS / Billing', to: '/pos', icon: IndianRupee, bgHover: 'hover:bg-emerald-50', borderHover: 'hover:border-emerald-200', iconColor: 'text-emerald-500' },
  { id: 'purchases', title: 'Restock Items', desc: 'Go to Purchases', to: '/purchases', icon: Truck, bgHover: 'hover:bg-orange-50', borderHover: 'hover:border-orange-200', iconColor: 'text-orange-500' },
  { id: 'expenses', title: 'Log Expenses', desc: 'Go to Expenses', to: '/expenses', icon: Receipt, bgHover: 'hover:bg-blue-50', borderHover: 'hover:border-blue-200', iconColor: 'text-blue-500' },
  { id: 'inventory', title: 'View Inventory', desc: 'Manage stock', to: '/inventory', icon: Package, bgHover: 'hover:bg-purple-50', borderHover: 'hover:border-purple-200', iconColor: 'text-purple-500' },
  { id: 'contacts', title: 'Manage Contacts', desc: 'Customers & Suppliers', to: '/contacts', icon: Users, bgHover: 'hover:bg-indigo-50', borderHover: 'hover:border-indigo-200', iconColor: 'text-indigo-500' },
  { id: 'reports', title: 'View Reports', desc: 'Sales & Purchases', to: '/reports', icon: FileText, bgHover: 'hover:bg-rose-50', borderHover: 'hover:border-rose-200', iconColor: 'text-rose-500' },
  { id: 'returns', title: 'Process Return', desc: 'Sales & Purchase Returns', to: '/returns', icon: RotateCcw, bgHover: 'hover:bg-amber-50', borderHover: 'hover:border-amber-200', iconColor: 'text-amber-500' },
];

export default function Dashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [selectedActions, setSelectedActions] = useState<string[]>([]);
  const [tempSelected, setTempSelected] = useState<string[]>([]);

  useEffect(() => {
    loadStats();
    const saved = localStorage.getItem('quickActions');
    if (saved) {
      setSelectedActions(JSON.parse(saved));
    } else {
      setSelectedActions(['pos', 'purchases', 'expenses']);
    }
  }, []);

  async function loadStats() {
    try {
      setStats(await getDashboardStats());
    } catch (error) {
      console.error("Failed to load dashboard stats", error);
    }
  }

  return (
    <div className="p-8 h-full flex flex-col bg-canvas overflow-y-auto">
      <header className="mb-8">
        <h1 className="text-4xl font-display font-medium text-ink tracking-tight">Business Dashboard</h1>
        <p className="text-base text-body mt-2">Real-time overview of your business metrics</p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 mb-8">
        <StatCard 
          title="Net Profit" 
          value={stats ? `₹${stats.netProfit.toLocaleString(undefined, {minimumFractionDigits: 2})}` : '...'} 
          icon={LineChart} 
          color={stats && stats.netProfit >= 0 ? "bg-emerald-100 text-emerald-600" : "bg-red-100 text-red-600"} 
        />
        <StatCard 
          title="Total Sales" 
          value={stats ? `₹${stats.totalSales.toLocaleString(undefined, {minimumFractionDigits: 2})}` : '...'} 
          icon={IndianRupee} 
          color="bg-blue-100 text-blue-600" 
        />
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

      <div className="bg-canvas rounded-xl shadow-sm border border-hairline p-6 flex-1">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-bold text-ink">Quick Actions</h2>
          <button 
            onClick={() => {
              setTempSelected(selectedActions);
              setIsEditModalOpen(true);
            }}
            className="text-muted hover:text-primary transition-colors flex items-center gap-1 text-sm font-medium"
          >
            <Settings className="w-4 h-4" /> Edit
          </button>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {ALL_QUICK_ACTIONS.filter(a => selectedActions.includes(a.id)).map(action => (
            <Link key={action.id} to={action.to} className={`p-6 border border-hairline rounded-xl bg-canvas shadow-sm hover:shadow-md ${action.bgHover} transition-all cursor-pointer flex flex-col items-center justify-center text-center group`}>
               <action.icon className={`w-10 h-10 ${action.iconColor} mb-3 group-hover:scale-110 transition-transform`} />
               <h3 className="font-bold text-ink">{action.title}</h3>
               <p className="text-sm text-muted mt-1">{action.desc}</p>
            </Link>
          ))}
          {selectedActions.length === 0 && (
            <div className="col-span-full p-8 text-center text-muted border-2 border-dashed border-hairline rounded-xl">
              No quick actions selected. Click Edit to add some!
            </div>
          )}
        </div>
      </div>

      {isEditModalOpen && (
        <div className="absolute inset-0 bg-ink/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-canvas rounded-xl shadow-2xl w-full max-w-md overflow-hidden border border-hairline animate-in fade-in zoom-in duration-200">
            <div className="px-6 py-5 border-b border-hairline flex justify-between items-center bg-surface-soft">
              <h2 className="text-lg font-bold text-ink flex items-center gap-2">
                <Settings className="w-5 h-5 text-muted" /> Customize Actions
              </h2>
              <button onClick={() => setIsEditModalOpen(false)} className="text-muted hover:text-ink transition-colors p-1">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-6 max-h-[60vh] overflow-y-auto">
              <p className="text-sm text-body mb-4">Select the shortcuts you want to appear on your dashboard.</p>
              <div className="space-y-3">
                {ALL_QUICK_ACTIONS.map(action => (
                  <label key={action.id} className="flex items-center gap-3 p-3 border border-hairline rounded-xl hover:bg-surface-soft cursor-pointer transition-colors shadow-sm">
                    <input 
                      type="checkbox" 
                      checked={tempSelected.includes(action.id)}
                      onChange={(e) => {
                        if (e.target.checked) setTempSelected([...tempSelected, action.id]);
                        else setTempSelected(tempSelected.filter(id => id !== action.id));
                      }}
                      className="w-5 h-5 rounded text-primary border-hairline focus:ring-primary"
                    />
                    <div className="flex items-center gap-3 flex-1">
                      <action.icon className={`w-5 h-5 ${action.iconColor}`} />
                      <div className="flex flex-col">
                        <span className="font-bold text-ink text-sm">{action.title}</span>
                      </div>
                    </div>
                  </label>
                ))}
              </div>
            </div>
            
            <div className="p-4 border-t border-hairline bg-canvas flex justify-end gap-3">
              <button 
                onClick={() => setIsEditModalOpen(false)}
                className="px-4 py-2 text-ink hover:bg-surface-soft rounded-lg font-medium transition-colors border border-hairline"
              >
                Cancel
              </button>
              <button 
                onClick={() => {
                  setSelectedActions(tempSelected);
                  localStorage.setItem('quickActions', JSON.stringify(tempSelected));
                  setIsEditModalOpen(false);
                }}
                className="px-4 py-2 bg-primary hover:bg-primary-active text-on-primary rounded-lg font-medium shadow-sm transition-colors"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ title, value, icon: Icon, color }: { title: string, value: string, icon: any, color: string }) {
  return (
    <div className="bg-canvas rounded-xl shadow-sm border border-hairline p-6 flex items-center">
      <div className={`p-4 rounded-full mr-4 ${color}`}>
        <Icon className="w-6 h-6" />
      </div>
      <div>
        <p className="text-sm text-muted font-medium">{title}</p>
        <p className="text-2xl font-bold text-ink">{value}</p>
      </div>
    </div>
  );
}
