export type HSV = { h: number; s: number; v: number; a: number };
export const clamp = (v: number, max = 1) => Math.max(0, Math.min(max, v));
export function hsvRgb({ h, s, v }: HSV): [number, number, number] {
  const c = v * s,
    x = c * (1 - Math.abs(((h / 60) % 2) - 1)),
    m = v - c;
  const rgb =
    h < 60
      ? [c, x, 0]
      : h < 120
        ? [x, c, 0]
        : h < 180
          ? [0, c, x]
          : h < 240
            ? [0, x, c]
            : h < 300
              ? [x, 0, c]
              : [c, 0, x];
  return rgb.map((n) => Math.round((n + m) * 255)) as [number, number, number];
}
export function rgbHsv(r: number, g: number, b: number, a = 1): HSV {
  r = clamp(r, 255) / 255;
  g = clamp(g, 255) / 255;
  b = clamp(b, 255) / 255;
  const max = Math.max(r, g, b),
    min = Math.min(r, g, b),
    d = max - min;
  const h =
    d === 0
      ? 0
      : max === r
        ? 60 * (((g - b) / d + 6) % 6)
        : max === g
          ? 60 * ((b - r) / d + 2)
          : 60 * ((r - g) / d + 4);
  return { h, s: max ? d / max : 0, v: max, a: clamp(a) };
}
export function parseColor(value: string): HSV {
  if (value === "transparent" || value === "none")
    return { h: 0, s: 0, v: 0, a: 0 };
  if (value === "white") return rgbHsv(255, 255, 255);
  const hex = value.replace(/^#/, "");
  if (/^[\da-f]{3,8}$/i.test(hex) && [3, 4, 6, 8].includes(hex.length)) {
    const full = hex.length < 5 ? [...hex].map((c) => c + c).join("") : hex;
    return rgbHsv(
      parseInt(full.slice(0, 2), 16),
      parseInt(full.slice(2, 4), 16),
      parseInt(full.slice(4, 6), 16),
      full.length === 8 ? parseInt(full.slice(6, 8), 16) / 255 : 1,
    );
  }
  const rgb = value.match(/^rgba?\(([^)]+)\)$/i);
  if (rgb) {
    const parts = rgb[1].split(/\s*,\s*/);
    const channel = (s: string) => parseFloat(s) * (s.endsWith("%") ? 2.55 : 1);
    return rgbHsv(
      channel(parts[0]),
      channel(parts[1]),
      channel(parts[2]),
      parts[3] === undefined
        ? 1
        : parseFloat(parts[3]) / (parts[3].endsWith("%") ? 100 : 1),
    );
  }
  return rgbHsv(0, 0, 0);
}
export function colorHex(hsv: HSV) {
  return hsvRgb(hsv)
    .map((n) => n.toString(16).padStart(2, "0"))
    .join("");
}
export function colorCss(hsv: HSV) {
  return hsv.a >= 1
    ? `#${colorHex(hsv)}`
    : `rgba(${hsvRgb(hsv).join(",")},${+hsv.a.toFixed(3)})`;
}
