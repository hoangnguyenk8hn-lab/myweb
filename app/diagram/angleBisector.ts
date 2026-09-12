import type { DiagramElement, Point } from "./types";
import type { StraightLineTarget } from "./constructionTargets";
import { straightLineTargets } from "./constructionTargets";
import { segmentDistance, segmentIntersection } from "./geometryKernel";

export type AngleBisectorTarget = StraightLineTarget & {
  kind: "angle-bisector";
  pointer: Point;
  zoom: number;
  candidates: StraightLineTarget[];
};

export type AngleBisectorPreview = {
  kind: "angle-bisector";
  target: AngleBisectorTarget;
  secondTarget: StraightLineTarget;
  start: Point;
  end: Point;
  foot: Point;
  bisectorDirection: Point;
  marker: null;
};

type BisectorRay = StraightLineTarget & { unit: Point; angle: number };
const positiveAngle = (angle: number) => {
  const turn = Math.PI * 2;
  return ((angle % turn) + turn) % turn;
};
const angleGap = (from: number, to: number) => positiveAngle(to - from);

export function angleBisectorTargetAt(
  pointer: Point,
  elements: DiagramElement[],
  zoom = 1,
): AngleBisectorTarget | null {
  const candidates = straightLineTargets(elements);
  return candidates.length < 2
    ? null
    : { ...candidates[0], kind: "angle-bisector", pointer, zoom, candidates };
}

function nearestVertex(source: Point, lines: StraightLineTarget[], zoom: number) {
  const tolerance = 14 / Math.max(zoom, 1e-6);
  let best: { point: Point; distance: number } | null = null;
  for (let i = 0; i < lines.length; i++)
    for (let j = i + 1; j < lines.length; j++) {
      const point = segmentIntersection(
        [lines[i].a, lines[i].b],
        [lines[j].a, lines[j].b],
      );
      if (!point) continue;
      const distance = Math.hypot(point.x - source.x, point.y - source.y);
      if (distance <= tolerance && (!best || distance < best.distance))
        best = { point, distance };
    }
  return best?.point ?? null;
}

export function angleBisectorPreview(
  source: Point,
  target: AngleBisectorTarget | null,
): AngleBisectorPreview | null {
  if (!target) return null;
  const vertex = nearestVertex(source, target.candidates, target.zoom);
  if (!vertex) return null;
  const passing = target.candidates.filter(
    (line) => segmentDistance(vertex, line.a, line.b) < 1e-5,
  );
  if (passing.length < 2) return null;
  const rays: BisectorRay[] = [];
  for (const line of passing) {
    const dx = line.b.x - line.a.x,
      dy = line.b.y - line.a.y,
      length = Math.hypot(dx, dy),
      unit = { x: dx / length, y: dy / length };
    rays.push({ ...line, unit, angle: positiveAngle(Math.atan2(unit.y, unit.x)) });
    rays.push({
      ...line,
      unit: { x: -unit.x, y: -unit.y },
      angle: positiveAngle(Math.atan2(-unit.y, -unit.x)),
    });
  }
  rays.sort((a, b) => a.angle - b.angle);
  const offset = {
      x: target.pointer.x - vertex.x,
      y: target.pointer.y - vertex.y,
    },
    radius = Math.hypot(offset.x, offset.y),
    theta = positiveAngle(Math.atan2(offset.y, offset.x));
  if (radius < 1e-8) return null;
  let chosen: { first: BisectorRay; second: BisectorRay; score: number } | null = null;
  for (let index = 0; index < rays.length; index++) {
    const first = rays[index],
      second = rays[(index + 1) % rays.length],
      gap = angleGap(first.angle, second.angle),
      within = angleGap(first.angle, theta);
    if (
      first.id === second.id ||
      gap < 1e-5 ||
      gap >= Math.PI - 1e-5 ||
      within > gap + 1e-7
    )
      continue;
    const score = Math.abs(within - gap / 2);
    if (!chosen || score < chosen.score) chosen = { first, second, score };
  }
  if (!chosen) return null;
  const sum = {
      x: chosen.first.unit.x + chosen.second.unit.x,
      y: chosen.first.unit.y + chosen.second.unit.y,
    },
    sumLength = Math.hypot(sum.x, sum.y);
  if (sumLength < 1e-8) return null;
  const direction = { x: sum.x / sumLength, y: sum.y / sumLength };
  const length = Math.max(18 / Math.max(target.zoom, 1e-6), radius);
  return {
    kind: "angle-bisector",
    target: { ...target, ...chosen.first, kind: "angle-bisector" },
    secondTarget: chosen.second,
    start: vertex,
    end: { x: vertex.x + direction.x * length, y: vertex.y + direction.y * length },
    foot: vertex,
    bisectorDirection: direction,
    marker: null,
  };
}

export function angleBisectorLineForPointer(
  pointer: Point,
  preview: AngleBisectorPreview,
  zoom = 1,
): AngleBisectorPreview {
  const length = Math.max(
    18 / Math.max(zoom, 1e-6),
    Math.hypot(pointer.x - preview.start.x, pointer.y - preview.start.y),
  );
  return {
    ...preview,
    end: {
      x: preview.start.x + preview.bisectorDirection.x * length,
      y: preview.start.y + preview.bisectorDirection.y * length,
    },
  };
}
