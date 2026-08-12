'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';

export default function CustomerDetailsPage() {
    const params = useParams();
    const customerId = params.id as string;
    
    const [customer, setCustomer] = useState<any>(null);
    const [orders, setOrders] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);

    useEffect(() => {
        if (customerId) {
            fetchCustomerData();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps -- fetch when customerId changes
    }, [customerId]);

    const fetchCustomerData = async () => {
        try {
            setLoading(true);
            setLoadError(null);

            const res = await fetch(`/api/admin/customers/${customerId}`, { credentials: 'include' });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(json.error || 'Failed to fetch customer');

            setCustomer(json.customer);
            setOrders(json.orders || []);
        } catch (err: any) {
            console.error('Error fetching customer:', err);
            setLoadError(err?.message || 'Failed to load customer');
            setCustomer(null);
            setOrders([]);
        } finally {
            setLoading(false);
        }
    };

    if (loading) return <div className="p-8 text-center text-gray-500">Loading customer details...</div>;
    if (loadError) return <div className="p-8 text-center text-red-600">{loadError}</div>;
    if (!customer) return <div className="p-8 text-center text-red-500">Customer not found</div>;

    const displayName = customer.full_name ||
        (customer.first_name && customer.last_name ? `${customer.first_name} ${customer.last_name}` : null) ||
        customer.first_name ||
        'No Name';

    const totalSpent = orders.reduce((sum, order) => sum + (order.total || 0), 0);

    return (
        <div className="max-w-7xl mx-auto">
            {/* Header */}
            <div className="flex items-center justify-between mb-8">
                <div className="flex items-center space-x-4">
                    <Link href="/admin/customers" className="p-2 hover:bg-gray-100 rounded-lg text-gray-500 transition-colors">
                        <i className="ri-arrow-left-line text-xl"></i>
                    </Link>
                    <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center text-gray-900 text-2xl font-bold">
                        {displayName.charAt(0) || customer.email.charAt(0).toUpperCase()}
                    </div>
                    <div>
                        <h1 className="text-3xl font-bold text-gray-900">{displayName}</h1>
                        <p className="text-gray-500">{customer.email}</p>
                    </div>
                </div>
                <div className="flex space-x-3">
                    <button className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 font-medium hover:bg-gray-50 cursor-pointer">
                        <i className="ri-mail-send-line mr-2"></i>
                        Send Email
                    </button>
                    <button className="px-4 py-2 bg-gray-700 text-white rounded-lg font-bold hover:bg-gray-900 cursor-pointer">
                        Edit Customer
                    </button>
                </div>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                    <p className="text-sm font-medium text-gray-500 mb-1">Total Spent</p>
                    <p className="text-2xl font-bold text-gray-900">GH₵{totalSpent.toFixed(2)}</p>
                </div>
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                    <p className="text-sm font-medium text-gray-500 mb-1">Total Orders</p>
                    <p className="text-2xl font-bold text-gray-900">{orders.length}</p>
                </div>
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                    <p className="text-sm font-medium text-gray-500 mb-1">Last Order</p>
                    <p className="text-xl font-bold text-gray-900">
                        {orders[0] ? new Date(orders[0].created_at).toLocaleDateString() : 'Never'}
                    </p>
                </div>
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                    <p className="text-sm font-medium text-gray-500 mb-1">Phone</p>
                    <p className="text-lg font-bold text-gray-900">{customer.phone || 'N/A'}</p>
                </div>
            </div>

            {/* Orders History */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-200">
                    <h2 className="text-lg font-bold text-gray-900">Order History</h2>
                </div>

                {orders.length === 0 ? (
                    <div className="p-8 text-center text-gray-500">No orders found.</div>
                ) : (
                    <table className="w-full text-left">
                        <thead className="bg-gray-50 text-gray-600 text-xs uppercase font-semibold">
                            <tr>
                                <th className="px-6 py-4">Order ID</th>
                                <th className="px-6 py-4">Date</th>
                                <th className="px-6 py-4">Status</th>
                                <th className="px-6 py-4">Total</th>
                                <th className="px-6 py-4 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {orders.map(order => (
                                <tr key={order.id} className="hover:bg-gray-50">
                                    <td className="px-6 py-4 text-sm font-medium text-gray-700">
                                        <Link href={`/admin/orders/${order.id}`}>#{order.id.slice(0, 8)}</Link>
                                    </td>
                                    <td className="px-6 py-4 text-sm text-gray-600">
                                        {new Date(order.created_at).toLocaleDateString()}
                                    </td>
                                    <td className="px-6 py-4">
                                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize
                                            ${order.status === 'completed' || order.status === 'delivered' ? 'bg-gray-100 text-gray-800' :
                                                order.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                                                    order.status === 'cancelled' ? 'bg-red-100 text-red-800' :
                                                        order.status === 'dispatched_to_rider' ? 'bg-indigo-100 text-indigo-800' : 'bg-blue-100 text-blue-800'}`}>
                                            {order.status === 'dispatched_to_rider' ? 'Dispatched To Rider' : order.status.replace(/_/g, ' ')}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-sm font-bold text-gray-900">
                                        GH₵{(order.total || 0).toFixed(2)}
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        <Link href={`/admin/orders/${order.id}`} className="text-gray-400 hover:text-gray-700">
                                            <i className="ri-eye-line text-lg"></i>
                                        </Link>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
}
