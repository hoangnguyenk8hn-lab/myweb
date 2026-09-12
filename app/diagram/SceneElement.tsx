"use client";
import { useEffect, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { ArrowHead, DiagramElement } from "./types";
import { SHAPE_MAP, shapePath } from "./shapes";
import {
  absolutePoints,
  center,
  linePoint,
  linePath,
  LINE_TYPES,
  markerDimension,
  pointRadius,
  polycurvePath,
  sceneBounds,
  elementShapeId,
  elementTransform,
  TEXT_TYPES,
} from "./sceneGeometry";
import { MathFormula } from "./MathFormula";
import { PlotGraphic } from "./PlotGraphic";
import { PaintDefinition } from "./PaintDefinition";
import {
  hasArrowHead,
  isRightAngleMarker,
  rightAngleDecorationPath,
} from "./lineMarkers";
import { resolveImageAsset } from "./imageAssets";

export function MarkerGlyph({
  type,
  color = "currentColor",
}: {
  type: ArrowHead;
  color?: string;
}) {
  const common = { stroke: color, strokeWidth: 1, fill: "none" };
  switch (type) {
    case "arrow":
      return <path d="M1 1L9 5L1 9L3 5Z" fill={color} />;
    case "open":
      return <path d="M1 1L9 5L1 9" {...common} />;
    case "bar":
      return <path d="M7 0V10" {...common} />;
    case "double-bar":
      return <path d="M4 0V10M8 0V10" {...common} />;
    case "double-open":
      return <path d="M0 1L5 5L0 9M4 1L9 5L4 9" {...common} />;
    case "bar-open":
      return <path d="M1 0V10M3 1L9 5L3 9" {...common} />;
    case "circle":
      return <circle cx="5" cy="5" r="3.4" {...common} fill="white" />;
    case "dot":
      return <circle cx="5" cy="5" r="3.5" fill={color} />;
    case "cross":
      return <path d="M1 1L9 9M1 9L9 1" {...common} />;
    case "plus":
      return <path d="M0 5H10M5 0V10" {...common} />;
    case "arc":
      return <path d="M3 0Q10 5 3 10" {...common} />;
    case "right-angle-inside-left":
      return <path d="M5 5V1H1V5" {...common} />;
    case "right-angle-inside-right":
      return <path d="M5 5V9H1V5" {...common} />;
    case "right-angle-outside-left":
      return <path d="M5 5V1H9V5" {...common} />;
    case "right-angle-outside-right":
      return <path d="M5 5V9H9V5" {...common} />;
    default:
      return null;
  }
}

export function SceneElement({
  element: e,
  onPointerDown,
  onDoubleClick,
  interactive = true,
}: {
  element: DiagramElement;
  onPointerDown?: (
    event: ReactPointerEvent<SVGGElement>,
    element: DiagramElement,
  ) => void;
  onDoubleClick?: (element: DiagramElement) => void;
  interactive?: boolean;
}) {
  const [resolvedImageHref, setResolvedImageHref] = useState<string | null>(
    e.type === "image" && e.imageHref?.startsWith("data:") ? e.imageHref : null,
  );
  useEffect(() => {
    let active = true;
    if (e.type !== "image") {
      setResolvedImageHref(null);
      return;
    }
    void resolveImageAsset(e.imageHref)
      .then((href) => {
        if (active) setResolvedImageHref(href);
      })
      .catch(() => {
        if (active) setResolvedImageHref(null);
      });
    return () => {
      active = false;
    };
  }, [e.type, e.imageHref]);
  const s = e.style,
    c = center(e),
    b = sceneBounds(e),
    shapeId = elementShapeId(e),
    directVectorStroke =
      LINE_TYPES.has(e.type) ||
      TEXT_TYPES.has(e.type) ||
      ["polyline", "polycurve", "freehand"].includes(e.type),
    smoothScaledCircle = !directVectorStroke && shapeId === "circle",
    circleScale = smoothScaledCircle
      ? Math.max(1e-8, (Math.abs(e.width) + Math.abs(e.height)) / 200)
      : 1;
  const id = e.id.replace(/[^a-zA-Z0-9_-]/g, "");
  const paintId = `paint-${id}`;
  const common = {
    stroke: s.stroke === "transparent" ? "none" : s.stroke,
    fill: s.fillPaint
      ? `url(#${paintId})`
      : s.fill === "transparent"
        ? "none"
        : s.fill,
    strokeWidth: smoothScaledCircle ? s.strokeWidth / circleScale : s.strokeWidth,
    strokeDasharray:
      s.dash === "dashed" ? "6 4" : s.dash === "dotted" ? "1 3" : undefined,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    shapeRendering: "geometricPrecision" as const,
    vectorEffect:
      directVectorStroke || smoothScaledCircle
        ? undefined
        : ("non-scaling-stroke" as const),
  };
  const transform = elementTransform(e);
  const markerSize = markerDimension(e, "mid");
  const startHead = isRightAngleMarker(e.startHead) ? "none" : e.startHead ?? "none";
  const endHead = isRightAngleMarker(e.endHead) ? "none" : e.endHead ?? "none";
  // Construction marks and user-selected Tail/Head marks are independent.
  // Keep right-angle heads out of SVG markerStart/markerEnd so Line does not
  // become Arrow, then draw each corner at its own position and marker size.
  const endpointRightAngles = [
    isRightAngleMarker(e.startHead)
      ? {
          decoration: { marker: e.startHead, at: 0 },
          size: markerDimension(e, "start"),
          key: `tail-${e.startHead}`,
        }
      : null,
    isRightAngleMarker(e.endHead)
      ? {
          decoration: { marker: e.endHead, at: 1 },
          size: markerDimension(e, "end"),
          key: `head-${e.endHead}`,
        }
      : null,
  ].filter((entry): entry is NonNullable<typeof entry> => !!entry);
  const rightAngles = [
    ...endpointRightAngles,
    e.rightAngle &&
    !endpointRightAngles.some(
      ({ decoration }) => Math.abs(decoration.at - e.rightAngle!.at) < 1e-8,
    )
      ? {
          decoration: e.rightAngle,
          size: markerDimension(e, "end"),
          key: `construction-${e.rightAngle.at}-${e.rightAngle.marker}`,
        }
      : null,
  ].filter((entry): entry is NonNullable<typeof entry> => !!entry);
  const marker = (position: string, head: ArrowHead) => (
    <marker
      key={position}
      id={`${position}-${id}`}
      viewBox="0 0 10 10"
      refX="8"
      refY="5"
      markerWidth={markerDimension(e, position === "tail" ? "start" : "end")}
      markerHeight={markerDimension(e, position === "tail" ? "start" : "end")}
      markerUnits="userSpaceOnUse"
      orient="auto-start-reverse"
    >
      <MarkerGlyph type={head} color={s.stroke} />
    </marker>
  );
  const middle = linePoint(e, (e.breakPosition ?? 50) / 100);
  let content: React.ReactNode;

  if (e.type === "point" || e.shape === "point") {
    const r = pointRadius(e);
    content = (
      <>
        <circle
          cx={e.x}
          cy={e.y}
          r={r}
          fill={s.stroke === "transparent" ? "none" : s.stroke}
          stroke="none"
          shapeRendering="geometricPrecision"
        />
        {interactive && (
          <circle
            cx={e.x}
            cy={e.y}
            r={Math.max(6, r + 4)}
            fill="transparent"
            stroke="none"
            pointerEvents="all"
            data-hit-area
          />
        )}
      </>
    );
  } else if (LINE_TYPES.has(e.type)) {
    const d = linePath(e);
    const before = linePoint(
        e,
        Math.max(0, (e.breakPosition ?? 50) / 100 - 0.01),
      ),
      after = linePoint(e, Math.min(1, (e.breakPosition ?? 50) / 100 + 0.01)),
      angle =
        (Math.atan2(after.y - before.y, after.x - before.x) * 180) / Math.PI;
    content = (
      <>
        <defs>
          {marker("tail", startHead)}
          {marker("head", endHead)}
          {(e.breakSize ?? 0) > 0 && (
            <mask
              id={`break-${id}`}
              maskUnits="userSpaceOnUse"
              x={b.x - 100}
              y={b.y - 100}
              width={b.width + 200}
              height={b.height + 200}
            >
              <rect
                x={b.x - 100}
                y={b.y - 100}
                width={b.width + 200}
                height={b.height + 200}
                fill="white"
              />
              <circle
                cx={middle.x}
                cy={middle.y}
                r={(e.breakSize ?? 0) / 2}
                fill="black"
              />
            </mask>
          )}
        </defs>
        <path
          d={d}
          {...common}
          fill="none"
          markerStart={
            hasArrowHead(startHead)
              ? `url(#tail-${id})`
              : undefined
          }
          markerEnd={
            hasArrowHead(endHead) ? `url(#head-${id})` : undefined
          }
          mask={(e.breakSize ?? 0) > 0 ? `url(#break-${id})` : undefined}
        />
        {rightAngles.map(({ decoration, size, key }) => (
          <path
            key={key}
            d={rightAngleDecorationPath(e, decoration, size)}
            fill="none"
            stroke={s.stroke}
            strokeWidth={s.strokeWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
            pointerEvents="none"
          />
        ))}
        {e.midHead && e.midHead !== "none" && (
          <g
            transform={`translate(${middle.x} ${middle.y}) rotate(${angle}) translate(${-markerSize / 2} ${-markerSize / 2}) scale(${markerSize / 10})`}
          >
            <MarkerGlyph type={e.midHead} color={s.stroke} />
          </g>
        )}
        {interactive && (
          <path
            d={d}
            fill="none"
            stroke="transparent"
            strokeWidth={Math.max(10, s.strokeWidth + 6)}
            vectorEffect="non-scaling-stroke"
            pointerEvents="stroke"
            data-hit-area
          />
        )}
      </>
    );
  } else if (TEXT_TYPES.has(e.type)) {
    const border =
      e.textBorder ?? (e.type === "boxed-text" ? "rectangle" : "none");
    content = (
      <>
        {border === "ellipse" || border === "circle" ? (
          <ellipse
            cx={c.x}
            cy={c.y}
            rx={
              border === "circle"
                ? Math.max(e.width, e.height) / 2
                : e.width / 2
            }
            ry={
              border === "circle"
                ? Math.max(e.width, e.height) / 2
                : e.height / 2
            }
            {...common}
          />
        ) : border === "rectangle" ? (
          <rect
            x={e.x}
            y={e.y}
            width={Math.abs(e.width)}
            height={Math.abs(e.height)}
            rx={e.cornerRadius ?? 0}
            {...common}
          />
        ) : (
          (s.fill !== "transparent" || s.fillPaint) && (
            <rect
              x={e.x}
              y={e.y}
              width={Math.abs(e.width)}
              height={Math.abs(e.height)}
              fill={common.fill}
            />
          )
        )}
        {(e.textMode ?? (e.type === "text" ? "math" : "text")) === "math" ? (
          <MathFormula
            value={e.text ?? ""}
            x={c.x}
            y={c.y}
            fontSize={e.fontSize ?? 17}
            color={e.textColor ?? "#222222"}
          />
        ) : (
          <text
            x={c.x}
            y={
              c.y -
              ((e.text ?? "").split("\n").length - 1) * (e.fontSize ?? 17) * 0.6
            }
            textAnchor="middle"
            dominantBaseline="central"
            fill={e.textColor ?? "#222222"}
            fontSize={e.fontSize ?? 17}
            fontFamily={e.fontFamily ?? "Arial"}
            fontWeight={e.bold ? 700 : 400}
            fontStyle={e.italic ? "italic" : "normal"}
          >
            {(e.text ?? "").split("\n").map((line, i) => (
              <tspan x={c.x} dy={i ? (e.fontSize ?? 17) * 1.2 : 0} key={i}>
                {line}
              </tspan>
            ))}
          </text>
        )}
      </>
    );
  } else if (e.type === "image")
    content = (
      <image
        href={resolvedImageHref ?? undefined}
        data-image-asset={e.imageHref}
        x={e.x}
        y={e.y}
        width={e.width}
        height={e.height}
        preserveAspectRatio="none"
      />
    );
  else if (e.type === "plot")
    content = (
      <g
        transform={`translate(${e.x} ${e.y}) scale(${e.width / 100} ${e.height / 100})`}
      >
        <PlotGraphic settings={e.plot} id={id} />
      </g>
    );
  else if (["polyline", "polycurve", "freehand"].includes(e.type)) {
    const points = absolutePoints(e);
    const d =
      e.type === "polycurve"
        ? polycurvePath(points)
        : points.map((p, i) => `${i ? "L" : "M"}${p.x} ${p.y}`).join(" ") +
          (e.type === "polyline" ? "Z" : "");
    content = (
      <>
        <path
          d={d}
          {...common}
          fill={e.type === "freehand" ? "none" : common.fill}
          pointerEvents="none"
        />
        {interactive && (
          <path
            d={d}
            fill="none"
            stroke="transparent"
            strokeWidth="10"
            vectorEffect="non-scaling-stroke"
            pointerEvents="stroke"
            data-hit-area
          />
        )}
      </>
    );
  } else {
    const definition = SHAPE_MAP[shapeId];
    content = (
      <g
        transform={`translate(${e.x} ${e.y}) scale(${e.width / 100} ${e.height / 100})`}
      >
        <path
          d={shapePath(shapeId, e.parameters)}
          {...common}
          fill={definition?.open ? "none" : common.fill}
          fillRule="evenodd"
          pointerEvents="none"
        />
        {interactive && (
          <path
            d={shapePath(shapeId, e.parameters)}
            fill="none"
            stroke="transparent"
            strokeWidth={Math.max(10, s.strokeWidth + 6)}
            vectorEffect="non-scaling-stroke"
            pointerEvents="stroke"
            data-hit-area
          />
        )}
      </g>
    );
  }
  return (
    <g
      data-element-id={e.id}
      data-type={e.type}
      opacity={s.opacity}
      transform={transform}
      onPointerDown={(event) => onPointerDown?.(event, e)}
      onDoubleClick={() => onDoubleClick?.(e)}
      className={interactive ? "scene-element" : undefined}
    >
      <PaintDefinition paint={s.fillPaint} id={paintId} bounds={b} />
      {content}
      {interactive &&
        (TEXT_TYPES.has(e.type) || e.type === "image" || e.type === "plot") && (
        <rect
          x={b.x}
          y={b.y}
          width={Math.max(b.width, 8)}
          height={Math.max(b.height, 8)}
          fill="transparent"
          stroke="none"
          pointerEvents="all"
          data-hit-area
        />
      )}
    </g>
  );
}
