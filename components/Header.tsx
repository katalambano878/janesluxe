'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import MiniCart from './MiniCart';
import { useCart } from '@/context/CartContext';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { useCMS } from '@/context/CMSContext';
import AnnouncementBar from './AnnouncementBar';
import BrandLogo from './BrandLogo';
import BranchPill from './BranchPill';
import { SITE_NAME } from '@/lib/site-config';

export default function Header() {
  const pathname = usePathname();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [wishlistCount, setWishlistCount] = useState(0);
  const [user, setUser] = useState<any>(null);
  const [isScrolled, setIsScrolled] = useState(false);

  const { cartCount, isCartOpen, setIsCartOpen } = useCart();
  const { getSetting } = useCMS();

  const siteName = getSetting('site_name') || SITE_NAME;

  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 10);
    window.addEventListener('scroll', handleScroll, { passive: true });

    const updateWishlistCount = () => {
      const wishlist = JSON.parse(localStorage.getItem('wishlist') || '[]');
      setWishlistCount(wishlist.length);
    };
    updateWishlistCount();
    window.addEventListener('wishlistUpdated', updateWishlistCount);

    let subscription: { unsubscribe: () => void } = { unsubscribe: () => {} };

    const checkUser = async () => {
      if (!isSupabaseConfigured) return;
      try {
        const { data: { session } } = await supabase.auth.getSession();
        setUser(session?.user ?? null);
      } catch {
        setUser(null);
      }
    };
    checkUser();

    if (isSupabaseConfigured) {
      const { data } = supabase.auth.onAuthStateChange((_event, session) => {
        setUser(session?.user ?? null);
      });
      subscription = data.subscription;
    }

    return () => {
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('wishlistUpdated', updateWishlistCount);
      subscription.unsubscribe();
    };
  }, []);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      window.location.href = `/shop?search=${encodeURIComponent(searchQuery)}`;
    }
  };

  const navLinks = [
    { label: 'Home', href: '/' },
    { label: 'Category', href: '/categories' },
    { label: 'Products', href: '/shop' },
    { label: 'About Us', href: '/about' },
    { label: 'Contact Us', href: '/contact' },
  ];

  const active = (href: string) =>
    href === '/' ? pathname === '/' : pathname.startsWith(href);

  const iconBtn =
    'w-10 h-10 flex items-center justify-center rounded-full transition-colors text-brand-text/50 hover:text-brand-accent hover:bg-brand-secondary';

  return (
    <>
      <AnnouncementBar />

      <header
        className={`sticky top-0 z-50 pwa-header transition-all duration-500 ease-out ${
          isScrolled
            ? 'bg-brand-ivory/80 backdrop-blur-xl border-b border-white/60 shadow-[0_4px_30px_rgba(107,82,70,0.06)] supports-[backdrop-filter]:bg-brand-ivory/60'
            : 'bg-brand-ivory border-b border-brand-supporting/10'
        }`}
      >
        <div className="safe-area-top" />
        <nav aria-label="Main navigation">
          <div className="max-w-7xl mx-auto px-4 sm:px-6">
            <div
              className={`flex items-center justify-between transition-all duration-500 ${
                isScrolled ? 'h-[52px]' : 'h-16 sm:h-[72px]'
              }`}
            >
              <div className="flex items-center gap-2 min-w-0">
                <button
                  className={`lg:hidden -ml-1 ${iconBtn}`}
                  onClick={() => setIsMobileMenuOpen(true)}
                  aria-label="Open menu"
                >
                  <i className="ri-menu-3-line text-[21px]" />
                </button>

                <BrandLogo
                  href="/"
                  height={isScrolled ? 32 : 40}
                  className="w-auto object-contain transition-all duration-500"
                  priority
                />

                <BranchPill />
              </div>

              <div className="hidden lg:flex items-center gap-0.5">
                {navLinks.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    className={`relative px-4 py-1.5 text-[13px] font-medium tracking-[0.01em] rounded-full transition-all duration-300 ${
                      active(link.href)
                        ? 'text-brand-text bg-brand-secondary shadow-sm'
                        : 'text-brand-text/55 hover:text-brand-text hover:bg-brand-secondary/60'
                    }`}
                  >
                    {link.label}
                  </Link>
                ))}
              </div>

              <div className="flex items-center gap-0.5 sm:gap-1">
                <button
                  onClick={() => setIsSearchOpen(true)}
                  className={iconBtn}
                  aria-label="Search"
                >
                  <i className="ri-search-2-line text-[20px]" />
                </button>

                <Link
                  href="/wishlist"
                  className={`relative hidden sm:flex ${iconBtn}`}
                  aria-label={`Wishlist, ${wishlistCount} items`}
                >
                  <i className="ri-heart-3-line text-[20px]" />
                  {wishlistCount > 0 && (
                    <span className="absolute top-1 right-1 min-w-[14px] h-[14px] bg-brand-accent text-brand-ivory text-[8px] font-bold rounded-full flex items-center justify-center px-0.5 ring-2 ring-brand-ivory">
                      {wishlistCount}
                    </span>
                  )}
                </Link>

                <div className="relative">
                  <button
                    className={`relative ${iconBtn}`}
                    onClick={() => setIsCartOpen(!isCartOpen)}
                    aria-label={`Shopping cart, ${cartCount} items`}
                    aria-expanded={isCartOpen}
                    aria-controls="mini-cart"
                  >
                    <i className="ri-shopping-bag-3-line text-[20px]" />
                    {cartCount > 0 && (
                      <span className="absolute top-1 right-1 min-w-[14px] h-[14px] bg-brand-accent text-brand-ivory text-[8px] font-bold rounded-full flex items-center justify-center px-0.5 ring-2 ring-brand-ivory">
                        {cartCount}
                      </span>
                    )}
                  </button>
                  <MiniCart isOpen={isCartOpen} onClose={() => setIsCartOpen(false)} />
                </div>

                <Link
                  href={user ? '/account' : '/auth/login'}
                  className={`hidden lg:flex ${iconBtn}`}
                  aria-label={user ? 'My account' : 'Login'}
                >
                  <i
                    className={`${
                      user ? 'ri-user-smile-line' : 'ri-user-4-line'
                    } text-[20px]`}
                  />
                </Link>
              </div>
            </div>
          </div>
        </nav>
      </header>

      {isSearchOpen && (
        <div className="fixed inset-0 z-[100]">
          <div
            className="absolute inset-0 bg-brand-text/30 backdrop-blur-sm"
            onClick={() => setIsSearchOpen(false)}
          />
          <div className="relative max-w-2xl mx-auto mt-[15vh] px-5 animate-in fade-in slide-in-from-top-6 duration-300">
            <form onSubmit={handleSearch} className="relative">
              <div className="bg-brand-ivory rounded-[20px] shadow-card overflow-hidden border border-brand-supporting/20">
                <div className="flex items-center px-5 gap-3">
                  <i className="ri-search-2-line text-brand-champagne text-xl shrink-0" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="What are you looking for?"
                    className="flex-1 py-5 text-[16px] text-brand-text bg-transparent outline-none placeholder:text-brand-text/35"
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={() => setIsSearchOpen(false)}
                    className="shrink-0 text-[11px] font-semibold text-brand-text/40 bg-brand-secondary px-2.5 py-1 rounded-md hover:bg-brand-primary/30 hover:text-brand-text transition-colors"
                  >
                    ESC
                  </button>
                </div>
                <div className="border-t border-brand-champagne/20 px-5 py-3 flex flex-wrap gap-2">
                  {['New Arrivals', 'Best Sellers', 'Dresses'].map((tag) => (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => {
                        setSearchQuery(tag);
                      }}
                      className="text-[11px] font-medium text-brand-text/50 bg-brand-secondary hover:bg-brand-primary/25 hover:text-brand-accent px-3 py-1.5 rounded-full transition-colors"
                    >
                      {tag}
                    </button>
                  ))}
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {isMobileMenuOpen && (
        <div className="fixed inset-0 z-[110] lg:hidden">
          <div
            className="absolute inset-0 bg-brand-text/25 backdrop-blur-sm"
            onClick={() => setIsMobileMenuOpen(false)}
          />

          <div className="absolute inset-y-0 left-0 w-[85%] max-w-[360px] bg-brand-ivory flex flex-col animate-in slide-in-from-left duration-400 shadow-card border-r border-brand-supporting/15">
            <div className="flex items-center justify-between px-5 h-16 shrink-0 border-b border-brand-champagne/15">
              <Link href="/" onClick={() => setIsMobileMenuOpen(false)} className="flex items-center">
                <BrandLogo href="/" height={32} className="h-8 w-auto object-contain" />
              </Link>
              <button
                onClick={() => setIsMobileMenuOpen(false)}
                className="w-9 h-9 flex items-center justify-center text-brand-text/40 hover:text-brand-text rounded-full hover:bg-brand-secondary transition-colors"
                aria-label="Close menu"
              >
                <i className="ri-close-line text-xl" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-4 pb-6">
              <div className="space-y-1 mb-6 pt-2">
                {[
                  { label: 'Home', href: '/', icon: 'ri-home-5-line' },
                  ...navLinks.map((l) => ({
                    ...l,
                    icon:
                      l.href === '/shop'
                        ? 'ri-store-2-line'
                        : l.href === '/categories'
                          ? 'ri-layout-grid-line'
                          : l.href === '/about'
                            ? 'ri-information-line'
                            : 'ri-mail-send-line',
                  })),
                ].map((link, i) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    onClick={() => setIsMobileMenuOpen(false)}
                    className={`flex items-center gap-3.5 px-4 py-3.5 rounded-2xl text-[15px] font-medium transition-all animate-in slide-in-from-left-3 fade-in duration-300 fill-mode-both ${
                      active(link.href)
                        ? 'bg-brand-accent text-brand-ivory shadow-sm'
                        : 'text-brand-text/70 hover:bg-brand-secondary hover:text-brand-text'
                    }`}
                    style={{ animationDelay: `${i * 40}ms` }}
                  >
                    <i
                      className={`${link.icon} text-lg ${
                        active(link.href) ? 'text-brand-champagne' : 'text-brand-supporting'
                      }`}
                    />
                    {link.label}
                  </Link>
                ))}
              </div>

              <div className="h-px bg-brand-champagne/25 mx-2 mb-5" />

              <p className="px-4 mb-2.5 text-[10px] font-bold tracking-[0.15em] uppercase text-brand-supporting">
                Quick Links
              </p>
              <div className="space-y-0.5 mb-6">
                {[
                  { label: 'Track Order', href: '/order-tracking', icon: 'ri-truck-line' },
                  { label: 'Wishlist', href: '/wishlist', icon: 'ri-heart-3-line', badge: wishlistCount },
                  {
                    label: user ? 'My Account' : 'Sign In',
                    href: user ? '/account' : '/auth/login',
                    icon: user ? 'ri-user-smile-line' : 'ri-user-4-line',
                  },
                  { label: 'Help Center', href: '/faqs', icon: 'ri-question-line' },
                ].map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    className="flex items-center gap-3 px-4 py-2.5 rounded-xl text-[14px] text-brand-text/55 hover:text-brand-text hover:bg-brand-secondary transition-colors"
                    onClick={() => setIsMobileMenuOpen(false)}
                  >
                    <i className={`${link.icon} text-[17px] text-brand-champagne`} />
                    <span className="flex-1">{link.label}</span>
                    {'badge' in link && link.badge! > 0 && (
                      <span className="text-[10px] font-bold text-brand-ivory bg-brand-accent min-w-5 h-5 rounded-full flex items-center justify-center px-1">
                        {link.badge}
                      </span>
                    )}
                  </Link>
                ))}
              </div>

              <button
                onClick={() => {
                  window.dispatchEvent(new CustomEvent('show-pwa-install-guide'));
                  setIsMobileMenuOpen(false);
                }}
                className="w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl bg-brand-secondary text-[14px] font-semibold text-brand-text hover:bg-brand-primary/30 transition-all border border-brand-supporting/15"
              >
                <div className="w-8 h-8 rounded-xl bg-brand-primary/40 flex items-center justify-center">
                  <i className="ri-smartphone-line text-base text-brand-champagne" />
                </div>
                Install the App
              </button>
            </div>

            <div className="shrink-0 px-5 py-4 border-t border-brand-champagne/15 bg-brand-secondary/50">
              <p className="text-[10px] text-brand-text/40 font-medium">
                &copy; {new Date().getFullYear()} {siteName}. All rights reserved.
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
