'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useCMS } from '@/context/CMSContext';
import { usePageTitle } from '@/hooks/usePageTitle';
import AnimatedSection, { AnimatedGrid } from '@/components/AnimatedSection';
import {
  CONTACT_PHONE_DODOWA,
  CONTACT_PHONE_MADINA,
  SOCIAL_INSTAGRAM,
  SOCIAL_TIKTOK,
} from '@/lib/site-config';

type ValueCard = {
  icon: string;
  title: string;
  body: string;
};

type JourneyStep = {
  label: string;
  title: string;
  body: string;
};

export default function AboutPage() {
  usePageTitle('Our Story');
  const { getSetting } = useCMS();

  const siteName = getSetting('site_name') || 'YOUR_BRAND_NAME';

  const valueCards: ValueCard[] = [
    {
      icon: 'ri-women-line',
      title: 'Confidence in every step',
      body: 'Every piece is chosen to help women feel stylish, confident, and comfortable every day.',
    },
    {
      icon: 'ri-star-smile-line',
      title: 'Trendy but wearable',
      body: 'From heels and slippers to sneakers, sandals, and dresses, we focus on styles women actually love to wear.',
    },
    {
      icon: 'ri-shield-check-line',
      title: 'Affordable quality',
      body: 'Fashionable, classy, and quality selections at prices that remain accessible for modern women.',
    },
  ];

  const journeySteps: JourneyStep[] = [
    {
      label: '01',
      title: 'Footwear-first collections',
      body: 'Jane’s Luxe is built around ladies footwear, with curated collections for work, outings, events, and everyday comfort.',
    },
    {
      label: '02',
      title: 'Fashion pieces that complete your look',
      body: 'Beyond footwear, we stock trendy dresses and fashion pieces that pair beautifully with your personal style.',
    },
    {
      label: '03',
      title: 'Serving women across Accra',
      body: 'With branches in Dodowa Market and Madina Market, we bring elegant and wearable style closer to you.',
    },
  ];

  const instagramHandle = SOCIAL_INSTAGRAM.startsWith('@') ? SOCIAL_INSTAGRAM : `@${SOCIAL_INSTAGRAM}`;
  const tiktokHandle = SOCIAL_TIKTOK.startsWith('@') ? SOCIAL_TIKTOK : `@${SOCIAL_TIKTOK}`;

  return (
    <div className="min-h-screen bg-white text-gray-900">
      <section className="border-b border-brand-carton/15 bg-[#EDE6D8]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14 sm:py-16 lg:py-20">
          <div className="grid gap-10 lg:grid-cols-12 lg:items-center">
            <AnimatedSection className="lg:col-span-6" animation="fade-up">
              <p className="text-xs font-semibold tracking-[0.25em] uppercase text-brand-brown">
                About {siteName}
              </p>
              <h1 className="mt-3 text-3xl sm:text-4xl lg:text-5xl font-extrabold leading-tight text-gray-900">
                Elegant fashion made for modern women.
              </h1>
              <p className="mt-5 text-base sm:text-lg text-gray-700 max-w-xl">
                At Jane&apos;s Luxe, we believe every woman deserves to step out with confidence, elegance, and style. We are a Ghanaian fashion brand focused on ladies footwear and trendy fashion pieces curated for women who love looking classy without compromising comfort.
              </p>

              <div className="mt-7 flex flex-wrap gap-3">
                <span className="inline-flex items-center rounded-full bg-white px-4 py-2 text-sm font-medium text-brand-brown border border-brand-carton/20">
                  <i className="ri-map-pin-line mr-2" /> Dodowa Market, Accra
                </span>
                <span className="inline-flex items-center rounded-full bg-white px-4 py-2 text-sm font-medium text-brand-brown border border-brand-carton/20">
                  <i className="ri-map-pin-line mr-2" /> Madina Market, Accra
                </span>
              </div>

              <div className="mt-8 flex flex-wrap gap-3">
                <Link
                  href="/shop"
                  className="inline-flex items-center rounded-full bg-brand-brown px-7 py-3 text-sm font-semibold text-white hover:bg-[#3D2A00] transition-colors"
                >
                  Browse collections
                  <i className="ri-arrow-right-up-line ml-2" />
                </Link>
                <Link
                  href="/contact"
                  className="inline-flex items-center rounded-full border border-brand-carton/35 bg-white px-7 py-3 text-sm font-semibold text-brand-brown hover:bg-brand-cream transition-colors"
                >
                  Contact us
                </Link>
              </div>
            </AnimatedSection>

            <AnimatedSection className="lg:col-span-6" animation="fade-left">
              <div className="relative overflow-hidden rounded-2xl aspect-[4/5] border border-brand-carton/15">
                <Image
                  src="/hero-desktop-1.png"
                  alt="Jane's Luxe fashion lookbook"
                  fill
                  sizes="(max-width: 1024px) 100vw, 40vw"
                  className="object-cover"
                />
              </div>
            </AnimatedSection>
          </div>
        </div>
      </section>

      <AnimatedSection className="py-14 sm:py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-2xl">
            <p className="text-xs font-semibold tracking-[0.25em] uppercase text-brand-carton">
              Our core values
            </p>
            <h2 className="mt-2 text-2xl sm:text-3xl font-extrabold text-gray-900">
              Built around confidence, femininity, and everyday elegance.
            </h2>
          </div>

          <AnimatedGrid className="mt-8 grid gap-4 md:grid-cols-3" staggerDelay={120}>
            {valueCards.map((item) => (
              <div
                key={item.title}
                className="rounded-2xl border border-brand-carton/15 bg-white p-6 shadow-sm"
              >
                <div className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-xl bg-brand-carton text-white">
                  <i className={`${item.icon} text-xl`} />
                </div>
                <h3 className="text-lg font-semibold text-gray-900">{item.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-gray-600">{item.body}</p>
              </div>
            ))}
          </AnimatedGrid>
        </div>
      </AnimatedSection>

      <section className="bg-white py-14 sm:py-16 border-b border-brand-carton/10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid gap-6 md:grid-cols-2">
            <div className="rounded-2xl border border-brand-carton/15 bg-brand-cream/40 p-6 sm:p-8">
              <div className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-xl bg-brand-brown text-white">
                <i className="ri-lightbulb-line text-xl" />
              </div>
              <p className="text-xs font-semibold tracking-[0.25em] uppercase text-brand-carton mb-2">Our Stores</p>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                Dodowa branch
              </h3>
              <p className="text-sm leading-relaxed text-gray-600">
                Footwear and dresses for women who want stylish and practical looks for different occasions.
              </p>
            </div>
            <div className="rounded-2xl border border-brand-carton/15 bg-brand-cream/40 p-6 sm:p-8">
              <div className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-xl bg-brand-brown text-white">
                <i className="ri-compass-3-line text-xl" />
              </div>
              <p className="text-xs font-semibold tracking-[0.25em] uppercase text-brand-brown mb-2">Our Stores</p>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                Madina branch
              </h3>
              <p className="text-sm leading-relaxed text-gray-600">
                Primarily dedicated to ladies footwear collections, with classy options for everyday and event styling.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="bg-brand-cream/45 py-14 sm:py-16 border-y border-brand-carton/10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-2xl">
            <p className="text-xs font-semibold tracking-[0.25em] uppercase text-brand-brown">
              What you can expect
            </p>
            <h2 className="mt-2 text-2xl sm:text-3xl font-extrabold text-gray-900">
              Style support for every occasion.
            </h2>
          </div>

          <div className="mt-8 grid gap-4 lg:grid-cols-3">
            {journeySteps.map((step) => (
              <div
                key={step.label}
                className="rounded-2xl border border-brand-carton/15 bg-white p-6"
              >
                <span className="text-xs font-bold tracking-[0.22em] uppercase text-brand-carton">
                  Step {step.label}
                </span>
                <h3 className="mt-3 text-lg font-semibold text-gray-900">{step.title}</h3>
                <p className="mt-2 text-sm text-gray-600 leading-relaxed">{step.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="pb-12 sm:pb-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="relative overflow-hidden rounded-2xl sm:rounded-3xl bg-gradient-to-br from-[#D7A7A0] via-[#8A7750] to-[#7A5C4D] text-white border border-[#D7A7A0]/30 shadow-[0_16px_45px_rgba(171,148,98,0.2)] flex flex-col md:flex-row items-center md:items-stretch">
            <div className="relative w-full md:w-3/5 px-5 sm:px-8 py-8 sm:py-10 flex flex-col justify-center space-y-3 text-center md:text-left">
              <span className="inline-flex items-center text-xs font-semibold tracking-[0.25em] uppercase text-white/80">
                Connect with Jane&apos;s Luxe
              </span>
              <h3 className="text-xl sm:text-2xl md:text-3xl lg:text-4xl font-extrabold">
                We are more than a fashion store.
              </h3>
              <p className="text-sm sm:text-base text-white/75 max-w-md mx-auto md:mx-0">
                We are a brand built around confidence, femininity, comfort, and everyday elegance.
              </p>
              <div className="text-sm text-white/90 space-y-1">
                <p>Dodowa: {CONTACT_PHONE_DODOWA}</p>
                <p>Madina: {CONTACT_PHONE_MADINA}</p>
                <p>Instagram: {instagramHandle}</p>
                <p>TikTok: {tiktokHandle}</p>
              </div>
              <div className="pt-2 flex flex-wrap gap-3 justify-center md:justify-start">
                <Link
                  href="/shop"
                  className="inline-flex items-center rounded-full bg-white text-[#7A5C4D] px-8 py-3 text-sm font-semibold shadow-lg hover:bg-[#F5EADF] transition-colors"
                >
                  Shop now
                  <i className="ri-arrow-right-up-line ml-2" />
                </Link>
                <Link
                  href="/contact"
                  className="inline-flex items-center rounded-full border border-white/30 bg-white/10 px-6 py-3 text-sm font-semibold text-white hover:bg-white/20 transition-colors"
                >
                  Visit or call us
                </Link>
              </div>
            </div>
            <div
              className="relative w-full md:w-2/5 min-h-[14rem] md:min-h-0 md:rounded-r-2xl sm:md:rounded-r-3xl rounded-b-2xl sm:rounded-b-3xl md:rounded-bl-none overflow-hidden bg-cover bg-center"
              style={{ backgroundImage: "url('/hero-desktop-1.png')" }}
              role="img"
              aria-label="Jane's Luxe featured collection"
            >
              <div className="absolute inset-0 bg-brand-text/10" />
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
