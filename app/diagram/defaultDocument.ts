import type { ElementStyle } from "./types";

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
