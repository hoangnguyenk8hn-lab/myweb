export type ConstructionMode = "constrained" | "derived";

export type ConstructionPoint = { x: number; y: number };

/**
 * A locator stores the degree of freedom of a constrained point instead of
 * storing another absolute coordinate. The construction engine evaluates the
 * locator against the current parent geometry on every resolve pass.
 */
export type PointOnObjectLocator =
  | {
      kind: "segment";
      /** Segment index for a polyline-like parent. */
      segment: number;
      /** Parameter on that segment, clamped to [0, 1]. */
      t: number;
    }
  | {
      kind: "circle";
      /** Angle in the parent's local ellipse frame, in radians. */
      angle: number;
    }
  | {
      kind: "path";
      /** Normalized path-length parameter, clamped to [0, 1]. */
      t: number;
    };

/**
 * Branch selection is intentionally data, not UI state. `seed` gives generic
 * solvers a stable geometric hint; `branch` is a deterministic fallback.
 * The selector can later gain stronger continuation keys without changing the
 * construction graph or renderer contracts.
 */
export type ConstructionBranchSelector = {
  branch: number;
  seed?: ConstructionPoint;
};

export type PointOnObjectConstruction = {
  mode: "constrained";
  kind: "point-on-object";
  parents: [string];
  locator: PointOnObjectLocator;
};

export type IntersectionConstruction = {
  mode: "derived";
  kind: "intersection";
  parents: [string, string];
  selector: ConstructionBranchSelector;
};

export type TangentConstruction = {
  mode: "derived";
  kind: "tangent";
  /** parents[0] is the source Point; parents[1] is the target curve. */
  parents: [string, string];
  selector: ConstructionBranchSelector;
  /** Segment keeps the external-point tangent finite; line is useful on-curve. */
  extent?: "segment" | "line";
};

export type ConstructionSpec =
  | PointOnObjectConstruction
  | IntersectionConstruction
  | TangentConstruction;

export type ConstructionKind = ConstructionSpec["kind"];

export type ConstructionInvalidReason =
  | "missing-parent"
  | "parent-invalid"
  | "cycle"
  | "no-solution"
  | "unsupported"
  | "invalid-parameters";

/** Runtime-only state. It is never persisted into DiagramElement. */
export type ConstructionRuntimeState =
  | { status: "free" }
  | {
      status: "valid";
      mode: ConstructionMode;
      kind: ConstructionKind;
    }
  | {
      status: "invalid";
      mode: ConstructionMode;
      kind: ConstructionKind;
      reason: ConstructionInvalidReason;
      detail?: string;
    };

const finite = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);
const point = (value: unknown): value is ConstructionPoint =>
  !!value &&
  typeof value === "object" &&
  finite((value as ConstructionPoint).x) &&
  finite((value as ConstructionPoint).y);
const parents = (value: unknown, count: number): value is string[] =>
  Array.isArray(value) &&
  value.length === count &&
  value.every((id) => typeof id === "string" && !!id);
const selector = (value: unknown): value is ConstructionBranchSelector =>
  !!value &&
  typeof value === "object" &&
  Number.isInteger((value as ConstructionBranchSelector).branch) &&
  (value as ConstructionBranchSelector).branch >= 0 &&
  ((value as ConstructionBranchSelector).seed === undefined ||
    point((value as ConstructionBranchSelector).seed));

/** Runtime guard for imported JSON and old documents. */
export function isConstructionSpec(value: unknown): value is ConstructionSpec {
  if (!value || typeof value !== "object") return false;
  const spec = value as Record<string, unknown>;
  if (spec.kind === "point-on-object") {
    if (spec.mode !== "constrained" || !parents(spec.parents, 1)) return false;
    const locator = spec.locator;
    if (!locator || typeof locator !== "object") return false;
    const l = locator as Record<string, unknown>;
    if (l.kind === "segment")
      return finite(l.segment) &&
        Number.isInteger(l.segment) &&
        l.segment >= 0 &&
        finite(l.t) &&
        l.t >= 0 &&
        l.t <= 1;
    if (l.kind === "circle") return finite(l.angle);
    if (l.kind === "path") return finite(l.t) && l.t >= 0 && l.t <= 1;
    return false;
  }
  if (spec.kind === "intersection")
    return (
      spec.mode === "derived" &&
      parents(spec.parents, 2) &&
      selector(spec.selector)
    );
  if (spec.kind === "tangent")
    return (
      spec.mode === "derived" &&
      parents(spec.parents, 2) &&
      selector(spec.selector) &&
      (spec.extent === undefined || ["segment", "line"].includes(spec.extent as string))
    );
  return false;
}

export function constructionParentIds(spec: ConstructionSpec | undefined): string[] {
  return spec ? [...spec.parents] : [];
}

export function remapConstruction(
  spec: ConstructionSpec | undefined,
  ids: Map<string, string>,
): ConstructionSpec | undefined {
  if (!spec) return undefined;
  const remap = (id: string) => ids.get(id) ?? id;
  if (spec.kind === "point-on-object")
    return { ...spec, parents: [remap(spec.parents[0])] };
  return {
    ...spec,
    parents: [remap(spec.parents[0]), remap(spec.parents[1])],
  } as ConstructionSpec;
}
