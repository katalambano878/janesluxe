'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import BrandLogo from '@/components/BrandLogo';
import { AdminBranchProvider } from '@/context/AdminBranchContext';
import AdminBranchSwitcher from '@/components/admin/AdminBranchSwitcher';

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [userRole, setUserRole] = useState<string | null>(null);

  // Module Filtering State
  const [enabledModules, setEnabledModules] = useState<string[]>([]);
  const [rolePermissions, setRolePermissions] = useState<Record<string, boolean>>({});

  // Maintenance mode (super admin only)
  const [maintenanceEnabled, setMaintenanceEnabled] = useState(false);
  const [maintenanceToggling, setMaintenanceToggling] = useState(false);

  useEffect(() => {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
    const projectRef = supabaseUrl.split('//')[1]?.split('.')[0] || '';

    const readProjectCookie = (name: string): string | null => {
      if (typeof document === 'undefined') return null;
      const match = document.cookie
        .split(';')
        .map((c) => c.trim())
        .find((c) => c.startsWith(`${name}=`));
      return match ? decodeURIComponent(match.split('=').slice(1).join('=')) : null;
    };

    async function checkAuth() {
      try {
        if (pathname === '/admin/login') {
          setIsLoading(false);
          return;
        }

        // Prefer the project-scoped cookies for the token. Some browsers/extensions
        // break the supabase-js client fetch, so we do NOT depend on the SDK here.
        let accessToken: string | null = projectRef
          ? readProjectCookie(`sb-${projectRef}-access-token`)
          : null;
        let refreshToken: string | null = projectRef
          ? readProjectCookie(`sb-${projectRef}-refresh-token`)
          : null;

        // Fallback to whatever the SDK might still have cached (no network call).
        if (!accessToken) {
          try {
            const raw = window.localStorage.getItem(`sb-${projectRef}-auth-token`);
            if (raw) {
              const parsed = JSON.parse(raw);
              accessToken = parsed?.access_token ?? null;
              refreshToken = parsed?.refresh_token ?? null;
            }
          } catch { /* ignore */ }
        }

        if (!accessToken) {
          router.push('/admin/login');
          return;
        }

        const secure = typeof window !== 'undefined' && window.location.protocol === 'https:' ? '; Secure' : '';
        try {
          if (projectRef) {
            document.cookie = `sb-${projectRef}-access-token=${accessToken}; path=/; max-age=${60 * 60 * 24 * 7}; SameSite=Lax${secure}`;
            if (refreshToken) {
              document.cookie = `sb-${projectRef}-refresh-token=${refreshToken}; path=/; max-age=${60 * 60 * 24 * 30}; SameSite=Lax${secure}`;
            }
          }
          // Maintenance bypass cookie — read by middleware to let admins through
          // when the storefront is in maintenance mode.
          document.cookie = `admin_session=1; path=/; max-age=86400; SameSite=Lax${secure}`;
        } catch (_) { }

        const meRes = await fetch('/api/admin/me', {
          credentials: 'include',
          headers: { Authorization: `Bearer ${accessToken}` },
        });

        if (!meRes.ok) {
          let errBody: { error?: string } = {};
          try {
            const text = await meRes.text();
            if (text) errBody = JSON.parse(text);
          } catch (_) { }
          if (meRes.status === 503) router.push('/admin/login?error=config');
          else if (meRes.status === 404) router.push('/admin/login?error=no_profile');
          else if (meRes.status === 403 && errBody?.error === 'Role disabled') router.push('/admin/login?error=role_disabled');
          else router.push('/admin/login');
          return;
        }

        let profileData: { role?: string } | null = null;
        let permissions: Record<string, boolean> = {};
        let meUser: { id?: string; email?: string } | null = null;
        try {
          const json = await meRes.json();
          profileData = json?.profile ?? null;
          permissions = (json?.permissions && typeof json.permissions === 'object') ? json.permissions : {};
          meUser = json?.user ?? null;
        } catch (_) {
          router.push('/admin/login');
          return;
        }
        const role = profileData?.role != null ? String(profileData.role) : '';
        if (role !== 'admin') {
          if (projectRef) {
            document.cookie = `sb-${projectRef}-access-token=; path=/; max-age=0; SameSite=Lax${secure}`;
            document.cookie = `sb-${projectRef}-refresh-token=; path=/; max-age=0; SameSite=Lax${secure}`;
          }
          document.cookie = `sb-access-token=; path=/; max-age=0; SameSite=Lax${secure}`;
          document.cookie = `admin_session=; path=/; max-age=0; SameSite=Lax${secure}`;
          router.push('/admin/login?error=unauthorized');
          return;
        }

        setUser(meUser);
        setUserRole(role);
        if (Object.keys(permissions).length > 0) setRolePermissions(permissions);
        setIsAuthenticated(true);
      } catch {
        router.push('/admin/login');
      } finally {
        setIsLoading(false);
      }
    }

    checkAuth();

    // Keep cookie in sync when session refreshes
    const secure = typeof window !== 'undefined' && window.location.protocol === 'https:' ? '; Secure' : '';
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'TOKEN_REFRESHED' && session) {
        if (projectRef) {
          document.cookie = `sb-${projectRef}-access-token=${session.access_token}; path=/; max-age=${60 * 60 * 24 * 7}; SameSite=Lax${secure}`;
          if (session.refresh_token) {
            document.cookie = `sb-${projectRef}-refresh-token=${session.refresh_token}; path=/; max-age=${60 * 60 * 24 * 30}; SameSite=Lax${secure}`;
          }
        }
        document.cookie = `admin_session=1; path=/; max-age=86400; SameSite=Lax${secure}`;
      }
      if (event === 'SIGNED_OUT') {
        if (projectRef) {
          document.cookie = `sb-${projectRef}-access-token=; path=/; max-age=0; SameSite=Lax${secure}`;
          document.cookie = `sb-${projectRef}-refresh-token=; path=/; max-age=0; SameSite=Lax${secure}`;
        }
        document.cookie = `sb-access-token=; path=/; max-age=0; SameSite=Lax${secure}`;
        document.cookie = `sb-refresh-token=; path=/; max-age=0; SameSite=Lax${secure}`;
        document.cookie = `admin_session=; path=/; max-age=0; SameSite=Lax${secure}`;
      }
    });

    return () => subscription.unsubscribe();
  }, [pathname, router]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (showUserMenu && !target.closest('.user-menu-container')) {
        setShowUserMenu(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showUserMenu]);

  // Fetch Modules Effect
  useEffect(() => {
    async function fetchModules() {
      try {
        const { data, error } = await supabase.from('store_modules').select('id, enabled');
        if (error) {
          console.warn('Error fetching modules:', error);
          return;
        }
        if (data) {
          setEnabledModules(data.filter((m: any) => m.enabled).map((m: any) => m.id));
        }
      } catch (err) {
        console.warn('Fetch modules failed:', err);
      }
    }
    fetchModules();
  }, []);

  // Screen size check for initial state
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth < 1024) {
        // Only set to false if it's currently true? 
        // Actually, let's just default to open on desktop, closed on mobile on mount only
      }
    };

    // Set initial state based on width
    if (window.innerWidth < 1024) {
      setIsSidebarOpen(false);
    }

    // Optional: Auto-close on resize to mobile? For now, leave as is.
  }, []);

  const [cacheCleared, setCacheCleared] = useState(false);

  const handleClearCache = async () => {
    try {
      localStorage.clear();
      sessionStorage.clear();
      if ('caches' in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map(k => caches.delete(k)));
      }
      setCacheCleared(true);
      setTimeout(() => {
        setCacheCleared(false);
        window.location.reload();
      }, 1200);
    } catch (err) {
      console.error('Cache clear failed:', err);
    }
  };

  const handleLogout = async () => {
    const secure = typeof window !== 'undefined' && window.location.protocol === 'https:' ? '; Secure' : '';
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
    const projectRef = supabaseUrl.split('//')[1]?.split('.')[0] || '';
    if (projectRef) {
      document.cookie = `sb-${projectRef}-access-token=; path=/; max-age=0; SameSite=Lax${secure}`;
      document.cookie = `sb-${projectRef}-refresh-token=; path=/; max-age=0; SameSite=Lax${secure}`;
    }
    document.cookie = `sb-access-token=; path=/; max-age=0; SameSite=Lax${secure}`;
    document.cookie = `sb-refresh-token=; path=/; max-age=0; SameSite=Lax${secure}`;
    document.cookie = `admin_session=; path=/; max-age=0; SameSite=Lax${secure}`;
    await supabase.auth.signOut();
    router.push('/admin/login');
  };

  // Fetch current maintenance flag
  useEffect(() => {
    if (!isAuthenticated) return;
    supabase
      .from('store_settings')
      .select('value')
      .eq('key', 'maintenance_mode')
      .maybeSingle()
      .then(({ data }) => {
        const raw = (data as { value?: unknown } | null)?.value;
        const isOn =
          raw === true ||
          raw === 'true' ||
          (typeof raw === 'string' && raw.replace(/"/g, '').toLowerCase() === 'true');
        setMaintenanceEnabled(isOn);
      });
  }, [isAuthenticated]);

  const handleToggleMaintenance = async () => {
    // Only super admins can toggle. Staff are blocked client-side and by RLS.
    if (userRole !== 'admin') {
      alert('Only an admin can toggle maintenance mode.');
      return;
    }
    const next = !maintenanceEnabled;
    setMaintenanceToggling(true);
    try {
      const { error } = await supabase.from('store_settings').upsert(
        {
          key: 'maintenance_mode',
          value: next ? 'true' : 'false',
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'key' }
      );
      if (error) throw error;
      setMaintenanceEnabled(next);
    } catch (err) {
      console.error('Failed to toggle maintenance:', err);
      alert('Failed to update maintenance mode. Please try again.');
    } finally {
      setMaintenanceToggling(false);
    }
  };

  if (isLoading) {
    return <div className="min-h-screen flex items-center justify-center bg-brand-ivory text-brand-text">Loading Admin...</div>;
  }

  const menuItems = [
    {
      title: 'Dashboard',
      icon: 'ri-dashboard-line',
      path: '/admin',
      exact: true,
      permissionKey: 'dashboard'
    },
    {
      title: 'Orders',
      icon: 'ri-shopping-bag-line',
      path: '/admin/orders',
      badge: '',
      permissionKey: 'orders'
    },
    {
      title: 'POS System',
      icon: 'ri-store-3-line',
      path: '/admin/pos',
      permissionKey: 'pos'
    },
    {
      title: 'Products',
      icon: 'ri-box-3-line',
      path: '/admin/products',
      permissionKey: 'products'
    },
    {
      title: 'Categories',
      icon: 'ri-folder-line',
      path: '/admin/categories',
      permissionKey: 'categories'
    },
    {
      title: 'Customers',
      icon: 'ri-group-line',
      path: '/admin/customers',
      permissionKey: 'customers'
    },
    {
      title: 'Reviews',
      icon: 'ri-chat-smile-2-line',
      path: '/admin/reviews',
      permissionKey: 'reviews'
    },
    {
      title: 'Inventory',
      icon: 'ri-stack-line',
      path: '/admin/inventory',
      permissionKey: 'inventory'
    },
    {
      title: 'Branches',
      icon: 'ri-store-2-line',
      path: '/admin/branches',
      permissionKey: 'branches'
    },
    {
      title: 'Analytics',
      icon: 'ri-bar-chart-line',
      path: '/admin/analytics',
      permissionKey: 'analytics'
    },
    {
      title: 'Coupons',
      icon: 'ri-coupon-2-line',
      path: '/admin/coupons',
      permissionKey: 'coupons'
    },
    {
      title: 'Support Hub',
      icon: 'ri-customer-service-2-line',
      path: '/admin/support',
      permissionKey: 'support'
    },
    {
      title: 'Customer Insights',
      icon: 'ri-user-search-line',
      path: '/admin/customer-insights',
      moduleId: 'customer-insights',
      permissionKey: 'customer_insights'
    },
    {
      title: 'Notifications',
      icon: 'ri-notification-3-line',
      path: '/admin/notifications',
      moduleId: 'notifications',
      permissionKey: 'notifications'
    },
    {
      title: 'SMS Debugger',
      icon: 'ri-message-2-line',
      path: '/admin/test-sms',
      permissionKey: 'sms_debugger'
    },
    {
      title: 'Blog',
      icon: 'ri-article-line',
      path: '/admin/blog',
      moduleId: 'blog',
      permissionKey: 'blog'
    },
    {
      title: 'Delivery Hub',
      icon: 'ri-truck-line',
      path: '/admin/delivery',
      permissionKey: 'delivery'
    },
    {
      title: 'Modules',
      icon: 'ri-puzzle-line',
      path: '/admin/modules',
      permissionKey: 'modules'
    },
    {
      title: 'Staff',
      icon: 'ri-team-line',
      path: '/admin/staff',
      permissionKey: 'staff'
    },
    {
      title: 'Roles',
      icon: 'ri-shield-user-line',
      path: '/admin/roles',
      permissionKey: 'roles'
    },
  ];

  const visibleMenuItems = menuItems.filter(item => {
    if (item.moduleId && !enabledModules.includes(item.moduleId)) return false;
    if (userRole === 'admin') return true;
    if (item.permissionKey && Object.keys(rolePermissions).length > 0) {
      return rolePermissions[item.permissionKey] === true;
    }
    return true;
  });

  // Special layout for Login Page
  if (pathname === '/admin/login') {
    return <>{children}</>;
  }

  // POS gets a full-screen layout with no sidebar or header
  const isPOS = pathname === '/admin/pos';
  const isPrint = pathname.includes('/print');
  if ((isPOS || isPrint) && isAuthenticated) {
    return (
      <AdminBranchProvider>
        <div className={isPOS ? "h-screen w-screen overflow-hidden bg-gray-100" : "bg-white min-h-screen"}>
          {children}
        </div>
      </AdminBranchProvider>
    );
  }

  return (
    <AdminBranchProvider>
    <div className="min-h-screen bg-brand-ivory text-brand-text">

      {/* Mobile Overlay */}
      {isSidebarOpen && (
        <div
          className="fixed inset-0 bg-brand-text/30 z-30 lg:hidden glass-overlay"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Sidebar - Mobile: Transform / Desktop: Width transition */}
      <aside
        className={`fixed top-0 left-0 z-40 h-screen bg-gradient-to-b from-brand-secondary via-brand-ivory to-brand-secondary border-r border-brand-supporting/25 transition-all duration-300
          w-64
          ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'} 
          ${isSidebarOpen ? 'lg:w-64' : 'lg:w-0 lg:overflow-hidden'}
          lg:translate-x-0
        `}
      >
        <div className="h-full px-4 py-6 overflow-y-auto">
          <Link href="/admin" className="flex flex-col items-start gap-2 mb-8 px-2 cursor-pointer">
            <BrandLogo href={false} height={56} className="h-14 w-auto max-w-[200px] object-contain" />
            <span className="text-xs font-semibold uppercase tracking-widest text-brand-champagne">
              Admin
            </span>
          </Link>

          <nav className="space-y-1">
            {visibleMenuItems.map((item) => {
              const isActive = item.exact ? pathname === item.path : pathname.startsWith(item.path);
              return (
                <Link
                  key={item.path}
                  href={item.path}
                  onClick={() => window.innerWidth < 1024 && setIsSidebarOpen(false)}
                  className={`flex items-center justify-between px-4 py-3 rounded-lg transition-colors cursor-pointer ${isActive
                    ? 'bg-brand-primary/25 text-brand-text font-semibold border border-brand-supporting/40'
                    : 'text-brand-text/80 hover:bg-brand-secondary'
                    }`}
                >
                  <div className="flex items-center space-x-3">
                    <i className={`${item.icon} text-xl w-5 h-5 flex items-center justify-center`}></i>
                    <span>{item.title}</span>
                  </div>
                  {item.badge && (
                    <span className="bg-brand-champagne/25 text-brand-text text-xs font-bold px-2 py-1 rounded-full">
                      {item.badge}
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>

          <div className="mt-8 pt-8 border-t border-brand-supporting/20 space-y-1">
            {/* Maintenance Mode Toggle — super admin only */}
            {userRole === 'admin' && (
              <div
                className={`flex items-center justify-between px-4 py-3 rounded-lg ${maintenanceEnabled ? 'bg-brand-primary/35' : 'bg-brand-secondary/60'
                  }`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <i
                    className={`text-lg shrink-0 ${maintenanceEnabled ? 'ri-tools-fill text-brand-accent' : 'ri-store-2-line text-brand-supporting'
                      }`}
                  ></i>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-brand-text">Maintenance</p>
                    <p className="text-xs text-brand-text/60 truncate">
                      {maintenanceEnabled ? 'Store offline' : 'Store live'}
                    </p>
                  </div>
                </div>
                <button
                  onClick={handleToggleMaintenance}
                  disabled={maintenanceToggling}
                  className={`relative flex-shrink-0 w-11 h-6 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-offset-1 ${maintenanceEnabled
                    ? 'bg-brand-accent focus:ring-brand-accent/40'
                    : 'bg-brand-supporting/50 focus:ring-brand-supporting/40'
                    } ${maintenanceToggling ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}`}
                  title={maintenanceEnabled ? 'Bring store back online' : 'Enable maintenance mode'}
                  aria-label="Toggle maintenance mode"
                >
                  <span
                    className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200 ${maintenanceEnabled ? 'translate-x-5' : 'translate-x-0'
                      }`}
                  />
                </button>
              </div>
            )}
            <Link
              href="/"
              target="_blank"
              onClick={() => window.innerWidth < 1024 && setIsSidebarOpen(false)}
              className="flex items-center space-x-3 px-4 py-3 text-brand-text/80 hover:bg-brand-secondary rounded-lg transition-colors cursor-pointer"
            >
              <i className="ri-external-link-line text-xl w-5 h-5 flex items-center justify-center"></i>
              <span>View Store</span>
            </Link>
            <button
              onClick={handleClearCache}
              disabled={cacheCleared}
              className="w-full flex items-center space-x-3 px-4 py-3 text-brand-text/80 hover:bg-brand-primary/20 hover:text-brand-text rounded-lg transition-colors cursor-pointer disabled:opacity-70"
            >
              <i className={`${cacheCleared ? 'ri-check-line text-green-500' : 'ri-delete-bin-2-line'} text-xl w-5 h-5 flex items-center justify-center`}></i>
              <span className={cacheCleared ? 'text-green-600 font-medium' : ''}>{cacheCleared ? 'Cache Cleared!' : 'Clear Cache'}</span>
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <div className={`transition-all duration-300 ml-0 ${isSidebarOpen ? 'lg:ml-64' : 'lg:ml-0'}`}>
        <header className="bg-brand-ivory/90 backdrop-blur border-b border-brand-supporting/20 sticky top-0 z-30">
          <div className="px-4 py-4 lg:px-6 flex items-center justify-between">
            <button
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className="w-10 h-10 flex items-center justify-center text-brand-text/70 hover:text-brand-text hover:bg-brand-primary/20 rounded-lg transition-colors cursor-pointer"
            >
              <i className={`${isSidebarOpen ? 'ri-menu-fold-line' : 'ri-menu-unfold-line'} text-xl`}></i>
            </button>

            <div className="flex items-center space-x-2 lg:space-x-4">
              <AdminBranchSwitcher />

              <button className="relative w-10 h-10 flex items-center justify-center text-brand-text/70 hover:text-brand-text hover:bg-brand-primary/20 rounded-lg transition-colors cursor-pointer">
                <i className="ri-notification-3-line text-xl"></i>
                <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full"></span>
              </button>

              <div className="relative user-menu-container">
                <button
                  onClick={() => setShowUserMenu(!showUserMenu)}
                  className="flex items-center space-x-2 lg:space-x-3 px-2 lg:px-3 py-2 hover:bg-brand-primary/20 rounded-lg transition-colors cursor-pointer"
                >
                  <div className="w-8 h-8 lg:w-9 lg:h-9 flex items-center justify-center bg-brand-primary/30 text-brand-text rounded-full font-semibold">
                    {user?.email?.charAt(0).toUpperCase() || 'A'}
                  </div>
                  <div className="text-left hidden md:block">
                    <p className="text-sm font-semibold text-brand-text capitalize">{userRole || 'Admin'}</p>
                    <p className="text-xs text-brand-text/60 max-w-[100px] truncate">{user?.email}</p>
                  </div>
                  <i className="ri-arrow-down-s-line text-brand-supporting"></i>
                </button>

                {showUserMenu && (
                  <div className="absolute right-0 mt-2 w-56 bg-white border border-[#ab9462]/30 rounded-xl shadow-lg overflow-hidden z-20">
                    <button
                      onClick={handleLogout}
                      className="w-full flex items-center space-x-3 px-4 py-3 hover:bg-gray-50 transition-colors border-t border-gray-200 text-left cursor-pointer"
                    >
                      <i className="ri-logout-box-line text-red-600 w-5 h-5 flex items-center justify-center"></i>
                      <span className="text-red-600">Logout</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </header>

        <main className="p-4 lg:p-6">
          {children}
        </main>
      </div>
    </div>
    </AdminBranchProvider>
  );
}
