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

const { blankDocument, makeElement } = require("../app/diagram/currentDocument.ts");
const {
  runConstructionCommand,
} = require("../app/diagram/constructionCommands.ts");
const {
  resolveConstructionDocument,
} = require("../app/diagram/constructionEngine.ts");
const {
  constrainPointToObject,
  deriveLineThroughPoints,
} = require("../app/diagram/constructionInteraction.ts");
const { nearestSnapTarget } = require("../app/diagram/snapping.ts");

const near = (actual, expected, tolerance = 1e-7) => {
  for (const key of Object.keys(expected))
    assert.ok(
      Math.abs(actual[key] - expected[key]) <= tolerance,
      `${key}: ${actual[key]} != ${expected[key]}`,
    );
};

test("tangent contact points feed a downstream line and update as one graph", () => {
  const carrier = makeElement("line", 0, 200, 500, 0),
    circle = makeElement("shape:circle", 100, 100, 100, 100),
    freePoint = makeElement("point", 350, 200, 0, 0),
    point = constrainPointToObject(freePoint, carrier, {
      x: freePoint.x,
      y: freePoint.y,
    });
  assert.ok(point);

  const source = {
      ...blankDocument(),
      elements: [carrier, circle, point],
    },
    first = resolveConstructionDocument(source),
    tangentResult = runConstructionCommand(
      source,
      first.document,
      [point.id, circle.id],
      "tangent",
    );
  assert.equal(tangentResult.error, undefined);

  const contacts = tangentResult.document.elements.filter(
      (element) => element.construction?.kind === "tangent-point",
    ),
    tangents = tangentResult.document.elements.filter(
      (element) => element.construction?.kind === "tangent",
    );
  assert.equal(contacts.length, 2);
  assert.equal(tangents.length, 2);

  const chord = deriveLineThroughPoints(
    makeElement("line", 0, 0, 1, 1),
    contacts[0],
    contacts[1],
  );
  assert.ok(chord);
  const chained = {
      ...tangentResult.document,
      elements: [...tangentResult.document.elements, chord],
    },
    before = resolveConstructionDocument(chained),
    beforeContacts = contacts.map(
      (contact) => before.document.elements.find((e) => e.id === contact.id),
    );
  assert.ok(beforeContacts.every(Boolean));

  const moved = {
      ...chained,
      elements: chained.elements.map((element) =>
        element.id === point.id &&
        element.construction?.kind === "point-on-object" &&
        element.construction.locator.kind === "segment"
          ? {
              ...element,
              construction: {
                ...element.construction,
                locator: { ...element.construction.locator, t: 0.9 },
              },
            }
          : element,
      ),
    },
    after = resolveConstructionDocument(moved),
    afterContacts = contacts.map(
      (contact) => after.document.elements.find((e) => e.id === contact.id),
    ),
    afterChord = after.document.elements.find((e) => e.id === chord.id);

  assert.ok(afterContacts.every(Boolean));
  assert.ok(afterChord);
  assert.ok(
    afterContacts.some(
      (contact, index) =>
        Math.hypot(
          contact.x - beforeContacts[index].x,
          contact.y - beforeContacts[index].y,
        ) > 1,
    ),
  );
  near(
    { x: afterChord.x, y: afterChord.y },
    { x: afterContacts[0].x, y: afterContacts[0].y },
  );
  near(
    {
      x: afterChord.x + afterChord.width,
      y: afterChord.y + afterChord.height,
    },
    { x: afterContacts[1].x, y: afterContacts[1].y },
  );
  for (const id of [point.id, ...contacts.map((e) => e.id), chord.id])
    assert.equal(after.states.get(id)?.status, "valid");
  assert.deepEqual(after.graph.dependencies.get(chord.id), [
    contacts[0].id,
    contacts[1].id,
  ]);
});

test("a real Point wins a coincident line endpoint while snapping", () => {
  const target = nearestSnapTarget(
    { x: 20, y: 30 },
    [
      { point: { x: 20, y: 30 }, kind: "endpoint", ids: ["line-1"] },
      { point: { x: 20, y: 30 }, kind: "point", ids: ["point-A"] },
    ],
    [],
    1,
  );
  assert.equal(target?.kind, "point");
  assert.deepEqual(target?.ids, ["point-A"]);
});
