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

const { makeElement } = require("../app/diagram/currentDocument.ts");
const {
  assistedLinePreview,
  assistedLineTargetAt,
  assistedLineForPointer,
  assistedLineRightAngleDecoration,
} = require("../app/diagram/assistedLine.ts");
const {
  hasArrowHead,
  rightAngleDecorationPath,
  rightAngleMarkerPath,
} = require("../app/diagram/lineMarkers.ts");
const { snapPointToScene } = require("../app/diagram/snapping.ts");
const { validDocument } = require("../app/diagram/currentExporters.ts");
const { migrateDocument } = require("../app/diagram/documentMigration.ts");
const { documentsEqual } = require("../app/diagram/currentHistory.ts");
const { ELEMENT_TYPES, isElementType } = require("../app/diagram/types.ts");
const { moveLineEndpoint } = require("../app/diagram/sceneGeometry.ts");
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

test("right-angle marks stay at the foot and never change a line into an arrow", () => {
  const target = makeElement("line", 20, 100, 240, 0);
  const base = assistedLinePreview(
    { x: 140, y: 30 },
    assistedLineTargetAt("perpendicular", { x: 140, y: 100 }, [target]),
  );
  assert.ok(base);
  const extended = assistedLineForPointer({ x: 140, y: 190 }, base, null);
  const decorated = {
    ...extended,
    marker: "right-angle-outside-right",
  };
  const mark = assistedLineRightAngleDecoration(decorated);
  assert.ok(mark);
  assert.equal(hasArrowHead(mark.marker), false);
  assert.equal(hasArrowHead("open"), true);
  near({ at: mark.at }, { at: 70 / 160 });
  assert.match(
    rightAngleMarkerPath(
      { x: 140, y: 100 },
      { x: 0, y: 160 },
      mark.marker,
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

test("v1 documents migrate through the explicit schema pipeline", () => {
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
  assert.equal(migrated.elements[0].endHead, "none");
  assert.deepEqual(migrated.elements[0].rightAngle, {
    marker: "right-angle-inside-left",
    at: 1,
  });
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
