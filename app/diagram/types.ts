export type Point = { x: number; y: number };
export const CURRENT_DOCUMENT_VERSION = 2 as const;

/** Runtime and TypeScript share this one persisted-element registry. */
export const ELEMENT_TYPES = [
  "point",
  "plain-text",
  "boxed-text",
  "polyline",
  "polycurve",
  "freehand",
  "image",
  "plot",
  "shape",
  "text",
  "line",
  "arrow",
  "curve",
  "curved-arrow",
  "ellipse",
  "circle",
  "arc",
  "rectangle",
  "square",
  "triangle",
  "diamond",
  "polygon",
  "axis",
  "wave",
  "quadratic",
  "cubic",
  "brace",
  "cross",
  "target",
  "arrow-head",
  "double-arrow-head",
] as const;

export type ElementType = (typeof ELEMENT_TYPES)[number];
const ELEMENT_TYPE_SET: ReadonlySet<string> = new Set(ELEMENT_TYPES);
export function isElementType(value: unknown): value is ElementType {
  return typeof value === "string" && ELEMENT_TYPE_SET.has(value);
}

export const CONSTRUCTION_TOOLS = [
  "tangent",
  "perpendicular",
  "angle-bisector",
  "point-reflection",
] as const;
export type ConstructionTool = (typeof CONSTRUCTION_TOOLS)[number];

export type DiagramTool =
  | ElementType
  | `shape:${string}`
  | "select"
  | "hand"
  | ConstructionTool;

/**
 * A construction choice is a real editor tool, never an ambient module flag.
 * Keeping this separate from ElementType prevents construction tools from being
 * accidentally persisted as drawable elements.
 */
export type AssistedLineConstruction = "perpendicular" | "angle-bisector";

export function isAssistedLineConstruction(
  tool: DiagramTool,
): tool is AssistedLineConstruction {
  return tool === "perpendicular" || tool === "angle-bisector";
}

export type DashStyle = "solid" | "dashed" | "dotted";
export type RightAngleMarker =
  | "right-angle-inside-left"
  | "right-angle-inside-right"
  | "right-angle-outside-left"
  | "right-angle-outside-right";
export type ArrowHead =
  | "none"
  | "arrow"
  | "open"
  | "bar"
  | "double-bar"
  | "circle"
  | "dot"
  | "double-open"
  | "bar-open"
  | "cross"
  | "plus"
  | "arc"
  /** Legacy documents may still contain a right-angle mark in an end head. */
  | RightAngleMarker;

/** A right-angle mark belongs at a position on a line, not at its SVG end marker. */
export interface RightAngleDecoration {
  marker: RightAngleMarker;
  /** Position along the line path, from start (0) to end (1). */
  at: number;
}

export interface ElementStyle {
  stroke: string;
  fill: string;
  strokeWidth: number;
  dash: DashStyle;
  opacity: number;
  fillPaint?: FillPaint;
}

export type FillPaint =
  | {
      kind: "gradient";
      type: "linear" | "radial";
      from: string;
      to: string;
      angle: number;
    }
  | {
      kind: "pattern";
      type: "diagonal" | "crosshatch" | "dots" | "grid";
      foreground: string;
      background: string;
      size: number;
    };

export interface DiagramElement {
  id: string;
  type: ElementType;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  style: ElementStyle;
  text?: string;
  fontSize?: number;
  startHead?: ArrowHead;
  endHead?: ArrowHead;
  /** Perpendicular construction decoration. New drawings never store this in endHead. */
  rightAngle?: RightAngleDecoration;
  locked?: boolean;
  shape?: string;
  points?: Point[];
  control1?: Point;
  control2?: Point;
  fromId?: string;
  toId?: string;
  groupId?: string;
  textMode?: "math" | "text";
  textBorder?: "none" | "rectangle" | "ellipse" | "circle";
  textColor?: string;
  fontFamily?: string;
  bold?: boolean;
  italic?: boolean;
  skewX?: number;
  cornerRadius?: number;
  midHead?: ArrowHead;
  markerSize?: number;
  startMarkerSize?: number;
  endMarkerSize?: number;
  midMarkerSize?: number;
  /** Nominal point marker size in px (0.1–2). */
  pointSize?: number;
  boxed?: boolean;
  intersection?: boolean;
  /** Omitted: intersect every object. Present: only these linked objects. */
  intersectionWith?: string[];
  blockIntersection?: boolean;
  intersectionKind?: "circle" | "dot" | "cross";
  /** Hide the marker while keeping the computed intersection available to snap. */
  intersectionHidden?: boolean;
  intersectionSize?: number;
  /** Nominal symbol stroke size, matching line markers (0.1–2 px). */
  intersectionMarkerSize?: number;
  breakSize?: number;
  breakPosition?: number;
  imageHref?: string;
  parameters?: Record<string, number>;
  plot?: PlotSettings;
}

export interface PlotSettings {
  kind:
    | "function"
    | "scatter"
    | "line"
    | "area"
    | "bar"
    | "pie"
    | "parametric"
    | "surface";
  expressions: string[];
  data: Point[];
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
  axes: boolean;
  grid: boolean;
  numbers: boolean;
}

export interface GridSettings {
  visible: boolean;
  size: number;
  snap: boolean;
  editOnly: boolean;
  major?: boolean;
  snapShapes?: boolean;
}

export interface DiagramDocument {
  version: typeof CURRENT_DOCUMENT_VERSION;
  width: number;
  height: number;
  grid: GridSettings;
  elements: DiagramElement[];
}

export type PointerMode =
  | { kind: "idle" }
  | {
      kind: "draw";
      tool: ElementType;
      start: Point;
      id: string;
    }
  | {
      kind: "move";
      start: Point;
      ids: string[];
      originals: Record<string, Point>;
    }
  | {
      kind: "resize";
      start: Point;
      id: string;
      corner: "nw" | "ne" | "se" | "sw";
      original: DiagramElement;
    }
  | {
      kind: "rotate";
      id: string;
      center: Point;
      originalRotation: number;
      startAngle: number;
    }
  | { kind: "marquee"; start: Point; current: Point };
