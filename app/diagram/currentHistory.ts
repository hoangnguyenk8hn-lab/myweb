"use client";
import { useCallback, useMemo, useReducer } from "react";
import { resolveConstructionDocument } from "./constructionEngine";
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
const equal = (a: DiagramDocument, b: DiagramDocument) =>
  JSON.stringify(a) === JSON.stringify(b);
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
        : equal(s.gesture, s.present)
          ? { ...s, gesture: null }
          : {
              past: [...s.past, s.gesture].slice(-100),
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
      if (equal(next, s.present)) return s;
      return {
        past: [...s.past, s.gesture ?? s.present].slice(-100),
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
            past: [...s.past, s.present].slice(-100),
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
  const resolved = useMemo(() => resolveConstructionDocument(s.present), [s.present]);
  return {
    /** Geometry consumed by renderer, snapping, toolbar and export. */
    document: resolved.document,
    /** Persisted/source geometry used internally by history and construction edits. */
    sourceDocument: s.present,
    constructionStates: resolved.states,
    constructionGraph: resolved.graph,
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
