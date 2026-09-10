import type { DiagramElement, Point } from "./types";
import {
  absolutePoints,
  center,
  elementMatrix,
  elementShapeId,
  isPointElement,
  isCurve,
  curvePoint,
  linePath,
  LINE_TYPES,
  polycurvePath,
  sceneBounds,
  TEXT_TYPES,
  worldBounds,
  worldPoint,
  localPoint,
  moveLineEndpoint,
} from "./sceneGeometry";
import {
  multiplyMatrix,
  svgPathSegments,
  type Segment,
  type Bounds,
} from "./pathBounds";
import { shapePath } from "./shapes";

export type IntersectionMark = {
  point: Point;
  owner: DiagramElement;
  ids: [string, string];
};
const cache = new Map<string, Segment[]>();
/** Nominal symbol size used by newly enabled Intersection marks. */
export const DEFAULT_INTERSECTION_MARKER_SIZE = 0.4;
export function intersectionAppearance(e: DiagramElement) {
  // Hidden intersections remain in the snap-target list. Zero visual geometry
  // also keeps image/TikZ export invisible while nearest snapping still uses
  // its independent minimum hit tolerance.
  if (e.intersectionHidden) return { radius: 0, strokeWidth: 0 };
  const size = e.intersectionMarkerSize;
  // Keep documents from before `intersectionMarkerSize` visually unchanged.
  if (size === undefined && e.intersectionSize !== undefined)
    return { radius: e.intersectionSize, strokeWidth: 1 };
  return {
    radius: (size ?? DEFAULT_INTERSECTION_MARKER_SIZE) * 4,
    strokeWidth: size ?? DEFAULT_INTERSECTION_MARKER_SIZE,
  };
}
/** Intersection symbols are explicit snap targets, independent of grid snapping. */
export function nearestIntersection(
  point: Point,
  marks: IntersectionMark[],
  excluded: string[] = [],
  zoom = 1,
): IntersectionMark | null {
  let closest: IntersectionMark | null = null,
    distance = Infinity;
  for (const mark of marks) {
    if (
      mark.owner.blockIntersection ||
      mark.ids.some((id) => excluded.includes(id))
    )
      continue;
    const d = Math.hypot(point.x - mark.point.x, point.y - mark.point.y);
    const radius = Math.max(
      7 / zoom,
      intersectionAppearance(mark.owner).radius + 2 / zoom,
    );
    if (d <= radius && d < distance) {
      closest = mark;
      distance = d;
    }
  }
  return closest;
}
/** A snap point takes precedence over automatic attachment to a nearby shape. */
export function dropLineEndpoint(
  e: DiagramElement,
  index: number,
  point: Point,
  mark: { point: Point } | null,
  nodeId?: string,
): DiagramElement {
  const next = moveLineEndpoint(e, index, mark?.point ?? point);
  return !mark && nodeId
    ? { ...next, [index === 0 ? "fromId" : "toId"]: nodeId }
    : next;
}
export function wantsIntersection(
  a: DiagramElement,
  b: DiagramElement,
): boolean {
  return (
    !!a.intersection &&
    !a.blockIntersection &&
    !b.blockIntersection &&
    (a.intersectionWith === undefined || a.intersectionWith.includes(b.id))
  );
}
export function elementContour(e: DiagramElement) {
  const m = elementMatrix(e);
  let path: string,
    matrix = m;
  if (LINE_TYPES.has(e.type)) path = linePath(e);
  else if (["polyline", "polycurve", "freehand"].includes(e.type)) {
    const points = absolutePoints(e);
    path =
      e.type === "polycurve"
        ? polycurvePath(points)
        : points.map((p, i) => `${i ? "L" : "M"}${p.x} ${p.y}`).join(" ") +
          (e.type === "polyline" ? "Z" : "");
  } else if (
    TEXT_TYPES.has(e.type) ||
    e.type === "image" ||
    e.type === "plot"
  ) {
    const b = sceneBounds(e),
      c = center(e);
    path =
      e.textBorder === "circle" || e.textBorder === "ellipse"
        ? `M${c.x + b.width / 2} ${c.y}A${b.width / 2} ${b.height / 2} 0 1 1 ${c.x - b.width / 2} ${c.y}A${b.width / 2} ${b.height / 2} 0 1 1 ${c.x + b.width / 2} ${c.y}Z`
        : `M${b.x} ${b.y}H${b.x + b.width}V${b.y + b.height}H${b.x}Z`;
  } else {
    path = shapePath(elementShapeId(e), e.parameters);
    matrix = multiplyMatrix(m, [e.width / 100, 0, 0, e.height / 100, e.x, e.y]);
  }
  return { path, matrix };
}
export function elementSegments(e: DiagramElement): Segment[] {
  const { path, matrix } = elementContour(e);
  const key = `${matrix.join(",")}:${path}`;
  let segments = cache.get(key);
  if (!segments) {
    segments = svgPathSegments(path, matrix);
    if (path.length < 20000) {
      cache.set(key, segments);
      if (cache.size > 256) cache.delete(cache.keys().next().value!);
    }
  }
  return segments;
}

/** Whether a marquee touches painted geometry, rather than just its bounding box. */
export function elementTouchesRect(e: DiagramElement, rect: Bounds): boolean {
  const box = worldBounds(e);
  if (!overlaps(box, rect)) return false;
  if (isPointElement(e)) return true;

  // These are area objects: a partial overlap with their visible frame counts.
  if (TEXT_TYPES.has(e.type) || e.type === "image" || e.type === "plot")
    return true;

  const contains = (p: Point) =>
    p.x >= rect.x - 1e-8 &&
    p.x <= rect.x + rect.width + 1e-8 &&
    p.y >= rect.y - 1e-8 &&
    p.y <= rect.y + rect.height + 1e-8;
  const edges: Segment[] = [
    [
      { x: rect.x, y: rect.y },
      { x: rect.x + rect.width, y: rect.y },
    ],
    [
      { x: rect.x + rect.width, y: rect.y },
      { x: rect.x + rect.width, y: rect.y + rect.height },
    ],
    [
      { x: rect.x + rect.width, y: rect.y + rect.height },
      { x: rect.x, y: rect.y + rect.height },
    ],
    [
      { x: rect.x, y: rect.y + rect.height },
      { x: rect.x, y: rect.y },
    ],
  ];
  return elementSegments(e).some(
    ([from, to]) =>
      contains(from) ||
      contains(to) ||
      edges.some((edge) => segmentIntersection([from, to], edge)),
  );
}
const cross = (a: Point, b: Point) => a.x * b.y - a.y * b.x;
const subtract = (a: Point, b: Point) => ({ x: a.x - b.x, y: a.y - b.y });
/** Shared endpoints count once; coincident runs have no isolated crossing. */
export function segmentIntersection(
  [a, b]: Segment,
  [c, d]: Segment,
): Point | null {
  const r = subtract(b, a),
    s = subtract(d, c),
    delta = subtract(c, a),
    den = cross(r, s);
  if (Math.abs(den) < 1e-10) {
    const onSegment = (p: Point, [u, v]: Segment) =>
      Math.abs(cross(subtract(p, u), subtract(v, u))) < 1e-8 &&
      p.x >= Math.min(u.x, v.x) - 1e-8 &&
      p.x <= Math.max(u.x, v.x) + 1e-8 &&
      p.y >= Math.min(u.y, v.y) - 1e-8 &&
      p.y <= Math.max(u.y, v.y) + 1e-8;
    const shared: Point[] = [];
    for (const p of [a, b, c, d])
      if (
        onSegment(p, [a, b]) &&
        onSegment(p, [c, d]) &&
        !shared.some((q) => Math.hypot(p.x - q.x, p.y - q.y) < 1e-8)
      )
        shared.push(p);
    return shared.length === 1 ? shared[0] : null;
  }
  const t = cross(delta, s) / den,
    u = cross(delta, r) / den;
  if (t < -1e-8 || t > 1 + 1e-8 || u < -1e-8 || u > 1 + 1e-8) return null;
  return { x: a.x + t * r.x, y: a.y + t * r.y };
}
function overlaps(a: Bounds, b: Bounds) {
  return (
    a.x <= b.x + b.width + 1e-8 &&
    a.x + a.width >= b.x - 1e-8 &&
    a.y <= b.y + b.height + 1e-8 &&
    a.y + a.height >= b.y - 1e-8
  );
}
type Ellipse = {
  element: DiagramElement;
  cx: number;
  cy: number;
  rx: number;
  ry: number;
};
function ellipseBoundary(e: DiagramElement): Ellipse | null {
  const id = elementShapeId(e);
  if (
    !(
      ["circle", "ellipse"].includes(id) ||
      (TEXT_TYPES.has(e.type) &&
        ["circle", "ellipse"].includes(e.textBorder ?? ""))
    )
  )
    return null;
  const b = sceneBounds(e);
  if (b.width < 1e-8 || b.height < 1e-8) return null;
  return {
    element: e,
    cx: b.x + b.width / 2,
    cy: b.y + b.height / 2,
    rx: b.width / 2,
    ry: b.height / 2,
  };
}
/** Solve in ellipse coordinates. Affine transforms retain the segment parameter. */
function ellipseSegment(ellipse: Ellipse, [p, q]: Segment): Point[] {
  const u = localPoint(p, ellipse.element),
    v = localPoint(q, ellipse.element);
  const x = (u.x - ellipse.cx) / ellipse.rx,
    y = (u.y - ellipse.cy) / ellipse.ry;
  const dx = (v.x - u.x) / ellipse.rx,
    dy = (v.y - u.y) / ellipse.ry;
  const a = dx * dx + dy * dy,
    b = 2 * (x * dx + y * dy),
    c = x * x + y * y - 1;
  if (a < 1e-20) return Math.abs(c) < 1e-10 ? [p] : [];
  let d = b * b - 4 * a * c;
  const epsilon = 1e-12 * Math.max(b * b, Math.abs(4 * a * c), 1e-12);
  if (d < -epsilon) return [];
  if (Math.abs(d) <= epsilon) d = 0;
  return [
    ...new Set([
      (-b - Math.sqrt(Math.max(0, d))) / (2 * a),
      (-b + Math.sqrt(Math.max(0, d))) / (2 * a),
    ]),
  ]
    .filter((t) => t >= -1e-8 && t <= 1 + 1e-8)
    .map((t) => ({ x: p.x + t * (q.x - p.x), y: p.y + t * (q.y - p.y) }));
}
function worldCircle(ellipse: Ellipse): { center: Point; r: number } | null {
  if (
    Math.abs(ellipse.rx - ellipse.ry) > 1e-8 ||
    Math.abs(ellipse.element.skewX ?? 0) > 1e-8
  )
    return null;
  return {
    center: worldPoint({ x: ellipse.cx, y: ellipse.cy }, ellipse.element),
    r: ellipse.rx,
  };
}
function circleCircle(
  a: { center: Point; r: number },
  b: { center: Point; r: number },
): Point[] {
  const delta = subtract(b.center, a.center),
    d = Math.hypot(delta.x, delta.y);
  if (d < 1e-9 || d > a.r + b.r + 1e-8 || d < Math.abs(a.r - b.r) - 1e-8)
    return [];
  const along = (a.r * a.r - b.r * b.r + d * d) / (2 * d),
    h = Math.sqrt(Math.max(0, a.r * a.r - along * along));
  const x = a.center.x + (along * delta.x) / d,
    y = a.center.y + (along * delta.y) / d;
  return h < 1e-7
    ? [{ x, y }]
    : [
        { x: x - (h * delta.y) / d, y: y + (h * delta.x) / d },
        { x: x + (h * delta.y) / d, y: y - (h * delta.x) / d },
      ];
}
export function contourIntersections(
  a: DiagramElement,
  b: DiagramElement,
): Point[] {
  const ea = ellipseBoundary(a),
    eb = ellipseBoundary(b);
  const ca = ea && worldCircle(ea),
    cb = eb && worldCircle(eb);
  if (ca && cb) return circleCircle(ca, cb);
  if (ea)
    return elementSegments(b).flatMap((segment) => ellipseSegment(ea, segment));
  if (eb)
    return elementSegments(a).flatMap((segment) => ellipseSegment(eb, segment));
  const result: Point[] = [],
    segments = elementSegments(b).map((s) => ({ s, b: segBox(s) }));
  for (const s of elementSegments(a)) {
    const box = segBox(s);
    for (const n of segments) {
      if (!overlaps(box, n.b)) continue;
      const p = segmentIntersection(s, n.s);
      if (p) result.push(p);
    }
  }
  return result;
}
function segBox([a, b]: Segment): Bounds {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    width: Math.abs(a.x - b.x),
    height: Math.abs(a.y - b.y),
  };
}
function inBreak(p: Point, e: DiagramElement) {
  if (!LINE_TYPES.has(e.type) || !e.breakSize) return false;
  const t = (e.breakPosition ?? 50) / 100;
  const mid = worldPoint(
    isCurve(e)
      ? curvePoint(e, t)
      : { x: e.x + e.width * t, y: e.y + e.height * t },
    e,
  );
  return Math.hypot(p.x - mid.x, p.y - mid.y) < e.breakSize / 2;
}
/** Intersection follows actual transformed contours; blocking takes precedence.
 * Image/text/plot objects participate through their frame. Point objects are
 * snap anchors only and intentionally do not create geometric intersections. */
export function collectIntersections(
  elements: DiagramElement[],
): IntersectionMark[] {
  if (!elements.some((e) => e.intersection && !e.blockIntersection)) return [];
  const entries = elements
    .filter((e) => !isPointElement(e) && !e.blockIntersection && e.style.opacity > 0)
    .map((e, index) => ({ e, index, b: worldBounds(e) }))
    .sort((a, b) => a.b.x - b.b.x);
  const marks: IntersectionMark[] = [];
  for (let i = 0; i < entries.length; i++) {
    const a = entries[i];
    for (let j = i + 1; j < entries.length; j++) {
      const b = entries[j];
      if (b.b.x > a.b.x + a.b.width + 1e-8) break;
      const fromA = wantsIntersection(a.e, b.e),
        fromB = wantsIntersection(b.e, a.e);
      if (!(fromA || fromB) || !overlaps(a.b, b.b)) continue;
      const owner = fromA && (!fromB || a.index > b.index) ? a.e : b.e;
      const pair: Point[] = [];
      for (const p of contourIntersections(a.e, b.e)) {
        if (
          !p ||
          inBreak(p, a.e) ||
          inBreak(p, b.e) ||
          pair.some((q) => Math.hypot(q.x - p.x, q.y - p.y) < 0.15)
        )
          continue;
        pair.push(p);
        if (
          !marks.some(
            (m) => Math.hypot(m.point.x - p.x, m.point.y - p.y) < 0.15,
          )
        )
          marks.push({ point: p, owner, ids: [a.e.id, b.e.id] });
      }
    }
  }
  return marks;
}