import type {
  ConstructionRuntimeState,
  ConstructionSpec,
} from "./constructionTypes";
import { constructionParentIds } from "./constructionTypes";
import type { DiagramDocument, DiagramElement } from "./types";
import { resolveElementFromLookup } from "./sceneGeometry";
import {
  evaluateIntersectionConstruction,
  evaluatePointConstraint,
  evaluateTangentConstruction,
  type ConstructionGeometryResult,
} from "./constructionGeometry";

export type ConstructionGraph = {
  dependencies: Map<string, string[]>;
  dependents: Map<string, string[]>;
  order: string[];
  cycles: Set<string>;
};

export type ResolvedConstructionDocument = {
  document: DiagramDocument;
  states: Map<string, ConstructionRuntimeState>;
  graph: ConstructionGraph;
};

type Evaluator = (
  element: DiagramElement,
  spec: ConstructionSpec,
  parents: DiagramElement[],
) => ConstructionGeometryResult;

/**
 * Evaluators are registered in one construction layer. React components never
 * need a switch on construction kinds; adding a new geometric relation means
 * adding its schema + evaluator here (or registering it from a future module).
 */
const EVALUATORS: Record<ConstructionSpec["kind"], Evaluator> = {
  "point-on-object": (element, spec, parents) =>
    spec.kind === "point-on-object"
      ? evaluatePointConstraint(element, parents[0], spec.locator)
      : { ok: false, reason: "unsupported" },
  intersection: (element, spec, parents) =>
    spec.kind === "intersection"
      ? evaluateIntersectionConstruction(
          element,
          parents[0],
          parents[1],
          spec.selector,
        )
      : { ok: false, reason: "unsupported" },
  tangent: (element, spec, parents) =>
    spec.kind === "tangent"
      ? evaluateTangentConstruction(
          element,
          parents[0],
          parents[1],
          spec.selector,
          spec.extent,
        )
      : { ok: false, reason: "unsupported" },
};

function elementDependencies(element: DiagramElement) {
  const ids = [
    ...constructionParentIds(element.construction),
    element.fromId,
    element.toId,
  ].filter((id): id is string => !!id);
  return [...new Set(ids)];
}

export function buildConstructionGraph(document: DiagramDocument): ConstructionGraph {
  const ids = new Set(document.elements.map((element) => element.id)),
    dependencies = new Map<string, string[]>(),
    dependents = new Map<string, string[]>();
  for (const element of document.elements) {
    const deps = elementDependencies(element);
    dependencies.set(element.id, deps);
    for (const parent of deps) {
      const list = dependents.get(parent) ?? [];
      list.push(element.id);
      dependents.set(parent, list);
    }
  }

  const mark = new Map<string, 0 | 1 | 2>(),
    stack: string[] = [],
    cycles = new Set<string>(),
    order: string[] = [];
  const visit = (id: string) => {
    const state = mark.get(id) ?? 0;
    if (state === 2) return;
    if (state === 1) {
      const start = stack.lastIndexOf(id);
      for (const member of stack.slice(Math.max(0, start))) cycles.add(member);
      cycles.add(id);
      return;
    }
    mark.set(id, 1);
    stack.push(id);
    for (const parent of dependencies.get(id) ?? [])
      if (ids.has(parent)) visit(parent);
    stack.pop();
    mark.set(id, 2);
    order.push(id);
  };
  for (const element of document.elements) visit(element.id);
  return { dependencies, dependents, order, cycles };
}

function invalidState(
  spec: ConstructionSpec,
  reason: Extract<ConstructionRuntimeState, { status: "invalid" }>["reason"],
  detail?: string,
): ConstructionRuntimeState {
  return {
    status: "invalid",
    mode: spec.mode,
    kind: spec.kind,
    reason,
    detail,
  };
}

/**
 * Resolve the entire dependency graph without mutating the persisted document.
 * Invalid constructions keep their raw geometry in the returned scene document
 * but carry an explicit runtime state, so relations can recover automatically
 * when their parents become valid again.
 */
export function resolveConstructionDocument(
  document: DiagramDocument,
): ResolvedConstructionDocument {
  const graph = buildConstructionGraph(document),
    raw = new Map(document.elements.map((element) => [element.id, element])),
    resolved = new Map<string, DiagramElement>(),
    states = new Map<string, ConstructionRuntimeState>();

  for (const id of graph.order) {
    const source = raw.get(id);
    if (!source) continue;
    const spec = source.construction;
    let element = source;

    if (!spec) states.set(id, { status: "free" });
    else if (graph.cycles.has(id)) states.set(id, invalidState(spec, "cycle"));
    else {
      const parentIds = constructionParentIds(spec),
        missing = parentIds.find((parentId) => !raw.has(parentId));
      if (missing)
        states.set(
          id,
          invalidState(spec, "missing-parent", `Missing parent: ${missing}`),
        );
      else {
        const invalidParent = parentIds.find(
          (parentId) => states.get(parentId)?.status === "invalid",
        );
        if (invalidParent)
          states.set(
            id,
            invalidState(
              spec,
              "parent-invalid",
              `Parent is invalid: ${invalidParent}`,
            ),
          );
        else {
          const parents = parentIds
            .map((parentId) => resolved.get(parentId) ?? raw.get(parentId))
            .filter((parent): parent is DiagramElement => !!parent),
            result = EVALUATORS[spec.kind](source, spec, parents);
          if (result.ok) {
            element = result.element;
            states.set(id, {
              status: "valid",
              mode: spec.mode,
              kind: spec.kind,
            });
          } else states.set(id, invalidState(spec, result.reason, result.detail));
        }
      }
    }

    // Legacy connector attachment is resolved through the same already-resolved
    // lookup, so connectors can depend on constrained/derived geometry too.
    element = resolveElementFromLookup(
      element,
      (parentId) => resolved.get(parentId) ?? raw.get(parentId),
    );
    resolved.set(id, element);
  }

  return {
    document: {
      ...document,
      elements: document.elements.map((element) => resolved.get(element.id) ?? element),
    },
    states,
    graph,
  };
}

export function constructionClass(element: DiagramElement) {
  return element.construction?.mode ?? "free";
}
