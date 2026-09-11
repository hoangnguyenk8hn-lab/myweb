"use client";
import { useState } from "react";
import {
  BASIC_SHAPES,
  COORDINATE_SHAPES,
  shapePath,
  type ShapeDefinition,
} from "./shapes";
import { ToolIcon } from "./catalog";
import type { DiagramTool, PlotSettings } from "./types";

const ShapeButton = ({
  shape,
  active,
  onSelect,
}: {
  shape: ShapeDefinition;
  active: boolean;
  onSelect: () => void;
}) => (
  <button
    className={`shape-button${active ? " active" : ""}`}
    title={shape.label}
    aria-label={shape.label}
    aria-pressed={active}
    onClick={onSelect}
  >
    <svg viewBox="0 0 110 110" aria-hidden="true">
      <path
        transform="translate(5 5)"
        d={shapePath(shape.id)}
        fill="none"
        stroke="currentColor"
        strokeWidth="5"
        strokeLinejoin="round"
        strokeLinecap="round"
        fillRule="evenodd"
      />
    </svg>
  </button>
);

export function CurrentToolPalette({
  activeTool,
  onSelect,
  onImage,
  onPlot,
}: {
  activeTool: DiagramTool;
  onSelect: (tool: DiagramTool) => void;
  onImage: () => void;
  onPlot: (kind: PlotSettings["kind"]) => void;
}) {
  const [open, setOpen] = useState<Record<string, boolean>>({
    general: true,
    lines: true,
    document: true,
  });
  const header = (id: string, label: string) => (
    <button
      className="category-heading"
      aria-expanded={!!open[id]}
      onClick={() => setOpen({ ...open, [id]: !open[id] })}
    >
      {label}
      <span className={`caret${open[id] ? " down" : ""}`} />
    </button>
  );
  const shapes = (items: ShapeDefinition[]) => (
    <div className="shape-grid">
      {items.map((shape) => (
        <ShapeButton
          key={shape.id}
          shape={shape}
          active={activeTool === `shape:${shape.id}`}
          onSelect={() => onSelect(`shape:${shape.id}`)}
        />
      ))}
    </div>
  );
  const basic = (
    tool: DiagramTool,
    label: string,
    content?: React.ReactNode,
  ) => (
    <button
      className={`shape-button${activeTool === tool ? " active" : ""}`}
      key={tool}
      title={label}
      aria-label={label}
      aria-pressed={activeTool === tool}
      onClick={() => onSelect(tool)}
    >
      {content ?? <ToolIcon tool={tool} size={22} />}
    </button>
  );
  return (
    <aside className="shape-sidebar" aria-label="Drawing tools">
      {header("general", "General")}
      {open.general && (
        <div className="general-tools">
          {basic("select", "Select")}
          {basic(
            "point",
            "Point",
            <svg viewBox="0 0 28 28" aria-hidden="true">
              <circle cx="14" cy="14" r="3" fill="currentColor" />
            </svg>,
          )}
          {basic(
            "point-reflection",
            "Reflect Point",
            <svg viewBox="0 0 28 28" aria-hidden="true">
              <circle cx="6" cy="9" r="2.2" fill="currentColor" stroke="none" />
              <circle cx="22" cy="19" r="2.2" fill="currentColor" stroke="none" />
              <circle cx="14" cy="14" r="1.7" fill="white" />
              <path d="M7.8 10.1L12.5 13M15.5 15L20.2 17.9M10 21L18 7" />
            </svg>,
          )}
          {basic("text", "Math", "ƒx")}
          {basic(
            "plain-text",
            "Text",
            <span className="plain-text-icon">Text</span>,
          )}
          {basic(
            "boxed-text",
            "Text Box",
            <span className="boxed-text-icon">Text</span>,
          )}
        </div>
      )}
      {header("lines", "Lines, Polygons")}
      {open.lines && (
        <div className="shape-grid line-tools">
          {basic("line", "Line")}
          {basic("curve", "Curve")}
          {basic(
            "tangent",
            "Tangent from Point",
            <svg viewBox="0 0 28 28" aria-hidden="true">
              <circle cx="19" cy="14" r="7" />
              <circle cx="5" cy="22" r="1.7" fill="currentColor" stroke="none" />
              <path d="M5 22L14.5 8.6" />
            </svg>,
          )}
          {basic(
            "perpendicular",
            "Perpendicular Line",
            <svg viewBox="0 0 28 28" aria-hidden="true">
              <path d="M4 21H24M14 21V5M14 16H19V21" />
            </svg>,
          )}
          {basic("arrow", "Arrow")}
          {basic("curved-arrow", "Curved Arrow")}
          {basic(
            "polyline",
            "Polygon",
            <svg viewBox="0 0 28 28">
              <path d="M6 7L20 9L22 19L9 22Z" />
            </svg>,
          )}
          {basic(
            "polycurve",
            "Curved Polygon",
            <svg viewBox="0 0 28 28">
              <path d="M5 23C20 27 25 19 18 13S12 3 9 8C5 11 15 16 5 23Z" />
            </svg>,
          )}
        </div>
      )}
      {header("document", "Shapes")}
      {open.document && shapes(BASIC_SHAPES)}
      {header("electrical", "Axis, Grid")}
      {open.electrical && (
        <>
          <div className="labeled-shape-grid coordinate-shapes">
            {COORDINATE_SHAPES.map((shape) => (
              <button
                title={shape.label}
                aria-label={shape.label}
                className={`labeled-shape${activeTool === `shape:${shape.id}` ? " active" : ""}`}
                key={shape.id}
                onClick={() => onSelect(`shape:${shape.id}`)}
              >
                <svg viewBox="0 0 110 110">
                  <path
                    transform="translate(5 5)"
                    d={shape.path}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="3"
                  />
                </svg>
                <span>{shape.label}</span>
              </button>
            ))}
          </div>
        </>
      )}
      {header("plot", "Plot")}
      {open.plot && (
        <div className="plot-tools">
          {(
            [
              ["function", "Function Plot"],
              ["surface", "Function 3d Plot"],
              ["scatter", "Scatter Plot"],
              ["line", "Line Plot"],
              ["area", "Area Plot"],
              ["bar", "Bar Plot"],
              ["pie", "Pie Plot"],
              ["parametric", "Parametric Plot"],
            ] as const
          ).map(([kind, label]) => (
            <button key={kind} title={label} onClick={() => onPlot(kind)}>
              <svg viewBox="0 0 42 34">
                <path
                  d="M4 3V29H40M4 23L12 16L22 21L30 9L38 4"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.1"
                />
              </svg>
              <span>{label}</span>
            </button>
          ))}
        </div>
      )}
      {header("image", "Image, Free Drawing")}
      {open.image && (
        <div className="general-tools">
          <button
            className="shape-button"
            title="Image"
            aria-label="Image"
            onClick={onImage}
          >
            <svg viewBox="0 0 28 28">
              <path d="M3 5H25V23H3ZM5 20L11 12L16 17L20 13L24 20" />
              <circle cx="20" cy="9" r="2" />
            </svg>
          </button>
          {basic(
            "freehand",
            "Free Drawing",
            <svg viewBox="0 0 28 28">
              <path d="M6 23L4 24L5 20L19 4L24 9ZM17 6L22 11M5 20L9 23" />
            </svg>,
          )}
        </div>
      )}
    </aside>
  );
}
