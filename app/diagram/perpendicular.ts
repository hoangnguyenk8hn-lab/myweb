import type { ArrowHead, DiagramElement, Point } from "./types";
import { lineVertices, worldPoint } from "./sceneGeometry";

export type PerpendicularTarget = {
  id: string;
  a: Point;
  b: Point;
};

export const RIGHT_ANGLE_MARKERS = [
  "right-angle-inside-left",
  "right-angle-inside-right",
  "right-angle-outside-left",
  "right-angle-outside-right",
] as const satisfies readonly ArrowHead[];

export type RightAngleMarker = (typeof RIGHT_ANGLE_MARKERS)[number];

export type PerpendicularPreview = {
  target: PerpendicularTarget;
  start: Point;
  end: Point;
  foot: Point;
  marker: RightAngleMarker | null;
};

type MarkerSigns = { x: -1 | 1; y: -1 | 1 };

const MARKER_SIGNS: Record<RightAngleMarker, MarkerSigns> = {
  "right-angle-inside-left": { x: -1, y: -1 },
  "right-angle-inside-right": { x: -1, y: 1 },
  "right-angle-outside-left": { x: 1, y: -1 },
  "right-angle-outside-right": { x: 1, y: 1 },
};

function segmentDistance(point: Point, a: Point, b: Point) {
  const dx = b.x - a.x,
    dy = b.y - a.y,
    length2 = dx * dx + dy * dy;
  if (length2 < 1e-16) return Infinity;
  const t = Math.max(
    0,
    Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / length2),
  );
  return Math.hypot(point.x - (a.x + t * dx), point.y - (a.y + t * dy));
}

/** Return the nearest straight two-vertex Line under the pointer. */
export function perpendicularTargetAt(
  pointer: Point,
  elements: DiagramElement[],
  zoom = 1,
): PerpendicularTarget | null {
  const tolerance = 10 / Math.max(zoom, 1e-6);
  let closest: PerpendicularTarget | null = null,
    best = tolerance;

  for (const element of elements) {
    if (element.type !== "line") continue;
    const vertices = lineVertices(element);
    // A polyline has multiple local directions, so it is not one unambiguous
    // perpendicular target. The user can use one straight Line as the axis.
    if (vertices.length !== 2) continue;
    const a = worldPoint(vertices[0], element),
      b = worldPoint(vertices[1], element),
      distance = segmentDistance(pointer, a, b);
    if (distance <= best) {
      best = distance;
      closest = { id: element.id, a, b };
    }
  }
  return closest;
}

function projectPointToLine(point: Point, a: Point, b: Point): Point | null {
  const dx = b.x - a.x,
    dy = b.y - a.y,
    length2 = dx * dx + dy * dy;
  if (length2 < 1e-16) return null;
  const t = ((point.x - a.x) * dx + (point.y - a.y) * dy) / length2;
  return { x: a.x + t * dx, y: a.y + t * dy };
}

function previewFrame(preview: PerpendicularPreview) {
  const dx = preview.end.x - preview.start.x,
    dy = preview.end.y - preview.start.y,
    length = Math.hypot(dx, dy);
  if (length < 1e-8) return null;
  const x = { x: dx / length, y: dy / length };
  return { x, y: { x: -x.y, y: x.x } };
}

/** Keep the selected target alive while the pointer moves into a quick-pick corner. */
export function perpendicularQuickPickContains(
  pointer: Point,
  preview: PerpendicularPreview,
  zoom = 1,
) {
  return (
    Math.hypot(pointer.x - preview.foot.x, pointer.y - preview.foot.y) <=
    30 / Math.max(zoom, 1e-6)
  );
}

/** Return the right-angle marker represented by the pointer's quadrant around H. */
export function perpendicularMarkerAt(
  pointer: Point,
  preview: PerpendicularPreview,
  zoom = 1,
): RightAngleMarker | null {
  const frame = previewFrame(preview);
  if (!frame) return null;

  const vx = pointer.x - preview.foot.x,
    vy = pointer.y - preview.foot.y,
    radius = Math.hypot(vx, vy),
    scale = Math.max(zoom, 1e-6),
    inner = 5 / scale,
    outer = 26 / scale;
  if (radius < inner || radius > outer) return null;

  const localX = vx * frame.x.x + vy * frame.x.y,
    localY = vx * frame.y.x + vy * frame.y.y,
    deadZone = 2.5 / scale;
  if (Math.abs(localX) < deadZone || Math.abs(localY) < deadZone) return null;

  if (localX < 0)
    return localY < 0
      ? "right-angle-inside-left"
      : "right-angle-inside-right";
  return localY < 0
    ? "right-angle-outside-left"
    : "right-angle-outside-right";
}

/** SVG path for one of the four quick-pick corner guides around the foot H. */
export function rightAngleGuidePath(
  preview: PerpendicularPreview,
  marker: RightAngleMarker,
  size: number,
) {
  const frame = previewFrame(preview);
  if (!frame) return "";
  const signs = MARKER_SIGNS[marker],
    h = preview.foot,
    alongX = {
      x: frame.x.x * signs.x * size,
      y: frame.x.y * signs.x * size,
    },
    alongY = {
      x: frame.y.x * signs.y * size,
      y: frame.y.y * signs.y * size,
    },
    p1 = { x: h.x + alongY.x, y: h.y + alongY.y },
    p2 = { x: p1.x + alongX.x, y: p1.y + alongX.y },
    p3 = { x: h.x + alongX.x, y: h.y + alongX.y };
  return `M${h.x} ${h.y}L${p1.x} ${p1.y}L${p2.x} ${p2.y}L${p3.x} ${p3.y}`;
}

/**
 * Build the perpendicular segment from `source` to its foot on the target
 * line. Width/height remain in the signature so CurrentCanvas can keep the
 * same construction lifecycle used by the previous full-line preview.
 */
export function perpendicularPreview(
  source: Point,
  target: PerpendicularTarget | null,
  _width: number,
  _height: number,
): PerpendicularPreview | null {
  if (!target) return null;
  const foot = projectPointToLine(source, target.a, target.b);
  if (!foot) return null;
  if (Math.hypot(foot.x - source.x, foot.y - source.y) < 1e-8) return null;
  return { target, start: source, end: foot, foot, marker: null };
}
