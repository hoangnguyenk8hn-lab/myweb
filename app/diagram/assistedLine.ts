import type {
  AssistedLineConstruction,
  DiagramElement,
  ArrowHead,
  Point,
  RightAngleMarker,
} from "./types";
import {
  angleBisectorLineForPointer,
  angleBisectorPreview,
  angleBisectorTargetAt,
  type AngleBisectorPreview,
  type AngleBisectorTarget,
} from "./angleBisector";
import {
  perpendicularLineForPointer,
  perpendicularMarkerAt,
  perpendicularPreview,
  perpendicularRetainsTargetAt,
  perpendicularTargetAt,
  rightAngleGuidePath,
  type PerpendicularPreview,
  type PerpendicularTarget,
} from "./perpendicular";

export { RIGHT_ANGLE_MARKERS } from "./perpendicular";
export type AssistedLineTarget = PerpendicularTarget | AngleBisectorTarget;
export type AssistedLinePreview = PerpendicularPreview | AngleBisectorPreview;

export function assistedLineTargetAt(
  mode: AssistedLineConstruction,
  pointer: Point,
  elements: DiagramElement[],
  zoom = 1,
): AssistedLineTarget | null {
  return mode === "angle-bisector"
    ? angleBisectorTargetAt(pointer, elements, zoom)
    : perpendicularTargetAt(pointer, elements, zoom);
}

export function assistedLinePreview(
  source: Point,
  target: AssistedLineTarget | null,
): AssistedLinePreview | null {
  return target?.kind === "angle-bisector"
    ? angleBisectorPreview(source, target)
    : perpendicularPreview(source, target);
}

export function assistedLineForPointer(
  pointer: Point,
  preview: AssistedLinePreview,
  previousEnd: Point | null,
  zoom = 1,
): AssistedLinePreview {
  return preview.kind === "angle-bisector"
    ? angleBisectorLineForPointer(pointer, preview, zoom)
    : perpendicularLineForPointer(pointer, preview, previousEnd, zoom);
}

export function assistedLineRetainsTargetAt(
  pointer: Point,
  preview: AssistedLinePreview,
  zoom = 1,
) {
  return preview.kind === "angle-bisector"
    ? true
    : perpendicularRetainsTargetAt(pointer, preview, zoom);
}

export function assistedLineMarkerAt(
  pointer: Point,
  preview: AssistedLinePreview,
  zoom = 1,
): RightAngleMarker | null {
  return preview.kind === "perpendicular"
    ? perpendicularMarkerAt(pointer, preview, zoom)
    : null;
}

export function assistedLineRightAngleGuidePath(
  preview: AssistedLinePreview,
  marker: RightAngleMarker,
  size: number,
) {
  return preview.kind === "perpendicular"
    ? rightAngleGuidePath(preview, marker, size)
    : "";
}

/** Perpendicular is the exact segment PH, so its chosen corner is an endHead. */
export function assistedLineEndHead(
  preview: AssistedLinePreview,
): ArrowHead {
  return preview.kind === "perpendicular" ? (preview.marker ?? "none") : "none";
}
