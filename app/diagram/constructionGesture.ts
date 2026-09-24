import {
  assistedLineForPointer,
  assistedLineMarkerAt,
  assistedLinePreview,
  assistedLineRetainsTargetAt,
  assistedLineTargetAt,
  type AssistedLinePreview,
} from "./assistedLine";
import { makeElement } from "./currentDocument";
import {
  pointReflectionPreview,
  pointReflectionTargetAt,
  type PointReflectionPreview,
} from "./pointReflection";
import type { SnapTarget } from "./snapping";
import {
  tangentCandidates,
  tangentLineForPointer,
  tangentRetainsCandidateAt,
  tangentSourceAt,
  tangentTargetAt,
  type TangentCandidate,
  type TangentLinePreview,
} from "./tangents";
import type {
  AssistedLineConstruction,
  ConstructionTool,
  DiagramElement,
  Point,
} from "./types";

export type TangentConstructionPreview = {
  targetId: string;
  candidates: TangentCandidate[];
  active: number;
  line: TangentLinePreview | null;
};

export type ConstructionGestureSession =
  | {
      kind: "construction";
      tool: "tangent";
      start: Point;
      preview: TangentConstructionPreview | null;
    }
  | {
      kind: "construction";
      tool: AssistedLineConstruction;
      start: Point;
      targetIds?: string[];
      preview: AssistedLinePreview | null;
    }
  | {
      kind: "construction";
      tool: "point-reflection";
      start: Point;
      preview: PointReflectionPreview | null;
    };

export type ConstructionScene = {
  elements: DiagramElement[];
  snapTargets: SnapTarget[];
  zoom: number;
};

export type ConstructionStart = ConstructionScene & {
  rawPoint: Point;
  snappedPoint: Point;
  snappedToTarget: boolean;
  angleBisectorTargetIds?: string[];
};

export type ConstructionCommit = {
  session: ConstructionGestureSession;
  element: DiagramElement | null;
};

type Starter = (context: ConstructionStart) => ConstructionGestureSession;
type Updater = (
  session: ConstructionGestureSession,
  pointer: Point,
  scene: ConstructionScene,
) => ConstructionGestureSession;
type Materializer = (
  session: ConstructionGestureSession,
) => DiagramElement | null;

function nearestTangentBranch(pointer: Point, candidates: TangentCandidate[]) {
  let active = -1;
  let best = Infinity;
  candidates.forEach((candidate, index) => {
    const distance = Math.hypot(
      pointer.x - candidate.contact.x,
      pointer.y - candidate.contact.y,
    );
    if (distance < best) {
      best = distance;
      active = index;
    }
  });
  return active;
}

const startTangent: Starter = (context) => ({
  kind: "construction",
  tool: "tangent",
  start: context.snappedToTarget
    ? context.snappedPoint
    : tangentSourceAt(context.rawPoint, context.elements, context.zoom) ??
      context.snappedPoint,
  preview: null,
});

const startPerpendicular: Starter = (context) => ({
  kind: "construction",
  tool: "perpendicular",
  start: context.snappedPoint,
  preview: null,
});

const startAngleBisector: Starter = (context) => ({
  kind: "construction",
  tool: "angle-bisector",
  start: context.snappedPoint,
  targetIds:
    context.angleBisectorTargetIds?.length === 2
      ? [...context.angleBisectorTargetIds]
      : undefined,
  preview: null,
});

const startPointReflection: Starter = (context) => ({
  kind: "construction",
  tool: "point-reflection",
  start: context.snappedPoint,
  preview: null,
});

const STARTERS: Record<ConstructionTool, Starter> = {
  tangent: startTangent,
  perpendicular: startPerpendicular,
  "angle-bisector": startAngleBisector,
  "point-reflection": startPointReflection,
};

export function startConstructionGesture(
  tool: ConstructionTool,
  context: ConstructionStart,
) {
  return STARTERS[tool](context);
}

const updateTangent: Updater = (session, pointer, scene) => {
  if (session.tool !== "tangent") return session;
  const previous = session.preview;
  const previousCandidate =
    previous && previous.active >= 0
      ? previous.candidates[previous.active]
      : null;
  const retainPrevious =
    !!previousCandidate &&
    tangentRetainsCandidateAt(
      pointer,
      session.start,
      previousCandidate,
      scene.zoom,
    );
  const directTarget = retainPrevious
    ? null
    : tangentTargetAt(pointer, scene.elements, scene.zoom);

  let preview: TangentConstructionPreview | null = null;
  if (retainPrevious && previous) {
    preview = {
      ...previous,
      line:
        previous.active >= 0
          ? tangentLineForPointer(
              session.start,
              previous.candidates[previous.active],
              pointer,
              24 / Math.max(scene.zoom, 1e-6),
            )
          : null,
    };
  } else if (directTarget) {
    const candidates =
      previous?.targetId === directTarget.id
        ? previous.candidates
        : tangentCandidates(session.start, directTarget);
    const active = nearestTangentBranch(pointer, candidates);
    preview = {
      targetId: directTarget.id,
      candidates,
      active,
      line:
        active >= 0
          ? tangentLineForPointer(
              session.start,
              candidates[active],
              pointer,
              24 / Math.max(scene.zoom, 1e-6),
            )
          : null,
    };
  }
  return { ...session, preview };
};

const updateAssistedLine: Updater = (session, pointer, scene) => {
  if (session.tool !== "perpendicular" && session.tool !== "angle-bisector")
    return session;
  const previous = session.preview;
  const scale = Math.max(scene.zoom, 1e-6);
  const inQuickPick =
    !!previous &&
    Math.hypot(pointer.x - previous.foot.x, pointer.y - previous.foot.y) <=
      30 / scale;
  const targetElements =
    session.tool === "angle-bisector" && session.targetIds?.length === 2
      ? scene.elements.filter((element) => session.targetIds?.includes(element.id))
      : scene.elements;
  const directTarget = inQuickPick
    ? null
    : assistedLineTargetAt(session.tool, pointer, targetElements, scene.zoom);
  const retainedTarget =
    previous &&
    (inQuickPick ||
      (!directTarget &&
        assistedLineRetainsTargetAt(pointer, previous, scene.zoom)))
      ? previous.target
      : null;
  const target = retainedTarget ?? directTarget;
  const base = assistedLinePreview(session.start, target);
  const previousEnd =
    previous && base && previous.target.id === base.target.id
      ? previous.end
      : null;
  const extended = base
    ? assistedLineForPointer(pointer, base, previousEnd, scene.zoom)
    : null;
  const preview =
    extended?.kind === "perpendicular"
      ? {
          ...extended,
          marker:
            assistedLineMarkerAt(pointer, extended, scene.zoom) ??
            (inQuickPick ? null : previous?.marker ?? null),
        }
      : extended;
  return { ...session, preview };
};

const updatePointReflection: Updater = (session, pointer, scene) => {
  if (session.tool !== "point-reflection") return session;
  const target = pointReflectionTargetAt(
    pointer,
    scene.elements,
    scene.snapTargets,
    scene.zoom,
  );
  return {
    ...session,
    preview: pointReflectionPreview(session.start, target),
  };
};

const UPDATERS: Record<ConstructionTool, Updater> = {
  tangent: updateTangent,
  perpendicular: updateAssistedLine,
  "angle-bisector": updateAssistedLine,
  "point-reflection": updatePointReflection,
};

export function updateConstructionGesture(
  session: ConstructionGestureSession,
  pointer: Point,
  scene: ConstructionScene,
) {
  return UPDATERS[session.tool](session, pointer, scene);
}

/** Rendering projection for a tangent candidate; geometry remains owned here. */
export function tangentConstructionCandidateLine(
  session: ConstructionGestureSession,
  index: number,
  zoom: number,
) {
  if (session.tool !== "tangent") return null;
  const candidate = session.preview?.candidates[index];
  if (!candidate) return null;
  if (index === session.preview?.active && session.preview.line)
    return session.preview.line;
  return tangentLineForPointer(
    session.start,
    candidate,
    candidate.end,
    24 / Math.max(zoom, 1e-6),
  );
}

const materializeTangent: Materializer = (session) => {
  if (session.tool !== "tangent" || !session.preview?.line) return null;
  const { start, end } = session.preview.line;
  return makeElement("line", start.x, start.y, end.x - start.x, end.y - start.y);
};

const materializeAssistedLine: Materializer = (session) => {
  if (
    (session.tool !== "perpendicular" && session.tool !== "angle-bisector") ||
    !session.preview
  )
    return null;
  const { start, end } = session.preview;
  const line = makeElement(
    "line",
    start.x,
    start.y,
    end.x - start.x,
    end.y - start.y,
  );
  if (session.preview.kind === "perpendicular" && session.preview.marker) {
    const length = Math.hypot(end.x - start.x, end.y - start.y),
      footLength = Math.hypot(
        session.preview.foot.x - start.x,
        session.preview.foot.y - start.y,
      );
    line.rightAngle = {
      marker: session.preview.marker,
      at: length > 1e-8 ? Math.min(1, Math.max(0, footLength / length)) : 1,
    };
  }
  return line;
};

const materializePointReflection: Materializer = (session) => {
  if (session.tool !== "point-reflection" || !session.preview) return null;
  return makeElement(
    "point",
    session.preview.result.x,
    session.preview.result.y,
    0,
    0,
  );
};

const MATERIALIZERS: Record<ConstructionTool, Materializer> = {
  tangent: materializeTangent,
  perpendicular: materializeAssistedLine,
  "angle-bisector": materializeAssistedLine,
  "point-reflection": materializePointReflection,
};

export function commitConstructionGesture(
  session: ConstructionGestureSession,
  pointer: Point,
  scene: ConstructionScene,
): ConstructionCommit {
  const next = updateConstructionGesture(session, pointer, scene);
  return { session: next, element: MATERIALIZERS[next.tool](next) };
}
