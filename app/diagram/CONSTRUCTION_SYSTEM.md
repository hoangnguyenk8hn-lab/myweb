# Dynamic Geometry / Construction System

## Architectural boundary

The persisted `DiagramDocument` is the source of truth. Rendering and hit testing consume a resolved scene produced by `constructionEngine.ts`.

```text
Persisted DiagramDocument
        |
        v
Construction Graph
  - dependencies
  - cycle detection
  - topological order
  - construction evaluators
        |
        v
Resolved DiagramDocument + Runtime States
        |
        +--> renderer
        +--> snapping
        +--> intersections
        +--> hit testing
```

Construction code must not be implemented inside `SceneElement`, toolbar components, or mouse gesture branches. UI code may only ask the construction interaction adapter to create/update a persistent relation.

## Free / Constrained / Derived

- **Free**: `element.construction` is absent. Geometry is directly editable.
- **Constrained**: `construction.mode === "constrained"`. The element has a degree of freedom represented by parameters. Dragging changes those parameters, not arbitrary coordinates.
- **Derived**: `construction.mode === "derived"`. Geometry is computed entirely from parent elements and is not freely draggable.

Current initial construction kinds:

- `point-on-object`
- `intersection`
- `tangent`
- `tangent-point`
- `line-through-points`

## Reusable construction outputs

Multi-result tools materialize every geometrically meaningful result as an
element in the document. The Tangent tool therefore creates both tangent lines
and their contact Points. A contact Point can be selected, snapped to, and used
as a parent by later constructions.

Drawing a Line or Arrow from one persistent Point to another creates a
`line-through-points` relation automatically. This makes chains such as
`Point on Line -> tangent contacts A/B -> Line AB` resolve in dependency order
without any tool-specific propagation code.

Future kinds should follow the same evaluator contract (`midpoint`, `projection`, `perpendicular`, `parallel`, `angle-bisector`, circumcenter, etc.).

## Snap is not a Constraint

A snap target is temporary pointer assistance. It never creates a dependency by itself.

A persistent constraint is created only when a construction interaction explicitly writes a `construction` spec into an element. This keeps free drawing behavior independent from dynamic geometry.

## Dependency graph

Every construction parent ID is an edge `parent -> child`. Legacy connector `fromId/toId` references are also included in dependency ordering so connectors can follow constrained/derived parents.

The engine resolves parents before children. Cycles are detected and reported as runtime `invalid` states instead of recursing forever.

## Invalid constructions

A construction relation remains persisted even when its geometry temporarily has no solution.

Examples:

- an intersection disappears,
- a tangent source moves inside a circle,
- a parent is deleted,
- a parent construction is itself invalid,
- a dependency cycle is introduced.

The engine reports one of:

- `missing-parent`
- `parent-invalid`
- `cycle`
- `no-solution`
- `unsupported`
- `invalid-parameters`

The raw geometry is kept as a fallback while the construction is invalid. If the parents become valid again, the construction resolves automatically.

## Files

- `constructionTypes.ts`: persisted relation schema and runtime-state types.
- `constructionGeometry.ts`: pure geometry adapters/evaluators. Reuses existing `intersections.ts` and `tangents.ts` solvers.
- `constructionEngine.ts`: graph building, ordering, cycle detection and evaluator registry.
- `constructionInteraction.ts`: non-React adapter used by mouse/tools to create or update relations.
- `currentHistory.ts`: stores source documents, exposes a resolved scene document.
- `sceneGeometry.ts`: lookup-based legacy connector resolution used by the graph engine.

## Extension rule

To add a construction kind:

1. Add a discriminated schema to `ConstructionSpec`.
2. Add one geometry evaluator.
3. Register it in `constructionEngine.ts`.
4. Add an interaction command/tool only if the relation needs user creation UI.
5. Do not add construction-specific logic to the renderer.

Branch-dependent constructions (intersection/tangent) store a branch selector with a geometric seed. This is intentionally abstract so stronger continuation/branch identity can be introduced later without changing the graph architecture.
