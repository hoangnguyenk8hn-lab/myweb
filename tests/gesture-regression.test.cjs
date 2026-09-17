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
