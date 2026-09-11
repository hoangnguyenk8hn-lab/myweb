import type { DiagramElement, Point } from "./types";
import { lineVertices, worldPoint } from "./sceneGeometry";

export type PerpendicularTarget = {
  id: string;
  a: Point;
  b: Point;
};

export type PerpendicularPreview = {
  target: PerpendicularTarget;
  start: Point;
  end: Point;
  foot: Point;
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
  return { target, start: source, end: foot, foot };
}
