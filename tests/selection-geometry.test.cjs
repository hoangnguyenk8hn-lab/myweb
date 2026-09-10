const fs = require("node:fs");
const assert = require("node:assert/strict");
const { test } = require("node:test");
const ts = require("typescript");

// Run the production TypeScript geometry directly with the existing toolchain.
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
  svgPathBounds,
  pointBounds,
  boxCorners,
} = require("../app/diagram/pathBounds.ts");
const {
  sceneBounds,
  worldBounds,
  worldPoint,
  localPoint,
  resizeElements,
} = require("../app/diagram/sceneGeometry.ts");
const { ALL_SHAPES, shapePath } = require("../app/diagram/shapes.ts");
const {
  makeElement,
  blankDocument,
} = require("../app/diagram/currentDocument.ts");
const { historyReducer } = require("../app/diagram/currentHistory.ts");

function near(actual, expected, label = "") {
  for (const key of Object.keys(expected))
    assert.ok(
      Math.abs(actual[key] - expected[key]) < 1e-7,
      `${label} ${key}: ${actual[key]} != ${expected[key]}`,
    );
}
const shape = (name, options = {}) => ({
  ...makeElement(`shape:${name}`, 100, 80, 200, 100),
  ...options,
});
const union = (elements) =>
  pointBounds(elements.flatMap((e) => boxCorners(worldBounds(e))));

test("selection follows painted SVG extents, not the padded palette tile", () => {
  near(sceneBounds(shape("rectangle")), {
    x: 110,
    y: 95,
    width: 180,
    height: 70,
  });
  near(sceneBounds(shape("triangle")), {
    x: 108,
    y: 87,
    width: 184,
    height: 81,
  });
  near(sceneBounds(shape("circle")), { x: 120, y: 90, width: 160, height: 80 });
  near(sceneBounds(shape("ellipse")), {
    x: 110,
    y: 95,
    width: 180,
    height: 70,
  });
});

test("Bezier extrema, smooth segments and relative paths are included", () => {
  near(svgPathBounds("M0 0C0 100 100 100 100 0"), {
    x: 0,
    y: 0,
    width: 100,
    height: 75,
  });
  near(svgPathBounds("M0 0Q50 100 100 0T200 0"), {
    x: 0,
    y: -50,
    width: 200,
    height: 100,
  });
  near(svgPathBounds("m10 20h90v50h-90z"), {
    x: 10,
    y: 20,
    width: 90,
    height: 50,
  });
  near(svgPathBounds("M0 0C0 100 100 100 100 0S200 -100 200 0"), {
    x: 0,
    y: -75,
    width: 200,
    height: 150,
  });
  const polygon = {
    ...makeElement("polycurve", 10, 20, 100, 80),
    points: [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
      { x: 0, y: 1 },
    ],
  };
  near(sceneBounds(polygon), { x: -2.5, y: 10, width: 125, height: 100 });
});

test("world bounds follow rotation and skew without changing document geometry", () => {
  const e = shape("rectangle", { rotation: 37, skewX: 21 }),
    before = JSON.stringify(e);
  const expected = pointBounds(
    [
      { x: 110, y: 95 },
      { x: 290, y: 95 },
      { x: 290, y: 165 },
      { x: 110, y: 165 },
    ].map((p) => worldPoint(p, e)),
  );
  near(worldBounds(e), expected);
  near(localPoint(worldPoint({ x: 124, y: 106 }, e), e), { x: 124, y: 106 });
  assert.equal(JSON.stringify(e), before);
});

test("rotated ellipses have analytic bounds, not a rotated enclosing rectangle", () => {
  const angle = (37 * Math.PI) / 180,
    k = Math.tan((21 * Math.PI) / 180),
    a = Math.cos(angle),
    b = Math.sin(angle),
    c = a * k - b,
    d = b * k + a;
  const rx = Math.hypot(90 * a, 35 * c),
    ry = Math.hypot(90 * b, 35 * d);
  near(worldBounds(shape("ellipse", { rotation: 37, skewX: 21 })), {
    x: 200 - rx,
    y: 130 - ry,
    width: 2 * rx,
    height: 2 * ry,
  });
});

test("single resize keeps visible anchors fixed for asymmetric, rotated shapes", () => {
  for (const name of ["triangle", "rectangle", "pentagon", "cloud"])
    for (const rotation of [0, 37, -90]) {
      const e = shape(name, { rotation, skewX: 19 }),
        from = sceneBounds(e);
      const [unchanged] = resizeElements([e], from, from);
      near(
        unchanged,
        {
          x: e.x,
          y: e.y,
          width: e.width,
          height: e.height,
          rotation: e.rotation,
          skewX: e.skewX,
        },
        `${name} no jump`,
      );
      for (const handle of ["nw", "n", "ne", "e", "se", "s", "sw", "w"]) {
        const width =
          handle === "n" || handle === "s" ? from.width : from.width * 1.42;
        const height =
          handle === "e" || handle === "w" ? from.height : from.height * 0.73;
        const to = {
          x: handle.includes("w") ? from.x + from.width - width : from.x,
          y: handle.includes("n") ? from.y + from.height - height : from.y,
          width,
          height,
        };
        const [next] = resizeElements([e], from, to),
          actual = sceneBounds(next);
        boxCorners(actual).forEach((point, i) =>
          near(
            worldPoint(point, next),
            worldPoint(boxCorners(to)[i], e),
            `${name} ${handle}`,
          ),
        );
      }
    }
});

test("group resize scales rotated and skewed members in canvas coordinates", () => {
  const elements = [
    shape("triangle", { rotation: 32, skewX: 19 }),
    shape("ellipse", {
      x: 370,
      y: 220,
      width: 120,
      height: 160,
      rotation: -41,
      skewX: -12,
    }),
  ];
  const from = union(elements),
    to = {
      x: from.x - 30,
      y: from.y + 20,
      width: from.width * 1.6,
      height: from.height * 0.65,
    };
  const next = resizeElements(elements, from, to, false);
  near(union(next), to, "group extents");
  elements.forEach((e, i) => {
    for (const p of [
      { x: 0.1, y: 0.2 },
      { x: 0.8, y: 0.4 },
      { x: 0.6, y: 0.9 },
    ]) {
      const before = worldPoint(
          { x: e.x + p.x * e.width, y: e.y + p.y * e.height },
          e,
        ),
        after = worldPoint(
          {
            x: next[i].x + p.x * next[i].width,
            y: next[i].y + p.y * next[i].height,
          },
          next[i],
        );
      near(after, {
        x: to.x + (before.x - from.x) * 1.6,
        y: to.y + (before.y - from.y) * 0.65,
      });
    }
  });
});

test("all registered paths and parameterized shapes produce finite bounds", () => {
  for (const definition of ALL_SHAPES) {
    const box = svgPathBounds(shapePath(definition.id));
    assert.ok(Object.values(box).every(Number.isFinite), definition.id);
    assert.ok(box.width >= 0 && box.height >= 0, definition.id);
  }
  for (const sides of [3, 5, 9, 20])
    for (const name of ["star", "pentagon"]) {
      const e = shape(name, { parameters: { sides } }),
        path = svgPathBounds(shapePath(name, { sides }));
      near(sceneBounds(e), {
        x: 100 + path.x * 2,
        y: 80 + path.y,
        width: path.width * 2,
        height: path.height,
      });
    }
});

test("regular polygons support the requested side count and equal edge lengths", () => {
  const e = makeElement("shape:regular-polygon", 30, 40);
  assert.equal(e.width, e.height);
  for (const sides of [3, 4, 7, 12, 100]) {
    const path = shapePath("regular-polygon", { sides });
    const vertices = [...path.matchAll(/[ML]([-\d.e+]+) ([-\d.e+]+)/g)].map(
      (m) => ({ x: Number(m[1]), y: Number(m[2]) }),
    );
    assert.equal(vertices.length, sides);
    const lengths = vertices.map((p, i) =>
      Math.hypot(
        p.x - vertices[(i + 1) % sides].x,
        p.y - vertices[(i + 1) % sides].y,
      ),
    );
    assert.ok(Math.max(...lengths) - Math.min(...lengths) < 1e-8);
    const polygon = { ...e, parameters: { sides } },
      box = sceneBounds(polygon);
    const [grown] = resizeElements([polygon], box, {
      ...box,
      width: box.width * 1.7,
      height: box.height * 1.7,
    });
    near(grown, { width: e.width * 1.7, height: e.height * 1.7 });
  }
});

test("one resize is one undo step and redo restores its corrected bounds", () => {
  const before = {
      ...blankDocument(),
      elements: [shape("triangle", { rotation: 23, skewX: 12 })],
    },
    box = sceneBounds(before.elements[0]);
  const after = {
    ...before,
    elements: resizeElements(before.elements, box, {
      ...box,
      width: box.width * 1.5,
    }),
  };
  let state = { past: [], present: before, future: [], gesture: null };
  for (const action of [
    { type: "begin" },
    { type: "replace", next: after },
    { type: "end" },
  ])
    state = historyReducer(state, action);
  assert.equal(state.past.length, 1);
  state = historyReducer(state, { type: "undo" });
  assert.deepEqual(state.present, before);
  state = historyReducer(state, { type: "redo" });
  assert.deepEqual(state.present, after);
});
