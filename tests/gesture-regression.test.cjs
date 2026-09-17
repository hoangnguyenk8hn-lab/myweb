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
  isDrawableTool,
  makeElement,
} = require("../app/diagram/currentDocument.ts");
const {
  cancelGestureLifecycle,
  commitGestureLifecycle,
  gestureModifiers,
  gestureNeedsFinalMove,
  gestureStartsTransaction,
  moveGestureLifecycle,
  prepareGestureStart,
  startGestureLifecycle,
  syncGestureModifiers,
} = require("../app/diagram/gestureLifecycle.ts");
const {
  tangentLineForPointer,
  tangentRetainsCandidateAt,
} = require("../app/diagram/tangents.ts");
const {
  pointReflectionPreview,
  pointReflectionTargetAt,
} = require("../app/diagram/pointReflection.ts");
const { CONSTRUCTION_TOOLS } = require("../app/diagram/types.ts");

const near = (actual, expected, tolerance = 1e-7) =>
  Object.entries(expected).forEach(([key, value]) =>
    assert.ok(
      Math.abs(actual[key] - value) <= tolerance,
      `${key}: ${actual[key]} != ${value}`,
    ),
  );

test("construction tools can never fall through to drawable element creation", () => {
  for (const tool of CONSTRUCTION_TOOLS) {
    assert.equal(isDrawableTool(tool), false, `${tool} must stay non-drawable`);
    assert.throws(
      () => makeElement(tool, 0, 0),
      /Cannot create an element from tool/,
      `${tool} must require an explicit construction commit`,
    );
  }
});

test("gesture transaction policy excludes only pan and marquee", () => {
  assert.equal(
    gestureStartsTransaction({
      kind: "pan",
      start: { x: 0, y: 0 },
      scroll: { x: 0, y: 0 },
    }),
    false,
  );
  assert.equal(
    gestureStartsTransaction({
      kind: "marquee",
      start: { x: 0, y: 0 },
      add: [],
    }),
    false,
  );
  assert.equal(
    gestureStartsTransaction({
      kind: "point-reflection",
      start: { x: 0, y: 0 },
    }),
    true,
  );
});

test("gesture lifecycle owns one transaction from start through commit", () => {
  const line = makeElement("line", 0, 0, 100, 0);
  const started = startGestureLifecycle(
    { kind: "endpoint", index: 1, original: line },
    gestureModifiers({ altKey: false }),
  );
  assert.equal(started.beginTransaction, true);
  assert.equal(started.transactionOpen, true);
  assert.equal(started.endTransaction, false);
  assert.equal(started.cancelTransaction, false);

  const moved = moveGestureLifecycle(
    started,
    gestureModifiers({ altKey: true }),
  );
  assert.equal(moved.transactionOpen, true);
  assert.equal(moved.disableGridSnap, true);
  assert.equal(moved.gesture.constrainToAxis, true);

  const committed = commitGestureLifecycle(moved);
  assert.equal(committed.gesture, null);
  assert.equal(committed.transactionOpen, false);
  assert.equal(committed.beginTransaction, false);
  assert.equal(committed.endTransaction, true);
  assert.equal(committed.cancelTransaction, false);
});

test("gesture lifecycle cancel restores an open transaction and ignores view-only gestures", () => {
  const line = makeElement("line", 0, 0, 100, 0);
  const editing = startGestureLifecycle(
    { kind: "endpoint", index: 1, original: line },
    gestureModifiers({}),
  );
  const cancelled = cancelGestureLifecycle(editing);
  assert.equal(cancelled.gesture, null);
  assert.equal(cancelled.transactionOpen, false);
  assert.equal(cancelled.cancelTransaction, true);
  assert.equal(cancelled.endTransaction, false);

  const pan = startGestureLifecycle(
    {
      kind: "pan",
      start: { x: 0, y: 0 },
      scroll: { x: 0, y: 0 },
    },
    gestureModifiers({}),
  );
  assert.equal(pan.beginTransaction, false);
  assert.equal(pan.transactionOpen, false);
  assert.equal(commitGestureLifecycle(pan).endTransaction, false);
  assert.equal(cancelGestureLifecycle(pan).cancelTransaction, false);
});

test("Option endpoint constraint latches while ordinary handle grid suppression does not", () => {
  const line = makeElement("line", 0, 0, 100, 0);
  const endpoint = prepareGestureStart(
    { kind: "endpoint", index: 1, original: line },
    gestureModifiers({ altKey: true }),
  );
  assert.equal(endpoint.beginTransaction, true);
  assert.equal(endpoint.gesture.constrainToAxis, true);
  assert.equal(endpoint.disableGridSnap, true);

  const released = syncGestureModifiers(
    endpoint.gesture,
    gestureModifiers({ altKey: false }),
  );
  assert.equal(released.gesture.constrainToAxis, true);
  assert.equal(released.disableGridSnap, true);

  const resize = {
    kind: "resize",
    start: { x: 0, y: 0 },
    handle: "e",
    box: { x: 0, y: 0, width: 100, height: 50 },
    local: false,
    originals: [line],
  };
  assert.equal(
    syncGestureModifiers(resize, gestureModifiers({ altKey: true }))
      .disableGridSnap,
    true,
  );
  assert.equal(
    syncGestureModifiers(resize, gestureModifiers({ altKey: false }))
      .disableGridSnap,
    false,
  );
});

test("final pointer-up move replay policy stays centralized", () => {
  const line = makeElement("line", 0, 0, 100, 0);
  assert.equal(
    gestureNeedsFinalMove(
      { kind: "draw", id: line.id, start: { x: 0, y: 0 }, points: [], original: line },
      0,
      1,
    ),
    true,
  );
  assert.equal(
    gestureNeedsFinalMove(
      { kind: "move", start: { x: 0, y: 0 }, originals: [line] },
      0.5,
      1,
    ),
    false,
  );
  assert.equal(
    gestureNeedsFinalMove(
      { kind: "move", start: { x: 0, y: 0 }, originals: [line] },
      2,
      1,
    ),
    true,
  );
});

test("external tangent keeps its branch while pointer extends past contact", () => {
  const source = { x: 0, y: 0 };
  const candidate = {
    contact: { x: 100, y: 0 },
    end: { x: 100, y: 0 },
  };

  assert.equal(
    tangentRetainsCandidateAt({ x: 145, y: 2 }, source, candidate, 1),
    true,
  );
  const line = tangentLineForPointer(
    source,
    candidate,
    { x: 160, y: 3 },
    24,
  );
  near(line.start, source);
  near(line.end, { x: 160, y: 0 });
});

test("on-curve tangent length remains symmetric around its source", () => {
  const source = { x: 50, y: 50 };
  const candidate = {
    contact: source,
    end: { x: 150, y: 50 },
    throughSource: true,
  };
  const line = tangentLineForPointer(
    source,
    candidate,
    { x: 90, y: 62 },
    24,
  );
  near(line.start, { x: 10, y: 50 });
  near(line.end, { x: 90, y: 50 });
});

test("point reflection prefers exact snap anchors over a nearby line", () => {
  const axis = makeElement("line", 0, 50, 100, 0);
  const target = pointReflectionTargetAt(
    { x: 50, y: 50 },
    [axis],
    [{ point: { x: 50, y: 50 }, kind: "point", ids: ["point"] }],
    1,
  );
  assert.equal(target?.kind, "point");

  const preview = pointReflectionPreview({ x: 20, y: 10 }, target);
  assert.ok(preview);
  near(preview.result, { x: 80, y: 90 });
});

test("point reflection across a line uses its infinite supporting line", () => {
  const axis = makeElement("line", 0, 50, 100, 0);
  const target = pointReflectionTargetAt(
    { x: 50, y: 50 },
    [axis],
    [],
    1,
  );
  assert.equal(target?.kind, "line");

  const preview = pointReflectionPreview({ x: 20, y: 10 }, target);
  assert.ok(preview);
  near(preview.result, { x: 20, y: 90 });
});
