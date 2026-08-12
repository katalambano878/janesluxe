'use client';

import Link from 'next/link';
import { useState, useEffect } from 'react';
import { useAdminBranch } from '@/context/AdminBranchContext';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { fetchWithTimeout, readJsonSafe, TimeoutError } from '@/lib/http';

export default function AdminDashboard() {
  const { selectedBranch, loading: branchLoading } = useAdminBranch();
  const formatGHS = (amount: number) =>
    new Intl.NumberFormat('en-GH', {
      style: 'currency',
      currency: 'GHS',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount || 0);

  const [dateRange, setDateRange] = useState('7days'); // logic not implemented for this demo, just UI
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Real Stats
  const [stats, setStats] = useState([
    {
      title: 'Total Revenue',
      value: 'GH₵ 0.00',
      change: '0%', // Placeholder trend
      trend: 'up',
      icon: 'ri-money-dollar-circle-line',
      color: 'gray'
    },
    {
      title: 'Orders',
      value: '0',
      change: '0%',
      trend: 'up',
      icon: 'ri-shopping-bag-line',
      color: 'blue'
    },
    {
      title: 'Customers', // This is total active users for us currently
      value: '0',
      change: '0%',
      trend: 'up',
      icon: 'ri-group-line',
      color: 'purple'
    },
    {
      title: 'Avg Order Value',
      value: 'GH₵ 0.00',
      change: '0%',
      trend: 'up',
      icon: 'ri-line-chart-line',
      color: 'amber'
    }
  ]);

  const [recentOrders, setRecentOrders] = useState<any[]>([]);
  const [lowStockProducts, setLowStockProducts] = useState<any[]>([]);
  const [topProducts, setTopProducts] = useState<any[]>([]);
  const [chartData, setChartData] = useState<any[]>([]);
  const statIconClasses = [
    'bg-[#D7A7A0]/20 text-[#C4877B]',
    'bg-[#F5EADF]/50 text-[#7A5C4D]',
    'bg-[#B89E8D]/15 text-[#7A5C4D]',
    'bg-[#C4877B]/15 text-[#D7A7A0]'
  ];

  useEffect(() => {
    if (branchLoading) return;

    const controller = new AbortController();

    async function fetchDashboardData() {
      try {
        setLoading(true);
        setLoadError(null);
        const branchId = selectedBranch?.id || null;
        const branchQuery = branchId ? `?branch=${encodeURIComponent(branchId)}` : '';
        const res = await fetchWithTimeout(`/api/admin/dashboard${branchQuery}`, {
          credentials: 'include',
          timeoutMs: 20_000,
          signal: controller.signal,
        });
        const dash = (await readJsonSafe<any>(res)) || {};
        if (!res.ok) throw new Error(dash.error || 'Failed to load dashboard data');

        const totalRevenue = Number(dash.stats?.revenue) || 0;
        const totalOrders = Number(dash.stats?.orderCount) || 0;
        const uniqueCustomers = Number(dash.stats?.uniqueCustomers) || 0;
        const avgOrderValue = Number(dash.stats?.avgOrderValue) || 0;

        const processedChartData = (dash.chart || []).map((row: any) => ({
          date: new Date(row.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
          revenue: Number(row.revenue) || 0,
        }));
        setChartData(processedChartData);

        setStats([
          {
            title: 'Total Revenue',
            value: formatGHS(totalRevenue),
            change: '+0%',
            trend: 'up',
            icon: 'ri-money-dollar-circle-line',
            color: 'gray'
          },
          {
            title: 'Orders',
            value: totalOrders.toString(),
            change: '+0%',
            trend: 'up',
            icon: 'ri-shopping-bag-line',
            color: 'blue'
          },
          {
            title: 'Customers (Active)',
            value: uniqueCustomers.toString(),
            change: '+0%',
            trend: 'up',
            icon: 'ri-group-line',
            color: 'purple'
          },
          {
            title: 'Avg Order Value',
            value: formatGHS(avgOrderValue),
            change: '+0%',
            trend: 'up',
            icon: 'ri-line-chart-line',
            color: 'amber'
          }
        ]);

        const recentOrdersData = dash.recentOrders || [];
        setRecentOrders(recentOrdersData.map((o: any) => {
          const addr = o.shipping_address || {};
          const customerName = (addr.firstName && addr.lastName)
            ? `${addr.firstName.trim()} ${addr.lastName.trim()}`
            : addr.full_name || addr.firstName || o.email?.split('@')[0] || 'Customer';
          return {
            id: o.id,
            displayId: o.order_number,
            customer: customerName,
            email: o.email,
            date: new Date(o.created_at).toLocaleDateString(),
            total: o.total,
            status: o.status,
            items: 1
          };
        }));

        setLowStockProducts((dash.lowStock || []).map((p: any) => ({
          name: p.name,
          stock: p.quantity,
          status: p.quantity === 0 ? 'critical' : 'low'
        })));

        setTopProducts((dash.products || []).map((p: any) => ({
          id: p.slug,
          name: p.name,
          image: p.image || 'https://via.placeholder.com/200',
          sales: 0,
          revenue: 0,
          stock: p.quantity
        })));
      } catch (error: any) {
        if (error?.name === 'AbortError') return;
        console.error('Error loading dashboard:', error);
        setLoadError(
          error instanceof TimeoutError
            ? 'Dashboard timed out. The database may be slow — try again.'
            : (error?.message || 'Failed to load dashboard')
        );
      } finally {
        setLoading(false);
      }
    }

    fetchDashboardData();
    return () => controller.abort();
  }, [branchLoading, selectedBranch?.id]);

  const statusColors: any = {
    'pending': 'bg-amber-100 text-amber-700',
    'processing': 'bg-blue-100 text-blue-700',
    'shipped': 'bg-purple-100 text-purple-700',
    'dispatched_to_rider': 'bg-indigo-100 text-indigo-700',
    'delivered': 'bg-gray-100 text-gray-900',
    'cancelled': 'bg-red-100 text-red-700'
  };

  const quickActions = [
    {
      title: 'Feature Modules',
      description: 'Manage 40+ store features',
      icon: 'ri-puzzle-line',
      color: 'purple',
      link: '/admin/modules',
      badge: '40 Features'
    },
    {
      title: 'Inventory Management',
      description: 'Track stock & manage reorders',
      icon: 'ri-stack-line',
      color: 'amber',
      link: '/admin/inventory'
    },
    // ... reduced list for brevity or keep all if desired
  ];

  if (loading) {
    return <div className="p-8 text-center text-gray-500">Loading Dashboard...</div>;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {loadError && (
          <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-red-800 flex items-center justify-between gap-4">
            <p className="text-sm">{loadError}</p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="shrink-0 rounded-lg bg-red-700 px-3 py-1.5 text-sm font-semibold text-white hover:bg-red-800"
            >
              Retry
            </button>
          </div>
        )}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">
              Dashboard
              {selectedBranch && (
                <span className="ml-3 inline-flex items-center gap-1 align-middle px-3 py-1 rounded-full bg-brand-primary/15 text-brand-text text-sm font-semibold">
                  <i className="ri-store-2-line" />
                  {selectedBranch.name}
                </span>
              )}
            </h1>
            <p className="text-gray-600 mt-1">
              {selectedBranch
                ? `Here's what's happening at ${selectedBranch.name}.`
                : "Welcome back! Here's what's happening across all branches."}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          {stats.map((stat, index) => (
            <div key={stat.title} className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between mb-4">
                <div className={`w-12 h-12 flex items-center justify-center rounded-lg ${statIconClasses[index % statIconClasses.length]}`}>
                  <i className={`${stat.icon} text-2xl`}></i>
                </div>
                <span className={`text-sm font-semibold text-brand-accent`}>
                  {stat.change}
                </span>
              </div>
              <h3 className="text-2xl font-bold text-gray-900 mb-1">{stat.value}</h3>
              <p className="text-gray-600 text-sm">{stat.title}</p>
            </div>
          ))}
        </div>

        {/* Revenue Chart & Quick Actions */}
        <div className="grid lg:grid-cols-3 gap-6 mb-8">
          <div className="lg:col-span-2 bg-white p-6 rounded-xl shadow-sm border border-gray-200">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-gray-900">Revenue Trend</h2>
              <select
                className="bg-gray-50 border border-gray-200 text-gray-700 text-sm rounded-lg focus:ring-brand-primary focus:border-brand-primary block p-2"
                value={dateRange}
                onChange={(e) => setDateRange(e.target.value)}
              >
                <option value="7days">Last 7 Days</option>
                <option value="30days">Last 30 Days</option>
              </select>
            </div>
            <div className="h-80 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#D7A7A0" stopOpacity={0.22} />
                      <stop offset="95%" stopColor="#D7A7A0" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F5EADF" />
                  <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#B89E8D' }} dy={10} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#B89E8D' }} tickFormatter={(value) => `GH₵${value}`} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#fff', borderRadius: '8px', border: '1px solid #F5EADF', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                    formatter={(value) => [formatGHS((value as number) || 0), 'Revenue']}
                  />
                  <Area type="monotone" dataKey="revenue" stroke="#C4877B" strokeWidth={3} fillOpacity={1} fill="url(#colorRevenue)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Quick Actions</h2>
            <div className="space-y-3">
              <Link href="/admin/products/new" className="flex items-center justify-between p-4 bg-gray-50 hover:bg-brand-primary/15 text-gray-700 hover:text-gray-900 rounded-lg transition-colors group">
                <div className="flex items-center font-medium">
                  <span className="w-8 h-8 rounded-full bg-white flex items-center justify-center mr-3 group-hover:bg-brand-secondary transition-colors shadow-sm">
                    <i className="ri-add-line"></i>
                  </span>
                  Add Product
                </div>
                <i className="ri-arrow-right-line"></i>
              </Link>
              <Link href="/admin/pos" className="flex items-center justify-between p-4 bg-gray-50 hover:bg-brand-primary/15 text-gray-700 hover:text-gray-900 rounded-lg transition-colors group">
                <div className="flex items-center font-medium">
                  <span className="w-8 h-8 rounded-full bg-white flex items-center justify-center mr-3 group-hover:bg-brand-secondary transition-colors shadow-sm">
                    <i className="ri-computer-line"></i>
                  </span>
                  Open POS
                </div>
                <i className="ri-arrow-right-line"></i>
              </Link>
              <Link href="/admin/orders" className="flex items-center justify-between p-4 bg-gray-50 hover:bg-brand-primary/15 text-gray-700 hover:text-gray-900 rounded-lg transition-colors group">
                <div className="flex items-center font-medium">
                  <span className="w-8 h-8 rounded-full bg-white flex items-center justify-center mr-3 group-hover:bg-brand-secondary transition-colors shadow-sm">
                    <i className="ri-file-list-line"></i>
                  </span>
                  Manage Orders
                </div>
                <i className="ri-arrow-right-line"></i>
              </Link>
            </div>
          </div>
        </div>

        <div className="grid lg:grid-cols-3 gap-6 mb-8">
          <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-gray-200 p-4 sm:p-6 overflow-hidden">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-gray-900">Recent Orders</h2>
              <Link href="/admin/orders" className="text-gray-900 hover:text-brand-accent font-medium text-sm whitespace-nowrap cursor-pointer">
                View All <i className="ri-arrow-right-line ml-1"></i>
              </Link>
            </div>

            <div className="overflow-x-auto -mx-4 sm:mx-0 px-4 sm:px-0">
              {recentOrders.length === 0 ? (
                <p className="text-gray-500 text-center py-4">No recent orders.</p>
              ) : (
                <table className="w-full">
                  <thead className="bg-brand-secondary border-b border-brand-supporting/30">
                    <tr>
                      <th className="text-left py-3 px-4 text-sm font-semibold text-gray-900">Order ID</th>
                      <th className="text-left py-3 px-4 text-sm font-semibold text-gray-900">Customer</th>
                      <th className="text-left py-3 px-4 text-sm font-semibold text-gray-900">Date</th>
                      <th className="text-left py-3 px-4 text-sm font-semibold text-gray-900">Total</th>
                      <th className="text-left py-3 px-4 text-sm font-semibold text-gray-900">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentOrders.map((order) => (
                      <tr key={order.id} className="border-b border-gray-200 hover:bg-brand-secondary/50 transition-colors">
                        <td className="py-4 px-4">
                          <Link href={`/admin/orders/${order.id}`} className="text-gray-900 hover:text-brand-accent font-medium whitespace-nowrap cursor-pointer">
                            {order.displayId}
                          </Link>
                        </td>
                        <td className="py-4 px-4">
                          <p className="font-medium text-gray-900 whitespace-nowrap">{order.customer}</p>
                          <p className="text-sm text-gray-600">{order.email}</p>
                        </td>
                        <td className="py-4 px-4 text-gray-700 whitespace-nowrap">{order.date}</td>
                        <td className="py-4 px-4 font-semibold text-gray-900 whitespace-nowrap">{formatGHS(order.total)}</td>
                        <td className="py-4 px-4">
                          <span className={`px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap ${statusColors[order.status] || 'bg-gray-100'}`}>
                            {order.status === 'shipped' ? 'Packaged' : order.status === 'dispatched_to_rider' ? 'Dispatched To Rider' : order.status.charAt(0).toUpperCase() + order.status.slice(1)}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          <div className="space-y-6">
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <h2 className="text-xl font-bold text-gray-900 mb-4">Low Stock Alert</h2>
              {lowStockProducts.length === 0 ? (
                <p className="text-gray-600">Inventory looks good!</p>
              ) : (
                <div className="space-y-3">
                  {lowStockProducts.map((product, index) => (
                    <div key={index} className="flex items-center justify-between p-3 bg-brand-secondary/50 rounded-lg">
                      <div className="flex-1">
                        <p className="font-medium text-gray-900 text-sm truncate pr-2">{product.name}</p>
                        <p className="text-xs text-gray-700 mt-1">Stock: {product.stock} units</p>
                      </div>
                      <span className={`px-2 py-1 rounded-full text-xs font-semibold whitespace-nowrap ${product.status === 'critical' ? 'bg-brand-accent/20 text-brand-text' : 'bg-brand-primary/30 text-brand-text'
                        }`}>
                        {product.status === 'critical' ? 'Critical' : 'Low'}
                      </span>
                    </div>
                  ))}
                </div>
              )}
              <Link href="/admin/products?filter=low-stock" className="block text-center mt-4 text-gray-900 hover:text-brand-accent font-medium text-sm whitespace-nowrap cursor-pointer">
                View All Products <i className="ri-arrow-right-line ml-1"></i>
              </Link>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 sm:p-6 overflow-hidden">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold text-gray-900">Products</h2>
            <Link href="/admin/products" className="text-gray-900 hover:text-brand-accent font-medium text-sm whitespace-nowrap cursor-pointer">
              View All <i className="ri-arrow-right-line ml-1"></i>
            </Link>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
            {topProducts.map((product) => (
              <div key={product.id} className="border border-gray-200 rounded-xl p-4 hover:shadow-md transition-shadow">
                <div className="aspect-square bg-brand-secondary/50 rounded-lg overflow-hidden mb-3">
                  <img src={product.image} alt={product.name} className="w-full h-full object-cover" />
                </div>
                <h3 className="font-semibold text-gray-900 mb-2 line-clamp-2">{product.name}</h3>
                <div className="mt-3 pt-3 border-t border-gray-200 flex items-center justify-between">
                  <span className="text-sm text-gray-600">Stock: {product.stock}</span>
                  <Link href={`/admin/products/${product.id}`} className="text-brand-accent hover:text-gray-900 text-sm font-medium whitespace-nowrap cursor-pointer">
                    Edit <i className="ri-arrow-right-line ml-1"></i>
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
