'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useRecaptcha } from '@/hooks/useRecaptcha';
import BrandLogo from '@/components/BrandLogo';

export default function AdminLoginPage() {
  const searchParams = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const { getToken, verifying } = useRecaptcha();
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const projectRef = supabaseUrl.split('//')[1]?.split('.')[0] || '';

  const clearCookie = (name: string) => {
    document.cookie = `${name}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax`;
  };

  useEffect(() => {
    if (typeof window !== 'undefined' && window.location.hostname === 'localhost') {
      // Localhost can be shared by multiple projects; clear old service workers/caches
      // so another project's offline shell cannot override this login page.
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.getRegistrations().then((regs) => {
          regs.forEach((reg) => reg.unregister().catch(() => undefined));
        }).catch(() => undefined);
      }
      if ('caches' in window) {
        caches.keys().then((keys) => {
          keys.forEach((key) => caches.delete(key).catch(() => undefined));
        }).catch(() => undefined);
      }
    }

    if (typeof document !== 'undefined') {
      // Prevent cross-project session bleed on localhost by removing generic and foreign Supabase cookies.
      const cookieNames = document.cookie
        .split(';')
        .map((c) => c.split('=')[0]?.trim())
        .filter(Boolean) as string[];

      for (const name of cookieNames) {
        if (name === 'sb-access-token' || name === 'sb-refresh-token') {
          clearCookie(name);
          continue;
        }
        if (name.startsWith('sb-') && (name.endsWith('-auth-token') || name.endsWith('-access-token') || name.endsWith('-refresh-token'))) {
          if (projectRef && !name.startsWith(`sb-${projectRef}-`)) {
            clearCookie(name);
          }
        }
      }
    }

    const errorParam = searchParams.get('error');
    if (errorParam === 'role_disabled') {
      setError('Your role has been disabled by the administrator. Contact your Super Admin for access.');
    } else if (errorParam === 'unauthorized') {
      setError('You do not have permission to access the admin panel.');
    } else if (errorParam === 'no_profile') {
      setError('No admin profile found. From project root run: node scripts/create-admin.mjs');
    } else if (errorParam === 'config') {
      setError('Server misconfiguration: SUPABASE_SERVICE_ROLE_KEY is not set in .env.local. Add it from Supabase Dashboard → Settings → API.');
    }
  }, [searchParams, projectRef]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    // reCAPTCHA verification
    const isHuman = await getToken('admin_login');
    if (!isHuman) {
      setError('Security verification failed. Please try again.');
      setIsLoading(false);
      return;
    }

    try {
      const response = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const json = await response.json().catch(() => null);

      if (!response.ok) {
        const message = String(json?.error || 'Login failed');
        throw new Error(message);
      }

      // Full-page redirect so middleware validates immediately.
      window.location.href = '/admin';
      return;
    } catch (err: any) {
      const msg = err?.message || 'Login failed';
      if (msg.toLowerCase().includes('invalid login credentials') || msg.toLowerCase().includes('invalid_credentials')) {
        setError('Invalid email or password. Use the admin account from your .env.local (ADMIN_EMAIL / ADMIN_PASSWORD) or run: node scripts/create-admin.mjs');
      } else if (msg.toLowerCase().includes('unauthorized')) {
        setError('This account is not allowed to access the admin dashboard.');
      } else {
        setError(msg);
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F5EADF] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="flex justify-center">
            <BrandLogo href="/" height={80} className="h-16 sm:h-20 w-auto max-w-[280px] object-contain" priority />
          </div>
          <h1 className="text-3xl font-bold text-[#7A5C4D] mt-6 mb-2">Admin Login</h1>
          <p className="text-[#B89E8D]">Sign in to access the admin dashboard</p>
        </div>

        <div className="bg-white rounded-2xl shadow-xl p-8 border border-[#B89E8D]/30">
          {error && (
            <div className="mb-6 p-4 bg-[#D7A7A0]/20 border border-[#D7A7A0] rounded-lg flex items-start space-x-3">
              <i className="ri-error-warning-line text-[#7A5C4D] text-xl mt-0.5"></i>
              <div>
                <p className="text-[#7A5C4D] font-semibold">Login Failed</p>
                <p className="text-[#7A5C4D] text-sm mt-1">{error}</p>
              </div>
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-5">
            <div>
              <label className="block text-sm font-semibold text-[#7A5C4D] mb-2">
                Email Address
              </label>
              <div className="relative">
                <i className="ri-mail-line absolute left-4 top-1/2 -translate-y-1/2 text-[#B89E8D] text-lg"></i>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-12 pr-4 py-3 border-2 border-[#F5EADF] rounded-lg focus:ring-2 focus:ring-[#D7A7A0] focus:border-[#D7A7A0]"
                  placeholder="admin@yourdomain.com"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-[#7A5C4D] mb-2">
                Password
              </label>
              <div className="relative">
                <i className="ri-lock-line absolute left-4 top-1/2 -translate-y-1/2 text-[#B89E8D] text-lg"></i>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-12 pr-12 py-3 border-2 border-[#F5EADF] rounded-lg focus:ring-2 focus:ring-[#D7A7A0] focus:border-[#D7A7A0]"
                  placeholder="Enter your password"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-[#B89E8D] hover:text-[#7A5C4D] w-5 h-5 flex items-center justify-center"
                >
                  <i className={`${showPassword ? 'ri-eye-off-line' : 'ri-eye-line'} text-lg`}></i>
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading || verifying}
              className="w-full bg-[#7A5C4D] hover:bg-[#B89E8D] text-white py-3 rounded-lg font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
            >
              {isLoading || verifying ? (
                <span className="flex items-center justify-center space-x-2">
                  <i className="ri-loader-4-line animate-spin"></i>
                  <span>{verifying ? 'Verifying...' : 'Signing in...'}</span>
                </span>
              ) : (
                'Sign In'
              )}
            </button>
          </form>

          {/* Admin access is restricted to users with admin/staff role */}
        </div>

        <div className="mt-6 text-center">
          <Link href="/" className="text-sm text-[#B89E8D] hover:text-[#7A5C4D] transition-colors whitespace-nowrap">
            <i className="ri-arrow-left-line mr-2"></i>
            Back to Store
          </Link>
        </div>
      </div>
    </div>
  );
}
