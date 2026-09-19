// The logo image is 281x105; width/height attributes reserve the space so the
// page doesn't jump while it loads.
const RATIO = 281 / 105;

export default function Logo({ height = 40, className = '' }) {
  return (
    <img
      src="/logo.png"
      alt="QuarterDeckLog"
      className={`logo ${className}`.trim()}
      height={height}
      width={Math.round(height * RATIO)}
    />
  );
}
