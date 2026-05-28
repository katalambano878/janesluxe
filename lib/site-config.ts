/**
 * Jane's Luxe — site identity (override via .env.local when needed).
 */
export const SITE_NAME =
  process.env.NEXT_PUBLIC_SITE_NAME ?? "JANE'S LUXE";

export const SITE_TAGLINE =
  process.env.NEXT_PUBLIC_SITE_DESCRIPTION ??
  "Elegant Footwear & Fashion For Modern Women";

export const SITE_URL = (
  process.env.NEXT_PUBLIC_APP_URL ?? "https://yourdomain.com"
).replace(/\/+$/, "");

export const CONTACT_EMAIL =
  process.env.NEXT_PUBLIC_CONTACT_EMAIL ?? "akeelaandison2002@gmail.com";

export const CONTACT_PHONE_DODOWA =
  process.env.NEXT_PUBLIC_CONTACT_PHONE_DODOWA ?? "0598057757";

export const CONTACT_PHONE_MADINA =
  process.env.NEXT_PUBLIC_CONTACT_PHONE_MADINA ?? "0546805376";

export const CONTACT_ADDRESS_DODOWA = "Dodowa Market, Accra";
export const CONTACT_ADDRESS_MADINA = "Madina Market";

export const SOCIAL_INSTAGRAM =
  process.env.NEXT_PUBLIC_SOCIAL_INSTAGRAM ?? "janes_luxe_";

export const SOCIAL_TIKTOK =
  process.env.NEXT_PUBLIC_SOCIAL_TIKTOK ?? "janes_luxe";

export const WHATSAPP_URL_DODOWA = `https://wa.me/233${CONTACT_PHONE_DODOWA.replace(/^0/, "")}`;
export const WHATSAPP_URL_MADINA = `https://wa.me/233${CONTACT_PHONE_MADINA.replace(/^0/, "")}`;

/** Bump version when replacing /public/logo.png so browsers pick up the new file */
export const LOGO_VERSION = "janes-luxe-v1";
export const LOGO_PATH = `/logo.png?v=${LOGO_VERSION}`;
export const LOGO_DARK_PATH = LOGO_PATH;
export const OG_IMAGE_PATH = '/og-image.png';
export const TWITTER_IMAGE_PATH = '/twitter-image.png';
export const FAVICON_DIR = '/favicon';

export const HERO_SLIDES_DESKTOP = [
  { src: "/hero-desktop-1.png", position: "50% 50%" },
  { src: "/hero-desktop-2.png", position: "50% 50%" },
  { src: "/hero-desktop-3.png", position: "50% 50%" },
] as const;

export const HERO_SLIDES_MOBILE = [
  { src: "/hero-mobile-1.png", position: "50% 50%" },
  { src: "/hero-mobile-2.png", position: "50% 50%" },
  { src: "/hero-mobile-3.png", position: "50% 50%" },
] as const;

export const CTA_HERO_IMAGE = "/hero-desktop-2.png";

/** Jane's Luxe brand palette — use via Tailwind `brand-*` or these constants */
export const BRAND_COLORS = {
  primary: '#D7A7A0',
  secondary: '#F5EADF',
  supporting: '#B89E8D',
  accent: '#C4877B',
  ivory: '#FFF9F5',
  text: '#7A5C4D',
  champagne: '#C9A36B',
} as const;
