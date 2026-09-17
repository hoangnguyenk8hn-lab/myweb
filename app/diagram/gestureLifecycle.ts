import type {
  AssistedLineConstruction,
  DiagramElement,
  Point,
} from "./types";

export type Box = { x: number; y: number; width: number; height: number };

export type Gesture =
  | {
      kind: "draw" | "freehand";
      id: string;
      start: Point;
      points: Point[];
      original: DiagramElement;
    }
  | { kind: "tangent"; start: Point }
  | {
      kind: "perpendicular";
      start: Point;
      mode: AssistedLineConstruction;
      targetIds?: string[];
    }
  | { kind: "point-reflection"; start: Point }
  | {
      kind: "move";
      start: Point;
      originals: DiagramElement[];
      copySource?: DiagramElement[];
      copied?: boolean;
    }
  | {
      kind: "resize";
      start: Point;
      handle: string;
      box: Box;
      local: boolean;
      originals: DiagramElement[];
    }
  | { kind: "rotate"; center: Point; angle: number; original: DiagramElement }
  | {
      kind: "control" | "point";
      index: number;
      original: DiagramElement;
    }
  | {
      kind: "endpoint";
      index: number;
      original: DiagramElement;
      constrainToAxis?: boolean;
    }
  | {
      kind: "arc-angle";
      endpoint: "start" | "end";
      original: DiagramElement;
    }
  | { kind: "marquee"; start: Point; add: string[] }
  | { kind: "connect"; id: string; from: string; start: Point }
  | { kind: "pan"; start: Point; scroll: Point }
  | { kind: "canvas-size"; start: Point; width: number; height: number };

export type GestureModifiers = {
  altKey: boolean;
  shiftKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
};

export type ModifierEvent = Partial<GestureModifiers>;

export function gestureModifiers(event: ModifierEvent): GestureModifiers {
  return {
    altKey: !!event.altKey,
    shiftKey: !!event.shiftKey,
    ctrlKey: !!event.ctrlKey,
    metaKey: !!event.metaKey,
  };
}

const SELECTION_HANDLE_GESTURES = new Set<Gesture["kind"]>([
  "resize",
  "rotate",
  "endpoint",
  "control",
  "point",
  "arc-angle",
]);

const FINAL_MOVE_GESTURES = new Set<Gesture["kind"]>([
  "draw",
  "connect",
  "point",
  "control",
  "arc-angle",
]);

/** Document history starts once for every editing gesture, never for view/selection-only gestures. */
export function gestureStartsTransaction(gesture: Gesture) {
  return gesture.kind !== "pan" && gesture.kind !== "marquee";
}

export function isSelectionHandleGesture(gesture: Gesture) {
  return SELECTION_HANDLE_GESTURES.has(gesture.kind);
}

/**
 * Option on an endpoint is intentionally sticky for the lifetime of that drag:
 * once the user asks for axis-constrained stretching, releasing Option does not
 * make the endpoint jump to an unconstrained position before pointer-up.
 */
export function syncGestureModifiers(
  gesture: Gesture,
  modifiers: GestureModifiers,
): { gesture: Gesture; disableGridSnap: boolean } {
  let next = gesture;
  if (
    gesture.kind === "endpoint" &&
    modifiers.altKey &&
    !gesture.constrainToAxis
  )
    next = { ...gesture, constrainToAxis: true };

  const axisLocked = next.kind === "endpoint" && !!next.constrainToAxis;
  return {
    gesture: next,
    disableGridSnap:
      isSelectionHandleGesture(next) && (modifiers.altKey || axisLocked),
  };
}

export function prepareGestureStart(
  gesture: Gesture,
  modifiers: GestureModifiers,
): { gesture: Gesture; disableGridSnap: boolean; beginTransaction: boolean } {
  const synced = syncGestureModifiers(gesture, modifiers);
  return {
    ...synced,
    beginTransaction: gestureStartsTransaction(synced.gesture),
  };
}

/**
 * Some gestures need one final move at pointer-up so the committed geometry
 * exactly matches the release position. Move only replays after an actual drag.
 */
export function gestureNeedsFinalMove(
  gesture: Gesture,
  movement: number,
  zoom: number,
) {
  if (FINAL_MOVE_GESTURES.has(gesture.kind)) return true;
  return gesture.kind === "move" && movement > 1 / Math.max(zoom, 1e-6);
}
