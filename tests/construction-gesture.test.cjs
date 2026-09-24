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
const { tangentCandidates } = require("../app/diagram/tangents.ts");
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
  assert.equal(result.elements.length, 1);
  const [element] = result.elements;
  assert.equal(element.type, "line");
  assert.ok(element.width > 0);
  assert.ok(element.height > 0);
  assert.ok(Math.abs(element.width - element.height) < 1e-7);
});

test("perpendicular extends past its foot and stores an adjustable interior mark", () => {
  const axis = makeElement("line", 20, 100, 240, 0);
  const session = startConstructionGesture(
    "perpendicular",
    startContext({
      elements: [axis],
      rawPoint: { x: 140, y: 30 },
      snappedPoint: { x: 140, y: 30 },
    }),
  );
  const atFoot = updateConstructionGesture(
    session,
    { x: 140, y: 100 },
    scene([axis]),
  );
  assert.equal(atFoot.preview?.kind, "perpendicular");
  near(atFoot.preview.start, { x: 140, y: 30 });
  near(atFoot.preview.end, { x: 140, y: 100 });

  const extended = updateConstructionGesture(
    atFoot,
    { x: 140, y: 190 },
    scene([axis]),
  );
  near(extended.preview.end, { x: 140, y: 190 });

  const marked = updateConstructionGesture(
    extended,
    { x: 150, y: 110 },
    scene([axis]),
  );
  near(marked.preview.end, { x: 140, y: 190 });
  assert.ok(marked.preview.marker);

  const result = commitConstructionGesture(
    marked,
    { x: 150, y: 110 },
    scene([axis]),
  );
  assert.equal(result.elements.length, 1);
  const [element] = result.elements;
  assert.equal(element.type, "line");
  near(
    {
      x: element.x,
      y: element.y,
      width: element.width,
      height: element.height,
    },
    { x: 140, y: 30, width: 0, height: 160 },
  );
  assert.equal(element.endHead, "none");
  assert.equal(element.rightAngle.marker, marked.preview.marker);
  assert.ok(Math.abs(element.rightAngle.at - 70 / 160) < 1e-7);
});

test("Shift commits both external tangent branches in one construction result", () => {
  const circle = makeElement("shape:circle", 0, 0, 100, 100),
    source = { x: -60, y: 50 },
    candidates = tangentCandidates(source, circle);
  assert.equal(candidates.length, 2);

  const session = startConstructionGesture(
    "tangent",
    startContext({
      elements: [circle],
      rawPoint: source,
      snappedPoint: source,
    }),
  );
  const pointer = candidates[0].contact;
  const single = commitConstructionGesture(
    session,
    pointer,
    scene([circle]),
    { shiftKey: false },
  );
  assert.equal(single.elements.length, 1);

  const both = commitConstructionGesture(
    session,
    pointer,
    scene([circle]),
    { shiftKey: true },
  );
  assert.equal(both.elements.length, 2);
  assert.notEqual(both.elements[0].id, both.elements[1].id);
  assert.deepEqual(
    new Set(both.elements.map((line) => `${line.width.toFixed(6)},${line.height.toFixed(6)}`)).size,
    2,
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
  assert.deepEqual(empty.elements, []);

  const result = commitConstructionGesture(
    session,
    { x: 50, y: 50 },
    scene([], [target]),
  );
  assert.equal(result.elements.length, 1);
  assert.equal(result.elements[0].type, "point");
  near({ x: result.elements[0].x, y: result.elements[0].y }, { x: 80, y: 90 });
});

test("construction commit never owns history or selection side effects", () => {
  const source = fs.readFileSync(
    require.resolve("../app/diagram/constructionGesture.ts"),
    "utf8",
  );
  assert.doesNotMatch(source, /onBegin|onEnd|onCancel|onSelect|onReplace/);
});

test("CurrentCanvasCore delegates construction geometry to the engine", () => {
  const source = fs.readFileSync(
    require.resolve("../app/diagram/CurrentCanvasCore.tsx"),
    "utf8",
  );
  assert.match(source, /startConstructionGesture/);
  assert.match(source, /updateConstructionGesture/);
  assert.match(source, /commitConstructionGesture/);
  assert.doesNotMatch(
    source,
    /tangentCandidates|assistedLineTargetAt|pointReflectionTargetAt/,
  );
});
