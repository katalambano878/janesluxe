'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { usePageTitle } from '@/hooks/usePageTitle';
import ProductCard, { type ColorVariant, getColorHex } from '@/components/ProductCard';
import PageHero from '@/components/PageHero';
import { useBranch } from '@/context/BranchContext';

function buildCategorySlugsParam(selectedSlug: string, categories: { id: string; slug: string; parent_id?: string | null }[]): string {
  if (selectedSlug === 'all') return 'all';
  const categoryObj = categories.find((c) => c.slug === selectedSlug);
  if (!categoryObj) return selectedSlug;
  const slugs = [selectedSlug];
  categories
    .filter((c) => c.parent_id === categoryObj.id)
    .forEach((c) => slugs.push(c.slug));
  return slugs.join(',');
}

function formatShopProducts(data: any[]) {
  return data.map((p: any) => {
    const variants = p.product_variants || [];
    const hasVariants = variants.length > 0;
    const minVariantPrice = hasVariants
      ? Math.min(...variants.map((v: any) => v.price || p.price))
      : undefined;
    const totalVariantStock = hasVariants
      ? variants.reduce((sum: number, v: any) => sum + (v.quantity || 0), 0)
      : 0;
    const effectiveStock = hasVariants ? totalVariantStock : p.quantity;
    const colorVariants: ColorVariant[] = [];
    const seenColors = new Set<string>();
    for (const v of variants) {
      const colorName = v.option2;
      if (colorName && !seenColors.has(colorName.toLowerCase().trim())) {
        const hex = getColorHex(colorName);
        if (hex) {
          seenColors.add(colorName.toLowerCase().trim());
          colorVariants.push({ name: colorName.trim(), hex });
        }
      }
    }
    const images = Array.isArray(p.product_images)
      ? [...p.product_images].sort(
          (a: any, b: any) => (Number(a.position) ?? 0) - (Number(b.position) ?? 0)
        )
      : [];
    return {
      id: p.id,
      slug: p.slug,
      name: p.name,
      price: p.price,
      originalPrice: p.compare_at_price,
      image: images[0]?.url || 'https://via.placeholder.com/800x800?text=No+Image',
      rating: p.rating_avg || 0,
      reviewCount: 0,
      badge: p.compare_at_price > p.price ? 'Sale' : undefined,
      inStock: effectiveStock > 0,
      maxStock: effectiveStock || 50,
      moq: p.moq || 1,
      category: p.categories?.name,
      hasVariants,
      minVariantPrice,
      colorVariants,
    };
  });
}

function ShopContent() {
  usePageTitle('Shop Products');
  const searchParams = useSearchParams();
  const { branch, isReady: branchReady } = useBranch();

  // State
  const [products, setProducts] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([{ id: 'all', name: 'All Products', count: 0 }]);
  const [loading, setLoading] = useState(true);
  const [totalProducts, setTotalProducts] = useState(0);

  // Filters
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [priceRange, setPriceRange] = useState([0, 5000]);
  const [selectedRating, setSelectedRating] = useState(0);
  const [sortBy, setSortBy] = useState('popular');
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [page, setPage] = useState(1);
  const productsPerPage = 9;

  // Initialize from URL params
  useEffect(() => {
    const category = searchParams.get('category');
    const sort = searchParams.get('sort');
    const search = searchParams.get('search');

    if (category) setSelectedCategory(category);
    if (sort) setSortBy(sort);
  }, [searchParams]);

  // Fetch categories (service-role backed API — bypasses RLS)
  useEffect(() => {
    async function fetchCategories() {
      try {
        const res = await fetch('/api/storefront/categories', { cache: 'no-store' });
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data)) {
            setCategories([{ id: 'all', name: 'All Products', slug: 'all' }, ...data]);
          }
        }
      } catch (err) {
        console.error('Error fetching categories:', err);
      }
    }
    fetchCategories();
  }, []);

  // Fetch products via storefront shop API (includes images + category filter)
  useEffect(() => {
    // Wait for the branch selection to restore so we fetch branch-scoped stock
    if (!branchReady) return;

    async function fetchProducts() {
      setLoading(true);
      try {
        const search = searchParams.get('search') || '';
        const categorySlugs = buildCategorySlugsParam(
          selectedCategory,
          categories.filter((c) => c.id !== 'all')
        );

        const params = new URLSearchParams({
          categorySlugs,
          priceMin: String(priceRange[0]),
          priceMax: String(priceRange[1]),
          rating: String(selectedRating),
          sortBy,
          page: String(page),
          limit: String(productsPerPage),
        });
        if (search) params.set('search', search);
        if (branch) params.set('branch', branch.slug);

        const res = await fetch(`/api/storefront/shop?${params.toString()}`, {
          cache: 'no-store',
        });
        const json = await res.json();

        if (!res.ok) {
          throw new Error(json.error || 'Failed to load products');
        }

        setProducts(formatShopProducts(json.data || []));
        setTotalProducts(json.count ?? 0);
      } catch (err) {
        console.error('Error fetching products:', err);
        setProducts([]);
        setTotalProducts(0);
      } finally {
        setLoading(false);
      }
    }

    fetchProducts();
  }, [selectedCategory, priceRange, selectedRating, sortBy, page, searchParams, categories, branchReady, branch?.slug]);

  const totalPages = Math.ceil(totalProducts / productsPerPage);

  return (
    <main className="min-h-screen bg-gradient-to-b from-brand-cream/40 via-white to-white">
      <PageHero
        title="Browse Our Collections"
        subtitle="Explore carefully curated products sourced from trusted global suppliers — quality you can count on, delivered to your doorstep."
        image="/hero-desktop-1.png"
      />

      {/* Mobile Filter Toggle */}
      <div className="lg:hidden bg-white/95 backdrop-blur-md border-b border-brand-carton/20 py-4 px-4 sticky top-[72px] z-20">
        <div className="flex justify-between items-center">
          <button
            onClick={() => setIsFilterOpen(!isFilterOpen)}
            className="inline-flex items-center space-x-2 text-brand-brown font-semibold"
          >
            <i className="ri-filter-3-line text-xl"></i>
            <span>Filters & Sort</span>
          </button>
          <span className="text-sm text-brand-brown">{totalProducts} Products</span>
        </div>
      </div>

      <section className="py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="flex gap-8">
            <aside className={`${isFilterOpen ? 'fixed inset-0 z-50 bg-white overflow-y-auto' : 'hidden'} lg:block lg:w-72 lg:flex-shrink-0`}>
              <div className="lg:sticky lg:top-24">
                <div className="bg-white lg:bg-brand-cream/55 lg:border lg:border-brand-carton/20 lg:rounded-3xl p-6">
                  <div className="flex items-center justify-between mb-6 lg:hidden">
                    <h2 className="text-xl font-bold text-brand-brown">Filters</h2>
                    <button
                      onClick={() => setIsFilterOpen(false)}
                      className="w-10 h-10 flex items-center justify-center text-brand-brown"
                    >
                      <i className="ri-close-line text-2xl"></i>
                    </button>
                  </div>

                  <div className="space-y-8">
                    {/* Categories */}
                    <div>
                      <h3 className="font-semibold text-brand-brown mb-4">Categories</h3>
                      <div className="space-y-1">
                        <button
                          onClick={() => {
                            setSelectedCategory('all');
                            setPage(1);
                            setIsFilterOpen(false);
                          }}
                          className={`w-full text-left px-4 py-2 rounded-lg transition-colors ${selectedCategory === 'all'
                            ? 'bg-brand-cream text-brand-brown font-medium'
                            : 'text-gray-700 hover:bg-gray-100'
                            }`}
                        >
                          All Products
                        </button>

                        {/* Parent Categories */}
                        {categories.filter(c => !c.parent_id && c.id !== 'all').map(parent => {
                          const subcategories = categories.filter(c => c.parent_id === parent.id);
                          const isSelected = selectedCategory === parent.slug;
                          const isChildSelected = subcategories.some(sub => sub.slug === selectedCategory);
                          const isOpen = isSelected || isChildSelected; // Auto-expand if selected

                          return (
                            <div key={parent.id} className="space-y-1">
                              <button
                                onClick={() => {
                                  setSelectedCategory(parent.slug);
                                  setPage(1);
                                }}
                                className={`w-full text-left px-4 py-2 rounded-lg transition-colors flex justify-between items-center ${isSelected
                                  ? 'bg-brand-cream text-brand-brown font-medium'
                                  : 'text-gray-700 hover:bg-gray-100'
                                  }`}
                              >
                                <span>{parent.name}</span>
                              </button>

                              {/* Subcategories */}
                              {subcategories.length > 0 && (
                                <div className="ml-4 border-l-2 border-gray-100 pl-2 space-y-1">
                                  {subcategories.map(child => (
                                    <button
                                      key={child.id}
                                      onClick={() => {
                                        setSelectedCategory(child.slug);
                                        setPage(1);
                                        setIsFilterOpen(false);
                                      }}
                                      className={`w-full text-left px-4 py-1.5 rounded-lg text-sm transition-colors ${selectedCategory === child.slug
                                        ? 'text-brand-brown font-medium bg-brand-cream'
                                        : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                                        }`}
                                    >
                                      {child.name}
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Price Range */}
                    <div className="border-t border-brand-carton/20 pt-8">
                      <h3 className="font-semibold text-brand-brown mb-4">Max Price: GH₵{priceRange[1]}</h3>
                      <div className="space-y-4">
                        <input
                          type="range"
                          min="0"
                          max="5000"
                          step="50"
                          value={priceRange[1]}
                          onChange={(e) => {
                            setPriceRange([0, parseInt(e.target.value)]);
                            setPage(1);
                          }}
                          className="w-full h-2 bg-brand-cream rounded-lg appearance-none cursor-pointer accent-brand-brown"
                        />
                        <div className="flex items-center justify-between text-sm text-brand-brown/80">
                          <span>GH₵0</span>
                          <span>GH₵5000+</span>
                        </div>
                      </div>
                    </div>

                    {/* Rating */}
                    <div className="border-t border-brand-carton/20 pt-8">
                      <h3 className="font-semibold text-brand-brown mb-4">Rating</h3>
                      <div className="space-y-2">
                        {[4, 3, 2, 1].map(rating => (
                          <button
                            key={rating}
                            onClick={() => {
                              setSelectedRating(rating === selectedRating ? 0 : rating);
                              setPage(1);
                            }}
                            className={`w-full text-left px-4 py-2 rounded-lg transition-colors ${selectedRating === rating
                              ? 'bg-brand-cream text-brand-brown'
                              : 'text-gray-700 hover:bg-gray-100'
                              }`}
                          >
                            <div className="flex items-center space-x-2">
                              {[1, 2, 3, 4, 5].map(star => (
                                <i
                                  key={star}
                                  className={`${star <= rating ? 'ri-star-fill text-brand-gold' : 'ri-star-line text-gray-300'} text-sm`}
                                ></i>
                              ))}
                              <span className="text-sm">& Up</span>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>

                    <button
                      onClick={() => {
                        setIsFilterOpen(false);
                      }}
                      className="w-full bg-brand-carton hover:bg-brand-brown text-white py-3 rounded-xl font-semibold transition-colors whitespace-nowrap"
                    >
                      Show Results
                    </button>
                  </div>
                </div>
              </div>
            </aside>

            <div className="flex-1">
              <div className="mb-8 rounded-2xl border border-brand-carton/20 bg-white p-4 sm:p-5 shadow-sm">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                  <div>
                    <p className="text-brand-brown text-xs font-semibold tracking-[0.2em] uppercase">Collection View</p>
                    <p className="mt-1 text-gray-700">
                      Showing <span className="font-bold text-brand-brown">{products.length}</span> of <span className="font-bold text-brand-brown">{totalProducts}</span> products
                    </p>
                  </div>

                  <div className="flex items-center space-x-3">
                    <label className="text-sm text-gray-600 whitespace-nowrap">Sort by:</label>
                    <select
                      value={sortBy}
                      onChange={(e) => {
                        setSortBy(e.target.value);
                        setPage(1);
                      }}
                      className="px-4 py-2 pr-8 border border-brand-carton/30 rounded-xl focus:ring-2 focus:ring-brand-carton focus:border-brand-carton text-sm bg-white cursor-pointer"
                    >
                      <option value="popular">Most Popular</option>
                      <option value="new">Newest</option>
                      <option value="price-low">Price: Low to High</option>
                      <option value="price-high">Price: High to Low</option>
                      <option value="rating">Highest Rated</option>
                    </select>
                  </div>
                </div>
              </div>

              {loading ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                  {[...Array(6)].map((_, i) => (
                    <div key={i} className="rounded-2xl border border-brand-carton/20 bg-white p-3">
                      <div className="bg-brand-cream rounded-xl aspect-[4/5] animate-pulse"></div>
                      <div className="mt-3 h-4 w-3/4 rounded bg-brand-carton/20 animate-pulse"></div>
                      <div className="mt-2 h-4 w-1/2 rounded bg-brand-carton/20 animate-pulse"></div>
                    </div>
                  ))}
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6" data-product-shop>
                    {products.map(product => (
                      <ProductCard key={product.id} {...product} />
                    ))}
                  </div>

                  {products.length === 0 && (
                    <div className="text-center py-20 px-6 mt-4 rounded-3xl border border-brand-carton/20 bg-brand-cream/40">
                      <div className="w-20 h-20 flex items-center justify-center mx-auto mb-6 bg-white rounded-full border border-brand-carton/20 shadow-sm">
                        <i className="ri-inbox-line text-4xl text-brand-carton"></i>
                      </div>
                      <h3 className="text-2xl font-bold text-brand-brown mb-2">No Products Found</h3>
                      <p className="text-brand-brown/80 mb-8">Try adjusting your filters to discover more fashion pieces</p>
                      <button
                        onClick={() => {
                          setSelectedCategory('all');
                          setPriceRange([0, 5000]);
                          setSelectedRating(0);
                          setPage(1);
                        }}
                        className="inline-flex items-center bg-brand-carton hover:bg-brand-brown text-white px-6 py-3 rounded-xl font-semibold transition-colors whitespace-nowrap"
                      >
                        Clear All Filters
                      </button>
                    </div>
                  )}
                </>
              )}

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="mt-16 flex justify-center">
                  <div className="inline-flex items-center space-x-2 rounded-2xl border border-brand-carton/20 bg-white px-3 py-2 shadow-sm">
                    <button
                      onClick={() => setPage(p => Math.max(1, p - 1))}
                      disabled={page === 1}
                      className="w-10 h-10 flex items-center justify-center border border-brand-carton/30 rounded-lg hover:bg-brand-cream transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <i className="ri-arrow-left-s-line text-xl text-brand-brown"></i>
                    </button>

                    <span className="px-4 font-medium text-brand-brown">
                      Page {page} of {totalPages}
                    </span>

                    <button
                      onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                      disabled={page === totalPages}
                      className="w-10 h-10 flex items-center justify-center border border-brand-carton/30 rounded-lg hover:bg-brand-cream transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <i className="ri-arrow-right-s-line text-xl text-brand-brown"></i>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

export default function ShopPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><div className="w-12 h-12 border-4 border-gray-900 border-t-transparent rounded-full animate-spin"></div></div>}>
      <ShopContent />
    </Suspense>
  );
}