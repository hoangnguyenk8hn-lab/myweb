import { renderMathSvg } from "./mathSvg";
import { makeElement } from "./currentDocument";
import { boxCorners, pointBounds, type Bounds } from "./pathBounds";
import { drawElement, pointsBox, worldBounds } from "./sceneGeometry";
import {
  length,
  pathStyle,
  readColor,
  splitOption,
  TIKZ_CM,
} from "./tikzStyle";
import type { DiagramDocument, DiagramElement, Point } from "./types";

export const MAX_TIKZ_CHARS = 256 * 1024;

// Consume a small, explicit PGF grammar. Braced text and option values may
// contain commas, semicolons and nested groups, so they are scanned as units.
class Reader {
  pos = 0;
  constructor(readonly source: string) {}
  skip() {
    while (this.pos < this.source.length && /\s/.test(this.source[this.pos]))
      this.pos++;
  }
  match(re: RegExp) {
    this.skip();
    const m = re.exec(this.source.slice(this.pos));
    if (m) this.pos += m[0].length;
    return m;
  }
  take(s: string) {
    this.skip();
    if (!this.source.startsWith(s, this.pos)) return false;
    this.pos += s.length;
    return true;
  }
  expect(s: string) {
    if (!this.take(s)) throw new Error("Expected “" + s + "”.");
  }
  group(open: string, close: string) {
    this.expect(open);
    const start = this.pos;
    let depth = 1;
    while (this.pos < this.source.length) {
      const c = this.source[this.pos++];
      if (c === "\\") this.pos++;
      else if (c === open) depth++;
      else if (c === close && --depth === 0)
        return this.source.slice(start, this.pos - 1);
    }
    throw new Error("Missing “" + close + "”.");
  }
  options() {
    this.skip();
    if (this.source[this.pos] !== "[") return [];
    this.pos++;
    const parts: string[] = [];
    let start = this.pos,
      depth = 0;
    while (this.pos < this.source.length) {
      const c = this.source[this.pos++];
      if (c === "\\") this.pos++;
      else if (c === "{") depth++;
      else if (c === "}") depth--;
      else if (!depth && (c === "," || c === "]")) {
        const part = this.source.slice(start, this.pos - 1).trim();
        if (part) parts.push(part);
        if (c === "]") return parts;
        start = this.pos;
      }
      if (depth < 0) break;
    }
    throw new Error("Unclosed option list.");
  }
}

const namePattern = /^[A-Za-z][\w:-]*$/;
function nodeAt(r: Reader, at: Point, options: string[]) {
  const body = r.group("{", "}");
  if (body.length > 12000) throw new Error("The label is too long.");
  const isMath = /^\$[\s\S]*\$$/.test(body);
  const e = makeElement(isMath ? "text" : "plain-text", at.x, at.y);
  e.text = isMath
    ? body.slice(1, -1)
    : body.replace(/\\([%$#&_{}])/g, "$1").replace(/\\\\/g, "\n");
  let horizontal = 0,
    vertical = 0;
  let textColor: string | undefined;
  const styles: string[] = [];
  for (const option of options) {
    const [key, value] = splitOption(option);
    if (/^(above|below)( left| right)?$|^(left|right)$/.test(key) && !value) {
      horizontal = key.includes("left") ? -1 : key.includes("right") ? 1 : 0;
      vertical = key.includes("above") ? -1 : key.includes("below") ? 1 : 0;
    } else if (key === "text") textColor = readColor(value);
    else if (key === "rotate" && /^[-+]?\d+(\.\d+)?$/.test(value))
      e.rotation = -Number(value);
    else if (key === "font") {
      const font =
        /^\\fontsize\{([\d.]+)\}\{[\d.]+\}\\selectfont(\\bfseries)?(\\itshape)?$/.exec(
          value,
        );
      if (value === "\\tiny") e.fontSize = 7;
      else if (font) {
        e.fontSize = length(font[1] + "pt", 1);
        e.bold = !!font[2];
        e.italic = !!font[3];
      } else throw new Error("Unsupported node font.");
    } else if (option === "align=center" || option === "inner sep=0pt")
      continue;
    else if (key === "circle" || key === "rectangle" || key === "ellipse")
      e.textBorder = key;
    else styles.push(option);
  }
  const paint = pathStyle("node", styles);
  e.style = paint.style;
  e.textColor = textColor ?? paint.color;
  if (e.style.stroke !== "transparent" && e.textBorder === "none")
    e.textBorder = "rectangle";
  const size = e.fontSize ?? 17;
  if (isMath) {
    const [, , width, height] = renderMathSvg(e.text).box;
    e.width = Math.max(size / 2, (width * size) / 1000) + 4;
    e.height = Math.max(size, (height * size) / 1000) + 4;
  } else {
    const lines = e.text.split("\n");
    e.width = Math.max(
      size,
      Math.max(...lines.map((line) => line.length)) * size * 0.58 + 6,
    );
    e.height = (lines.length * 1.2 + 0.2) * size;
  }
  e.x += horizontal * (e.width / 2 + 2) - e.width / 2;
  e.y += vertical * (e.height / 2 + 2) - e.height / 2;
  return e;
}

export function parseTikz(source: string) {
  if (source.length > MAX_TIKZ_CHARS)
    throw new Error("The source exceeds 256 KiB.");
  const input = source.replace(/\\[\s\S]|%[^\n]*/g, (s) =>
    s.startsWith("%") ? "" : s,
  );
  const begin = "\\begin{tikzpicture}",
    end = "\\end{tikzpicture}";
  const start = input.indexOf(begin),
    wrapped = start >= 0;
  if (wrapped && input.indexOf(begin, start + begin.length) !== -1)
    throw new Error("Import one tikzpicture at a time.");
  const r = new Reader(input);
  const elements: DiagramElement[] = [],
    names = new Map<string, Point>();
  let xUnit = TIKZ_CM,
    yUnit = TIKZ_CM,
    scale = 1,
    totalPoints = 0;
  const globalStyle: string[] = [];
  let clip: Bounds | undefined;
  const coordinate = (): Point => {
    const spec = r.group("(", ")").trim();
    if (++totalPoints > 30000)
      throw new Error("This picture contains too many coordinates.");
    const named = names.get(spec);
    if (named) return { ...named };
    if (namePattern.test(spec))
      throw new Error("Unknown coordinate “" + spec + "”.");
    const xy = spec.split(",");
    if (xy.length !== 2)
      throw new Error("Expected a named point or Cartesian (x,y) coordinate.");
    return {
      x: length(xy[0], xUnit) * scale,
      y: -length(xy[1], yUnit) * scale,
    };
  };
  const add = (element: DiagramElement) => {
    if (elements.length >= 1500)
      throw new Error("A drawing can contain up to 1,500 objects.");
    if (clip) {
      const b = worldBounds(element),
        tolerance = 0.05;
      if (
        b.x < clip.x - tolerance ||
        b.y < clip.y - tolerance ||
        b.x + b.width > clip.x + clip.width + tolerance ||
        b.y + b.height > clip.y + clip.height + tolerance
      )
        throw new Error(
          "This path needs clipping. Import the unclipped geometry separately.",
        );
    }
    elements.push(element);
  };
  function path(command: string, options: string[]) {
    const startPoint = coordinate();
    if (
      command === "clip" ||
      (command === "path" && options.includes("use as bounding box"))
    ) {
      if (options.some((o) => o !== "use as bounding box"))
        throw new Error("Unsupported bounding box or clipping options.");
      r.expect("rectangle");
      const bounds = pointBounds([startPoint, coordinate()]);
      if (command === "clip") {
        if (clip) throw new Error("Multiple clips are not supported.");
        clip = bounds;
      }
      return;
    }
    const paint = pathStyle(command, [...globalStyle, ...options]);
    let last = startPoint,
      e: DiagramElement;
    const labels: DiagramElement[] = [];
    const readLabels = () => {
      while (r.match(/^node\b/)) {
        if (labels.length + elements.length >= 1500)
          throw new Error("Too many labels.");
        labels.push(nodeAt(r, last, r.options()));
      }
    };
    readLabels();
    const radial = r.match(/^(circle|ellipse)\b/);
    if (radial) {
      let radii: string[];
      const opts = r.options();
      if (opts.length) {
        const props = new Map(
          opts.map((o) => splitOption(o) as [string, string]),
        );
        if (opts.length === 1 && props.has("radius"))
          radii = [props.get("radius")!];
        else if (
          opts.length === 2 &&
          props.has("x radius") &&
          props.has("y radius")
        )
          radii = [props.get("x radius")!, props.get("y radius")!];
        else throw new Error("Expected radius or x radius and y radius.");
      } else
        radii = r
          .group("(", ")")
          .trim()
          .split(/\s+and\s+/);
      if (radii.length > 2) throw new Error("Expected one or two radii.");
      const rx = length(radii[0], Math.abs(xUnit)) * Math.abs(scale);
      const ry =
        length(radii[1] ?? radii[0], Math.abs(yUnit)) * Math.abs(scale);
      if (rx <= 0 || ry <= 0) throw new Error("Radii must be positive.");
      e = drawElement(
        makeElement(rx === ry ? "shape:circle" : "shape:ellipse", 0, 0),
        { x: last.x - rx, y: last.y - ry },
        { x: last.x + rx, y: last.y + ry },
      );
    } else if (r.take("rectangle")) {
      last = coordinate();
      e = drawElement(makeElement("shape:rectangle", 0, 0), startPoint, last);
    } else if (r.take("..")) {
      r.expect("controls");
      const c1 = coordinate(),
        c2 = r.take("and") ? coordinate() : c1;
      r.expect("..");
      last = coordinate();
      e = drawElement(makeElement("curve", 0, 0), startPoint, last);
      e.control1 = { x: c1.x - e.x, y: c1.y - e.y };
      e.control2 = { x: c2.x - e.x, y: c2.y - e.y };
      if (paint.style.fill !== "transparent")
        throw new Error("Filled Bézier paths are not supported.");
    } else {
      const points = [startPoint];
      let closed = false;
      while (r.take("--")) {
        if (r.take("cycle")) {
          closed = true;
          break;
        }
        last = coordinate();
        points.push(last);
        readLabels();
        if (points.length > 5000)
          throw new Error("A path can contain up to 5,000 vertices.");
      }
      if (points.length < 2)
        throw new Error(
          "Expected a line, polygon, Bézier, rectangle, circle or ellipse.",
        );
      if (!closed && paint.style.fill !== "transparent") {
        if (paint.style.stroke !== "transparent")
          throw new Error(
            "Add -- cycle to import a filled and outlined polygon.",
          );
        closed = true;
      }
      if (
        closed &&
        points.length > 2 &&
        last.x === startPoint.x &&
        last.y === startPoint.y
      )
        points.pop();
      e =
        closed || points.length > 2
          ? {
              ...makeElement(closed ? "polyline" : "line", 0, 0),
              ...pointsBox(points),
            }
          : drawElement(makeElement("line", 0, 0), startPoint, last);
    }
    if (
      (paint.startHead !== "none" || paint.endHead !== "none") &&
      !["curve", "line"].includes(e.type)
    )
      throw new Error(
        "Arrowheads are supported on open lines and Bézier curves.",
      );
    e.style = paint.style;
    e.startHead = paint.startHead;
    e.endHead = paint.endHead;
    if (
      paint.style.stroke !== "transparent" ||
      paint.style.fill !== "transparent"
    )
      add(e);
    readLabels();
    labels.forEach(add);
  }
  try {
    if (wrapped) {
      r.pos = start + begin.length;
      for (const option of r.options()) {
        const [key, value] = splitOption(option);
        if (key === "x" || key === "y") {
          const unit = length(value, TIKZ_CM);
          if (key === "x") xUnit = unit;
          else yUnit = unit;
        } else if (key === "scale" && /^[-+]?(?:\d+\.?\d*|\.\d+)$/.test(value))
          scale *= Number(value);
        else globalStyle.push(option);
      }
    }
    while (true) {
      r.skip();
      if (wrapped && r.take(end)) break;
      if (r.pos >= input.length) {
        if (wrapped) throw new Error("Missing " + end + ".");
        break;
      }
      const command = r.match(/^\\([A-Za-z]+)/)?.[1];
      if (command === "coordinate") {
        const name = r.group("(", ")").trim();
        if (!namePattern.test(name))
          throw new Error("Invalid coordinate name.");
        r.expect("at");
        names.set(name, coordinate());
      } else if (command === "node") {
        const options = r.options();
        r.skip();
        const name =
          input[r.pos] === "(" ? r.group("(", ")").trim() : undefined;
        r.expect("at");
        const at = coordinate();
        if (name) {
          if (!namePattern.test(name)) throw new Error("Invalid node name.");
          names.set(name, at);
        }
        add(
          nodeAt(r, at, [
            ...globalStyle.filter(
              (o) => !o.startsWith("line cap=") && !o.startsWith("line join="),
            ),
            ...options,
          ]),
        );
      } else if (
        command &&
        ["draw", "fill", "filldraw", "path", "clip"].includes(command)
      )
        path(command, r.options());
      else
        throw new Error(
          command
            ? "Unsupported command \\" + command + "."
            : "Expected a TikZ drawing command.",
        );
      r.expect(";");
    }
    if (!elements.length)
      throw new Error("The source contains no visible drawing objects.");
    const bounds = pointBounds(
      elements.flatMap((e) => boxCorners(worldBounds(e))),
    );
    if (
      ![bounds.x, bounds.y, bounds.width, bounds.height].every(
        Number.isFinite,
      ) ||
      Math.max(bounds.width, bounds.height) > 9960
    )
      throw new Error("The picture is too large for the canvas.");
    return { elements, bounds };
  } catch (error) {
    const line = input
      .slice(0, Math.min(r.pos, input.length))
      .split("\n").length;
    throw new Error(
      "Line " +
        line +
        " · " +
        (error instanceof Error ? error.message : "Invalid TikZ."),
    );
  }
}

export function placeTikz(
  doc: DiagramDocument,
  picture: ReturnType<typeof parseTikz>,
) {
  const { bounds } = picture;
  const width = Math.max(doc.width, Math.ceil(bounds.width + 40));
  const height = Math.max(doc.height, Math.ceil(bounds.height + 40));
  const dx = (width - bounds.width) / 2 - bounds.x;
  const dy = (height - bounds.height) / 2 - bounds.y;
  const elements = picture.elements.map((e) => ({
    ...e,
    x: e.x + dx,
    y: e.y + dy,
  }));
  return { ...doc, width, height, elements: [...doc.elements, ...elements] };
}
