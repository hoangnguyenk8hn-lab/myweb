import {
  RIGHT_ANGLE_MARKERS,
  rightAngleMarkerPath,
} from "./lineMarkers";
import type {
  AssistedLineConstruction,
  DiagramElement,
  Point,
  RightAngleDecoration,
  RightAngleMarker,
} from "./types";
import { lineVertices, worldPoint } from "./sceneGeometry";

export { RIGHT_ANGLE_MARKERS } from "./lineMarkers";

type StraightLineTarget = {
  id: string;
  a: Point;
  b: Point;
};

export type PerpendicularTarget = StraightLineTarget & {
  mode?: "angle-bisector";
  pointer?: Point;
  zoom?: number;
  candidates?: StraightLineTarget[];
  second?: StraightLineTarget;
};

export type PerpendicularPreview = {
  target: PerpendicularTarget;
  start: Point;
  end: Point;
  foot: Point;
  marker: RightAngleMarker | null;
  mode?: "angle-bisector";
  bisectorDirection?: Point;
  secondTarget?: StraightLineTarget;
};

type BisectorRay = {
  line: StraightLineTarget;
  unit: Point;
  angle: number;
};

function segmentDistance(point: Point, a: Point, b: Point) {
  const dx = b.x - a.x,
    dy = b.y - a.y,
    length2 = dx * dx + dy * dy;
  if (length2 < 1e-16) return Infinity;
  const t = Math.max(
    0,
    Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / length2),
  );
  return Math.hypot(point.x - (a.x + t * dx), point.y - (a.y + t * dy));
}

function lineDistance(point: Point, a: Point, b: Point) {
  const dx = b.x - a.x,
    dy = b.y - a.y,
    length = Math.hypot(dx, dy);
  if (length < 1e-8) return Infinity;
  return Math.abs((point.x - a.x) * dy - (point.y - a.y) * dx) / length;
}

function straightLineTargets(elements: DiagramElement[]): StraightLineTarget[] {
  const result: StraightLineTarget[] = [];
  for (const element of elements) {
    if (element.type !== "line") continue;
    const vertices = lineVertices(element);
    if (vertices.length !== 2) continue;
    const a = worldPoint(vertices[0], element),
      b = worldPoint(vertices[1], element);
    if (Math.hypot(b.x - a.x, b.y - a.y) < 1e-8) continue;
    result.push({ id: element.id, a, b });
  }
  return result;
}

function cross(a: Point, b: Point) {
  return a.x * b.y - a.y * b.x;
}

function subtract(a: Point, b: Point): Point {
  return { x: a.x - b.x, y: a.y - b.y };
}

function segmentIntersection(
  a: Point,
  b: Point,
  c: Point,
  d: Point,
): Point | null {
  const r = subtract(b, a),
    s = subtract(d, c),
    delta = subtract(c, a),
    denominator = cross(r, s);

  if (Math.abs(denominator) < 1e-10) {
    const shared: Point[] = [];
    for (const p of [a, b])
      for (const q of [c, d])
        if (
          Math.hypot(p.x - q.x, p.y - q.y) < 1e-7 &&
          !shared.some((n) => Math.hypot(n.x - p.x, n.y - p.y) < 1e-7)
        )
          shared.push(p);
    return shared.length === 1 ? shared[0] : null;
  }

  const t = cross(delta, s) / denominator,
    u = cross(delta, r) / denominator;
  if (t < -1e-8 || t > 1 + 1e-8 || u < -1e-8 || u > 1 + 1e-8)
    return null;
  return { x: a.x + t * r.x, y: a.y + t * r.y };
}

function positiveAngle(angle: number) {
  const turn = Math.PI * 2;
  return ((angle % turn) + turn) % turn;
}

function angleGap(from: number, to: number) {
  return positiveAngle(to - from);
}

function nearestAngleVertex(
  source: Point,
  lines: StraightLineTarget[],
  zoom: number,
) {
  const tolerance = 14 / Math.max(zoom, 1e-6);
  let best: { point: Point; distance: number } | null = null;

  for (let i = 0; i < lines.length; i++) {
    for (let j = i + 1; j < lines.length; j++) {
      const point = segmentIntersection(
        lines[i].a,
        lines[i].b,
        lines[j].a,
        lines[j].b,
      );
      if (!point) continue;
      const distance = Math.hypot(point.x - source.x, point.y - source.y);
      if (distance <= tolerance && (!best || distance < best.distance))
        best = { point, distance };
    }
  }
  return best?.point ?? null;
}

function angleBisectorPreview(
  source: Point,
  target: PerpendicularTarget,
): PerpendicularPreview | null {
  const pointer = target.pointer,
    lines = target.candidates,
    zoom = target.zoom ?? 1;
  if (!pointer || !lines || lines.length < 2) return null;

  const vertex = nearestAngleVertex(source, lines, zoom);
  if (!vertex) return null;

  const passing = lines.filter(
    (line) => segmentDistance(vertex, line.a, line.b) < 1e-5,
  );
  if (passing.length < 2) return null;

  const rays: BisectorRay[] = [];
  for (const line of passing) {
    const dx = line.b.x - line.a.x,
      dy = line.b.y - line.a.y,
      length = Math.hypot(dx, dy),
      unit = { x: dx / length, y: dy / length };
    rays.push({ line, unit, angle: positiveAngle(Math.atan2(unit.y, unit.x)) });
    rays.push({
      line,
      unit: { x: -unit.x, y: -unit.y },
      angle: positiveAngle(Math.atan2(-unit.y, -unit.x)),
    });
  }
  rays.sort((a, b) => a.angle - b.angle);

  const vx = pointer.x - vertex.x,
    vy = pointer.y - vertex.y,
    radius = Math.hypot(vx, vy),
    theta = positiveAngle(Math.atan2(vy, vx));
  if (radius < 1e-8) return null;

  let chosen:
    | { first: BisectorRay; second: BisectorRay; score: number }
    | null = null;
  for (let i = 0; i < rays.length; i++) {
    const first = rays[i],
      second = rays[(i + 1) % rays.length],
      gap = angleGap(first.angle, second.angle),
      offset = angleGap(first.angle, theta);
    if (
      first.line.id === second.line.id ||
      gap < 1e-5 ||
      gap >= Math.PI - 1e-5 ||
      offset > gap + 1e-7
    )
      continue;
    const score = Math.abs(offset - gap / 2);
    if (!chosen || score < chosen.score) chosen = { first, second, score };
  }
  if (!chosen) return null;

  const sum = {
      x: chosen.first.unit.x + chosen.second.unit.x,
      y: chosen.first.unit.y + chosen.second.unit.y,
    },
    sumLength = Math.hypot(sum.x, sum.y);
  if (sumLength < 1e-8) return null;
  const direction = { x: sum.x / sumLength, y: sum.y / sumLength },
    length = Math.max(18 / Math.max(zoom, 1e-6), radius),
    primary = chosen.first.line,
    secondary = chosen.second.line;

  return {
    target: {
      ...primary,
      mode: "angle-bisector",
      pointer,
      zoom,
      candidates: lines,
      second: secondary,
    },
    start: vertex,
    end: {
      x: vertex.x + direction.x * length,
      y: vertex.y + direction.y * length,
    },
    foot: vertex,
    marker: null,
    mode: "angle-bisector",
    bisectorDirection: direction,
    secondTarget: secondary,
  };
}

/** Return the nearest straight two-vertex Line under the pointer. */
export function perpendicularTargetAt(
  pointer: Point,
  elements: DiagramElement[],
  zoom = 1,
  mode: AssistedLineConstruction = "perpendicular",
): PerpendicularTarget | null {
  const lines = straightLineTargets(elements);
  if (mode === "angle-bisector") {
    if (lines.length < 2) return null;
    return {
      ...lines[0],
      id: "angle-bisector",
      mode: "angle-bisector",
      pointer,
      zoom,
      candidates: lines,
    };
  }

  const tolerance = 10 / Math.max(zoom, 1e-6);
  let closest: PerpendicularTarget | null = null,
    best = tolerance;
  for (const line of lines) {
    const distance = segmentDistance(pointer, line.a, line.b);
    if (distance <= best) {
      best = distance;
      closest = line;
    }
  }
  return closest;
}

function projectPointToLine(point: Point, a: Point, b: Point): Point | null {
  const dx = b.x - a.x,
    dy = b.y - a.y,
    length2 = dx * dx + dy * dy;
  if (length2 < 1e-16) return null;
  const t = ((point.x - a.x) * dx + (point.y - a.y) * dy) / length2;
  return { x: a.x + t * dx, y: a.y + t * dy };
}

function previewFrame(preview: PerpendicularPreview) {
  const dx = preview.foot.x - preview.start.x,
    dy = preview.foot.y - preview.start.y,
    length = Math.hypot(dx, dy);
  if (length < 1e-8) return null;
  const x = { x: dx / length, y: dy / length };
  return { x, y: { x: -x.y, y: x.x }, length };
}

/**
 * Extend PH past the perpendicular foot according to the pointer. The foot H
 * remains fixed and is always contained in the resulting segment. Entering the
 * marker quick-pick ring preserves the previous length so choosing a corner
 * does not collapse an already-extended line.
 */
export function perpendicularLineForPointer(
  pointer: Point,
  preview: PerpendicularPreview,
  previousEnd: Point | null = null,
  zoom = 1,
): PerpendicularPreview {
  if (preview.mode === "angle-bisector" && preview.bisectorDirection) {
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

  const frame = previewFrame(preview);
  if (!frame) return preview;
  const scale = Math.max(zoom, 1e-6),
    fromFoot = Math.hypot(pointer.x - preview.foot.x, pointer.y - preview.foot.y);
  if (previousEnd && fromFoot <= 30 / scale)
    return { ...preview, end: previousEnd };

  const offset = {
      x: pointer.x - preview.start.x,
      y: pointer.y - preview.start.y,
    },
    along = offset.x * frame.x.x + offset.y * frame.x.y,
    length = Math.max(frame.length, along);
  return {
    ...preview,
    end: {
      x: preview.start.x + frame.x.x * length,
      y: preview.start.y + frame.x.y * length,
    },
  };
}

/** Keep the selected target alive while choosing a length or marker around H. */
export function perpendicularRetainsTargetAt(
  pointer: Point,
  preview: PerpendicularPreview,
  zoom = 1,
) {
  if (preview.mode === "angle-bisector") return true;

  const scale = Math.max(zoom, 1e-6),
    frame = previewFrame(preview);
  if (
    lineDistance(pointer, preview.target.a, preview.target.b) <= 10 / scale ||
    Math.hypot(pointer.x - preview.foot.x, pointer.y - preview.foot.y) <= 30 / scale
  )
    return true;
  if (!frame) return false;

  const offset = {
      x: pointer.x - preview.start.x,
      y: pointer.y - preview.start.y,
    },
    along = offset.x * frame.x.x + offset.y * frame.x.y,
    lateral = Math.abs(offset.x * frame.y.x + offset.y * frame.y.y);
  return along >= frame.length - 18 / scale && lateral <= 14 / scale;
}

/** Return the right-angle marker represented by the pointer's quadrant around H. */
export function perpendicularMarkerAt(
  pointer: Point,
  preview: PerpendicularPreview,
  zoom = 1,
): RightAngleMarker | null {
  if (preview.mode === "angle-bisector") return null;

  const frame = previewFrame(preview);
  if (!frame) return null;

  const vx = pointer.x - preview.foot.x,
    vy = pointer.y - preview.foot.y,
    radius = Math.hypot(vx, vy),
    scale = Math.max(zoom, 1e-6),
    inner = 5 / scale,
    outer = 26 / scale;
  if (radius < inner || radius > outer) return null;

  const localX = vx * frame.x.x + vy * frame.x.y,
    localY = vx * frame.y.x + vy * frame.y.y,
    deadZone = 2.5 / scale;
  if (Math.abs(localX) < deadZone || Math.abs(localY) < deadZone) return null;

  if (localX < 0)
    return localY < 0
      ? "right-angle-inside-left"
      : "right-angle-inside-right";
  return localY < 0
    ? "right-angle-outside-left"
    : "right-angle-outside-right";
}

/** SVG path for one of the four quick-pick corner guides around the foot H. */
export function rightAngleGuidePath(
  preview: PerpendicularPreview,
  marker: RightAngleMarker,
  size: number,
) {
  if (preview.mode === "angle-bisector") {
    if (marker !== RIGHT_ANGLE_MARKERS[0] || !preview.secondTarget) return "";
    return `M${preview.secondTarget.a.x} ${preview.secondTarget.a.y}L${preview.secondTarget.b.x} ${preview.secondTarget.b.y}`;
  }

  const frame = previewFrame(preview);
  if (!frame) return "";
  return rightAngleMarkerPath(preview.foot, frame.x, marker, size);
}

/**
 * Keep the right-angle mark at the perpendicular foot instead of attaching it
 * to an SVG end marker. The normalized position follows later line transforms.
 */
export function rightAngleDecorationForPreview(
  preview: PerpendicularPreview,
): RightAngleDecoration | undefined {
  if (!preview.marker || preview.mode === "angle-bisector") return undefined;
  const dx = preview.end.x - preview.start.x,
    dy = preview.end.y - preview.start.y,
    length2 = dx * dx + dy * dy;
  if (length2 < 1e-12) return undefined;
  const at =
    ((preview.foot.x - preview.start.x) * dx +
      (preview.foot.y - preview.start.y) * dy) /
    length2;
  return { marker: preview.marker, at: Math.max(0, Math.min(1, at)) };
}

/**
 * Build the perpendicular segment from `source` to its foot on the target line,
 * or an angle-bisector segment when the caller explicitly requests that mode.
 */
export function perpendicularPreview(
  source: Point,
  target: PerpendicularTarget | null,
): PerpendicularPreview | null {
  if (!target) return null;
  if (target.mode === "angle-bisector") return angleBisectorPreview(source, target);

  const foot = projectPointToLine(source, target.a, target.b);
  if (!foot) return null;
  if (Math.hypot(foot.x - source.x, foot.y - source.y) < 1e-8) return null;
  return { target, start: source, end: foot, foot, marker: null };
}
