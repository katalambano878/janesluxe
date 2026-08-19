const RASTER_EXT = /\.(jpe?g|png|webp|heic|heif)$/i;
const MAX_EDGE = 1600;
const JPEG_QUALITY = 75;
const PNG_QUALITY = 80;

function isRasterPath(objectPath: string, contentType?: string): boolean {
  if (contentType?.startsWith("image/") && !contentType.includes("svg") && !contentType.includes("gif")) {
    return true;
  }
  return RASTER_EXT.test(objectPath);
}

/**
 * Shrink phone-camera uploads so storefront grids load on mobile.
 * Returns the original buffer when the file is not a raster image or
 * compression does not help.
 */
export async function optimizeImageBuffer(
  input: Buffer,
  objectPath: string,
  contentType?: string
): Promise<{ buffer: Buffer; contentType?: string }> {
  if (!isRasterPath(objectPath, contentType)) {
    return { buffer: input, contentType };
  }

  try {
    const { default: sharp } = await import("sharp");
    const image = sharp(input, { failOn: "none", animated: false }).rotate();
    const meta = await image.metadata();
    if (!meta.width || !meta.height) {
      return { buffer: input, contentType };
    }

    const longest = Math.max(meta.width, meta.height);
    let pipeline = image;
    if (longest > MAX_EDGE) {
      pipeline = pipeline.resize({
        width: meta.width >= meta.height ? MAX_EDGE : undefined,
        height: meta.height > meta.width ? MAX_EDGE : undefined,
        withoutEnlargement: true,
      });
    }

    const keepPng = (meta.hasAlpha && (contentType === "image/png" || /\.png$/i.test(objectPath)));
    const output = keepPng
      ? await pipeline.png({ palette: true, quality: PNG_QUALITY, compressionLevel: 9 }).toBuffer()
      : await pipeline.jpeg({ quality: JPEG_QUALITY, mozjpeg: true }).toBuffer();

    if (output.length >= input.length) {
      return { buffer: input, contentType };
    }

    return {
      buffer: output,
      contentType: keepPng ? "image/png" : "image/jpeg",
    };
  } catch {
    return { buffer: input, contentType };
  }
}
