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
import {
  angleIsOnEllipseArc,
  ellipseArcAngles,
  ellipseArcGeometry,
  isEllipseArc,
  normalizeShapeAngle,
} from "./shapes";

export type TangentCandidate = {
  /** Tangency point on the target object. */
  contact: Point;
  /** End point carrying the tangent direction. */
  end: Point;
  /** The source itself lies on the target, so the result is a full two-sided line. */
  throughSource?: boolean;
};

export type TangentLinePreview = {
  start: Point;
  end: Point;
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
const dot = (a: Point, b: Point) => a.x * b.x + a.y * b.y;

type EllipseFrame = {
  cx: number;
  cy: number;
  axisX: number;
  axisY: number;
  arc: boolean;
};

function ellipseFrame(target: DiagramElement): EllipseFrame | null {
  const shape = elementShapeId(target),
    shapeEllipse = ["circle", "ellipse"].includes(shape),
    borderedEllipse =
      TEXT_TYPES.has(target.type) &&
      ["circle", "ellipse"].includes(target.textBorder ?? "");
  if (!shapeEllipse && !borderedEllipse) return null;
  if (shapeEllipse) {
    const geometry = ellipseArcGeometry(shape);
    return {
      cx: target.x + (target.width * geometry.cx) / 100,
      cy: target.y + (target.height * geometry.cy) / 100,
      axisX: (target.width * geometry.rx) / 100,
      axisY: (target.height * geometry.ry) / 100,
      arc: isEllipseArc(shape, target.parameters),
    };
  }
  const bounds = sceneBounds(target);
  return {
    cx: bounds.x + bounds.width / 2,
    cy: bounds.y + bounds.height / 2,
    axisX: bounds.width / 2,
    axisY: bounds.height / 2,
    arc: false,
  };
}

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

function candidateDirection(
  source: Point,
  candidate: TangentCandidate,
): Point | null {
  return normalized(
    candidate.throughSource
      ? { x: candidate.end.x - source.x, y: candidate.end.y - source.y }
      : {
          x: candidate.contact.x - source.x,
          y: candidate.contact.y - source.y,
        },
  );
}

/**
 * Convert a tangent branch into the finite line shown/created by the tool.
 * External tangents always reach the contact point, then can be extended by
 * dragging farther along the tangent. When the source itself is the contact,
 * the line grows symmetrically in both directions around the source.
 */
export function tangentLineForPointer(
  source: Point,
  candidate: TangentCandidate,
  pointer: Point,
  minHalfLength = 24,
): TangentLinePreview {
  const unit = candidateDirection(source, candidate);
  if (!unit) return { start: source, end: candidate.end };

  const offset = { x: pointer.x - source.x, y: pointer.y - source.y };
  if (candidate.throughSource) {
    const halfLength = Math.max(minHalfLength, Math.abs(dot(offset, unit)));
    return {
      start: {
        x: source.x - unit.x * halfLength,
        y: source.y - unit.y * halfLength,
      },
      end: {
        x: source.x + unit.x * halfLength,
        y: source.y + unit.y * halfLength,
      },
    };
  }

  const contactLength = distance(source, candidate.contact),
    length = Math.max(contactLength, dot(offset, unit));
  return {
    start: source,
    end: {
      x: source.x + unit.x * length,
      y: source.y + unit.y * length,
    },
  };
}

/**
 * Keep one already-selected tangent branch alive after the pointer leaves the
 * target contour and moves along that tangent to choose its final length.
 */
export function tangentRetainsCandidateAt(
  pointer: Point,
  source: Point,
  candidate: TangentCandidate,
  zoom = 1,
) {
  const unit = candidateDirection(source, candidate);
  if (!unit) return false;
  const offset = { x: pointer.x - source.x, y: pointer.y - source.y },
    scale = Math.max(zoom, 1e-6),
    lateral = Math.abs(cross(offset, unit)),
    along = dot(offset, unit);
  if (lateral > 14 / scale) return false;
  if (candidate.throughSource) return Math.abs(along) >= 8 / scale;
  return along >= distance(source, candidate.contact) - 18 / scale;
}

/**
 * Circle/ellipse tangents are solved analytically in the object's local frame.
 * Rotation and skew are applied afterwards; affine maps preserve tangency.
 */
function ellipseTangents(
  source: Point,
  target: DiagramElement,
): TangentCandidate[] | null {
  const frame = ellipseFrame(target);
  if (!frame) return null;

  // sceneBounds() is correct for a complete ellipse, but an arc's bounds only
  // enclose its visible span. Reusing those bounds changes the center/radii and
  // solves tangents against an imaginary ellipse. Shape ellipses must always
  // use the original 100×100 tile geometry, even after conversion to an arc.
  const { cx, cy, axisX, axisY, arc } = frame;
  if (Math.abs(axisX) < 1e-8 || Math.abs(axisY) < 1e-8) return [];

  const localSource = localPoint(source, target),
    px = (localSource.x - cx) / axisX,
    py = (localSource.y - cy) / axisY,
    d2 = px * px + py * py,
    epsilon = 1e-9;

  if (d2 < 1 - epsilon) return [];

  const make = (
    nx: number,
    ny: number,
    throughSource = false,
  ): TangentCandidate => {
    const localContact = {
        x: cx + axisX * nx,
        y: cy + axisY * ny,
      },
      contact = worldPoint(localContact, target),
      localDirection = { x: -axisX * ny, y: axisY * nx },
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
  const onVisibleArc = (nx: number, ny: number) =>
    !arc ||
    angleIsOnEllipseArc(
      normalizeShapeAngle((Math.atan2(ny, nx) * 180) / Math.PI),
      target.parameters,
      1e-7,
    );

  if (Math.abs(d2 - 1) <= epsilon) {
    const scale = 1 / Math.sqrt(Math.max(d2, 1e-20));
    const nx = px * scale,
      ny = py * scale;
    return onVisibleArc(nx, ny) ? [make(nx, ny, true)] : [];
  }

  const a = 1 / d2,
    h = Math.sqrt(Math.max(0, d2 - 1)) / d2,
    contacts = [
      { nx: a * px - h * py, ny: a * py + h * px },
      { nx: a * px + h * py, ny: a * py - h * px },
    ];
  return contacts
    .filter(({ nx, ny }) => onVisibleArc(nx, ny))
    .map(({ nx, ny }) => make(nx, ny));
}

function realQuadraticRoots(a: number, b: number, c: number) {
  const scale = Math.max(Math.abs(a), Math.abs(b), Math.abs(c), 1);
  if (Math.abs(a) <= 1e-12 * scale)
    return Math.abs(b) <= 1e-12 * scale ? [] : [-c / b];
  let discriminant = b * b - 4 * a * c;
  const tolerance = 1e-12 * Math.max(b * b, Math.abs(4 * a * c), 1);
  if (discriminant < -tolerance) return [];
  if (Math.abs(discriminant) <= tolerance) discriminant = 0;
  const root = Math.sqrt(Math.max(0, discriminant));
  return root === 0
    ? [-b / (2 * a)]
    : [(-b - root) / (2 * a), (-b + root) / (2 * a)];
}

/**
 * Solve tangents to the quadratic shape analytically. The sampled-path solver
 * cannot reliably detect the double root produced when the source is exactly
 * on the parabola (notably at its vertex).
 */
function quadraticTangents(
  source: Point,
  target: DiagramElement,
): TangentCandidate[] | null {
  if (elementShapeId(target) !== "quadratic") return null;
  const { matrix } = elementContour(target);
  const p0 = transformPoint({ x: 5, y: 5 }, matrix),
    p1 = transformPoint({ x: 50, y: 175 }, matrix),
    p2 = transformPoint({ x: 95, y: 5 }, matrix),
    linear = { x: 2 * (p1.x - p0.x), y: 2 * (p1.y - p0.y) },
    quadratic = {
      x: p0.x - 2 * p1.x + p2.x,
      y: p0.y - 2 * p1.y + p2.y,
    },
    offset = { x: p0.x - source.x, y: p0.y - source.y };
  const roots = realQuadraticRoots(
    cross(linear, quadratic),
    2 * cross(offset, quadratic),
    cross(offset, linear),
  );
  const uniqueRoots: number[] = [];
  for (const raw of roots) {
    const t = Math.min(1, Math.max(0, raw));
    if (
      raw < -1e-8 ||
      raw > 1 + 1e-8 ||
      uniqueRoots.some((candidate) => Math.abs(candidate - t) < 1e-7)
    )
      continue;
    uniqueRoots.push(t);
  }
  return uniqueRoots.map((t) => {
    const contact = {
        x: p0.x + linear.x * t + quadratic.x * t * t,
        y: p0.y + linear.y * t + quadratic.y * t * t,
      },
      direction = {
        x: linear.x + 2 * quadratic.x * t,
        y: linear.y + 2 * quadratic.y * t,
      },
      throughSource = distance(source, contact) < 0.6;
    return {
      contact,
      end: throughSource
        ? tangentEnd(source, source, direction)
        : tangentEnd(source, contact, direction),
      throughSource,
    };
  });
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
  const quadratic = quadraticTangents(source, target);
  if (quadratic !== null) return quadratic;
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

/**
 * When a tangent gesture starts on a circle, ellipse or arc, place its source
 * exactly on that conic. Ordinary scene snapping only exposes a few anchors;
 * leaving the raw pointer a fraction inside/outside the stroke changes a
 * one-branch on-curve tangent into zero or two external tangent branches.
 */
export function tangentSourceAt(
  point: Point,
  elements: DiagramElement[],
  zoom = 1,
): Point | null {
  const target = tangentTargetAt(point, elements, zoom),
    frame = target ? ellipseFrame(target) : null;
  if (!target || !frame) return null;
  const local = localPoint(point, target),
    nx = (local.x - frame.cx) / frame.axisX,
    ny = (local.y - frame.cy) / frame.axisY;
  if (!Number.isFinite(nx) || !Number.isFinite(ny)) return null;
  const rawAngle = normalizeShapeAngle(
      (Math.atan2(ny, nx) * 180) / Math.PI,
    ),
    pointAt = (angle: number) => {
      const radians = (angle * Math.PI) / 180;
      return worldPoint(
        {
          x: frame.cx + frame.axisX * Math.cos(radians),
          y: frame.cy + frame.axisY * Math.sin(radians),
        },
        target,
      );
    };
  if (!frame.arc || angleIsOnEllipseArc(rawAngle, target.parameters, 1e-7))
    return pointAt(rawAngle);

  const { start, sweep } = ellipseArcAngles(target.parameters),
    endpoints = [pointAt(start), pointAt(start + sweep)];
  return endpoints.reduce((closest, candidate) =>
    distance(point, candidate) < distance(point, closest) ? candidate : closest,
  );
}
