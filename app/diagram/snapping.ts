import type { DiagramElement, GridSettings, Point } from "./types";
import {
  absolutePoints,
  center,
  elementShapeId,
  isPointElement,
  LINE_TYPES,
  pointRadius,
  worldBounds,
  worldPoint,
} from "./sceneGeometry";
import { svgPathAnchors } from "./pathBounds";
import {
  elementContour,
  intersectionAppearance,
  type IntersectionMark,
} from "./intersections";

export type SnapTarget = {
  point: Point;
  kind:
    | "point"
    | "endpoint"
    | "midpoint"
    | "vertex"
    | "center"
    | "quadrant"
    | "intersection";
  ids: string[];
  radius?: number;
};
export const SNAP_LABELS: Record<SnapTarget["kind"], string> = {
  point: "Điểm",
  endpoint: "Đầu mút",
  midpoint: "Trung điểm",
  vertex: "Đỉnh",
  center: "Tâm",
  quadrant: "Điểm trên đường tròn",
  intersection: "Giao điểm",
};
const cache = new Map<string, Omit<SnapTarget, "ids">[]>();

export function objectSnapTargets(e: DiagramElement): SnapTarget[] {
  if (isPointElement(e))
    return [
      {
        point: worldPoint({ x: e.x, y: e.y }, e),
        kind: "point",
        ids: [e.id],
        radius: pointRadius(e),
      },
    ];
  if (e.type === "freehand") {
    const points = absolutePoints(e).map((p) => worldPoint(p, e));
    if (!points.length) return [];
    const lengths = points
      .slice(1)
      .map((p, i) => Math.hypot(p.x - points[i].x, p.y - points[i].y));
    let distance = lengths.reduce((sum, n) => sum + n, 0) / 2;
    let mid = points[0];
    for (let i = 0; i < lengths.length; i++) {
      if (distance <= lengths[i]) {
        const t = distance / (lengths[i] || 1);
        mid = {
          x: points[i].x + (points[i + 1].x - points[i].x) * t,
          y: points[i].y + (points[i + 1].y - points[i].y) * t,
        };
        break;
      }
      distance -= lengths[i];
    }
    return [
      { point: points[0], kind: "endpoint", ids: [e.id] },
      { point: mid, kind: "midpoint", ids: [e.id] },
      { point: points[points.length - 1], kind: "endpoint", ids: [e.id] },
    ];
  }
  const { path, matrix } = elementContour(e);
  const round =
    ["circle", "ellipse"].includes(elementShapeId(e)) ||
    ["circle", "ellipse"].includes(e.textBorder ?? "");
  const key = `${matrix.join(",")}:${round}:${path}`;
  let anchors = cache.get(key);
  if (!anchors) {
    anchors = svgPathAnchors(path, matrix).map((anchor) => ({
      ...anchor,
      kind: round ? "quadrant" : anchor.kind,
    }));
    if (path.length < 20000) {
      cache.set(key, anchors);
      if (cache.size > 256) cache.delete(cache.keys().next().value!);
    }
  }
  const targets: SnapTarget[] = anchors.map((anchor) => ({
    ...anchor,
    ids: [e.id],
  }));
  if (!LINE_TYPES.has(e.type) && !["polyline", "polycurve"].includes(e.type))
    targets.push({
      point: worldPoint(center(e), e),
      kind: "center",
      ids: [e.id],
    });
  return targets;
}

export function collectSnapTargets(
  elements: DiagramElement[],
  marks: IntersectionMark[],
): SnapTarget[] {
  return [
    ...elements.flatMap(objectSnapTargets),
    ...marks.map((mark) => ({
      point: mark.point,
      kind: "intersection" as const,
      ids: [...mark.ids],
      radius: intersectionAppearance(mark.owner).radius,
    })),
  ];
}

/** Hit tolerance is measured in screen pixels; a target always supplies both coordinates. */
export function nearestSnapTarget(
  point: Point,
  targets: SnapTarget[],
  excluded: string[] = [],
  zoom = 1,
  ownIntersectionId?: string,
): SnapTarget | null {
  let closest: SnapTarget | null = null,
    best = Infinity;
  for (const target of targets) {
    if (
      target.ids.some(
        (id) =>
          excluded.includes(id) &&
          !(target.kind === "intersection" && id === ownIntersectionId),
      )
    )
      continue;
    const distance = Math.hypot(
      point.x - target.point.x,
      point.y - target.point.y,
    );
    const radius = Math.max(7 / zoom, (target.radius ?? 0) + 2 / zoom);
    if (
      distance <= radius &&
      (distance < best - 1e-8 ||
        (Math.abs(distance - best) < 1e-8 && target.kind === "intersection"))
    ) {
      closest = target;
      best = distance;
    }
  }
  return closest;
}

export type SceneSnapResult = {
  point: Point;
  target: SnapTarget | null;
  guides: { x?: number; y?: number };
};

/**
 * The one source of truth for grid, object-frame and anchor snapping. Canvas
 * gestures may choose a different target list, but they never reimplement the
 * precedence or tolerance rules.
 */
export function snapPointToScene(
  point: Point,
  options: {
    grid: GridSettings;
    gridEnabled?: boolean;
    elements: DiagramElement[];
    targets: SnapTarget[];
    excluded?: string[];
    zoom?: number;
    ownIntersectionId?: string;
  },
): SceneSnapResult {
  const {
    grid,
    elements,
    targets,
    excluded = [],
    zoom = 1,
    ownIntersectionId,
  } = options;
  const gridEnabled = options.gridEnabled ?? grid.snap;
  let x = gridEnabled ? Math.round(point.x / grid.size) * grid.size : point.x;
  let y = gridEnabled ? Math.round(point.y / grid.size) * grid.size : point.y;
  const guides: { x?: number; y?: number } = {};

  if (grid.snapShapes) {
    let dx = 6 / Math.max(zoom, 1e-6);
    let dy = 6 / Math.max(zoom, 1e-6);
    for (const element of elements) {
      if (excluded.includes(element.id) || LINE_TYPES.has(element.type)) continue;
      const box = worldBounds(element);
      for (const value of [box.x, box.x + box.width / 2, box.x + box.width]) {
        const distance = Math.abs(point.x - value);
        if (distance < dx) {
          dx = distance;
          x = value;
          guides.x = value;
        }
      }
      for (const value of [box.y, box.y + box.height / 2, box.y + box.height]) {
        const distance = Math.abs(point.y - value);
        if (distance < dy) {
          dy = distance;
          y = value;
          guides.y = value;
        }
      }
    }
  }

  const target = nearestSnapTarget(
    point,
    targets,
    excluded,
    zoom,
    ownIntersectionId,
  );
  if (target) {
    x = target.point.x;
    y = target.point.y;
    guides.x = x;
    guides.y = y;
  }
  return { point: { x, y }, target, guides };
}

/** Align any real anchor in the moving selection, retaining the cursor's grab offset. */
export function translationSnap(
  sources: SnapTarget[],
  delta: Point,
  targets: SnapTarget[],
  excluded: string[],
  zoom = 1,
) {
  let closest: { target: SnapTarget; shift: Point } | null = null,
    best = Infinity;
  for (const source of sources) {
    const moved = { x: source.point.x + delta.x, y: source.point.y + delta.y };
    const target = nearestSnapTarget(moved, targets, excluded, zoom);
    if (!target) continue;
    const dx = target.point.x - moved.x,
      dy = target.point.y - moved.y;
    const distance = Math.hypot(dx, dy);
    if (distance < best) {
      best = distance;
      closest = { target, shift: { x: delta.x + dx, y: delta.y + dy } };
    }
  }
  return closest;
}
