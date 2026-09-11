"use client";

import { resolveConstructionDocument } from "./constructionEngine";
import {
  constrainPointToObject,
  deriveIntersectionPoint,
  deriveTangentLine,
  deriveTangentPoint,
  updatePointConstraintFromPointer,
} from "./constructionInteraction";
import { makeElement } from "./currentDocument";
import { contourIntersections } from "./intersections";
import { tangentCandidates } from "./tangents";
import type { DiagramDocument, DiagramElement, Point } from "./types";

export type ConstructionCommand =
  | "point-on-line"
  | "point-on-circle"
  | "intersection"
  | "tangent"
  | "detach";

export type ConstructionCommandResult = {
  document: DiagramDocument;
  createdIds: string[];
  message: string;
  error?: string;
};

type ResolvedUpdate =
  | DiagramDocument
  | ((document: DiagramDocument) => DiagramDocument);

const isPoint = (element: DiagramElement) => element.shape === "point";
const isCircleLike = (element: DiagramElement) =>
  element.type === "circle" ||
  element.type === "ellipse" ||
  element.shape === "circle" ||
  element.shape === "ellipse";
const isLineLike = (element: DiagramElement) =>
  ["line", "arrow", "curve", "curved-arrow", "polyline", "polycurve"].includes(
    element.type,
  );

const uniquePoints = (points: Point[]) =>
  points.filter(
    (point, index) =>
      points.findIndex(
        (other) => Math.hypot(point.x - other.x, point.y - other.y) < 0.01,
      ) === index,
  );

function fail(document: DiagramDocument, error: string): ConstructionCommandResult {
  return { document, createdIds: [], message: error, error };
}

function replaceElement(
  document: DiagramDocument,
  id: string,
  next: DiagramElement,
): DiagramDocument {
  return {
    ...document,
    elements: document.elements.map((element) => (element.id === id ? next : element)),
  };
}

/**
 * Executes the visible construction commands against the persisted/source
 * document while using the resolved scene as the geometric input.
 */
export function runConstructionCommand(
  source: DiagramDocument,
  resolved: DiagramDocument,
  selectedIds: string[],
  command: ConstructionCommand,
): ConstructionCommandResult {
  const selected = resolved.elements.filter((element) => selectedIds.includes(element.id));
  const sourceById = new Map(source.elements.map((element) => [element.id, element]));
  const resolvedById = new Map(resolved.elements.map((element) => [element.id, element]));

  if (command === "detach") {
    const ids = new Set(
      selected
        .filter((element) => sourceById.get(element.id)?.construction)
        .map((element) => element.id),
    );
    if (!ids.size)
      return fail(source, "Chọn một đối tượng phụ thuộc để tách khỏi hình học gốc.");
    return {
      document: {
        ...source,
        elements: source.elements.map((element) => {
          if (!ids.has(element.id)) return element;
          const current = resolvedById.get(element.id) ?? element;
          const { construction: _construction, ...free } = current;
          return free;
        }),
      },
      createdIds: [...ids],
      message: "Đã tách đối tượng khỏi quan hệ hình học.",
    };
  }

  if (command === "point-on-line" || command === "point-on-circle") {
    const point = selected.find(isPoint);
    const target = selected.find(
      (element) =>
        element.id !== point?.id &&
        (command === "point-on-line" ? isLineLike(element) : isCircleLike(element)),
    );
    const sourcePoint = point ? sourceById.get(point.id) : undefined;
    if (!point || !sourcePoint || !target)
      return fail(
        source,
        command === "point-on-line"
          ? "Chọn một Point và một Line/Curve, rồi chọn Point on Line."
          : "Chọn một Point và một Circle/Ellipse, rồi chọn Point on Circle.",
      );
    if (sourcePoint.construction?.mode === "derived")
      return fail(source, "Điểm giao là đối tượng suy ra; hãy Detach trước khi ràng buộc.");
    const constrained = constrainPointToObject(
      sourcePoint,
      target,
      { x: point.x, y: point.y },
    );
    if (!constrained)
      return fail(source, "Không thể chiếu Point lên đối tượng đã chọn.");
    return {
      document: replaceElement(source, sourcePoint.id, constrained),
      createdIds: [constrained.id],
      message:
        command === "point-on-line"
          ? "Point đã bị ràng buộc trên Line/Curve."
          : "Point đã bị ràng buộc trên Circle/Ellipse.",
    };
  }

  if (command === "intersection") {
    const parents = selected.filter((element) => !isPoint(element)).slice(0, 2);
    if (parents.length !== 2)
      return fail(source, "Chọn đúng hai đối tượng để tạo giao điểm.");
    const crossings = uniquePoints(contourIntersections(parents[0], parents[1]));
    if (!crossings.length)
      return fail(source, "Hai đối tượng hiện không có giao điểm hình học.");
    const derived = crossings
      .map((point) =>
        deriveIntersectionPoint(
          makeElement("point", point.x, point.y, 0, 0),
          parents[0],
          parents[1],
          point,
        ),
      )
      .filter((element): element is DiagramElement => !!element);
    if (!derived.length)
      return fail(source, "Không thể xác định nhánh giao điểm ổn định.");
    return {
      document: { ...source, elements: [...source.elements, ...derived] },
      createdIds: derived.map((element) => element.id),
      message: `Đã tạo ${derived.length} giao điểm phụ thuộc.`,
    };
  }

  const sourcePoint = selected.find(isPoint);
  const point = sourcePoint ? resolvedById.get(sourcePoint.id) : undefined;
  const target = selected.find(
    (element) => element.id !== sourcePoint?.id && isCircleLike(element),
  );
  if (!sourcePoint || !point || !target)
    return fail(source, "Chọn một Point và một Circle/Ellipse để tạo tiếp tuyến.");
  const candidates = tangentCandidates({ x: point.x, y: point.y }, target);
  if (!candidates.length)
    return fail(source, "Không có tiếp tuyến thực từ Point đến đối tượng đã chọn.");
  const tangents = candidates
    .map((candidate) =>
      deriveTangentLine(
        makeElement("line", point.x, point.y, 0, 0),
        point,
        target,
        candidate.contact,
      ),
    )
    .filter((element): element is DiagramElement => !!element);
  const contacts = candidates
    .map((candidate) =>
      deriveTangentPoint(
        makeElement("point", candidate.contact.x, candidate.contact.y, 0, 0),
        point,
        target,
        candidate.contact,
      ),
    )
    .filter((element): element is DiagramElement => !!element);
  if (!tangents.length || contacts.length !== tangents.length)
    return fail(source, "Không thể tạo tiếp tuyến phụ thuộc.");
  return {
    document: {
      ...source,
      elements: [...source.elements, ...contacts, ...tangents],
    },
    createdIds: [...contacts, ...tangents].map((element) => element.id),
    message: `Đã tạo ${contacts.length} tiếp điểm và ${tangents.length} tiếp tuyến phụ thuộc.`,
  };
}

/**
 * Canvas renders a resolved document, whereas history stores source geometry.
 * This adapter maps a drag of a constrained point back into its locator instead
 * of overwriting the relation with an absolute coordinate.
 */
export function applyResolvedConstructionEdit(
  source: DiagramDocument,
  update: ResolvedUpdate,
): DiagramDocument {
  const before = resolveConstructionDocument(source).document;
  const attempted = typeof update === "function" ? update(before) : update;
  const beforeById = new Map(before.elements.map((element) => [element.id, element]));
  const sourceById = new Map(source.elements.map((element) => [element.id, element]));
  const candidateResolved = resolveConstructionDocument(attempted).document;
  const candidateResolvedById = new Map(
    candidateResolved.elements.map((element) => [element.id, element]),
  );

  return {
    ...source,
    ...attempted,
    elements: attempted.elements.map((candidate) => {
      const original = sourceById.get(candidate.id);
      if (!original) return candidate;
      const construction = original.construction;

      if (
        construction?.mode === "constrained" &&
        construction.kind === "point-on-object"
      ) {
        const beforePoint = beforeById.get(candidate.id);
        const moved =
          !!beforePoint &&
          (Math.abs(beforePoint.x - candidate.x) > 0.0001 ||
            Math.abs(beforePoint.y - candidate.y) > 0.0001);
        if (moved) {
          const parent = candidateResolvedById.get(construction.parents[0]);
          if (parent) {
            const staged = { ...original, ...candidate, construction };
            const constrained = updatePointConstraintFromPointer(staged, parent, {
              x: candidate.x,
              y: candidate.y,
            });
            if (constrained) return constrained;
          }
        }
        return { ...original, ...candidate, construction };
      }

      if (construction?.mode === "derived") {
        const {
          x: _x,
          y: _y,
          width: _width,
          height: _height,
          rotation: _rotation,
          points: _points,
          control1: _control1,
          control2: _control2,
          construction: _candidateConstruction,
          ...editable
        } = candidate;
        return { ...original, ...editable, construction };
      }

      return { ...original, ...candidate };
    }),
  };
}
