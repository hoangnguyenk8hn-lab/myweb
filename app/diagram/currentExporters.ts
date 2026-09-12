import {
  CURRENT_DOCUMENT_VERSION,
  isElementType,
  type DiagramDocument,
  type DiagramElement,
} from "./types";
import {
  TEXT_TYPES,
  LINE_TYPES,
  center,
  resolveElement,
  markerDimension,
} from "./sceneGeometry";
import { parseColor } from "./colorModel";
import { collectIntersections, intersectionAppearance } from "./intersections";
import { RIGHT_ANGLE_MARKERS } from "./lineMarkers";
import { migrateDocument } from "./documentMigration";
import {
  externalizeDocumentImages,
  portableDocument,
  resolveImageAsset,
} from "./imageAssets";

export interface ImageOptions {
  format: "png" | "jpeg" | "svg";
  scale: number;
  transparent: boolean;
  grid: boolean;
}
export const DEFAULT_IMAGE_OPTIONS: ImageOptions = {
  format: "png",
  scale: 2,
  transparent: false,
  grid: false,
};
export function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}
export async function downloadJson(data: DiagramDocument) {
  const portable = await portableDocument(data);
  download(
    new Blob([JSON.stringify(portable, null, 2)], { type: "application/json" }),
    "drawing.json",
  );
}
export async function svgString(
  source: SVGSVGElement,
  data: DiagramDocument,
  options: ImageOptions = DEFAULT_IMAGE_OPTIONS,
) {
  const clone = source.cloneNode(true) as SVGSVGElement;
  await Promise.all(
    Array.from(clone.querySelectorAll<SVGImageElement>("image[data-image-asset]")).map(
      async (image) => {
        const reference = image.dataset.imageAsset;
        const href = await resolveImageAsset(reference);
        if (href) image.setAttribute("href", href);
        image.removeAttribute("data-image-asset");
      },
    ),
  );
  clone
    .querySelectorAll("[data-ui],[data-hit-area],.selection-layer")
    .forEach((n) => n.remove());
  if (!options.grid)
    clone.querySelectorAll("[data-grid]").forEach((n) => n.remove());
  if (options.transparent)
    clone
      .querySelectorAll("[data-canvas-background]")
      .forEach((n) => n.remove());
  ["class", "style", "tabindex", "role", "aria-label"].forEach((a) =>
    clone.removeAttribute(a),
  );
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clone.setAttribute("width", String(data.width));
  clone.setAttribute("height", String(data.height));
  clone.setAttribute("viewBox", `0 0 ${data.width} ${data.height}`);
  return `<?xml version="1.0" encoding="UTF-8"?>\n${new XMLSerializer().serializeToString(clone)}`;
}
export async function exportImage(
  source: SVGSVGElement,
  data: DiagramDocument,
  options: ImageOptions,
) {
  const svg = await svgString(source, data, options);
  if (options.format === "svg") {
    download(
      new Blob([svg], { type: "image/svg+xml;charset=utf-8" }),
      "drawing.svg",
    );
    return;
  }
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () =>
        reject(new Error("The image could not be rendered."));
      image.src = url;
    });
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(data.width * options.scale);
    canvas.height = Math.round(data.height * options.scale);
    if (canvas.width * canvas.height > 64_000_000)
      throw new Error("Use a smaller scale for this drawing.");
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas is unavailable.");
    ctx.scale(options.scale, options.scale);
    if (!options.transparent || options.format === "jpeg") {
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, data.width, data.height);
    }
    ctx.drawImage(image, 0, 0, data.width, data.height);
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error("Export failed."))),
        `image/${options.format}`,
        0.95,
      ),
    );
    download(blob, `drawing.${options.format === "jpeg" ? "jpg" : "png"}`);
  } finally {
    URL.revokeObjectURL(url);
  }
}

const finite = (n: unknown) =>
  typeof n === "number" && Number.isFinite(n) && Math.abs(n) < 1e7;
const colors = (v: unknown) =>
  typeof v === "string" &&
  /^(#[\da-f]{3,8}|transparent|none|black|white|rgba?\([\d\s.,%]+\))$/i.test(v);
export function validDocument(value: unknown): value is DiagramDocument {
  if (!value || typeof value !== "object") return false;
  const d = value as DiagramDocument;
  if (
    d.version !== CURRENT_DOCUMENT_VERSION ||
    !finite(d.width) ||
    !finite(d.height) ||
    d.width < 50 ||
    d.height < 50 ||
    d.width > 10000 ||
    d.height > 10000 ||
    !d.grid ||
    !finite(d.grid.size) ||
    d.grid.size < 2 ||
    d.grid.size > 200 ||
    ![d.grid.visible, d.grid.snap, d.grid.editOnly].every(
      (v) => typeof v === "boolean",
    ) ||
    !Array.isArray(d.elements) ||
    d.elements.length > 1500
  )
    return false;
  const ids = new Set<string>();
  let pointCount = 0;
  return d.elements.every((e: DiagramElement) => {
    if (
      !e ||
      typeof e.id !== "string" ||
      !e.id ||
      ids.has(e.id) ||
      !isElementType(e.type) ||
      ![e.x, e.y, e.width, e.height, e.rotation].every(finite) ||
      !e.style ||
      !colors(e.style.stroke) ||
      !colors(e.style.fill) ||
      !finite(e.style.strokeWidth) ||
      e.style.strokeWidth < 0 ||
      e.style.strokeWidth > 100 ||
      !finite(e.style.opacity) ||
      e.style.opacity < 0 ||
      e.style.opacity > 1 ||
      !["solid", "dashed", "dotted"].includes(e.style.dash)
    )
      return false;
    ids.add(e.id);
    for (const key of [
      "fontSize",
      "skewX",
      "cornerRadius",
      "markerSize",
      "startMarkerSize",
      "endMarkerSize",
      "midMarkerSize",
      "intersectionSize",
      "intersectionMarkerSize",
      "breakSize",
      "breakPosition",
    ] as const) {
      if (e[key] !== undefined && !finite(e[key])) return false;
    }
    for (const key of ["boxed", "intersection", "blockIntersection"] as const)
      if (e[key] !== undefined && typeof e[key] !== "boolean") return false;
    if (
      e.rightAngle !== undefined &&
      (!e.rightAngle ||
        !RIGHT_ANGLE_MARKERS.includes(e.rightAngle.marker) ||
        !finite(e.rightAngle.at) ||
        e.rightAngle.at < 0 ||
        e.rightAngle.at > 1)
    )
      return false;
    if (
      e.intersectionWith !== undefined &&
      (!Array.isArray(e.intersectionWith) ||
        e.intersectionWith.length > 1500 ||
        e.intersectionWith.some((id) => typeof id !== "string" || !id))
    )
      return false;
    for (const key of [
      "startMarkerSize",
      "endMarkerSize",
      "midMarkerSize",
    ] as const)
      if (e[key] !== undefined && (e[key] < 0.1 || e[key] > 2)) return false;
    if (
      e.intersectionMarkerSize !== undefined &&
      (e.intersectionMarkerSize < 0.1 || e.intersectionMarkerSize > 2)
    )
      return false;
    if (
      e.intersectionSize !== undefined &&
      (e.intersectionSize < 1 || e.intersectionSize > 20)
    )
      return false;
    if (
      e.intersectionKind !== undefined &&
      !["circle", "dot", "cross"].includes(e.intersectionKind)
    )
      return false;
    const paint = e.style.fillPaint;
    if (paint !== undefined) {
      if (!paint || typeof paint !== "object") return false;
      if (paint.kind === "gradient") {
        if (
          !["linear", "radial"].includes(paint.type) ||
          !colors(paint.from) ||
          !colors(paint.to) ||
          !finite(paint.angle)
        )
          return false;
      } else if (paint.kind === "pattern") {
        if (
          !["diagonal", "crosshatch", "dots", "grid"].includes(paint.type) ||
          !colors(paint.foreground) ||
          !colors(paint.background) ||
          !finite(paint.size) ||
          paint.size < 2 ||
          paint.size > 40
        )
          return false;
      } else return false;
    }
    if (e.fontSize !== undefined && (e.fontSize <= 0 || e.fontSize > 512))
      return false;
    if (e.textColor !== undefined && !colors(e.textColor)) return false;
    if (e.textMode !== undefined && !["math", "text"].includes(e.textMode))
      return false;
    if (
      e.textBorder !== undefined &&
      !["none", "rectangle", "ellipse", "circle"].includes(e.textBorder)
    )
      return false;
    for (const point of [e.control1, e.control2])
      if (point && (!finite(point.x) || !finite(point.y))) return false;
    for (const key of [
      "shape",
      "fromId",
      "toId",
      "groupId",
      "fontFamily",
    ] as const)
      if (e[key] !== undefined && typeof e[key] !== "string") return false;
    if (
      e.parameters &&
      Object.values(e.parameters).some((value) => !finite(value))
    )
      return false;
    if (
      e.text !== undefined &&
      (typeof e.text !== "string" || e.text.length > 20000)
    )
      return false;
    if (
      e.points &&
      (!Array.isArray(e.points) ||
        e.points.length > 5000 ||
        e.points.some((p) => !p || !finite(p.x) || !finite(p.y)))
    )
      return false;
    pointCount += e.points?.length ?? 0;
    if (pointCount > 100_000) return false;
    if (LINE_TYPES.has(e.type) && e.points && e.points.length < 2) return false;
    if (
      e.type === "image" &&
      (typeof e.imageHref !== "string" ||
        !/^asset:[a-zA-Z0-9_-]+$/.test(e.imageHref))
    )
      return false;
    if (e.plot) {
      const s = e.plot;
      if (
        ![
          "function",
          "scatter",
          "line",
          "area",
          "bar",
          "pie",
          "parametric",
          "surface",
        ].includes(s.kind) ||
        ![s.xMin, s.xMax, s.yMin, s.yMax].every(finite) ||
        s.xMin >= s.xMax ||
        s.yMin >= s.yMax ||
        !Array.isArray(s.expressions) ||
        s.expressions.length > 30 ||
        s.expressions.some((v) => typeof v !== "string" || v.length > 2000) ||
        !Array.isArray(s.data) ||
        s.data.length > 10000 ||
        s.data.some((p) => !p || !finite(p.x) || !finite(p.y))
      )
        return false;
      pointCount += s.data.length;
      if (pointCount > 100_000) return false;
    }
    return true;
  });
}

/** Migrate, externalize large assets, then validate one untrusted document. */
export async function loadDocument(
  value: unknown,
): Promise<DiagramDocument | null> {
  const migrated = migrateDocument(value);
  if (!migrated) return null;
  const externalized = await externalizeDocumentImages(migrated);
  return validDocument(externalized) ? externalized : null;
}

const n = (v: number) => String(+v.toFixed(2));
function color(value: string) {
  const hex = value.match(/^#([\da-f]{6})([\da-f]{2})?$/i);
  if (hex)
    return `{rgb,255:red,${parseInt(hex[1].slice(0, 2), 16)};green,${parseInt(hex[1].slice(2, 4), 16)};blue,${parseInt(hex[1].slice(4, 6), 16)}}`;
  const rgb = value.match(/[\d.]+/g);
  if (value.startsWith("rgb") && rgb && rgb.length >= 3)
    return `{rgb,255:red,${Math.round(+rgb[0])};green,${Math.round(+rgb[1])};blue,${Math.round(+rgb[2])}}`;
  if (/^#[\da-f]{3}$/i.test(value))
    return color(
      "#" +
        value
          .slice(1)
          .split("")
          .map((c) => c + c)
          .join(""),
    );
  return value === "white" ? "white" : "black";
}
const texEscape = (value: string) =>
  value
    .replace(
      /[\\{}$&#%_^~]/g,
      (c) =>
        ({
          "\\": "\\textbackslash{}",
          "{": "\\{",
          "}": "\\}",
          $: "\\$",
          "&": "\\&",
          "#": "\\#",
          "%": "\\%",
          _: "\\_",
          "^": "\\textasciicircum{}",
          "~": "\\textasciitilde{}",
        })[c]!,
    )
    .replace(/\n/g, "\\\\");

/** Serializes the actual rendered SVG geometry. Curved outlines are sampled into editable TikZ paths. */
export function createTikz(
  source: SVGSVGElement,
  data: DiagramDocument,
): string {
  const commands: string[] = [
    `\\begin{tikzpicture}[x=0.75pt,y=-0.75pt,line cap=round,line join=round]`,
    `\\path[use as bounding box] (0,0) rectangle (${n(data.width)},${n(data.height)});`,
    `\\clip (0,0) rectangle (${n(data.width)},${n(data.height)});`,
  ];
  const rootMatrix = source.getCTM()?.inverse();
  if (!rootMatrix) throw new Error("The drawing is not ready.");
  const coord = (p: DOMPoint) => `(${n(p.x)},${n(p.y)})`;
  const geometry = (
    node: SVGGeometryElement,
    element: DiagramElement,
    placed?: DOMMatrix,
  ) => {
    if (node.closest("[data-hit-area]") || (!placed && node.closest("defs")))
      return;
    const style = getComputedStyle(node);
    if (style.display === "none") return;
    const matrix = node.getCTM();
    if (!matrix && !placed) return;
    const transform = placed ?? rootMatrix.multiply(matrix!);
    const factor =
      style.vectorEffect === "non-scaling-stroke"
        ? 1
        : Math.sqrt(
            Math.abs(transform.a * transform.d - transform.b * transform.c),
          );
    const fill = style.fill,
      stroke = style.stroke;
    const opts = [
      `draw=${stroke === "none" || stroke === "transparent" ? "none" : color(stroke)}`,
      `fill=${fill === "none" || fill === "transparent" ? "none" : color(fill)}`,
      `line width=${n(parseFloat(style.strokeWidth || "1") * 0.75 * factor)}pt`,
      `opacity=${n(element.style.opacity * Number(style.opacity || 1))}`,
      `draw opacity=${n(parseColor(stroke).a)}`,
      `fill opacity=${n(parseColor(fill).a)}`,
      "even odd rule",
    ];
    const paint = fill.startsWith("url(") ? element.style.fillPaint : undefined;
    if (paint?.kind === "gradient") {
      opts[1] = "fill=none";
      opts.push(
        "shade",
        paint.type === "radial"
          ? `shading=radial,inner color=${color(paint.from)},outer color=${color(paint.to)}`
          : `shading=axis,left color=${color(paint.from)},right color=${color(paint.to)},shading angle=${n(-paint.angle)}`,
      );
    } else if (paint?.kind === "pattern") {
      opts[1] = `fill=${paint.background === "transparent" ? "none" : color(paint.background)}`;
      const pattern = {
        diagonal: "north east lines",
        crosshatch: "crosshatch",
        dots: "dots",
        grid: "grid",
      }[paint.type];
      opts.push(
        `pattern=${pattern}`,
        `pattern color=${color(paint.foreground)}`,
      );
    }
    if (style.strokeDasharray && style.strokeDasharray !== "none")
      opts.push(element.style.dash === "dotted" ? "dotted" : "dashed");
    const paths: SVGGeometryElement[] =
      node.tagName === "path"
        ? (node.getAttribute("d") ?? "")
            .split(/(?=M)/)
            .filter(Boolean)
            .map((d) => {
              const path = document.createElementNS(
                "http://www.w3.org/2000/svg",
                "path",
              );
              path.setAttribute("d", d);
              return path;
            })
        : [node];
    const segments: string[] = [];
    for (const path of paths) {
      let length = 0;
      try {
        length = path.getTotalLength();
      } catch {
        continue;
      }
      if (!Number.isFinite(length) || length === 0) continue;
      const count = Math.min(
        420,
        Math.max(2, Math.ceil((length * Math.max(factor, 0.1)) / 3)),
      );
      const maskId = node.getAttribute("mask")?.match(/#([^\)]+)/)?.[1];
      const cut = maskId
        ? source.querySelector<SVGCircleElement>(`mask[id="${maskId}"] circle`)
        : null;
      const points = Array.from({ length: count + 1 }, (_, i) => {
        const q = path.getPointAtLength((length * i) / count);
        if (
          cut &&
          Math.hypot(
            q.x - Number(cut.getAttribute("cx")),
            q.y - Number(cut.getAttribute("cy")),
          ) < Number(cut.getAttribute("r"))
        )
          return null;
        return coord(new DOMPoint(q.x, q.y).matrixTransform(transform));
      });
      if (cut) {
        let run: string[] = [];
        for (const point of points) {
          if (point) run.push(point);
          else if (run.length) {
            if (run.length > 1) segments.push(run.join(" -- "));
            run = [];
          }
        }
        if (run.length > 1) segments.push(run.join(" -- "));
        continue;
      }
      segments.push(
        points.join(" -- ") +
          (path.tagName !== "polyline" &&
          (path.tagName !== "path" ||
            /z\s*$/i.test(path.getAttribute("d") ?? ""))
            ? " -- cycle"
            : ""),
      );
    }
    if (segments.length)
      commands.push(`\\path[${opts.join(",")}] ${segments.join(" ")};`);
    if (!placed)
      for (const side of ["start", "end"] as const) {
        const markerId = node
          .getAttribute(`marker-${side}`)
          ?.match(/#([^\)]+)/)?.[1];
        if (!markerId) continue;
        const definition = source.querySelector<SVGMarkerElement>(
          `marker[id="${markerId}"]`,
        );
        if (!definition) continue;
        const length = node.getTotalLength(),
          at = side === "start" ? 0 : length;
        const q = node.getPointAtLength(at),
          near = node.getPointAtLength(
            side === "start" ? Math.min(1, length) : Math.max(0, length - 1),
          );
        const angle = (Math.atan2(q.y - near.y, q.x - near.x) * 180) / Math.PI;
        const placement = transform
          .translate(q.x, q.y)
          .rotate(angle)
          .scale(markerDimension(element, side) / 10)
          .translate(-8, -5);
        definition
          .querySelectorAll<SVGGeometryElement>("path,circle,rect,ellipse")
          .forEach((child) => geometry(child, element, placement));
      }
  };
  for (const raw of data.elements) {
    const e = resolveElement(raw, data);
    const group = Array.from(
      source.querySelectorAll<SVGGElement>("[data-element-id]"),
    ).find((g) => g.dataset.elementId === e.id);
    if (!group) continue;
    commands.push(`% ${e.type}${e.shape ? ": " + e.shape : ""}`);
    if (e.type === "image") {
      commands.push(`% Embedded image: export SVG/PNG to preserve this image.`);
      continue;
    }
    if (TEXT_TYPES.has(e.type)) {
      group
        .querySelectorAll<SVGGeometryElement>(
          ":scope > rect:not([data-hit-area]),:scope > ellipse",
        )
        .forEach((node) => geometry(node, e));
      const c = center(e);
      const size = (e.fontSize ?? 17) * 0.75;
      const math =
        (e.textMode ?? (e.type === "text" ? "math" : "text")) === "math";
      const text = math
        ? `$${(e.text ?? "").replace(/\$/g, "")}$`
        : texEscape(e.text ?? "");
      commands.push(
        `\\node[inner sep=0pt,align=center,text=${color(e.textColor ?? "#000000")},rotate=${n(-e.rotation)},opacity=${n(e.style.opacity)},font=\\fontsize{${n(size)}}{${n(size * 1.2)}}\\selectfont${e.bold ? "\\bfseries" : ""}${e.italic ? "\\itshape" : ""}] at (${n(c.x)},${n(c.y)}) {${text}};`,
      );
      continue;
    }
    group
      .querySelectorAll<SVGGeometryElement>(
        "path,rect,circle,ellipse,polyline,polygon,line",
      )
      .forEach((node) => geometry(node, e));
    if (e.type === "plot")
      group.querySelectorAll<SVGTextElement>("text").forEach((node) => {
        const matrix = node.getCTM();
        if (!matrix) return;
        const q = new DOMPoint(
          Number(node.getAttribute("x")),
          Number(node.getAttribute("y")),
        ).matrixTransform(rootMatrix.multiply(matrix));
        commands.push(
          `\\node[inner sep=0pt,font=\\tiny,text=gray] at ${coord(q)} {${texEscape(node.textContent ?? "")}};`,
        );
      });
  }
  for (const { point: p, owner: e } of collectIntersections(
    data.elements.map((e) => resolveElement(e, data)),
  )) {
    const { radius: r, strokeWidth } = intersectionAppearance(e),
      c = color(e.style.stroke),
      options = `draw=${c},line width=${n(strokeWidth * 0.75)}pt,opacity=${n(e.style.opacity)}`;
    if (e.intersectionKind === "cross")
      commands.push(
        `\\path[${options}] (${n(p.x - r)},${n(p.y - r)}) -- (${n(p.x + r)},${n(p.y + r)}) (${n(p.x - r)},${n(p.y + r)}) -- (${n(p.x + r)},${n(p.y - r)});`,
      );
    else
      commands.push(
        `\\path[${options},fill=${e.intersectionKind === "dot" ? c : "white"}] (${n(p.x)},${n(p.y)}) circle (${n(r * 0.75)}pt);`,
      );
  }
  commands.push("\\end{tikzpicture}");
  return commands.join("\n");
}
export function latexDocument(tikz: string) {
  return (
    "% Compile with XeLaTeX (supports Unicode text).\n\\documentclass[border=2pt]{standalone}\n\\usepackage{fontspec}\n\\usepackage{amsmath,amssymb}\n\\usepackage{tikz}\n\\usetikzlibrary{arrows.meta,patterns,shadings}\n\\begin{document}\n" +
    tikz +
    "\n\\end{document}\n"
  );
}
