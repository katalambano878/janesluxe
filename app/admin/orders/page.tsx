'use client';

import Link from 'next/link';
import { useState, useEffect } from 'react';
import ProductSalesStats from './ProductSalesStats';
import { useAdminBranch } from '@/context/AdminBranchContext';
import { getShippingMethodInfo, shippingMethodBadgeClass } from '@/lib/shipping-method';

interface Order {
  id: string;
  order_number: string;
  email: string;
  total: number;
  status: string;
  payment_status: string;
  payment_method: string;
  shipping_method: string;
  created_at: string;
  phone?: string;
  shipping_address?: any;
  metadata?: any;
  branch_id?: string | null;
  branches?: {
    name: string;
    slug: string;
  } | null;
  profiles?: {
    full_name: string;
    email: string;
  };
  order_items?: {
    quantity: number;
    product_name?: string;
  }[];
}

interface OrderStats {
  label: string;
  count: number;
  status: string;
}

/** Orders this new are usually still mid-payment rather than abandoned. */
const JUST_PLACED_WINDOW_MS = 2 * 60 * 60 * 1000;

const isUnpaid = (order: any) => order.payment_status !== 'paid';

const isJustPlaced = (order: any) =>
  isUnpaid(order) && Date.now() - new Date(order.created_at).getTime() <= JUST_PLACED_WINDOW_MS;

const digitsOnly = (value: unknown) => String(value ?? '').replace(/\D/g, '');

const allPhoneDigits = (order: any) =>
  digitsOnly(
    `${order.phone || ''} ${order.shipping_address?.phone || ''} ${order.metadata?.phone || ''}`
  );

const orderPhone = (order: any) =>
  digitsOnly(order.phone || order.shipping_address?.phone || order.metadata?.phone).slice(-9);

/**
 * Staff usually arrive from a Moolre SMS, which gives them a payer phone number
 * and a transaction ID but no order number, and customers spell their own email
 * wrong often enough that email alone is not a dependable way in. So match on
 * every identifier that appears on a payment alert, phone numbers by digits only
 * since they are stored in many shapes (0244…, +23324…, two numbers in one field).
 */
const orderMatchesSearch = (order: any, query: string, name: string, email: string) => {
  const q = query.trim().toLowerCase();
  if (!q) return true;

  const haystack = [
    order.order_number,
    order.id,
    name,
    email,
    order.tracking_number,
    order.metadata?.tracking_number,
    order.metadata?.moolre_transaction_id,
    order.metadata?.moolre_externalref,
    order.phone,
    order.shipping_address?.phone,
    order.metadata?.phone,
  ]
    .filter(Boolean)
    .map((v) => String(v).toLowerCase());

  if (haystack.some((v) => v.includes(q))) return true;

  const qDigits = digitsOnly(q);
  if (qDigits.length < 6) return false;

  return (
    allPhoneDigits(order).includes(qDigits.slice(-9)) ||
    digitsOnly(order.metadata?.moolre_transaction_id).includes(qDigits)
  );
};

/**
 * A customer who retries checkout leaves a new unpaid order behind on every
 * attempt, so the abandoned list fills up with carts that were actually paid
 * for under a later order number. Flag those so staff don't chase them.
 */
const wasPaidOnAnotherAttempt = (order: any, paidOrders: any[]) => {
  const phone = orderPhone(order);
  if (!phone) return false;
  return paidOrders.some(
    (p) => p.id !== order.id && orderPhone(p) === phone && Number(p.total) === Number(order.total)
  );
};

export default function AdminOrdersPage() {
  const { selectedBranch, loading: branchLoading } = useAdminBranch();
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [shippingFilter, setShippingFilter] = useState('all');
  const [selectedOrders, setSelectedOrders] = useState<string[]>([]);
  const [showFilters, setShowFilters] = useState(false);
  const [sortBy, setSortBy] = useState('date');
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [orderViewTab, setOrderViewTab] = useState<'confirmed' | 'abandoned'>('confirmed');
  const [sendingPaymentLink, setSendingPaymentLink] = useState<string | null>(null);
  const [orderStats, setOrderStats] = useState<OrderStats[]>([
    { label: 'All Confirmed', count: 0, status: 'all' },
    { label: 'Processing', count: 0, status: 'processing' },
    { label: 'Packaged', count: 0, status: 'shipped' },
    { label: 'Dispatched To Rider', count: 0, status: 'dispatched_to_rider' },
    { label: 'Delivered', count: 0, status: 'delivered' },
    { label: 'Cancelled', count: 0, status: 'cancelled' }
  ]);
  const [abandonedCount, setAbandonedCount] = useState(0);
  const [justPlacedCount, setJustPlacedCount] = useState(0);
  const [confirmedCount, setConfirmedCount] = useState(0);
  const [paidOrders, setPaidOrders] = useState<any[]>([]);
  const [missingFromView, setMissingFromView] = useState(0);
  const [showProductStats, setShowProductStats] = useState(false);
  const [productFilter, setProductFilter] = useState('all');
  const [availableProducts, setAvailableProducts] = useState<string[]>([]);

  useEffect(() => {
    if (branchLoading) return;
    fetchOrders();

    // Orders arrive while the page is open, so refresh quietly in the
    // background instead of making staff reload to see new ones.
    const interval = setInterval(() => fetchOrders({ silent: true }), 60_000);
    return () => clearInterval(interval);
  }, [branchLoading, selectedBranch?.id]);

  const fetchOrders = async ({ silent = false }: { silent?: boolean } = {}) => {
    try {
      if (!silent) setLoading(true);

      // Fetch orders via server-side API (bypasses RLS), scoped to branch if selected.
      // Ask for the whole history: search and the tab counts run over this list,
      // so anything left behind here looks to staff like a missing order.
      const params = new URLSearchParams({ limit: '5000' });
      if (selectedBranch) params.set('branch', selectedBranch.id);
      const res = await fetch(`/api/admin/orders?${params.toString()}`, { credentials: 'include' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to fetch orders');
      const ordersData = json.orders;

      setOrders(ordersData || []);
      setMissingFromView(
        json.truncated ? Math.max(Number(json.total) - (ordersData?.length || 0), 0) : 0
      );

      // Extract unique product names for filter
      const productNames = new Set<string>();
      ordersData?.forEach((o: any) => {
        o.order_items?.forEach((item: any) => {
          if (item.product_name) productNames.add(item.product_name);
        });
      });
      setAvailableProducts(Array.from(productNames).sort());

      // Confirmed = payment received. Abandoned cart = checkout started, unpaid.
      const allOrders = ordersData || [];
      const paid = allOrders.filter((o: any) => o.payment_status === 'paid');
      const unpaid = allOrders.filter(isUnpaid);

      setPaidOrders(paid);
      setConfirmedCount(paid.length);
      setAbandonedCount(unpaid.length);
      setJustPlacedCount(unpaid.filter(isJustPlaced).length);

      // Status cards only count paid (confirmed) orders
      const stats = [
        { label: 'All Confirmed', count: paid.length, status: 'all' },
        { label: 'Processing', count: paid.filter((o: any) => o.status === 'processing').length, status: 'processing' },
        { label: 'Packaged', count: paid.filter((o: any) => o.status === 'shipped').length, status: 'shipped' },
        { label: 'Dispatched To Rider', count: paid.filter((o: any) => o.status === 'dispatched_to_rider').length, status: 'dispatched_to_rider' },
        { label: 'Delivered', count: paid.filter((o: any) => o.status === 'delivered').length, status: 'delivered' },
        { label: 'Cancelled', count: paid.filter((o: any) => o.status === 'cancelled').length, status: 'cancelled' }
      ];
      setOrderStats(stats);

    } catch (error) {
      console.error('Error fetching orders:', error);
    } finally {
      setLoading(false);
    }
  };

  const statusColors: Record<string, string> = {
    'pending': 'bg-amber-100 text-amber-700 border-amber-200',
    'processing': 'bg-blue-100 text-blue-700 border-blue-200',
    'shipped': 'bg-purple-100 text-purple-700 border-purple-200',
    'dispatched_to_rider': 'bg-indigo-100 text-indigo-700 border-indigo-200',
    'delivered': 'bg-gray-100 text-gray-900 border-gray-200',
    'cancelled': 'bg-red-100 text-red-700 border-red-200',
    'awaiting_payment': 'bg-gray-100 text-gray-700 border-gray-200'
  };

  const formatStatus = (status: string, paymentStatus?: string) => {
    // Unpaid checkout attempts stay status=pending until Moolre confirms payment.
    // Label them clearly so staff don't treat them as confirmed orders.
    if ((status === 'pending' || status === 'awaiting_payment') && paymentStatus && paymentStatus !== 'paid') {
      return 'Awaiting Payment';
    }
    if (status === 'shipped') return 'Packaged';
    if (status === 'dispatched_to_rider') return 'Dispatched To Rider';
    return status ? status.charAt(0).toUpperCase() + status.slice(1) : 'Unknown';
  };

  const getCustomerName = (order: Order) => {
    // Try shipping address names first (most reliable — entered at checkout)
    if (order.shipping_address?.firstName || order.shipping_address?.lastName) {
      const first = order.shipping_address.firstName?.trim() || '';
      const last = order.shipping_address.lastName?.trim() || '';
      return `${first} ${last}`.trim();
    }
    if (order.shipping_address?.full_name) return order.shipping_address.full_name;
    // Try metadata names
    if (order.metadata?.first_name || order.metadata?.last_name) {
      const first = order.metadata.first_name?.trim() || '';
      const last = order.metadata.last_name?.trim() || '';
      return `${first} ${last}`.trim();
    }
    if (order.profiles?.full_name) return order.profiles.full_name;
    if (order.email) {
      const name = order.email.split('@')[0];
      return name.charAt(0).toUpperCase() + name.slice(1);
    }
    return 'Guest';
  };

  const getCustomerEmail = (order: Order) => {
    return order.email || order.profiles?.email || 'N/A';
  };

  const getCustomerAvatar = (order: Order) => {
    const name = getCustomerName(order);
    const parts = name.split(' ');
    if (parts.length >= 2) {
      return parts[0][0] + parts[1][0];
    }
    return name.substring(0, 2).toUpperCase();
  };

  const getItemCount = (order: Order) => {
    if (!order.order_items) return 0;
    return order.order_items.reduce((sum, item) => sum + item.quantity, 0);
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  };

  const handleSelectAll = () => {
    if (selectedOrders.length === filteredOrders.length) {
      setSelectedOrders([]);
    } else {
      setSelectedOrders(filteredOrders.map(o => o.id));
    }
  };

  const handleSelectOrder = (orderId: string) => {
    if (selectedOrders.includes(orderId)) {
      setSelectedOrders(selectedOrders.filter(id => id !== orderId));
    } else {
      setSelectedOrders([...selectedOrders, orderId]);
    }
  };

  const handleBulkAction = async (action: string, newStatus?: string) => {
    if (newStatus) {
      try {
        // Update each selected order via API
        await Promise.all(
          selectedOrders.map(id =>
            fetch(`/api/admin/orders/${id}`, {
              method: 'PATCH',
              credentials: 'include',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ status: newStatus }),
            })
          )
        );

        // Send Notifications — the admin cookie session authenticates the API.
        const updatedOrders = orders.filter(o => selectedOrders.includes(o.id));
        updatedOrders.forEach(order => {
          fetch('/api/notifications', {
            method: 'POST',
            credentials: 'include',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              type: 'order_updated',
              payload: { order, status: newStatus }
            })
          }).catch(err => console.error('Notification error', err));
        });

        await fetchOrders();
        setSelectedOrders([]);
        alert(`${selectedOrders.length} orders updated to ${newStatus}`);
      } catch (error) {
        console.error('Error updating orders:', error);
        alert('Failed to update orders');
      }
    } else if (action === 'Export') {
      const ordersToExport = orders.filter(o => selectedOrders.includes(o.id));
      const csvContent = `Order ID,Customer,Email,Date,Items,Total,Status,Payment\n${ordersToExport.map(o =>
        `${o.order_number || o.id},${getCustomerName(o)},${getCustomerEmail(o)},${formatDate(o.created_at)},${getItemCount(o)},${o.total},${o.status},${o.payment_method || 'N/A'}`
      ).join('\n')}`;
      const blob = new Blob([csvContent], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'selected-orders.csv';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    }
  };

  const handleExportAll = () => {
    const csvContent = `Order ID,Customer,Email,Date,Items,Total,Status,Payment\n${orders.map(o =>
      `${o.order_number || o.id},${getCustomerName(o)},${getCustomerEmail(o)},${formatDate(o.created_at)},${getItemCount(o)},${o.total},${o.status},${o.payment_method || 'N/A'}`
    ).join('\n')}`;
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'all-orders.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  };

  const handlePrintInvoice = (orderId: string) => {
    window.open(`/admin/orders/${orderId}?print=true`, '_blank');
  };

  const handleResendPaymentLink = async (order: Order) => {
    setSendingPaymentLink(order.id);
    try {
      const response = await fetch('/api/notifications', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'payment_link',
          payload: order
        })
      });
      
      if (!response.ok) throw new Error('Failed to send');
      
      alert(`Payment link sent to ${order.phone || order.email}`);
    } catch (error) {
      console.error('Error sending payment link:', error);
      alert('Failed to send payment link');
    } finally {
      setSendingPaymentLink(null);
    }
  };

  const filteredOrders = orders.filter(order => {
    const customerName = getCustomerName(order).toLowerCase();
    const customerEmail = getCustomerEmail(order).toLowerCase();

    // Confirmed = paid only. Abandoned cart = unpaid checkout attempts.
    const matchesViewTab =
      orderViewTab === 'confirmed'
        ? order.payment_status === 'paid'
        : order.payment_status !== 'paid';

    const matchesSearch = orderMatchesSearch(order, searchQuery, customerName, customerEmail);
    const matchesStatus = statusFilter === 'all' || order.status === statusFilter;
    const method = String(order.shipping_method || '').toLowerCase();
    const matchesShipping =
      shippingFilter === 'all' ||
      (shippingFilter === 'pickup' && (method === 'pickup' || method === 'store_pickup' || method === 'store-pickup')) ||
      (shippingFilter === 'delivery' && method && method !== 'pickup' && method !== 'store_pickup' && method !== 'store-pickup') ||
      (shippingFilter === 'unspecified' && !method) ||
      method === shippingFilter;
    const matchesProduct = productFilter === 'all' || 
      order.order_items?.some((item: any) => item.product_name === productFilter);
    return matchesViewTab && matchesSearch && matchesStatus && matchesShipping && matchesProduct;
  });

  // A search that hits nothing here but matches in the other tab is the usual
  // reason an order looks missing, so point staff at it instead of dead-ending.
  const matchesInOtherTab = !searchQuery.trim()
    ? 0
    : orders.filter((order) => {
        const inOtherTab =
          orderViewTab === 'confirmed' ? order.payment_status !== 'paid' : order.payment_status === 'paid';
        return (
          inOtherTab &&
          orderMatchesSearch(
            order,
            searchQuery,
            getCustomerName(order).toLowerCase(),
            getCustomerEmail(order).toLowerCase()
          )
        );
      }).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">
            Orders
            {selectedBranch && (
              <span className="ml-3 inline-flex items-center gap-1 align-middle px-3 py-1 rounded-full bg-brand-primary/15 text-brand-text text-sm font-semibold">
                <i className="ri-store-2-line" />
                {selectedBranch.name}
              </span>
            )}
          </h1>
          <p className="text-gray-600 mt-1">
            {selectedBranch
              ? `Orders placed at ${selectedBranch.name}`
              : 'Confirmed (paid) orders and abandoned checkouts, separated'}
          </p>
        </div>
        <div className="flex items-center gap-3 w-full md:w-auto">
          <button
            onClick={() => setShowProductStats(true)}
            className="flex-1 md:flex-none bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 px-6 py-3 rounded-lg font-semibold transition-colors whitespace-nowrap cursor-pointer shadow-sm flex items-center justify-center"
          >
            <i className="ri-bar-chart-groupped-line mr-2"></i>
            Stats
          </button>
          <button
            onClick={handleExportAll}
            className="flex-1 md:flex-none bg-gray-900 hover:bg-gray-800 text-white px-6 py-3 rounded-lg font-semibold transition-colors whitespace-nowrap cursor-pointer shadow-sm flex items-center justify-center"
          >
            <i className="ri-download-line mr-2"></i>
            Export
          </button>
        </div>
      </div>

      {missingFromView > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-start space-x-3">
            <i className="ri-error-warning-line text-xl text-red-600 mt-0.5"></i>
            <div>
              <p className="text-sm font-semibold text-red-800">
                {missingFromView} older orders are not loaded
              </p>
              <p className="text-sm text-red-700 mt-1">
                Counts and search below cover only the orders shown, so those older ones will not be
                found here. Tell your developer the admin order list is being truncated.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* View Tabs: Confirmed Orders vs Abandoned Cart */}
      <div className="flex border-b border-gray-200">
        <button
          onClick={() => { setOrderViewTab('confirmed'); setStatusFilter('all'); setSelectedOrders([]); }}
          className={`px-6 py-3 font-semibold text-sm border-b-2 transition-colors cursor-pointer ${
            orderViewTab === 'confirmed'
              ? 'border-gray-900 text-gray-900'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <i className="ri-check-double-line mr-2"></i>
          Confirmed Orders ({confirmedCount})
        </button>
        <button
          onClick={() => { setOrderViewTab('abandoned'); setStatusFilter('all'); setSelectedOrders([]); }}
          className={`px-6 py-3 font-semibold text-sm border-b-2 transition-colors cursor-pointer ${
            orderViewTab === 'abandoned'
              ? 'border-amber-600 text-amber-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <i className="ri-shopping-cart-2-line mr-2"></i>
          Abandoned Cart ({abandonedCount})
        </button>
      </div>

      {orderViewTab === 'confirmed' && (
        <>
          <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4">
            <div className="flex items-start space-x-3">
              <i className="ri-checkbox-circle-line text-xl text-emerald-600 mt-0.5"></i>
              <div>
                <p className="text-sm font-semibold text-emerald-800">Confirmed Orders</p>
                <p className="text-sm text-emerald-700 mt-1">
                  Payment received. These are real orders to fulfill — process, package, and deliver from here.
                </p>
              </div>
            </div>
          </div>

          {justPlacedCount > 0 && (
            <button
              onClick={() => { setOrderViewTab('abandoned'); setStatusFilter('all'); setSelectedOrders([]); }}
              className="w-full text-left bg-blue-50 border border-blue-200 rounded-lg p-4 hover:bg-blue-100 transition-colors cursor-pointer"
            >
              <div className="flex items-start space-x-3">
                <i className="ri-notification-3-line text-xl text-blue-600 mt-0.5"></i>
                <div>
                  <p className="text-sm font-semibold text-blue-800">
                    {justPlacedCount} order{justPlacedCount > 1 ? 's' : ''} placed in the last 2 hours still paying
                  </p>
                  <p className="text-sm text-blue-700 mt-1">
                    They appear here automatically once the money lands. Tap to see them in Abandoned Cart.
                  </p>
                </div>
              </div>
            </button>
          )}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            {orderStats.map((stat) => (
              <button
                key={stat.status}
                onClick={() => setStatusFilter(stat.status)}
                className={`p-4 rounded-xl border-2 transition-all text-left cursor-pointer ${statusFilter === stat.status
                  ? 'border-gray-900 bg-gray-50'
                  : 'border-gray-200 bg-white hover:border-gray-300'
                  }`}
              >
                <p className="text-2xl font-bold text-gray-900">{stat.count}</p>
                <p className="text-sm text-gray-600 mt-1">{stat.label}</p>
              </button>
            ))}
          </div>
        </>
      )}

      {orderViewTab === 'abandoned' && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
          <div className="flex items-start space-x-3">
            <i className="ri-information-line text-xl text-amber-600 mt-0.5"></i>
            <div>
              <p className="text-sm font-semibold text-amber-800">Abandoned Cart</p>
              <p className="text-sm text-amber-700 mt-1">
                Checkout started but payment was never completed. These are not confirmed orders — do not fulfill them unless you mark payment as received. Orders just placed can still turn into paid orders on their own, and rows tagged <span className="font-semibold">Paid on retry</span> were already paid under another order number. You can resend a payment link from the actions column.
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="p-6 border-b border-gray-200">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between space-y-4 md:space-y-0">
            <div className="flex-1 max-w-md">
              <div className="relative">
                <i className="ri-search-line absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 text-lg w-5 h-5 flex items-center justify-center"></i>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search order ID, name, email, phone or Moolre Tx ID..."
                  className="w-full pl-12 pr-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-600 focus:border-gray-600 text-sm"
                />
              </div>
            </div>

            <div className="flex items-center space-x-3">
              <button
                onClick={() => setShowFilters(!showFilters)}
                className="px-4 py-3 border-2 border-gray-300 text-gray-700 rounded-lg hover:border-gray-400 transition-colors font-medium whitespace-nowrap cursor-pointer"
              >
                <i className="ri-filter-line mr-2"></i>
                Filters
              </button>
              <select
                value={productFilter}
                onChange={(e) => setProductFilter(e.target.value)}
                className="px-4 py-3 pr-8 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-600 focus:border-gray-600 font-medium cursor-pointer"
              >
                <option value="all">All Products</option>
                {availableProducts.map((name) => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="px-4 py-3 pr-8 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-600 focus:border-gray-600 font-medium cursor-pointer"
              >
                <option value="date">Sort by Date</option>
                <option value="total">Sort by Total</option>
                <option value="customer">Sort by Customer</option>
                <option value="status">Sort by Status</option>
              </select>
            </div>
          </div>

          {showFilters && (
            <div className="mt-4 p-4 bg-gray-50 rounded-lg grid md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Date Range</label>
                <input type="date" className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg text-sm" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Payment Method</label>
                <select className="w-full px-3 py-2 pr-8 border-2 border-gray-300 rounded-lg text-sm cursor-pointer">
                  <option>All Methods</option>
                  <option>Paystack</option>
                  <option>Mobile Money</option>
                  <option>Card</option>
                  <option>Cash on Delivery</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Fulfillment</label>
                <select
                  value={shippingFilter}
                  onChange={(e) => setShippingFilter(e.target.value)}
                  className="w-full px-3 py-2 pr-8 border-2 border-gray-300 rounded-lg text-sm cursor-pointer"
                >
                  <option value="all">All methods</option>
                  <option value="pickup">Store Pickup</option>
                  <option value="delivery">Delivery (any)</option>
                  <option value="doorstep">Doorstep Delivery</option>
                  <option value="unspecified">Not specified</option>
                </select>
              </div>
            </div>
          )}
        </div>

        {selectedOrders.length > 0 && (
          <div className="p-4 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
            <p className="text-gray-800 font-semibold">
              {selectedOrders.length} order{selectedOrders.length > 1 ? 's' : ''} selected
            </p>
            <div className="flex items-center space-x-2">
              <button
                onClick={() => handleBulkAction('Mark as Processing', 'processing')}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors whitespace-nowrap cursor-pointer"
              >
                Mark Processing
              </button>
              <button
                onClick={() => handleBulkAction('Mark as Packaged', 'shipped')}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm font-medium transition-colors whitespace-nowrap cursor-pointer"
              >
                Mark Packaged
              </button>
              <button
                onClick={() => handleBulkAction('Mark as Dispatched To Rider', 'dispatched_to_rider')}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium transition-colors whitespace-nowrap cursor-pointer"
              >
                Dispatched To Rider
              </button>
              <button
                onClick={() => handleBulkAction('Export')}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-800 text-white rounded-lg text-sm font-medium transition-colors whitespace-nowrap cursor-pointer"
              >
                <i className="ri-download-line mr-2"></i>
                Export
              </button>
            </div>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="py-4 px-6">
                  <input
                    type="checkbox"
                    checked={selectedOrders.length === filteredOrders.length && filteredOrders.length > 0}
                    onChange={handleSelectAll}
                    className="w-4 h-4 text-gray-900 border-gray-300 rounded focus:ring-gray-600 cursor-pointer"
                  />
                </th>
                <th className="text-left py-4 px-4 text-sm font-semibold text-gray-700">Order ID</th>
                <th className="text-left py-4 px-4 text-sm font-semibold text-gray-700">Customer</th>
                <th className="text-left py-4 px-4 text-sm font-semibold text-gray-700">Date</th>
                <th className="text-left py-4 px-4 text-sm font-semibold text-gray-700">Items</th>
                <th className="text-left py-4 px-4 text-sm font-semibold text-gray-700">Total</th>
                <th className="text-left py-4 px-4 text-sm font-semibold text-gray-700">Payment</th>
                <th className="text-left py-4 px-4 text-sm font-semibold text-gray-700">Fulfillment</th>
                <th className="text-left py-4 px-4 text-sm font-semibold text-gray-700">Status</th>
                <th className="text-left py-4 px-4 text-sm font-semibold text-gray-700">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={10} className="py-12 text-center text-gray-500">
                    <i className="ri-loader-4-line animate-spin text-3xl text-gray-900"></i>
                    <p className="mt-2">Loading orders...</p>
                  </td>
                </tr>
              ) : filteredOrders.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-12 text-center text-gray-500">
                    <i className={`${orderViewTab === 'abandoned' ? 'ri-shopping-cart-2-line' : 'ri-inbox-line'} text-4xl text-gray-300`}></i>
                    <p className="mt-2">
                      {orderViewTab === 'confirmed' ? 'No confirmed orders found' : 'No abandoned carts found'}
                    </p>
                    <p className="text-sm">
                      {orderViewTab === 'confirmed'
                        ? 'Paid orders will appear here after payment succeeds'
                        : 'Unpaid checkouts will appear here when customers abandon payment'}
                    </p>
                    {matchesInOtherTab > 0 && (
                      <button
                        onClick={() => setOrderViewTab(orderViewTab === 'confirmed' ? 'abandoned' : 'confirmed')}
                        className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-gray-900 text-white text-sm font-semibold hover:bg-gray-800 cursor-pointer"
                      >
                        <i className="ri-arrow-right-line" />
                        {matchesInOtherTab} match{matchesInOtherTab > 1 ? 'es' : ''} in{' '}
                        {orderViewTab === 'confirmed' ? 'Abandoned Cart' : 'Confirmed Orders'}
                      </button>
                    )}
                  </td>
                </tr>
              ) : (
                filteredOrders.map((order) => (
                  <tr key={order.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                    <td className="py-4 px-6">
                      <input
                        type="checkbox"
                        checked={selectedOrders.includes(order.id)}
                        onChange={() => handleSelectOrder(order.id)}
                        className="w-4 h-4 text-gray-900 border-gray-300 rounded focus:ring-gray-600 cursor-pointer"
                      />
                    </td>
                    <td className="py-4 px-4">
                      <Link href={`/admin/orders/${order.id}`} className="text-gray-900 hover:text-gray-800 font-semibold whitespace-nowrap cursor-pointer">
                        {order.order_number || order.id.substring(0, 8)}
                      </Link>
                      {!selectedBranch && order.branches?.name && (
                        <p className="text-xs text-gray-500 mt-0.5 whitespace-nowrap">
                          <i className="ri-store-2-line mr-1"></i>
                          {order.branches.name}
                        </p>
                      )}
                    </td>
                    <td className="py-4 px-4">
                      <div className="flex items-center space-x-3">
                        <div className="w-10 h-10 flex items-center justify-center bg-gray-200 text-gray-700 rounded-full font-semibold text-sm">
                          {getCustomerAvatar(order)}
                        </div>
                        <div>
                          <p className="font-medium text-gray-900 whitespace-nowrap">{getCustomerName(order)}</p>
                          <p className="text-sm text-gray-500">{getCustomerEmail(order)}</p>
                        </div>
                      </div>
                    </td>
                    <td className="py-4 px-4 text-gray-700 text-sm whitespace-nowrap">{formatDate(order.created_at)}</td>
                    <td className="py-4 px-4 text-gray-700">{getItemCount(order)}</td>
                    <td className="py-4 px-4 font-semibold text-gray-900 whitespace-nowrap">GH₵ {order.total?.toFixed(2) || '0.00'}</td>
                    <td className="py-4 px-4 text-sm whitespace-nowrap">
                      <div className="flex flex-col gap-1">
                        <span className="text-gray-700 capitalize">{order.payment_method || 'N/A'}</span>
                        <span
                          className={`inline-flex self-start px-2 py-0.5 rounded-full text-[11px] font-semibold border ${
                            order.payment_status === 'paid'
                              ? 'bg-green-100 text-green-800 border-green-200'
                              : order.payment_status === 'failed'
                                ? 'bg-red-100 text-red-700 border-red-200'
                                : 'bg-amber-100 text-amber-800 border-amber-200'
                          }`}
                        >
                          {order.payment_status === 'paid'
                            ? 'Paid'
                            : order.payment_status === 'failed'
                              ? 'Failed'
                              : 'Unpaid'}
                        </span>
                        {orderViewTab === 'abandoned' && wasPaidOnAnotherAttempt(order, paidOrders) && (
                          <span
                            className="inline-flex self-start px-2 py-0.5 rounded-full text-[11px] font-semibold border bg-emerald-100 text-emerald-800 border-emerald-200"
                            title="Same customer and amount was paid under a different order number — this row is a duplicate checkout attempt, not lost money."
                          >
                            Paid on retry
                          </span>
                        )}
                        {orderViewTab === 'abandoned' && isJustPlaced(order) && (
                          <span
                            className="inline-flex self-start px-2 py-0.5 rounded-full text-[11px] font-semibold border bg-blue-100 text-blue-800 border-blue-200"
                            title="Placed less than 2 hours ago — payment may still come through."
                          >
                            Just placed
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-4 px-4">
                      {(() => {
                        const ship = getShippingMethodInfo(order.shipping_method);
                        return (
                          <span
                            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold border whitespace-nowrap ${shippingMethodBadgeClass(ship.kind)}`}
                            title={ship.hint}
                          >
                            <i className={ship.icon} />
                            {ship.short}
                          </span>
                        );
                      })()}
                    </td>
                    <td className="py-4 px-4">
                      <span className={`px-3 py-1 rounded-full text-xs font-semibold border whitespace-nowrap ${statusColors[order.status] || 'bg-gray-100 text-gray-700 border-gray-200'}`}>
                        {formatStatus(order.status, order.payment_status)}
                      </span>
                    </td>
                    <td className="py-4 px-4">
                      <div className="flex items-center space-x-2">
                        <Link
                          href={`/admin/orders/${order.id}`}
                          className="w-8 h-8 flex items-center justify-center text-gray-600 hover:text-gray-900 hover:bg-gray-50 rounded-lg transition-colors cursor-pointer"
                          title="View Order"
                        >
                          <i className="ri-eye-line text-lg w-4 h-4 flex items-center justify-center"></i>
                        </Link>
                        {orderViewTab === 'abandoned' && order.payment_status !== 'paid' && (
                          <button
                            onClick={() => handleResendPaymentLink(order)}
                            disabled={sendingPaymentLink === order.id}
                            className="w-8 h-8 flex items-center justify-center text-amber-600 hover:text-amber-800 hover:bg-amber-50 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
                            title="Resend Payment Link"
                          >
                            {sendingPaymentLink === order.id ? (
                              <i className="ri-loader-4-line text-lg w-4 h-4 flex items-center justify-center animate-spin"></i>
                            ) : (
                              <i className="ri-send-plane-line text-lg w-4 h-4 flex items-center justify-center"></i>
                            )}
                          </button>
                        )}
                        <button
                          onClick={() => handlePrintInvoice(order.id)}
                          className="w-8 h-8 flex items-center justify-center text-gray-600 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition-colors cursor-pointer"
                          title="Print Invoice"
                        >
                          <i className="ri-printer-line text-lg w-4 h-4 flex items-center justify-center"></i>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {filteredOrders.length > 0 && (
          <div className="p-6 border-t border-gray-200 flex items-center justify-between">
            <p className="text-gray-600">
              Showing {filteredOrders.length} of{' '}
              {orderViewTab === 'confirmed' ? confirmedCount : abandonedCount}{' '}
              {orderViewTab === 'confirmed' ? 'confirmed orders' : 'abandoned carts'}
            </p>
          </div>
        )}
      </div>

      <ProductSalesStats isOpen={showProductStats} onClose={() => setShowProductStats(false)} branchId={selectedBranch?.id || null} />
    </div>
  );
}
