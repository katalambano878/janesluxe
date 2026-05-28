# Asset Replacement Guide

All original project images have been removed from this directory.

## Required Assets to Add

| File | Size | Purpose |
|------|------|---------|
| `/public/favicon.ico` | 32×32px | Browser tab icon |
| `/public/apple-touch-icon.png` | 180×180px | iOS home screen |
| `/public/icon-192.png` | 192×192px | Android PWA icon |
| `/public/icon-512.png` | 512×512px | PWA splash screen |
| `/public/logo.svg` | Vector | Main brand logo |
| `/public/logo-white.svg` | Vector | Logo for dark backgrounds |
| `/public/og-image.png` | 1200×630px | Social share preview |
| `/public/twitter-image.png` | 1200×630px | Twitter card (optional) |
| `/public/hero-1.jpg` | 1920×1080px | Homepage hero slide 1 |
| `/public/hero-2.jpg` | 1920×1080px | Homepage hero slide 2 |
| `/public/hero-3.jpg` | 1920×1080px | Homepage hero slide 3 |
| `/public/hero-4.jpg` | 1200×800px | Bottom CTA section image |

## Tools

- Favicon generator: https://realfavicongenerator.net
- OG image creator: https://og-playground.vercel.app
- Image optimization: https://squoosh.app

## Logo Component

Replace the placeholder in `components/Logo.tsx` or wire it into `components/Header.tsx` and `components/Footer.tsx`.
