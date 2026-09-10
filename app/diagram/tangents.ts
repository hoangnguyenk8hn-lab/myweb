import type { DiagramElement, Point } from "./types";
import {
  elementShapeId,
  localPoint,
  sceneBounds,
  TEXT_TYPES,
  worldPoint,
} from "./sceneGeometry";
import { elementContour, elementSegments } from "./intersections";
import { transformPoint } from "./pathBounds";

export type TangentCandidate = {
  /** Tangency point on the target object. */
  contact: Point;
  /** End point carrying the tangent direction. */
  end: Point;
  /** The source itself lies on the target, so the result is a full two-sided line. */
  throughSource?: boolean;
};

const SMOOTH_PATH_SHAPES = new Set([
  "arc",
  "quadratic",
  "cubic",
  "wave",
  "sine",
]);

const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const cross = (a: Point, b: Point) => a.x * b.y - a.y * b.x;

function normalized(v: Point): Point | null {
  const length = Math.hypot(v.x, v.y);
  return length < 1e-10 ? null : { x: v.x / length, y: v.y / length };
}

function tangentEnd(source: Point, contact: Point, direction: Point): Point {
  if (distance(source, contact) > 1e-4) return contact;
  const unit = normalized(direction);
  return unit
    ? { x: source.x + unit.x * 100, y: source.y + unit.y * 100 }
    : contact;
}

/**
 * Circle/ellipse tangents are solved analytically in the object's local frame.
 * Rotation and skew are applied afterwards; affine maps preserve tangency.
 */
function ellipseTangents(
  source: Point,
  target: DiagramElement,
): TangentCandidate[] | null {
  const shape = elementShapeId(target),
    borderedEllipse =
      TEXT_TYPES.has(target.type) &&
      ["circle", "ellipse"].includes(target.textBorder ?? "");
  if (!["circle", "ellipse"].includes(shape) && !borderedEllipse) return null;

  const b = sceneBounds(target),
    rx = b.width / 2,
    ry = b.height / 2;
  if (rx < 1e-8 || ry < 1e-8) return [];

  const cx = b.x + rx,
    cy = b.y + ry,
    localSource = localPoint(source, target),
    px = (localSource.x - cx) / rx,
    py = (localSource.y - cy) / ry,
    d2 = px * px + py * py,
    epsilon = 1e-9;

  if (d2 < 1 - epsilon) return [];

  const make = (
    nx: number,
    ny: number,
    throughSource = false,
  ): TangentCandidate => {
    const localContact = { x: cx + rx * nx, y: cy + ry * ny },
      contact = worldPoint(localContact, target),
      localDirection = { x: -rx * ny, y: ry * nx },
      directionPoint = worldPoint(
        {
          x: localContact.x + localDirection.x,
          y: localContact.y + localDirection.y,
        },
        target,
      ),
      direction = {
        x: directionPoint.x - contact.x,
        y: directionPoint.y - contact.y,
      };
    return {
      contact,
      end: throughSource
        ? tangentEnd(source, source, direction)
        : tangentEnd(source, contact, direction),
      throughSource,
    };
  };

  if (Math.abs(d2 - 1) <= epsilon) {
    const scale = 1 / Math.sqrt(Math.max(d2, 1e-20));
    return [make(px * scale, py * scale, true)];
  }

  const a = 1 / d2,
    h = Math.sqrt(Math.max(0, d2 - 1)) / d2;
  return [
    make(a * px - h * py, a * py + h * px),
    make(a * px + h * py, a * py - h * px),
  ];
}

export function supportsTangents(target: DiagramElement) {
  const shape = elementShapeId(target);
  return (
    ["circle", "ellipse"].includes(shape) ||
    (TEXT_TYPES.has(target.type) &&
      ["circle", "ellipse"].includes(target.textBorder ?? "")) ||
    ["curve", "curved-arrow", "polycurve"].includes(target.type) ||
    SMOOTH_PATH_SHAPES.has(shape)
  );
}

function numericPathTangents(
  source: Point,
  target: DiagramElement,
): TangentCandidate[] {
  if (typeof document === "undefined") return [];

  const { path, matrix } = elementContour(target),
    node = document.createElementNS("http://www.w3.org/2000/svg", "path");
  node.setAttribute("d", path);

  let total = 0;
  try {
    total = node.getTotalLength();
  } catch {
    return [];
  }
  if (!Number.isFinite(total) || total < 1e-8) return [];

  const pointAt = (s: number): Point => {
    const p = node.getPointAtLength(Math.max(0, Math.min(total, s)));
    return transformPoint({ x: p.x, y: p.y }, matrix);
  };
  const tangentAt = (s: number): Point | null => {
    const ds = Math.max(0.015, total * 1e-5),
      lo = Math.max(0, s - ds),
      hi = Math.min(total, s + ds);
    if (hi - lo < 1e-10) return null;
    const a = pointAt(lo),
      b = pointAt(hi);
    return normalized({ x: b.x - a.x, y: b.y - a.y });
  };
  const signedDistance = (s: number) => {
    const q = pointAt(s),
      tangent = tangentAt(s);
    if (!tangent) return Number.NaN;
    return cross(
      { x: q.x - source.x, y: q.y - source.y },
      tangent,
    );
  };

  const sampleCount = Math.max(72, Math.min(256, Math.ceil(total * 1.5))),
    samples = Array.from({ length: sampleCount + 1 }, (_, i) =>
      (i * total) / sampleCount,
    ),
    values = samples.map(signedDistance),
    roots: number[] = [];
  const addRoot = (s: number) => {
    if (!roots.some((n) => Math.abs(n - s) < total * 1e-4 + 1e-5)) roots.push(s);
  };

  for (let i = 0; i < sampleCount; i++) {
    const a = samples[i],
      b = samples[i + 1],
      fa = values[i],
      fb = values[i + 1];
    if (!Number.isFinite(fa) || !Number.isFinite(fb)) continue;
    if (Math.abs(fa) < 0.04) addRoot(a);
    if (fa * fb < 0) {
      let lo = a,
        hi = b,
        flo = fa;
      for (let step = 0; step < 34; step++) {
        const mid = (lo + hi) / 2,
          fm = signedDistance(mid);
        if (!Number.isFinite(fm)) break;
        if (flo * fm <= 0) hi = mid;
        else {
          lo = mid;
          flo = fm;
        }
      }
      addRoot((lo + hi) / 2);
    }
  }
  if (Math.abs(values[sampleCount]) < 0.04) addRoot(total);

  // A repeated tangent can touch zero without changing sign. Detect a small
  // local minimum of the tangent-line distance and refine it numerically.
  for (let i = 1; i < sampleCount; i++) {
    if (
      !Number.isFinite(values[i - 1]) ||
      !Number.isFinite(values[i]) ||
      !Number.isFinite(values[i + 1])
    )
      continue;
    const current = Math.abs(values[i]);
    if (
      current > 0.6 ||
      current > Math.abs(values[i - 1]) ||
      current > Math.abs(values[i + 1])
    )
      continue;
    let lo = samples[i - 1],
      hi = samples[i + 1];
    for (let step = 0; step < 24; step++) {
      const left = lo + (hi - lo) / 3,
        right = hi - (hi - lo) / 3;
      if (Math.abs(signedDistance(left)) <= Math.abs(signedDistance(right))) hi = right;
      else lo = left;
    }
    const root = (lo + hi) / 2;
    if (Math.abs(signedDistance(root)) < 0.08) addRoot(root);
  }

  const result: TangentCandidate[] = [];
  for (const root of roots) {
    if (Math.abs(signedDistance(root)) > 0.15) continue;
    const contact = pointAt(root),
      direction = tangentAt(root);
    if (!direction) continue;
    if (result.some((candidate) => distance(candidate.contact, contact) < 0.6)) continue;
    const throughSource = distance(source, contact) < 0.6;
    result.push({
      contact,
      end: throughSource
        ? tangentEnd(source, source, direction)
        : tangentEnd(source, contact, direction),
      throughSource,
    });
  }
  return result;
}

/** Return all tangent branches from one point to a supported object. */
export function tangentCandidates(
  source: Point,
  target: DiagramElement,
): TangentCandidate[] {
  const ellipse = ellipseTangents(source, target);
  if (ellipse !== null) return ellipse;
  return supportsTangents(target) ? numericPathTangents(source, target) : [];
}

function segmentDistance(point: Point, a: Point, b: Point) {
  const dx = b.x - a.x,
    dy = b.y - a.y,
    length2 = dx * dx + dy * dy;
  if (length2 < 1e-16) return distance(point, a);
  const t = Math.max(
    0,
    Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / length2),
  );
  return Math.hypot(point.x - (a.x + t * dx), point.y - (a.y + t * dy));
}

/** Pick the supported contour nearest the pointer while dragging the tool. */
export function tangentTargetAt(
  point: Point,
  elements: DiagramElement[],
  zoom = 1,
): DiagramElement | null {
  const tolerance = 12 / Math.max(zoom, 1e-6);
  let closest: DiagramElement | null = null,
    best = tolerance;
  for (const element of elements) {
    if (!supportsTangents(element)) continue;
    for (const [a, b] of elementSegments(element)) {
      const d = segmentDistance(point, a, b);
      if (d <= best) {
        best = d;
        closest = element;
      }
    }
  }
  return closest;
}
