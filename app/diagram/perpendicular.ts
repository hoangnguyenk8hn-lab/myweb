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

function clipInfiniteLineToCanvas(
  point: Point,
  direction: Point,
  width: number,
  height: number,
): [Point, Point] | null {
  const epsilon = 1e-8,
    hits: { t: number; point: Point }[] = [];

  const add = (t: number) => {
    const x = point.x + t * direction.x,
      y = point.y + t * direction.y;
    if (x < -epsilon || x > width + epsilon || y < -epsilon || y > height + epsilon)
      return;
    const candidate = {
      x: Math.max(0, Math.min(width, x)),
      y: Math.max(0, Math.min(height, y)),
    };
    if (
      hits.some(
        (hit) =>
          Math.hypot(hit.point.x - candidate.x, hit.point.y - candidate.y) < epsilon,
      )
    )
      return;
    hits.push({ t, point: candidate });
  };

  if (Math.abs(direction.x) > epsilon) {
    add((0 - point.x) / direction.x);
    add((width - point.x) / direction.x);
  }
  if (Math.abs(direction.y) > epsilon) {
    add((0 - point.y) / direction.y);
    add((height - point.y) / direction.y);
  }

  if (hits.length < 2) return null;
  hits.sort((left, right) => left.t - right.t);
  return [hits[0].point, hits[hits.length - 1].point];
}

/**
 * Build the visible infinite perpendicular through `source`, clipped to the
 * current canvas. The resulting Line is static once committed to the document.
 */
export function perpendicularPreview(
  source: Point,
  target: PerpendicularTarget | null,
  width: number,
  height: number,
): PerpendicularPreview | null {
  if (!target) return null;
  const dx = target.b.x - target.a.x,
    dy = target.b.y - target.a.y,
    length = Math.hypot(dx, dy);
  if (length < 1e-8) return null;

  const direction = { x: -dy / length, y: dx / length },
    clipped = clipInfiniteLineToCanvas(source, direction, width, height),
    foot = projectPointToLine(source, target.a, target.b);
  if (!clipped || !foot) return null;
  return { target, start: clipped[0], end: clipped[1], foot };
}
