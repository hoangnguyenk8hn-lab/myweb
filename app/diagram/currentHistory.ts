"use client";
import { useCallback, useReducer } from "react";
import type { DiagramDocument } from "./types";

type Update =
  | DiagramDocument
  | ((document: DiagramDocument) => DiagramDocument);
type State = {
  past: DiagramDocument[];
  present: DiagramDocument;
  future: DiagramDocument[];
  gesture: DiagramDocument | null;
};
type Action =
  | { type: "commit" | "replace"; next: Update }
  | { type: "load"; next: DiagramDocument }
  | { type: "begin" | "end" | "cancel" | "undo" | "redo" };
const MAX_HISTORY_ENTRIES = 60;
const MAX_HISTORY_COMPLEXITY = 250_000;

function shallowRecordEqual(
  a: Record<string, unknown>,
  b: Record<string, unknown>,
) {
  const keys = Object.keys(a);
  return (
    keys.length === Object.keys(b).length && keys.every((key) => a[key] === b[key])
  );
}

/** Fast immutable-document comparison; never serializes image/freehand payloads. */
export function documentsEqual(a: DiagramDocument, b: DiagramDocument) {
  if (a === b) return true;
  if (
    a.version !== b.version ||
    a.width !== b.width ||
    a.height !== b.height ||
    !shallowRecordEqual(
      a.grid as unknown as Record<string, unknown>,
      b.grid as unknown as Record<string, unknown>,
    ) ||
    a.elements.length !== b.elements.length
  )
    return false;
  return a.elements.every((element, index) => {
    const next = b.elements[index];
    return (
      element === next ||
      shallowRecordEqual(
        element as unknown as Record<string, unknown>,
        next as unknown as Record<string, unknown>,
      )
    );
  });
}

function documentComplexity(document: DiagramDocument) {
  return document.elements.reduce(
    (sum, element) =>
      sum +
      1 +
      (element.points?.length ?? 0) +
      (element.plot?.data.length ?? 0) +
      (element.text?.length ?? 0) / 64,
    1,
  );
}

function appendPast(past: DiagramDocument[], document: DiagramDocument) {
  const next = [...past, document].slice(-MAX_HISTORY_ENTRIES);
  let complexity = 0;
  let first = next.length;
  for (let index = next.length - 1; index >= 0; index--) {
    complexity += documentComplexity(next[index]);
    if (complexity > MAX_HISTORY_COMPLEXITY && index < next.length - 1) break;
    first = index;
  }
  return next.slice(first);
}
export function historyReducer(s: State, a: Action): State {
  switch (a.type) {
    case "load":
      return { past: [], present: a.next, future: [], gesture: null };
    case "begin":
      return s.gesture ? s : { ...s, gesture: s.present };
    case "cancel":
      return s.gesture ? { ...s, present: s.gesture, gesture: null } : s;
    case "end":
      return !s.gesture
        ? s
        : documentsEqual(s.gesture, s.present)
          ? { ...s, gesture: null }
          : {
              past: appendPast(s.past, s.gesture),
              present: s.present,
              future: [],
              gesture: null,
            };
    case "replace":
      return {
        ...s,
        present: typeof a.next === "function" ? a.next(s.present) : a.next,
      };
    case "commit": {
      const next = typeof a.next === "function" ? a.next(s.present) : a.next;
      if (documentsEqual(next, s.present)) return s;
      return {
        past: appendPast(s.past, s.gesture ?? s.present),
        present: next,
        future: [],
        gesture: null,
      };
    }
    case "undo": {
      if (s.gesture) return { ...s, present: s.gesture, gesture: null };
      if (!s.past.length) return s;
      return {
        past: s.past.slice(0, -1),
        present: s.past[s.past.length - 1],
        future: [s.present, ...s.future],
        gesture: null,
      };
    }
    case "redo":
      return !s.future.length
        ? s
        : {
            past: appendPast(s.past, s.present),
            present: s.future[0],
            future: s.future.slice(1),
            gesture: null,
          };
  }
}
export function useCurrentHistory(initial: DiagramDocument) {
  const [s, dispatch] = useReducer(historyReducer, {
    past: [],
    present: initial,
    future: [],
    gesture: null,
  });
  return {
    document: s.present,
    canUndo: !!s.past.length,
    canRedo: !!s.future.length,
    inGesture: !!s.gesture,
    commit: useCallback(
      (next: Update) => dispatch({ type: "commit", next }),
      [],
    ),
    replace: useCallback(
      (next: Update) => dispatch({ type: "replace", next }),
      [],
    ),
    load: useCallback(
      (next: DiagramDocument) => dispatch({ type: "load", next }),
      [],
    ),
    beginGesture: useCallback(() => dispatch({ type: "begin" }), []),
    endGesture: useCallback(() => dispatch({ type: "end" }), []),
    cancelGesture: useCallback(() => dispatch({ type: "cancel" }), []),
    undo: useCallback(() => dispatch({ type: "undo" }), []),
    redo: useCallback(() => dispatch({ type: "redo" }), []),
  };
}
