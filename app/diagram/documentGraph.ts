import type { DiagramDocument, DiagramElement } from "./types";

/**
 * References that make an element meaningless when their target disappears.
 * Future construction dependencies should be registered here rather than
 * teaching delete/import code about them in several components.
 */
export function hardDependencyIds(element: DiagramElement): string[] {
  return [element.fromId, element.toId].filter(
    (id): id is string => typeof id === "string" && id.length > 0,
  );
}

function normalizeElementReferences(
  element: DiagramElement,
  ids: ReadonlySet<string>,
): DiagramElement {
  let next = element;
  const validTarget = (id: string | undefined) =>
    id !== undefined && id !== element.id && ids.has(id);

  if (element.fromId !== undefined && !validTarget(element.fromId))
    next = { ...next, fromId: undefined };
  if (element.toId !== undefined && !validTarget(element.toId))
    next = { ...next, toId: undefined };

  if (element.intersectionWith !== undefined) {
    const links = [
      ...new Set(element.intersectionWith.filter((id) => validTarget(id))),
    ];
    if (
      links.length !== element.intersectionWith.length ||
      links.some((id, index) => id !== element.intersectionWith![index])
    )
      next = { ...next, intersectionWith: links };
  }
  return next;
}

/** Repair references in legacy/untrusted documents before strict validation. */
export function normalizeDocumentReferences(
  document: DiagramDocument,
): DiagramDocument {
  const ids = new Set(document.elements.map((element) => element.id));
  let changed = false;
  const elements = document.elements.map((element) => {
    const next = normalizeElementReferences(element, ids);
    changed ||= next !== element;
    return next;
  });
  return changed ? { ...document, elements } : document;
}

/** Strict invariant used after import normalization and before persistence. */
export function hasValidDocumentReferences(document: DiagramDocument) {
  const ids = new Set(document.elements.map((element) => element.id));
  return document.elements.every((element) => {
    const validTarget = (id: string) => id !== element.id && ids.has(id);
    return (
      hardDependencyIds(element).every(validTarget) &&
      (element.intersectionWith === undefined ||
        (new Set(element.intersectionWith).size ===
          element.intersectionWith.length &&
          element.intersectionWith.every(validTarget)))
    );
  });
}

/**
 * Remove requested elements, recursively remove hard dependants, and prune
 * soft links. This keeps the document graph valid after every delete.
 */
export function removeElementsFromDocument(
  document: DiagramDocument,
  requestedIds: Iterable<string>,
): DiagramDocument {
  const removed = new Set(requestedIds);
  let changed = true;
  while (changed) {
    changed = false;
    for (const element of document.elements) {
      if (
        !removed.has(element.id) &&
        hardDependencyIds(element).some((id) => removed.has(id))
      ) {
        removed.add(element.id);
        changed = true;
      }
    }
  }
  if (!removed.size) return document;
  const kept = document.elements.filter((element) => !removed.has(element.id));
  return normalizeDocumentReferences({ ...document, elements: kept });
}
