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
import type { DiagramDocument, Point } from "./types";

type Props = ComponentProps<typeof CurrentCanvasCore>;
type ReplaceUpdate = Parameters<Props["onReplace"]>[0];

function decorateNewLine(
  before: DiagramDocument,
  after: DiagramDocument,
  marker: NonNullable<PerpendicularPreview["marker"]> | null,
) {
  if (!marker) return after;
  const existing = new Set(before.elements.map((element) => element.id));
  let decorated = false;
  const elements = after.elements.map((element) => {
    if (!decorated && element.type === "line" && !existing.has(element.id)) {
      decorated = true;
      return { ...element, endHead: marker };
    }
    return element;
  });
  return decorated ? { ...after, elements } : after;
}

export function CurrentCanvas(p: Props) {
  const startRef = useRef<Point | null>(null),
    previewRef = useRef<PerpendicularPreview | null>(null),
    gestureRef = useRef(false),
    commitPendingRef = useRef(false);
  const [quickStart, setQuickStart] = useState<Point | null>(null),
    [quickPreview, setQuickPreview] = useState<PerpendicularPreview | null>(null);

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

  const clearQuickPick = () => {
    startRef.current = null;
    previewRef.current = null;
    gestureRef.current = false;
    commitPendingRef.current = false;
    setQuickStart(null);
    setQuickPreview(null);
  };

  useEffect(() => {
    if (p.tool !== "perpendicular") clearQuickPick();
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

  const resolveQuickPreview = (pointer: Point) => {
    const source = startRef.current;
    if (!source) return null;
    const previous = previewRef.current,
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
      preview = buildPerpendicularPreview(
        source,
        target,
        p.document.width,
        p.document.height,
      );
    if (!preview) return null;
    return {
      ...preview,
      marker: perpendicularMarkerAt(pointer, preview, p.zoom),
    };
  };

  const updateQuickPreview = (pointer: Point) => {
    const preview = resolveQuickPreview(pointer);
    previewRef.current = preview;
    setQuickPreview(preview);
    return preview;
  };

  const pointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (
      p.tool !== "perpendicular" ||
      p.editId ||
      event.button !== 0 ||
      (event.target as Element).closest(
        ".inline-text-editor,.canvas-context-menu,.context-dismiss",
      )
    )
      return;
    const start = snapConstructionStart(constrain(eventPoint(event)));
    startRef.current = start;
    previewRef.current = null;
    gestureRef.current = true;
    commitPendingRef.current = false;
    setQuickStart(start);
    setQuickPreview(null);
  };

  const pointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!gestureRef.current || p.tool !== "perpendicular") return;
    updateQuickPreview(constrain(eventPoint(event)));
  };

  const pointerUpCapture = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!gestureRef.current || p.tool !== "perpendicular") return;
    commitPendingRef.current = true;
    updateQuickPreview(constrain(eventPoint(event)));
  };

  const wrappedReplace = (next: ReplaceUpdate) => {
    const marker =
      gestureRef.current && commitPendingRef.current
        ? previewRef.current?.marker ?? null
        : null;
    if (typeof next === "function")
      p.onReplace((document) =>
        decorateNewLine(document, next(document), marker),
      );
    else p.onReplace(decorateNewLine(p.document, next, marker));
  };

  const wrappedCancel = () => {
    const preview =
      gestureRef.current && commitPendingRef.current ? previewRef.current : null;
    // CurrentCanvasCore only recognizes the target while the pointer remains
    // close to the finite Line segment. If the pointer is now inside one of
    // the quick-pick corners (or on the line extension), commit our retained
    // construction instead of cancelling the gesture.
    if (preview) {
      const line = makeElement(
        "line",
        preview.start.x,
        preview.start.y,
        preview.end.x - preview.start.x,
        preview.end.y - preview.start.y,
      );
      if (preview.marker) line.endHead = preview.marker;
      p.onReplace((document) => ({
        ...document,
        elements: [...document.elements, line],
      }));
      p.onSelect([line.id]);
      p.onEnd();
      return;
    }
    p.onCancel();
  };

  const finishPointer = () => clearQuickPick();

  const overlay =
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

  return (
    <div
      className={`current-canvas-quick-perpendicular${quickStart ? " quick-pick-active" : ""}`}
      style={{ display: "contents" }}
      onPointerDownCapture={pointerDown}
      onPointerMoveCapture={pointerMove}
      onPointerUpCapture={pointerUpCapture}
      onPointerUp={finishPointer}
      onPointerCancel={finishPointer}
    >
      <style>{`.current-canvas-quick-perpendicular.quick-pick-active [data-perpendicular-preview]{display:none}`}</style>
      <CurrentCanvasCore
        {...p}
        onReplace={wrappedReplace}
        onCancel={wrappedCancel}
      />
      {overlay}
    </div>
  );
}
