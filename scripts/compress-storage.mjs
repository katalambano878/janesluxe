#!/usr/bin/env node
/**
 * Compress raster files under STORAGE_ROOT (product-images, category-images).
 * Safe to re-run: skips videos and files that do not get smaller.
 *
 *   STORAGE_ROOT=/data/storage node scripts/compress-storage.mjs
 */
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const ROOT = process.env.STORAGE_ROOT || path.join(process.cwd(), ".storage");
const MAX_EDGE = 1600;
const JPEG_QUALITY = 75;
const PNG_QUALITY = 80;
const SKIP_EXT = new Set([".mp4", ".mov", ".webm", ".m4v", ".pdf", ".json"]);

async function* walk(dir) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else yield full;
  }
}

function fmt(bytes) {
  return bytes >= 1024 * 1024
    ? `${(bytes / (1024 * 1024)).toFixed(2)} MB`
    : `${Math.round(bytes / 1024)} KB`;
}

async function compressFile(file) {
  const ext = path.extname(file).toLowerCase();
  if (SKIP_EXT.has(ext) || file.endsWith(".meta.json")) return null;
  if (![".png", ".jpg", ".jpeg", ".webp"].includes(ext)) return null;

  const input = await readFile(file);
  const image = sharp(input, { failOn: "none", animated: false }).rotate();
  const meta = await image.metadata();
  if (!meta.width || !meta.height) return null;

  let pipeline = image;
  const longest = Math.max(meta.width, meta.height);
  if (longest > MAX_EDGE) {
    pipeline = pipeline.resize({
      width: meta.width >= meta.height ? MAX_EDGE : undefined,
      height: meta.height > meta.width ? MAX_EDGE : undefined,
      withoutEnlargement: true,
    });
  }

  const keepPng = Boolean(meta.hasAlpha && ext === ".png");
  const output = keepPng
    ? await pipeline.png({ palette: true, quality: PNG_QUALITY, compressionLevel: 9 }).toBuffer()
    : await pipeline.jpeg({ quality: JPEG_QUALITY, mozjpeg: true }).toBuffer();

  if (output.length >= input.length) {
    return { file, before: input.length, after: input.length, skipped: true };
  }

  await writeFile(file, output);
  await writeFile(
    file + ".meta.json",
    JSON.stringify({ contentType: keepPng ? "image/png" : "image/jpeg" })
  );
  return { file, before: input.length, after: output.length, skipped: false };
}

async function main() {
  console.log("STORAGE_ROOT", ROOT);
  let totalBefore = 0;
  let totalAfter = 0;
  let compressed = 0;
  let skipped = 0;
  for await (const file of walk(ROOT)) {
    try {
      const result = await compressFile(file);
      if (!result) continue;
      totalBefore += result.before;
      totalAfter += result.after;
      if (result.skipped) {
        skipped += 1;
        continue;
      }
      compressed += 1;
      console.log(
        `  ${fmt(result.before)} → ${fmt(result.after)}  ${path.relative(ROOT, result.file)}`
      );
    } catch (err) {
      console.warn("skip", file, err?.message || err);
    }
  }
  console.log(
    `done compressed=${compressed} unchanged=${skipped} ${fmt(totalBefore)} → ${fmt(totalAfter)}`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
