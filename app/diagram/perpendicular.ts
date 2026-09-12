import { rightAngleMarkerPath } from "./lineMarkers";
import type {
  DiagramElement,
  Point,
  RightAngleMarker,
} from "./types";
import type { StraightLineTarget } from "./constructionTargets";
import { straightLineTargets } from "./constructionTargets";
import {
  lineDistance,
  projectPointToLine,
  segmentDistance,
} from "./geometryKernel";

export { RIGHT_ANGLE_MARKERS } from "./lineMarkers";

export type PerpendicularTarget = StraightLineTarget & {
  kind: "perpendicular";
};

export type PerpendicularPreview = {
  kind: "perpendicular";
  target: PerpendicularTarget;
  start: Point;
  end: Point;
  foot: Point;
  marker: RightAngleMarker | null;
};

/** Return the nearest straight two-vertex Line under the pointer. */
export function perpendicularTargetAt(
  pointer: Point,
  elements: DiagramElement[],
  zoom = 1,
): PerpendicularTarget | null {
  const tolerance = 10 / Math.max(zoom, 1e-6);
  let closest: PerpendicularTarget | null = null;
  let best = tolerance;
  for (const line of straightLineTargets(elements)) {
    const distance = segmentDistance(pointer, line.a, line.b);
    if (distance <= best) {
      best = distance;
      closest = { ...line, kind: "perpendicular" };
    }
  }
  return closest;
}

export function perpendicularPreview(
  source: Point,
  target: PerpendicularTarget | null,
): PerpendicularPreview | null {
  if (!target) return null;
  const foot = projectPointToLine(source, target.a, target.b);
  if (!foot || Math.hypot(foot.x - source.x, foot.y - source.y) < 1e-8)
    return null;
  return {
    kind: "perpendicular",
    target,
    start: source,
    end: foot,
    foot,
    marker: null,
  };
}

function previewFrame(preview: PerpendicularPreview) {
  const dx = preview.foot.x - preview.start.x,
    dy = preview.foot.y - preview.start.y,
    length = Math.hypot(dx, dy);
  if (length < 1e-8) return null;
  const x = { x: dx / length, y: dy / length };
  return { x, y: { x: -x.y, y: x.x }, length };
}

export function perpendicularLineForPointer(
  _pointer: Point,
  preview: PerpendicularPreview,
  _previousEnd: Point | null = null,
  _zoom = 1,
): PerpendicularPreview {
  // Perpendicular construction always creates the exact segment PH. Pointer
  // movement around H is reserved exclusively for choosing the corner mark.
  return { ...preview, end: preview.foot };
}

export function perpendicularRetainsTargetAt(
  pointer: Point,
  preview: PerpendicularPreview,
  zoom = 1,
) {
  const scale = Math.max(zoom, 1e-6);
  return (
    lineDistance(pointer, preview.target.a, preview.target.b) <= 10 / scale ||
    Math.hypot(pointer.x - preview.foot.x, pointer.y - preview.foot.y) <= 30 / scale
  );
}

export function perpendicularMarkerAt(
  pointer: Point,
  preview: PerpendicularPreview,
  zoom = 1,
): RightAngleMarker | null {
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

export function rightAngleGuidePath(
  preview: PerpendicularPreview,
  marker: RightAngleMarker,
  size: number,
) {
  const frame = previewFrame(preview);
  return frame
    ? rightAngleMarkerPath(preview.foot, frame.x, marker, size)
    : "";
}
