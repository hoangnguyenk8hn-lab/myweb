"use client";
import { useEffect, useState } from "react";
import type { MathSvg } from "./mathSvg";
export function MathFormula({
  value,
  x,
  y,
  fontSize,
  color,
}: {
  value: string;
  x: number;
  y: number;
  fontSize: number;
  color: string;
}) {
  const [rendered, setRendered] = useState<MathSvg | null>(null);
  useEffect(() => {
    let cancelled = false;
    import("./mathSvg").then(({ renderMathSvg }) => {
      try {
        const next = renderMathSvg(value);
        if (!cancelled) setRendered(next);
      } catch {
        if (!cancelled) setRendered(null);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [value]);
  if (!rendered)
    return (
      <text
        x={x}
        y={y}
        textAnchor="middle"
        dominantBaseline="central"
        fontFamily="Times New Roman,serif"
        fontSize={fontSize}
        fill={color}
      >
        {value}
      </text>
    );
  const [bx, by, bw, bh] = rendered.box;
  const scale = fontSize / 1000;
  return (
    <g
      pointerEvents="none"
      color={color}
      fill={color}
      transform={`translate(${x - (bw * scale) / 2} ${y - (bh * scale) / 2}) scale(${scale}) translate(${-bx} ${-by})`}
      dangerouslySetInnerHTML={{ __html: rendered.body }}
    />
  );
}
