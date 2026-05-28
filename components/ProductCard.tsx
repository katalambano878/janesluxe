'use client';

import { useState } from 'react';
import Link from 'next/link';
import LazyImage from './LazyImage';
import { useCart } from '@/context/CartContext';

const COLOR_MAP: Record<string, string> = {
  black: '#000000', white: '#FFFFFF', red: '#EF4444', blue: '#3B82F6',
  navy: '#1E3A5F', green: '#22C55E', yellow: '#EAB308', orange: '#F97316',
  pink: '#EC4899', purple: '#A855F7', brown: '#92400E', beige: '#D4C5A9',
  grey: '#6B7280', gray: '#6B7280', cream: '#FFFDD0', teal: '#14B8A6',
  maroon: '#800000', coral: '#FF7F50', burgundy: '#800020', olive: '#808000',
  tan: '#D2B48C', khaki: '#C3B091', charcoal: '#36454F', ivory: '#FFFFF0',
  gold: '#FFD700', silver: '#C0C0C0', rose: '#FF007F', lavender: '#E6E6FA',
  mint: '#98FB98', peach: '#FFDAB9', wine: '#722F37', denim: '#1560BD',
  nude: '#E3BC9A', camel: '#C19A6B', sage: '#BCB88A', rust: '#B7410E',
  mustard: '#FFDB58', plum: '#8E4585', lilac: '#C8A2C8', stone: '#928E85',
  sand: '#C2B280', taupe: '#483C32', mauve: '#E0B0FF', sky: '#87CEEB',
  forest: '#228B22', cobalt: '#0047AB', emerald: '#50C878', scarlet: '#FF2400',
  aqua: '#00FFFF', turquoise: '#40E0D0', indigo: '#4B0082', crimson: '#DC143C',
  magenta: '#FF00FF', cyan: '#00FFFF', chocolate: '#7B3F00', coffee: '#6F4E37',
};

export function getColorHex(colorName: string): string | null {
  const lower = colorName.toLowerCase().trim();
  if (COLOR_MAP[lower]) return COLOR_MAP[lower];
  for (const [key, val] of Object.entries(COLOR_MAP)) {
    if (lower.includes(key)) return val;
  }
  return null;
}

export interface ColorVariant {
  name: string;
  hex: string;
}

interface ProductCardProps {
  id: string;
  slug: string;
  name: string;
  price: number;
  originalPrice?: number;
  image: string;
  rating?: number;
  reviewCount?: number;
  badge?: string;
  inStock?: boolean;
  maxStock?: number;
  moq?: number;
  hasVariants?: boolean;
  minVariantPrice?: number;
  colorVariants?: ColorVariant[];
}

export default function ProductCard({
  id,
  slug,
  name,
  price,
  originalPrice,
  image,
  badge,
  inStock = true,
  maxStock = 50,
  moq = 1,
  hasVariants = false,
  minVariantPrice,
  colorVariants = []
}: ProductCardProps) {
  const { addToCart } = useCart();
  const [activeColor, setActiveColor] = useState<string | null>(null);
  const displayPrice = hasVariants && minVariantPrice ? minVariantPrice : price;
  const discount = originalPrice ? Math.round((1 - displayPrice / originalPrice) * 100) : 0;
  const MAX_SWATCHES = 4;

  return (
    <article className="group h-full w-full overflow-hidden rounded-2xl bg-white border border-transparent hover:border-brand-supporting/20 hover:shadow-[0_12px_30px_rgba(107,82,70,0.08)] hover:-translate-y-1 transition-all duration-500">
      <Link
        href={`/product/${slug}`}
        className="relative block aspect-square overflow-hidden bg-brand-cream/30 border-b border-brand-supporting/5"
      >
        <LazyImage
          src={image}
          alt={name}
          className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.04]"
        />

        {badge && (
          <span className="absolute left-3 top-3 rounded-full bg-white/95 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-gray-800 shadow-sm">
            {badge}
          </span>
        )}

        {discount > 0 && (
          <span className="absolute right-3 top-3 rounded-full bg-brand-brown px-2.5 py-1 text-[10px] font-semibold text-white shadow-sm">
            -{discount}%
          </span>
        )}

        {!inStock && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/70 backdrop-blur-[2px]">
            <span className="rounded-full bg-gray-900 px-4 py-2 text-xs font-semibold text-white">
              Out of Stock
            </span>
          </div>
        )}
      </Link>

      <div className="p-3 sm:p-4">
        <p className="text-[10px] uppercase tracking-[0.15em] text-brand-carton font-semibold mb-1">
          {badge || 'YOUR_BRAND_NAME'}
        </p>

        <Link href={`/product/${slug}`}>
          <h3 className="text-sm font-semibold text-gray-900 line-clamp-2 leading-snug group-hover:text-brand-brown transition-colors">
            {name}
          </h3>
        </Link>

        {colorVariants.length > 0 && (
          <div className="mt-2 flex items-center gap-1.5">
            {colorVariants.slice(0, MAX_SWATCHES).map((color) => (
              <button
                key={color.name}
                title={color.name}
                onClick={(e) => {
                  e.preventDefault();
                  setActiveColor(activeColor === color.name ? null : color.name);
                }}
                className={`h-3.5 w-3.5 flex-shrink-0 rounded-full border transition-all duration-200 ${
                  activeColor === color.name
                    ? 'scale-110 ring-2 ring-brand-carton ring-offset-1'
                    : 'hover:scale-110'
                } ${color.hex === '#FFFFFF' ? 'border-gray-300' : 'border-transparent'}`}
                style={{ backgroundColor: color.hex }}
              />
            ))}
            {colorVariants.length > MAX_SWATCHES && (
              <span className="ml-0.5 text-[10px] text-gray-400">+{colorVariants.length - MAX_SWATCHES}</span>
            )}
          </div>
        )}

        <div className="mt-2 flex items-center justify-between">
          <div className="flex items-baseline gap-2">
            <span className="text-sm font-bold text-gray-900">
              {hasVariants && minVariantPrice ? `From GH₵${minVariantPrice.toFixed(2)}` : `GH₵${price.toFixed(2)}`}
            </span>
            {originalPrice && (
              <span className="text-xs text-gray-400 line-through">GH₵{originalPrice.toFixed(2)}</span>
            )}
          </div>

          {hasVariants ? (
            <Link
              href={`/product/${slug}`}
              className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-brand-carton/15 text-brand-brown hover:bg-brand-brown hover:text-white hover:shadow-md hover:scale-105 transition-all duration-300 text-sm shrink-0"
            >
              <i className="ri-arrow-right-line" />
            </Link>
          ) : (
            <button
              onClick={(e) => {
                e.preventDefault();
                if (inStock) addToCart({ id, name, price, image, quantity: moq, slug, maxStock, moq });
              }}
              disabled={!inStock}
              className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-brand-carton/15 text-brand-brown hover:bg-brand-brown hover:text-white hover:shadow-md hover:scale-105 transition-all duration-300 text-sm shrink-0 disabled:bg-gray-100 disabled:text-gray-400 disabled:hover:scale-100 disabled:hover:shadow-none disabled:cursor-not-allowed"
              aria-label={moq > 1 ? `Add ${moq} to cart` : 'Add to cart'}
            >
              <i className="ri-shopping-bag-3-line" />
            </button>
          )}
        </div>
      </div>
    </article>
  );
}
