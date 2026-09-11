"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { createPortal } from "react-dom";
import { CurrentCanvas as CurrentCanvasCore } from "./CurrentCanvasCore";
import { makeElement } from "./currentDocument";
import { collectIntersections } from "./intersections";
import {
  perpendicularLineForPointer,
  perpendicularMarkerAt,
  perpendicularPreview as buildPerpendicularPreview,
  perpendicularRetainsTargetAt,
  perpendicularTargetAt,
  RIGHT_ANGLE_MARKERS,
  rightAngleGuidePath,
  type PerpendicularPreview,
} from "./perpendicular";
import {
  collectSnapTargets,
  nearestSnapTarget,
} from "./snapping";
import {
  LINE_TYPES,
  resolveElement,
  worldBounds,
} from "./sceneGeometry";
import {
  tangentCandidates,
  tangentLineForPointer,
  tangentRetainsCandidateAt,
  tangentTargetAt,
  type TangentCandidate,
  type TangentLinePreview,
} from "./tangents";
import type { DiagramDocument, Point } from "./types";

type Props = ComponentProps<typeof CurrentCanvasCore>;
type ReplaceUpdate = Parameters<Props["onReplace"]>[0];
type LineOverride = {
  start: Point;
  end: Point;
  endHead?: NonNullable<PerpendicularPreview["marker"]>;
};
type TangentQuickPreview = {
  targetId: string;
  candidates: TangentCandidate[];
  active: number;
  line: TangentLinePreview | null;
};

function overrideNewLine(
  before: DiagramDocument,
  after: DiagramDocument,
  override: LineOverride | null,
) {
  if (!override) return after;
  const existing = new Set(before.elements.map((element) => element.id));
  let decorated = false;
  const elements = after.elements.map((element) => {
    if (!decorated && element.type === "line" && !existing.has(element.id)) {
      decorated = true;
      return {
        ...element,
        x: override.start.x,
        y: override.start.y,
        width: override.end.x - override.start.x,
        height: override.end.y - override.start.y,
        endHead: override.endHead ?? element.endHead,
      };
    }
    return element;
  });
  return decorated ? { ...after, elements } : after;
}

export function CurrentCanvas(p: Props) {
  const perpendicularStartRef = useRef<Point | null>(null),
    perpendicularPreviewRef = useRef<PerpendicularPreview | null>(null),
    perpendicularGestureRef = useRef(false),
    perpendicularCommitPendingRef = useRef(false),
    tangentStartRef = useRef<Point | null>(null),
    tangentPreviewRef = useRef<TangentQuickPreview | null>(null),
    tangentGestureRef = useRef(false),
    tangentCommitPendingRef = useRef(false),
    handleDragRef = useRef(false),
    disableGridSnapRef = useRef(false);
  const [quickStart, setQuickStart] = useState<Point | null>(null),
    [quickPreview, setQuickPreview] = useState<PerpendicularPreview | null>(null),
    [quickTangentStart, setQuickTangentStart] = useState<Point | null>(null),
    [quickTangentPreview, setQuickTangentPreview] =
      useState<TangentQuickPreview | null>(null);

  // CurrentCanvasCore reads grid.snap during pointer handling. A getter lets the
  // capture layer suppress only grid snapping synchronously while Option/Alt is
  // held on a selection handle, without changing the persisted document.
  const coreDocument = useMemo(() => {
    const grid = { ...p.document.grid };
    Object.defineProperty(grid, "snap", {
      enumerable: true,
      configurable: true,
      get: () => p.document.grid.snap && !disableGridSnapRef.current,
    });
    return { ...p.document, grid };
  }, [p.document]);

  const elements = useMemo(
    () => p.document.elements.map((element) => resolveElement(element, p.document)),
    [p.document],
  );
  const intersections = useMemo(
    () => collectIntersections(elements),
    [elements],
  );
  const snapTargets = useMemo(
    () => collectSnapTargets(elements, intersections),
    [elements, intersections],
  );

  const clearPerpendicular = () => {
    perpendicularStartRef.current = null;
    perpendicularPreviewRef.current = null;
    perpendicularGestureRef.current = false;
    perpendicularCommitPendingRef.current = false;
    setQuickStart(null);
    setQuickPreview(null);
  };
  const clearTangent = () => {
    tangentStartRef.current = null;
    tangentPreviewRef.current = null;
    tangentGestureRef.current = false;
    tangentCommitPendingRef.current = false;
    setQuickTangentStart(null);
    setQuickTangentPreview(null);
  };

  useEffect(() => {
    if (p.tool !== "perpendicular") clearPerpendicular();
    if (p.tool !== "tangent") clearTangent();
    if (p.tool !== "select") {
      handleDragRef.current = false;
      disableGridSnapRef.current = false;
    }
  }, [p.tool]);

  const eventPoint = (event: { clientX: number; clientY: number }): Point => {
    const svg = p.svgRef.current,
      matrix = svg?.getScreenCTM();
    if (!svg || !matrix) return { x: 0, y: 0 };
    const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(
      matrix.inverse(),
    );
    return { x: point.x, y: point.y };
  };

  const constrain = (point: Point): Point => ({
    x: Math.max(0, Math.min(p.document.width, point.x)),
    y: Math.max(0, Math.min(p.document.height, point.y)),
  });

  // Match the construction-start snap used by CurrentCanvasCore without
  // importing any mouse state from the core canvas.
  const snapConstructionStart = (point: Point): Point => {
    const grid = p.document.grid,
      scale = Math.max(p.zoom, 1e-6);
    let x = grid.snap ? Math.round(point.x / grid.size) * grid.size : point.x,
      y = grid.snap ? Math.round(point.y / grid.size) * grid.size : point.y;

    if (grid.snapShapes) {
      let dx = 6 / scale,
        dy = 6 / scale;
      for (const element of elements) {
        if (LINE_TYPES.has(element.type)) continue;
        const box = worldBounds(element);
        for (const value of [box.x, box.x + box.width / 2, box.x + box.width]) {
          const distance = Math.abs(point.x - value);
          if (distance < dx) {
            dx = distance;
            x = value;
          }
        }
        for (const value of [box.y, box.y + box.height / 2, box.y + box.height]) {
          const distance = Math.abs(point.y - value);
          if (distance < dy) {
            dy = distance;
            y = value;
          }
        }
      }
    }

    const mark = nearestSnapTarget(point, snapTargets, [], p.zoom);
    return mark ? mark.point : { x, y };
  };

  const resolvePerpendicularPreview = (pointer: Point) => {
    const source = perpendicularStartRef.current;
    if (!source) return null;
    const previous = perpendicularPreviewRef.current,
      scale = Math.max(p.zoom, 1e-6),
      inQuickPick =
        !!previous &&
        Math.hypot(pointer.x - previous.foot.x, pointer.y - previous.foot.y) <=
          30 / scale,
      directTarget = inQuickPick
        ? null
        : perpendicularTargetAt(pointer, elements, p.zoom),
      retainedTarget =
        previous &&
        (inQuickPick ||
          (!directTarget && perpendicularRetainsTargetAt(pointer, previous, p.zoom)))
          ? previous.target
          : null,
      target = retainedTarget ?? directTarget,
      basePreview = buildPerpendicularPreview(
        source,
        target,
        p.document.width,
        p.document.height,
      );
    if (!basePreview) return null;
    const previousEnd =
        previous?.target.id === basePreview.target.id ? previous.end : null,
      preview = perpendicularLineForPointer(
        pointer,
        basePreview,
        previousEnd,
        p.zoom,
      );
    return {
      ...preview,
      marker: perpendicularMarkerAt(pointer, preview, p.zoom),
    };
  };

  const updatePerpendicularPreview = (pointer: Point) => {
    const preview = resolvePerpendicularPreview(pointer);
    perpendicularPreviewRef.current = preview;
    setQuickPreview(preview);
    return preview;
  };

  const nearestTangentBranch = (
    pointer: Point,
    candidates: TangentCandidate[],
  ) => {
    let active = -1,
      best = Infinity;
    candidates.forEach((candidate, index) => {
      const value = Math.hypot(
        pointer.x - candidate.contact.x,
        pointer.y - candidate.contact.y,
      );
      if (value < best) {
        best = value;
        active = index;
      }
    });
    return active;
  };

  const resolveTangentPreview = (pointer: Point): TangentQuickPreview | null => {
    const source = tangentStartRef.current;
    if (!source) return null;
    const previous = tangentPreviewRef.current,
      previousCandidate =
        previous && previous.active >= 0
          ? previous.candidates[previous.active]
          : null,
      retainPrevious =
        !!previousCandidate &&
        tangentRetainsCandidateAt(pointer, source, previousCandidate, p.zoom),
      directTarget = retainPrevious
        ? null
        : tangentTargetAt(pointer, elements, p.zoom);

    let targetId: string,
      candidates: TangentCandidate[],
      active: number;
    if (retainPrevious && previous) {
      targetId = previous.targetId;
      candidates = previous.candidates;
      active = previous.active;
    } else if (directTarget) {
      targetId = directTarget.id;
      candidates =
        previous?.targetId === directTarget.id
          ? previous.candidates
          : tangentCandidates(source, directTarget);
      active = nearestTangentBranch(pointer, candidates);
    } else return null;

    return {
      targetId,
      candidates,
      active,
      line:
        active >= 0
          ? tangentLineForPointer(
              source,
              candidates[active],
              pointer,
              24 / Math.max(p.zoom, 1e-6),
            )
          : null,
    };
  };

  const updateTangentPreview = (pointer: Point) => {
    const preview = resolveTangentPreview(pointer);
    tangentPreviewRef.current = preview;
    setQuickTangentPreview(preview);
    return preview;
  };

  const pointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    const target = event.target as Element;
    handleDragRef.current =
      p.tool === "select" && !!target.closest(".selection-layer");
    disableGridSnapRef.current = handleDragRef.current && event.altKey;

    if (
      p.editId ||
      event.button !== 0 ||
      target.closest(
        ".inline-text-editor,.canvas-context-menu,.context-dismiss",
      )
    )
      return;

    if (p.tool === "perpendicular") {
      const start = snapConstructionStart(constrain(eventPoint(event)));
      perpendicularStartRef.current = start;
      perpendicularPreviewRef.current = null;
      perpendicularGestureRef.current = true;
      perpendicularCommitPendingRef.current = false;
      setQuickStart(start);
      setQuickPreview(null);
      return;
    }

    if (p.tool === "tangent") {
      const start = snapConstructionStart(constrain(eventPoint(event)));
      tangentStartRef.current = start;
      tangentPreviewRef.current = null;
      tangentGestureRef.current = true;
      tangentCommitPendingRef.current = false;
      setQuickTangentStart(start);
      setQuickTangentPreview(null);
    }
  };

  const pointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (handleDragRef.current) disableGridSnapRef.current = event.altKey;
    const pointer = constrain(eventPoint(event));
    if (perpendicularGestureRef.current && p.tool === "perpendicular")
      updatePerpendicularPreview(pointer);
    if (tangentGestureRef.current && p.tool === "tangent")
      updateTangentPreview(pointer);
  };

  const pointerUpCapture = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (handleDragRef.current) disableGridSnapRef.current = event.altKey;
    const pointer = constrain(eventPoint(event));
    if (perpendicularGestureRef.current && p.tool === "perpendicular") {
      perpendicularCommitPendingRef.current = true;
      updatePerpendicularPreview(pointer);
    }
    if (tangentGestureRef.current && p.tool === "tangent") {
      tangentCommitPendingRef.current = true;
      updateTangentPreview(pointer);
    }
  };

  const pendingLineOverride = (): LineOverride | null => {
    if (tangentGestureRef.current && tangentCommitPendingRef.current) {
      const line = tangentPreviewRef.current?.line;
      if (line) return line;
    }
    if (perpendicularGestureRef.current && perpendicularCommitPendingRef.current) {
      const preview = perpendicularPreviewRef.current;
      if (preview)
        return {
          start: preview.start,
          end: preview.end,
          endHead: preview.marker ?? undefined,
        };
    }
    return null;
  };

  const wrappedReplace = (next: ReplaceUpdate) => {
    const override = pendingLineOverride();
    if (typeof next === "function")
      p.onReplace((document) =>
        overrideNewLine(document, next(document), override),
      );
    else p.onReplace(overrideNewLine(p.document, next, override));
  };

  const commitRetainedLine = (override: LineOverride) => {
    const line = makeElement(
      "line",
      override.start.x,
      override.start.y,
      override.end.x - override.start.x,
      override.end.y - override.start.y,
    );
    if (override.endHead) line.endHead = override.endHead;
    p.onReplace((document) => ({
      ...document,
      elements: [...document.elements, line],
    }));
    p.onSelect([line.id]);
    p.onEnd();
  };

  const wrappedCancel = () => {
    const override = pendingLineOverride();
    // The core canvas only recognizes a construction while the pointer remains
    // close to its target object. Once the user leaves that object to choose a
    // longer tangent/perpendicular, finish from the retained preview instead.
    if (override) {
      commitRetainedLine(override);
      return;
    }
    p.onCancel();
  };

  const finishPointer = () => {
    handleDragRef.current = false;
    disableGridSnapRef.current = false;
    clearPerpendicular();
    clearTangent();
  };

  const perpendicularOverlay =
    p.svgRef.current && quickStart
      ? createPortal(
          <g pointerEvents="none" data-perpendicular-quick-pick data-ui>
            <circle
              cx={quickStart.x}
              cy={quickStart.y}
              r={4 / p.zoom}
              fill="#ffffff"
              stroke="#348b57"
              strokeWidth={1.2 / p.zoom}
            />
            {quickPreview && (
              <>
                <path
                  d={`M${quickPreview.target.a.x} ${quickPreview.target.a.y}L${quickPreview.target.b.x} ${quickPreview.target.b.y}`}
                  fill="none"
                  stroke="#8cb99a"
                  strokeWidth={1.2 / p.zoom}
                />
                <path
                  d={`M${quickPreview.start.x} ${quickPreview.start.y}L${quickPreview.end.x} ${quickPreview.end.y}`}
                  fill="none"
                  stroke="#2f9e5b"
                  strokeWidth={1.7 / p.zoom}
                />
                {RIGHT_ANGLE_MARKERS.map((marker) => {
                  const active = quickPreview.marker === marker;
                  return (
                    <path
                      key={marker}
                      d={rightAngleGuidePath(quickPreview, marker, 9 / p.zoom)}
                      fill="none"
                      stroke={active ? "#23864d" : "#9dc6a9"}
                      strokeWidth={(active ? 2.3 : 1.05) / p.zoom}
                      opacity={active ? 1 : 0.78}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  );
                })}
                <circle
                  cx={quickPreview.foot.x}
                  cy={quickPreview.foot.y}
                  r={2.6 / p.zoom}
                  fill="#2f9e5b"
                  stroke="white"
                  strokeWidth={0.9 / p.zoom}
                />
              </>
            )}
          </g>,
          p.svgRef.current,
        )
      : null;

  const tangentOverlay =
    p.svgRef.current && quickTangentStart
      ? createPortal(
          <g pointerEvents="none" data-tangent-length-preview data-ui>
            <circle
              cx={quickTangentStart.x}
              cy={quickTangentStart.y}
              r={4 / p.zoom}
              fill="#ffffff"
              stroke="#348b57"
              strokeWidth={1.2 / p.zoom}
            />
            {quickTangentPreview?.candidates.map((candidate, index) => {
              const active = index === quickTangentPreview.active,
                line =
                  active && quickTangentPreview.line
                    ? quickTangentPreview.line
                    : tangentLineForPointer(
                        quickTangentStart,
                        candidate,
                        candidate.end,
                        24 / Math.max(p.zoom, 1e-6),
                      );
              return (
                <g key={`${candidate.contact.x}-${candidate.contact.y}-${index}`}>
                  <path
                    d={`M${line.start.x} ${line.start.y}L${line.end.x} ${line.end.y}`}
                    fill="none"
                    stroke={active ? "#2f9e5b" : "#8cb99a"}
                    strokeWidth={(active ? 1.7 : 0.9) / p.zoom}
                    strokeDasharray={
                      active ? undefined : `${4 / p.zoom} ${3 / p.zoom}`
                    }
                  />
                  <circle
                    cx={candidate.contact.x}
                    cy={candidate.contact.y}
                    r={(active ? 4 : 3) / p.zoom}
                    fill={active ? "#2f9e5b" : "white"}
                    stroke="#2f9e5b"
                    strokeWidth={1 / p.zoom}
                  />
                </g>
              );
            })}
            {quickTangentPreview &&
              quickTangentPreview.candidates.length === 0 && (
                <text
                  x={quickTangentStart.x + 10 / p.zoom}
                  y={quickTangentStart.y - 10 / p.zoom}
                  fontSize={11 / p.zoom}
                  fill="#b04a4a"
                  stroke="white"
                  strokeWidth={3 / p.zoom}
                  paintOrder="stroke"
                >
                  No tangent
                </text>
              )}
          </g>,
          p.svgRef.current,
        )
      : null;

  const constructionActive = quickStart || quickTangentStart;
  return (
    <div
      className={`current-canvas-construction-overlay${constructionActive ? " construction-active" : ""}`}
      style={{ display: "contents" }}
      onPointerDownCapture={pointerDown}
      onPointerMoveCapture={pointerMove}
      onPointerUpCapture={pointerUpCapture}
      onPointerUp={finishPointer}
      onPointerCancel={finishPointer}
    >
      <style>{`.current-canvas-construction-overlay.construction-active [data-perpendicular-preview],.current-canvas-construction-overlay.construction-active [data-tangent-preview]{display:none}`}</style>
      <CurrentCanvasCore
        {...p}
        document={coreDocument}
        onReplace={wrappedReplace}
        onCancel={wrappedCancel}
      />
      {perpendicularOverlay}
      {tangentOverlay}
    </div>
  );
}
