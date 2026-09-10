import type { FillPaint } from "./types";
import type { Bounds } from "./pathBounds";
export function PaintDefinition({
  paint,
  id,
  bounds,
}: {
  paint: FillPaint | undefined;
  id: string;
  bounds: Bounds;
}) {
  if (!paint) return null;
  if (paint.kind === "gradient") {
    const stops = (
      <>
        <stop offset="0" stopColor={paint.from} />
        <stop offset="1" stopColor={paint.to} />
      </>
    );
    const angle = (paint.angle * Math.PI) / 180,
      x = Math.cos(angle) * 50,
      y = Math.sin(angle) * 50;
    return (
      <defs>
        {paint.type === "radial" ? (
          <radialGradient id={id}>{stops}</radialGradient>
        ) : (
          <linearGradient
            id={id}
            x1={`${50 - x}%`}
            y1={`${50 - y}%`}
            x2={`${50 + x}%`}
            y2={`${50 + y}%`}
          >
            {stops}
          </linearGradient>
        )}
      </defs>
    );
  }
  const n = paint.size,
    foreground = paint.foreground === "transparent" ? "none" : paint.foreground;
  return (
    <defs>
      <pattern
        id={id}
        patternUnits="objectBoundingBox"
        width={n / Math.max(1, bounds.width)}
        height={n / Math.max(1, bounds.height)}
        viewBox={`0 0 ${n} ${n}`}
        preserveAspectRatio="none"
      >
        <rect
          width={n}
          height={n}
          fill={paint.background === "transparent" ? "none" : paint.background}
        />
        {paint.type === "dots" ? (
          <circle cx={n / 2} cy={n / 2} r="1" fill={foreground} />
        ) : (
          <path
            d={
              paint.type === "grid"
                ? `M0 0H${n}M0 0V${n}`
                : paint.type === "crosshatch"
                  ? `M0 0L${n} ${n}M0 ${n}L${n} 0`
                  : `M${-n / 2} ${n / 2}L${n / 2} ${-n / 2}M0 ${n}L${n} 0M${n / 2} ${n * 1.5}L${n * 1.5} ${n / 2}`
            }
            stroke={foreground}
            strokeWidth="1"
            fill="none"
          />
        )}
      </pattern>
    </defs>
  );
}
