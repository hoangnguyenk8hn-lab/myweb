import type { DiagramElement, ElementStyle } from "./types";

const cm = 96 / 2.54;
export const TIKZ_CM = cm;
const units: Record<string, number> = {
  cm,
  mm: cm / 10,
  pt: 96 / 72.27,
  bp: 96 / 72,
  in: 96,
};

export function length(value: string, unit: number, transform = 1) {
  const match = /^([+-]?(?:\d+\.?\d*|\.\d+))\s*(cm|mm|pt|bp|in)?$/.exec(
    value.trim(),
  );
  if (!match)
    throw new Error("Expected a numeric length, got “" + value + "”.");
  const result =
    Number(match[1]) * (match[2] ? units[match[2]] * transform : unit);
  if (!Number.isFinite(result) || Math.abs(result) > 100000)
    throw new Error("The coordinate or length is too large.");
  return result;
}

const colors = new Map(
  Object.entries({
    black: "#000000",
    white: "#ffffff",
    red: "#ff0000",
    green: "#00ff00",
    blue: "#0000ff",
    cyan: "#00ffff",
    magenta: "#ff00ff",
    yellow: "#ffff00",
    orange: "#ff8000",
    brown: "#bf8040",
    violet: "#800080",
    purple: "#bf0040",
    gray: "#808080",
    darkgray: "#404040",
    lightgray: "#bfbfbf",
    teal: "#008080",
    pink: "#ffbfbf",
    lime: "#bfff00",
    olive: "#808000",
    none: "transparent",
  }),
);
function rgbHex(rgb: number[]) {
  return (
    "#" + rgb.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")
  );
}
function readColor(value: string): string {
  const name = colors.get(value);
  if (name) return name;
  const rgb = /^\{rgb,255:red,(\d+);green,(\d+);blue,(\d+)\}$/.exec(value);
  if (rgb && rgb.slice(1).every((v) => Number(v) <= 255))
    return rgbHex(rgb.slice(1).map(Number));
  const mix = /^([a-z]+)!(\d+(?:\.\d+)?)(?:!([a-z]+))?$/.exec(value);
  if (mix && Number(mix[2]) <= 100) {
    const a = colors.get(mix[1]),
      b = colors.get(mix[3] ?? "white");
    if (a?.startsWith("#") && b?.startsWith("#")) {
      const ratio = Number(mix[2]) / 100;
      return rgbHex(
        [1, 3, 5].map(
          (i) =>
            parseInt(a.slice(i, i + 2), 16) * ratio +
            parseInt(b.slice(i, i + 2), 16) * (1 - ratio),
        ),
      );
    }
  }
  throw new Error("Unsupported color “" + value + "”.");
}
function alpha(value: string) {
  if (!/^(?:0(?:\.\d*)?|1(?:\.0*)?|\.\d+)$/.test(value))
    throw new Error("Opacity must be between 0 and 1.");
  return Number(value);
}
function withAlpha(color: string, opacity: number) {
  return opacity === 1 || color === "transparent"
    ? color
    : color +
        Math.round(opacity * 255)
          .toString(16)
          .padStart(2, "0");
}

export function pathStyle(command: string, options: string[]) {
  let pen = "#000000",
    draw = ["draw", "filldraw"].includes(command) ? "current" : "none";
  let fill = ["fill", "filldraw"].includes(command) ? "current" : "none";
  let drawOpacity = 1,
    fillOpacity = 1;
  const style: ElementStyle = {
    stroke: "",
    fill: "",
    strokeWidth: length("0.4pt", 1),
    opacity: 1,
    dash: "solid",
  };
  let startHead: DiagramElement["startHead"] = "none",
    endHead: DiagramElement["endHead"] = "none";
  const weights: Record<string, string> = {
    "ultra thin": "0.1pt",
    "very thin": "0.2pt",
    thin: "0.4pt",
    semithick: "0.6pt",
    thick: "0.8pt",
    "very thick": "1.2pt",
    "ultra thick": "1.6pt",
  };
  for (const option of options) {
    const [key, value] = splitOption(option);
    if (key === "draw") draw = value || "current";
    else if (key === "fill") fill = value || "current";
    else if (key === "color") pen = readColor(value);
    else if (key === "line width" || Object.hasOwn(weights, key)) {
      style.strokeWidth = length(weights[key] ?? value, 96 / 72.27);
      if (style.strokeWidth < 0 || style.strokeWidth > 100)
        throw new Error("Line width must be between 0 and 100 px.");
    } else if (key === "opacity") style.opacity = alpha(value);
    else if (key === "draw opacity") drawOpacity = alpha(value);
    else if (key === "fill opacity") fillOpacity = alpha(value);
    else if (["solid", "dashed", "dotted"].includes(key))
      style.dash = key as ElementStyle["dash"];
    else if (["->", "<-", "<->", "-"].includes(key)) {
      startHead = key.startsWith("<") ? "open" : "none";
      endHead = key.endsWith(">") ? "open" : "none";
    } else if (
      option === "line cap=round" ||
      option === "line join=round" ||
      option === "even odd rule"
    )
      continue;
    else if (colors.has(key) || key.includes("!")) pen = readColor(key);
    else throw new Error("Unsupported style “" + option + "”.");
  }
  style.stroke = withAlpha(
    draw === "current" ? pen : readColor(draw),
    drawOpacity,
  );
  style.fill = withAlpha(
    fill === "current" ? pen : readColor(fill),
    fillOpacity,
  );
  return { style, startHead, endHead, color: pen };
}
export function splitOption(option: string) {
  const i = option.indexOf("=");
  return i < 0
    ? [option.trim(), ""]
    : [option.slice(0, i).trim(), option.slice(i + 1).trim()];
}
export { readColor };
