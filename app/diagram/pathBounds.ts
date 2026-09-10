import type { Point } from "./types";

export type Bounds = { x: number; y: number; width: number; height: number };
/** SVG matrix: x' = a*x + c*y + e, y' = b*x + d*y + f. */
export type Matrix = readonly [number, number, number, number, number, number];
export type Segment = readonly [Point, Point];
export type PathAnchor = {
  point: Point;
  kind: "endpoint" | "vertex" | "midpoint";
};
export const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];
export function transformPoint(p: Point, m: Matrix): Point {
  return {
    x: m[0] * p.x + m[2] * p.y + m[4],
    y: m[1] * p.x + m[3] * p.y + m[5],
  };
}
export function multiplyMatrix(a: Matrix, b: Matrix): Matrix {
  return [
    a[0] * b[0] + a[2] * b[1],
    a[1] * b[0] + a[3] * b[1],
    a[0] * b[2] + a[2] * b[3],
    a[1] * b[2] + a[3] * b[3],
    a[0] * b[4] + a[2] * b[5] + a[4],
    a[1] * b[4] + a[3] * b[5] + a[5],
  ];
}
export function pointBounds(points: Point[]): Bounds {
  if (!points.length) return { x: 0, y: 0, width: 0, height: 0 };
  let x = Infinity,
    y = Infinity,
    right = -Infinity,
    bottom = -Infinity;
  for (const p of points) {
    x = Math.min(x, p.x);
    y = Math.min(y, p.y);
    right = Math.max(right, p.x);
    bottom = Math.max(bottom, p.y);
  }
  return { x, y, width: right - x, height: bottom - y };
}
export function boxCorners(b: Bounds): Point[] {
  return [
    { x: b.x, y: b.y },
    { x: b.x + b.width, y: b.y },
    { x: b.x + b.width, y: b.y + b.height },
    { x: b.x, y: b.y + b.height },
  ];
}

const tokenCache = new Map<string, (string | number)[]>();
const EPS = 1e-10,
  TAU = Math.PI * 2;
function roots(a: number, b: number, c: number): number[] {
  if (Math.abs(a) < EPS) return Math.abs(b) < EPS ? [] : [-c / b];
  const discriminant = b * b - 4 * a * c;
  if (discriminant < -EPS) return [];
  const r = Math.sqrt(Math.max(0, discriminant));
  return [(-b + r) / (2 * a), (-b - r) / (2 * a)];
}

/** Exact geometric bounds, excluding stroke. Curves use derivative extrema,
 * and elliptical arcs are evaluated after the same affine transform as SVG. */
export function svgPathBounds(
  path: string,
  matrix: Matrix = IDENTITY,
  segments?: Segment[],
  tolerance = 0.05,
  anchors?: PathAnchor[],
): Bounds {
  let tokens = tokenCache.get(path);
  if (!tokens) {
    tokens = (
      path.match(/[a-df-z]|[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:e[-+]?\d+)?/gi) ?? []
    ).map((token) => (/^[a-z]$/i.test(token) ? token : Number(token)));
    if (path.length < 20000) {
      tokenCache.set(path, tokens);
      if (tokenCache.size > 128)
        tokenCache.delete(tokenCache.keys().next().value!);
    }
  }
  let index = 0,
    command = "",
    previous = "",
    pen: Point = { x: 0, y: 0 },
    start = pen,
    control = pen;
  const bounds: Point[] = [];
  let subpathStart = anchors?.length ?? 0;
  const finishSubpath = (closed = false) => {
    if (anchors && anchors.length > subpathStart && !closed) {
      anchors[subpathStart].kind = "endpoint";
      anchors[anchors.length - 1].kind = "endpoint";
    }
    subpathStart = anchors?.length ?? 0;
  };
  // Record real path junctions and parameter midpoints, never subdivision nodes.
  const record = (a: Point, b: Point, mid: Point) => {
    if (!anchors) return;
    if (anchors.length === subpathStart)
      anchors.push({ point: a, kind: "vertex" });
    anchors.push(
      { point: mid, kind: "midpoint" },
      { point: b, kind: "vertex" },
    );
  };
  const add = (p: Point) => bounds.push(transformPoint(p, matrix));
  const line = (a: Point, b: Point) => {
    const from = transformPoint(a, matrix),
      to = transformPoint(b, matrix);
    segments?.push([from, to]);
    if (Math.hypot(from.x - to.x, from.y - to.y) > EPS)
      record(from, to, { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 });
  };
  const sampleCubic = (a: Point, b: Point, c: Point, d: Point, depth = 0) => {
    const distance = (p: Point) => {
      const dx = d.x - a.x,
        dy = d.y - a.y;
      const t = Math.max(
        0,
        Math.min(
          1,
          ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1),
        ),
      );
      return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
    };
    if (depth >= 16 || Math.max(distance(b), distance(c)) <= tolerance) {
      segments!.push([a, d]);
      return;
    }
    const mid = (p: Point, q: Point) => ({
      x: (p.x + q.x) / 2,
      y: (p.y + q.y) / 2,
    });
    const ab = mid(a, b),
      bc = mid(b, c),
      cd = mid(c, d),
      abc = mid(ab, bc),
      bcd = mid(bc, cd),
      m = mid(abc, bcd);
    sampleCubic(a, ab, abc, m, depth + 1);
    sampleCubic(m, bcd, cd, d, depth + 1);
  };
  const cubic = (p0: Point, p1: Point, p2: Point, p3: Point) => {
    const [a, b, c, d] = [p0, p1, p2, p3].map((p) => transformPoint(p, matrix));
    record(a, d, {
      x: (a.x + 3 * b.x + 3 * c.x + d.x) / 8,
      y: (a.y + 3 * b.y + 3 * c.y + d.y) / 8,
    });
    if (segments) sampleCubic(a, b, c, d);
    bounds.push(a, d);
    const ts = [
      ...roots(
        -a.x + 3 * b.x - 3 * c.x + d.x,
        2 * (a.x - 2 * b.x + c.x),
        b.x - a.x,
      ),
      ...roots(
        -a.y + 3 * b.y - 3 * c.y + d.y,
        2 * (a.y - 2 * b.y + c.y),
        b.y - a.y,
      ),
    ];
    for (const t of ts)
      if (t > 0 && t < 1) {
        const u = 1 - t;
        bounds.push({
          x:
            u * u * u * a.x +
            3 * u * u * t * b.x +
            3 * u * t * t * c.x +
            t * t * t * d.x,
          y:
            u * u * u * a.y +
            3 * u * u * t * b.y +
            3 * u * t * t * c.y +
            t * t * t * d.y,
        });
      }
  };
  const quadratic = (p0: Point, p1: Point, p2: Point) => {
    const [a, b, c] = [p0, p1, p2].map((p) => transformPoint(p, matrix));
    record(a, c, {
      x: (a.x + 2 * b.x + c.x) / 4,
      y: (a.y + 2 * b.y + c.y) / 4,
    });
    if (segments)
      sampleCubic(
        a,
        { x: a.x + (2 * (b.x - a.x)) / 3, y: a.y + (2 * (b.y - a.y)) / 3 },
        { x: c.x + (2 * (b.x - c.x)) / 3, y: c.y + (2 * (b.y - c.y)) / 3 },
        c,
      );
    bounds.push(a, c);
    for (const t of [
      (a.x - b.x) / (a.x - 2 * b.x + c.x),
      (a.y - b.y) / (a.y - 2 * b.y + c.y),
    ])
      if (t > 0 && t < 1) {
        const u = 1 - t;
        bounds.push({
          x: u * u * a.x + 2 * u * t * b.x + t * t * c.x,
          y: u * u * a.y + 2 * u * t * b.y + t * t * c.y,
        });
      }
  };
  const arc = (
    p0: Point,
    p1: Point,
    rx: number,
    ry: number,
    degrees: number,
    large: number,
    sweep: number,
  ) => {
    add(p0);
    add(p1);
    rx = Math.abs(rx);
    ry = Math.abs(ry);
    if (rx < EPS || ry < EPS || Math.hypot(p1.x - p0.x, p1.y - p0.y) < EPS) {
      line(p0, p1);
      return;
    }
    const phi = (degrees * Math.PI) / 180,
      cos = Math.cos(phi),
      sin = Math.sin(phi);
    const dx = (p0.x - p1.x) / 2,
      dy = (p0.y - p1.y) / 2,
      xp = cos * dx + sin * dy,
      yp = -sin * dx + cos * dy;
    const scale = Math.max(1, Math.hypot(xp / rx, yp / ry));
    rx *= scale;
    ry *= scale;
    const denominator = rx * rx * yp * yp + ry * ry * xp * xp;
    const factor =
      (large === sweep ? -1 : 1) *
      Math.sqrt(Math.max(0, (rx * rx * ry * ry - denominator) / denominator));
    const cxp = (factor * rx * yp) / ry,
      cyp = (-factor * ry * xp) / rx;
    const center = transformPoint(
      {
        x: cos * cxp - sin * cyp + (p0.x + p1.x) / 2,
        y: sin * cxp + cos * cyp + (p0.y + p1.y) / 2,
      },
      matrix,
    );
    const ux = (xp - cxp) / rx,
      uy = (yp - cyp) / ry,
      vx = (-xp - cxp) / rx,
      vy = (-yp - cyp) / ry;
    const first = Math.atan2(uy, ux);
    let delta = Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
    if (sweep && delta < 0) delta += TAU;
    if (!sweep && delta > 0) delta -= TAU;
    const u = {
      x: matrix[0] * rx * cos + matrix[2] * rx * sin,
      y: matrix[1] * rx * cos + matrix[3] * rx * sin,
    };
    const v = {
      x: -matrix[0] * ry * sin + matrix[2] * ry * cos,
      y: -matrix[1] * ry * sin + matrix[3] * ry * cos,
    };
    const halfway = first + delta / 2;
    record(transformPoint(p0, matrix), transformPoint(p1, matrix), {
      x: center.x + u.x * Math.cos(halfway) + v.x * Math.sin(halfway),
      y: center.y + u.y * Math.cos(halfway) + v.y * Math.sin(halfway),
    });
    if (segments) {
      const radius = Math.hypot(u.x, u.y) + Math.hypot(v.x, v.y);
      const count = Math.min(
        4096,
        Math.max(
          2,
          Math.ceil(
            Math.abs(delta) /
              (2 *
                Math.acos(
                  Math.max(-1, 1 - tolerance / Math.max(radius, tolerance)),
                )),
          ),
        ),
      );
      let before = transformPoint(p0, matrix);
      for (let i = 1; i <= count; i++) {
        const a = first + (delta * i) / count;
        const next =
          i === count
            ? transformPoint(p1, matrix)
            : {
                x: center.x + u.x * Math.cos(a) + v.x * Math.sin(a),
                y: center.y + u.y * Math.cos(a) + v.y * Math.sin(a),
              };
        segments.push([before, next]);
        before = next;
      }
    }
    const onArc = (angle: number) => {
      const distance =
        (((sweep ? angle - first : first - angle) % TAU) + TAU) % TAU;
      return distance <= Math.abs(delta) + EPS;
    };
    for (const angle of [
      Math.atan2(v.x, u.x),
      Math.atan2(v.x, u.x) + Math.PI,
      Math.atan2(v.y, u.y),
      Math.atan2(v.y, u.y) + Math.PI,
    ])
      if (onArc(angle))
        bounds.push({
          x: center.x + u.x * Math.cos(angle) + v.x * Math.sin(angle),
          y: center.y + u.y * Math.cos(angle) + v.y * Math.sin(angle),
        });
  };
  const sizes: Record<string, number> = {
    M: 2,
    L: 2,
    H: 1,
    V: 1,
    C: 6,
    S: 4,
    Q: 4,
    T: 2,
    A: 7,
  };
  while (index < tokens.length) {
    if (typeof tokens[index] === "string") command = String(tokens[index++]);
    const op = command.toUpperCase(),
      relative = command !== op;
    if (op === "Z") {
      line(pen, start);
      add(pen);
      add(start);
      pen = start;
      finishSubpath(true);
      previous = op;
      command = "";
      continue;
    }
    const count = sizes[op];
    if (!count || index + count > tokens.length)
      throw new Error("Invalid SVG path");
    const values = tokens.slice(index, index + count);
    if (values.some((v) => typeof v !== "number" || !Number.isFinite(v)))
      throw new Error("Invalid SVG coordinates");
    index += count;
    const v = values as number[],
      point = (x: number, y: number) => ({
        x: x + (relative ? pen.x : 0),
        y: y + (relative ? pen.y : 0),
      });
    let next = pen;
    if (op === "M" || op === "L") {
      next = point(v[0], v[1]);
      if (op === "M") {
        finishSubpath();
        start = next;
        command = relative ? "l" : "L";
      } else {
        add(pen);
        line(pen, next);
      }
      add(next);
    } else if (op === "H") {
      next = { x: v[0] + (relative ? pen.x : 0), y: pen.y };
      line(pen, next);
      add(pen);
      add(next);
    } else if (op === "V") {
      next = { x: pen.x, y: v[0] + (relative ? pen.y : 0) };
      line(pen, next);
      add(pen);
      add(next);
    } else if (op === "C") {
      next = point(v[4], v[5]);
      control = point(v[2], v[3]);
      cubic(pen, point(v[0], v[1]), control, next);
    } else if (op === "S") {
      const first = ["C", "S"].includes(previous)
        ? { x: 2 * pen.x - control.x, y: 2 * pen.y - control.y }
        : pen;
      control = point(v[0], v[1]);
      next = point(v[2], v[3]);
      cubic(pen, first, control, next);
    } else if (op === "Q") {
      control = point(v[0], v[1]);
      next = point(v[2], v[3]);
      quadratic(pen, control, next);
    } else if (op === "T") {
      control = ["Q", "T"].includes(previous)
        ? { x: 2 * pen.x - control.x, y: 2 * pen.y - control.y }
        : pen;
      next = point(v[0], v[1]);
      quadratic(pen, control, next);
    } else if (op === "A") {
      next = point(v[5], v[6]);
      arc(pen, next, v[0], v[1], v[2], v[3], v[4]);
    }
    pen = next;
    previous = op;
  }
  finishSubpath();
  return pointBounds(bounds);
}

/** Exact endpoints, vertices and t=0.5 points in the rendered coordinate space. */
export function svgPathAnchors(
  path: string,
  matrix: Matrix = IDENTITY,
): PathAnchor[] {
  const anchors: PathAnchor[] = [];
  svgPathBounds(path, matrix, undefined, 0.05, anchors);
  const unique = new Map<string, PathAnchor>();
  for (const anchor of anchors) {
    const key = `${anchor.point.x.toFixed(7)},${anchor.point.y.toFixed(7)}`;
    const old = unique.get(key);
    if (!old || anchor.kind === "endpoint" || old.kind === "midpoint")
      unique.set(key, anchor);
  }
  return [...unique.values()];
}

/** Flatten contours with a canvas-space error bound; subpaths stay separate. */
export function svgPathSegments(
  path: string,
  matrix: Matrix = IDENTITY,
  tolerance = 0.05,
): Segment[] {
  const segments: Segment[] = [];
  svgPathBounds(path, matrix, segments, tolerance);
  return segments;
}
