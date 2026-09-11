import type { DiagramElement, Point } from "./types";
import { lineVertices, worldPoint } from "./sceneGeometry";
import { nearestSnapTarget, type SnapTarget } from "./snapping";

export type PointReflectionTarget =
  | { kind: "point"; point: Point }
  | { kind: "line"; elementId: string; a: Point; b: Point };

export type PointReflectionPreview = {
  target: PointReflectionTarget;
  result: Point;
};

function segmentDistance(point: Point, a: Point, b: Point) {
  const dx = b.x - a.x,
    dy = b.y - a.y,
    length2 = dx * dx + dy * dy;
  if (length2 < 1e-16) return Math.hypot(point.x - a.x, point.y - a.y);
  const t = Math.max(
    0,
    Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / length2),
  );
  return Math.hypot(point.x - (a.x + t * dx), point.y - (a.y + t * dy));
}

export function reflectPointAcrossPoint(source: Point, center: Point): Point {
  return { x: 2 * center.x - source.x, y: 2 * center.y - source.y };
}

export function reflectPointAcrossLine(
  source: Point,
  a: Point,
  b: Point,
): Point | null {
  const dx = b.x - a.x,
    dy = b.y - a.y,
    length2 = dx * dx + dy * dy;
  if (length2 < 1e-16) return null;
  const t = ((source.x - a.x) * dx + (source.y - a.y) * dy) / length2,
    projection = { x: a.x + t * dx, y: a.y + t * dy };
  return {
    x: 2 * projection.x - source.x,
    y: 2 * projection.y - source.y,
  };
}

export function pointReflectionTargetAt(
  pointer: Point,
  elements: DiagramElement[],
  snapTargets: SnapTarget[],
  zoom = 1,
): PointReflectionTarget | null {
  // Exact geometric anchors win over a nearby line so point reflection remains
  // predictable at endpoints, midpoints, intersections and explicit Points.
  const pointTarget = nearestSnapTarget(pointer, snapTargets, [], zoom);
  if (pointTarget) return { kind: "point", point: pointTarget.point };

  const tolerance = 10 / Math.max(zoom, 1e-6);
  let closest: PointReflectionTarget | null = null,
    best = tolerance;
  for (const element of elements) {
    if (element.type !== "line") continue;
    const vertices = lineVertices(element);
    // A multi-vertex Line is a polyline and has no single reflection axis.
    if (vertices.length !== 2) continue;
    const a = worldPoint(vertices[0], element),
      b = worldPoint(vertices[1], element),
      distance = segmentDistance(pointer, a, b);
    if (distance <= best) {
      best = distance;
      closest = { kind: "line", elementId: element.id, a, b };
    }
  }
  return closest;
}

export function pointReflectionPreview(
  source: Point,
  target: PointReflectionTarget | null,
): PointReflectionPreview | null {
  if (!target) return null;
  const result =
    target.kind === "point"
      ? reflectPointAcrossPoint(source, target.point)
      : reflectPointAcrossLine(source, target.a, target.b);
  return result ? { target, result } : null;
}
