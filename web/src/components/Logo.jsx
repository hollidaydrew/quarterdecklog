// The wordmark is an SVG (viewBox 2248x344) with a native display size of
// 281x43. It is shown at that size or smaller, never scaled up. width/height
// attributes reserve the space so the page doesn't jump while it loads.
const RATIO = 2248 / 344;
export const LOGO_NATIVE_HEIGHT = 43;

export default function Logo({ height = LOGO_NATIVE_HEIGHT, className = '' }) {
  return (
    <img
      src="/logo.svg"
      alt="QuarterDeckLog"
      className={`logo ${className}`.trim()}
      height={height}
      width={Math.round(height * RATIO)}
    />
  );
}
