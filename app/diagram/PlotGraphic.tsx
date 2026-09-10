import {
  compileExpression,
  DEFAULT_PLOT,
  PLOT_COLORS,
  sampleFunction,
} from "./plotting";
import type { PlotSettings } from "./types";
export function PlotGraphic({
  settings = DEFAULT_PLOT,
  id = "plot",
}: {
  settings?: PlotSettings;
  id?: string;
}) {
  const s = settings;
  const px = (x: number) => 8 + ((x - s.xMin) / (s.xMax - s.xMin)) * 84;
  const py = (y: number) => 92 - ((y - s.yMin) / (s.yMax - s.yMin)) * 84;
  const polygon = (points: { x: number; y: number }[]) =>
    points.map((p) => `${px(p.x)},${py(p.y)}`).join(" ");
  let surface: string[] = [];
  if (s.kind === "surface") {
    try {
      const f = compileExpression(s.expressions[0] ?? "sin(x)*cos(y)");
      const project = (x: number, y: number) => {
        const z = f({ x, y });
        return `${50 + (x - y) * 5},${58 + (x + y) * 2.4 - Math.max(-8, Math.min(8, z)) * 10}`;
      };
      for (let r = 0; r <= 20; r++) {
        const fixed = -4 + r * 0.4;
        surface.push(
          Array.from({ length: 41 }, (_, k) =>
            project(-4 + k * 0.2, fixed),
          ).join(" "),
        );
        surface.push(
          Array.from({ length: 41 }, (_, k) =>
            project(fixed, -4 + k * 0.2),
          ).join(" "),
        );
      }
    } catch {
      surface = [];
    }
  }
  let parametric = "";
  if (s.kind === "parametric") {
    try {
      const fx = compileExpression(s.expressions[0] ?? "cos(t)");
      const fy = compileExpression(s.expressions[1] ?? "sin(t)");
      parametric = polygon(
        Array.from({ length: 361 }, (_, i) => ({
          x: fx({ t: (i / 360) * Math.PI * 2 }),
          y: fy({ t: (i / 360) * Math.PI * 2 }),
        })),
      );
    } catch {
      parametric = "";
    }
  }
  let pieAngle = -Math.PI / 2;
  const total = s.data.reduce((sum, p) => sum + Math.max(0, p.y), 0) || 1;
  return (
    <g>
      <defs>
        <clipPath id={`plot-clip-${id}`}>
          <rect x="7" y="7" width="86" height="86" />
        </clipPath>
      </defs>
      {s.kind !== "pie" && s.kind !== "surface" && (
        <>
          {s.grid &&
            Array.from({ length: 11 }, (_, i) => (
              <path
                key={i}
                d={`M${8 + i * 8.4} 8V92M8 ${8 + i * 8.4}H92`}
                stroke="#e7e7e7"
                strokeWidth=".2"
                fill="none"
              />
            ))}
          {s.axes && (
            <>
              <path
                d={`M8 ${Math.max(8, Math.min(92, py(0)))}H92M${Math.max(8, Math.min(92, px(0)))} 8V92`}
                stroke="#888"
                strokeWidth=".4"
                fill="none"
              />
              {s.numbers &&
                Array.from({ length: 6 }, (_, i) => (
                  <g key={i} fill="#888" fontFamily="Arial" fontSize="3.3">
                    <text x={8 + i * 16.8} y={97} textAnchor="middle">
                      {+(s.xMin + ((s.xMax - s.xMin) * i) / 5).toFixed(1)}
                    </text>
                    <text x="5" y={93 - i * 16.8} textAnchor="end">
                      {+(s.yMin + ((s.yMax - s.yMin) * i) / 5).toFixed(1)}
                    </text>
                  </g>
                ))}
            </>
          )}
        </>
      )}
      <g
        clipPath={
          s.kind === "surface" || s.kind === "pie"
            ? undefined
            : `url(#plot-clip-${id})`
        }
      >
        {s.kind === "function" &&
          s.expressions.flatMap((expression, index) =>
            sampleFunction(expression, s).map((points, k) => (
              <polyline
                key={`${index}-${k}`}
                points={polygon(points)}
                fill="none"
                stroke={PLOT_COLORS[index % PLOT_COLORS.length]}
                strokeWidth=".5"
              />
            )),
          )}
        {s.kind === "parametric" && (
          <polyline
            points={parametric}
            fill="none"
            stroke={PLOT_COLORS[0]}
            strokeWidth=".5"
          />
        )}
        {(s.kind === "line" || s.kind === "area") && (
          <>
            {s.kind === "area" && (
              <polygon
                points={`${px(s.data[0]?.x ?? 0)},${py(0)} ${polygon(s.data)} ${px(s.data[s.data.length - 1]?.x ?? 0)},${py(0)}`}
                fill="#448dc433"
              />
            )}
            <polyline
              points={polygon(s.data)}
              fill="none"
              stroke={PLOT_COLORS[1]}
              strokeWidth=".5"
            />
          </>
        )}
        {["scatter", "line", "area"].includes(s.kind) &&
          s.data.map((p, i) => (
            <circle
              key={i}
              cx={px(p.x)}
              cy={py(p.y)}
              r=".8"
              fill={PLOT_COLORS[1]}
            />
          ))}
        {s.kind === "bar" &&
          s.data.map((p, i) => (
            <rect
              key={i}
              x={px(p.x) - 2.5}
              y={Math.min(py(0), py(p.y))}
              width="5"
              height={Math.abs(py(0) - py(p.y))}
              fill={PLOT_COLORS[i % PLOT_COLORS.length]}
            />
          ))}
        {s.kind === "pie" &&
          s.data.map((p, i) => {
            const start = pieAngle;
            const sweep = (Math.max(0, p.y) / total) * Math.PI * 2;
            pieAngle += sweep;
            return sweep >= Math.PI * 2 - 0.001 ? (
              <circle
                key={i}
                cx="50"
                cy="50"
                r="42"
                fill={PLOT_COLORS[i % 6]}
              />
            ) : (
              <path
                key={i}
                d={`M50 50L${50 + 42 * Math.cos(start)} ${50 + 42 * Math.sin(start)}A42 42 0 ${sweep > Math.PI ? 1 : 0} 1 ${50 + 42 * Math.cos(pieAngle)} ${50 + 42 * Math.sin(pieAngle)}Z`}
                fill={PLOT_COLORS[i % 6]}
                stroke="white"
                strokeWidth=".4"
              />
            );
          })}
        {surface.map((points, i) => (
          <polyline
            key={i}
            points={points}
            fill="none"
            stroke={PLOT_COLORS[i % 2 ? 1 : 4]}
            strokeWidth=".25"
            opacity=".9"
          />
        ))}
      </g>
    </g>
  );
}
