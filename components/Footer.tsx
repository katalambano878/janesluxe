"use client";

import Link from 'next/link';
import { useCMS } from '@/context/CMSContext';
import BrandLogo from '@/components/BrandLogo';
import {
  SITE_NAME,
  SITE_TAGLINE,
  CONTACT_PHONE_DODOWA,
  CONTACT_PHONE_MADINA,
  CONTACT_ADDRESS_DODOWA,
  CONTACT_ADDRESS_MADINA,
  CONTACT_EMAIL,
  SOCIAL_INSTAGRAM,
  SOCIAL_TIKTOK,
  WHATSAPP_URL_DODOWA,
} from '@/lib/site-config';

export default function Footer() {
  const { getSetting } = useCMS();
  const siteName = getSetting("site_name") || SITE_NAME;
  const siteTagline = getSetting("site_tagline") || SITE_TAGLINE;
  const contactEmail = getSetting('contact_email') || CONTACT_EMAIL;
  const instagram = getSetting('social_instagram') || SOCIAL_INSTAGRAM;
  const instagramHandle = instagram.replace(/^@/, '');

  const sectionTitle = 'text-[11px] uppercase tracking-[0.08em] text-brand-supporting font-semibold mb-2';
  const linkClass = 'text-[13px] text-brand-text/75 hover:text-brand-accent transition-colors py-0.5 block';
  const socialBtn =
    'w-7 h-7 sm:w-8 sm:h-8 rounded-md border border-brand-supporting/25 bg-brand-ivory text-brand-accent hover:bg-brand-primary/30 transition-colors flex items-center justify-center';

  return (
    <footer className="bg-brand-secondary text-brand-text rounded-t-2xl mt-8 border-t border-brand-primary/25 pb-[calc(4.25rem+env(safe-area-inset-bottom,0px))] lg:pb-0">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 sm:py-5">
          {/* Top row: brand + social */}
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
            <div className="max-w-[420px]">
              <BrandLogo
                href="/"
                height={50}
                className="h-10 sm:h-11 w-auto max-w-[140px] sm:max-w-[155px] object-contain"
              />
              <p className="mt-2 text-[13px] sm:text-sm text-brand-text/70 leading-relaxed">
                {siteTagline}
              </p>
            </div>

            <div className="flex items-center gap-2 sm:pt-1">
              <a
                href={`https://www.instagram.com/${instagramHandle}`}
                target="_blank"
                rel="noopener noreferrer"
                className={socialBtn}
                aria-label="Instagram"
              >
                <i className="ri-instagram-line text-sm" />
              </a>
              <a
                href={`https://www.tiktok.com/@${SOCIAL_TIKTOK}`}
                target="_blank"
                rel="noopener noreferrer"
                className={socialBtn}
                aria-label="TikTok"
              >
                <i className="ri-tiktok-line text-sm" />
              </a>
              <a
                href={`mailto:${contactEmail}`}
                className={socialBtn}
                aria-label="Email"
              >
                <i className="ri-mail-line text-sm" />
              </a>
              <a
                href={WHATSAPP_URL_DODOWA}
                target="_blank"
                rel="noopener noreferrer"
                className={socialBtn}
                aria-label="WhatsApp"
              >
                <i className="ri-whatsapp-line text-sm" />
              </a>
              <a
                href={`tel:${CONTACT_PHONE_DODOWA}`}
                className={socialBtn}
                aria-label="Call us"
              >
                <i className="ri-phone-line text-sm" />
              </a>
            </div>
          </div>

          {/* Middle row: exact 3 columns on desktop/mobile */}
          <div className="mt-4 sm:mt-5 grid grid-cols-3 gap-4 sm:gap-8">
            <div>
              <h4 className={sectionTitle}>Shop</h4>
              <ul className="space-y-0.5">
                <li><Link href="/" className={linkClass}>Home</Link></li>
                <li><Link href="/shop" className={linkClass}>Shop</Link></li>
                <li><Link href="/categories" className={linkClass}>Categories</Link></li>
                <li><Link href="/about" className={linkClass}>About</Link></li>
              </ul>
            </div>
            <div>
              <h4 className={sectionTitle}>Help</h4>
              <ul className="space-y-0.5">
                <li><Link href="/contact" className={linkClass}>Contact</Link></li>
                <li><Link href="/order-tracking" className={linkClass}>Track Order</Link></li>
                <li><Link href="/shipping" className={linkClass}>Shipping</Link></li>
                <li><Link href="/returns" className={linkClass}>Returns & refunds</Link></li>
                <li><Link href="/faqs" className={linkClass}>FAQs</Link></li>
              </ul>
            </div>
            <div>
              <h4 className={sectionTitle}>Legal</h4>
              <ul className="space-y-0.5">
                <li><Link href="/privacy" className={linkClass}>Privacy</Link></li>
                <li><Link href="/terms" className={linkClass}>Terms</Link></li>
              </ul>
            </div>
          </div>

          {/* Contact strip */}
          <div className="mt-4 pt-3 border-t border-brand-supporting/18 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-[11px] text-brand-text/60">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
              <span className="inline-flex items-center gap-1"><i className="ri-map-pin-line text-brand-champagne" /> {CONTACT_ADDRESS_DODOWA}</span>
              <span className="inline-flex items-center gap-1"><i className="ri-phone-line text-brand-champagne" /> {CONTACT_PHONE_DODOWA}</span>
              <span className="inline-flex items-center gap-1"><i className="ri-instagram-line text-brand-champagne" /> @{instagramHandle}</span>
            </div>
            <span className="text-brand-text/45">{contactEmail}</span>
          </div>

          {/* Final row */}
          <div className="mt-2 flex items-center justify-between text-[10px] sm:text-[11px] text-brand-text/45">
            <p>&copy; {new Date().getFullYear()} {siteName}</p>
            <div className="flex items-center gap-3">
              <p className="text-brand-champagne/90">Trendy lifestyle, luxury style.</p>
              <Link
                href="/admin/login"
                aria-label="Admin login"
                title="Admin login"
                className="inline-flex items-center justify-center w-6 h-6 rounded-md text-brand-text/40 hover:text-brand-accent hover:bg-brand-primary/20 transition-colors"
              >
                <i className="ri-shield-user-line text-sm" />
              </Link>
            </div>
          </div>
      </div>
    </footer>
  );
}
