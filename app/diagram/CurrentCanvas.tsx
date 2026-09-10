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
  nearestSnapTarget,
  objectSnapTargets,
  translationSnap,
  SNAP_LABELS,
  type SnapTarget,
} from "./snapping";
import { makeElement } from "./currentDocument";
import { createId } from "./defaultDocument";
import {
  absolutePoints,
  addLineVertex,
  center,
  curveControls,
  drawElement,
  elementShapeId,
  elementTransform,
  isCurve,
  lineSegmentPoint,
  lineVertices,
  LINE_TYPES,
  localPoint,
  moveLineEndpoint,
  moveLineVertex,
  movePolygonPoint,
  removeLineVertex,
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
import type {
  DiagramDocument,
  DiagramElement,
  DiagramTool,
  Point,
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
    gestureTargets = useRef<SnapTarget[]>([]);
  const [marquee, setMarquee] = useState<Box | null>(null),
    [snapLines, setSnapLines] = useState<{ x?: number; y?: number }>({}),
    [snapPoint, setSnapPoint] = useState<SnapTarget | null>(null),
    [dragging, setDragging] = useState(false),
    [context, setContext] = useState<Point | null>(null),
    [polyPreview, setPolyPreview] = useState<Point | null>(null),
    [vertexSelection, setVertexSelection] = useState<{
      id: string;
      index: number;
    } | null>(null);
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
    if (vertexSelection && !selectedIds.includes(vertexSelection.id))
      setVertexSelection(null);
  }, [selectedIds, vertexSelection]);
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
    const gridSnap = d.grid.snap;
    let x = gridSnap ? Math.round(q.x / d.grid.size) * d.grid.size : q.x,
      y = gridSnap ? Math.round(q.y / d.grid.size) * d.grid.size : q.y;
    const lines: { x?: number; y?: number } = {};
    if (d.grid.snapShapes) {
      let dx = 6 / zoom,
        dy = 6 / zoom;
      for (const e of elements) {
        if (excluded.includes(e.id) || LINE_TYPES.has(e.type)) continue;
        const b = worldBounds(e);
        for (const v of [b.x, b.x + b.width / 2, b.x + b.width])
          if (Math.abs(q.x - v) < dx) {
            dx = Math.abs(q.x - v);
            x = v;
            lines.x = v;
          }
        for (const v of [b.y, b.y + b.height / 2, b.y + b.height])
          if (Math.abs(q.y - v) < dy) {
            dy = Math.abs(q.y - v);
            y = v;
            lines.y = v;
          }
      }
    }
    // An endpoint may snap to its own original crossing without chasing a
    // crossing that changes on each frame of the drag.
    const g = gesture.current,
      endpoint = g?.kind === "endpoint";
    const mark =
      g?.kind === "move"
        ? null
        : nearestSnapTarget(
            q,
            endpoint ? gestureTargets.current : snapTargets,
            excluded,
            zoom,
            endpoint ? g.original.id : undefined,
          );
    snappedTarget.current = mark;
    setSnapPoint(mark);
    if (mark) {
      x = mark.point.x;
      y = mark.point.y;
      lines.x = x;
      lines.y = y;
    }
    setSnapLines(lines);
    return { x, y };
  };
  const patch = (id: string, update: Partial<DiagramElement>) =>
    p.onReplace((doc) => ({
      ...doc,
      elements: doc.elements.map((e) =>
        e.id === id ? { ...e, ...update } : e,
      ),
    }));
  const replaceElement = (next: DiagramElement) => patch(next.id, next);
  const addVertex = (e: DiagramElement, segment: number) => {
    p.onBegin();
    replaceElement(addLineVertex(e, segment));
    p.onEnd();
    setVertexSelection({ id: e.id, index: segment + 1 });
  };
  const removeVertex = (e: DiagramElement, index: number) => {
    if (lineVertices(e).length <= 2) return;
    p.onBegin();
    replaceElement(removeLineVertex(e, index));
    p.onEnd();
    setVertexSelection(null);
  };
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
      if (
        (event.key === "Delete" || event.key === "Backspace") &&
        vertexSelection &&
        single &&
        single.id === vertexSelection.id &&
        ["line", "curve"].includes(single.type) &&
        lineVertices(single).length > 2
      ) {
        event.preventDefault();
        event.stopImmediatePropagation();
        removeVertex(single, vertexSelection.index);
        return;
      }
      if (event.key === "Escape") {
        snappedTarget.current = null;
        setSnapPoint(null);
        gesture.current = null;
        polygon.current = null;
        setDragging(false);
        setMarquee(null);
        setPolyPreview(null);
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
      setVertexSelection(null);
      if (!event.shiftKey) p.onSelect([]);
      begin(event, {
        kind: "marquee",
        start: q,
        add: event.shiftKey ? selectedIds : [],
      });
      setMarquee({ ...q, width: 0, height: 0 });
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
    if (vertexSelection?.id !== e.id) setVertexSelection(null);
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
    if (g.kind === "draw") {
      patch(
        g.id,
        drawElement(g.original, g.start, snap(q, [g.id]), event.shiftKey),
      );
      return;
    }
    if (g.kind === "freehand") {
      if (
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
        moveLineEndpoint(g.original, g.index, snap(q, [g.original.id])),
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
                    <g transform={elementTransform(single)}>
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
                      {["line", "curve"].includes(single.type) &&
                        lineVertices(single)
                          .slice(0, -1)
                          .map((_, i) => {
                            const q = lineSegmentPoint(single, i, 0.5);
                            return (
                              <g
                                key={`add-${i}`}
                                transform={`translate(${q.x} ${q.y}) scale(${1 / zoom})`}
                                className="vertex-add-handle"
                                onPointerDown={(event) => {
                                  event.preventDefault();
                                  event.stopPropagation();
                                  addVertex(single, i);
                                }}
                              >
                                <title>Thêm đỉnh</title>
                                <circle
                                  r="5"
                                  fill="white"
                                  stroke="#3c8fca"
                                  strokeWidth="1"
                                />
                                <path
                                  d="M-2.5 0H2.5M0 -2.5V2.5"
                                  stroke="#3c8fca"
                                  strokeWidth="1"
                                />
                              </g>
                            );
                          })}
                      {lineVertices(single).map((q, i, vertices) => {
                        const endpoint = i === 0 || i === vertices.length - 1,
                          active =
                            vertexSelection?.id === single.id &&
                            vertexSelection.index === i;
                        return (
                          <g key={`vertex-${i}`}>
                            <rect
                              x={q.x - handle / 2}
                              y={q.y - handle / 2}
                              width={handle}
                              height={handle}
                              rx={endpoint ? 0 : handle / 2}
                              fill={
                                active
                                  ? "#e7b34f"
                                  : endpoint
                                    ? "#66af73"
                                    : "#e7c476"
                              }
                              stroke={active ? "#9b6b10" : "white"}
                              strokeWidth={0.7 / zoom}
                              className="control-handle"
                              onPointerDown={(event) => {
                                setVertexSelection({ id: single.id, index: i });
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
                            {active &&
                              ["line", "curve"].includes(single.type) &&
                              vertices.length > 2 && (
                                <g
                                  transform={`translate(${q.x + 12 / zoom} ${q.y - 12 / zoom}) scale(${1 / zoom})`}
                                  className="vertex-remove-handle"
                                  onPointerDown={(event) => {
                                    event.preventDefault();
                                    event.stopPropagation();
                                    removeVertex(single, i);
                                  }}
                                >
                                  <title>Xóa đỉnh</title>
                                  <circle
                                    r="6"
                                    fill="#e34b4b"
                                    stroke="white"
                                    strokeWidth="1"
                                  />
                                  <path
                                    d="M-2.5 -2.5L2.5 2.5M-2.5 2.5L2.5 -2.5"
                                    stroke="white"
                                    strokeWidth="1.2"
                                  />
                                </g>
                              )}
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
