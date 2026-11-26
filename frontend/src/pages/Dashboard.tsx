import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  IndianRupee,
  TrendingUp,
  AlertCircle,
  ShoppingBag,
  Package,
  Receipt,
  Truck,
  LineChart,
  Users,
  FileText,
  RotateCcw,
  Settings,
  X,
  ArrowUpRight,
  ChevronRight,
  TrendingDown,
  Clock,
  Sparkles,
  Layers,
  ArrowRight,
  CreditCard,
  AlertTriangle,
  CheckCircle2
} from 'lucide-react';
import { getDashboardStats, getDashboardExtraData } from '../lib/db';
import type { DashboardStats, DashboardExtraData } from '../lib/db';

const ALL_QUICK_ACTIONS = [
  { id: 'pos', title: 'Record a Sale', desc: 'Go to POS / Billing', to: '/pos', icon: IndianRupee, bgHover: 'hover:bg-emerald-50 hover:border-emerald-200', iconColor: 'text-emerald-600', iconBg: 'bg-emerald-100' },
  { id: 'purchases', title: 'Restock Items', desc: 'Go to Purchases', to: '/purchases', icon: Truck, bgHover: 'hover:bg-blue-50 hover:border-blue-200', iconColor: 'text-blue-600', iconBg: 'bg-blue-100' },
  { id: 'expenses', title: 'Log Expenses', desc: 'Go to Expenses', to: '/expenses', icon: Receipt, bgHover: 'hover:bg-amber-50 hover:border-amber-200', iconColor: 'text-amber-600', iconBg: 'bg-amber-100' },
  { id: 'payments', title: 'Cheques & Payments', desc: 'Cheques & party balances', to: '/payments', icon: CreditCard, bgHover: 'hover:bg-indigo-50 hover:border-indigo-200', iconColor: 'text-indigo-600', iconBg: 'bg-indigo-100' },
  { id: 'inventory', title: 'View Inventory', desc: 'Manage stock', to: '/inventory', icon: Package, bgHover: 'hover:bg-purple-50 hover:border-purple-200', iconColor: 'text-purple-600', iconBg: 'bg-purple-100' },
  { id: 'contacts', title: 'Manage Contacts', desc: 'Customers & Suppliers', to: '/contacts', icon: Users, bgHover: 'hover:bg-cyan-50 hover:border-cyan-200', iconColor: 'text-cyan-600', iconBg: 'bg-cyan-100' },
  { id: 'reports', title: 'View Reports', desc: 'Sales & Purchases', to: '/reports', icon: FileText, bgHover: 'hover:bg-rose-50 hover:border-rose-200', iconColor: 'text-rose-600', iconBg: 'bg-rose-100' },
  { id: 'returns', title: 'Process Return', desc: 'Sales & Purchase Returns', to: '/returns', icon: RotateCcw, bgHover: 'hover:bg-teal-50 hover:border-teal-200', iconColor: 'text-teal-600', iconBg: 'bg-teal-100' },
];

export default function Dashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [extraData, setExtraData] = useState<DashboardExtraData | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [selectedActions, setSelectedActions] = useState<string[]>([]);
  const [tempSelected, setTempSelected] = useState<string[]>([]);

  useEffect(() => {
    loadAllData();
    const saved = localStorage.getItem('quickActions');
    if (saved) {
      try {
        setSelectedActions(JSON.parse(saved));
      } catch {
        setSelectedActions(['pos', 'purchases', 'expenses', 'payments']);
      }
    } else {
      setSelectedActions(['pos', 'purchases', 'expenses', 'payments']);
    }

    const handlePrefChange = () => {
      loadAllData();
    };
    window.addEventListener('preferencesUpdated', handlePrefChange);
    return () => window.removeEventListener('preferencesUpdated', handlePrefChange);
  }, []);

  async function loadAllData() {
    try {
      const [statsData, extra] = await Promise.all([
        getDashboardStats(),
        getDashboardExtraData().catch(() => null)
      ]);
      setStats(statsData);
      setExtraData(extra);
    } catch (error) {
      console.error('Failed to load dashboard data', error);
    }
  }

  // Calculate 7-day stats
  const weeklySales = extraData?.weeklySales || [];
  const maxWeeklyAmount = Math.max(...weeklySales.map(d => d.amount), 1);
  const total7DayRevenue = weeklySales.reduce((acc, curr) => acc + curr.amount, 0);

  const formatCurrency = (num: number) => {
    const abs = Math.abs(num).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return num < 0 ? `-₹${abs}` : `₹${abs}`;
  };

  const currentDateFormatted = new Date().toLocaleDateString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  });

  const chequesSummary = extraData?.chequesSummary;
  const hasChequesDue = (chequesSummary?.dueTodayCount ?? 0) > 0 || (chequesSummary?.overdueCount ?? 0) > 0;

  return (
    <div className="p-6 md:p-8 min-h-full flex flex-col bg-canvas overflow-y-auto space-y-6">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 pb-2 border-b border-hairline">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl md:text-3xl font-display font-semibold text-ink tracking-tight">Business Overview</h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-primary/10 text-primary border border-primary/20">
              Live Real-Time
            </span>
          </div>
          <p className="text-xs md:text-sm text-muted mt-1 flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5" /> As of {currentDateFormatted} • Complete financial, cheque & inventory status
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link
            to="/pos"
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-primary hover:bg-primary-active text-on-primary font-medium text-sm rounded-lg shadow-sm transition-all shadow-primary/20 hover:scale-[1.01]"
          >
            <IndianRupee className="w-4 h-4" /> New Sale (POS)
          </Link>
          <button
            onClick={() => loadAllData()}
            className="p-2 border border-hairline rounded-lg text-muted hover:text-ink hover:bg-surface-soft transition-colors"
            title="Refresh Dashboard"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Cheques Due Alert Banner (Shows when cheques are due today or overdue) */}
      {hasChequesDue && chequesSummary && (
        <div className="p-3.5 rounded-xl border border-amber-500/30 bg-amber-500/10 flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-in fade-in duration-200">
          <div className="flex items-start sm:items-center gap-3 min-w-0">
            <div className="p-2 rounded-lg bg-amber-500/20 text-amber-700 dark:text-amber-400 shrink-0 mt-0.5 sm:mt-0">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-amber-900 dark:text-amber-300">
                  Cheques Due Action Required
                </span>
                {chequesSummary.dueTodayCount > 0 && (
                  <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-500/20 text-amber-900 dark:text-amber-200 border border-amber-500/30">
                    {chequesSummary.dueTodayCount} Due Today ({formatCurrency(chequesSummary.dueTodayAmount)})
                  </span>
                )}
                {chequesSummary.overdueCount > 0 && (
                  <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-red-500/15 text-red-700 dark:text-red-300 border border-red-500/30">
                    {chequesSummary.overdueCount} Overdue ({formatCurrency(chequesSummary.overdueAmount)})
                  </span>
                )}
              </div>
              <p className="text-xs text-amber-900/80 dark:text-amber-200/80 mt-0.5">
                You have post-dated cheques ready for bank deposit or clearance. Review them to keep your balances updated.
              </p>
            </div>
          </div>

          <Link
            to="/payments"
            state={{ activeTab: 'cheques', chequeStatusFilter: 'pdc_pending' }}
            className="shrink-0 px-3.5 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-semibold shadow-sm transition-colors flex items-center justify-center gap-1.5"
          >
            Review Cheques <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      )}

      {/* 8 Key Metric Cards (4 x 2 Grid) */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted">Key Performance Indicators</h2>
          <span className="text-xs text-muted">Click any metric for details</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* 1. Net Profit */}
          <StatCard
            title="Net Profit"
            value={stats ? formatCurrency(stats.netProfit) : '...'}
            subtitle={stats && stats.netProfit >= 0 ? "Positive margin" : "Deficit"}
            icon={stats && stats.netProfit >= 0 ? TrendingUp : TrendingDown}
            color={stats && stats.netProfit >= 0 ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20" : "bg-red-500/10 text-red-600 border-red-500/20"}
            to="/reports"
            badge="Net Income"
          />

          {/* 2. Total Sales */}
          <StatCard
            title="Total Sales"
            value={stats ? formatCurrency(stats.totalSales) : '...'}
            subtitle="Net sales after returns"
            icon={IndianRupee}
            color="bg-blue-500/10 text-blue-600 border-blue-500/20"
            to="/daybook"
            state={{ activeTab: 'sales' }}
            badge="Revenue"
          />

          {/* 3. Inventory Value */}
          <StatCard
            title="Inventory Value"
            value={stats ? formatCurrency(stats.totalInventoryValue) : '...'}
            subtitle="At current cost valuation"
            icon={Package}
            color="bg-purple-500/10 text-purple-600 border-purple-500/20"
            to="/inventory"
            badge="Asset"
          />

          {/* 4. Total Receivables */}
          <StatCard
            title="Total Receivables"
            value={stats ? formatCurrency(stats.totalReceivables) : '...'}
            subtitle="Pending from customers"
            icon={LineChart}
            color="bg-emerald-500/10 text-emerald-600 border-emerald-500/20"
            to="/contacts"
            state={{ activeTab: 'customers', filterWithBalance: true }}
            badge="To Collect"
          />

          {/* 5. Total Payables */}
          <StatCard
            title="Total Payables"
            value={stats ? formatCurrency(stats.totalPayables) : '...'}
            subtitle="Due to suppliers"
            icon={Truck}
            color="bg-amber-500/10 text-amber-600 border-amber-500/20"
            to="/contacts"
            state={{ activeTab: 'suppliers', filterWithBalance: true }}
            badge="To Pay"
          />

          {/* 6. Total Expenses */}
          <StatCard
            title="Total Expenses"
            value={stats ? formatCurrency(stats.totalExpenses) : '...'}
            subtitle="Operational outflows"
            icon={Receipt}
            color="bg-red-500/10 text-red-600 border-red-500/20"
            to="/expenses"
            badge="Outflows"
          />

          {/* 7. Total Products */}
          <StatCard
            title="Total Products"
            value={stats ? stats.totalProducts.toLocaleString('en-IN') : '...'}
            subtitle="Active SKU catalog"
            icon={ShoppingBag}
            color="bg-indigo-500/10 text-indigo-600 border-indigo-500/20"
            to="/inventory"
            badge="Catalog"
          />

          {/* 8. Low Stock Items */}
          <StatCard
            title="Low Stock Items"
            value={stats ? stats.lowStockItems.toLocaleString('en-IN') : '...'}
            subtitle={stats && stats.lowStockItems > 0 ? "Requires restock" : "All optimal"}
            icon={AlertCircle}
            color={stats && stats.lowStockItems > 0 ? "bg-red-500/10 text-red-600 border-red-500/20" : "bg-emerald-500/10 text-emerald-600 border-emerald-500/20"}
            to="/inventory"
            state={{ filterLowStock: true }}
            badge={stats && stats.lowStockItems > 0 ? "Action Req" : "Optimal"}
          />
        </div>
      </div>

      {/* Middle Section: 7-Day Sales Trend & Quick Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* 7-Day Revenue Trend (7 cols) */}
        <div className="lg:col-span-7 bg-canvas rounded-xl border border-hairline shadow-sm p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-md bg-blue-500/10 text-blue-600">
                  <TrendingUp className="w-4 h-4" />
                </div>
                <h3 className="font-semibold text-ink text-base">7-Day Sales Trend</h3>
              </div>
              <span className="text-xs font-semibold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                7D Total: {formatCurrency(total7DayRevenue)}
              </span>
            </div>
            <p className="text-xs text-muted mb-6">Daily sales turnover across the past week</p>

            {/* Pure CSS Bar Chart */}
            <div className="h-44 flex items-end justify-between gap-2 pt-6 pb-2 px-1 border-b border-hairline">
              {weeklySales.map((item, idx) => {
                const heightPercent = maxWeeklyAmount > 0 ? Math.max((item.amount / maxWeeklyAmount) * 100, item.amount > 0 ? 8 : 2) : 2;
                const isToday = idx === weeklySales.length - 1;
                return (
                  <div key={item.date} className="flex-1 flex flex-col items-center h-full justify-end group relative">
                    {/* Tooltip */}
                    <div className="absolute -top-10 opacity-0 group-hover:opacity-100 transition-opacity bg-ink text-canvas text-[11px] font-semibold py-1 px-2 rounded pointer-events-none whitespace-nowrap shadow-md z-10">
                      ₹{item.amount.toLocaleString('en-IN')}
                      <span className="text-muted text-[10px] block font-normal">{item.date}</span>
                    </div>

                    {/* Bar */}
                    <div className="w-full max-w-[42px] bg-surface-soft rounded-t-md overflow-hidden flex flex-col justify-end h-full">
                      <div
                        style={{ height: `${heightPercent}%` }}
                        className={`w-full rounded-t-md transition-all duration-500 ${
                          isToday
                            ? 'bg-primary'
                            : item.amount > 0
                            ? 'bg-blue-500/70 group-hover:bg-blue-600'
                            : 'bg-hairline'
                        }`}
                      />
                    </div>

                    {/* Day Label */}
                    <span className={`text-[11px] mt-2 font-medium ${isToday ? 'text-primary font-bold' : 'text-muted'}`}>
                      {item.day}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="flex items-center justify-between pt-3 text-xs text-muted">
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm bg-primary inline-block"></span> Today's Progress
            </span>
            <Link to="/reports" className="text-primary hover:underline font-medium inline-flex items-center gap-1">
              View Detailed Analytics <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>

        {/* Quick Actions (5 cols) */}
        <div className="lg:col-span-5 bg-canvas rounded-xl border border-hairline shadow-sm p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-md bg-purple-500/10 text-purple-600">
                  <Sparkles className="w-4 h-4" />
                </div>
                <h3 className="font-semibold text-ink text-base">Quick Shortcuts</h3>
              </div>
              <button
                onClick={() => {
                  setTempSelected(selectedActions);
                  setIsEditModalOpen(true);
                }}
                className="text-xs text-muted hover:text-primary transition-colors flex items-center gap-1 font-medium px-2 py-1 rounded hover:bg-surface-soft border border-hairline"
              >
                <Settings className="w-3.5 h-3.5" /> Customize
              </button>
            </div>
            <p className="text-xs text-muted mb-4">Fast 1-click access to common daily operations</p>

            <div className="grid grid-cols-2 gap-2.5">
              {ALL_QUICK_ACTIONS.filter(a => selectedActions.includes(a.id)).map(action => (
                <Link
                  key={action.id}
                  to={action.to}
                  className={`p-3 border border-hairline rounded-lg bg-surface-soft/40 hover:bg-surface-soft transition-all cursor-pointer flex items-center gap-3 group ${action.bgHover}`}
                >
                  <div className={`p-2 rounded-lg ${action.iconBg} ${action.iconColor} group-hover:scale-105 transition-transform shrink-0`}>
                    <action.icon className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <h4 className="font-semibold text-xs text-ink truncate">{action.title}</h4>
                    <p className="text-[10px] text-muted truncate">{action.desc}</p>
                  </div>
                </Link>
              ))}

              {selectedActions.length === 0 && (
                <div className="col-span-2 p-6 text-center text-xs text-muted border border-dashed border-hairline rounded-lg">
                  No quick actions pinned. Click Customize to add.
                </div>
              )}
            </div>
          </div>

          <div className="pt-3 border-t border-hairline mt-4 flex items-center justify-between text-xs text-muted">
            <span>{selectedActions.length} shortcuts active</span>
            <Link to="/settings" className="hover:text-primary text-xs flex items-center gap-1">
              System Settings <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
        </div>
      </div>

      {/* Row 2: Recent Sales Activity (7 cols) & Cheques Due & Clearances (5 cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        {/* Recent Sales Activity (7 cols) */}
        <div className="lg:col-span-7 bg-canvas rounded-xl border border-hairline shadow-sm p-5 flex flex-col justify-between h-full">
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-md bg-emerald-500/10 text-emerald-600">
                  <Receipt className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-semibold text-ink text-base">Recent Sales Activity</h3>
                  <p className="text-xs text-muted">Latest bills recorded in the system</p>
                </div>
              </div>
              <Link
                to="/daybook"
                state={{ activeTab: 'sales' }}
                className="text-xs text-primary hover:underline font-medium inline-flex items-center gap-1"
              >
                View Day Book <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-hairline text-muted uppercase tracking-wider text-[10px]">
                    <th className="py-2.5 font-semibold">Bill No</th>
                    <th className="py-2.5 font-semibold">Customer</th>
                    <th className="py-2.5 font-semibold">Date</th>
                    <th className="py-2.5 font-semibold text-right">Amount</th>
                    <th className="py-2.5 font-semibold text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-hairline">
                  {extraData?.recentSales && extraData.recentSales.length > 0 ? (
                    extraData.recentSales.map((sale) => (
                      <tr key={sale.id} className="hover:bg-surface-soft/50 transition-colors">
                        <td className="py-2.5 font-semibold text-primary">
                          <Link to="/daybook" state={{ activeTab: 'sales', highlightId: sale.id }} className="hover:underline">
                            {sale.invoice_number || `#${sale.id}`}
                          </Link>
                        </td>
                        <td className="py-2.5 text-ink font-medium truncate max-w-[140px]">{sale.customer_name}</td>
                        <td className="py-2.5 text-muted">{sale.date ? sale.date.split(' ')[0] : '-'}</td>
                        <td className="py-2.5 text-right font-bold text-ink">
                          ₹{sale.net_amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </td>
                        <td className="py-2.5 text-center">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                              sale.status.toLowerCase() === 'paid'
                                ? 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/20'
                                : 'bg-amber-500/10 text-amber-600 border border-amber-500/20'
                            }`}
                          >
                            {sale.status}
                          </span>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-muted">
                        No recent sales recorded yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="pt-3 border-t border-hairline mt-4 flex items-center justify-between text-xs text-muted">
            <span>Showing latest 5 billing records</span>
            <Link
              to="/daybook"
              state={{ activeTab: 'sales' }}
              className="text-primary hover:underline font-medium inline-flex items-center gap-1"
            >
              View Day Book <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>

        {/* Cheques Due & Clearances (5 cols) */}
        <div className="lg:col-span-5 bg-canvas rounded-xl border border-hairline shadow-sm p-5 flex flex-col justify-between h-full">
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className={`p-1.5 rounded-md ${hasChequesDue ? 'bg-amber-500/10 text-amber-600' : 'bg-blue-500/10 text-blue-600'}`}>
                  <CreditCard className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-semibold text-ink text-sm">Cheques Due & Clearances</h3>
                  <p className="text-[11px] text-muted">Post-dated cheques (PDC) status</p>
                </div>
              </div>
              <Link
                to="/payments"
                state={{ activeTab: 'cheques', chequeStatusFilter: 'pdc_pending' }}
                className="text-xs text-primary hover:underline font-medium inline-flex items-center gap-1"
              >
                Cheques Register <ArrowRight className="w-3 h-3" />
              </Link>
            </div>

            {/* Cheque Summary KPI Strip */}
            <div className="grid grid-cols-2 gap-2 mb-3">
              <div className="p-2.5 rounded-lg bg-surface-soft/60 border border-hairline flex flex-col">
                <span className="text-[10px] text-muted uppercase font-semibold">Due Today</span>
                <span className="text-sm font-bold text-ink">
                  {chequesSummary ? formatCurrency(chequesSummary.dueTodayAmount) : '₹0.00'}
                </span>
                <span className="text-[10px] text-muted">
                  {chequesSummary?.dueTodayCount || 0} cheque{(chequesSummary?.dueTodayCount || 0) === 1 ? '' : 's'}
                </span>
              </div>

              <div className="p-2.5 rounded-lg bg-surface-soft/60 border border-hairline flex flex-col">
                <span className="text-[10px] text-muted uppercase font-semibold">Overdue</span>
                <span className={`text-sm font-bold ${(chequesSummary?.overdueCount ?? 0) > 0 ? 'text-red-600' : 'text-ink'}`}>
                  {chequesSummary ? formatCurrency(chequesSummary.overdueAmount) : '₹0.00'}
                </span>
                <span className="text-[10px] text-muted">
                  {chequesSummary?.overdueCount || 0} overdue
                </span>
              </div>
            </div>

            {/* Cheques List */}
            <div className="space-y-2">
              {chequesSummary?.chequesList && chequesSummary.chequesList.length > 0 ? (
                chequesSummary.chequesList.map((chq) => (
                  <Link
                    key={chq.id}
                    to="/payments"
                    state={{ activeTab: 'cheques', chequeStatusFilter: 'pdc_pending' }}
                    className="p-2.5 rounded-lg bg-surface-soft/40 border border-hairline hover:bg-surface-soft hover:border-primary/40 transition-all flex items-center justify-between gap-2 text-xs group block"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider ${
                            chq.entity_type === 'customer'
                              ? 'bg-emerald-500/10 text-emerald-700 border border-emerald-500/20'
                              : 'bg-blue-500/10 text-blue-700 border border-blue-500/20'
                          }`}
                        >
                          {chq.entity_type === 'customer' ? '↓ Deposit' : '↑ Clear'}
                        </span>
                        <span className="font-semibold text-ink truncate group-hover:text-primary transition-colors">
                          {chq.entity_name}
                        </span>
                      </div>
                      <p className="text-[11px] text-muted mt-0.5 truncate">
                        {chq.bank_name ? `${chq.bank_name} • ` : ''}Cheque #{chq.cheque_no || 'N/A'}
                      </p>
                    </div>

                    <div className="flex flex-col items-end shrink-0">
                      <span className="font-bold text-ink">
                        ₹{chq.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </span>
                      <span
                        className={`text-[10px] font-semibold mt-0.5 px-1.5 py-0.5 rounded ${
                          chq.days_diff === 0
                            ? 'bg-emerald-500/15 text-emerald-700 font-bold border border-emerald-500/30'
                            : chq.days_diff < 0
                            ? 'bg-red-500/15 text-red-700 font-bold border border-red-500/30'
                            : 'bg-surface-soft text-muted border border-hairline'
                        }`}
                      >
                        {chq.status_label}
                      </span>
                    </div>
                  </Link>
                ))
              ) : (
                <div className="py-6 text-center text-xs text-muted flex flex-col items-center justify-center gap-1">
                  <CheckCircle2 className="w-5 h-5 text-emerald-500 mb-0.5" />
                  <span className="font-medium text-ink">All cheques cleared</span>
                  <span className="text-[11px] text-muted">No pending post-dated cheques</span>
                </div>
              )}
            </div>
          </div>

          <div className="pt-3 border-t border-hairline mt-4 flex items-center justify-between text-xs text-muted">
            <span>{chequesSummary?.totalPendingCount || 0} total pending cheques</span>
            <Link
              to="/payments"
              state={{ activeTab: 'cheques', chequeStatusFilter: 'pdc_pending' }}
              className="text-primary hover:underline font-medium inline-flex items-center gap-1"
            >
              Open Register <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      </div>

      {/* Row 3: Top Selling Products (7 cols) & Low Stock Alerts (5 cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        {/* Top Products (7 cols) */}
        <div className="lg:col-span-7 bg-canvas rounded-xl border border-hairline shadow-sm p-5 flex flex-col justify-between h-full">
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-md bg-amber-500/10 text-amber-600">
                  <Layers className="w-4 h-4" />
                </div>
                <h3 className="font-semibold text-ink text-sm">Top Selling Products</h3>
              </div>
              <span className="text-[10px] text-muted font-medium">Last 30 Days</span>
            </div>

            <div className="space-y-3">
              {extraData?.topProducts && extraData.topProducts.length > 0 ? (
                extraData.topProducts.map((p, idx) => {
                  const maxQty = Math.max(...extraData.topProducts.map(tp => tp.quantity), 1);
                  const progressPct = Math.min(Math.round((p.quantity / maxQty) * 100), 100);
                  return (
                    <div key={p.id} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-medium text-ink truncate max-w-[180px] flex items-center gap-1.5">
                          <span className="text-[10px] font-bold text-muted w-4">#{idx + 1}</span>
                          {p.name}
                        </span>
                        <span className="font-semibold text-ink">
                          {p.quantity} sold <span className="text-muted font-normal">({formatCurrency(p.revenue)})</span>
                        </span>
                      </div>
                      <div className="w-full bg-surface-soft rounded-full h-1.5 overflow-hidden">
                        <div
                          className="bg-primary h-1.5 rounded-full transition-all duration-300"
                          style={{ width: `${progressPct}%` }}
                        />
                      </div>
                    </div>
                  );
                })
              ) : (
                <p className="text-xs text-muted py-4 text-center">No sales recorded in the last 30 days.</p>
              )}
            </div>
          </div>

          <div className="pt-3 border-t border-hairline mt-4 flex items-center justify-between text-xs text-muted">
            <span>Top ranked by volume</span>
            <Link
              to="/reports"
              className="text-primary hover:underline font-medium inline-flex items-center gap-1"
            >
              Sales Reports <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>

        {/* Low Stock Alerts (5 cols) */}
        <div className="lg:col-span-5 bg-canvas rounded-xl border border-hairline shadow-sm p-5 flex flex-col justify-between h-full">
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-md bg-red-500/10 text-red-600">
                  <AlertCircle className="w-4 h-4" />
                </div>
                <h3 className="font-semibold text-ink text-sm">Low Stock Alerts</h3>
              </div>
              <Link
                to="/inventory"
                state={{ filterLowStock: true }}
                className="text-xs text-primary hover:underline font-medium inline-flex items-center gap-1"
              >
                Inventory <ArrowRight className="w-3 h-3" />
              </Link>
            </div>

            <div className="space-y-2.5">
              {extraData?.lowStockProducts && extraData.lowStockProducts.length > 0 ? (
                extraData.lowStockProducts.map(p => (
                  <div
                    key={p.id}
                    className="flex items-center justify-between p-2 rounded-lg bg-surface-soft/40 border border-hairline text-xs"
                  >
                    <div className="min-w-0 pr-2">
                      <p className="font-medium text-ink truncate">{p.name}</p>
                      {p.model && <p className="text-[10px] text-muted">{p.model}</p>}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-red-500/10 text-red-600 border border-red-500/20">
                        {p.stock_quantity} / min {p.min_stock} {p.unit}
                      </span>
                      <Link
                        to="/purchases"
                        state={{ restockProductId: p.id }}
                        className="p-1 text-primary hover:bg-primary/10 rounded transition-colors"
                        title="Restock Product"
                      >
                        <Truck className="w-3.5 h-3.5" />
                      </Link>
                    </div>
                  </div>
                ))
              ) : (
                <div className="py-4 text-center text-xs text-muted flex items-center justify-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block"></span>
                  All inventory items are currently above minimum threshold.
                </div>
              )}
            </div>
          </div>

          <div className="pt-3 border-t border-hairline mt-4 flex items-center justify-between text-xs text-muted">
            <span>{extraData?.lowStockProducts && extraData.lowStockProducts.length > 0 ? `${extraData.lowStockProducts.length} items low on stock` : 'Inventory optimal'}</span>
            <Link
              to="/inventory"
              state={{ filterLowStock: true }}
              className="text-primary hover:underline font-medium inline-flex items-center gap-1"
            >
              Manage Stock <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      </div>

      {/* Edit Quick Actions Modal */}
      {isEditModalOpen && (
        <div className="fixed inset-0 bg-ink/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-canvas rounded-xl shadow-2xl w-full max-w-md overflow-hidden border border-hairline animate-in fade-in zoom-in duration-200">
            <div className="px-6 py-4 border-b border-hairline flex justify-between items-center bg-surface-soft">
              <h2 className="text-base font-bold text-ink flex items-center gap-2">
                <Settings className="w-4 h-4 text-muted" /> Customize Quick Shortcuts
              </h2>
              <button
                onClick={() => setIsEditModalOpen(false)}
                className="text-muted hover:text-ink transition-colors p-1 rounded-md"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 max-h-[60vh] overflow-y-auto">
              <p className="text-xs text-muted mb-4">
                Choose which shortcuts appear in the quick actions section of your dashboard.
              </p>
              <div className="space-y-2.5">
                {ALL_QUICK_ACTIONS.map(action => (
                  <label
                    key={action.id}
                    className="flex items-center gap-3 p-3 border border-hairline rounded-lg hover:bg-surface-soft cursor-pointer transition-colors shadow-sm"
                  >
                    <input
                      type="checkbox"
                      checked={tempSelected.includes(action.id)}
                      onChange={(e) => {
                        if (e.target.checked) setTempSelected([...tempSelected, action.id]);
                        else setTempSelected(tempSelected.filter(id => id !== action.id));
                      }}
                      className="w-4 h-4 rounded text-primary border-hairline focus:ring-primary"
                    />
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <div className={`p-1.5 rounded-md ${action.iconBg} ${action.iconColor}`}>
                        <action.icon className="w-4 h-4" />
                      </div>
                      <div className="flex flex-col min-w-0">
                        <span className="font-semibold text-ink text-xs truncate">{action.title}</span>
                        <span className="text-[10px] text-muted truncate">{action.desc}</span>
                      </div>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            <div className="p-4 border-t border-hairline bg-canvas flex justify-end gap-2.5">
              <button
                onClick={() => setIsEditModalOpen(false)}
                className="px-4 py-2 text-xs font-medium text-ink hover:bg-surface-soft rounded-lg transition-colors border border-hairline"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setSelectedActions(tempSelected);
                  localStorage.setItem('quickActions', JSON.stringify(tempSelected));
                  setIsEditModalOpen(false);
                }}
                className="px-4 py-2 text-xs font-semibold bg-primary hover:bg-primary-active text-on-primary rounded-lg shadow-sm transition-colors"
              >
                Save Preferences
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({
  title,
  value,
  subtitle,
  icon: Icon,
  color,
  badge,
  to,
  state
}: {
  title: string;
  value: string;
  subtitle?: string;
  icon: any;
  color: string;
  badge?: string;
  to?: string;
  state?: any;
}) {
  const content = (
    <div className="bg-canvas rounded-xl shadow-sm border border-hairline p-4 flex flex-col justify-between group hover:border-primary/40 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 relative overflow-hidden h-full">
      <div className="flex items-start justify-between gap-2 mb-2">
        <span className="text-xs font-medium text-muted tracking-tight truncate">{title}</span>
        <div className="flex items-center gap-1.5 shrink-0">
          {badge && (
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-surface-soft text-muted border border-hairline">
              {badge}
            </span>
          )}
          {to && (
            <ArrowUpRight className="w-3.5 h-3.5 text-muted/40 group-hover:text-primary group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all" />
          )}
        </div>
      </div>

      <div className="flex items-end justify-between gap-3 mt-1">
        <div className="min-w-0">
          <div className="text-xl font-bold font-display text-ink tracking-tight truncate">{value}</div>
          {subtitle && <p className="text-[11px] text-muted truncate mt-0.5">{subtitle}</p>}
        </div>
        <div className={`p-2 rounded-lg border shrink-0 ${color} transition-transform group-hover:scale-105`}>
          <Icon className="w-4 h-4" />
        </div>
      </div>
    </div>
  );

  if (to) {
    return (
      <Link to={to} state={state} className="block h-full cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary/20 rounded-xl">
        {content}
      </Link>
    );
  }

  return content;
}
