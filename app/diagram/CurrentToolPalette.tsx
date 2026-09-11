"use client";
import { useState } from "react";
import {
  BASIC_SHAPES,
  COORDINATE_SHAPES,
  shapePath,
  type ShapeDefinition,
} from "./shapes";
import { ToolIcon } from "./catalog";
import type { ConstructionCommand } from "./constructionCommands";
import type { DiagramTool, PlotSettings } from "./types";

export type GuidedConstructionTool = Exclude<ConstructionCommand, "detach">;

const CONSTRUCTION_OVERLAY_CSS = `
  .drawing-main { position: relative; }
  .drawing-main > [role="status"][aria-live="polite"] {
    position: absolute !important;
    top: 44px;
    left: 50%;
    z-index: 24;
    width: max-content;
    max-width: calc(100% - 24px);
    min-height: 32px !important;
    transform: translateX(-50%);
    padding: 5px 8px 5px 10px !important;
    border: 1px solid #ccd9e8 !important;
    border-radius: 6px;
    background: rgba(255, 255, 255, 0.97) !important;
    box-shadow: 0 2px 8px #0000001f;
    color: #31445a !important;
    white-space: nowrap;
  }
  .drawing-main > [role="status"][aria-live="polite"] > button {
    min-width: 24px;
    height: 24px;
    padding: 0 7px;
    border: 1px solid #d5dde7;
    border-radius: 4px;
    background: #fff;
    color: #617084;
  }
  .drawing-main > [role="status"][aria-live="polite"] > button:hover {
    background: #f2f5f8;
  }
`;

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

function ConstructionIcon({ tool }: { tool: GuidedConstructionTool }) {
  if (tool === "point-on-line")
    return (
      <svg viewBox="0 0 42 34" aria-hidden="true">
        <path d="M5 27L37 7" fill="none" stroke="currentColor" strokeWidth="1.7" />
        <circle cx="23" cy="16" r="3.2" fill="currentColor" />
      </svg>
    );
  if (tool === "point-on-circle")
    return (
      <svg viewBox="0 0 42 34" aria-hidden="true">
        <circle cx="21" cy="17" r="11" fill="none" stroke="currentColor" strokeWidth="1.5" />
        <circle cx="30.5" cy="11.5" r="3.2" fill="currentColor" />
      </svg>
    );
  if (tool === "intersection")
    return (
      <svg viewBox="0 0 42 34" aria-hidden="true">
        <circle cx="16" cy="17" r="10" fill="none" stroke="currentColor" strokeWidth="1.5" />
        <circle cx="26" cy="17" r="10" fill="none" stroke="currentColor" strokeWidth="1.5" />
        <circle cx="21" cy="8.4" r="2.5" fill="currentColor" />
        <circle cx="21" cy="25.6" r="2.5" fill="currentColor" />
      </svg>
    );
  return (
    <svg viewBox="0 0 42 34" aria-hidden="true">
      <circle cx="28" cy="17" r="9" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="6" cy="27" r="2.4" fill="currentColor" />
      <path d="M6 27L22.8 9.7" fill="none" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

export function CurrentToolPalette({
  activeTool,
  activeConstruction,
  onSelect,
  onConstructionSelect,
  onImage,
  onPlot,
}: {
  activeTool: DiagramTool;
  activeConstruction: GuidedConstructionTool | null;
  onSelect: (tool: DiagramTool) => void;
  onConstructionSelect: (tool: GuidedConstructionTool) => void;
  onImage: () => void;
  onPlot: (kind: PlotSettings["kind"]) => void;
}) {
  const [open, setOpen] = useState<Record<string, boolean>>({
    general: true,
    construct: true,
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
      className={`shape-button${activeTool === tool && !activeConstruction ? " active" : ""}`}
      key={tool}
      title={label}
      aria-label={label}
      aria-pressed={activeTool === tool && !activeConstruction}
      onClick={() => onSelect(tool)}
    >
      {content ?? <ToolIcon tool={tool} size={22} />}
    </button>
  );
  const constructions: Array<{
    tool: GuidedConstructionTool;
    label: string;
    hint: string;
  }> = [
    {
      tool: "point-on-line",
      label: "Point on Line",
      hint: "Click a point and a line or curve",
    },
    {
      tool: "point-on-circle",
      label: "Point on Circle",
      hint: "Click a point and a circle or ellipse",
    },
    {
      tool: "intersection",
      label: "Intersection",
      hint: "Click two objects",
    },
    {
      tool: "tangent",
      label: "Tangent",
      hint: "Click a point and a circle or ellipse",
    },
  ];
  return (
    <aside className="shape-sidebar" aria-label="Drawing tools">
      <style>{CONSTRUCTION_OVERLAY_CSS}</style>
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
      {header("construct", "Construct")}
      {open.construct && (
        <div
          aria-label="Dynamic geometry tools"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
            gap: 2,
            padding: "5px 5px 7px",
          }}
        >
          {constructions.map(({ tool, label, hint }) => {
            const active = activeConstruction === tool;
            return (
              <button
                key={tool}
                title={hint}
                aria-label={label}
                aria-pressed={active}
                onClick={() => onConstructionSelect(tool)}
                style={{
                  minWidth: 0,
                  height: 58,
                  padding: "4px 2px 3px",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 2,
                  border: `1px solid ${active ? "#8fb4dc" : "transparent"}`,
                  borderRadius: 3,
                  background: active ? "#edf5fd" : "transparent",
                  color: active ? "#547ca8" : "#8d8d8d",
                  fontSize: 9,
                  lineHeight: 1.05,
                }}
              >
                <span style={{ width: 34, height: 28 }}>
                  <ConstructionIcon tool={tool} />
                </span>
                <span
                  style={{
                    width: "100%",
                    minHeight: 18,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    textAlign: "center",
                  }}
                >
                  {label}
                </span>
              </button>
            );
          })}
        </div>
      )}
      {header("lines", "Lines, Polygons")}
      {open.lines && (
        <div className="shape-grid line-tools">
          {basic("line", "Line")}
          {basic("curve", "Curve")}
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
