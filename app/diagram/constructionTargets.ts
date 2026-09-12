import type { DiagramElement, Point } from "./types";
import { lineVertices, worldPoint } from "./sceneGeometry";

export type StraightLineTarget = {
  id: string;
  a: Point;
  b: Point;
};

export function straightLineTargets(
  elements: DiagramElement[],
): StraightLineTarget[] {
  const result: StraightLineTarget[] = [];
  for (const element of elements) {
    if (element.type !== "line") continue;
    const vertices = lineVertices(element);
    if (vertices.length !== 2) continue;
    const a = worldPoint(vertices[0], element);
    const b = worldPoint(vertices[1], element);
    if (Math.hypot(b.x - a.x, b.y - a.y) < 1e-8) continue;
    result.push({ id: element.id, a, b });
  }
  return result;
}
