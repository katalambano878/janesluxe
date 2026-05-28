import Link from 'next/link';
import PageHero from '@/components/PageHero';
import { supabaseAdmin } from '@/lib/supabase-admin';

export const dynamic = 'force-dynamic';

export default async function CategoriesPage() {
  const { data: categoriesData } = await supabaseAdmin
    .from('categories')
    .select(`
      id,
      name,
      slug,
      description,
      image_url,
      position
    `)
    .eq('status', 'active')
    .order('position', { ascending: true });

  // Palette to cycle through for visual variety since DB doesn't have colors
  const hoverOverlays = [
    'from-brand-text/30 to-transparent',
    'from-brand-primary/25 to-transparent',
    'from-brand-supporting/30 to-transparent',
  ];

  const categories = categoriesData?.map((c, i) => ({
    ...c,
    image: c.image_url || 'https://via.placeholder.com/600x400?text=Category',
    hoverOverlay: hoverOverlays[i % hoverOverlays.length],
  })) || [];

  return (
    <div className="min-h-screen bg-white">
      <PageHero
        title="Shop by Category"
        subtitle="Explore our curated collections and find exactly what you're looking for"
        image="/hero-desktop-3.png"
      />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        {categories.length > 0 ? (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {categories.map((category) => (
              <Link
                key={category.id}
                href={`/shop?category=${category.slug}`}
                className="group bg-white border border-gray-200 rounded-2xl overflow-hidden hover:shadow-2xl transition-all cursor-pointer"
              >
                <div className="relative h-48 overflow-hidden">
                  <img
                    src={category.image}
                    alt={category.name}
                    className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                  />
                  <div className={`absolute inset-0 bg-gradient-to-t ${category.hoverOverlay} opacity-0 group-hover:opacity-100 transition-opacity`} />
                </div>
                <div className="p-6">
                  <div className="mb-3">
                    <h3 className="font-display text-xl font-semibold text-brand-text">{category.name}</h3>
                    <p className="text-sm text-brand-carton font-medium">Collection</p>
                  </div>
                  <p className="text-gray-600 leading-relaxed text-sm mb-4 line-clamp-2">
                    {category.description || 'Explore our exclusive collection in this category.'}
                  </p>
                  <div className="flex items-center text-brand-primary font-medium text-sm group-hover:gap-2 transition-all">
                    <span>Browse Collection</span>
                    <i className="ri-arrow-right-line ml-2"></i>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="text-center py-20 bg-gray-50 rounded-xl">
            <i className="ri-inbox-line text-5xl text-gray-300 mb-4"></i>
            <p className="text-xl text-gray-500">No categories found.</p>
          </div>
        )}
      </div>

      <div className="bg-gradient-to-br from-brand-secondary to-brand-cream py-16 border-t border-brand-supporting/20">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-4xl font-bold text-brand-text mb-4">Can't Find What You're Looking For?</h2>
          <p className="text-xl text-brand-text/80 mb-8 leading-relaxed">
            Try our advanced search or contact our team for personalised product recommendations
          </p>
          <div className="flex flex-wrap gap-4 justify-center">
            <Link
              href="/shop"
              className="inline-flex items-center gap-2 bg-brand-ivory text-brand-text px-8 py-4 rounded-full font-medium hover:bg-white transition-colors whitespace-nowrap shadow-sm border border-brand-supporting/20"
            >
              <i className="ri-search-line"></i>
              Search All Products
            </Link>
            <Link
              href="/contact"
              className="inline-flex items-center gap-2 bg-brand-primary text-white px-8 py-4 rounded-full font-medium hover:bg-brand-accent transition-colors whitespace-nowrap shadow-sm"
            >
              <i className="ri-customer-service-line"></i>
              Contact Support
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
