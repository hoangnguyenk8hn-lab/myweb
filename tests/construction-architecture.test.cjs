const fs = require("node:fs");
const assert = require("node:assert/strict");
const { test } = require("node:test");
const ts = require("typescript");

require.extensions[".ts"] = (module, file) =>
  module._compile(
    ts.transpileModule(fs.readFileSync(file, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        esModuleInterop: true,
      },
    }).outputText,
    file,
  );

const {
  blankDocument,
  isDrawableTool,
  makeElement,
} = require("../app/diagram/currentDocument.ts");
const {
  assistedLinePreview,
  assistedLineTargetAt,
  assistedLineForPointer,
  assistedLineEndHead,
  assistedLineRightAngleGuidePath,
} = require("../app/diagram/assistedLine.ts");
const {
  hasArrowHead,
  markerReferenceX,
  rightAngleDecorationPath,
  rightAngleMarkerPath,
} = require("../app/diagram/lineMarkers.ts");
const { snapPointToScene } = require("../app/diagram/snapping.ts");
const {
  loadDocument,
  validDocument,
} = require("../app/diagram/currentExporters.ts");
const {
  hasValidDocumentReferences,
  normalizeDocumentReferences,
  removeElementsFromDocument,
} = require("../app/diagram/documentGraph.ts");
const { migrateDocument } = require("../app/diagram/documentMigration.ts");
const { documentsEqual } = require("../app/diagram/currentHistory.ts");
const { ELEMENT_TYPES, isElementType } = require("../app/diagram/types.ts");
const { moveLineEndpoint } = require("../app/diagram/sceneGeometry.ts");
const {
  selectedStraightLineTargetIds,
  straightLineTargets,
} = require("../app/diagram/constructionTargets.ts");
const near = (actual, expected, tolerance = 1e-7) =>
  Object.entries(expected).forEach(([key, value]) =>
    assert.ok(
      Math.abs(actual[key] - value) <= tolerance,
      `${key}: ${actual[key]} != ${value}`,
    ),
  );

test("angle bisector is an explicit request and cannot leak into perpendicular", () => {
  const horizontal = makeElement("line", 100, 100, 160, 0);
  const vertical = makeElement("line", 100, 100, 0, 160);
  const source = { x: 100, y: 100 };
  const bisectorTarget = assistedLineTargetAt(
    "angle-bisector",
    { x: 160, y: 160 },
    [horizontal, vertical],
    1,
  );
  assert.equal(bisectorTarget?.kind, "angle-bisector");
  const preview = assistedLinePreview(source, bisectorTarget);
  assert.equal(preview?.kind, "angle-bisector");

  const perpendicularTarget = assistedLineTargetAt(
    "perpendicular",
    { x: 160, y: 103 },
    [horizontal, vertical],
    1,
  );
  assert.equal(perpendicularTarget?.kind, "perpendicular");
  assert.equal(perpendicularTarget?.id, horizontal.id);
});

test("angle bisector can target the two selected outer rays among three", () => {
  const horizontal = makeElement("line", 100, 100, 160, 0),
    middle = makeElement("line", 100, 100, 120, 120),
    vertical = makeElement("line", 100, 100, 0, 160),
    source = { x: 100, y: 100 },
    pointer = { x: 140, y: 145 };

  const automatic = assistedLinePreview(
    source,
    assistedLineTargetAt(
      "angle-bisector",
      pointer,
      [horizontal, middle, vertical],
      1,
    ),
  );
  assert.ok(automatic);
  assert.ok(
    [automatic.target.id, automatic.secondTarget.id].includes(middle.id),
  );

  const selectedOuter = assistedLinePreview(
    source,
    assistedLineTargetAt(
      "angle-bisector",
      pointer,
      [horizontal, vertical],
      1,
    ),
  );
  assert.ok(selectedOuter);
  assert.deepEqual(
    new Set([selectedOuter.target.id, selectedOuter.secondTarget.id]),
    new Set([horizontal.id, vertical.id]),
  );
  near(selectedOuter.bisectorDirection, {
    x: Math.SQRT1_2,
    y: Math.SQRT1_2,
  });
});

test("selected bisector targets are captured separately from selection handles", () => {
  const first = makeElement("line", 100, 100, 100, 0),
    second = makeElement("arrow", 100, 100, 0, 100),
    middle = makeElement("line", 100, 100, 80, 80),
    elements = [first, second, middle];
  assert.deepEqual(
    selectedStraightLineTargetIds(elements, [first.id, second.id]),
    [first.id, second.id],
  );
  assert.equal(straightLineTargets([second]).length, 1);
  assert.deepEqual(
    selectedStraightLineTargetIds(elements, [first.id, second.id, middle.id]),
    [],
  );
});

test("perpendicular construction can extend past its foot and keeps marker selection", () => {
  const target = makeElement("line", 20, 100, 240, 0);
  const base = assistedLinePreview(
    { x: 140, y: 30 },
    assistedLineTargetAt("perpendicular", { x: 140, y: 100 }, [target]),
  );
  assert.ok(base);
  const extended = assistedLineForPointer({ x: 140, y: 190 }, base, null);
  near(extended.end, { x: 140, y: 190 });
  const fixed = assistedLineForPointer(
    { x: 150, y: 110 },
    base,
    extended.end,
  );
  near(fixed.end, extended.end);
  const decorated = {
    ...fixed,
    marker: "right-angle-outside-right",
  };
  const endHead = assistedLineEndHead(decorated);
  assert.equal(endHead, "right-angle-outside-right");
  assert.equal(hasArrowHead(endHead), false);
  assert.equal(hasArrowHead("open"), true);
  assert.match(
    rightAngleMarkerPath(
      { x: 140, y: 100 },
      { x: 0, y: 160 },
      endHead,
      9,
    ),
    /^M140 100L/,
  );
});

test("right-angle decorations keep the same 4/10 glyph size as legacy endHead", () => {
  const line = makeElement("line", 0, 0, 100, 0);
  assert.equal(
    rightAngleDecorationPath(
      line,
      { marker: "right-angle-inside-left", at: 1 },
      9,
    ),
    "M100 0L100 -3.6L96.4 -3.6L96.4 0",
  );
});

test("round endpoint markers anchor at their visual center", () => {
  assert.equal(markerReferenceX("dot"), 5);
  assert.equal(markerReferenceX("circle"), 5);
  assert.equal(markerReferenceX("arrow"), 8);
});

test("perpendicular preview guides stay large while committed marks use legacy size", () => {
  const target = makeElement("line", 20, 100, 240, 0);
  const preview = assistedLinePreview(
    { x: 140, y: 30 },
    assistedLineTargetAt("perpendicular", { x: 140, y: 100 }, [target]),
  );
  assert.ok(preview);
  assert.equal(
    assistedLineRightAngleGuidePath(
      preview,
      "right-angle-inside-left",
      9,
    ),
    "M140 100L149 100L149 91L140 91",
  );
});

test("right-angle decorations round-trip as bounded document data", () => {
  const line = {
    ...makeElement("line", 10, 10, 160, 0),
    rightAngle: { marker: "right-angle-inside-left", at: 0.4 },
  };
  const document = {
    version: 2,
    width: 700,
    height: 400,
    grid: { visible: true, size: 10, snap: false, snapShapes: true, editOnly: false },
    elements: [line],
  };
  assert.equal(validDocument(document), true);
  assert.equal(
    validDocument({
      ...document,
      elements: [{ ...line, rightAngle: { ...line.rightAngle, at: 1.2 } }],
    }),
    false,
  );
});

test("all construction starts use the shared snap precedence", () => {
  const grid = {
    visible: true,
    size: 10,
    snap: true,
    snapShapes: false,
    editOnly: false,
  };
  near(
    snapPointToScene(
      { x: 14, y: 26 },
      { grid, elements: [], targets: [], zoom: 1 },
    ).point,
    { x: 10, y: 30 },
  );
  const result = snapPointToScene(
    { x: 14, y: 26 },
    {
      grid,
      elements: [],
      targets: [{ point: { x: 17, y: 28 }, kind: "point", ids: ["p"] }],
      zoom: 1,
    },
  );
  near(result.point, { x: 17, y: 28 });
  assert.equal(result.target?.kind, "point");
});

test("v1 migration preserves user-selected right-angle endHead", () => {
  const line = {
    ...makeElement("line", 10, 10, 120, 0),
    endHead: "right-angle-inside-left",
  };
  const legacy = {
    version: 1,
    width: 700,
    height: 400,
    grid: { visible: true, size: 10, snap: false, editOnly: false },
    elements: [line],
  };
  const migrated = migrateDocument(legacy);
  assert.equal(migrated.version, 2);
  assert.equal(migrated.elements[0].endHead, "right-angle-inside-left");
  assert.equal(migrated.elements[0].rightAngle, undefined);
  assert.equal(validDocument(migrated), true);
  assert.equal(migrateDocument({ ...legacy, version: 99 }), null);
});

test("persisted element validation uses the shared runtime registry", () => {
  for (const type of ELEMENT_TYPES) assert.equal(isElementType(type), true);
  const point = makeElement("point", 20, 20, 0, 0);
  const document = {
    version: 2,
    width: 700,
    height: 400,
    grid: { visible: true, size: 10, snap: false, editOnly: false },
    elements: [point],
  };
  assert.equal(validDocument(document), true);
  assert.equal(
    validDocument({ ...document, elements: [{ ...point, type: "unknown-tool" }] }),
    false,
  );
});

test("Option behavior is explicit per gesture instead of module-global state", () => {
  const line = makeElement("line", 0, 0, 100, 0);
  const free = moveLineEndpoint(line, 1, { x: 120, y: 40 });
  const constrained = moveLineEndpoint(
    line,
    1,
    { x: 120, y: 40 },
    { altKey: true },
  );
  assert.notEqual(free.height, 0);
  assert.equal(constrained.height, 0);
});

test("history equality is structural and does not serialize documents", () => {
  const document = {
    version: 2,
    width: 700,
    height: 400,
    grid: { visible: true, size: 10, snap: false, editOnly: false },
    elements: [makeElement("line", 0, 0, 100, 0)],
  };
  assert.equal(documentsEqual(document, document), true);
  assert.equal(
    documentsEqual(document, {
      ...document,
      elements: [{ ...document.elements[0] }],
    }),
    true,
  );
  assert.equal(
    documentsEqual(document, {
      ...document,
      elements: [{ ...document.elements[0], x: 1 }],
    }),
    false,
  );
  const source = fs.readFileSync(
    require.resolve("../app/diagram/currentHistory.ts"),
    "utf8",
  );
  assert.doesNotMatch(source, /JSON\.stringify/);
});

test("removed vertex and modifier bridges do not remain in the canvas DOM", () => {
  const canvas = fs.readFileSync(
    require.resolve("../app/diagram/CurrentCanvasCore.tsx"),
    "utf8",
  );
  const geometry = fs.readFileSync(
    require.resolve("../app/diagram/sceneGeometryBase.ts"),
    "utf8",
  );
  assert.doesNotMatch(canvas, /vertex-add-handle|vertex-remove-handle/);
  assert.doesNotMatch(geometry, /addLineVertex|removeLineVertex/);
  assert.equal(
    fs.existsSync(require.resolve("../app/diagram/sceneGeometry.ts").replace(
      /sceneGeometry\.ts$/,
      "modifierState.ts",
    )),
    false,
  );
});

test("construction modules depend on one shared geometry kernel", () => {
  const perpendicular = fs.readFileSync(
    require.resolve("../app/diagram/perpendicular.ts"),
    "utf8",
  );
  const bisector = fs.readFileSync(
    require.resolve("../app/diagram/angleBisector.ts"),
    "utf8",
  );
  const intersections = fs.readFileSync(
    require.resolve("../app/diagram/intersections.ts"),
    "utf8",
  );
  assert.match(perpendicular, /geometryKernel/);
  assert.match(bisector, /geometryKernel/);
  assert.match(intersections, /geometryKernel/);
  assert.doesNotMatch(perpendicular, /function segmentIntersection/);
  assert.doesNotMatch(bisector, /function segmentIntersection/);
});

test("only registered drawable tools can create persisted elements", () => {
  assert.equal(isDrawableTool("line"), true);
  assert.equal(isDrawableTool("shape:ellipse"), true);
  assert.equal(isDrawableTool("shape"), false);
  assert.equal(isDrawableTool("shape:not-registered"), false);
  assert.equal(isDrawableTool("tangent"), false);
  assert.equal(isDrawableTool("select"), false);
  assert.throws(() => makeElement("tangent"), /Cannot create an element/);
  assert.throws(() => makeElement("shape"), /Cannot create an element/);
  assert.throws(
    () => makeElement("shape:not-registered"),
    /Cannot create an element/,
  );

  const catalog = fs.readFileSync(
    require.resolve("../app/diagram/catalog.tsx"),
    "utf8",
  );
  assert.doesNotMatch(catalog, /TOOL_GROUPS|labelForTool/);
});

test("document graph cascades hard dependencies and prunes soft links", () => {
  const anchor = makeElement("text", 20, 20),
    survivor = makeElement("text", 200, 20),
    connector = {
      ...makeElement("line", 20, 20, 180, 0),
      fromId: anchor.id,
      toId: survivor.id,
    },
    dependent = {
      ...makeElement("line", 20, 60, 180, 0),
      fromId: connector.id,
      toId: survivor.id,
    },
    markerOwner = {
      ...makeElement("line", 0, 100, 250, 0),
      intersection: true,
      intersectionWith: [anchor.id, survivor.id],
    },
    document = {
      ...blankDocument(),
      elements: [anchor, survivor, connector, dependent, markerOwner],
    },
    next = removeElementsFromDocument(document, [anchor.id]);

  assert.deepEqual(
    next.elements.map((element) => element.id),
    [survivor.id, markerOwner.id],
  );
  assert.deepEqual(next.elements[1].intersectionWith, [survivor.id]);
  assert.equal(hasValidDocumentReferences(next), true);
});

test("imports repair legacy dangling references before strict validation", async () => {
  const anchor = makeElement("text", 20, 20),
    line = {
      ...makeElement("line", 20, 20, 100, 0),
      fromId: "missing",
    };
  // A self-reference and duplicate/missing soft links simulate old corrupted
  // saves that previously remained in the editor indefinitely.
  line.toId = line.id;
  line.intersectionWith = [anchor.id, anchor.id, line.id, "missing"];
  const document = { ...blankDocument(), elements: [anchor, line] };
  assert.equal(validDocument(document), false);

  const normalized = normalizeDocumentReferences(document);
  assert.equal(normalized.elements[1].fromId, undefined);
  assert.equal(normalized.elements[1].toId, undefined);
  assert.deepEqual(normalized.elements[1].intersectionWith, [anchor.id]);
  assert.equal(validDocument(normalized), true);

  const loaded = await loadDocument(document);
  assert.ok(loaded);
  assert.equal(hasValidDocumentReferences(loaded), true);

  const malformed = structuredClone(document);
  malformed.elements[1].intersectionWith = "not-an-array";
  assert.equal(await loadDocument(malformed), null);
});
