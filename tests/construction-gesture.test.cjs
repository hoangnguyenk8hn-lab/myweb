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
  commitConstructionGesture,
  startConstructionGesture,
  updateConstructionGesture,
} = require("../app/diagram/constructionGesture.ts");
const { makeElement } = require("../app/diagram/currentDocument.ts");
const { CONSTRUCTION_TOOLS } = require("../app/diagram/types.ts");

const near = (actual, expected, tolerance = 1e-7) =>
  Object.entries(expected).forEach(([key, value]) =>
    assert.ok(
      Math.abs(actual[key] - value) <= tolerance,
      `${key}: ${actual[key]} != ${value}`,
    ),
  );

const scene = (elements = [], snapTargets = []) => ({
  elements,
  snapTargets,
  zoom: 1,
});

const startContext = (overrides = {}) => ({
  ...scene(),
  rawPoint: { x: 20, y: 20 },
  snappedPoint: { x: 20, y: 20 },
  snappedToTarget: false,
  ...overrides,
});

test("every registered construction tool starts through the same session contract", () => {
  for (const tool of CONSTRUCTION_TOOLS) {
    const session = startConstructionGesture(tool, startContext());
    assert.equal(session.kind, "construction");
    assert.equal(session.tool, tool);
    assert.equal(session.preview, null);
  }
});

test("angle bisector captures an explicit pair without ambient editor state", () => {
  const first = makeElement("line", 100, 100, 100, 0);
  const second = makeElement("line", 100, 100, 0, 100);
  const session = startConstructionGesture(
    "angle-bisector",
    startContext({
      elements: [first, second],
      snappedPoint: { x: 100, y: 100 },
      rawPoint: { x: 100, y: 100 },
      angleBisectorTargetIds: [first.id, second.id],
    }),
  );
  assert.deepEqual(session.targetIds, [first.id, second.id]);

  const result = commitConstructionGesture(
    session,
    { x: 145, y: 145 },
    scene([first, second]),
  );
  assert.ok(result.element);
  assert.equal(result.element.type, "line");
  assert.ok(result.element.width > 0);
  assert.ok(result.element.height > 0);
  assert.ok(Math.abs(result.element.width - result.element.height) < 1e-7);
});

test("perpendicular update and commit preserve the exact foot behavior", () => {
  const axis = makeElement("line", 20, 100, 240, 0);
  const session = startConstructionGesture(
    "perpendicular",
    startContext({
      elements: [axis],
      rawPoint: { x: 140, y: 30 },
      snappedPoint: { x: 140, y: 30 },
    }),
  );
  const updated = updateConstructionGesture(
    session,
    { x: 140, y: 100 },
    scene([axis]),
  );
  assert.equal(updated.preview?.kind, "perpendicular");
  near(updated.preview.start, { x: 140, y: 30 });
  near(updated.preview.end, { x: 140, y: 100 });

  const result = commitConstructionGesture(
    updated,
    { x: 140, y: 100 },
    scene([axis]),
  );
  assert.ok(result.element);
  assert.equal(result.element.type, "line");
  near(
    {
      x: result.element.x,
      y: result.element.y,
      width: result.element.width,
      height: result.element.height,
    },
    { x: 140, y: 30, width: 0, height: 70 },
  );
});

test("point reflection materializes only after a valid construction preview", () => {
  const target = {
    point: { x: 50, y: 50 },
    kind: "point",
    ids: ["anchor"],
  };
  const session = startConstructionGesture(
    "point-reflection",
    startContext({
      rawPoint: { x: 20, y: 10 },
      snappedPoint: { x: 20, y: 10 },
      snapTargets: [target],
    }),
  );

  const empty = commitConstructionGesture(
    session,
    { x: 200, y: 200 },
    scene([], [target]),
  );
  assert.equal(empty.element, null);

  const result = commitConstructionGesture(
    session,
    { x: 50, y: 50 },
    scene([], [target]),
  );
  assert.ok(result.element);
  assert.equal(result.element.type, "point");
  near({ x: result.element.x, y: result.element.y }, { x: 80, y: 90 });
});

test("construction commit never owns history or selection side effects", () => {
  const source = fs.readFileSync(
    require.resolve("../app/diagram/constructionGesture.ts"),
    "utf8",
  );
  assert.doesNotMatch(source, /onBegin|onEnd|onCancel|onSelect|onReplace/);
});
