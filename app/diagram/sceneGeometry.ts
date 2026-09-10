import type { DiagramDocument, DiagramElement, Point } from "./types";
import type { Bounds } from "./pathBounds";
import {
  drawElement as baseDrawElement,
  lineVertices,
  moveLineEndpoint as baseMoveLineEndpoint,
  resizeElements as baseResizeElements,
  resolveElement as baseResolveElement,
  sceneBounds as baseSceneBounds,
  within as baseWithin,
  worldBounds as baseWorldBounds,
  worldPoint,
} from "./sceneGeometryBase";
import { isAltModifierDown } from "./modifierState";

export * from "./sceneGeometryBase";

export const DEFAULT_POINT_SIZE = 0.4;
export function pointRadius(e: DiagramElement) {
  return Math.max(0.1, Math.min(2, e.pointSize ?? DEFAULT_POINT_SIZE)) * 4;
}

const CENTER_SELECTION_SHAPES = new Set([
  "rectangle",
  "square",
  "regular-polygon",
  "quadratic",
]);
const ROUND_ATTACHMENT_SHAPES = new Set(["circle", "ellipse"]);
const STATIC_GEOMETRY_LINES = new Set(["line", "curve"]);

/**
 * Mark core boxed geometry as centered in the resolved scene representation.
 * `boxed` is already the selection-layer signal for showing a center point;
 * for non-line shapes it does not change their rendered geometry.
 *
 * Plain Line/Curve objects are geometric primitives, not live connectors.
 * Old endpoint drops could persist fromId/toId on them and baseResolveElement
 * would then move the supposedly fixed endpoint whenever the other end moved.
 * Ignore those attachment ids for Line/Curve; Arrow/Curved Arrow keep the
 * existing live-connector behavior.
 */
export function resolveElement(
  e: DiagramElement,
  doc: DiagramDocument,
): DiagramElement {
  const source = STATIC_GEOMETRY_LINES.has(e.type)
    ? { ...e, fromId: undefined, toId: undefined }
    : e;
  const resolved = baseResolveElement(source, doc);
  const shape = resolved.shape ?? resolved.type;
  return CENTER_SELECTION_SHAPES.has(shape)
    ? { ...resolved, boxed: true }
    : resolved;
}

/** A Point is one geometric coordinate; its marker size is visual only. */
export function sceneBounds(e: DiagramElement): Bounds {
  if (e.type !== "point") return baseSceneBounds(e);
  const r = pointRadius(e);
  return { x: e.x - r, y: e.y - r, width: 2 * r, height: 2 * r };
}

export function worldBounds(e: DiagramElement): Bounds {
  if (e.type !== "point") return baseWorldBounds(e);
  const r = pointRadius(e);
  return { x: e.x - r, y: e.y - r, width: 2 * r, height: 2 * r };
}

export function drawElement(
  e: DiagramElement,
  start: Point,
  end: Point,
  square = false,
): DiagramElement {
  if (e.type === "point")
    return { ...e, x: start.x, y: start.y, width: 0, height: 0 };
  return baseDrawElement(e, start, end, square);
}

/**
 * Round objects must use their actual ellipse footprint for endpoint attachment.
 * Using the rectangular scene bounds makes empty bounding-box corners count as
 * part of a circle, so a line dropped on a guide corner becomes attached to the
 * circle and its endpoint moves again when the opposite endpoint is dragged.
 */
export function within(p: Point, e: DiagramElement, padding = 0) {
  if (e.type === "point") return false;
  const shape = e.shape ?? e.type;
  const round =
    ROUND_ATTACHMENT_SHAPES.has(shape) ||
    ROUND_ATTACHMENT_SHAPES.has(e.textBorder ?? "");
  if (!round) return baseWithin(p, e, padding);

  const b = baseSceneBounds(e);
  const rx = b.width / 2,
    ry = b.height / 2;
  if (rx < 1e-8 || ry < 1e-8) return false;
  const cx = b.x + rx,
    cy = b.y + ry,
    paddedRx = Math.max(1e-8, rx + padding),
    paddedRy = Math.max(1e-8, ry + padding),
    dx = (p.x - cx) / paddedRx,
    dy = (p.y - cy) / paddedRy;
  return dx * dx + dy * dy <= 1;
}

function projectEndpointToOriginalAxis(
  e: DiagramElement,
  index: number,
  target: Point,
): Point {
  if (!["line", "arrow"].includes(e.type)) return target;
  const vertices = lineVertices(e);
  if (vertices.length < 2) return target;
  const movingIndex = index ? vertices.length - 1 : 0;
  const anchorIndex = index ? vertices.length - 2 : 1;
  const moving = worldPoint(vertices[movingIndex], e);
  const anchor = worldPoint(vertices[anchorIndex], e);
  const dx = moving.x - anchor.x;
  const dy = moving.y - anchor.y;
  const length2 = dx * dx + dy * dy;
  if (length2 < 1e-10) return target;
  const t =
    ((target.x - anchor.x) * dx + (target.y - anchor.y) * dy) / length2;
  return { x: anchor.x + t * dx, y: anchor.y + t * dy };
}

export function moveLineEndpoint(
  e: DiagramElement,
  index: number,
  target: Point,
): DiagramElement {
  return baseMoveLineEndpoint(
    e,
    index,
    isAltModifierDown()
      ? projectEndpointToOriginalAxis(e, index, target)
      : target,
  );
}

function centerResizeBounds(from: Bounds, to: Bounds): Bounds {
  const epsilon = 1e-8;
  const widthChanged =
    Math.abs(to.width - from.width) > epsilon ||
    Math.abs(to.x - from.x) > epsilon;
  const heightChanged =
    Math.abs(to.height - from.height) > epsilon ||
    Math.abs(to.y - from.y) > epsilon;
  const width = widthChanged
    ? Math.max(4, 2 * to.width - from.width)
    : from.width;
  const height = heightChanged
    ? Math.max(4, 2 * to.height - from.height)
    : from.height;
  return {
    x: widthChanged ? from.x + (from.width - width) / 2 : from.x,
    y: heightChanged ? from.y + (from.height - height) / 2 : from.y,
    width,
    height,
  };
}

export function resizeElements(
  elements: DiagramElement[],
  from: Bounds,
  to: Bounds,
  local = elements.length === 1,
): DiagramElement[] {
  if (elements.length === 1 && elements[0].type === "point") return elements;
  return baseResizeElements(
    elements,
    from,
    isAltModifierDown() ? centerResizeBounds(from, to) : to,
    local,
  );
}
