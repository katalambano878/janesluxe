/**
 * Generates favicon set + OG/social images from public/logo.png
 * Run: node scripts/generate-seo-assets.mjs
 */
import { mkdir, copyFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const logoPath = join(root, 'public', 'logo.png');
const faviconDir = join(root, 'public', 'favicon');
const require = createRequire(import.meta.url);

async function main() {
  let sharp;
  try {
    sharp = require('sharp');
  } catch {
    console.error('Install sharp first: npm install sharp --save-dev');
    process.exit(1);
  }

  if (!existsSync(logoPath)) {
    console.error('Missing public/logo.png');
    process.exit(1);
  }

  await mkdir(faviconDir, { recursive: true });

  const sizes = [
    { name: 'favicon-16x16.png', size: 16 },
    { name: 'favicon-32x32.png', size: 32 },
    { name: 'favicon-48x48.png', size: 48 },
    { name: 'android-chrome-192x192.png', size: 192 },
    { name: 'android-chrome-512x512.png', size: 512 },
    { name: 'apple-touch-icon.png', size: 180 },
  ];

  const logo = sharp(logoPath).ensureAlpha();
  const meta = await logo.metadata();

  for (const { name, size } of sizes) {
    const out = join(faviconDir, name);
    await logo
      .clone()
      .resize(size, size, {
        fit: 'contain',
        background: { r: 247, g: 239, b: 232, alpha: 1 },
      })
      .png({ compressionLevel: 9, palette: true })
      .toFile(out);
    console.log('✓', name);
  }

  // favicon.ico (multi-size) — use 32px PNG as base; sharp can output ico via png
  await sharp(join(faviconDir, 'favicon-32x32.png'))
    .resize(32, 32)
    .toFile(join(faviconDir, 'favicon.ico'));

  await copyFile(join(faviconDir, 'favicon.ico'), join(root, 'public', 'favicon.ico'));
  await copyFile(join(faviconDir, 'favicon-32x32.png'), join(root, 'public', 'favicon.png'));
  await copyFile(join(faviconDir, 'apple-touch-icon.png'), join(root, 'public', 'apple-touch-icon.png'));

  // App directory icons (Next.js file convention)
  const appDir = join(root, 'app');
  await copyFile(join(faviconDir, 'favicon.ico'), join(appDir, 'favicon.ico'));
  await copyFile(join(faviconDir, 'favicon-32x32.png'), join(appDir, 'icon.png'));
  await copyFile(join(faviconDir, 'apple-touch-icon.png'), join(appDir, 'apple-icon.png'));

  // OG image 1200x630
  const ogW = 1200;
  const ogH = 630;
  const logoOnOg = Math.min(320, Math.round(ogH * 0.55));
  const logoBuf = await sharp(logoPath)
    .resize(logoOnOg, logoOnOg, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();

  const ogSvg = `
<svg width="${ogW}" height="${ogH}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#F7EFE8"/>
      <stop offset="50%" style="stop-color:#EAD8CB"/>
      <stop offset="100%" style="stop-color:#E6C7B2"/>
    </linearGradient>
  </defs>
  <rect width="100%" height="100%" fill="url(#bg)"/>
  <text x="600" y="520" text-anchor="middle" font-family="Georgia, serif" font-size="28" fill="#6B5246" opacity="0.85">janesluxe.com · Accra, Ghana</text>
</svg>`;

  const ogBase = await sharp(Buffer.from(ogSvg)).png().toBuffer();
  await sharp(ogBase)
    .composite([
      {
        input: logoBuf,
        top: Math.round((ogH - logoOnOg) / 2) - 40,
        left: Math.round((ogW - logoOnOg) / 2),
      },
    ])
    .png({ compressionLevel: 6 })
    .toFile(join(root, 'public', 'og-image.png'));

  await copyFile(join(root, 'public', 'og-image.png'), join(root, 'public', 'twitter-image.png'));
  console.log('✓ og-image.png & twitter-image.png');

  // PWA icons in public root (manifest)
  await copyFile(join(faviconDir, 'android-chrome-192x192.png'), join(root, 'public', 'icon-192.png'));
  await copyFile(join(faviconDir, 'android-chrome-512x512.png'), join(root, 'public', 'icon-512.png'));

  console.log('\nDone. Favicon pack in public/favicon/ + app/favicon.ico, icon.png, apple-icon.png');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
