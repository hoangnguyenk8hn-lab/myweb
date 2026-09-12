"use client";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from "react";
import { MathInput } from "./MathInput";
import { SceneElement } from "./SceneElement";
import { IntersectionLayer } from "./IntersectionLayer";
import {
  collectIntersections,
  dropLineEndpoint,
  elementTouchesRect,
} from "./intersections";
import {
  collectSnapTargets,
  objectSnapTargets,
  snapPointToScene,
  translationSnap,
  SNAP_LABELS,
  type SnapTarget,
} from "./snapping";
import { makeElement } from "./currentDocument";
import { createId } from "./defaultDocument";
import {
  absolutePoints,
  center,
  curveControls,
  drawElement,
  elementShapeId,
  elementTransform,
  isCurve,
  lineVertices,
  LINE_TYPES,
  localPoint,
  moveLineEndpoint,
  moveLineVertex,
  movePolygonPoint,
  resolveElement,
  resizeElements,
  sceneBounds,
  TEXT_TYPES,
  within,
  worldBounds,
  worldPoint,
} from "./sceneGeometry";
import { normalizeBox } from "./geometry";
import { FIXED_ASPECT_SHAPES } from "./shapes";
import {
  tangentCandidates,
  tangentLineForPointer,
  tangentRetainsCandidateAt,
  tangentTargetAt,
  type TangentCandidate,
  type TangentLinePreview,
} from "./tangents";
import {
  assistedLineForPointer as perpendicularLineForPointer,
  assistedLineMarkerAt as perpendicularMarkerAt,
  assistedLinePreview as buildPerpendicularPreview,
  assistedLineRetainsTargetAt as perpendicularRetainsTargetAt,
  assistedLineEndHead,
  assistedLineRightAngleGuidePath as rightAngleGuidePath,
  assistedLineTargetAt,
  RIGHT_ANGLE_MARKERS,
  type AssistedLinePreview as PerpendicularPreview,
} from "./assistedLine";
import {
  pointReflectionPreview as buildPointReflectionPreview,
  pointReflectionTargetAt,
  type PointReflectionPreview,
} from "./pointReflection";
import {
  isAssistedLineConstruction,
  type AssistedLineConstruction,
  type DiagramDocument,
  type DiagramElement,
  type DiagramTool,
  type Point,
} from "./types";

type Update = DiagramDocument | ((d: DiagramDocument) => DiagramDocument);
type Box = { x: number; y: number; width: number; height: number };
type Gesture =
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
      kind: "control" | "endpoint" | "point";
      index: number;
      original: DiagramElement;
    }
  | { kind: "marquee"; start: Point; add: string[] }
  | { kind: "connect"; id: string; from: string; start: Point }
  | { kind: "pan"; start: Point; scroll: Point }
  | { kind: "canvas-size"; start: Point; width: number; height: number };
type TangentPreviewState = {
  targetId: string;
  candidates: TangentCandidate[];
  active: number;
  line: TangentLinePreview | null;
};

function isSelectionHandleGesture(gesture: Gesture) {
  return ["resize", "rotate", "endpoint", "control", "point"].includes(
    gesture.kind,
  );
}
interface Props {
  document: DiagramDocument;
  tool: DiagramTool;
  selectedIds: string[];
  onSelect: (ids: string[]) => void;
  onTool: (tool: DiagramTool) => void;
  onReplace: (next: Update) => void;
  onBegin: () => void;
  onEnd: () => void;
  onCancel: () => void;
  svgRef: RefObject<SVGSVGElement | null>;
  zoom: number;
  onZoom: (zoom: number) => void;
  guides: boolean;
  editId: string | null;
  onEdit: (id: string | null) => void;
  onPlot: (id: string) => void;
  onCommand: (name: string) => void;
}
const CIRCULAR_HANDLE_DIRECTIONS = {
  nw: [-Math.SQRT1_2, -Math.SQRT1_2],
  n: [0, -1],
  ne: [Math.SQRT1_2, -Math.SQRT1_2],
  e: [1, 0],
  se: [Math.SQRT1_2, Math.SQRT1_2],
  s: [0, 1],
  sw: [-Math.SQRT1_2, Math.SQRT1_2],
  w: [-1, 0],
} as const;
function union(elements: DiagramElement[]): Box {
  const boxes = elements.map(elements.length === 1 ? sceneBounds : worldBounds);
  const x = Math.min(...boxes.map((b) => b.x)),
    y = Math.min(...boxes.map((b) => b.y));
  return {
    x,
    y,
    width: Math.max(1, Math.max(...boxes.map((b) => b.x + b.width)) - x),
    height: Math.max(1, Math.max(...boxes.map((b) => b.y + b.height)) - y),
  };
}
function pointsBox(points: Point[]) {
  const x = Math.min(...points.map((p) => p.x)),
    y = Math.min(...points.map((p) => p.y)),
    width = Math.max(0.01, Math.max(...points.map((p) => p.x)) - x),
    height = Math.max(0.01, Math.max(...points.map((p) => p.y)) - y);
  return {
    x,
    y,
    width,
    height,
    points: points.map((p) => ({
      x: (p.x - x) / width,
      y: (p.y - y) / height,
    })),
  };
}
function optionDragCopies(source: DiagramElement[]) {
  const idMap = new Map(source.map((e) => [e.id, createId(e.type)])),
    groups = new Map(
      source
        .filter((e) => e.groupId)
        .map((e) => [e.groupId!, createId("group")]),
    );
  return source.map((e) => ({
    ...structuredClone(e),
    id: idMap.get(e.id)!,
    locked: false,
    groupId: e.groupId ? groups.get(e.groupId) : undefined,
    fromId: e.fromId ? idMap.get(e.fromId) : undefined,
    toId: e.toId ? idMap.get(e.toId) : undefined,
    intersectionWith: e.intersectionWith?.flatMap((id) =>
      idMap.has(id) ? [idMap.get(id)!] : [],
    ),
  }));
}
export function CurrentCanvas(p: Props) {
  const { document: d, tool, selectedIds, zoom } = p;
  const viewport = useRef<HTMLDivElement>(null),
    gesture = useRef<Gesture | null>(null),
    space = useRef(false),
    polygon = useRef<{ id: string; points: Point[]; tool: DiagramTool } | null>(
      null,
    ),
    textRevision = useRef(0);
  const snappedTarget = useRef<SnapTarget | null>(null),
    gestureTargets = useRef<SnapTarget[]>([]),
    tangentPreviewRef = useRef<TangentPreviewState | null>(null),
    perpendicularPreviewRef = useRef<PerpendicularPreview | null>(null),
    disableGridSnapRef = useRef(false);
  const [marquee, setMarquee] = useState<Box | null>(null),
    [snapLines, setSnapLines] = useState<{ x?: number; y?: number }>({}),
    [snapPoint, setSnapPoint] = useState<SnapTarget | null>(null),
    [dragging, setDragging] = useState(false),
    [context, setContext] = useState<Point | null>(null),
    [polyPreview, setPolyPreview] = useState<Point | null>(null),
    [tangentStart, setTangentStart] = useState<Point | null>(null),
    [tangentPreview, setTangentPreview] = useState<TangentPreviewState | null>(
      null,
    ),
    [perpendicularStart, setPerpendicularStart] = useState<Point | null>(null),
    [perpendicularPreview, setPerpendicularPreview] =
      useState<PerpendicularPreview | null>(null),
    [reflectionStart, setReflectionStart] = useState<Point | null>(null),
    [reflectionPreview, setReflectionPreview] =
      useState<PointReflectionPreview | null>(null);
  const elements = useMemo(
    () => d.elements.map((e) => resolveElement(e, d)),
    [d.elements],
  );
  const selected = elements.filter((e) => selectedIds.includes(e.id));
  const intersections = useMemo(
    () => collectIntersections(elements),
    [elements],
  );
  const snapTargets = useMemo(
    () => collectSnapTargets(elements, intersections),
    [elements, intersections],
  );
  const single = selected.length === 1 ? selected[0] : undefined;
  const box = selected.length ? union(selected) : null;
  const singleShape = single ? elementShapeId(single) : undefined;
  const regularPolygonSelection =
    single && singleShape === "regular-polygon"
      ? {
          cx: center(single).x,
          cy: center(single).y,
          r: Math.max(Math.abs(single.width), Math.abs(single.height)) * 0.43,
        }
      : null;
  const showSelectionCenter =
    !!single &&
    (singleShape === "circle" || single.textBorder === "circle" || !!single.boxed);
  const edit = elements.find((e) => e.id === p.editId);
  useEffect(() => {
    if (tool !== "tangent") {
      setTangentStart(null);
      setTangentPreview(null);
      tangentPreviewRef.current = null;
    }
    if (!isAssistedLineConstruction(tool)) {
      setPerpendicularStart(null);
      setPerpendicularPreview(null);
      perpendicularPreviewRef.current = null;
    }
    if (tool !== "point-reflection") {
      setReflectionStart(null);
      setReflectionPreview(null);
    }
  }, [tool]);
  const pos = (event: { clientX: number; clientY: number }): Point => {
    const svg = p.svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const matrix = svg.getScreenCTM();
    if (!matrix) return { x: 0, y: 0 };
    const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(
      matrix.inverse(),
    );
    return { x: point.x, y: point.y };
  };
  const constrain = (q: Point) => ({
    x: Math.max(0, Math.min(d.width, q.x)),
    y: Math.max(0, Math.min(d.height, q.y)),
  });
  const snap = (q: Point, excluded: string[] = selectedIds): Point => {
    // An endpoint may snap to its own original crossing without chasing a
    // crossing that changes on each frame of the drag.
    const g = gesture.current,
      endpoint = g?.kind === "endpoint";
    const result = snapPointToScene(q, {
      grid: d.grid,
      gridEnabled: d.grid.snap && !disableGridSnapRef.current,
      elements,
      targets: g?.kind === "move" ? [] : endpoint ? gestureTargets.current : snapTargets,
      excluded,
      zoom,
      ownIntersectionId: endpoint ? g.original.id : undefined,
    });
    snappedTarget.current = result.target;
    setSnapPoint(result.target);
    setSnapLines(result.guides);
    return result.point;
  };
  const nearestTangentBranch = (
    pointer: Point,
    candidates: TangentCandidate[],
  ) => {
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
  };
  const updateTangentPreview = (source: Point, pointer: Point) => {
    const previous = tangentPreviewRef.current;
    const previousCandidate =
      previous && previous.active >= 0 ? previous.candidates[previous.active] : null;
    const retainPrevious =
      !!previousCandidate &&
      tangentRetainsCandidateAt(pointer, source, previousCandidate, zoom);
    const directTarget = retainPrevious
      ? null
      : tangentTargetAt(pointer, elements, zoom);

    let next: TangentPreviewState | null = null;
    if (retainPrevious && previous) {
      next = {
        ...previous,
        line:
          previous.active >= 0
            ? tangentLineForPointer(
                source,
                previous.candidates[previous.active],
                pointer,
                24 / Math.max(zoom, 1e-6),
              )
            : null,
      };
    } else if (directTarget) {
      const candidates =
        previous?.targetId === directTarget.id
          ? previous.candidates
          : tangentCandidates(source, directTarget);
      const active = nearestTangentBranch(pointer, candidates);
      next = {
        targetId: directTarget.id,
        candidates,
        active,
        line:
          active >= 0
            ? tangentLineForPointer(
                source,
                candidates[active],
                pointer,
                24 / Math.max(zoom, 1e-6),
              )
            : null,
      };
    }
    tangentPreviewRef.current = next;
    setTangentPreview(next);
    return next;
  };
  const updatePerpendicularPreview = (
    source: Point,
    pointer: Point,
    mode: AssistedLineConstruction,
  ) => {
    const previous = perpendicularPreviewRef.current;
    const scale = Math.max(zoom, 1e-6);
    const inQuickPick =
      !!previous &&
      Math.hypot(pointer.x - previous.foot.x, pointer.y - previous.foot.y) <=
        30 / scale;
    const directTarget = inQuickPick
      ? null
      : assistedLineTargetAt(mode, pointer, elements, zoom);
    const retainedTarget =
      previous &&
      (inQuickPick ||
        (!directTarget && perpendicularRetainsTargetAt(pointer, previous, zoom)))
        ? previous.target
        : null;
    const target = retainedTarget ?? directTarget;
    const base = buildPerpendicularPreview(source, target);
    const previousEnd =
      previous && base && previous.target.id === base.target.id
        ? previous.end
        : null;
    const extended = base
      ? perpendicularLineForPointer(pointer, base, previousEnd, zoom)
      : null;
    const next =
      extended?.kind === "perpendicular"
        ? {
            ...extended,
            marker: perpendicularMarkerAt(pointer, extended, zoom),
          }
        : extended;
    perpendicularPreviewRef.current = next;
    setPerpendicularPreview(next);
    return next;
  };
  const patch = (id: string, update: Partial<DiagramElement>) =>
    p.onReplace((doc) => ({
      ...doc,
      elements: doc.elements.map((e) =>
        e.id === id ? { ...e, ...update } : e,
      ),
    }));
  const updateText = (e: DiagramElement, text: string) => {
    const revision = ++textRevision.current;
    patch(e.id, { text });
    const fontSize = e.fontSize ?? 17;
    if ((e.textMode ?? (e.type === "text" ? "math" : "text")) === "math")
      void import("./mathSvg").then(({ renderMathSvg }) => {
        try {
          const { box } = renderMathSvg(text);
          if (revision === textRevision.current)
            patch(e.id, {
              width: Math.max(20, (box[2] * fontSize) / 1000 + 10),
              height: Math.max(26, (box[3] * fontSize) / 1000 + 8),
            });
        } catch {}
      });
    else {
      const canvas = document.createElement("canvas"),
        ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.font = `${e.bold ? "bold " : ""}${e.italic ? "italic " : ""}${fontSize}px ${e.fontFamily ?? "Arial"}`;
        patch(e.id, {
          width: Math.max(
            30,
            ...text.split("\n").map((line) => ctx.measureText(line).width + 14),
          ),
          height: Math.max(26, text.split("\n").length * fontSize * 1.2 + 8),
        });
      }
    }
  };
  const capture = (event: ReactPointerEvent) => {
    p.svgRef.current?.setPointerCapture(event.pointerId);
    setDragging(true);
  };
  const begin = (event: ReactPointerEvent, g: Gesture) => {
    event.preventDefault();
    event.stopPropagation();
    gesture.current = g;
    disableGridSnapRef.current =
      event.altKey && isSelectionHandleGesture(g);
    gestureTargets.current = snapTargets;
    snappedTarget.current = null;
    setSnapPoint(null);
    if (g.kind !== "pan" && g.kind !== "marquee") p.onBegin();
    capture(event);
  };
  const finishPolygon = () => {
    if (!polygon.current) return;
    setSnapPoint(null);
    snappedTarget.current = null;
    setSnapLines({});
    if (polygon.current.points.length < 3) {
      p.onCancel();
    } else {
      patch(polygon.current.id, pointsBox(polygon.current.points));
      p.onEnd();
    }
    polygon.current = null;
    setPolyPreview(null);
    p.onTool("select");
  };
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (target.closest?.("input,textarea,math-field,[contenteditable=true]"))
        return;
      if (event.code === "Space") {
        space.current = true;
        event.preventDefault();
      }
      if (event.key === "Escape") {
        snappedTarget.current = null;
        setSnapPoint(null);
        gesture.current = null;
        polygon.current = null;
        setDragging(false);
        setMarquee(null);
        setPolyPreview(null);
        setTangentStart(null);
        setTangentPreview(null);
        tangentPreviewRef.current = null;
        setPerpendicularStart(null);
        setPerpendicularPreview(null);
        perpendicularPreviewRef.current = null;
        setReflectionStart(null);
        setReflectionPreview(null);
        disableGridSnapRef.current = false;
        setSnapLines({});
        p.onCancel();
        setContext(null);
      }
      if (event.key === "Enter" && polygon.current) {
        event.preventDefault();
        finishPolygon();
      }
    };
    const keyup = (e: KeyboardEvent) => {
      if (e.code === "Space") space.current = false;
    };
    window.addEventListener("keydown", keydown);
    window.addEventListener("keyup", keyup);
    return () => {
      window.removeEventListener("keydown", keydown);
      window.removeEventListener("keyup", keyup);
    };
  });
  useEffect(() => {
    if (polygon.current && polygon.current.tool !== tool) {
      p.onCancel();
      polygon.current = null;
      setPolyPreview(null);
    }
  }, [tool, p.onCancel]);
  useEffect(() => {
    if (p.editId) p.onBegin();
  }, [p.editId, p.onBegin]);
  const closeEdit = (cancel = false) => {
    textRevision.current++;
    cancel ? p.onCancel() : p.onEnd();
    p.onEdit(null);
  };
  const targetNode = (point: Point, excluded: string[]) =>
    [...elements]
      .reverse()
      .find(
        (e) =>
          !excluded.includes(e.id) &&
          !LINE_TYPES.has(e.type) &&
          e.type !== "freehand" &&
          within(localPoint(point, e), e, 8),
      );
  const backgroundDown = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (event.button === 2) return;
    setContext(null);
    if (p.editId) {
      closeEdit();
      return;
    }
    const q = constrain(pos(event));
    if (space.current || event.button === 1 || tool === "hand") {
      begin(event, {
        kind: "pan",
        start: { x: event.clientX, y: event.clientY },
        scroll: {
          x: viewport.current?.scrollLeft ?? 0,
          y: viewport.current?.scrollTop ?? 0,
        },
      });
      return;
    }
    if (tool === "select") {
      if (!event.shiftKey) p.onSelect([]);
      begin(event, {
        kind: "marquee",
        start: q,
        add: event.shiftKey ? selectedIds : [],
      });
      setMarquee({ ...q, width: 0, height: 0 });
      return;
    }
    if (tool === "tangent") {
      const start = snap(q, []);
      setTangentStart(start);
      setTangentPreview(null);
      tangentPreviewRef.current = null;
      p.onSelect([]);
      begin(event, { kind: "tangent", start });
      return;
    }
    if (isAssistedLineConstruction(tool)) {
      const start = snap(q, []);
      setPerpendicularStart(start);
      setPerpendicularPreview(null);
      perpendicularPreviewRef.current = null;
      p.onSelect([]);
      begin(event, { kind: "perpendicular", start, mode: tool });
      return;
    }
    if (tool === "point-reflection") {
      const start = snap(q, []);
      setReflectionStart(start);
      setReflectionPreview(null);
      p.onSelect([]);
      begin(event, { kind: "point-reflection", start });
      return;
    }
    if (tool === "polyline" || tool === "polycurve") {
      const point = snap(q, []);
      if (polygon.current) {
        if (event.detail >= 2) {
          finishPolygon();
          return;
        }
        polygon.current.points.push(point);
        patch(polygon.current.id, pointsBox(polygon.current.points));
      } else {
        const e = makeElement(tool, point.x, point.y, 1, 1);
        e.points = [{ x: 0, y: 0 }];
        p.onBegin();
        p.onReplace((doc) => ({ ...doc, elements: [...doc.elements, e] }));
        polygon.current = { id: e.id, points: [point], tool };
        p.onSelect([e.id]);
      }
      return;
    }
    const start = snap(q, []);
    const e = makeElement(tool, start.x, start.y, 1, 1);
    if (TEXT_TYPES.has(e.type)) {
      p.onBegin();
      p.onReplace((doc) => ({ ...doc, elements: [...doc.elements, e] }));
      p.onEnd();
      p.onSelect([e.id]);
      p.onTool("select");
      p.onEdit(e.id);
      return;
    }
    begin(event, {
      kind: tool === "freehand" ? "freehand" : "draw",
      id: e.id,
      start,
      points: [start],
      original: e,
    });
    p.onReplace((doc) => ({ ...doc, elements: [...doc.elements, e] }));
    p.onSelect([e.id]);
  };
  const elementDown = (
    event: ReactPointerEvent<SVGGElement>,
    e: DiagramElement,
  ) => {
    if (tool !== "select" || space.current || event.button === 1) return;
    if (event.button === 2) {
      if (!selectedIds.includes(e.id)) p.onSelect([e.id]);
      return;
    }
    if (p.editId) {
      closeEdit();
      return;
    }
    const group = e.groupId
      ? elements.filter((n) => n.groupId === e.groupId).map((n) => n.id)
      : [e.id];
    let ids = selectedIds;
    if (event.shiftKey) {
      ids = selectedIds.includes(e.id)
        ? selectedIds.filter((id) => !group.includes(id))
        : [...new Set([...selectedIds, ...group])];
      p.onSelect(ids);
    } else if (!ids.includes(e.id)) {
      ids = group;
      p.onSelect(ids);
    }
    if (e.locked) {
      event.stopPropagation();
      return;
    }
    const originals = elements.filter((n) => ids.includes(n.id) && !n.locked);
    setContext(null);
    begin(event, {
      kind: "move",
      start: pos(event),
      originals,
      copySource: event.altKey ? originals : undefined,
      copied: false,
    });
  };
  const move = (event: ReactPointerEvent<SVGSVGElement>) => {
    const raw = pos(event);
    if (polygon.current) {
      setPolyPreview(snap(constrain(raw), [polygon.current.id]));
      return;
    }
    const g = gesture.current;
    if (g && isSelectionHandleGesture(g))
      disableGridSnapRef.current = event.altKey;
    if (!g) {
      if (tool !== "select" && tool !== "hand" && !p.editId)
        snap(constrain(raw), []);
      return;
    }
    if (g.kind === "pan") {
      if (viewport.current) {
        viewport.current.scrollLeft = g.scroll.x - event.clientX + g.start.x;
        viewport.current.scrollTop = g.scroll.y - event.clientY + g.start.y;
      }
      return;
    }
    const q = constrain(raw);
    if (g.kind === "marquee") {
      setMarquee(normalizeBox(g.start, q));
      return;
    }
    if (g.kind === "canvas-size") {
      p.onReplace((doc) => ({
        ...doc,
        width: Math.max(100, Math.round(g.width + raw.x - g.start.x)),
        height: Math.max(100, Math.round(g.height + raw.y - g.start.y)),
      }));
      return;
    }
    if (g.kind === "tangent") {
      updateTangentPreview(g.start, q);
      return;
    }
    if (g.kind === "perpendicular") {
      updatePerpendicularPreview(g.start, q, g.mode);
      return;
    }
    if (g.kind === "point-reflection") {
      const target = pointReflectionTargetAt(q, elements, snapTargets, zoom);
      setReflectionPreview(buildPointReflectionPreview(g.start, target));
      return;
    }
    if (g.kind === "draw") {
      patch(
        g.id,
        drawElement(g.original, g.start, snap(q, [g.id]), event.shiftKey),
      );
      return;
    }
    if (g.kind === "freehand") {
      if (
        g.points.length < 5000 &&
        Math.hypot(
          q.x - g.points[g.points.length - 1].x,
          q.y - g.points[g.points.length - 1].y,
        ) >
        1.5 / zoom
      ) {
        g.points.push(q);
        patch(g.id, pointsBox(g.points));
      }
      return;
    }
    if (g.kind === "move") {
      let insertCopies = false;
      if (g.copySource && !g.copied) {
        if (Math.hypot(q.x - g.start.x, q.y - g.start.y) <= 1 / zoom) return;
        const copies = optionDragCopies(g.copySource);
        g.originals = copies;
        g.copied = true;
        insertCopies = true;
        p.onSelect(copies.map((e) => e.id));
      }
      if (!g.originals.length) return;
      const base = worldBounds(g.originals[0]),
        dx = q.x - g.start.x,
        dy = q.y - g.start.y,
        excludedIds = [
          ...g.originals.map((e) => e.id),
          ...(g.copied ? (g.copySource ?? []).map((e) => e.id) : []),
        ];
      const next = snap(
        { x: base.x + dx, y: base.y + dy },
        excludedIds,
      );
      let shift = { x: next.x - base.x, y: next.y - base.y };
      const aligned =
        !event.shiftKey
          ? translationSnap(
              g.originals.flatMap(objectSnapTargets),
              { x: dx, y: dy },
              snapTargets,
              excludedIds,
              zoom,
            )
          : null;
      if (aligned) {
        shift = aligned.shift;
        snappedTarget.current = aligned.target;
        setSnapPoint(aligned.target);
        setSnapLines({ x: aligned.target.point.x, y: aligned.target.point.y });
      } else if (event.shiftKey) {
        snappedTarget.current = null;
        setSnapPoint(null);
      }
      if (event.shiftKey)
        shift =
          Math.abs(dx) > Math.abs(dy)
            ? { x: shift.x, y: 0 }
            : { x: 0, y: shift.y };
      const updates = new Map(
        g.originals.map((e) => [e.id, { x: e.x + shift.x, y: e.y + shift.y }]),
      );
      p.onReplace((doc) => ({
        ...doc,
        elements: insertCopies
          ? [
              ...doc.elements,
              ...g.originals.map((e) => ({ ...e, ...updates.get(e.id) })),
            ]
          : doc.elements.map((e) =>
              updates.has(e.id) ? { ...e, ...updates.get(e.id) } : e,
            ),
      }));
      return;
    }
    if (g.kind === "resize") {
      const snapped = snap(
        q,
        g.originals.map((e) => e.id),
      );
      const current = g.local ? localPoint(snapped, g.originals[0]) : snapped;
      const start = g.local ? localPoint(g.start, g.originals[0]) : g.start;
      const local = {
        x:
          g.box.x +
          (g.handle.includes("w")
            ? 0
            : g.handle.includes("e")
              ? g.box.width
              : g.box.width / 2) +
          current.x -
          start.x,
        y:
          g.box.y +
          (g.handle.includes("n")
            ? 0
            : g.handle.includes("s")
              ? g.box.height
              : g.box.height / 2) +
          current.y -
          start.y,
      };
      const end = g.local
        ? localPoint(snap(worldPoint(local, g.originals[0])), g.originals[0])
        : snap(local);
      let x = g.box.x,
        y = g.box.y,
        w = g.box.width,
        h = g.box.height;
      if (g.handle.includes("w")) {
        x = Math.min(end.x, g.box.x + w - 4);
        w = g.box.x + g.box.width - x;
      }
      if (g.handle.includes("e")) w = Math.max(4, end.x - x);
      if (g.handle.includes("n")) {
        y = Math.min(end.y, g.box.y + h - 4);
        h = g.box.y + g.box.height - y;
      }
      if (g.handle.includes("s")) h = Math.max(4, end.y - y);
      if (
        event.shiftKey ||
        g.originals.some((e) => FIXED_ASPECT_SHAPES.has(e.shape ?? e.type))
      ) {
        const ratio = g.box.width / g.box.height;
        if (g.handle === "e" || g.handle === "w") h = w / ratio;
        else if (g.handle === "n" || g.handle === "s") w = h * ratio;
        else if (
          Math.abs(w / g.box.width - 1) >= Math.abs(h / g.box.height - 1)
        )
          h = w / ratio;
        else w = h * ratio;
        if (g.handle.includes("w")) x = g.box.x + g.box.width - w;
        if (g.handle.includes("n")) y = g.box.y + g.box.height - h;
        if (g.handle === "e" || g.handle === "w")
          y = g.box.y + (g.box.height - h) / 2;
        if (g.handle === "n" || g.handle === "s")
          x = g.box.x + (g.box.width - w) / 2;
      }
      const updates = new Map(
        resizeElements(
          g.originals,
          g.box,
          { x, y, width: w, height: h },
          g.local,
          { altKey: event.altKey },
        ).map((e) => [e.id, e]),
      );
      p.onReplace((doc) => ({
        ...doc,
        elements: doc.elements.map((e) =>
          updates.has(e.id) ? { ...e, ...updates.get(e.id) } : e,
        ),
      }));
      return;
    }
    if (g.kind === "rotate") {
      let rotation =
        g.original.rotation +
        (Math.atan2(q.y - g.center.y, q.x - g.center.x) * 180) / Math.PI -
        g.angle;
      if (event.shiftKey) rotation = Math.round(rotation / 15) * 15;
      patch(g.original.id, { rotation: Math.round(rotation * 10) / 10 });
      return;
    }
    if (g.kind === "control") {
      const point = localPoint(snap(q, [g.original.id]), g.original);
      patch(g.original.id, {
        [g.index === 0 ? "control1" : "control2"]: {
          x: point.x - g.original.x,
          y: point.y - g.original.y,
        },
      });
      return;
    }
    if (g.kind === "endpoint") {
      patch(
        g.original.id,
        moveLineEndpoint(g.original, g.index, snap(q, [g.original.id]), {
          altKey: event.altKey,
        }),
      );
      return;
    }
    if (g.kind === "point") {
      patch(
        g.original.id,
        LINE_TYPES.has(g.original.type)
          ? moveLineVertex(g.original, g.index, snap(q, [g.original.id]))
          : movePolygonPoint(g.original, g.index, snap(q, [g.original.id])),
      );
      return;
    }
    if (g.kind === "connect") {
      const end = snap(q, [g.id]);
      patch(g.id, {
        width: end.x - g.start.x,
        height: end.y - g.start.y,
        toId: snappedTarget.current
          ? undefined
          : targetNode(q, [g.from, g.id])?.id,
      });
    }
  };
  const up = (event: ReactPointerEvent<SVGSVGElement>) => {
    const g = gesture.current;
    if (!g) return;
    if (
      ["draw", "connect", "point", "control"].includes(g.kind) ||
      (g.kind === "move" &&
        Math.hypot(pos(event).x - g.start.x, pos(event).y - g.start.y) >
          1 / zoom)
    )
      move(event);
    const q = constrain(pos(event));
    if (g.kind === "marquee") {
      const b = normalizeBox(g.start, q);
      const dragged = b.width > 1 / zoom || b.height > 1 / zoom;
      p.onSelect([
        ...new Set([
          ...g.add,
          ...elements
            .filter((e) => dragged && elementTouchesRect(e, b))
            .flatMap((e) =>
              e.groupId
                ? elements
                    .filter((n) => n.groupId === e.groupId)
                    .map((n) => n.id)
                : [e.id],
            ),
        ]),
      ]);
      setMarquee(null);
    } else if (g.kind === "tangent") {
      const preview = updateTangentPreview(g.start, q);
      if (preview?.line) {
        const line = makeElement(
          "line",
          preview.line.start.x,
          preview.line.start.y,
          preview.line.end.x - preview.line.start.x,
          preview.line.end.y - preview.line.start.y,
        );
        p.onReplace((doc) => ({ ...doc, elements: [...doc.elements, line] }));
        p.onSelect([line.id]);
        p.onEnd();
      } else p.onCancel();
      setTangentStart(null);
      setTangentPreview(null);
      tangentPreviewRef.current = null;
    } else if (g.kind === "perpendicular") {
      const preview = updatePerpendicularPreview(g.start, q, g.mode);
      if (preview) {
        const line = makeElement(
          "line",
          preview.start.x,
          preview.start.y,
          preview.end.x - preview.start.x,
          preview.end.y - preview.start.y,
        );
        line.endHead = assistedLineEndHead(preview);
        p.onReplace((doc) => ({ ...doc, elements: [...doc.elements, line] }));
        p.onSelect([line.id]);
        p.onEnd();
      } else p.onCancel();
      setPerpendicularStart(null);
      setPerpendicularPreview(null);
      perpendicularPreviewRef.current = null;
    } else if (g.kind === "point-reflection") {
      const target = pointReflectionTargetAt(q, elements, snapTargets, zoom),
        preview = buildPointReflectionPreview(g.start, target);
      if (preview) {
        const point = makeElement("point", preview.result.x, preview.result.y, 0, 0);
        p.onReplace((doc) => ({ ...doc, elements: [...doc.elements, point] }));
        p.onSelect([point.id]);
        p.onEnd();
      } else p.onCancel();
      setReflectionStart(null);
      setReflectionPreview(null);
    } else if (g.kind !== "pan") {
      if (g.kind === "draw" && Math.hypot(q.x - g.start.x, q.y - g.start.y) < 4)
        patch(
          g.id,
          drawElement(g.original, g.start, {
            x: g.start.x + 100,
            y: g.start.y + (LINE_TYPES.has(g.original.type) ? 0 : 70),
          }),
        );
      if (g.kind === "endpoint") {
        const end = snap(q, [g.original.id]);
        const target = targetNode(q, [
          g.original.id,
          g.index === 0 ? (g.original.toId ?? "") : (g.original.fromId ?? ""),
        ]);
        patch(
          g.original.id,
          dropLineEndpoint(
            g.original,
            g.index,
            end,
            snappedTarget.current,
            target?.id,
          ),
        );
      }
      if (g.kind === "connect" && !targetNode(q, [g.id, g.from]))
        patch(g.id, { toId: undefined });
      p.onEnd();
      if (g.kind === "draw" || g.kind === "freehand" || g.kind === "connect")
        p.onTool("select");
    }
    gesture.current = null;
    disableGridSnapRef.current = false;
    snappedTarget.current = null;
    gestureTargets.current = [];
    setSnapPoint(null);
    setDragging(false);
    setSnapLines({});
    if (p.svgRef.current?.hasPointerCapture(event.pointerId))
      p.svgRef.current.releasePointerCapture(event.pointerId);
  };
  const startConnect = (
    event: ReactPointerEvent,
    from: DiagramElement,
    start: Point,
  ) => {
    const e = makeElement("arrow", start.x, start.y, 0, 0);
    e.fromId = from.id;
    begin(event, { kind: "connect", id: e.id, from: from.id, start });
    p.onReplace((doc) => ({ ...doc, elements: [e, ...doc.elements] }));
    p.onSelect([e.id]);
  };
  const showGrid =
    d.grid.visible &&
    (!d.grid.editOnly || selected.length > 0 || dragging || tool !== "select");
  const handle = 6 / zoom;
  return (
    <div
      className={`canvas-viewport ${tool === "hand" ? "hand-tool" : tool !== "select" ? "drawing-tool" : ""}`}
      ref={viewport}
      onPointerDown={(event) => {
        if (
          (event.target as Element).closest(
            "svg,.inline-text-editor,.canvas-context-menu,.context-dismiss",
          )
        )
          return;
        if (space.current || tool === "hand" || event.button === 1) {
          begin(event, {
            kind: "pan",
            start: { x: event.clientX, y: event.clientY },
            scroll: {
              x: viewport.current?.scrollLeft ?? 0,
              y: viewport.current?.scrollTop ?? 0,
            },
          });
        } else if (event.button === 0) {
          if (p.editId) closeEdit();
          p.onSelect([]);
        }
      }}
      onWheel={(event) => {
        if (event.ctrlKey || event.metaKey) {
          event.preventDefault();
          p.onZoom(
            Math.max(0.2, Math.min(4, zoom * (event.deltaY > 0 ? 0.9 : 1.1))),
          );
        }
      }}
      onContextMenu={(event) => {
        event.preventDefault();
        setContext({ x: event.clientX, y: event.clientY });
      }}
    >
      <div
        className="canvas-center"
        style={{
          minWidth: d.width * zoom + 160,
          minHeight: d.height * zoom + 160,
        }}
      >
        <div
          className="drawing-surface"
          style={{ width: d.width * zoom, height: d.height * zoom }}
        >
          <svg
            ref={p.svgRef}
            xmlns="http://www.w3.org/2000/svg"
            width={d.width * zoom}
            height={d.height * zoom}
            viewBox={`0 0 ${d.width} ${d.height}`}
            role="application"
            aria-label="Drawing canvas"
            tabIndex={0}
            onPointerDownCapture={() => {
              // Pointer gestures prevent the browser's default focus change.
              // Return keyboard shortcuts to the canvas after editing a field.
              p.svgRef.current?.focus({ preventScroll: true });
            }}
            onPointerDown={backgroundDown}
            onPointerMove={move}
            onPointerLeave={() => {
              if (!gesture.current) {
                snappedTarget.current = null;
                setSnapPoint(null);
                setSnapLines({});
              }
            }}
            onPointerUp={up}
            onPointerCancel={() => {
              gesture.current = null;
              snappedTarget.current = null;
              setSnapPoint(null);
              setDragging(false);
              setTangentStart(null);
              setTangentPreview(null);
              tangentPreviewRef.current = null;
              setPerpendicularStart(null);
              setPerpendicularPreview(null);
              perpendicularPreviewRef.current = null;
              setReflectionStart(null);
              setReflectionPreview(null);
              disableGridSnapRef.current = false;
              setSnapLines({});
              p.onCancel();
            }}
            onDoubleClick={() => {
              if (polygon.current) finishPolygon();
            }}
          >
            <defs>
              <pattern
                id="minor-grid"
                width={d.grid.size}
                height={d.grid.size}
                patternUnits="userSpaceOnUse"
              >
                <path
                  d={`M${d.grid.size} 0H0V${d.grid.size}`}
                  fill="none"
                  stroke="#dddddd"
                  strokeWidth=".5"
                />
              </pattern>
              <pattern
                id="major-grid"
                width={d.grid.size * 5}
                height={d.grid.size * 5}
                patternUnits="userSpaceOnUse"
              >
                <path
                  d={`M${d.grid.size * 5} 0H0V${d.grid.size * 5}`}
                  fill="none"
                  stroke="#bdbdbd"
                  strokeWidth=".6"
                />
              </pattern>
            </defs>
            <rect
              width={d.width}
              height={d.height}
              fill="white"
              data-canvas-background
            />
            {showGrid && (
              <rect
                data-grid
                width={d.width}
                height={d.height}
                fill="url(#minor-grid)"
              />
            )}
            {showGrid && d.grid.major && (
              <rect
                data-grid
                width={d.width}
                height={d.height}
                fill="url(#major-grid)"
              />
            )}
            {elements.map((e) => (
              <SceneElement
                key={e.id}
                element={e}
                onPointerDown={elementDown}
                onDoubleClick={(e) => {
                  if (TEXT_TYPES.has(e.type)) p.onEdit(e.id);
                  if (e.type === "plot") p.onPlot(e.id);
                }}
              />
            ))}
            <IntersectionLayer marks={intersections} />
            <g className="selection-layer" data-ui>
              {tangentStart && (
                <g pointerEvents="none" data-tangent-preview>
                  <circle
                    cx={tangentStart.x}
                    cy={tangentStart.y}
                    r={4 / zoom}
                    fill="#ffffff"
                    stroke="#348b57"
                    strokeWidth={1.2 / zoom}
                  />
                  {tangentPreview?.candidates.map((candidate, i) => {
                    const active = i === tangentPreview.active;
                    const line =
                      active && tangentPreview.line
                        ? tangentPreview.line
                        : tangentLineForPointer(
                            tangentStart,
                            candidate,
                            candidate.end,
                            24 / Math.max(zoom, 1e-6),
                          );
                    return (
                      <g key={`${candidate.contact.x}-${candidate.contact.y}-${i}`}>
                        <path
                          d={`M${line.start.x} ${line.start.y}L${line.end.x} ${line.end.y}`}
                          fill="none"
                          stroke={active ? "#2f9e5b" : "#8cb99a"}
                          strokeWidth={(active ? 1.7 : 0.9) / zoom}
                          strokeDasharray={active ? undefined : `${4 / zoom} ${3 / zoom}`}
                        />
                        <circle
                          cx={candidate.contact.x}
                          cy={candidate.contact.y}
                          r={(active ? 4 : 3) / zoom}
                          fill={active ? "#2f9e5b" : "white"}
                          stroke="#2f9e5b"
                          strokeWidth={1 / zoom}
                        />
                      </g>
                    );
                  })}
                  {tangentPreview && tangentPreview.candidates.length === 0 && (
                    <text
                      x={tangentStart.x + 10 / zoom}
                      y={tangentStart.y - 10 / zoom}
                      fontSize={11 / zoom}
                      fill="#b04a4a"
                      stroke="white"
                      strokeWidth={3 / zoom}
                      paintOrder="stroke"
                    >
                      No tangent
                    </text>
                  )}
                </g>
              )}
              {perpendicularStart && (
                <g pointerEvents="none" data-perpendicular-preview>
                  <circle
                    cx={perpendicularStart.x}
                    cy={perpendicularStart.y}
                    r={4 / zoom}
                    fill="#ffffff"
                    stroke="#348b57"
                    strokeWidth={1.2 / zoom}
                  />
                  {perpendicularPreview && (
                    <>
                      <path
                        d={`M${perpendicularPreview.target.a.x} ${perpendicularPreview.target.a.y}L${perpendicularPreview.target.b.x} ${perpendicularPreview.target.b.y}`}
                        fill="none"
                        stroke="#8cb99a"
                        strokeWidth={1.2 / zoom}
                      />
                      <path
                        d={`M${perpendicularPreview.start.x} ${perpendicularPreview.start.y}L${perpendicularPreview.end.x} ${perpendicularPreview.end.y}`}
                        fill="none"
                        stroke="#2f9e5b"
                        strokeWidth={1.7 / zoom}
                      />
                      {perpendicularPreview.kind === "angle-bisector" &&
                        perpendicularPreview.secondTarget && (
                          <path
                            d={`M${perpendicularPreview.secondTarget.a.x} ${perpendicularPreview.secondTarget.a.y}L${perpendicularPreview.secondTarget.b.x} ${perpendicularPreview.secondTarget.b.y}`}
                            fill="none"
                            stroke="#8cb99a"
                            strokeWidth={1.2 / zoom}
                          />
                        )}
                      {perpendicularPreview.kind === "perpendicular" &&
                        RIGHT_ANGLE_MARKERS.map((marker) => {
                          const active = perpendicularPreview.marker === marker;
                          return (
                            <path
                              key={marker}
                              d={rightAngleGuidePath(
                                perpendicularPreview,
                                marker,
                                9 / zoom,
                              )}
                              fill="none"
                              stroke={active ? "#23864d" : "#9dc6a9"}
                              strokeWidth={(active ? 2.3 : 1.05) / zoom}
                              opacity={active ? 1 : 0.78}
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          );
                        })}
                      <circle
                        cx={perpendicularPreview.foot.x}
                        cy={perpendicularPreview.foot.y}
                        r={3 / zoom}
                        fill="#2f9e5b"
                        stroke="white"
                        strokeWidth={1 / zoom}
                      />
                    </>
                  )}
                </g>
              )}
              {reflectionStart && (
                <g pointerEvents="none" data-point-reflection-preview>
                  <circle
                    cx={reflectionStart.x}
                    cy={reflectionStart.y}
                    r={4 / zoom}
                    fill="white"
                    stroke="#7b61c9"
                    strokeWidth={1.2 / zoom}
                  />
                  {reflectionPreview?.target.kind === "line" && (
                    <path
                      d={`M${reflectionPreview.target.a.x} ${reflectionPreview.target.a.y}L${reflectionPreview.target.b.x} ${reflectionPreview.target.b.y}`}
                      fill="none"
                      stroke="#7b61c9"
                      strokeWidth={1.5 / zoom}
                    />
                  )}
                  {reflectionPreview?.target.kind === "point" && (
                    <circle
                      cx={reflectionPreview.target.point.x}
                      cy={reflectionPreview.target.point.y}
                      r={3.5 / zoom}
                      fill="#7b61c9"
                      stroke="white"
                      strokeWidth={1 / zoom}
                    />
                  )}
                  {reflectionPreview && (
                    <>
                      <path
                        d={`M${reflectionStart.x} ${reflectionStart.y}L${reflectionPreview.result.x} ${reflectionPreview.result.y}`}
                        fill="none"
                        stroke="#9b8ad1"
                        strokeWidth={0.9 / zoom}
                        strokeDasharray={`${4 / zoom} ${3 / zoom}`}
                      />
                      <circle
                        cx={reflectionPreview.result.x}
                        cy={reflectionPreview.result.y}
                        r={4 / zoom}
                        fill="#7b61c9"
                        stroke="white"
                        strokeWidth={1 / zoom}
                      />
                    </>
                  )}
                </g>
              )}
              {snapPoint && (
                <g pointerEvents="none" data-snap-kind={snapPoint.kind}>
                  <circle
                    cx={snapPoint.point.x}
                    cy={snapPoint.point.y}
                    r={8 / zoom}
                    fill="none"
                    stroke="#dc55b8"
                    strokeWidth={1.5 / zoom}
                    pointerEvents="none"
                  />
                  <text
                    x={Math.min(
                      snapPoint.point.x + 12 / zoom,
                      d.width - 12 / zoom,
                    )}
                    y={Math.max(16 / zoom, snapPoint.point.y - 12 / zoom)}
                    textAnchor={
                      snapPoint.point.x > d.width - 135 / zoom ? "end" : "start"
                    }
                    fontSize={12 / zoom}
                    fill="#9a2877"
                    stroke="white"
                    strokeWidth={3 / zoom}
                    paintOrder="stroke"
                  >
                    {SNAP_LABELS[snapPoint.kind]}
                  </text>
                </g>
              )}
              {p.guides && (
                <g
                  stroke="#e5b543"
                  strokeWidth={0.7 / zoom}
                  strokeDasharray={`${3 / zoom} ${3 / zoom}`}
                  pointerEvents="none"
                >
                  <path
                    d={`M${d.width / 2} 0V${d.height}M0 ${d.height / 2}H${d.width}`}
                  />
                </g>
              )}
              {snapLines.x !== undefined && (
                <path
                  d={`M${snapLines.x} 0V${d.height}`}
                  stroke="#dc55b8"
                  strokeWidth={0.7 / zoom}
                  strokeDasharray="3 3"
                />
              )}
              {snapLines.y !== undefined && (
                <path
                  d={`M0 ${snapLines.y}H${d.width}`}
                  stroke="#dc55b8"
                  strokeWidth={0.7 / zoom}
                  strokeDasharray="3 3"
                />
              )}
              {marquee && (
                <rect
                  {...marquee}
                  fill="#4c9e6318"
                  stroke="#53a668"
                  strokeWidth={0.7 / zoom}
                />
              )}
              {polygon.current && polyPreview && (
                <path
                  d={`M${polygon.current.points.map((q) => `${q.x} ${q.y}`).join("L")}L${polyPreview.x} ${polyPreview.y}`}
                  fill="none"
                  stroke="#5ab175"
                  strokeDasharray="4 3"
                  strokeWidth={1 / zoom}
                />
              )}
              {box && !edit && !polygon.current && (
                <>
                  {selected.length > 1 &&
                    selected.map((e) => (
                      <rect
                        key={e.id}
                        {...sceneBounds(e)}
                        transform={elementTransform(e)}
                        fill="none"
                        stroke="#8bc298"
                        strokeDasharray="2 2"
                        strokeWidth={0.6 / zoom}
                        pointerEvents="none"
                      />
                    ))}
                  {single &&
                  LINE_TYPES.has(single.type) &&
                  !single.boxed &&
                  !single.locked ? (
                    <g
                      transform={elementTransform(single)}
                      data-line-handles
                    >
                      {isCurve(single) &&
                        (!single.points || single.points.length === 2) &&
                        curveControls(single).map((pt, i) => (
                          <g key={i}>
                            <path
                              d={`M${i ? lineVertices(single).at(-1)!.x : lineVertices(single)[0].x} ${i ? lineVertices(single).at(-1)!.y : lineVertices(single)[0].y}L${single.x + pt.x} ${single.y + pt.y}`}
                              stroke="#7fb886"
                              strokeWidth={0.7 / zoom}
                            />
                            <circle
                              cx={single.x + pt.x}
                              cy={single.y + pt.y}
                              r={handle * 0.6}
                              fill="white"
                              stroke="#52a267"
                              strokeWidth={1 / zoom}
                              className="control-handle"
                              onPointerDown={(event) =>
                                begin(event, {
                                  kind: "control",
                                  original: single,
                                  index: i,
                                })
                              }
                            />
                          </g>
                        ))}
                      {lineVertices(single).map((q, i, vertices) => {
                        const endpoint = i === 0 || i === vertices.length - 1;
                        return (
                          <g key={`vertex-${i}`}>
                            <rect
                              x={q.x - handle / 2}
                              y={q.y - handle / 2}
                              width={handle}
                              height={handle}
                              rx={endpoint ? 0 : handle / 2}
                              fill={endpoint ? "#66af73" : "#e7c476"}
                              stroke="white"
                              strokeWidth={0.7 / zoom}
                              className="control-handle"
                              onPointerDown={(event) => {
                                begin(event, {
                                  kind: endpoint ? "endpoint" : "point",
                                  original: single,
                                  index: endpoint ? (i === 0 ? 0 : 1) : i,
                                });
                              }}
                            >
                              <title>
                                {endpoint ? "Kéo đầu mút" : "Kéo đỉnh"}
                              </title>
                            </rect>
                          </g>
                        );
                      })}
                    </g>
                  ) : (
                    <g
                      transform={single ? elementTransform(single) : undefined}
                    >
                      {regularPolygonSelection ? (
                        <circle
                          cx={regularPolygonSelection.cx}
                          cy={regularPolygonSelection.cy}
                          r={regularPolygonSelection.r}
                          fill="none"
                          stroke="#70b37f"
                          strokeWidth={0.7 / zoom}
                          pointerEvents="none"
                        />
                      ) : (
                        <rect
                          {...box}
                          fill="none"
                          stroke="#70b37f"
                          strokeWidth={0.7 / zoom}
                          pointerEvents="none"
                        />
                      )}
                      {!single?.locked &&
                        (
                          ["nw", "n", "ne", "e", "se", "s", "sw", "w"] as const
                        ).map((name) => {
                          const direction = CIRCULAR_HANDLE_DIRECTIONS[name];
                          const q = regularPolygonSelection
                            ? {
                                x:
                                  regularPolygonSelection.cx +
                                  regularPolygonSelection.r * direction[0],
                                y:
                                  regularPolygonSelection.cy +
                                  regularPolygonSelection.r * direction[1],
                              }
                            : {
                                x:
                                  box.x +
                                  (name.includes("w")
                                    ? 0
                                    : name.includes("e")
                                      ? box.width
                                      : box.width / 2),
                                y:
                                  box.y +
                                  (name.includes("n")
                                    ? 0
                                    : name.includes("s")
                                      ? box.height
                                      : box.height / 2),
                              };
                          return (
                            <rect
                              key={name}
                              x={q.x - handle / 2}
                              y={q.y - handle / 2}
                              width={handle}
                              height={handle}
                              fill="#69ae77"
                              style={{ cursor: `${name}-resize` }}
                              onPointerDown={(event) =>
                                begin(event, {
                                  kind: "resize",
                                  handle: name,
                                  box,
                                  local: !!single,
                                  originals: selected.filter((e) => !e.locked),
                                  start: pos(event),
                                })
                              }
                            />
                          );
                        })}
                      {single && !single.locked && (
                        <>
                          <path
                            d={
                              regularPolygonSelection
                                ? `M${regularPolygonSelection.cx} ${regularPolygonSelection.cy - regularPolygonSelection.r}v${-22 / zoom}`
                                : `M${box.x + box.width / 2} ${box.y}v${-22 / zoom}`
                            }
                            stroke="#87ab8e"
                            strokeWidth={0.7 / zoom}
                          />
                          <circle
                            cx={
                              regularPolygonSelection
                                ? regularPolygonSelection.cx
                                : box.x + box.width / 2
                            }
                            cy={
                              regularPolygonSelection
                                ? regularPolygonSelection.cy -
                                  regularPolygonSelection.r -
                                  24 / zoom
                                : box.y - 24 / zoom
                            }
                            r={4 / zoom}
                            fill="#e9b265"
                            stroke="#cd9546"
                            strokeWidth={0.6 / zoom}
                            style={{ cursor: "crosshair" }}
                            onPointerDown={(event) =>
                              begin(event, {
                                kind: "rotate",
                                original: single,
                                center: center(single),
                                angle:
                                  (Math.atan2(
                                    pos(event).y - center(single).y,
                                    pos(event).x - center(single).x,
                                  ) *
                                    180) /
                                  Math.PI,
                              })
                            }
                          />
                        </>
                      )}
                      {single && showSelectionCenter && (
                        <g pointerEvents="none" data-selection-center>
                          <circle
                            cx={center(single).x}
                            cy={center(single).y}
                            r={3.2 / zoom}
                            fill="white"
                            stroke="#4f9f65"
                            strokeWidth={0.8 / zoom}
                          />
                          <path
                            d={`M${center(single).x - 5 / zoom} ${center(single).y}H${center(single).x + 5 / zoom}M${center(single).x} ${center(single).y - 5 / zoom}V${center(single).y + 5 / zoom}`}
                            stroke="#4f9f65"
                            strokeWidth={0.7 / zoom}
                          />
                        </g>
                      )}
                      {single &&
                        ["polyline", "polycurve"].includes(single.type) &&
                        absolutePoints(single).map((q, i) => (
                          <circle
                            key={i}
                            cx={q.x}
                            cy={q.y}
                            r={4 / zoom}
                            fill="#e7c476"
                            stroke="#b99c52"
                            strokeWidth={0.6 / zoom}
                            className="control-handle"
                            onPointerDown={(event) =>
                              begin(event, {
                                kind: "point",
                                original: single,
                                index: i,
                              })
                            }
                          />
                        ))}
                    </g>
                  )}
                  {single &&
                    !LINE_TYPES.has(single.type) &&
                    !single.locked &&
                    TEXT_TYPES.has(single.type) &&
                    [
                      {
                        x: box.x + box.width + 18 / zoom,
                        y: box.y + box.height / 2,
                        r: 0,
                      },
                      {
                        x: box.x - 18 / zoom,
                        y: box.y + box.height / 2,
                        r: 180,
                      },
                      {
                        x: box.x + box.width / 2,
                        y: box.y + box.height + 18 / zoom,
                        r: 90,
                      },
                    ].map((q, i) => (
                      <g
                        key={i}
                        className="connection-handle"
                        transform={`translate(${q.x} ${q.y}) rotate(${q.r}) scale(${1 / zoom})`}
                        onPointerDown={(event) =>
                          startConnect(event, single, q)
                        }
                      >
                        <title>Drag to connect another object</title>
                        <rect
                          x="-10"
                          y="-9"
                          width="20"
                          height="18"
                          fill="transparent"
                        />
                        <path
                          d="M-8 0H7M2 -4L7 0L2 4"
                          fill="none"
                          stroke="#999"
                          strokeWidth="1.4"
                        />
                      </g>
                    ))}
                </>
              )}
              <path
                d={`M${d.width - 9} ${d.height - 2}l7 -7M${d.width - 5} ${d.height - 2}l3 -3`}
                stroke="#b8b8b8"
                strokeWidth={1 / zoom}
              />
              <rect
                x={d.width - 14}
                y={d.height - 14}
                width="14"
                height="14"
                fill="transparent"
                style={{ cursor: "nwse-resize" }}
                onPointerDown={(event) =>
                  begin(event, {
                    kind: "canvas-size",
                    start: pos(event),
                    width: d.width,
                    height: d.height,
                  })
                }
              />
            </g>
          </svg>
          {edit && (
            <div
              className="inline-text-editor"
              style={{
                left: edit.x * zoom,
                top: edit.y * zoom,
                minWidth: Math.max(130, edit.width * zoom),
                transformOrigin: "left top",
              }}
              onPointerDown={(e) => e.stopPropagation()}
            >
              {(edit.textMode ?? (edit.type === "text" ? "math" : "text")) ===
              "math" ? (
                <MathInput
                  key={edit.id}
                  value={edit.text ?? ""}
                  onChange={(text) => updateText(edit, text)}
                  onDone={() => closeEdit()}
                  onCancel={() => closeEdit(true)}
                />
              ) : (
                <textarea
                  autoFocus
                  aria-label="Edit text"
                  value={edit.text ?? ""}
                  style={{ fontSize: edit.fontSize ?? 17 }}
                  onChange={(event) => updateText(edit, event.target.value)}
                  onKeyDown={(event) => {
                    event.stopPropagation();
                    if (event.key === "Escape") closeEdit(true);
                    if (
                      event.key === "Enter" &&
                      (event.ctrlKey || event.metaKey)
                    )
                      closeEdit();
                  }}
                />
              )}
              <div className="inline-editor-actions">
                <span>
                  {edit.textMode === "math"
                    ? "Math · Ctrl+Enter"
                    : "Text · Ctrl+Enter"}
                </span>
                <button onClick={() => closeEdit(true)} title="Cancel">
                  ✕
                </button>
                <button onClick={() => closeEdit()} title="Apply">
                  ✓
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
      {context && (
        <>
          <div
            className="context-dismiss"
            onPointerDown={() => setContext(null)}
          />
          <div
            className="canvas-context-menu"
            style={{
              left: Math.min(context.x, window.innerWidth - 205),
              top: Math.min(context.y, window.innerHeight - 360),
            }}
          >
            {[
              "undo",
              "redo",
              "copy",
              "paste",
              "duplicate",
              "group",
              "ungroup",
              "front",
              "back",
              "delete",
              "select-all",
            ].map((name) => (
              <button
                key={name}
                onClick={() => {
                  p.onCommand(name);
                  setContext(null);
                }}
              >
                {(
                  {
                    front: "Bring to Front",
                    back: "Send to Back",
                    "select-all": "Select All",
                  } as Record<string, string>
                )[name] ?? name.charAt(0).toUpperCase() + name.slice(1)}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
