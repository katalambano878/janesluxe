'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useCMS } from '@/context/CMSContext';
import { useBranch } from '@/context/BranchContext';
import ProductCard, {
  type ColorVariant,
  getColorHex,
} from '@/components/ProductCard';
import AnimatedSection, { AnimatedGrid } from '@/components/AnimatedSection';
import { usePageTitle } from '@/hooks/usePageTitle';
import HeroImage from '@/components/HeroImage';
import {
  SITE_NAME,
  HERO_SLIDES_DESKTOP,
  HERO_SLIDES_MOBILE,
  CTA_HERO_IMAGE,
} from '@/lib/site-config';

export default function Home() {
  usePageTitle('');
  const { getSetting, getActiveBanners } = useCMS();
  const { branch, isReady: branchReady } = useBranch();
  const [featuredProducts, setFeaturedProducts] = useState<any[]>([]);
  const [featuredCategories, setFeaturedCategories] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isMobileHero, setIsMobileHero] = useState(false);
  const heroSlidesSource = isMobileHero ? HERO_SLIDES_MOBILE : HERO_SLIDES_DESKTOP;
  const heroSlides = heroSlidesSource.map((slide, index) => ({
    ...slide,
    id: `hero-${index + 1}`,
  }));
  const [currentHeroSlide, setCurrentHeroSlide] = useState(0);

  useEffect(() => {
    // Wait for the branch selection to restore so we fetch branch-scoped stock
    if (!branchReady) return;

    async function fetchData() {
      try {
        const branchQuery = branch ? `&branch=${encodeURIComponent(branch.slug)}` : '';
        // Use storefront APIs (service-role backed on server) so admin-created
        // records always show publicly even if client-side RLS is strict.
        const [featuredProductsRes, allProductsRes, categoriesRes] = await Promise.all([
          fetch(`/api/storefront/products?featured=true&limit=12${branchQuery}`, { cache: 'no-store' }),
          fetch(`/api/storefront/products?limit=12${branchQuery}`, { cache: 'no-store' }),
          fetch('/api/storefront/categories', { cache: 'no-store' }),
        ]);

        const featuredProductsData = featuredProductsRes.ok
          ? await featuredProductsRes.json()
          : [];
        const allProductsData = allProductsRes.ok
          ? await allProductsRes.json()
          : [];
        const categoriesData = categoriesRes.ok
          ? await categoriesRes.json()
          : [];

        const seen = new Set<string>();
        const products: any[] = [];
        for (const list of [featuredProductsData || [], allProductsData || []]) {
          for (const p of list) {
            if (p?.id && !seen.has(p.id)) {
              seen.add(p.id);
              products.push(p);
            }
          }
          if (products.length >= 12) break;
        }
        setFeaturedProducts(products.slice(0, 12));

        const featuredCats = (categoriesData || []).filter(
          (c: any) => c?.metadata?.featured === true
        );
        const cats = featuredCats.length > 0
          ? featuredCats.slice(0, 6)
          : (categoriesData || []).slice(0, 6);
        setFeaturedCategories(cats);
      } catch (error) {
        console.error('Error fetching data:', error);
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, [branchReady, branch?.slug]);

  useEffect(() => {
    const media = window.matchMedia('(max-width: 767px)');
    const apply = () => setIsMobileHero(media.matches);
    apply();
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentHeroSlide((prev) => (prev + 1) % heroSlides.length);
    }, 2000);

    return () => clearInterval(interval);
  }, [heroSlides.length]);

  const heroHeadline =
    getSetting('hero_headline') || 'Elegant Footwear & Fashion For Modern Women';
  const heroSubheadline =
    getSetting('hero_subheadline') ||
    'Curated heels, slippers, platforms, handbags, and fashion pieces designed for confident women who love elegance, comfort, and style.';
  const heroPrimaryText = getSetting('hero_primary_btn_text') || 'Shop Collection';
  const heroPrimaryLink = getSetting('hero_primary_btn_link') || '/shop';
  const heroSecondaryText =
    getSetting('hero_secondary_btn_text') || 'Explore New Arrivals';
  const heroSecondaryLink = getSetting('hero_secondary_btn_link') || '/shop?sort=newest';

  const activeBanners = getActiveBanners('top');

  const renderBanners = () => {
    if (activeBanners.length === 0) return null;
    return (
      <div className="bg-brand-brown text-white py-2 overflow-hidden relative">
        <div className="flex animate-marquee whitespace-nowrap">
          {activeBanners.concat(activeBanners).map((banner, index) => (
            <span
              key={index}
              className="mx-8 text-sm font-medium tracking-wide flex items-center"
            >
              {banner.title}
            </span>
          ))}
        </div>
      </div>
    );
  };

  const popularProducts = featuredProducts.slice(0, 6);
  const latestProducts = featuredProducts;
  const defaultCategoryStyles = [
    {
      color: 'from-brand-carton to-brand-brown',
    },
    {
      color: 'from-[#D7A7A0] to-[#7A5C4D]',
    },
    {
      color: 'from-brand-brown to-brand-gold',
    },
    {
      color: 'from-[#7A5C4D]/70 to-[#7A5C4D]',
    },
  ];
  const vibeCategories = featuredCategories
    .slice(0, 6)
    .map((category, index) => {
      const style = defaultCategoryStyles[index % defaultCategoryStyles.length];
      return {
        ...category,
        color: category.metadata?.color || style.color,
        imageUrl: category.image_url || '',
      };
    });

  const getPrimaryProductImage = (product: any) => {
    const images = Array.isArray(product?.product_images)
      ? [...product.product_images]
      : [];
    images.sort(
      (a: any, b: any) => (Number(a?.position) || 0) - (Number(b?.position) || 0)
    );
    return images[0]?.url || 'https://via.placeholder.com/400x500';
  };

  return (
    <main className="flex-col items-center justify-between min-h-screen bg-brand-cream">
      {renderBanners()}

      <section className="relative w-full min-h-[92vh] sm:min-h-[83vmin] md:min-h-[93vmin] flex items-center justify-center overflow-hidden">
        <div className="absolute inset-0">
          {heroSlides.map((slide, index) => (
            <div
              key={slide.id}
              className={`absolute inset-0 transition-opacity duration-1000 ${
                index === currentHeroSlide ? 'opacity-100' : 'opacity-0'
              }`}
            >
              <HeroImage
                src={slide.src}
                alt={`${SITE_NAME} hero ${index + 1}`}
                position={slide.position}
                priority={index === 0}
              />
            </div>
          ))}
        </div>
        <div className="absolute inset-0 bg-black/10" aria-hidden="true" />
        <div className="relative z-10 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16 md:py-20 text-center">
          <span className="inline-flex items-center rounded-full bg-transparent border border-white/60 px-4 py-1.5 text-[10px] sm:text-[11px] font-bold uppercase tracking-[0.25em] text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.4)] mb-4 sm:mb-6 animate-fade-in-up">
            {SITE_NAME} · Footwear First
          </span>
          <h1 className="font-display text-2xl sm:text-3xl md:text-4xl lg:text-5xl xl:text-[3.25rem] font-semibold leading-tight text-white drop-shadow-sm max-w-3xl mx-auto">
            {heroHeadline}
          </h1>
          <p className="mt-3 sm:mt-4 text-sm sm:text-base md:text-lg text-white/90 max-w-xl mx-auto px-2 sm:px-0">
            {heroSubheadline}
          </p>
          <div className="mt-6 sm:mt-8 flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4">
            <Link
              href={heroPrimaryLink}
              className="w-full sm:w-auto inline-flex items-center justify-center rounded-full bg-brand-primary px-6 py-2.5 sm:px-9 sm:py-3 text-sm sm:text-base font-medium text-white shadow-lg hover:shadow-[0_12px_30px_rgba(200,155,123,0.3)] hover:-translate-y-1 transition-all duration-300 btn-animate"
            >
              {heroPrimaryText}
              <i className="ri-arrow-right-up-line ml-2 text-base" />
            </Link>
            <Link
              href={heroSecondaryLink}
              className="w-full sm:w-auto inline-flex items-center justify-center rounded-full border-2 border-white/60 px-6 py-2.5 sm:px-9 sm:py-3 text-sm sm:text-base font-medium text-white hover:bg-white hover:text-brand-text transition-colors"
            >
              {heroSecondaryText}
            </Link>
          </div>
          <div className="mt-5 flex items-center justify-center gap-2">
            {heroSlides.map((slide, index) => (
              <span
                key={`dot-${slide.id}`}
                className={`h-2 rounded-full transition-all ${
                  index === currentHeroSlide ? 'w-6 bg-white' : 'w-2 bg-white/60'
                }`}
              />
            ))}
          </div>
        </div>
      </section>

      <AnimatedSection className="bg-brand-ivory py-8 sm:py-10 border-b border-brand-carton/20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-6">
            <div>
              <p className="text-xs font-semibold tracking-[0.25em] text-brand-carton uppercase">
                Shop by category
              </p>
              <h2 className="font-display mt-1 text-2xl font-semibold text-brand-text">
                Shop By Categories
              </h2>
            </div>
            <Link
              href="/shop"
              className="inline-flex items-center text-sm font-medium text-brand-brown hover:text-brand-carton"
            >
              Browse Full Collection
              <i className="ri-arrow-right-line ml-1" />
            </Link>
          </div>

          {vibeCategories.length > 0 ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {vibeCategories.map((item) => (
                <Link
                  key={item.slug}
                  href={`/shop?category=${encodeURIComponent(item.slug)}`}
                  className="group relative overflow-hidden rounded-2xl border border-brand-carton/15 bg-brand-cream/40 min-h-[240px] hover:border-brand-carton hover:shadow-card transition-all duration-500 hover:-translate-y-1"
                >
                  {item.imageUrl ? (
                    <>
                      <Image
                        src={item.imageUrl}
                        alt={item.name}
                        fill
                        className="object-cover transition-transform duration-700 group-hover:scale-110"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-brand-text/70 via-brand-text/10 to-transparent group-hover:from-brand-text/80 transition-colors duration-500" />
                    </>
                  ) : (
                    <div
                      className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${item.color} opacity-70 group-hover:opacity-80 transition-opacity duration-500`}
                    />
                  )}

                <div className="relative z-10 flex h-full flex-col justify-end p-6">
                  <p className="text-xl font-display font-semibold text-white drop-shadow-sm leading-tight transform translate-y-2 group-hover:translate-y-0 transition-transform duration-500">
                    {item.name}
                  </p>
                  <div className="mt-2 w-8 h-px bg-brand-champagne opacity-0 group-hover:opacity-100 transition-all duration-500 group-hover:w-12" />
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-brand-supporting/30 bg-white/70 p-6 text-center text-brand-text/70">
              No categories published yet. Add categories in admin and set status to active.
            </div>
          )}
        </div>
      </AnimatedSection>

      <AnimatedSection className="bg-brand-cream py-10 sm:py-14">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-8">
            <div>
              <p className="text-xs font-semibold tracking-[0.25em] text-brand-carton uppercase">
                Curated edit
              </p>
              <h2 className="font-display mt-1 text-2xl sm:text-3xl font-semibold text-brand-text">
                Featured Products
              </h2>
            </div>
            <Link
              href="/shop?sort=bestsellers"
              className="inline-flex items-center text-sm font-medium text-gray-800 hover:text-brand-brown"
            >
              View Best Sellers
              <i className="ri-arrow-right-line ml-1" />
            </Link>
          </div>

          {loading ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="animate-pulse">
                  <div className="bg-gray-200 aspect-square rounded-2xl mb-3" />
                  <div className="h-4 bg-gray-200 rounded w-3/4 mb-2" />
                  <div className="h-4 bg-gray-200 rounded w-1/2" />
                </div>
              ))}
            </div>
          ) : popularProducts.length > 0 ? (
            <AnimatedGrid className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
              {popularProducts.map((product) => {
                const variants = product.product_variants || [];
                const hasVariants = variants.length > 0;
                const minVariantPrice = hasVariants
                  ? Math.min(
                      ...variants.map((v: any) => v.price || product.price)
                    )
                  : undefined;
                const totalVariantStock = hasVariants
                  ? variants.reduce(
                      (sum: number, v: any) => sum + (v.quantity || 0),
                      0
                    )
                  : 0;
                const effectiveStock = hasVariants
                  ? totalVariantStock
                  : product.quantity;

                const colorVariants: ColorVariant[] = [];
                const seenColors = new Set<string>();
                for (const v of variants) {
                  const colorName = (v as any).option2;
                  if (
                    colorName &&
                    !seenColors.has(colorName.toLowerCase().trim())
                  ) {
                    const hex = getColorHex(colorName);
                    if (hex) {
                      seenColors.add(colorName.toLowerCase().trim());
                      colorVariants.push({ name: colorName.trim(), hex });
                    }
                  }
                }

                return (
                  <ProductCard
                    key={product.id}
                    id={product.id}
                    slug={product.slug}
                    name={product.name}
                    price={product.price}
                    originalPrice={product.compare_at_price}
                    image={getPrimaryProductImage(product)}
                    rating={product.rating_avg || 5}
                    reviewCount={product.review_count || 0}
                    badge={product.featured ? 'Featured' : 'Trending'}
                    inStock={effectiveStock > 0}
                    maxStock={effectiveStock || 50}
                    moq={product.moq || 1}
                    hasVariants={hasVariants}
                    minVariantPrice={minVariantPrice}
                    colorVariants={colorVariants}
                  />
                );
              })}
            </AnimatedGrid>
          ) : (
            <div className="rounded-2xl border border-brand-supporting/30 bg-white/70 p-6 text-center text-brand-text/70">
              No active products yet. Add products in admin and set status to active.
            </div>
          )}
        </div>
      </AnimatedSection>

      <AnimatedSection className="bg-brand-secondary/35 py-10 sm:py-14">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-6">
            <div>
              <p className="text-xs font-semibold tracking-[0.25em] text-brand-brown uppercase">
                Fresh arrivals
              </p>
              <h2 className="font-display mt-1 text-2xl sm:text-3xl font-semibold text-brand-brown">
                New styles just landed
              </h2>
            </div>
            <p className="text-sm text-brand-brown/85 max-w-md">
              Discover newly selected fashion and footwear pieces inspired by modern
              feminine luxury, comfort, and confidence.
            </p>
          </div>

          <div className="relative overflow-hidden">
            <div className="flex gap-4 animate-just-landed-scroll pb-2 [--card-width:240px] hover:[animation-play-state:paused]">
              {[...(latestProducts.length ? latestProducts : popularProducts), ...(latestProducts.length ? latestProducts : popularProducts)].map(
                (product, index) => (
                  <div
                    key={`${product.id}-${index}`}
                    className="min-w-[180px] sm:min-w-[220px] max-w-[260px] w-[var(--card-width)] flex-shrink-0 rounded-xl sm:rounded-2xl bg-white shadow-sm hover:shadow-md transition-shadow"
                  >
                    <div className="relative aspect-[4/5] rounded-xl sm:rounded-2xl overflow-hidden bg-brand-carton/10">
                      <Image
                        src={getPrimaryProductImage(product)}
                        alt={product.name}
                        fill
                        className="object-cover"
                      />
                    </div>
                    <div className="p-3">
                      <p className="text-xs uppercase tracking-wide text-brand-carton mb-1">
                        New drop
                      </p>
                      <p className="text-sm font-semibold text-gray-900 line-clamp-2">
                        {product.name}
                      </p>
                      <div className="mt-2 flex items-center justify-between">
                        <span className="text-sm font-bold text-gray-900">
                          GH₵{Number(product.price || 0).toFixed(2)}
                        </span>
                        <Link
                          href={`/product/${product.slug}`}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-brand-carton text-white hover:bg-brand-brown text-sm"
                        >
                          <i className="ri-arrow-right-line" />
                        </Link>
                      </div>
                    </div>
                  </div>
                )
              )}
            </div>
          </div>
        </div>
      </AnimatedSection>

      <AnimatedSection className="bg-brand-ivory py-10 sm:py-14">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-8 sm:mb-10">
              <p className="text-xs font-semibold tracking-[0.25em] text-brand-carton uppercase">
              Why Shop With Us
            </p>
            <h2 className="font-display mt-2 text-2xl sm:text-3xl font-semibold text-brand-text">
              Curated fashion for stylish everyday women in Ghana
            </h2>
            <p className="mt-3 text-sm sm:text-base text-gray-600">
              From heels to dresses, every piece is selected to feel trendy, wearable, and confidently feminine.
            </p>
          </div>

          <div className="grid gap-4 sm:gap-6 grid-cols-1 md:grid-cols-3">
            {[
              {
                icon: 'ri-vip-diamond-line',
                title: 'Curated Fashion',
                body: 'Handpicked footwear and fashion edits that feel intentional and stylish.',
              },
              {
                icon: 'ri-heart-2-line',
                title: 'Trendy Styles',
                body: 'Fresh drops inspired by modern social fashion and everyday elegance.',
              },
              {
                icon: 'ri-customer-service-2-line',
                title: 'Support & Delivery',
                body: 'Friendly customer support and nationwide delivery across Ghana.',
              },
            ].map((item) => (
              <div
                key={item.title}
                className="relative overflow-hidden rounded-2xl border border-brand-carton/10 bg-brand-cream/40 p-6"
              >
                <div className="absolute -right-6 -top-6 h-20 w-20 rounded-full bg-brand-carton/25 blur-2xl pointer-events-none" />
                <div className="relative">
                  <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-brand-carton text-white shadow-md">
                    <i className={`${item.icon} text-xl`} />
                  </div>
                  <h3 className="text-base font-semibold text-gray-900 mb-2">
                    {item.title}
                  </h3>
                  <p className="text-sm text-gray-600 leading-relaxed">
                    {item.body}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </AnimatedSection>

      <AnimatedSection className="bg-brand-cream py-10 sm:py-14 border-t border-brand-supporting/20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-6">
            <p className="text-xs font-semibold tracking-[0.25em] text-brand-carton uppercase">
              Instagram Inspired
            </p>
            <h2 className="font-display mt-2 text-2xl sm:text-3xl font-semibold text-brand-text">
              Social looks, styled for you
            </h2>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
            {latestProducts.slice(0, 8).map((product) => (
              <Link
                key={`insta-${product.id}`}
                href={`/product/${product.slug}`}
                className="group relative aspect-square overflow-hidden rounded-2xl bg-brand-secondary/40"
              >
                <Image
                  src={getPrimaryProductImage(product)}
                  alt={product.name}
                  fill
                  className="object-cover transition-transform duration-500 group-hover:scale-105"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-brand-text/25 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
              </Link>
            ))}
          </div>
        </div>
      </AnimatedSection>

      <section className="pb-12 sm:pb-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="relative overflow-hidden rounded-2xl sm:rounded-3xl bg-gradient-to-br from-brand-secondary via-brand-supporting to-brand-primary text-white border border-brand-primary/30 shadow-card flex flex-col md:flex-row items-center md:items-stretch">
            <div className="relative w-full md:w-3/5 px-5 sm:px-8 py-8 sm:py-10 flex flex-col justify-center space-y-3 text-center md:text-left">
              <span className="inline-flex items-center text-xs font-semibold tracking-[0.25em] uppercase text-white/80">
                Step confidently with {SITE_NAME}
              </span>
              <h3 className="font-display text-xl sm:text-2xl md:text-3xl lg:text-4xl font-semibold">
                Elegant fashion made for modern women.
              </h3>
              <div className="pt-2 flex flex-wrap gap-3 justify-center md:justify-start">
                <Link
                  href="/shop"
                  className="inline-flex items-center rounded-full bg-white text-brand-text px-8 py-3 text-sm font-semibold shadow-lg hover:bg-brand-ivory transition-colors"
                >
                  Shop Now
                  <i className="ri-arrow-right-up-line ml-2" />
                </Link>
                <Link
                  href="/categories"
                  className="inline-flex items-center rounded-full border border-white/30 bg-white/10 px-6 py-3 text-sm font-semibold text-white hover:bg-white/20 transition-colors"
                >
                  Browse Collection
                </Link>
              </div>
            </div>
            <div className="relative w-full md:w-2/5 min-h-[14rem] md:min-h-0">
              <HeroImage
                src={CTA_HERO_IMAGE}
                alt={`${SITE_NAME} collection`}
                position="50% 50%"
              />
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
