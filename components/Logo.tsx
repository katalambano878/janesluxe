import Image from "next/image";

type LogoProps = {
  className?: string;
  variant?: "default" | "light";
  width?: number;
  height?: number;
};

/**
 * PLACEHOLDER: Replace with your brand logo.
 * - Add /public/logo.svg and /public/logo-white.svg (see /public/ASSETS_GUIDE.md)
 * - Or swap the placeholder div below for your SVG/img markup.
 */
export function Logo({
  className = "",
  variant = "default",
  width = 120,
  height = 40,
}: LogoProps) {
  const src = variant === "light" ? "/logo-white.svg" : "/logo.svg";

  return (
    <div
      className={`relative flex items-center justify-center overflow-hidden rounded bg-slate-200 text-slate-500 ${className}`}
      style={{ width, height, minWidth: width, minHeight: height }}
      aria-label="YOUR_LOGO_HERE"
    >
      {/* Uncomment after adding logo files to /public:
      <Image src={src} alt="YOUR_BRAND_NAME" width={width} height={height} className="object-contain" />
      */}
      <span className="px-2 text-center font-mono text-[10px] leading-tight">
        YOUR_LOGO
      </span>
    </div>
  );
}
