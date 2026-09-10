import type { DiagramElement, Point } from "./types";
import { dropLineEndpoint as baseDropLineEndpoint } from "./intersectionsBase";
import { isAltModifierDown } from "./modifierState";

export * from "./intersectionsBase";

export function dropLineEndpoint(
  e: DiagramElement,
  index: number,
  point: Point,
  mark: { point: Point } | null,
  nodeId?: string,
): DiagramElement {
  return isAltModifierDown()
    ? baseDropLineEndpoint(e, index, point, null, undefined)
    : baseDropLineEndpoint(e, index, point, mark, nodeId);
}
