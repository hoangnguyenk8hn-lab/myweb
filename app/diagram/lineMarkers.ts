import { linePoint } from "./sceneGeometry";
import type {
  ArrowHead,
  DiagramElement,
  Point,
  RightAngleDecoration,
  RightAngleMarker,
} from "./types";

export const RIGHT_ANGLE_MARKERS = [
  "right-angle-inside-left",
  "right-angle-inside-right",
  "right-angle-outside-left",
  "right-angle-outside-right",
] as const satisfies readonly RightAngleMarker[];

/** The legacy endHead glyph occupied 4 units inside a 10-unit marker tile. */
export const LEGACY_RIGHT_ANGLE_GLYPH_RATIO = 0.4;
export const rightAngleGlyphSize = (markerDimension: number) =>
  markerDimension * LEGACY_RIGHT_ANGLE_GLYPH_RATIO;

const MARKER_SIGNS: Record<RightAngleMarker, { x: -1 | 1; y: -1 | 1 }> = {
  "right-angle-inside-left": { x: -1, y: -1 },
  "right-angle-inside-right": { x: -1, y: 1 },
  "right-angle-outside-left": { x: 1, y: -1 },
  "right-angle-outside-right": { x: 1, y: 1 },
};

export function isRightAngleMarker(
  marker: ArrowHead | null | undefined,
): marker is RightAngleMarker {
  return !!marker && marker.startsWith("right-angle-");
}

/** Right-angle marks are decorations, not arrowheads. */
export function hasArrowHead(marker: ArrowHead | null | undefined) {
  return !!marker && marker !== "none" && !isRightAngleMarker(marker);
}

export function rightAngleMarkerPath(
  point: Point,
  direction: Point,
  marker: RightAngleMarker,
  size: number,
) {
  const length = Math.hypot(direction.x, direction.y);
  if (length < 1e-8) return "";
  const x = { x: direction.x / length, y: direction.y / length };
  const y = { x: -x.y, y: x.x };
  const signs = MARKER_SIGNS[marker];
  const alongX = { x: x.x * signs.x * size, y: x.y * signs.x * size };
  const alongY = { x: y.x * signs.y * size, y: y.y * signs.y * size };
  const p1 = { x: point.x + alongY.x, y: point.y + alongY.y };
  const p2 = { x: p1.x + alongX.x, y: p1.y + alongX.y };
  const p3 = { x: point.x + alongX.x, y: point.y + alongX.y };
  return `M${point.x} ${point.y}L${p1.x} ${p1.y}L${p2.x} ${p2.y}L${p3.x} ${p3.y}`;
}

/** Render a decoration in the element's local coordinate system. */
export function rightAngleDecorationPath(
  element: DiagramElement,
  decoration: RightAngleDecoration,
  size: number,
) {
  const at = Math.min(1, Math.max(0, decoration.at));
  const point = linePoint(element, at);
  const span = 0.01;
  const before = linePoint(element, Math.max(0, at - span));
  const after = linePoint(element, Math.min(1, at + span));
  return rightAngleMarkerPath(
    point,
    { x: after.x - before.x, y: after.y - before.y },
    decoration.marker,
    rightAngleGlyphSize(size),
  );
}
