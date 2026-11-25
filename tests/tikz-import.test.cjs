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
  parseTikz,
  placeTikz,
  MAX_TIKZ_CHARS,
} = require("../app/diagram/tikzImport.ts");
const {
  blankDocument,
  makeElement,
} = require("../app/diagram/currentDocument.ts");
const {
  validDocument,
  loadDocument,
} = require("../app/diagram/currentExporters.ts");
const {
  absolutePoints,
  worldBounds,
  movePolygonPoint,
  lineVertices,
} = require("../app/diagram/sceneGeometry.ts");
const { historyReducer } = require("../app/diagram/currentHistory.ts");
const near = (actual, expected) =>
  assert.ok(Math.abs(actual - expected) < 1e-6, actual + " vs " + expected);

test("TikZ polygon has directly draggable vertices, orientation, and separately editable labels", () => {
  const cm = 96 / 2.54;
  const { elements } = parseTikz(
    [
      "\\coordinate (C) at (1,2);",
      "\\draw[red, thick, fill=blue!20] (0,0) node[below] {$A$} -- (3,0) -- (C) -- cycle;",
      "\\node[above] at (C) {$C_{1}$};",
    ].join("\n"),
  );
  const [shape, a, c] = elements;
  assert.equal(shape.type, "polyline");
  assert.equal(shape.style.fill, "#ccccff");
  assert.equal(shape.style.stroke, "#ff0000");
  const vertices = absolutePoints(shape);
  near(vertices[2].x, cm);
  near(vertices[2].y, -2 * cm);
  const moved = movePolygonPoint(shape, 2, { x: cm, y: -3 * cm });
  near(absolutePoints(moved)[2].y, -3 * cm);
  assert.deepEqual(absolutePoints(moved)[0], vertices[0]);
  assert.equal(a.type, "text");
  assert.equal(c.text, "C_{1}");
  assert.ok(c.y + c.height < vertices[2].y);
});

test("centimeters, physical units, picture scaling, Bézier controls and arrow styles", () => {
  const {
    elements: [rect, circle, ellipse, curve, line],
  } = parseTikz(
    [
      "\\begin{tikzpicture}[scale=2]",
      "\\draw (2,1) rectangle (0,0);",
      "\\fill[red] (0,0) circle (2mm);",
      "\\draw (1,1) ellipse[x radius=1cm,y radius=.5cm];",
      "\\draw[<->,dashed] (1,1) .. controls (2,2) and (3,0) .. (3,1);",
      "\\draw[->] (2,0) -- (0,0) -- (-1,1);",
      "\\end{tikzpicture}",
    ].join("\n"),
  );
  near(worldBounds(rect).width, (4 * 96) / 2.54);
  near(worldBounds(circle).width, (0.8 * 96) / 2.54);
  near(worldBounds(ellipse).height, (2 * 96) / 2.54);
  near(curve.control1.y, (-2 * 96) / 2.54);
  assert.equal(curve.endHead, "open");
  assert.equal(curve.startHead, "open");
  assert.equal(curve.style.dash, "dashed");
  assert.equal(lineVertices(line).length, 3);
});

test("exported LaTeX wrapper, style options containing commas/semicolons and mixed units", () => {
  const { elements } = parseTikz(
    [
      "\\documentclass{standalone}",
      "\\begin{document}",
      "\\begin{tikzpicture}[x=0.75pt,y=-0.75pt,line cap=round,line join=round]",
      "\\path[use as bounding box] (0,0) rectangle (700,400);",
      "\\clip (0,0) rectangle (700,400);",
      "\\path[draw={rgb,255:red,10;green,20;blue,30},fill=none,line width=1pt,draw opacity=0.5,even odd rule] (10,10) -- (20,30);",
      "\\node[inner sep=0pt,align=center,text=black,rotate=0,opacity=1,font=\\fontsize{12}{14.4}\\selectfont] at (50,50) {$\\frac{1}{2}$};",
      "\\end{tikzpicture}",
      "\\end{document}",
    ].join("\n"),
  );
  assert.equal(elements.length, 2);
  assert.equal(elements[0].style.stroke, "#0a141e80");
  assert.ok(elements[0].height > 0);
  assert.equal(elements[1].text, "\\frac{1}{2}");
});

test("unsupported commands, partial paths, unknown names, unsupported styles and budgets fail explicitly", () => {
  for (const [code, pattern] of [
    [
      "\\draw (0,0) -- (1,1);\n\\foreach \\i in {1,2} {};",
      /Line 2 .*Unsupported command/,
    ],
    ["\\draw (Q) -- (0,0);", /Unknown coordinate/],
    ["\\draw[rotate=20] (0,0) -- (1,0);", /Unsupported style/],
    ["\\draw (0,0) -- (2,1) arc(10:20:1);", /Expected/],
    ["%%% no objects", /no visible/],
    ["\\begin{tikzpicture}\n\\draw (0,0) -- (1,1);", /Missing/],
    ["\\draw (0,0) -- (999cm,0);", /too large/],
    ["x".repeat(MAX_TIKZ_CHARS + 1), /256 KiB/],
    ["\\draw (0,0) -- (2,2)", /Expected/],
  ])
    assert.throws(() => parseTikz(code), pattern);
});

test("a single import appends, fits, survives a JSON round trip and undoes as one edit", async () => {
  const doc = blankDocument();
  doc.elements.push(makeElement("point", 23, 45));
  const source =
    "\\draw (0,0) -- (23,2);\n\\node at (0,0) {50\\% ; done}; % comment";
  const picture = parseTikz(source);
  const next = placeTikz(doc, picture);
  assert.equal(doc.elements.length, 1);
  assert.equal(next.elements[0], doc.elements[0]);
  assert.equal(next.elements[2].text, "50% ; done");
  assert.ok(next.width > doc.width);
  assert.equal(validDocument(next), true);
  assert.deepEqual(
    (await loadDocument(JSON.parse(JSON.stringify(next)))).elements,
    next.elements.map((e) => JSON.parse(JSON.stringify(e))),
  );
  const state = historyReducer(
    { present: doc, past: [], future: [], gesture: null },
    { type: "commit", next },
  );
  assert.equal(historyReducer(state, { type: "undo" }).present, doc);
  assert.notEqual(parseTikz(source).elements[0].id, picture.elements[0].id);
});
