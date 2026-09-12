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
  perpendicularPreview,
  perpendicularTargetAt,
  perpendicularLineForPointer,
  rightAngleDecorationForPreview,
} = require("../app/diagram/perpendicular.ts");
const {
  hasArrowHead,
  rightAngleMarkerPath,
} = require("../app/diagram/lineMarkers.ts");
const { snapPointToScene } = require("../app/diagram/snapping.ts");
const { validDocument } = require("../app/diagram/currentExporters.ts");
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
  const bisectorTarget = perpendicularTargetAt(
    { x: 160, y: 160 },
    [horizontal, vertical],
    1,
    "angle-bisector",
  );
  assert.equal(bisectorTarget?.mode, "angle-bisector");
  const preview = perpendicularPreview(source, bisectorTarget);
  assert.equal(preview?.mode, "angle-bisector");

  const perpendicularTarget = perpendicularTargetAt(
    { x: 160, y: 103 },
    [horizontal, vertical],
    1,
    "perpendicular",
  );
  assert.equal(perpendicularTarget?.mode, undefined);
  assert.equal(perpendicularTarget?.id, horizontal.id);
});

test("right-angle marks stay at the foot and never change a line into an arrow", () => {
  const target = makeElement("line", 20, 100, 240, 0);
  const base = perpendicularPreview(
    { x: 140, y: 30 },
    perpendicularTargetAt({ x: 140, y: 100 }, [target]),
  );
  assert.ok(base);
  const extended = perpendicularLineForPointer({ x: 140, y: 190 }, base, null);
  const decorated = {
    ...extended,
    marker: "right-angle-outside-right",
  };
  const mark = rightAngleDecorationForPreview(decorated);
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

test("right-angle decorations round-trip as bounded document data", () => {
  const line = {
    ...makeElement("line", 10, 10, 160, 0),
    rightAngle: { marker: "right-angle-inside-left", at: 0.4 },
  };
  const document = {
    version: 1,
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
