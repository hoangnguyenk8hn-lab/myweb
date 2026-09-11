import type {
  ConstructionBranchSelector,
  PointOnObjectLocator,
} from "./constructionTypes";
import type { DiagramElement, Point } from "./types";
import {
  absolutePoints,
  elementShapeId,
  isCurve,
  isPointElement,
  lineVertices,
  LINE_TYPES,
  localPoint,
  sceneBounds,
  TEXT_TYPES,
  worldPoint,
} from "./sceneGeometry";
import { contourIntersections } from "./intersections";
import { tangentCandidates, type TangentCandidate } from "./tangents";

export type ConstructionGeometryResult =
  | { ok: true; element: DiagramElement }
  | {
      ok: false;
      reason: "no-solution" | "unsupported" | "invalid-parameters";
      detail?: string;
    };

export type ProjectedPointConstraint = {
  locator: PointOnObjectLocator;
  point: Point;
  distance: number;
};

const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

function segmentProjection(point: Point, a: Point, b: Point) {
  const dx = b.x - a.x,
    dy = b.y - a.y,
    length2 = dx * dx + dy * dy,
    t = length2 < 1e-16
      ? 0
      : clamp01(((point.x - a.x) * dx + (point.y - a.y) * dy) / length2),
    projected = { x: a.x + dx * t, y: a.y + dy * t };
  return { t, point: projected, distance: distance(point, projected) };
}

function roundFrame(target: DiagramElement) {
  const shape = elementShapeId(target),
    bordered =
      TEXT_TYPES.has(target.type) &&
      ["circle", "ellipse"].includes(target.textBorder ?? "");
  if (!["circle", "ellipse"].includes(shape) && !bordered) return null;
  const b = sceneBounds(target),
    rx = b.width / 2,
    ry = b.height / 2;
  if (rx < 1e-8 || ry < 1e-8) return null;
  return { cx: b.x + rx, cy: b.y + ry, rx, ry };
}

/**
 * Project a pointer onto geometry that currently supports persistent point
 * constraints. This is interaction-facing geometry only; it does not mutate a
 * document and does not create a dependency by itself.
 */
export function projectPointConstraint(
  point: Point,
  target: DiagramElement,
): ProjectedPointConstraint | null {
  const round = roundFrame(target);
  if (round) {
    const local = localPoint(point, target),
      nx = (local.x - round.cx) / round.rx,
      ny = (local.y - round.cy) / round.ry,
      angle = Math.atan2(ny, nx),
      projected = worldPoint(
        {
          x: round.cx + round.rx * Math.cos(angle),
          y: round.cy + round.ry * Math.sin(angle),
        },
        target,
      );
    return {
      locator: { kind: "circle", angle },
      point: projected,
      distance: distance(point, projected),
    };
  }

  let points: Point[] | null = null;
  if (LINE_TYPES.has(target.type) && !isCurve(target))
    points = lineVertices(target).map((p) => worldPoint(p, target));
  else if (target.type === "polyline")
    points = absolutePoints(target).map((p) => worldPoint(p, target));
  if (!points || points.length < 2) return null;

  let best: ProjectedPointConstraint | null = null;
  for (let segment = 0; segment < points.length - 1; segment++) {
    const projected = segmentProjection(point, points[segment], points[segment + 1]);
    if (!best || projected.distance < best.distance)
      best = {
        locator: { kind: "segment", segment, t: projected.t },
        point: projected.point,
        distance: projected.distance,
      };
  }
  return best;
}

export function evaluatePointOnObject(
  target: DiagramElement,
  locator: PointOnObjectLocator,
): Point | null {
  if (locator.kind === "circle") {
    const round = roundFrame(target);
    if (!round || !Number.isFinite(locator.angle)) return null;
    return worldPoint(
      {
        x: round.cx + round.rx * Math.cos(locator.angle),
        y: round.cy + round.ry * Math.sin(locator.angle),
      },
      target,
    );
  }

  if (locator.kind === "segment") {
    let points: Point[] | null = null;
    if (LINE_TYPES.has(target.type) && !isCurve(target))
      points = lineVertices(target).map((p) => worldPoint(p, target));
    else if (target.type === "polyline")
      points = absolutePoints(target).map((p) => worldPoint(p, target));
    if (!points || locator.segment < 0 || locator.segment >= points.length - 1)
      return null;
    const a = points[locator.segment],
      b = points[locator.segment + 1],
      t = clamp01(locator.t);
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
  }

  // Reserved for the generic curve adapter. Keeping the locator in the schema
  // lets us add it without changing the construction graph representation.
  return null;
}

export function pointCoordinate(element: DiagramElement): Point | null {
  return isPointElement(element)
    ? worldPoint({ x: element.x, y: element.y }, element)
    : null;
}

function selectPointBranch(
  points: Point[],
  selector: ConstructionBranchSelector,
): Point | null {
  if (!points.length) return null;
  if (selector.seed)
    return points.reduce((best, current) =>
      distance(current, selector.seed!) < distance(best, selector.seed!)
        ? current
        : best,
    );
  return points[Math.max(0, selector.branch) % points.length];
}

function selectTangentBranch(
  candidates: TangentCandidate[],
  selector: ConstructionBranchSelector,
): TangentCandidate | null {
  if (!candidates.length) return null;
  if (selector.seed)
    return candidates.reduce((best, current) =>
      distance(current.contact, selector.seed!) <
      distance(best.contact, selector.seed!)
        ? current
        : best,
    );
  return candidates[Math.max(0, selector.branch) % candidates.length];
}

export function evaluatePointConstraint(
  element: DiagramElement,
  target: DiagramElement,
  locator: PointOnObjectLocator,
): ConstructionGeometryResult {
  if (!isPointElement(element))
    return {
      ok: false,
      reason: "unsupported",
      detail: "point-on-object requires a Point element",
    };
  const point = evaluatePointOnObject(target, locator);
  if (!point)
    return { ok: false, reason: "unsupported", detail: "Unsupported point locator" };
  return {
    ok: true,
    element: { ...element, x: point.x, y: point.y, width: 0, height: 0 },
  };
}

export function evaluateIntersectionConstruction(
  element: DiagramElement,
  a: DiagramElement,
  b: DiagramElement,
  selector: ConstructionBranchSelector,
): ConstructionGeometryResult {
  if (!isPointElement(element))
    return {
      ok: false,
      reason: "unsupported",
      detail: "intersection requires a Point element",
    };
  const point = selectPointBranch(contourIntersections(a, b), selector);
  if (!point) return { ok: false, reason: "no-solution" };
  return {
    ok: true,
    element: { ...element, x: point.x, y: point.y, width: 0, height: 0 },
  };
}

export function evaluateTangentConstruction(
  element: DiagramElement,
  source: DiagramElement,
  target: DiagramElement,
  selector: ConstructionBranchSelector,
  extent: "segment" | "line" = "segment",
): ConstructionGeometryResult {
  if (element.type !== "line")
    return {
      ok: false,
      reason: "unsupported",
      detail: "tangent construction requires a Line element",
    };
  const sourcePoint = pointCoordinate(source);
  if (!sourcePoint)
    return {
      ok: false,
      reason: "unsupported",
      detail: "tangent source must be a Point element",
    };
  const candidate = selectTangentBranch(
    tangentCandidates(sourcePoint, target),
    selector,
  );
  if (!candidate) return { ok: false, reason: "no-solution" };

  let start = sourcePoint,
    end = candidate.contact;
  if (candidate.throughSource || extent === "line") {
    end = candidate.end;
    start = {
      x: 2 * sourcePoint.x - end.x,
      y: 2 * sourcePoint.y - end.y,
    };
  }
  return {
    ok: true,
    element: {
      ...element,
      x: start.x,
      y: start.y,
      width: end.x - start.x,
      height: end.y - start.y,
      points: undefined,
      control1: undefined,
      control2: undefined,
    },
  };
}
