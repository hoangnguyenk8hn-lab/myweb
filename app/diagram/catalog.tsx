"use client";

import type { DiagramTool } from "./types";

export type ToolDefinition = {
  id: DiagramTool;
  label: string;
  shortcut?: string;
};

export type ToolGroup = {
  id: string;
  tools: ToolDefinition[];
};

export const TOOL_GROUPS: ToolGroup[] = [
  { id: "text", tools: [{ id: "text", label: "Math text", shortcut: "T" }] },
  {
    id: "lines",
    tools: [
      { id: "line", label: "Straight line", shortcut: "L" },
      { id: "curve", label: "Curved line" },
      { id: "arrow", label: "Straight arrow", shortcut: "A" },
      { id: "curved-arrow", label: "Curved arrow" },
    ],
  },
  {
    id: "round",
    tools: [
      { id: "ellipse", label: "Ellipse", shortcut: "O" },
      { id: "circle", label: "Circle" },
      { id: "arc", label: "Ellipse arc" },
    ],
  },
  {
    id: "boxes",
    tools: [
      { id: "rectangle", label: "Rectangle", shortcut: "R" },
      { id: "square", label: "Square" },
      { id: "triangle", label: "Triangle" },
      { id: "diamond", label: "Diamond" },
      { id: "polygon", label: "Regular polygon" },
    ],
  },
  {
    id: "curves",
    tools: [
      { id: "wave", label: "Wave" },
      { id: "quadratic", label: "Quadratic curve" },
      { id: "cubic", label: "Cubic curve" },
      { id: "brace", label: "Brace" },
    ],
  },
  {
    id: "axis",
    tools: [{ id: "axis", label: "Cartesian axis", shortcut: "X" }],
  },
  {
    id: "markers",
    tools: [
      { id: "arrow-head", label: "Arrow-head shape" },
      { id: "double-arrow-head", label: "Double arrow-head" },
      { id: "cross", label: "Cross" },
      { id: "target", label: "Aim circle" },
    ],
  },
];

export function ToolIcon({
  tool,
  size = 26,
}: {
  tool: DiagramTool;
  size?: number;
}) {
  const shared = {
    stroke: "currentColor",
    strokeWidth: 1.35,
    fill: "none",
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };

  return (
    <svg width={size} height={size} viewBox="0 0 28 28" aria-hidden="true">
      {tool === "select" && <path d="M7 4l13 9-7 2-3 7z" {...shared} />}
      {tool === "text" && (
        <text
          x="4"
          y="19"
          fontFamily="Times New Roman, serif"
          fontStyle="italic"
          fontSize="17"
          fill="currentColor"
        >
          ƒx
        </text>
      )}
      {tool === "line" && <path d="M4 15h20" {...shared} />}
      {tool === "arrow" && <path d="M3 15h20m-5-5 5 5-5 5" {...shared} />}
      {tool === "curve" && <path d="M3 19Q14 4 25 16" {...shared} />}
      {tool === "curved-arrow" && (
        <path d="M3 19Q14 4 24 16m-5-1 5 1-2-5" {...shared} />
      )}
      {tool === "ellipse" && (
        <ellipse cx="14" cy="14" rx="9" ry="6" {...shared} />
      )}
      {tool === "circle" && <circle cx="14" cy="14" r="7" {...shared} />}
      {tool === "arc" && <path d="M5 18A10 8 0 0 1 23 18" {...shared} />}
      {tool === "rectangle" && (
        <rect x="5" y="8" width="18" height="13" {...shared} />
      )}
      {tool === "square" && (
        <rect x="7" y="7" width="14" height="14" {...shared} />
      )}
      {tool === "triangle" && <path d="M14 5l10 17H4z" {...shared} />}
      {tool === "diamond" && <path d="M14 4l10 10-10 10L4 14z" {...shared} />}
      {tool === "polygon" && <path d="M14 4l9 6v9l-9 5-9-5v-9z" {...shared} />}
      {tool === "wave" && (
        <path d="M3 16c4-10 7 10 11 0s7 10 11 0" {...shared} />
      )}
      {tool === "quadratic" && <path d="M4 23Q14 1 24 23" {...shared} />}
      {tool === "cubic" && <path d="M4 22C11 22 17 6 24 6" {...shared} />}
      {tool === "brace" && (
        <path
          d="M4 16c4 0 4-7 7-7 3 0 2 5 4 5s1 5 4 5c3 0 3-7 6-7"
          {...shared}
        />
      )}
      {tool === "axis" && (
        <path
          d="M5 23V5m0 0-3 4m3-4 3 4M5 19h19m0 0-4-3m4 3-4 3M10 17v4m5-4v4M3 14h4M3 9h4"
          {...shared}
        />
      )}
      {tool === "cross" && <path d="M6 6l16 16M22 6L6 22" {...shared} />}
      {tool === "target" && (
        <g {...shared}>
          <circle cx="14" cy="14" r="9" />
          <circle cx="14" cy="14" r="4" />
          <path d="M3 14h22M14 3v22" />
        </g>
      )}
      {tool === "arrow-head" && <path d="M5 6l18 8-18 8 5-8z" {...shared} />}
      {tool === "double-arrow-head" && (
        <path d="M3 14l7-7v4h8V7l7 7-7 7v-4h-8v4z" {...shared} />
      )}
    </svg>
  );
}

export function labelForTool(tool: DiagramTool): string {
  return (
    TOOL_GROUPS.flatMap((group) => group.tools).find((item) => item.id === tool)
      ?.label ?? "Select"
  );
}
