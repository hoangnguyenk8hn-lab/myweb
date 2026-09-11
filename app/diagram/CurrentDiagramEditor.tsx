"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  CurrentToolPalette,
  type GuidedConstructionTool,
} from "./CurrentToolPalette";
import { CurrentCanvas } from "./CurrentCanvas";
import { EditorToolbar } from "./EditorToolbar";
import { Dropdown, NumberControl } from "./EditorControls";
import { PlotDialog } from "./PlotDialog";
import { ExportDialog } from "./ExportDialog";
import { useCurrentHistory } from "./currentHistory";
import {
  applyResolvedConstructionEdit,
  runConstructionCommand,
  type ConstructionCommand,
} from "./constructionCommands";
import { remapConstruction } from "./constructionTypes";
import {
  blankDocument,
  CURRENT_STORAGE_KEY,
  exampleDocument,
  makeElement,
} from "./currentDocument";
import { createId } from "./defaultDocument";
import {
  createTikz,
  DEFAULT_IMAGE_OPTIONS,
  download,
  downloadJson,
  exportImage,
  latexDocument,
  validDocument,
  type ImageOptions,
} from "./currentExporters";
import { DEFAULT_PLOT } from "./plotting";
import { FIXED_ASPECT_SHAPES } from "./shapes";
import {
  LINE_TYPES,
  resolveElement,
  worldBounds,
  TEXT_TYPES,
} from "./sceneGeometry";
import type {
  DiagramDocument,
  DiagramElement,
  DiagramTool,
  ElementStyle,
  PlotSettings,
} from "./types";

function typing(target: EventTarget | null) {
  return (
    target instanceof Element &&
    !!target.closest("input,textarea,select,math-field,[contenteditable=true]")
  );
}
function fittedZoom(
  availableWidth: number,
  availableHeight: number,
  drawingWidth: number,
  drawingHeight: number,
) {
  const width = Math.max(1, availableWidth - 2),
    height = Math.max(1, availableHeight - 2);
  return Math.max(
    0.2,
    Math.min(
      4,
      width / Math.max(1, drawingWidth),
      height / Math.max(1, drawingHeight),
    ),
  );
}
function ZoomIcon({ minus = false }: { minus?: boolean }) {
  return (
    <svg width="23" height="23" viewBox="0 0 24 24">
      <circle
        cx="9"
        cy="9"
        r="6"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path
        d="M13.5 13.5L21 21M6 9H12"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      {!minus && <path d="M9 6V12" stroke="currentColor" strokeWidth="1.5" />}
    </svg>
  );
}

const CONSTRUCTION_LABELS: Record<GuidedConstructionTool, string> = {
  "point-on-line": "Point on Line",
  "point-on-circle": "Point on Circle",
  intersection: "Intersection",
  tangent: "Tangent",
};
const isPointElement = (element: DiagramElement) =>
  element.type === "point" || element.shape === "point";
const isCircleElement = (element: DiagramElement) =>
  element.type === "circle" ||
  element.type === "ellipse" ||
  element.shape === "circle" ||
  element.shape === "ellipse";
const isLineElement = (element: DiagramElement) =>
  ["line", "arrow", "curve", "curved-arrow", "polyline", "polycurve"].includes(
    element.type,
  );
function constructionCandidate(
  command: GuidedConstructionTool,
  element: DiagramElement,
) {
  if (command === "intersection") return !isPointElement(element);
  if (command === "point-on-line")
    return isPointElement(element) || isLineElement(element);
  return isPointElement(element) || isCircleElement(element);
}
function constructionPair(
  command: GuidedConstructionTool,
  first: DiagramElement,
  second: DiagramElement,
) {
  if (first.id === second.id) return false;
  if (command === "intersection")
    return !isPointElement(first) && !isPointElement(second);
  if (command === "point-on-line")
    return (
      (isPointElement(first) && isLineElement(second)) ||
      (isLineElement(first) && isPointElement(second))
    );
  return (
    (isPointElement(first) && isCircleElement(second)) ||
    (isCircleElement(first) && isPointElement(second))
  );
}
function constructionPrompt(
  command: GuidedConstructionTool,
  first?: DiagramElement,
) {
  if (!first) {
    if (command === "intersection") return "Click the first object";
    if (command === "point-on-line") return "Click a point or a line / curve";
    return "Click a point or a circle / ellipse";
  }
  if (command === "intersection") return "Click the second object";
  if (command === "point-on-line")
    return isPointElement(first) ? "Click a line or curve" : "Click a point";
  return isPointElement(first) ? "Click a circle or ellipse" : "Click a point";
}

export function CurrentDiagramEditor() {
  const initial = useMemo(blankDocument, []),
    history = useCurrentHistory(initial),
    d = history.document;
  const [tool, setTool] = useState<DiagramTool>("select"),
    [constructionTool, setConstructionTool] =
      useState<GuidedConstructionTool | null>(null),
    [selectedIds, setSelectedIds] = useState<string[]>([]),
    [zoom, setZoom] = useState(1),
    [guides, setGuides] = useState(false),
    [editId, setEditId] = useState<string | null>(null),
    [hydrated, setHydrated] = useState(false),
    [saveState, setSaveState] = useState("Saved"),
    [message, setMessage] = useState(""),
    [closed, setClosed] = useState(false);
  const [dialog, setDialog] = useState<
      "image" | "tikz" | "size" | "help" | null
    >(null),
    [tikz, setTikz] = useState(""),
    [plot, setPlot] = useState<{ id?: string; settings: PlotSettings } | null>(
      null,
    ),
    [sizeDraft, setSizeDraft] = useState({ width: 700, height: 400 });
  const svgRef = useRef<SVGSVGElement>(null),
    drawingMainRef = useRef<HTMLDivElement>(null),
    drawingSizeRef = useRef({ width: d.width, height: d.height }),
    fileInput = useRef<HTMLInputElement>(null),
    imageInput = useRef<HTMLInputElement>(null),
    clipboard = useRef<DiagramElement[]>([]),
    messageTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  drawingSizeRef.current = { width: d.width, height: d.height };
  const selected = d.elements
    .filter((e) => selectedIds.includes(e.id))
    .map((e) => resolveElement(e, d));
  const report = (text: string) => {
    setMessage(text);
    if (messageTimer.current) clearTimeout(messageTimer.current);
    messageTimer.current = setTimeout(() => setMessage(""), 4500);
  };
  useEffect(() => {
    try {
      const saved =
        localStorage.getItem(CURRENT_STORAGE_KEY) ??
        localStorage.getItem("diagram-draw-rebuilt-document-v1");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (validDocument(parsed)) history.load(parsed);
        else
          setMessage(
            "The saved drawing could not be opened. Use Open JSON to recover a backup.",
          );
      }
    } catch {
      setSaveState("Save unavailable");
    }
    setHydrated(true);
  }, [history.load]);
  useEffect(() => {
    if (!hydrated || history.inGesture) return;
    try {
      localStorage.setItem(
        CURRENT_STORAGE_KEY,
        JSON.stringify(history.sourceDocument),
      );
      setSaveState("Saved");
    } catch {
      setSaveState("Save failed");
    }
  }, [history.sourceDocument, hydrated, history.inGesture]);
  useEffect(() => {
    if (!hydrated) return;
    const main = drawingMainRef.current;
    if (!main) return;
    let frame = 0;
    const fit = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const viewport = main.querySelector<HTMLElement>(".canvas-viewport");
        if (!viewport) return;
        const size = drawingSizeRef.current;
        setZoom(
          fittedZoom(
            viewport.clientWidth,
            viewport.clientHeight,
            size.width,
            size.height,
          ),
        );
      });
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(main);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [hydrated]);
  useEffect(
    () => () => {
      if (messageTimer.current) clearTimeout(messageTimer.current);
    },
    [],
  );
  const fitDrawing = () => {
    const viewport =
      drawingMainRef.current?.querySelector<HTMLElement>(".canvas-viewport");
    if (!viewport) return;
    setZoom(
      fittedZoom(viewport.clientWidth, viewport.clientHeight, d.width, d.height),
    );
  };
  const canvasTool = (next: DiagramTool) => {
    if (next !== "select" || tool === "select") setTool(next);
  };
  const toolbarGesture = useRef(false);
  const toolbarUpdate = (next: Parameters<typeof history.commit>[0]) =>
    toolbarGesture.current ? history.replace(next) : history.commit(next);
  const patch = (update: Partial<DiagramElement>) =>
    toolbarUpdate((doc) =>
      applyResolvedConstructionEdit(doc, {
        ...doc,
        elements: doc.elements.map((e) => {
          if (!selectedIds.includes(e.id)) return e;
          const next = { ...e, ...update };
          if (FIXED_ASPECT_SHAPES.has(e.shape ?? e.type)) {
            if (update.width !== undefined && update.height === undefined)
              next.height = (update.width * e.height) / (e.width || 1);
            if (update.height !== undefined && update.width === undefined)
              next.width = (update.height * e.width) / (e.height || 1);
          }
          return next;
        }),
      }),
    );
  const style = (update: Partial<ElementStyle>) =>
    toolbarUpdate((doc) => ({
      ...doc,
      elements: doc.elements.map((e) =>
        selectedIds.includes(e.id)
          ? { ...e, style: { ...e.style, ...update } }
          : e,
      ),
    }));
  const executeConstruction = (
    command: ConstructionCommand,
    ids: string[] = selectedIds,
  ) => {
    const result = runConstructionCommand(
      history.sourceDocument,
      d,
      ids,
      command,
    );
    if (!result.error) {
      history.commit(result.document);
      setSelectedIds(result.createdIds);
      setTool("select");
      if (command !== "detach") setConstructionTool(null);
    } else if (command !== "detach" && constructionTool === command) {
      setSelectedIds([]);
    }
    report(result.message);
    return !result.error;
  };
  const select = (ids: string[]) => {
    if (!constructionTool) {
      setSelectedIds(ids);
      return;
    }
    if (!ids.length) {
      setSelectedIds([]);
      return;
    }
    const clickedId =
      ids.find((id) => !selectedIds.includes(id)) ?? ids[ids.length - 1];
    const clicked = d.elements.find((element) => element.id === clickedId);
    if (!clicked) return;
    const first = d.elements.find((element) => element.id === selectedIds[0]);
    if (!first) {
      if (!constructionCandidate(constructionTool, clicked)) {
        report(constructionPrompt(constructionTool));
        return;
      }
      setSelectedIds([clicked.id]);
      return;
    }
    if (clicked.id === first.id) return;
    if (!constructionPair(constructionTool, first, clicked)) {
      report(constructionPrompt(constructionTool, first));
      return;
    }
    const pair = [first.id, clicked.id];
    setSelectedIds(pair);
    executeConstruction(constructionTool, pair);
  };
  const startConstruction = (next: GuidedConstructionTool) => {
    if (constructionTool === next) {
      setConstructionTool(null);
      setSelectedIds([]);
      return;
    }
    if (editId) {
      history.endGesture();
      setEditId(null);
    }
    setTool("select");
    setSelectedIds([]);
    setConstructionTool(next);
    report(`${CONSTRUCTION_LABELS[next]}: ${constructionPrompt(next)}.`);
  };
  const remove = () => {
    const ids = d.elements
      .filter((e) => selectedIds.includes(e.id) && !e.locked)
      .map((e) => e.id);
    if (!ids.length) {
      if (selectedIds.length)
        report("Đối tượng đang khóa. Hãy mở khóa trước khi xóa.");
      return;
    }
    history.commit((doc) => ({
      ...doc,
      elements: doc.elements.filter(
        (e) =>
          !ids.includes(e.id) &&
          !ids.includes(e.fromId ?? "") &&
          !ids.includes(e.toId ?? ""),
      ),
    }));
    toolbarGesture.current = false;
    setEditId(null);
    setTool("select");
    setConstructionTool(null);
    setSelectedIds([]);
  };
  const addCopies = (source: DiagramElement[]) => {
    if (!source.length) return;
    const idMap = new Map(source.map((e) => [e.id, createId(e.type)])),
      groups = new Map(
        source
          .filter((e) => e.groupId)
          .map((e) => [e.groupId!, createId("group")]),
      );
    const copies = source.map((e) => ({
      ...structuredClone(e),
      id: idMap.get(e.id)!,
      x: e.x + 15,
      y: e.y + 15,
      locked: false,
      groupId: e.groupId ? groups.get(e.groupId) : undefined,
      fromId: e.fromId ? idMap.get(e.fromId) : undefined,
      toId: e.toId ? idMap.get(e.toId) : undefined,
      intersectionWith: e.intersectionWith?.flatMap((id) =>
        idMap.has(id) ? [idMap.get(id)!] : [],
      ),
      construction: remapConstruction(e.construction, idMap),
    }));
    history.commit((doc) => ({
      ...doc,
      elements: [...doc.elements, ...copies],
    }));
    setSelectedIds(copies.map((e) => e.id));
    clipboard.current = copies;
  };
  const arrange = (direction: string) =>
    history.commit((doc) => {
      const chosen = doc.elements.filter((e) => selectedIds.includes(e.id)),
        rest = doc.elements.filter((e) => !selectedIds.includes(e.id));
      return {
        ...doc,
        elements:
          direction === "front" ? [...rest, ...chosen] : [...chosen, ...rest],
      };
    });
  const align = (direction: string) => {
    if (selected.length < 2) return;
    const boxes = selected.map((e) => ({ e, ...worldBounds(e) }));
    const minX = Math.min(...boxes.map((b) => b.x)),
      maxX = Math.max(...boxes.map((b) => b.x + b.width)),
      minY = Math.min(...boxes.map((b) => b.y)),
      maxY = Math.max(...boxes.map((b) => b.y + b.height));
    const updates = new Map<string, { x: number; y: number }>();
    if (direction === "horizontal" || direction === "vertical") {
      const horizontal = direction === "horizontal",
        ordered = [...boxes].sort((a, b) =>
          horizontal ? a.x - b.x : a.y - b.y,
        );
      const span = horizontal ? maxX - minX : maxY - minY,
        total = ordered.reduce(
          (v, b) => v + (horizontal ? b.width : b.height),
          0,
        ),
        gap = (span - total) / (ordered.length - 1);
      let offset = horizontal ? minX : minY;
      ordered.forEach((b) => {
        updates.set(b.e.id, {
          x: horizontal ? b.e.x + offset - b.x : b.e.x,
          y: horizontal ? b.e.y : b.e.y + offset - b.y,
        });
        offset += (horizontal ? b.width : b.height) + gap;
      });
    } else
      boxes.forEach((b) =>
        updates.set(b.e.id, {
          x:
            b.e.x -
            b.x +
            (direction === "left"
              ? minX
              : direction === "right"
                ? maxX - b.width
                : direction === "center"
                  ? (minX + maxX - b.width) / 2
                  : b.x),
          y:
            b.e.y -
            b.y +
            (direction === "top"
              ? minY
              : direction === "bottom"
                ? maxY - b.height
                : direction === "middle"
                  ? (minY + maxY - b.height) / 2
                  : b.y),
        }),
      );
    history.commit((doc) => ({
      ...doc,
      elements: doc.elements.map((e) =>
        updates.has(e.id) && !e.locked ? { ...e, ...updates.get(e.id) } : e,
      ),
    }));
  };
  const imageExport = async (options: ImageOptions) => {
    if (!svgRef.current) throw new Error("Open the drawing before exporting.");
    await exportImage(svgRef.current, d, options);
    report(`${options.format.toUpperCase()} exported`);
  };
  const run = (command: string) => {
    if (command.startsWith("align-")) {
      align(command.slice(6));
      return;
    }
    if (["export-png", "export-jpeg", "export-svg"].includes(command)) {
      void imageExport({
        ...DEFAULT_IMAGE_OPTIONS,
        format: command.slice(7) as ImageOptions["format"],
      }).catch((e) => report(e.message));
      return;
    }
    switch (command) {
      case "undo":
        setConstructionTool(null);
        setTool("select");
        history.undo();
        break;
      case "redo":
        setConstructionTool(null);
        setTool("select");
        history.redo();
        break;
      case "delete":
        remove();
        break;
      case "copy":
        clipboard.current = structuredClone(selected);
        report("Copied");
        break;
      case "cut":
        clipboard.current = structuredClone(selected);
        remove();
        break;
      case "paste":
        addCopies(clipboard.current);
        break;
      case "duplicate":
        addCopies(selected);
        break;
      case "group":
        if (selected.length > 1) patch({ groupId: createId("group") });
        break;
      case "ungroup":
        patch({ groupId: undefined });
        break;
      case "front":
      case "back":
        arrange(command);
        break;
      case "select-all":
        setConstructionTool(null);
        setSelectedIds(d.elements.map((e) => e.id));
        setTool("select");
        break;
      case "new":
        history.commit(blankDocument());
        setConstructionTool(null);
        setSelectedIds([]);
        setTool("select");
        setEditId(null);
        break;
      case "demo":
        history.commit(exampleDocument());
        setConstructionTool(null);
        setSelectedIds([]);
        setTool("select");
        break;
      case "import":
        fileInput.current?.click();
        break;
      case "json":
        downloadJson(history.sourceDocument);
        break;
      case "image-export":
        setDialog("image");
        break;
      case "tikz":
      case "export-tex":
        try {
          if (!svgRef.current) break;
          const code = createTikz(svgRef.current, d);
          if (command === "tikz") {
            setTikz(code);
            setDialog("tikz");
          } else
            download(
              new Blob([latexDocument(code)], { type: "text/x-tex" }),
              "drawing.tex",
            );
        } catch (e) {
          report(e instanceof Error ? e.message : "TikZ export failed.");
        }
        break;
      case "canvas-size":
        setSizeDraft({ width: d.width, height: d.height });
        setDialog("size");
        break;
      case "help":
        setDialog("help");
        break;
      case "edit-text":
        if (selected[0] && TEXT_TYPES.has(selected[0].type))
          setEditId(selected[0].id);
        break;
      case "edit-plot":
        if (selected[0])
          setPlot({
            id: selected[0].id,
            settings: selected[0].plot ?? DEFAULT_PLOT,
          });
        break;
    }
  };
  const insertImage = async (file: File) => {
    if (!/^image\/(png|jpeg|webp|gif)$/.test(file.type)) {
      report("Choose a PNG, JPEG, WebP or GIF image.");
      return;
    }
    if (file.size > 12 * 1024 * 1024) {
      report("Please use an image smaller than 12 MB.");
      return;
    }
    try {
      const href = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const img = new Image();
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = reject;
        img.src = href;
      });
      const scale = Math.min(
        1,
        (d.width - 40) / img.naturalWidth,
        (d.height - 40) / img.naturalHeight,
      );
      const e = makeElement(
        "image",
        20,
        20,
        img.naturalWidth * scale,
        img.naturalHeight * scale,
      );
      e.imageHref = href;
      history.commit((doc) => ({ ...doc, elements: [...doc.elements, e] }));
      setSelectedIds([e.id]);
      setTool("select");
    } catch {
      report("The image could not be opened.");
    }
  };
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (event.isComposing || dialog || plot || editId || closed) return;
      const deleting = event.key === "Delete" || event.key === "Backspace";
      const nonTextControl =
        event.target instanceof Element &&
        !!event.target.closest(
          'input[type="range"],input[type="checkbox"],input[type="radio"]',
        );
      if (typing(event.target) && !(deleting && nonTextControl)) return;
      const cmd = event.ctrlKey || event.metaKey,
        key = event.key.toLowerCase();
      const commands: Record<string, string> = {
        z: event.shiftKey ? "redo" : "undo",
        y: "redo",
        d: "duplicate",
        c: "copy",
        x: "cut",
        v: "paste",
        a: "select-all",
        g: event.shiftKey ? "ungroup" : "group",
        s: "json",
        o: "import",
      };
      if (cmd && commands[key]) {
        event.preventDefault();
        run(commands[key]);
        return;
      }
      if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        remove();
      } else if (event.key === "Escape") {
        history.cancelGesture();
        setConstructionTool(null);
        setTool("select");
        setSelectedIds([]);
      } else if (
        event.key === "Enter" &&
        (tool !== "select" || constructionTool)
      ) {
        event.preventDefault();
        setConstructionTool(null);
        setTool("select");
        setSelectedIds([]);
      } else if (event.key.startsWith("Arrow") && selected.length) {
        event.preventDefault();
        const step = event.shiftKey ? 10 : 1,
          dx = key === "arrowleft" ? -step : key === "arrowright" ? step : 0,
          dy = key === "arrowup" ? -step : key === "arrowdown" ? step : 0;
        history.commit((doc) => ({
          ...doc,
          elements: doc.elements.map((e) =>
            selectedIds.includes(e.id) && !e.locked
              ? { ...e, x: e.x + dx, y: e.y + dy }
              : e,
          ),
        }));
      } else if (!cmd) {
        const shortcuts: Record<string, DiagramTool> = {
          v: "select",
          h: "hand",
          t: "text",
          l: "line",
          a: "arrow",
          r: "shape:rectangle",
          o: "shape:circle",
          p: "freehand",
        };
        if (shortcuts[key]) {
          setConstructionTool(null);
          setTool(shortcuts[key]);
        }
      }
    };
    const paste = (event: ClipboardEvent) => {
      if (typing(event.target) || dialog || plot || editId) return;
      const image = Array.from(event.clipboardData?.files ?? []).find((f) =>
        f.type.startsWith("image/"),
      );
      if (image) {
        event.preventDefault();
        void insertImage(image);
      }
    };
    window.addEventListener("keydown", keydown);
    window.addEventListener("paste", paste);
    return () => {
      window.removeEventListener("keydown", keydown);
      window.removeEventListener("paste", paste);
    };
  });
  const newPlot = (kind: PlotSettings["kind"]) => {
    setPlot({
      settings: {
        ...structuredClone(DEFAULT_PLOT),
        kind,
        ...(kind === "surface"
          ? { expressions: ["sin(x)*cos(y)"] }
          : kind === "parametric"
            ? { expressions: ["3*cos(t)", "3*sin(t)"] }
            : kind === "function"
              ? {}
              : { xMin: 0, xMax: 5, yMin: 0, yMax: 8 }),
      },
    });
  };
  const save = () => {
    try {
      localStorage.setItem(
        CURRENT_STORAGE_KEY,
        JSON.stringify(history.sourceDocument),
      );
      setSaveState("Saved");
      report("Drawing saved in this browser");
    } catch {
      setSaveState("Save failed");
      report("Browser storage is full. Save JSON to keep a copy.");
    }
  };
  const constructionFirst = constructionTool
    ? d.elements.find((element) => element.id === selectedIds[0])
    : undefined;
  const hasConstructionSelection = selected.some((element) => element.construction);
  return (
    <main className={`drawing-app ${closed ? "drawing-closed" : ""}`}>
      {closed ? (
        <section className="closed-panel">
          <h1>Drawing</h1>
          <p>
            {d.elements.length} objects · {d.width} × {d.height} px
          </p>
          <button onClick={() => setClosed(false)}>Edit Drawing</button>
          <button onClick={() => downloadJson(history.sourceDocument)}>Save JSON</button>
        </section>
      ) : (
        <section className="drawing-window" aria-label="Drawing editor">
          <div className="drawing-workarea">
            <CurrentToolPalette
              activeTool={tool}
              activeConstruction={constructionTool}
              onConstructionSelect={startConstruction}
              onSelect={(next) => {
                if (editId) {
                  history.endGesture();
                  setEditId(null);
                }
                setConstructionTool(null);
                setTool(next);
                setSelectedIds([]);
              }}
              onImage={() => imageInput.current?.click()}
              onPlot={newPlot}
            />
            <div className="drawing-main" ref={drawingMainRef}>
              <EditorToolbar
                document={d}
                selected={selected}
                canUndo={history.canUndo}
                canRedo={history.canRedo}
                onGrid={(update) =>
                  history.commit((doc) => ({
                    ...doc,
                    grid: { ...doc.grid, ...update },
                  }))
                }
                onStyle={style}
                onPatch={patch}
                onBegin={() => {
                  toolbarGesture.current = true;
                  history.beginGesture();
                }}
                onEnd={() => {
                  if (toolbarGesture.current) {
                    toolbarGesture.current = false;
                    history.endGesture();
                  }
                }}
                onCommand={run}
              />
              {constructionTool && (
                <div
                  role="status"
                  aria-live="polite"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    minHeight: 36,
                    padding: "5px 10px",
                    borderBottom: "1px solid #d9e4f2",
                    background: "#f6f9fe",
                    color: "#26364a",
                    fontSize: 12,
                  }}
                >
                  <strong style={{ whiteSpace: "nowrap" }}>
                    {CONSTRUCTION_LABELS[constructionTool]}
                  </strong>
                  <span style={{ flex: 1 }}>
                    {selectedIds.length ? "Step 2 of 2" : "Step 1 of 2"} ·{" "}
                    {constructionPrompt(constructionTool, constructionFirst)}
                  </span>
                  <button
                    onClick={() => {
                      setConstructionTool(null);
                      setSelectedIds([]);
                    }}
                    title="Cancel construction"
                  >
                    Cancel
                  </button>
                </div>
              )}
              <CurrentCanvas
                document={d}
                tool={tool}
                selectedIds={selectedIds}
                onSelect={select}
                onTool={canvasTool}
                onReplace={(update) =>
                  history.replace((source) =>
                    applyResolvedConstructionEdit(source, update),
                  )
                }
                onBegin={history.beginGesture}
                onEnd={history.endGesture}
                onCancel={history.cancelGesture}
                svgRef={svgRef}
                zoom={zoom}
                onZoom={setZoom}
                guides={guides}
                editId={editId}
                onEdit={setEditId}
                onPlot={(id) =>
                  setPlot({
                    id,
                    settings:
                      d.elements.find((e) => e.id === id)?.plot ?? DEFAULT_PLOT,
                  })
                }
                onCommand={run}
              />
              <div className="drawing-bottom-bar">
                <button
                  title="Zoom In"
                  aria-label="Zoom In"
                  onClick={() => setZoom(Math.min(4, zoom * 1.2))}
                >
                  <ZoomIcon />
                </button>
                <button
                  title="Zoom Out"
                  aria-label="Zoom Out"
                  onClick={() => setZoom(Math.max(0.2, zoom / 1.2))}
                >
                  <ZoomIcon minus />
                </button>
                <Dropdown
                  title="Guides"
                  label={
                    <>
                      Guides <span className="small-triangle" />
                    </>
                  }
                >
                  <label className="menu-check">
                    <input
                      type="checkbox"
                      checked={guides}
                      onChange={(e) => setGuides(e.target.checked)}
                    />
                    Center Guides
                  </label>
                  <hr />
                  <button
                    className="menu-row"
                    data-close-menu
                    onClick={() => setZoom(1)}
                  >
                    Actual Size (100%)
                  </button>
                  <button
                    className="menu-row"
                    data-close-menu
                    onClick={fitDrawing}
                  >
                    Fit Drawing
                  </button>
                  <span className="zoom-readout">
                    Zoom: {Math.round(zoom * 100)}%
                  </span>
                </Dropdown>
                {hasConstructionSelection && !constructionTool && (
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      marginLeft: 8,
                      paddingLeft: 8,
                      borderLeft: "1px solid #d5d5d5",
                    }}
                  >
                    <span style={{ fontSize: 11, color: "#53657a" }}>
                      Dynamic
                    </span>
                    <button
                      title="Make the selected dependent object free"
                      onClick={() => executeConstruction("detach")}
                    >
                      Detach
                    </button>
                  </div>
                )}
                <span className="drawing-hint">
                  {tool !== "select" && tool !== "hand"
                    ? tool === "polyline" || tool === "polycurve"
                      ? "Click points · double-click to finish · Enter / Esc to select"
                      : "Click and drag to draw · Enter / Esc to select"
                    : ""}
                </span>
                {selected.length === 1 && (
                  <div className="position-controls">
                    <NumberControl
                      label="X Position"
                      value={selected[0].x}
                      onChange={(x) =>
                        patch({
                          x,
                          ...(selected[0].fromId ? { fromId: undefined } : {}),
                        })
                      }
                      icon="x"
                    />
                    <NumberControl
                      label="Y Position"
                      value={selected[0].y}
                      onChange={(y) =>
                        patch({
                          y,
                          ...(selected[0].fromId ? { fromId: undefined } : {}),
                        })
                      }
                      icon="y"
                    />
                    <span className="toolbar-separator" />
                    <NumberControl
                      label="Width"
                      value={selected[0].width}
                      onChange={(width) =>
                        patch({
                          width,
                          ...(selected[0].toId ? { toId: undefined } : {}),
                        })
                      }
                      min={LINE_TYPES.has(selected[0].type) ? -9999 : 1}
                      icon="w"
                    />
                    <NumberControl
                      label="Height"
                      value={selected[0].height}
                      onChange={(height) =>
                        patch({
                          height,
                          ...(selected[0].toId ? { toId: undefined } : {}),
                        })
                      }
                      min={LINE_TYPES.has(selected[0].type) ? -9999 : 1}
                      icon="h"
                    />
                  </div>
                )}
              </div>
            </div>
          </div>
          <footer className="drawing-footer">
            <button
              onClick={() => {
                if (editId) {
                  history.endGesture();
                  setEditId(null);
                }
                save();
                setClosed(true);
              }}
            >
              Close
            </button>
            <button
              className={saveState === "Saved" ? "saved-button" : "save-error"}
              onClick={save}
            >
              {saveState}
            </button>
          </footer>
        </section>
      )}
      {message && (
        <div className="editor-notice" role="status">
          {message}
          <button title="Dismiss" onClick={() => setMessage("")}>
            ×
          </button>
        </div>
      )}
      <input
        ref={fileInput}
        className="visually-hidden"
        type="file"
        accept="application/json,.json"
        onChange={async (event) => {
          const file = event.target.files?.[0];
          if (!file) return;
          try {
            if (file.size > 35 * 1024 * 1024)
              throw new Error("The file is too large.");
            const parsed: unknown = JSON.parse(await file.text());
            if (!validDocument(parsed))
              throw new Error("This file is not a supported drawing JSON.");
            history.commit(parsed);
            setConstructionTool(null);
            setSelectedIds([]);
            setTool("select");
            setZoom(1);
            report("Drawing opened");
          } catch (error) {
            report(
              error instanceof Error
                ? error.message
                : "Could not open this file.",
            );
          }
          event.target.value = "";
        }}
      />
      <input
        ref={imageInput}
        className="visually-hidden"
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void insertImage(file);
          event.target.value = "";
        }}
      />
      {dialog === "image" && (
        <ExportDialog
          width={d.width}
          height={d.height}
          onExport={imageExport}
          onClose={() => setDialog(null)}
        />
      )}
      {plot && (
        <PlotDialog
          initial={plot.settings}
          onClose={() => setPlot(null)}
          onApply={(settings) => {
            if (plot.id)
              history.commit((doc) => ({
                ...doc,
                elements: doc.elements.map((e) =>
                  e.id === plot.id ? { ...e, plot: settings } : e,
                ),
              }));
            else {
              const e = makeElement(
                "plot",
                Math.max(20, (d.width - 320) / 2),
                Math.max(20, (d.height - 230) / 2),
              );
              e.plot = settings;
              history.commit((doc) => ({
                ...doc,
                elements: [...doc.elements, e],
              }));
              setSelectedIds([e.id]);
              setPlot({ id: e.id, settings });
            }
            setConstructionTool(null);
            setTool("select");
          }}
        />
      )}
      {dialog === "tikz" && (
        <div className="modal-shade">
          <section
            className="tikz-dialog"
            role="dialog"
            aria-modal="true"
            aria-label="Export TikZ"
          >
            <div className="dialog-heading">
              Export TikZ<button onClick={() => setDialog(null)}>×</button>
            </div>
            <p className="dialog-hint">
              Editable TikZ paths. Formulas remain LaTeX. Imported images are
              preserved by SVG / PNG export.
            </p>
            <textarea
              aria-label="TikZ source"
              spellCheck={false}
              value={tikz}
              onChange={(event) => setTikz(event.target.value)}
            />
            <footer className="dialog-actions">
              <button onClick={() => setDialog(null)}>Close</button>
              <button
                onClick={() =>
                  void navigator.clipboard
                    .writeText(tikz)
                    .then(() => report("TikZ copied"))
                    .catch(() => report("Select the code and press Ctrl+C."))
                }
              >
                Copy
              </button>
              <button
                onClick={() =>
                  download(
                    new Blob([latexDocument(tikz)], { type: "text/x-tex" }),
                    "drawing.tex",
                  )
                }
              >
                Download .tex
              </button>
            </footer>
          </section>
        </div>
      )}
      {dialog === "size" && (
        <div className="modal-shade">
          <section
            className="small-dialog"
            role="dialog"
            aria-modal="true"
            aria-label="Drawing Size"
          >
            <div className="dialog-heading">
              Drawing Size<button onClick={() => setDialog(null)}>×</button>
            </div>
            <div className="dialog-content">
              <label>
                Width (px)
                <input
                  type="number"
                  min="100"
                  max="10000"
                  value={sizeDraft.width}
                  onChange={(event) =>
                    setSizeDraft({
                      ...sizeDraft,
                      width: Number(event.target.value),
                    })
                  }
                />
              </label>
              <label>
                Height (px)
                <input
                  type="number"
                  min="100"
                  max="10000"
                  value={sizeDraft.height}
                  onChange={(event) =>
                    setSizeDraft({
                      ...sizeDraft,
                      height: Number(event.target.value),
                    })
                  }
                />
              </label>
            </div>
            <footer className="dialog-actions">
              <button onClick={() => setDialog(null)}>Cancel</button>
              <button
                onClick={() => {
                  history.commit((doc) => ({
                    ...doc,
                    width: Math.max(100, Math.min(10000, sizeDraft.width)),
                    height: Math.max(100, Math.min(10000, sizeDraft.height)),
                  }));
                  setDialog(null);
                }}
              >
                Ok
              </button>
            </footer>
          </section>
        </div>
      )}
      {dialog === "help" && (
        <div className="modal-shade">
          <section
            className="help-dialog"
            role="dialog"
            aria-modal="true"
            aria-label="Keyboard Shortcuts"
          >
            <div className="dialog-heading">
              Drawing Shortcuts
              <button onClick={() => setDialog(null)}>×</button>
            </div>
            <div className="shortcut-grid">
              {[
                ["V / Enter / Esc", "Select"],
                ["H / Space + drag", "Pan"],
                ["T", "Math text"],
                ["L / A", "Line / Arrow"],
                ["R / O", "Rectangle / Circle"],
                ["P", "Free drawing"],
                ["Double-click", "Edit text / plot"],
                ["Shift + click", "Add to selection"],
                ["Shift + drag", "Keep ratio / 45° line"],
                ["Alt + drag", "Copy selection"],
                ["Ctrl Z / Shift Z", "Undo / Redo"],
                ["Ctrl C / X / V", "Copy / Cut / Paste"],
                ["Ctrl D", "Duplicate"],
                ["Ctrl G / Shift G", "Group / Ungroup"],
                ["Ctrl A", "Select all"],
                ["Ctrl S / O", "Save / Open JSON"],
                ["Arrow / Shift Arrow", "Move 1 / 10 px"],
                ["Delete", "Remove selection"],
                ["Double-click", "Finish polygon and keep drawing tool"],
                ["Ctrl Enter", "Finish text editing"],
              ].map(([key, description]) => (
                <div key={`${key}-${description}`}>
                  <kbd>{key}</kbd>
                  <span>{description}</span>
                </div>
              ))}
            </div>
            <p className="dialog-hint">
              Drag a gray arrow beside a selected text object to connect it to
              another object. Drag the orange handle to rotate; green handles
              resize.
            </p>
            <footer className="dialog-actions">
              <button onClick={() => setDialog(null)}>Close</button>
            </footer>
          </section>
        </div>
      )}
    </main>
  );
}
