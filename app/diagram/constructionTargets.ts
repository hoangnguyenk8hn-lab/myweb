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
    if (!["line", "arrow"].includes(element.type)) continue;
    const vertices = lineVertices(element);
    if (vertices.length !== 2) continue;
    const a = worldPoint(vertices[0], element);
    const b = worldPoint(vertices[1], element);
    if (Math.hypot(b.x - a.x, b.y - a.y) < 1e-8) continue;
    result.push({ id: element.id, a, b });
  }
  return result;
}

/** Resolve exactly two user-selected straight targets without leaking UI state. */
export function selectedStraightLineTargetIds(
  elements: DiagramElement[],
  selectedIds: string[],
) {
  if (selectedIds.length !== 2) return [];
  const targets = straightLineTargets(
    elements.filter((element) => selectedIds.includes(element.id)),
  );
  return targets.length === 2 ? targets.map((target) => target.id) : [];
}
