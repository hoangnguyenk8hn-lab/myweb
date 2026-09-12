import { createId, DEFAULT_STYLE } from "./defaultDocument";
import { DEFAULT_PLOT } from "./plotting";
import { SHAPE_MAP } from "./shapes";
import { DEFAULT_POINT_SIZE } from "./sceneGeometry";
import {
  CURRENT_DOCUMENT_VERSION,
  isElementType,
  type DiagramDocument,
  type DiagramElement,
  type DiagramTool,
} from "./types";

export const CURRENT_STORAGE_KEY = "diagram-draw-current-v3";
export function blankDocument(): DiagramDocument {
  return {
    version: CURRENT_DOCUMENT_VERSION,
    width: 700,
    height: 400,
    grid: {
      visible: true,
      major: false,
      size: 10,
      snap: false,
      snapShapes: true,
      editOnly: false,
    },
    elements: [],
  };
}
export function makeElement(
  tool: DiagramTool,
  x: number,
  y: number,
  width = 100,
  height = 70,
): DiagramElement {
  const shape =
    tool === "point"
      ? "point"
      : tool.startsWith("shape:")
        ? tool.slice(6)
        : undefined;
  const type = shape
    ? "shape"
    : tool === "select" ||
        tool === "hand" ||
        tool === "tangent" ||
        tool === "perpendicular" ||
        tool === "angle-bisector" ||
        tool === "point-reflection"
      ? "rectangle"
      : isElementType(tool)
        ? tool
        : "rectangle";
  const text = ["text", "plain-text", "boxed-text"].includes(type);
  const line = ["line", "arrow", "curve", "curved-arrow"].includes(type);
  const point = shape === "point";
  return {
    id: createId(point ? "point" : type),
    type,
    shape,
    x,
    y,
    width: point ? 0 : text ? (type === "text" ? 24 : 48) : width,
    height: point ? 0 : text ? 29 : height,
    rotation: 0,
    style: {
      ...DEFAULT_STYLE,
      stroke: "#000000",
      strokeWidth: 1,
      fill: "transparent",
    },
    ...(point ? { pointSize: DEFAULT_POINT_SIZE } : {}),
    ...(text
      ? {
          text: type === "text" ? "x" : "Text",
          fontSize: 17,
          textMode: type === "text" ? "math" : "text",
          textBorder: type === "boxed-text" ? "rectangle" : "none",
          textColor: "#000000",
        }
      : {}),
    ...(line
      ? {
          startHead: "none",
          endHead:
            type === "arrow" || type === "curved-arrow" ? "open" : "none",
          markerSize: 9,
        }
      : {}),
    ...(type === "plot"
      ? { plot: structuredClone(DEFAULT_PLOT), width: 320, height: 230 }
      : {}),
    ...(shape && shape !== "point" && !SHAPE_MAP[shape]
      ? { shape: "rectangle" }
      : {}),
    ...(shape === "regular-polygon"
      ? { parameters: { sides: 5 }, height: width }
      : {}),
  };
}
export function exampleDocument(): DiagramDocument {
  const d = blankDocument();
  d.height = 300;
  const a = makeElement("text", 28, 35, 0, 0),
    b = makeElement("text", 183, 35, 0, 0),
    c = makeElement("text", 28, 173, 0, 0),
    e = makeElement("text", 183, 173, 0, 0);
  a.text = "A";
  b.text = "B";
  c.text = "C";
  e.text = "D";
  const connect = (from: DiagramElement, to: DiagramElement) => ({
    ...makeElement("arrow", 0, 0),
    fromId: from.id,
    toId: to.id,
  });
  const labels = [
    ["f", 105, 11],
    ["g", 4, 104],
    ["h", 181, 104],
    ["k", 105, 209],
  ] as const;
  const square = {
    ...makeElement("shape:rectangle", 394, 56, 180, 158),
    rotation: -14,
  };
  const triangle = makeElement("shape:triangle", 432, 36, 160, 172);
  triangle.style.stroke = "#3c78d8";
  const math = makeElement("text", 388, 223);
  math.text = "a^2+b^2=c^2";
  math.width = 220;
  d.elements = [
    connect(a, b),
    connect(a, c),
    connect(b, e),
    connect(c, e),
    a,
    b,
    c,
    e,
    ...labels.map(([text, x, y]) => ({
      ...makeElement("text", x, y),
      text,
      width: 45,
      height: 25,
    })),
    square,
    triangle,
    math,
  ];
  return d;
}
