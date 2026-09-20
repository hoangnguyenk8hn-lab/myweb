import type { DiagramElement } from "./types";
import { LINE_TYPES, TEXT_TYPES } from "./sceneGeometry";

const DIRECT_COORDINATE_TYPES = new Set([
  "polyline",
  "polycurve",
  "freehand",
  "image",
  "plot",
]);

/**
 * Shape-library paths live in a 100x100 tile and are scaled into the element.
 * Compensate for that private tile transform, while leaving the outer canvas
 * zoom free to scale shape and Line strokes in exactly the same way.
 */
export function elementStrokeMetrics(element: DiagramElement) {
  // A full Ellipse and its Arc variant are rendered directly in element
  // coordinates. Keeping them out of the private 100x100 tile transform makes
  // stroke width independent of non-uniform resize (for example 100x100 ->
  // 300x100) while the outer SVG zoom still scales the stroke normally.
  const directEllipse = (element.shape ?? element.type) === "ellipse";
  const tiled =
    !LINE_TYPES.has(element.type) &&
    !TEXT_TYPES.has(element.type) &&
    !DIRECT_COORDINATE_TYPES.has(element.type) &&
    !directEllipse;
  const tileScale = tiled
    ? Math.max(1e-6, (Math.abs(element.width) + Math.abs(element.height)) / 200)
    : 1;
  const width = element.style.strokeWidth / tileScale;
  const dash =
    element.style.dash === "dashed"
      ? `${6 / tileScale} ${4 / tileScale}`
      : element.style.dash === "dotted"
        ? `${1 / tileScale} ${3 / tileScale}`
        : undefined;
  return { width, dash };
}
