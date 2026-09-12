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
  makeElement,
  blankDocument,
} = require("../app/diagram/currentDocument.ts");
const {
  drawElement,
  moveLineEndpoint,
  lineVertices,
  moveLineVertex,
  curveControls,
  sceneBounds,
  worldPoint,
  markerDimension,
  resolveElement,
} = require("../app/diagram/sceneGeometry.ts");
const {
  elementSegments,
  collectIntersections,
  intersectionAppearance,
  nearestIntersection,
  dropLineEndpoint,
  elementTouchesRect,
  segmentIntersection,
} = require("../app/diagram/intersections.ts");
const { historyReducer } = require("../app/diagram/currentHistory.ts");
const {
  parseColor,
  colorCss,
  hsvRgb,
  rgbHsv,
} = require("../app/diagram/colorModel.ts");
const { validDocument } = require("../app/diagram/currentExporters.ts");
const {
  objectSnapTargets,
  collectSnapTargets,
  nearestSnapTarget,
  translationSnap,
} = require("../app/diagram/snapping.ts");
const { svgPathAnchors } = require("../app/diagram/pathBounds.ts");
const {
  absolutePoints,
  curvePoint,
  movePolygonPoint,
} = require("../app/diagram/sceneGeometry.ts");
const near = (a, b, tol = 1e-7) => {
  for (const k in b)
    assert.ok(Math.abs(a[k] - b[k]) <= tol, `${k}: ${a[k]} != ${b[k]}`);
};
function curvePoints(e) {
  const [a, b] = curveControls(e);
  return [
    { x: e.x, y: e.y },
    { x: e.x + a.x, y: e.y + a.y },
    { x: e.x + b.x, y: e.y + b.y },
    { x: e.x + e.width, y: e.y + e.height },
  ].map((p) => worldPoint(p, e));
}
const offset = (a, b) => ({ x: a.x - b.x, y: a.y - b.y });

test("creating shapes anchors the same visible corner in every drag direction", () => {
  const start = { x: 210, y: 180 };
  for (const name of [
    "rectangle",
    "square",
    "circle",
    "regular-polygon",
    "axis",
    "grid",
    "quadratic",
  ])
    for (const signX of [-1, 1])
      for (const signY of [-1, 1])
        for (const distance of [1, 20, 65, 140]) {
          const e = makeElement(`shape:${name}`, start.x, start.y, 1, 1);
          const next = drawElement(e, start, {
            x: start.x + signX * distance,
            y: start.y + signY * distance * 0.8,
          });
          const b = sceneBounds(next);
          near(
            {
              x: b.x + (signX < 0 ? b.width : 0),
              y: b.y + (signY < 0 ? b.height : 0),
            },
            start,
          );
          if (["square", "circle", "regular-polygon"].includes(name))
            near({ w: next.width }, { w: next.height });
        }
});

test("endpoint drags translate only their own handle, including implicit controls and transforms", () => {
  for (const explicit of [false, true])
    for (const index of [0, 1])
      for (const rotation of [0, 47, -125]) {
        const e = {
          ...makeElement("curve", 120, 90, -100, 60),
          rotation,
          skewX: 19,
          ...(explicit
            ? { control1: { x: 26, y: -45 }, control2: { x: -70, y: 80 } }
            : {}),
        };
        const before = curvePoints(e),
          at = index ? 3 : 0,
          tangent = index ? 2 : 1,
          other = index ? 0 : 3,
          otherTangent = index ? 1 : 2;
        for (const delta of [
          { x: 0, y: 0 },
          { x: 40, y: 20 },
          { x: -70, y: -80 },
        ]) {
          const target = {
            x: before[at].x + delta.x,
            y: before[at].y + delta.y,
          };
          const next = moveLineEndpoint(e, index, target),
            after = curvePoints(next);
          near(after[at], target);
          near(
            offset(after[tangent], after[at]),
            offset(before[tangent], before[at]),
          );
          near(after[other], before[other]);
          near(after[otherTangent], before[otherTangent]);
          assert.equal(next.rotation, e.rotation);
        }
      }
});

test("connected curves keep tangent offsets as their nodes move", () => {
  const a = makeElement("plain-text", 20, 100),
    b = makeElement("plain-text", 260, 100);
  const e = {
    ...makeElement("curve", 50, 110, 180, 0),
    fromId: a.id,
    toId: b.id,
    control1: { x: 45, y: -55 },
    control2: { x: 135, y: -55 },
  };
  const doc = { ...blankDocument(), elements: [a, b, e] },
    before = curvePoints(resolveElement(e, doc));
  const moved = {
    ...doc,
    elements: [{ ...a, x: 5, y: 140 }, { ...b, x: 290, y: 200 }, e],
  };
  const after = curvePoints(resolveElement(e, moved));
  near(offset(after[1], after[0]), offset(before[1], before[0]));
  near(offset(after[2], after[3]), offset(before[2], before[3]));
});

test("intersection marks use contours, deduplicate vertices and obey blocking", () => {
  const a = { ...makeElement("line", 0, 50, 100, 0), intersection: true };
  const b = makeElement("line", 50, 0, 0, 100);
  let marks = collectIntersections([a, b]);
  assert.equal(marks.length, 1);
  near(marks[0].point, { x: 50, y: 50 });
  assert.equal(
    collectIntersections([a, { ...b, blockIntersection: true }]).length,
    0,
  );
  assert.equal(
    collectIntersections([{ ...a, intersection: false }, b]).length,
    0,
  );
  const c = makeElement("shape:circle", 0, 0, 100, 100);
  marks = collectIntersections([a, c]);
  assert.equal(marks.length, 2);
  const sorted = marks.map((m) => m.point).sort((a, b) => a.x - b.x);
  near(sorted[0], { x: 10, y: 50 }, 0.06);
  near(sorted[1], { x: 90, y: 50 }, 0.06);
  const polygon = {
    ...makeElement("shape:square", 0, 0, 100, 100),
    rotation: 45,
  };
  assert.equal(
    collectIntersections([{ ...a, x: -20, width: 140 }, polygon]).length,
    2,
  );
  const d = makeElement("line", 50, 50, 50, 50);
  assert.equal(
    collectIntersections([a, b, { ...d, intersection: true }]).length,
    1,
  );
  assert.equal(collectIntersections([{ ...a, breakSize: 16 }, b]).length, 0);
});

test("curves, compound paths and object frames participate in intersections", () => {
  const e = {
    ...makeElement("curve", 0, 0, 100, 0),
    control1: { x: 0, y: 100 },
    control2: { x: 100, y: 100 },
    intersection: true,
  };
  const line = makeElement("line", 50, -10, 0, 120);
  const marks = collectIntersections([e, line]);
  assert.equal(marks.length, 1);
  near(marks[0].point, { x: 50, y: 75 }, 0.06);
  for (const type of [
    "plain-text",
    "boxed-text",
    "image",
    "plot",
    "freehand",
    "polyline",
    "polycurve",
  ]) {
    const item = makeElement(type, 0, 0, 100, 100);
    assert.ok(elementSegments(item).length > 0, type);
  }
  const axis = makeElement("shape:axis", 0, 0, 100, 100);
  assert.ok(elementSegments(axis).length > 2);
});

test("color picker round trips RGB and alpha without losing channels", () => {
  for (const value of [
    "#000000",
    "#ffffff",
    "#f00",
    "#0fa",
    "#a47c20",
    "#7da0f080",
    "rgba(73,147,229,0.35)",
  ]) {
    const first = parseColor(value),
      parsed = parseColor(colorCss(first));
    near(hsvRgb(parsed), hsvRgb(first), 1);
    near({ a: parsed.a }, { a: first.a }, 0.001);
  }
  for (const rgb of [
    [0, 255, 170],
    [74, 144, 226],
    [180, 10, 80],
  ])
    near(hsvRgb(rgbHsv(...rgb)), rgb);
});

test("marker size is independent per position and legacy drawings retain their size", () => {
  const e = { ...makeElement("line", 0, 0), markerSize: 14 };
  assert.equal(markerDimension(e, "start"), 14);
  assert.equal(markerDimension({ ...e, startMarkerSize: 0.1 }, "start"), 1);
  assert.equal(markerDimension({ ...e, startMarkerSize: 0.1 }, "end"), 14);
  assert.equal(markerDimension({ ...e, endMarkerSize: 2 }, "end"), 20);
});

test("new options survive JSON and invalid settings are rejected", () => {
  const e = {
    ...makeElement("curve", 20, 20),
    boxed: true,
    intersection: true,
    intersectionKind: "dot",
    intersectionSize: 4,
    startMarkerSize: 0.5,
    endMarkerSize: 1.7,
  };
  e.style.fillPaint = {
    kind: "gradient",
    type: "linear",
    from: "#ff000080",
    to: "#000000",
    angle: 30,
  };
  const d = { ...blankDocument(), elements: [e] };
  assert.ok(validDocument(JSON.parse(JSON.stringify(d))));
  for (const bad of [
    { ...e, startMarkerSize: 0 },
    { ...e, boxed: "yes" },
    { ...e, intersectionSize: Infinity },
    {
      ...e,
      style: {
        ...e.style,
        fillPaint: {
          kind: "pattern",
          type: "dots",
          foreground: "#000000",
          background: "transparent",
          size: 0,
        },
      },
    },
  ])
    assert.equal(validDocument({ ...d, elements: [bad] }), false);
});

test("legacy intersection links still restrict scope and follow edits", () => {
  const a = makeElement("line", 0, 50, 100, 0),
    b = makeElement("line", 25, 0, 0, 100),
    c = makeElement("line", 75, 0, 0, 100);
  const linked = [
    { ...a, intersection: true, intersectionWith: [b.id] },
    { ...b, intersection: true, intersectionWith: [a.id] },
    c,
  ];
  const marks = collectIntersections(linked);
  assert.equal(marks.length, 1);
  near(marks[0].point, { x: 25, y: 50 });
  const moved = linked.map((e) => (e.id === b.id ? { ...e, x: 33 } : e));
  near(collectIntersections(moved)[0].point, { x: 33, y: 50 });
  const expanded = [
    { ...linked[0], intersectionWith: undefined },
    linked[1],
    c,
  ];
  assert.equal(collectIntersections(expanded).length, 2);
  assert.equal(
    collectIntersections(
      linked.map((e) =>
        e.id === b.id ? { ...e, blockIntersection: true } : e,
      ),
    ).length,
    0,
  );
});

test("circle crossings and tangencies are solved without contour sampling gaps", () => {
  const a = {
    ...makeElement("shape:circle", 0, 0, 100, 100),
    intersection: true,
  };
  const tangent = makeElement("line", 0, 10, 100, 0);
  const one = collectIntersections([a, tangent]);
  assert.equal(one.length, 1);
  near(one[0].point, { x: 50, y: 10 });
  assert.equal(collectIntersections([a, { ...tangent, y: 9.999 }]).length, 0);
  const touch = makeElement("shape:circle", 80, 0, 100, 100);
  const marks = collectIntersections([a, touch]);
  assert.equal(marks.length, 1);
  near(marks[0].point, { x: 90, y: 50 });
  const overlap = { ...touch, x: 50 };
  const two = collectIntersections([a, overlap]);
  assert.equal(two.length, 2);
  for (const { point: p } of two) {
    near({ r: Math.hypot(p.x - 50, p.y - 50) }, { r: 40 });
    near({ r: Math.hypot(p.x - 100, p.y - 50) }, { r: 40 });
  }
  assert.equal(collectIntersections([a, { ...touch, x: 0 }]).length, 0);
});

test("ellipse tangencies survive rotation and skew, and touching line endpoints count once", () => {
  const e = {
    ...makeElement("shape:circle", 0, 0, 100, 80),
    rotation: 33,
    skewX: 25,
    intersection: true,
  };
  const a = worldPoint({ x: 0, y: 8 }, e),
    b = worldPoint({ x: 100, y: 8 }, e);
  const line = makeElement("line", a.x, a.y, b.x - a.x, b.y - a.y);
  const marks = collectIntersections([e, line]);
  assert.equal(marks.length, 1);
  near(marks[0].point, worldPoint({ x: 50, y: 8 }, e), 1e-6);
  near(
    segmentIntersection(
      [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
      ],
      [
        { x: 10, y: 0 },
        { x: 20, y: 0 },
      ],
    ),
    { x: 10, y: 0 },
  );
  assert.equal(
    segmentIntersection(
      [
        { x: 0, y: 0 },
        { x: 20, y: 0 },
      ],
      [
        { x: 10, y: 0 },
        { x: 30, y: 0 },
      ],
    ),
    null,
  );
});

test("intersection links round trip through JSON and a single undo/redo", () => {
  const a = makeElement("line", 0, 50, 100, 0),
    b = makeElement("line", 50, 0, 0, 100);
  const before = { ...blankDocument(), elements: [a, b] };
  const after = {
    ...before,
    elements: [{ ...a, intersection: true, intersectionWith: [b.id] }, b],
  };
  const parsed = JSON.parse(JSON.stringify(after));
  assert.ok(validDocument(parsed));
  assert.equal(collectIntersections(parsed.elements).length, 1);
  assert.equal(
    validDocument({
      ...after,
      elements: [
        { ...after.elements[0], intersectionWith: [null] },
        after.elements[1],
      ],
    }),
    false,
  );
  let state = { past: [], present: before, future: [], gesture: null };
  state = historyReducer(state, { type: "commit", next: after });
  assert.equal(state.past.length, 1);
  state = historyReducer(state, { type: "undo" });
  assert.equal(collectIntersections(state.present.elements).length, 0);
  state = historyReducer(state, { type: "redo" });
  assert.equal(collectIntersections(state.present.elements).length, 1);
});

test("Intersection size scales the symbol, preserves legacy radius and round trips through JSON", () => {
  const e = { ...makeElement("line", 0, 50, 100, 0), intersection: true };
  assert.deepEqual(intersectionAppearance(e), { radius: 1.6, strokeWidth: 0.4 });
  assert.deepEqual(intersectionAppearance({ ...e, intersectionSize: 12 }), {
    radius: 12,
    strokeWidth: 1,
  });
  for (const size of [0.1, 0.4, 0.5, 1, 2]) {
    const doc = {
      ...blankDocument(),
      elements: [{ ...e, intersectionMarkerSize: size }],
    };
    const parsed = JSON.parse(JSON.stringify(doc));
    assert.ok(validDocument(parsed));
    near(intersectionAppearance(parsed.elements[0]), {
      radius: size * 4,
      strokeWidth: size,
    });
  }
  for (const size of [0, 2.1, NaN, Infinity])
    assert.equal(
      validDocument({
        ...blankDocument(),
        elements: [{ ...e, intersectionMarkerSize: size }],
      }),
      false,
    );
});

test("Intersection snap targets respect zoom, exclusions, blocking and symbol size", () => {
  const a = {
      ...makeElement("line", 0, 50, 100, 0),
      intersection: true,
      intersectionMarkerSize: 0.1,
    },
    b = makeElement("line", 50, 0, 0, 100);
  const marks = collectIntersections([a, b]);
  assert.equal(marks.length, 1);
  for (const zoom of [0.25, 1, 4]) {
    assert.equal(
      nearestIntersection({ x: 50 + 6 / zoom, y: 50 }, marks, [], zoom),
      marks[0],
    );
    assert.equal(
      nearestIntersection({ x: 50 + 8 / zoom, y: 50 }, marks, [], zoom),
      null,
    );
  }
  assert.equal(nearestIntersection({ x: 50, y: 50 }, marks, [a.id]), null);
  assert.equal(
    nearestIntersection(
      { x: 50, y: 50 },
      collectIntersections([{ ...a, blockIntersection: true }, b]),
    ),
    null,
  );
  const large = collectIntersections([{ ...a, intersectionMarkerSize: 2 }, b]);
  assert.equal(nearestIntersection({ x: 59, y: 50 }, large), large[0]);
});

test("marquee selection captures touched strokes but not a hollow shape's empty center", () => {
  const line = makeElement("line", 0, 50, 100, 0);
  assert.equal(
    elementTouchesRect(line, { x: 45, y: 45, width: 10, height: 10 }),
    true,
  );

  const circle = makeElement("shape:circle", 0, 0, 100, 100);
  assert.equal(
    elementTouchesRect(circle, { x: 45, y: 45, width: 10, height: 10 }),
    false,
  );
  assert.equal(
    elementTouchesRect(circle, { x: 86, y: 44, width: 8, height: 12 }),
    true,
  );
});

test("releasing an endpoint on an Intersection keeps the exact point instead of binding the nearby shape", () => {
  const a = { ...makeElement("line", 0, 50, 100, 0), intersection: true },
    b = makeElement("line", 50, 0, 0, 100);
  const mark = collectIntersections([a, b])[0];
  for (const index of [0, 1]) {
    const e = {
      ...makeElement("curve", 10, 10, 100, 80),
      rotation: 31,
      skewX: 12,
    };
    const next = dropLineEndpoint(
      e,
      index,
      { x: 52, y: 51 },
      mark,
      "nearby-shape",
    );
    const point = index
      ? { x: next.x + next.width, y: next.y + next.height }
      : { x: next.x, y: next.y };
    near(worldPoint(point, next), mark.point);
    assert.equal(index ? next.toId : next.fromId, undefined);
    const attached = dropLineEndpoint(
      e,
      index,
      { x: 52, y: 51 },
      null,
      "nearby-shape",
    );
    assert.equal(index ? attached.toId : attached.fromId, "nearby-shape");
  }
});

test("legacy multi-point Line data remains movable without exposing add/remove vertex commands", () => {
  const legacy = {
    ...makeElement("line", 20, 30, 120, 80),
    points: [
      { x: 0, y: 0 },
      { x: 0.5, y: 0.2 },
      { x: 1, y: 1 },
    ],
  };
  const moved = moveLineVertex(legacy, 1, { x: 90, y: 70 });
  assert.equal(lineVertices(moved).length, 3);
  near(lineVertices(moved)[1], { x: 90, y: 70 });
});

test("line and curve anchors follow their rendered endpoints and marker midpoint after transforms", () => {
  for (const type of ["line", "curve"])
    for (const rotation of [0, 47, -132]) {
      const e = {
        ...makeElement(type, 120, 90, -100, 60),
        rotation,
        skewX: 19,
      };
      const targets = objectSnapTargets(e);
      assert.equal(targets.length, 3);
      const ends = targets.filter((t) => t.kind === "endpoint");
      assert.equal(ends.length, 2);
      near(ends[0].point, worldPoint({ x: 120, y: 90 }, e));
      near(ends[1].point, worldPoint({ x: 20, y: 150 }, e));
      near(
        targets.find((t) => t.kind === "midpoint").point,
        worldPoint(
          type === "curve" ? curvePoint(e, 0.5) : { x: 70, y: 120 },
          e,
        ),
      );
    }
});

test("path snap anchors contain real corners and exact curve middles without sampling nodes or subpath bridges", () => {
  const box = svgPathAnchors("M10 20H90V80H10Z");
  assert.equal(box.filter((a) => a.kind === "vertex").length, 4);
  assert.equal(box.filter((a) => a.kind === "midpoint").length, 4);
  assert.equal(box.filter((a) => a.kind === "endpoint").length, 0);
  for (const point of [
    { x: 10, y: 20 },
    { x: 90, y: 80 },
    { x: 50, y: 20 },
    { x: 90, y: 50 },
  ])
    assert.ok(
      box.some(
        (a) => Math.hypot(a.point.x - point.x, a.point.y - point.y) < 1e-8,
      ),
    );
  const curve = svgPathAnchors("M0 0C0 100 100 100 100 0");
  assert.equal(curve.length, 3);
  near(curve.find((a) => a.kind === "midpoint").point, { x: 50, y: 75 });
  const separate = svgPathAnchors("M0 0L10 0M100 0L110 0");
  assert.equal(separate.filter((a) => a.kind === "endpoint").length, 4);
  assert.deepEqual(
    separate.filter((a) => a.kind === "midpoint").map((a) => a.point.x),
    [5, 105],
  );
});

test("regular polygons expose every vertex and edge midpoint; circles expose their true boundary and center", () => {
  for (const sides of [3, 5, 9]) {
    const e = {
      ...makeElement("shape:regular-polygon", 30, 60, 150, 150),
      rotation: 39,
      skewX: -14,
      parameters: { sides },
    };
    const targets = objectSnapTargets(e),
      segments = elementSegments(e);
    assert.equal(targets.filter((t) => t.kind === "vertex").length, sides);
    assert.equal(targets.filter((t) => t.kind === "midpoint").length, sides);
    for (const [a, b] of segments) {
      const midpoint = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      assert.ok(
        targets.some(
          (t) =>
            Math.hypot(t.point.x - midpoint.x, t.point.y - midpoint.y) < 1e-7,
        ),
      );
    }
  }
  const circle = {
    ...makeElement("shape:circle", 20, 30, 100, 100),
    rotation: 26,
    skewX: 12,
  };
  const targets = objectSnapTargets(circle);
  assert.equal(targets.filter((t) => t.kind === "quadrant").length, 4);
  near(targets.find((t) => t.kind === "center").point, { x: 70, y: 80 });
  for (const p of [
    { x: 30, y: 80 },
    { x: 110, y: 80 },
    { x: 70, y: 40 },
    { x: 70, y: 120 },
  ])
    assert.ok(
      targets.some(
        (t) =>
          Math.hypot(
            t.point.x - worldPoint(p, circle).x,
            t.point.y - worldPoint(p, circle).y,
          ) < 1e-7,
      ),
    );
});

test("point snapping uses both coordinates, zoom tolerance and object exclusions", () => {
  const line = makeElement("line", 0, 0, 200, 100);
  const targets = objectSnapTargets(line);
  for (const zoom of [0.25, 1, 4]) {
    const hit = nearestSnapTarget(
      { x: 100 + 6 / zoom, y: 50 },
      targets,
      [],
      zoom,
    );
    assert.equal(hit.kind, "midpoint");
    near(hit.point, { x: 100, y: 50 });
    assert.equal(
      nearestSnapTarget({ x: 100 + 8 / zoom, y: 50 }, targets, [], zoom),
      null,
    );
    assert.equal(
      nearestSnapTarget({ x: 100, y: 50 }, targets, [line.id], zoom),
      null,
    );
  }
  assert.equal(nearestSnapTarget({ x: 100, y: 70 }, targets), null);
  const crossing = makeElement("line", 100, 0, 0, 100);
  const enabled = { ...line, intersection: true };
  const all = collectSnapTargets(
    [enabled, crossing],
    collectIntersections([enabled, crossing]),
  );
  assert.equal(nearestSnapTarget({ x: 100, y: 50 }, all).kind, "intersection");
  assert.equal(
    nearestSnapTarget({ x: 100, y: 50 }, all, [line.id], 1, line.id).kind,
    "intersection",
  );
});

test("moving a sloped line aligns its real endpoint instead of an empty bounding-box corner", () => {
  const source = makeElement("line", 60, 80, -40, 50);
  const target = makeElement("line", 500, 400, 100, 0);
  const result = translationSnap(
    objectSnapTargets(source),
    { x: 439, y: 319 },
    objectSnapTargets(target),
    [source.id],
  );
  assert.ok(result);
  near(result.shift, { x: 440, y: 320 });
  near(
    { x: source.x + result.shift.x, y: source.y + result.shift.y },
    result.target.point,
  );
  near(result.target.point, { x: 500, y: 400 });
});

test("snapping a rotated polygon vertex preserves all other vertices and endpoint drops stay on anchors", () => {
  const target = objectSnapTargets(
    makeElement("line", 400, 300, 200, 100),
  ).find((t) => t.kind === "midpoint");
  for (const type of ["polyline", "polycurve"]) {
    const e = {
      ...makeElement(type, 20, 30, 120, 80),
      rotation: 51,
      skewX: 18,
      points: [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 0.6, y: 1 },
      ],
    };
    const before = absolutePoints(e).map((p) => worldPoint(p, e));
    const moved = movePolygonPoint(e, 1, target.point);
    const after = absolutePoints(moved).map((p) => worldPoint(p, moved));
    near(after[1], target.point);
    near(after[0], before[0]);
    near(after[2], before[2]);
  }
  const curve = {
    ...makeElement("curve", 10, 10, 100, 80),
    rotation: 31,
    skewX: 12,
  };
  const placed = dropLineEndpoint(
    curve,
    1,
    { x: 499, y: 349 },
    target,
    "nearby-shape",
  );
  near(curvePoints(placed)[3], target.point);
  assert.equal(placed.toId, undefined);
});
