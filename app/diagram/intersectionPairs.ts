import { lineVertices } from "./sceneGeometry";
import type { DiagramElement } from "./types";

export function supportsExtendedLineIntersection(element: DiagramElement) {
  return (
    ["line", "arrow"].includes(element.type) && lineVertices(element).length === 2
  );
}

export function isExtendedLineIntersectionPair(
  first: DiagramElement,
  second: DiagramElement,
) {
  return (
    !!first.intersectionWith?.includes(second.id) ||
    !!second.intersectionWith?.includes(first.id)
  );
}

/** Add or remove one explicit pair without introducing a new document field. */
export function toggleExtendedLineIntersectionPair(
  elements: DiagramElement[],
  selectedIds: string[],
) {
  if (selectedIds.length !== 2) return elements;
  const first = elements.find((element) => element.id === selectedIds[0]),
    second = elements.find((element) => element.id === selectedIds[1]);
  if (
    !first ||
    !second ||
    !supportsExtendedLineIntersection(first) ||
    !supportsExtendedLineIntersection(second)
  )
    return elements;

  const remove = isExtendedLineIntersectionPair(first, second),
    pair = new Map([
      [first.id, second.id],
      [second.id, first.id],
    ]);
  return elements.map((element) => {
    const otherId = pair.get(element.id);
    if (!otherId) return element;
    const links = remove
      ? (element.intersectionWith ?? []).filter((id) => id !== otherId)
      : [...new Set([...(element.intersectionWith ?? []), otherId])];
    return {
      ...element,
      intersection: links.length > 0,
      intersectionWith: links.length > 0 ? links : undefined,
      ...(remove ? {} : { blockIntersection: false }),
    };
  });
}
