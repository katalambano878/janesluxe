# Customization Checklist

Complete these steps to make this project fully yours.

## Identity

- [ ] Replace `YOUR_PROJECT_NAME` everywhere
- [ ] Replace `YOUR_BRAND_NAME` everywhere
- [ ] Replace `yourdomain.com` everywhere
- [ ] Replace `YOUR_NAME` and `your@email.com` everywhere
- [ ] Replace `YOUR_USERNAME` / `YOUR_REPO_NAME` in `package.json` and git remote
- [ ] Replace `YOUR_HANDLE` (Instagram/social) everywhere
- [ ] Replace `YOUR_PHONE_NUMBER` / `YOUR_PHONE_E164` / `YOUR_WHATSAPP_URL`

## Assets (see `/public/ASSETS_GUIDE.md`)

- [ ] Add `/public/favicon.ico`
- [ ] Add `/public/apple-touch-icon.png`
- [ ] Add `/public/icon-192.png` and `/public/icon-512.png`
- [ ] Add `/public/logo.svg` and `/public/logo-white.svg`
- [ ] Add `/public/og-image.png` (1200×630px)
- [ ] Add `/public/hero.jpg` and restore hero `<Image />` blocks in `app/(store)/page.tsx` and `app/(store)/about/page.tsx`
- [ ] Replace `components/Logo.tsx` placeholder

## Configuration

- [ ] Copy `.env.example` → `.env.local` and fill all values
- [ ] Update `public/manifest.json` (name, colors, icons)
- [ ] Update `package.json` (name, description, author, homepage, repository)
- [ ] Create your Supabase project; set `NEXT_PUBLIC_SUPABASE_URL` and keys
- [ ] Set up Paystack / Moolre and payment env vars
- [ ] Set up Resend (`RESEND_API_KEY`, `RESEND_FROM_EMAIL`)
- [ ] Set `NEXT_PUBLIC_GA_MEASUREMENT_ID` if using analytics

## Legal

- [ ] Replace `/LICENSE` with your chosen license
- [ ] Update `app/(store)/privacy/page.tsx` and `app/(store)/terms/page.tsx`

## SEO

- [ ] Uncomment sitemap line in `public/robots.txt` with your domain
- [ ] Confirm `app/sitemap.ts` and `app/robots.ts` use `NEXT_PUBLIC_APP_URL`
- [ ] Update Open Graph metadata in `app/layout.tsx`

## Deployment

- [ ] Update `vercel.json` or host config as needed
- [ ] Configure custom domain on your host
- [ ] Set all environment variables in production

## Central config (recommended)

Edit defaults in `lib/site-config.ts` and CMS settings in the admin panel after first deploy.
