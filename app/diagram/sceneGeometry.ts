import type { DiagramElement, Point } from "./types";
import type { Bounds } from "./pathBounds";
import {
  lineVertices,
  moveLineEndpoint as baseMoveLineEndpoint,
  resizeElements as baseResizeElements,
  worldPoint,
} from "./sceneGeometryBase";
import { isAltModifierDown } from "./modifierState";

export * from "./sceneGeometryBase";

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
  return baseResizeElements(
    elements,
    from,
    isAltModifierDown() ? centerResizeBounds(from, to) : to,
    local,
  );
}
