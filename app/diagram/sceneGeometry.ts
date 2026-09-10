import type { DiagramDocument, DiagramElement, Point } from "./types";
import { FIXED_ASPECT_SHAPES, shapePath } from "./shapes";
import {
  boxCorners,
  IDENTITY,
  multiplyMatrix,
  pointBounds,
  svgPathBounds,
  transformPoint,
  type Bounds,
  type Matrix,
} from "./pathBounds";
export const LINE_TYPES = new Set(["line", "arrow", "curve", "curved-arrow"]);
export const TEXT_TYPES = new Set(["text", "plain-text", "boxed-text"]);
export const isCurve = (e: DiagramElement) =>
  ["curve", "curved-arrow"].includes(e.type);
/** Symbol geometry uses a 10-unit tile; Size controls its nominal stroke in px. */
export function markerDimension(
  e: DiagramElement,
  position: "start" | "end" | "mid",
) {
  const size =
    e[
      position === "start"
        ? "startMarkerSize"
        : position === "end"
          ? "endMarkerSize"
          : "midMarkerSize"
    ];
  return size === undefined
    ? (e.markerSize ?? 9)
    : Math.max(0.1, Math.min(2, size)) * 10;
}
export const center = (e: DiagramElement) => ({
  x: e.x + e.width / 2,
  y: e.y + e.height / 2,
});
export const absolutePoints = (e: DiagramElement) =>
  (
    e.points ?? [
      { x: 0, y: 0 },
      { x: 1, y: 1 },
    ]
  ).map((p) => ({ x: e.x + p.x * e.width, y: e.y + p.y * e.height }));
export const lineVertices = (e: DiagramElement): Point[] =>
  e.points && e.points.length >= 2
    ? absolutePoints(e)
    : [
        { x: e.x, y: e.y },
        { x: e.x + e.width, y: e.y + e.height },
      ];
export function curveControls(e: DiagramElement): [Point, Point] {
  return [
    e.control1 ?? {
      x: e.width * 0.3,
      y: e.height * 0.3 - Math.max(35, Math.abs(e.width) * 0.3),
    },
    e.control2 ?? {
      x: e.width * 0.7,
      y: e.height * 0.7 - Math.max(35, Math.abs(e.width) * 0.3),
    },
  ];
}
export function curvePoint(e: DiagramElement, t: number): Point {
  const [a, b] = curveControls(e);
  const u = 1 - t;
  return {
    x: e.x + 3 * u * u * t * a.x + 3 * u * t * t * b.x + t * t * t * e.width,
    y: e.y + 3 * u * u * t * a.y + 3 * u * t * t * b.y + t * t * t * e.height,
  };
}

/** Move an endpoint with its tangent handle; the opposite tangent stays put.
 * Controls are stored relative to the start, so moving the start also rebases
 * the far handle. Compensate the pivot to preserve rotated/skewed geometry. */
export function moveLineEndpoint(
  e: DiagramElement,
  index: number,
  target: Point,
): DiagramElement {
  if (e.points && e.points.length >= 2)
    return moveLineVertex(e, index ? e.points.length - 1 : 0, target);
  const point = localPoint(target, e);
  const dx = point.x - e.x - (index ? e.width : 0);
  const dy = point.y - e.y - (index ? e.height : 0);
  const [a, b] = curveControls(e);
  const next =
    index === 0
      ? {
          ...e,
          x: e.x + dx,
          y: e.y + dy,
          width: e.width - dx,
          height: e.height - dy,
          fromId: undefined,
        }
      : { ...e, width: e.width + dx, height: e.height + dy, toId: undefined };
  if (isCurve(e)) {
    next.control1 = { ...a };
    next.control2 = {
      x: b.x + (index ? dx : -dx),
      y: b.y + (index ? dy : -dy),
    };
  }
  const pivot = center(next),
    placed = worldPoint(pivot, e);
  next.x += placed.x - pivot.x;
  next.y += placed.y - pivot.y;
  return next;
}

function fitLineVertices(e: DiagramElement, points: Point[]): DiagramElement {
  const [a, b] = curveControls(e),
    control1 = { x: e.x + a.x, y: e.y + a.y },
    control2 = { x: e.x + b.x, y: e.y + b.y },
    bounds = pointBounds(points),
    width = Math.max(0.01, bounds.width),
    height = Math.max(0.01, bounds.height);
  const next: DiagramElement = {
    ...e,
    ...bounds,
    width,
    height,
    points: points.map((p) => ({
      x: (p.x - bounds.x) / width,
      y: (p.y - bounds.y) / height,
    })),
    ...(isCurve(e)
      ? {
          control1: { x: control1.x - bounds.x, y: control1.y - bounds.y },
          control2: { x: control2.x - bounds.x, y: control2.y - bounds.y },
        }
      : {}),
  };
  const pivot = center(next),
    placed = worldPoint(pivot, e);
  next.x += placed.x - pivot.x;
  next.y += placed.y - pivot.y;
  return next;
}

function curveSegmentControls(points: Point[], index: number): [Point, Point] {
  const p0 = points[Math.max(0, index - 1)],
    p1 = points[index],
    p2 = points[index + 1],
    p3 = points[Math.min(points.length - 1, index + 2)];
  return [
    { x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6 },
    { x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6 },
  ];
}

export function lineSegmentPoint(
  e: DiagramElement,
  index: number,
  t: number,
): Point {
  const points = lineVertices(e),
    a = points[index],
    d = points[index + 1];
  if (isCurve(e) && !e.points) return curvePoint(e, t);
  if (!isCurve(e))
    return { x: a.x + (d.x - a.x) * t, y: a.y + (d.y - a.y) * t };
  const [b, c] =
      e.points?.length === 2
        ? (curveControls(e).map((p) => ({ x: e.x + p.x, y: e.y + p.y })) as [
            Point,
            Point,
          ])
        : curveSegmentControls(points, index),
    u = 1 - t;
  return {
    x:
      u * u * u * a.x +
      3 * u * u * t * b.x +
      3 * u * t * t * c.x +
      t * t * t * d.x,
    y:
      u * u * u * a.y +
      3 * u * u * t * b.y +
      3 * u * t * t * c.y +
      t * t * t * d.y,
  };
}

export function linePoint(e: DiagramElement, t: number): Point {
  if (isCurve(e) && !e.points) return curvePoint(e, t);
  const count = lineVertices(e).length - 1,
    scaled = Math.max(0, Math.min(1, t)) * count,
    index = Math.min(count - 1, Math.floor(scaled));
  return lineSegmentPoint(e, index, scaled - index);
}

export function addLineVertex(
  e: DiagramElement,
  segment: number,
): DiagramElement {
  const points = lineVertices(e),
    point = lineSegmentPoint(e, segment, 0.5);
  points.splice(segment + 1, 0, point);
  return fitLineVertices(e, points);
}

export function moveLineVertex(
  e: DiagramElement,
  index: number,
  target: Point,
): DiagramElement {
  const points = lineVertices(e);
  if (index < 0 || index >= points.length) return e;
  const point = localPoint(target, e),
    dx = point.x - points[index].x,
    dy = point.y - points[index].y;
  points[index] = point;
  let staged = e;
  if (isCurve(e) && (index === 0 || index === points.length - 1)) {
    const [a, b] = curveControls(e);
    staged =
      index === 0
        ? { ...e, control1: { x: a.x + dx, y: a.y + dy }, control2: b }
        : { ...e, control1: a, control2: { x: b.x + dx, y: b.y + dy } };
  }
  const next = fitLineVertices(staged, points);
  if (index === 0) next.fromId = undefined;
  if (index === points.length - 1) next.toId = undefined;
  return next;
}

export function removeLineVertex(
  e: DiagramElement,
  index: number,
): DiagramElement {
  const points = lineVertices(e);
  if (points.length <= 2 || index < 0 || index >= points.length) return e;
  let staged = e;
  if (isCurve(e) && (index === 0 || index === points.length - 1)) {
    const replacement = index === 0 ? points[1] : points[points.length - 2],
      removed = points[index],
      dx = replacement.x - removed.x,
      dy = replacement.y - removed.y,
      [a, b] = curveControls(e);
    staged =
      index === 0
        ? { ...e, control1: { x: a.x + dx, y: a.y + dy }, control2: b }
        : { ...e, control1: a, control2: { x: b.x + dx, y: b.y + dy } };
  }
  points.splice(index, 1);
  const next = fitLineVertices(staged, points);
  if (index === 0) next.fromId = undefined;
  if (index === points.length) next.toId = undefined;
  return next;
}

/** Rebase a polygon after moving a vertex without moving its transformed neighbours. */
export function movePolygonPoint(
  e: DiagramElement,
  index: number,
  target: Point,
): DiagramElement {
  const points = absolutePoints(e);
  if (index < 0 || index >= points.length) return e;
  points[index] = localPoint(target, e);
  const bounds = pointBounds(points),
    width = Math.max(0.01, bounds.width),
    height = Math.max(0.01, bounds.height);
  const next = {
    ...e,
    ...bounds,
    width,
    height,
    points: points.map((p) => ({
      x: (p.x - bounds.x) / width,
      y: (p.y - bounds.y) / height,
    })),
  };
  const pivot = center(next),
    placed = worldPoint(pivot, e);
  next.x += placed.x - pivot.x;
  next.y += placed.y - pivot.y;
  return next;
}

/** Fit the painted geometry to a drag rectangle. The initial visible corner
 * remains fixed even when the canonical palette path contains whitespace. */
export function drawElement(
  e: DiagramElement,
  start: Point,
  end: Point,
  square = false,
): DiagramElement {
  let dx = end.x - start.x,
    dy = end.y - start.y;
  if (LINE_TYPES.has(e.type)) {
    if (square) {
      const r = Math.hypot(dx, dy),
        a = (Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * Math.PI) / 4;
      dx = Math.cos(a) * r;
      dy = Math.sin(a) * r;
    }
    return { ...e, ...start, width: dx, height: dy };
  }
  const base = {
    ...e,
    x: 0,
    y: 0,
    width: 100,
    height: 100,
    rotation: 0,
    skewX: 0,
  };
  const b = sceneBounds(base);
  let sx = Math.max(0.01, Math.abs(dx)) / Math.max(b.width, 0.01);
  let sy = Math.max(0.01, Math.abs(dy)) / Math.max(b.height, 0.01);
  if (square || FIXED_ASPECT_SHAPES.has(elementShapeId(e)))
    sx = sy = Math.max(sx, sy);
  return {
    ...base,
    x: start.x - (dx < 0 ? b.x + b.width : b.x) * sx,
    y: start.y - (dy < 0 ? b.y + b.height : b.y) * sy,
    width: 100 * sx,
    height: 100 * sy,
  };
}
export function linePath(e: DiagramElement) {
  if (e.points && e.points.length >= 2) {
    const points = lineVertices(e);
    if (isCurve(e) && points.length === 2) {
      const [a, b] = curveControls(e);
      return `M${points[0].x} ${points[0].y}C${e.x + a.x} ${e.y + a.y} ${e.x + b.x} ${e.y + b.y} ${points[1].x} ${points[1].y}`;
    }
    return isCurve(e)
      ? polycurvePath(points, false)
      : points.map((p, i) => `${i ? "L" : "M"}${p.x} ${p.y}`).join(" ");
  }
  if (isCurve(e)) {
    const [a, b] = curveControls(e);
    return `M${e.x} ${e.y}C${e.x + a.x} ${e.y + a.y} ${e.x + b.x} ${e.y + b.y} ${e.x + e.width} ${e.y + e.height}`;
  }
  const p = absolutePoints(e);
  return p.map((p, i) => `${i ? "L" : "M"}${p.x} ${p.y}`).join(" ");
}
export function resolveElement(
  e: DiagramElement,
  doc: DiagramDocument,
): DiagramElement {
  if (!e.fromId && !e.toId) return e;
  const from = doc.elements.find((n) => n.id === e.fromId),
    to = doc.elements.find((n) => n.id === e.toId);
  let start = from ? center(from) : { x: e.x, y: e.y },
    end = to ? center(to) : { x: e.x + e.width, y: e.y + e.height };
  const anchor = (node: DiagramElement, towards: Point) => {
    const c = center(node);
    const dx = towards.x - c.x,
      dy = towards.y - c.y;
    const pad = TEXT_TYPES.has(node.type) ? 4 : 1;
    const k =
      1 /
      Math.max(
        Math.abs(dx) / (Math.abs(node.width) / 2 + pad),
        Math.abs(dy) / (Math.abs(node.height) / 2 + pad),
        0.0001,
      );
    return { x: c.x + dx * k, y: c.y + dy * k };
  };
  const originalStart = start;
  if (from) start = anchor(from, end);
  if (to) end = anchor(to, originalStart);
  let next = e;
  if (from) next = moveLineEndpoint(next, 0, start);
  if (to) next = moveLineEndpoint(next, 1, end);
  return { ...next, fromId: e.fromId, toId: e.toId };
}
export function elementShapeId(e: DiagramElement) {
  return (
    e.shape ??
    (e.type === "polygon"
      ? "hexagon"
      : e.type === "arrow-head"
        ? "right-arrow"
        : e.type === "double-arrow-head"
          ? "left-right-arrow"
          : e.type)
  );
}
/** The renderer, hit area and selection share one transform and one pivot. */
export function elementMatrix(e: DiagramElement): Matrix {
  const c = center(e),
    angle = (e.rotation * Math.PI) / 180,
    k = Math.tan(((e.skewX ?? 0) * Math.PI) / 180);
  const a = Math.cos(angle),
    b = Math.sin(angle),
    x = a * k - b,
    y = b * k + a;
  return [a, b, x, y, c.x - a * c.x - x * c.y, c.y - b * c.x - y * c.y];
}
export function elementTransform(e: DiagramElement) {
  return `matrix(${elementMatrix(e).join(" ")})`;
}
export function worldPoint(p: Point, e: DiagramElement) {
  return transformPoint(p, elementMatrix(e));
}

function geometryBounds(e: DiagramElement, transform: Matrix): Bounds {
  if (LINE_TYPES.has(e.type)) return svgPathBounds(linePath(e), transform);
  if (["polyline", "polycurve", "freehand"].includes(e.type)) {
    const points = absolutePoints(e);
    if (e.type === "polycurve")
      return svgPathBounds(polycurvePath(points), transform);
    return pointBounds(points.map((p) => transformPoint(p, transform)));
  }
  if (TEXT_TYPES.has(e.type) || e.type === "image" || e.type === "plot") {
    const c = center(e),
      circle = e.textBorder === "circle",
      width = circle
        ? Math.max(Math.abs(e.width), Math.abs(e.height))
        : Math.abs(e.width),
      height = circle ? width : Math.abs(e.height);
    return pointBounds(
      boxCorners({
        x: c.x - width / 2,
        y: c.y - height / 2,
        width,
        height,
      }).map((p) => transformPoint(p, transform)),
    );
  }
  // Palette paths have intentional whitespace. Measure the path after scaling,
  // rather than treating the whole 100×100 icon tile as the painted shape.
  const placement: Matrix = [e.width / 100, 0, 0, e.height / 100, e.x, e.y];
  return svgPathBounds(
    shapePath(elementShapeId(e), e.parameters),
    multiplyMatrix(transform, placement),
  );
}
/** Bounds in the element's unrotated coordinate system (single selection). */
export function sceneBounds(e: DiagramElement): Bounds {
  return geometryBounds(e, IDENTITY);
}
/** Axis-aligned canvas bounds after rotation/skew (groups and marquee). */
export function worldBounds(e: DiagramElement): Bounds {
  return geometryBounds(e, elementMatrix(e));
}

/** Resize the visible bounds without changing the existing SVG coordinate model.
 * A single shape keeps the opposite handle fixed in its own coordinate system.
 * A group is scaled in canvas coordinates, including rotated/skewed members. */
export function resizeElements(
  elements: DiagramElement[],
  from: Bounds,
  to: Bounds,
  local = elements.length === 1,
): DiagramElement[] {
  const sx = to.width / Math.max(from.width, 1e-8),
    sy = to.height / Math.max(from.height, 1e-8);
  return elements.map((e) => {
    let scaleX = sx,
      scaleY = sy,
      next: DiagramElement;
    if (local) {
      next = {
        ...e,
        x: to.x + (e.x - from.x) * sx,
        y: to.y + (e.y - from.y) * sy,
        width: e.width * sx,
        height: e.height * sy,
      };
      const pivot = center(next),
        placed = worldPoint(pivot, e);
      next.x += placed.x - pivot.x;
      next.y += placed.y - pivot.y;
    } else {
      const [a, b, c, d] = elementMatrix(e),
        angle = Math.atan2(sy * b, sx * a);
      scaleX = Math.hypot(sx * a, sy * b);
      scaleY = (sx * sy) / scaleX;
      const skew =
          (Math.cos(angle) * sx * c + Math.sin(angle) * sy * d) / scaleY,
        pivot = center(e);
      next = {
        ...e,
        width: e.width * scaleX,
        height: e.height * scaleY,
        rotation: (angle * 180) / Math.PI,
        skewX: (Math.atan(skew) * 180) / Math.PI,
        x: to.x + (pivot.x - from.x) * sx - (e.width * scaleX) / 2,
        y: to.y + (pivot.y - from.y) * sy - (e.height * scaleY) / 2,
      };
    }
    const controls = isCurve(e) ? curveControls(e) : [e.control1, e.control2];
    if (controls[0])
      next.control1 = { x: controls[0].x * scaleX, y: controls[0].y * scaleY };
    if (controls[1])
      next.control2 = { x: controls[1].x * scaleX, y: controls[1].y * scaleY };
    return next;
  });
}
export function within(p: Point, e: DiagramElement, padding = 0) {
  const b = sceneBounds(e);
  return (
    p.x >= b.x - padding &&
    p.x <= b.x + b.width + padding &&
    p.y >= b.y - padding &&
    p.y <= b.y + b.height + padding
  );
}
export function localPoint(p: Point, e: DiagramElement) {
  const c = center(e),
    a = (-e.rotation * Math.PI) / 180;
  const dx = p.x - c.x,
    dy = p.y - c.y;
  const ry = dx * Math.sin(a) + dy * Math.cos(a);
  return {
    x:
      c.x +
      dx * Math.cos(a) -
      dy * Math.sin(a) -
      Math.tan(((e.skewX ?? 0) * Math.PI) / 180) * ry,
    y: c.y + ry,
  };
}
export function polycurvePath(points: Point[], closed = true) {
  if (points.length < 3)
    return points.map((p, i) => `${i ? "L" : "M"}${p.x} ${p.y}`).join(" ");
  let d = `M${points[0].x} ${points[0].y}`;
  for (let i = 0; i < (closed ? points.length : points.length - 1); i++) {
    const p0 = closed
        ? points[(i - 1 + points.length) % points.length]
        : points[Math.max(0, i - 1)],
      p1 = points[i],
      p2 = closed ? points[(i + 1) % points.length] : points[i + 1],
      p3 = closed
        ? points[(i + 2) % points.length]
        : points[Math.min(points.length - 1, i + 2)];
    d += `C${p1.x + (p2.x - p0.x) / 6} ${p1.y + (p2.y - p0.y) / 6} ${p2.x - (p3.x - p1.x) / 6} ${p2.y - (p3.y - p1.y) / 6} ${p2.x} ${p2.y}`;
  }
  return d + (closed ? "Z" : "");
}
