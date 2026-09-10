import type {
  DiagramDocument,
  DiagramElement,
  ElementStyle,
  ElementType,
} from "./types";

export const CANVAS_WIDTH = 1200;
export const CANVAS_HEIGHT = 680;
export const STORAGE_KEY = "diagram-draw-rebuilt-document-v1";

export const DEFAULT_STYLE: ElementStyle = {
  stroke: "#333333",
  fill: "transparent",
  strokeWidth: 1.5,
  dash: "solid",
  opacity: 1,
};

let runningId = 0;

export function createId(prefix = "dg"): string {
  runningId += 1;
  return `${prefix}-${Date.now().toString(36)}-${runningId.toString(36)}`;
}

export function createElement(
  type: ElementType,
  x: number,
  y: number,
  width = 100,
  height = 70,
): DiagramElement {
  const lineLike = ["line", "arrow", "curve", "curved-arrow"].includes(type);
  const textLike = type === "text";
  const solidShape = ["arrow-head", "double-arrow-head"].includes(type);

  return {
    id: createId(type),
    type,
    x,
    y,
    width,
    height: lineLike ? Math.max(height, 1) : height,
    rotation: 0,
    style: {
      ...DEFAULT_STYLE,
      fill: solidShape ? "#333333" : textLike ? "#ffffff" : "transparent",
    },
    text: textLike ? "f(x)" : undefined,
    fontSize: textLike ? 24 : undefined,
    startHead: "none",
    endHead: type === "arrow" || type === "curved-arrow" ? "arrow" : "none",
  };
}

function demoElement(
  type: ElementType,
  x: number,
  y: number,
  width: number,
  height: number,
  options: Partial<DiagramElement> = {},
): DiagramElement {
  return {
    ...createElement(type, x, y, width, height),
    ...options,
    style: { ...DEFAULT_STYLE, ...(options.style ?? {}) },
  };
}

export function createDemoDocument(): DiagramDocument {
  const elements = [
    demoElement("text", 125, 108, 110, 48, {
      text: "A_1",
      fontSize: 26,
      style: { ...DEFAULT_STYLE, fill: "#ffffff", stroke: "transparent" },
    }),
    demoElement("text", 380, 108, 110, 48, {
      text: "B_1",
      fontSize: 26,
      style: { ...DEFAULT_STYLE, fill: "#ffffff", stroke: "transparent" },
    }),
    demoElement("text", 635, 108, 110, 48, {
      text: "C_1",
      fontSize: 26,
      style: { ...DEFAULT_STYLE, fill: "#ffffff", stroke: "transparent" },
    }),
    demoElement("arrow", 235, 132, 145, 0, {
      style: { ...DEFAULT_STYLE, stroke: "#303030" },
      endHead: "arrow",
    }),
    demoElement("arrow", 490, 132, 145, 0, {
      style: { ...DEFAULT_STYLE, stroke: "#303030" },
      endHead: "arrow",
    }),
    demoElement("text", 255, 335, 140, 54, {
      text: "V",
      fontSize: 28,
      style: { ...DEFAULT_STYLE, fill: "#ffffff", stroke: "#4c9b52" },
    }),
    demoElement("text", 725, 335, 140, 54, {
      text: "W",
      fontSize: 28,
      style: { ...DEFAULT_STYLE, fill: "#ffffff", stroke: "#4c9b52" },
    }),
    demoElement("curved-arrow", 395, 365, 330, -92, {
      style: { ...DEFAULT_STYLE, stroke: "#3a86c8", strokeWidth: 1.8 },
      endHead: "arrow",
    }),
    demoElement("curved-arrow", 395, 365, 330, 92, {
      style: { ...DEFAULT_STYLE, stroke: "#b44f9f", strokeWidth: 1.8 },
      endHead: "arrow",
    }),
    demoElement("text", 500, 244, 120, 38, {
      text: "T",
      fontSize: 19,
      style: { ...DEFAULT_STYLE, fill: "transparent", stroke: "transparent" },
    }),
    demoElement("text", 500, 466, 120, 38, {
      text: "T^{-1}",
      fontSize: 19,
      style: { ...DEFAULT_STYLE, fill: "transparent", stroke: "transparent" },
    }),
    demoElement("axis", 880, 220, 220, 220, {
      style: { ...DEFAULT_STYLE, stroke: "#4388c8", strokeWidth: 1.4 },
    }),
    demoElement("quadratic", 890, 255, 190, 155, {
      style: { ...DEFAULT_STYLE, stroke: "#cf4141", strokeWidth: 2 },
    }),
    demoElement("text", 920, 245, 100, 34, {
      text: "y=x^2",
      fontSize: 18,
      rotation: -8,
      style: { ...DEFAULT_STYLE, stroke: "transparent", fill: "transparent" },
    }),
  ];

  return {
    version: 1,
    width: CANVAS_WIDTH,
    height: CANVAS_HEIGHT,
    grid: { visible: true, size: 20, snap: true, editOnly: false },
    elements: elements.map((element, index) => ({
      ...element,
      id: `demo-${index + 1}`,
    })),
  };
}

export function createBlankDocument(): DiagramDocument {
  return {
    version: 1,
    width: CANVAS_WIDTH,
    height: CANVAS_HEIGHT,
    grid: { visible: true, size: 20, snap: true, editOnly: false },
    elements: [],
  };
}
