import type { Point, PlotSettings } from "./types";

/** Small numeric expression parser. User expressions are never executed as JS. */
export function compileExpression(
  source: string,
): (variables: Record<string, number>) => number {
  const input = source
    .replace(/^\s*[xyz]\s*=\s*/, "")
    .replace(/π/g, "pi")
    .replace(/\*\*/g, "^")
    .toLowerCase();
  const tokens =
    input.match(/(?:\d*\.\d+|\d+\.?\d*)(?:e[+-]?\d+)?|[a-z]+|[+\-*/^(),]/g) ??
    [];
  if (tokens.join("") !== input.replace(/\s/g, ""))
    throw new Error("Unsupported expression");
  let i = 0;
  type Expr = (v: Record<string, number>) => number;
  const funcs: Record<string, (...n: number[]) => number> = {
    sin: Math.sin,
    cos: Math.cos,
    tan: Math.tan,
    asin: Math.asin,
    acos: Math.acos,
    atan: Math.atan,
    sinh: Math.sinh,
    cosh: Math.cosh,
    tanh: Math.tanh,
    sqrt: Math.sqrt,
    abs: Math.abs,
    exp: Math.exp,
    ln: Math.log,
    log: Math.log10,
    floor: Math.floor,
    ceil: Math.ceil,
    round: Math.round,
    sign: Math.sign,
    min: Math.min,
    max: Math.max,
  };
  function primary(): Expr {
    const token = tokens[i++];
    if (!token) throw new Error("Incomplete expression");
    if (token === "(") {
      const expr = sum();
      if (tokens[i++] !== ")") throw new Error("Missing )");
      return expr;
    }
    if (!isNaN(Number(token))) return () => Number(token);
    if (["x", "y", "t"].includes(token)) return (v) => v[token] ?? 0;
    if (token === "pi") return () => Math.PI;
    if (token === "e") return () => Math.E;
    if (Object.hasOwn(funcs, token)) {
      if (tokens[i++] !== "(") throw new Error("Use function(x)");
      const args = [sum()];
      while (tokens[i] === ",") {
        i++;
        args.push(sum());
      }
      if (tokens[i++] !== ")") throw new Error("Missing )");
      return (v) => funcs[token](...args.map((a) => a(v)));
    }
    throw new Error(`Unknown symbol ${token}`);
  }
  function power(): Expr {
    const left = primary();
    if (tokens[i] === "^") {
      i++;
      const right = unary();
      return (v) => left(v) ** right(v);
    }
    return left;
  }
  function unary(): Expr {
    if (tokens[i] === "+") {
      i++;
      return unary();
    }
    if (tokens[i] === "-") {
      i++;
      const e = unary();
      return (v) => -e(v);
    }
    return power();
  }
  function product(): Expr {
    let left = unary();
    while (i < tokens.length) {
      const op = tokens[i];
      const implicit = /^(?:[a-z]|\d|\.|\()/.test(op);
      if (op !== "*" && op !== "/" && !implicit) break;
      if (!implicit) i++;
      const right = unary();
      const prev = left;
      left = op === "/" ? (v) => prev(v) / right(v) : (v) => prev(v) * right(v);
    }
    return left;
  }
  function sum(): Expr {
    let left = product();
    while (tokens[i] === "+" || tokens[i] === "-") {
      const op = tokens[i++];
      const right = product();
      const prev = left;
      left = op === "+" ? (v) => prev(v) + right(v) : (v) => prev(v) - right(v);
    }
    return left;
  }
  const result = sum();
  if (i !== tokens.length) throw new Error("Unexpected input");
  return result;
}

export const DEFAULT_PLOT: PlotSettings = {
  kind: "function",
  expressions: ["x^2"],
  data: [
    { x: 1, y: 2 },
    { x: 2, y: 5 },
    { x: 3, y: 3 },
    { x: 4, y: 7 },
  ],
  xMin: -5,
  xMax: 5,
  yMin: -3,
  yMax: 7,
  axes: true,
  grid: false,
  numbers: true,
};
export const PLOT_COLORS = [
  "#c94d4d",
  "#448dc4",
  "#57a343",
  "#a2509d",
  "#df9639",
  "#31aaa7",
];
export function sampleFunction(
  expression: string,
  settings: PlotSettings,
): Point[][] {
  let fn: (v: Record<string, number>) => number;
  try {
    fn = compileExpression(expression);
  } catch {
    return [];
  }
  const paths: Point[][] = [[]];
  const range = settings.yMax - settings.yMin;
  for (let i = 0; i <= 360; i++) {
    const x = settings.xMin + ((settings.xMax - settings.xMin) * i) / 360;
    const y = fn({ x });
    const path = paths[paths.length - 1];
    if (
      !Number.isFinite(y) ||
      Math.abs(y - settings.yMin) > range * 20 ||
      (path.length && Math.abs(y - path[path.length - 1].y) > range * 1.5)
    ) {
      if (path.length) paths.push([]);
      continue;
    }
    path.push({ x, y });
  }
  return paths.filter((p) => p.length > 1);
}
