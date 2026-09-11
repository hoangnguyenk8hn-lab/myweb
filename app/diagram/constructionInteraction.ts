import type { DiagramElement, Point } from "./types";
import type {
  ConstructionBranchSelector,
  PointOnObjectConstruction,
} from "./constructionTypes";
import {
  evaluateIntersectionConstruction,
  evaluateLineThroughPointsConstruction,
  evaluateTangentConstruction,
  evaluateTangentPointConstruction,
  projectPointConstraint,
} from "./constructionGeometry";
import { contourIntersections } from "./intersections";
import { tangentCandidates } from "./tangents";

const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

/**
 * Explicitly turn a Point into a constrained Point-on-Object relation. Merely
 * snapping a pointer never calls this function; the interaction/tool decides
 * when a snap should become a persistent constraint.
 */
export function constrainPointToObject(
  pointElement: DiagramElement,
  target: DiagramElement,
  pointer: Point,
  maxDistance = Infinity,
): DiagramElement | null {
  const projected = projectPointConstraint(pointer, target);
  if (!projected || projected.distance > maxDistance) return null;
  const construction: PointOnObjectConstruction = {
    mode: "constrained",
    kind: "point-on-object",
    parents: [target.id],
    locator: projected.locator,
  };
  return {
    ...pointElement,
    construction,
    x: projected.point.x,
    y: projected.point.y,
    width: 0,
    height: 0,
  };
}

/** Dragging a constrained point changes only its locator on the same parent. */
export function updatePointConstraintFromPointer(
  pointElement: DiagramElement,
  target: DiagramElement,
  pointer: Point,
): DiagramElement | null {
  if (
    pointElement.construction?.mode !== "constrained" ||
    pointElement.construction.kind !== "point-on-object" ||
    pointElement.construction.parents[0] !== target.id
  )
    return null;
  return constrainPointToObject(pointElement, target, pointer);
}

function branchSelector(points: Point[], near: Point): ConstructionBranchSelector | null {
  if (!points.length) return null;
  let branch = 0;
  for (let i = 1; i < points.length; i++)
    if (distance(points[i], near) < distance(points[branch], near)) branch = i;
  return { branch, seed: points[branch] };
}

/** Materialize one currently visible crossing as a Derived Point. */
export function deriveIntersectionPoint(
  pointElement: DiagramElement,
  a: DiagramElement,
  b: DiagramElement,
  near: Point,
): DiagramElement | null {
  const intersections = contourIntersections(a, b),
    selector = branchSelector(intersections, near);
  if (!selector) return null;
  const construction = {
    mode: "derived" as const,
    kind: "intersection" as const,
    parents: [a.id, b.id] as [string, string],
    selector,
  };
  const staged = { ...pointElement, construction },
    evaluated = evaluateIntersectionConstruction(staged, a, b, selector);
  return evaluated.ok ? evaluated.element : null;
}

/** Materialize a tangent as a Derived Line tied to a persistent Point + target. */
export function deriveTangentLine(
  lineElement: DiagramElement,
  sourcePoint: DiagramElement,
  target: DiagramElement,
  near: Point,
): DiagramElement | null {
  const candidates = tangentCandidates(
    { x: sourcePoint.x, y: sourcePoint.y },
    target,
  );
  if (!candidates.length) return null;
  let branch = 0;
  for (let i = 1; i < candidates.length; i++)
    if (
      distance(candidates[i].contact, near) <
      distance(candidates[branch].contact, near)
    )
      branch = i;
  const candidate = candidates[branch],
    selector: ConstructionBranchSelector = {
      branch,
      seed: candidate.contact,
    },
    construction = {
      mode: "derived" as const,
      kind: "tangent" as const,
      parents: [sourcePoint.id, target.id] as [string, string],
      selector,
      extent: candidate.throughSource ? ("line" as const) : ("segment" as const),
    },
    staged = { ...lineElement, construction },
    evaluated = evaluateTangentConstruction(
      staged,
      sourcePoint,
      target,
      selector,
      construction.extent,
    );
  return evaluated.ok ? evaluated.element : null;
}

/** Materialize a reusable tangent contact as a Derived Point. */
export function deriveTangentPoint(
  pointElement: DiagramElement,
  sourcePoint: DiagramElement,
  target: DiagramElement,
  near: Point,
): DiagramElement | null {
  const candidates = tangentCandidates(
    { x: sourcePoint.x, y: sourcePoint.y },
    target,
  );
  if (!candidates.length) return null;
  let branch = 0;
  for (let i = 1; i < candidates.length; i++)
    if (
      distance(candidates[i].contact, near) <
      distance(candidates[branch].contact, near)
    )
      branch = i;
  const selector: ConstructionBranchSelector = {
      branch,
      seed: candidates[branch].contact,
    },
    construction = {
      mode: "derived" as const,
      kind: "tangent-point" as const,
      parents: [sourcePoint.id, target.id] as [string, string],
      selector,
    },
    staged = { ...pointElement, construction },
    evaluated = evaluateTangentPointConstruction(
      staged,
      sourcePoint,
      target,
      selector,
    );
  return evaluated.ok ? evaluated.element : null;
}

/** Turn a drawn Line/Arrow into a reusable dependency on two Point objects. */
export function deriveLineThroughPoints(
  lineElement: DiagramElement,
  startPoint: DiagramElement,
  endPoint: DiagramElement,
): DiagramElement | null {
  if (startPoint.id === endPoint.id) return null;
  const construction = {
      mode: "derived" as const,
      kind: "line-through-points" as const,
      parents: [startPoint.id, endPoint.id] as [string, string],
    },
    staged = { ...lineElement, construction },
    evaluated = evaluateLineThroughPointsConstruction(
      staged,
      startPoint,
      endPoint,
    );
  return evaluated.ok ? evaluated.element : null;
}
