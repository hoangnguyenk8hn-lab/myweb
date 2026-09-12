import type { Point } from "./types";
import type { Segment } from "./pathBounds";

export const GEOMETRY_EPSILON = 1e-8;

export const subtract = (a: Point, b: Point): Point => ({
  x: a.x - b.x,
  y: a.y - b.y,
});

export const cross = (a: Point, b: Point) => a.x * b.y - a.y * b.x;

export function segmentDistance(point: Point, a: Point, b: Point) {
  const delta = subtract(b, a);
  const length2 = delta.x * delta.x + delta.y * delta.y;
  if (length2 < GEOMETRY_EPSILON * GEOMETRY_EPSILON) return Infinity;
  const offset = subtract(point, a);
  const t = Math.max(
    0,
    Math.min(1, (offset.x * delta.x + offset.y * delta.y) / length2),
  );
  return Math.hypot(
    point.x - (a.x + t * delta.x),
    point.y - (a.y + t * delta.y),
  );
}

export function lineDistance(point: Point, a: Point, b: Point) {
  const delta = subtract(b, a);
  const length = Math.hypot(delta.x, delta.y);
  return length < GEOMETRY_EPSILON
    ? Infinity
    : Math.abs(cross(subtract(point, a), delta)) / length;
}

export function projectPointToLine(point: Point, a: Point, b: Point) {
  const delta = subtract(b, a);
  const length2 = delta.x * delta.x + delta.y * delta.y;
  if (length2 < GEOMETRY_EPSILON * GEOMETRY_EPSILON) return null;
  const offset = subtract(point, a);
  const t = (offset.x * delta.x + offset.y * delta.y) / length2;
  return { x: a.x + t * delta.x, y: a.y + t * delta.y };
}

/** Shared endpoints count once; coincident runs have no isolated crossing. */
export function segmentIntersection(
  [a, b]: Segment,
  [c, d]: Segment,
): Point | null {
  const r = subtract(b, a),
    s = subtract(d, c),
    delta = subtract(c, a),
    denominator = cross(r, s);
  if (Math.abs(denominator) < 1e-10) {
    const onSegment = (point: Point, [from, to]: Segment) =>
      Math.abs(cross(subtract(point, from), subtract(to, from))) < 1e-8 &&
      point.x >= Math.min(from.x, to.x) - GEOMETRY_EPSILON &&
      point.x <= Math.max(from.x, to.x) + GEOMETRY_EPSILON &&
      point.y >= Math.min(from.y, to.y) - GEOMETRY_EPSILON &&
      point.y <= Math.max(from.y, to.y) + GEOMETRY_EPSILON;
    const shared: Point[] = [];
    for (const point of [a, b, c, d])
      if (
        onSegment(point, [a, b]) &&
        onSegment(point, [c, d]) &&
        !shared.some(
          (candidate) =>
            Math.hypot(point.x - candidate.x, point.y - candidate.y) <
            GEOMETRY_EPSILON,
        )
      )
        shared.push(point);
    return shared.length === 1 ? shared[0] : null;
  }
  const t = cross(delta, s) / denominator,
    u = cross(delta, r) / denominator;
  if (
    t < -GEOMETRY_EPSILON ||
    t > 1 + GEOMETRY_EPSILON ||
    u < -GEOMETRY_EPSILON ||
    u > 1 + GEOMETRY_EPSILON
  )
    return null;
  return { x: a.x + t * r.x, y: a.y + t * r.y };
}
