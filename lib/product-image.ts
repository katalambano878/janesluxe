const VIDEO_EXT = /\.(mp4|mov|webm|m4v)(\?|#|$)/i;
const IMAGE_CACHE_BUST = "v=20260819";

export function isRasterImageUrl(url?: string | null): boolean {
  if (!url) return false;
  return !VIDEO_EXT.test(url);
}

function withCacheBust(url: string): string {
  if (!url.includes("/storage/")) return url;
  if (url.includes("v=20260819")) return url;
  return url.includes("?") ? `${url}&${IMAGE_CACHE_BUST}` : `${url}?${IMAGE_CACHE_BUST}`;
}

export function primaryProductImageUrl(
  images: Array<{ url?: string | null; position?: number | null }> | null | undefined,
  fallback = ""
): string {
  const sorted = [...(images || [])].sort(
    (a, b) => (Number(a?.position) || 0) - (Number(b?.position) || 0)
  );
  const match = sorted.find((img) => isRasterImageUrl(img?.url));
  const url = match?.url || fallback;
  return url ? withCacheBust(url) : url;
}
