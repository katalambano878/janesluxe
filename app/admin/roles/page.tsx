'use client';

import { useState, useEffect } from 'react';
import { fetchWithTimeout, readJsonSafe, TimeoutError } from '@/lib/http';

interface Role {
    id: string;
    name: string;
    description: string;
    enabled: boolean;
    is_system: boolean;
    permissions: Record<string, boolean>;
    created_at: string;
    updated_at: string;
}

const PERMISSION_LABELS: Record<string, { label: string; icon: string; description: string }> = {
    dashboard: { label: 'Dashboard', icon: 'ri-dashboard-line', description: 'View the admin dashboard and KPIs' },
    orders: { label: 'Orders', icon: 'ri-shopping-bag-line', description: 'View and manage customer orders' },
    pos: { label: 'POS System', icon: 'ri-store-3-line', description: 'Access the point of sale system' },
    products: { label: 'Products', icon: 'ri-box-3-line', description: 'Manage products, pricing, and images' },
    categories: { label: 'Categories', icon: 'ri-folder-line', description: 'Manage product categories' },
    customers: { label: 'Customers', icon: 'ri-group-line', description: 'View and manage customers' },
    reviews: { label: 'Reviews', icon: 'ri-chat-smile-2-line', description: 'Moderate product reviews' },
    inventory: { label: 'Inventory', icon: 'ri-stack-line', description: 'Track and manage stock levels' },
    analytics: { label: 'Analytics', icon: 'ri-bar-chart-line', description: 'View sales and performance analytics' },
    coupons: { label: 'Coupons', icon: 'ri-coupon-2-line', description: 'Create and manage discount coupons' },
    support: { label: 'Support Hub', icon: 'ri-customer-service-2-line', description: 'Manage support tickets' },
    customer_insights: { label: 'Customer Insights', icon: 'ri-user-search-line', description: 'View customer analytics and segments' },
    notifications: { label: 'Notifications', icon: 'ri-notification-3-line', description: 'Manage marketing notifications' },
    sms_debugger: { label: 'SMS Debugger', icon: 'ri-message-2-line', description: 'Test and debug SMS messages' },
    blog: { label: 'Blog', icon: 'ri-article-line', description: 'Manage blog posts and content' },
    modules: { label: 'Modules', icon: 'ri-puzzle-line', description: 'Enable or disable store modules' },
    staff: { label: 'Staff Management', icon: 'ri-team-line', description: 'Add and manage staff members' },
    delivery: { label: 'Delivery Hub', icon: 'ri-truck-line', description: 'Access delivery logistics dashboard' },
    roles: { label: 'Roles & Permissions', icon: 'ri-shield-user-line', description: 'Manage user roles and permissions' },
};

const PERMISSION_KEYS = Object.keys(PERMISSION_LABELS);

export default function RolesPage() {
    const [roles, setRoles] = useState<Role[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [saving, setSaving] = useState<string | null>(null);
    const [expandedRole, setExpandedRole] = useState<string | null>(null);
    const [userRole, setUserRole] = useState<string | null>(null);
    const [userCount, setUserCount] = useState<Record<string, number>>({});

    useEffect(() => {
        fetchRoles();
    }, []);

    async function fetchRoles() {
        setLoading(true);
        setLoadError(null);
        try {
            const res = await fetchWithTimeout('/api/admin/roles', {
                credentials: 'include',
                timeoutMs: 15000,
            });
            if (!res.ok) {
                const err = await readJsonSafe<{ error?: string }>(res);
                throw new Error(err?.error || `Failed to load roles (${res.status})`);
            }
            const json = await readJsonSafe<{
                roles?: Role[];
                userCount?: Record<string, number>;
                currentRole?: string | null;
            }>(res);
            setRoles(json?.roles || []);
            setUserCount(json?.userCount || {});
            if (json?.currentRole) setUserRole(json.currentRole);
        } catch (err) {
            const message = err instanceof TimeoutError
                ? 'Request timed out loading roles.'
                : err instanceof Error
                    ? err.message
                    : 'Failed to load roles.';
            setLoadError(message);
            console.error('Error fetching roles:', err);
        } finally {
            setLoading(false);
        }
    }

    async function patchRole(body: Record<string, unknown>) {
        const res = await fetchWithTimeout('/api/admin/roles', {
            method: 'PATCH',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
            timeoutMs: 15000,
        });
        if (!res.ok) {
            const err = await readJsonSafe<{ error?: string }>(res);
            throw new Error(err?.error || 'Update failed');
        }
    }

    async function toggleRoleEnabled(role: Role) {
        if (role.is_system) return;

        setSaving(role.id);
        const newEnabled = !role.enabled;

        try {
            await patchRole({ id: role.id, enabled: newEnabled });
            setRoles(prev => prev.map(r => r.id === role.id ? { ...r, enabled: newEnabled } : r));
        } catch (err) {
            alert('Error updating role: ' + (err instanceof Error ? err.message : 'Unknown error'));
        } finally {
            setSaving(null);
        }
    }

    async function togglePermission(roleId: string, permKey: string) {
        const role = roles.find(r => r.id === roleId);
        if (!role) return;

        const newPermissions = { ...role.permissions, [permKey]: !role.permissions[permKey] };

        setSaving(roleId);
        try {
            await patchRole({ id: roleId, permissions: newPermissions });
            setRoles(prev => prev.map(r => r.id === roleId ? { ...r, permissions: newPermissions } : r));
        } catch (err) {
            alert('Error updating permissions: ' + (err instanceof Error ? err.message : 'Unknown error'));
        } finally {
            setSaving(null);
        }
    }

    async function toggleAllPermissions(roleId: string, enable: boolean) {
        const role = roles.find(r => r.id === roleId);
        if (!role) return;

        const newPermissions: Record<string, boolean> = {};
        PERMISSION_KEYS.forEach(key => {
            newPermissions[key] = key === 'roles' ? false : enable;
        });

        setSaving(roleId);
        try {
            await patchRole({ id: roleId, permissions: newPermissions });
            setRoles(prev => prev.map(r => r.id === roleId ? { ...r, permissions: newPermissions } : r));
        } catch (err) {
            alert('Error updating permissions: ' + (err instanceof Error ? err.message : 'Unknown error'));
        } finally {
            setSaving(null);
        }
    }

    if (userRole !== null && userRole !== 'admin') {
        return (
            <div className="min-h-[60vh] flex items-center justify-center">
                <div className="text-center">
                    <i className="ri-lock-line text-5xl text-gray-300 mb-4 block"></i>
                    <h2 className="text-xl font-bold text-gray-900 mb-2">Access Denied</h2>
                    <p className="text-gray-600">Only Super Admins can manage roles and permissions.</p>
                </div>
            </div>
        );
    }

    if (loading) {
        return (
            <div className="space-y-6">
                <div className="h-10 bg-gray-200 rounded-lg w-48 animate-pulse" />
                <div className="grid gap-6">
                    {[1, 2].map(i => (
                        <div key={i} className="bg-white rounded-xl border border-gray-200 p-6 animate-pulse">
                            <div className="h-6 bg-gray-200 rounded w-32 mb-2" />
                            <div className="h-4 bg-gray-100 rounded w-64" />
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    if (loadError) {
        return (
            <div className="min-h-[40vh] flex items-center justify-center">
                <div className="text-center max-w-md">
                    <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                        {loadError}
                    </div>
                    <button
                        type="button"
                        onClick={fetchRoles}
                        className="px-4 py-2 bg-gray-900 text-white rounded-lg font-medium hover:bg-gray-800 cursor-pointer"
                    >
                        Retry
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold text-gray-900">Roles & Permissions</h1>
                    <p className="text-gray-600 mt-1">Control which roles can access the admin panel and what they can do.</p>
                </div>
            </div>

            <div className="grid gap-5">
                {roles.map(role => {
                    const isExpanded = expandedRole === role.id;
                    const permCount = PERMISSION_KEYS.filter(k => role.permissions[k]).length;
                    const isSaving = saving === role.id;

                    return (
                        <div
                            key={role.id}
                            className={`bg-white rounded-xl border-2 transition-all ${
                                isExpanded ? 'border-gray-300 shadow-lg' : 'border-gray-200 shadow-sm'
                            } ${!role.enabled && !role.is_system ? 'opacity-60' : ''}`}
                        >
                            <div className="p-6">
                                <div className="flex items-start justify-between">
                                    <div className="flex items-start space-x-4">
                                        <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                                            role.is_system
                                                ? 'bg-amber-100 text-amber-700'
                                                : role.enabled
                                                    ? 'bg-gray-100 text-gray-900'
                                                    : 'bg-gray-100 text-gray-400'
                                        }`}>
                                            <i className={`${role.is_system ? 'ri-shield-star-line' : 'ri-shield-user-line'} text-2xl`}></i>
                                        </div>
                                        <div>
                                            <div className="flex items-center space-x-3">
                                                <h3 className="text-lg font-bold text-gray-900">{role.name}</h3>
                                                {role.is_system && (
                                                    <span className="px-2.5 py-0.5 bg-amber-100 text-amber-800 text-xs font-semibold rounded-full">
                                                        SYSTEM
                                                    </span>
                                                )}
                                                {!role.enabled && !role.is_system && (
                                                    <span className="px-2.5 py-0.5 bg-red-100 text-red-700 text-xs font-semibold rounded-full">
                                                        DISABLED
                                                    </span>
                                                )}
                                            </div>
                                            <p className="text-gray-600 text-sm mt-1">{role.description}</p>
                                            <div className="flex items-center space-x-4 mt-3">
                                                <span className="text-xs text-gray-500 flex items-center">
                                                    <i className="ri-group-line mr-1"></i>
                                                    {userCount[role.id] || 0} user{(userCount[role.id] || 0) !== 1 ? 's' : ''}
                                                </span>
                                                <span className="text-xs text-gray-500 flex items-center">
                                                    <i className="ri-key-line mr-1"></i>
                                                    {permCount} of {PERMISSION_KEYS.length} permissions
                                                </span>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex items-center space-x-3">
                                        {!role.is_system && (
                                            <button
                                                onClick={() => toggleRoleEnabled(role)}
                                                disabled={isSaving}
                                                className="relative cursor-pointer"
                                                title={role.enabled ? 'Disable this role' : 'Enable this role'}
                                            >
                                                <div className={`w-14 h-7 rounded-full transition-colors duration-200 ${
                                                    role.enabled ? 'bg-gray-700' : 'bg-gray-300'
                                                }`}>
                                                    <div className={`w-5 h-5 bg-white rounded-full shadow-md transform transition-transform duration-200 translate-y-1 ${
                                                        role.enabled ? 'translate-x-8' : 'translate-x-1'
                                                    }`} />
                                                </div>
                                            </button>
                                        )}

                                        <button
                                            onClick={() => setExpandedRole(isExpanded ? null : role.id)}
                                            className="w-10 h-10 flex items-center justify-center text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors cursor-pointer"
                                        >
                                            <i className={`${isExpanded ? 'ri-arrow-up-s-line' : 'ri-arrow-down-s-line'} text-xl`}></i>
                                        </button>
                                    </div>
                                </div>
                            </div>

                            {isExpanded && (
                                <div className="border-t border-gray-200">
                                    <div className="p-4 bg-gray-50 flex items-center justify-between">
                                        <h4 className="text-sm font-bold text-gray-700 flex items-center">
                                            <i className="ri-key-2-line mr-2 text-gray-700"></i>
                                            Feature Permissions
                                        </h4>
                                        <div className="flex items-center space-x-2">
                                            <button
                                                type="button"
                                                onClick={() => toggleAllPermissions(role.id, true)}
                                                disabled={isSaving}
                                                className="px-3 py-1.5 text-xs font-medium bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors cursor-pointer disabled:opacity-50"
                                            >
                                                Enable All
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => toggleAllPermissions(role.id, false)}
                                                disabled={isSaving}
                                                className="px-3 py-1.5 text-xs font-medium bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors cursor-pointer disabled:opacity-50"
                                            >
                                                Disable All
                                            </button>
                                        </div>
                                    </div>

                                    <div className="p-4">
                                        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                                            {PERMISSION_KEYS.map(key => {
                                                const perm = PERMISSION_LABELS[key];
                                                const isEnabled = role.permissions[key] === true;

                                                return (
                                                    <button
                                                        type="button"
                                                        key={key}
                                                        onClick={() => togglePermission(role.id, key)}
                                                        disabled={isSaving}
                                                        className={`flex items-start space-x-3 p-3 rounded-xl border-2 transition-all text-left ${
                                                            isEnabled
                                                                ? 'border-gray-200 bg-gray-50 hover:border-gray-300 cursor-pointer'
                                                                : 'border-gray-200 bg-white hover:border-gray-300 cursor-pointer'
                                                        } ${isSaving ? 'opacity-50' : ''}`}
                                                    >
                                                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5 ${
                                                            isEnabled ? 'bg-gray-200 text-gray-800' : 'bg-gray-100 text-gray-400'
                                                        }`}>
                                                            <i className={`${perm.icon} text-lg`}></i>
                                                        </div>
                                                        <div className="flex-1 min-w-0">
                                                            <div className="flex items-center justify-between">
                                                                <span className={`text-sm font-semibold ${isEnabled ? 'text-gray-900' : 'text-gray-500'}`}>
                                                                    {perm.label}
                                                                </span>
                                                                {isEnabled ? (
                                                                    <i className="ri-checkbox-circle-fill text-gray-700 text-lg"></i>
                                                                ) : (
                                                                    <i className="ri-checkbox-blank-circle-line text-gray-300 text-lg"></i>
                                                                )}
                                                            </div>
                                                            <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{perm.description}</p>
                                                        </div>
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>

                                    {role.is_system && (
                                        <div className="px-4 pb-4">
                                            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
                                                <p className="text-xs text-amber-800 flex items-center">
                                                    <i className="ri-information-line mr-2"></i>
                                                    System role: it cannot be disabled or removed. You can still change feature access above for everyone on this role.
                                                </p>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
