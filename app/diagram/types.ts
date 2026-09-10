export type Point = { x: number; y: number };

export type DiagramTool =
  | `shape:${string}`
  | "select"
  | "hand"
  | "plain-text"
  | "boxed-text"
  | "polyline"
  | "polycurve"
  | "freehand"
  | "image"
  | "plot"
  | "shape"
  | "text"
  | "line"
  | "arrow"
  | "curve"
  | "curved-arrow"
  | "ellipse"
  | "circle"
  | "arc"
  | "rectangle"
  | "square"
  | "triangle"
  | "diamond"
  | "polygon"
  | "axis"
  | "wave"
  | "quadratic"
  | "cubic"
  | "brace"
  | "cross"
  | "target"
  | "arrow-head"
  | "double-arrow-head";

export type ElementType = Exclude<
  DiagramTool,
  "select" | "hand" | `shape:${string}`
>;
export type DashStyle = "solid" | "dashed" | "dotted";
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
  | "arc";

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
  boxed?: boolean;
  intersection?: boolean;
  /** Omitted: intersect every object. Present: only these linked objects. */
  intersectionWith?: string[];
  blockIntersection?: boolean;
  intersectionKind?: "circle" | "dot" | "cross";
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
  version: 1;
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
