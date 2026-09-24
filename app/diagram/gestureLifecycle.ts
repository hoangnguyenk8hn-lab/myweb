import type { ConstructionGestureSession } from "./constructionGesture";
import type { DiagramElement, Point } from "./types";

export type Box = { x: number; y: number; width: number; height: number };

export type Gesture =
  | {
      kind: "draw" | "freehand";
      id: string;
      start: Point;
      points: Point[];
      original: DiagramElement;
    }
  | ConstructionGestureSession
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

/**
 * Framework-neutral lifecycle state. CurrentCanvasCore still owns pointer
 * capture/render state, while transaction and modifier semantics live here.
 */
export type GestureLifecycleState = {
  gesture: Gesture | null;
  disableGridSnap: boolean;
  transactionOpen: boolean;
};

export type GestureLifecycleTransition = GestureLifecycleState & {
  beginTransaction: boolean;
  endTransaction: boolean;
  cancelTransaction: boolean;
};

export const IDLE_GESTURE_LIFECYCLE: GestureLifecycleState = {
  gesture: null,
  disableGridSnap: false,
  transactionOpen: false,
};

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

/** Start one gesture and decide transaction/modifier state in one place. */
export function startGestureLifecycle(
  gesture: Gesture,
  modifiers: GestureModifiers,
): GestureLifecycleTransition {
  const synced = syncGestureModifiers(gesture, modifiers);
  const transactionOpen = gestureStartsTransaction(synced.gesture);
  return {
    gesture: synced.gesture,
    disableGridSnap: synced.disableGridSnap,
    transactionOpen,
    beginTransaction: transactionOpen,
    endTransaction: false,
    cancelTransaction: false,
  };
}

/** Update only transient modifier semantics; transaction ownership never changes mid-gesture. */
export function moveGestureLifecycle(
  state: GestureLifecycleState,
  modifiers: GestureModifiers,
): GestureLifecycleState {
  if (!state.gesture) return IDLE_GESTURE_LIFECYCLE;
  const synced = syncGestureModifiers(state.gesture, modifiers);
  return {
    gesture: synced.gesture,
    disableGridSnap: synced.disableGridSnap,
    transactionOpen: state.transactionOpen,
  };
}

/** Finish an active gesture exactly once. View/selection gestures have no history transaction to close. */
export function commitGestureLifecycle(
  state: GestureLifecycleState,
): GestureLifecycleTransition {
  return {
    ...IDLE_GESTURE_LIFECYCLE,
    beginTransaction: false,
    endTransaction: state.transactionOpen,
    cancelTransaction: false,
  };
}

/** Cancel mirrors commit but restores the transaction snapshot instead of recording it. */
export function cancelGestureLifecycle(
  state: GestureLifecycleState,
): GestureLifecycleTransition {
  return {
    ...IDLE_GESTURE_LIFECYCLE,
    beginTransaction: false,
    endTransaction: false,
    cancelTransaction: state.transactionOpen,
  };
}

/** Backward-compatible start projection used by CurrentCanvasCore while migration is staged. */
export function prepareGestureStart(
  gesture: Gesture,
  modifiers: GestureModifiers,
): { gesture: Gesture; disableGridSnap: boolean; beginTransaction: boolean } {
  const started = startGestureLifecycle(gesture, modifiers);
  return {
    gesture: started.gesture!,
    disableGridSnap: started.disableGridSnap,
    beginTransaction: started.beginTransaction,
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
