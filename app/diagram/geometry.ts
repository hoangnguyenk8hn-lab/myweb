import type { DiagramElement, Point } from "./types";

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function snap(value: number, size: number, enabled: boolean): number {
  return enabled ? Math.round(value / size) * size : value;
}

export function snapPoint(point: Point, size: number, enabled: boolean): Point {
  return {
    x: snap(point.x, size, enabled),
    y: snap(point.y, size, enabled),
  };
}

export function normalizeBox(start: Point, end: Point) {
  return {
    x: Math.min(start.x, end.x),
    y: Math.min(start.y, end.y),
    width: Math.abs(end.x - start.x),
    height: Math.abs(end.y - start.y),
  };
}

export function getElementBounds(element: DiagramElement) {
  if (["line", "arrow", "curve", "curved-arrow"].includes(element.type)) {
    return {
      x: Math.min(element.x, element.x + element.width),
      y: Math.min(element.y, element.y + element.height),
      width: Math.abs(element.width),
      height: Math.abs(element.height),
    };
  }
  return {
    x: element.x,
    y: element.y,
    width: Math.abs(element.width),
    height: Math.abs(element.height),
  };
}

export function pointInsideBounds(
  point: Point,
  element: DiagramElement,
): boolean {
  const box = getElementBounds(element);
  return (
    point.x >= box.x &&
    point.x <= box.x + box.width &&
    point.y >= box.y &&
    point.y <= box.y + box.height
  );
}

export function boundsInsideRect(
  element: DiagramElement,
  rect: { x: number; y: number; width: number; height: number },
): boolean {
  const box = getElementBounds(element);
  return (
    box.x >= rect.x &&
    box.y >= rect.y &&
    box.x + box.width <= rect.x + rect.width &&
    box.y + box.height <= rect.y + rect.height
  );
}

export function angle(center: Point, point: Point): number {
  return (Math.atan2(point.y - center.y, point.x - center.x) * 180) / Math.PI;
}

export function dashArray(
  dash: DiagramElement["style"]["dash"],
): string | undefined {
  if (dash === "dashed") return "8 6";
  if (dash === "dotted") return "2 4";
  return undefined;
}

export function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
