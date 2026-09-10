"use client";
import {
  Dropdown,
  GridIcon,
  MarkerPicker,
  NumberControl,
  ThicknessControl,
  SizeSlider,
} from "./EditorControls";
import { ColorControl } from "./ColorPicker";
import { DEFAULT_INTERSECTION_MARKER_SIZE } from "./intersections";
import { isCurve, LINE_TYPES, TEXT_TYPES } from "./sceneGeometry";
import type {
  DiagramDocument,
  DiagramElement,
  ElementStyle,
  GridSettings,
} from "./types";

interface Props {
  document: DiagramDocument;
  selected: DiagramElement[];
  canUndo: boolean;
  canRedo: boolean;
  onGrid: (patch: Partial<GridSettings>) => void;
  onStyle: (patch: Partial<ElementStyle>) => void;
  onPatch: (patch: Partial<DiagramElement>) => void;
  onCommand: (command: string) => void;
  onBegin: () => void;
  onEnd: () => void;
}
const Sep = () => <span className="toolbar-separator" />;
function Dash({
  value,
  onChange,
}: {
  value: ElementStyle["dash"];
  onChange: (dash: ElementStyle["dash"]) => void;
}) {
  return (
    <Dropdown
      title="Line Style"
      label={
        <svg width="27" height="20">
          <path
            d="M2 10H25"
            stroke="currentColor"
            strokeDasharray={
              value === "solid" ? undefined : value === "dashed" ? "5 3" : "1 3"
            }
          />
          <path d="M22 17H27L24.5 20Z" fill="#888" />
        </svg>
      }
    >
      {(["solid", "dashed", "dotted"] as const).map((d) => (
        <button
          className="menu-row"
          data-close-menu
          key={d}
          onClick={() => onChange(d)}
        >
          <svg width="100" height="20">
            <path
              d="M5 10H95"
              stroke="currentColor"
              strokeDasharray={
                d === "solid" ? undefined : d === "dashed" ? "6 4" : "1 3"
              }
            />
          </svg>
        </button>
      ))}
    </Dropdown>
  );
}
export function EditorToolbar({
  document: d,
  selected,
  canUndo,
  canRedo,
  onGrid,
  onStyle,
  onPatch,
  onCommand,
  onBegin,
  onEnd,
}: Props) {
  const e = selected[0],
    line = e && LINE_TYPES.has(e.type),
    text = e && TEXT_TYPES.has(e.type),
    intersectionDefaultPatch =
      e?.intersectionMarkerSize === undefined && e?.intersectionSize === undefined
        ? { intersectionMarkerSize: DEFAULT_INTERSECTION_MARKER_SIZE }
        : {};
  const command = (name: string) => () => onCommand(name);
  return (
    <div
      className="drawing-toolbar"
      onPointerDownCapture={(ev) => {
        if (
          (ev.target as Element).closest(
            'input[type="range"],[data-color-plane]',
          )
        )
          onBegin();
      }}
      onPointerUpCapture={onEnd}
      onPointerCancelCapture={onEnd}
    >
      <span className="toolbar-grip" />
      {!e ? (
        <>
          <button
            title="Show Grid"
            aria-label="Show Grid"
            aria-pressed={d.grid.visible}
            className={d.grid.visible ? "pressed" : ""}
            onClick={() => onGrid({ visible: !d.grid.visible })}
          >
            <GridIcon />
          </button>
          <button
            title="Show Major Grid"
            aria-label="Show Major Grid"
            aria-pressed={!!d.grid.major}
            className={d.grid.major ? "pressed" : ""}
            onClick={() => onGrid({ major: !d.grid.major })}
          >
            <GridIcon major />
          </button>
          <Sep />
          <NumberControl
            label="Grid Size"
            value={d.grid.size}
            min={2}
            max={100}
            unit="px"
            icon={<span className="green-arrows">↔</span>}
            onChange={(size) => onGrid({ size })}
          />
          <Sep />
          <Dropdown
            title="Options"
            label={
              <>
                Options <span className="small-triangle" />
              </>
            }
          >
            <label className="menu-check">
              <input
                type="checkbox"
                checked={d.grid.snap}
                onChange={(ev) => onGrid({ snap: ev.target.checked })}
              />
              Snap to Grid
            </label>
            <label className="menu-check">
              <input
                type="checkbox"
                checked={d.grid.editOnly}
                onChange={(ev) => onGrid({ editOnly: ev.target.checked })}
              />
              Only Show Grid on Editing
            </label>
            <label className="menu-check">
              <input
                type="checkbox"
                checked={d.grid.snapShapes ?? true}
                onChange={(ev) => onGrid({ snapShapes: ev.target.checked })}
              />
              Snap to Other Shapes
            </label>
          </Dropdown>
          <Sep />
          <span className="export-label">Export:</span>
          <div className="split-control">
            <button onClick={command("image-export")}>Image</button>
            <Dropdown
              title="Image export formats"
              label={<span className="small-triangle" />}
            >
              {["PNG", "JPEG", "SVG"].map((format) => (
                <button
                  className="menu-row"
                  data-close-menu
                  key={format}
                  onClick={command(`export-${format.toLowerCase()}`)}
                >
                  {format}
                </button>
              ))}
            </Dropdown>
          </div>
          <div className="split-control">
            <button onClick={command("tikz")}>Tikz</button>
            <Dropdown
              title="TikZ export options"
              label={<span className="small-triangle" />}
            >
              <button
                className="menu-row"
                data-close-menu
                onClick={command("tikz")}
              >
                View / Copy TikZ
              </button>
              <button
                className="menu-row"
                data-close-menu
                onClick={command("export-tex")}
              >
                Download LaTeX (.tex)
              </button>
            </Dropdown>
          </div>
        </>
      ) : (
        <>
          {line && (
            <>
              <Dropdown
                title="Line Type"
                label={
                  <svg width="26" height="21">
                    <path
                      d={isCurve(e) ? "M3 17Q13 -8 23 17" : "M3 15L23 6"}
                      fill="none"
                      stroke="currentColor"
                    />
                  </svg>
                }
              >
                {["Straight", "Curve"].map((kind) => (
                  <button
                    key={kind}
                    data-close-menu
                    className="menu-row"
                    onClick={() =>
                      onPatch({
                        type:
                          kind === "Straight"
                            ? e.endHead !== "none"
                              ? "arrow"
                              : "line"
                            : e.endHead !== "none"
                              ? "curved-arrow"
                              : "curve",
                      })
                    }
                  >
                    {kind}
                  </button>
                ))}
              </Dropdown>
              <Sep />
              <MarkerPicker
                label="Tail"
                value={e.startHead ?? "none"}
                size={e.startMarkerSize ?? (e.markerSize ?? 9) / 10}
                onChange={(startHead) => onPatch({ startHead })}
                onSizeChange={(startMarkerSize) => onPatch({ startMarkerSize })}
              />
              <Dash
                value={e.style.dash}
                onChange={(dash) => onStyle({ dash })}
              />
              <MarkerPicker
                label="Head"
                value={e.endHead ?? "none"}
                size={e.endMarkerSize ?? (e.markerSize ?? 9) / 10}
                onChange={(endHead) => onPatch({ endHead })}
                onSizeChange={(endMarkerSize) => onPatch({ endMarkerSize })}
              />
              <Sep />
              <MarkerPicker
                label="Middle Marker"
                value={e.midHead ?? "none"}
                size={e.midMarkerSize ?? (e.markerSize ?? 9) / 10}
                onChange={(midHead) => onPatch({ midHead })}
                onSizeChange={(midMarkerSize) => onPatch({ midMarkerSize })}
              />
              <Dropdown
                title="Line Break"
                label={
                  <svg width="25" height="20">
                    <path
                      d="M1 10H9M17 10H25M11 5L9 15M17 5L15 15"
                      stroke="currentColor"
                    />
                  </svg>
                }
              >
                <label className="menu-check">
                  <input
                    type="checkbox"
                    checked={!!e.breakSize}
                    onChange={(ev) =>
                      onPatch({ breakSize: ev.target.checked ? 18 : 0 })
                    }
                  />
                  Break Line
                </label>
                <div className="menu-number">
                  Size{" "}
                  <NumberControl
                    label="Break Size"
                    value={e.breakSize ?? 0}
                    onChange={(breakSize) => onPatch({ breakSize })}
                    min={0}
                    max={100}
                    unit="px"
                  />
                </div>
                <div className="menu-number">
                  Position{" "}
                  <NumberControl
                    label="Break Position"
                    value={e.breakPosition ?? 50}
                    onChange={(breakPosition) => onPatch({ breakPosition })}
                    min={5}
                    max={95}
                    unit="%"
                  />
                </div>
              </Dropdown>
              <button
                className={
                  e.boxed
                    ? "toolbar-text-button pressed"
                    : "toolbar-text-button"
                }
                title="Boxed: resize and rotate the whole line. Turn off to edit vertices."
                aria-pressed={!!e.boxed}
                onClick={() => onPatch({ boxed: !e.boxed })}
              >
                Boxed
              </button>
              <Sep />
            </>
          )}
          {text && (
            <>
              <Dropdown
                title="Text Border"
                label={
                  <svg width="25" height="23">
                    <rect
                      x="3"
                      y="2"
                      width="19"
                      height="18"
                      fill="none"
                      stroke="currentColor"
                      strokeDasharray={
                        e.textBorder === "none" ? "2 2" : undefined
                      }
                    />
                    <text x="12" y="16" fontSize="14" textAnchor="middle">
                      A
                    </text>
                  </svg>
                }
              >
                {(["none", "rectangle", "ellipse", "circle"] as const).map(
                  (textBorder) => (
                    <button
                      className="menu-row"
                      data-close-menu
                      key={textBorder}
                      onClick={() => onPatch({ textBorder })}
                    >
                      {textBorder.charAt(0).toUpperCase() + textBorder.slice(1)}
                    </button>
                  ),
                )}
              </Dropdown>
              <Sep />
            </>
          )}
          <ThicknessControl
            value={e.style.strokeWidth}
            onChange={(strokeWidth) => onStyle({ strokeWidth })}
          />
          <ColorControl
            label="Stroke Color"
            value={e.style.stroke}
            onChange={(stroke) => onStyle({ stroke })}
          />
          {!line && (
            <>
              <ColorControl
                label="Fill Color"
                kind="fill"
                value={e.style.fill}
                onChange={(fill) => onStyle({ fill, fillPaint: undefined })}
                paint={e.style.fillPaint}
                onPaintChange={(fillPaint) => onStyle({ fillPaint })}
              />
              <Dash
                value={e.style.dash}
                onChange={(dash) => onStyle({ dash })}
              />
            </>
          )}
          <Sep />
          {(!line || e.boxed) && (
            <>
              <NumberControl
                label="Rotation"
                value={e.rotation}
                onChange={(rotation) => onPatch({ rotation })}
                min={-360}
                max={360}
                unit="°"
                icon={<span className="rotation-icon">⟳</span>}
              />
              <NumberControl
                label="Skew"
                value={e.skewX ?? 0}
                onChange={(skewX) => onPatch({ skewX })}
                min={-80}
                max={80}
                unit="°"
                icon={
                  <svg width="22" height="20">
                    <path
                      d="M7 4H20L15 16H2Z"
                      stroke="#998939"
                      fill="#ead886"
                    />
                  </svg>
                }
              />
              <Sep />
            </>
          )}
          <Dropdown
            title="Intersection"
            className="intersection-settings"
            label={
              <>
                <svg width="25" height="22" viewBox="0 0 25 22">
                  <path d="M2 19L23 3M3 3L22 19" stroke="currentColor" />
                  <circle
                    cx="12.5"
                    cy="11"
                    r="3"
                    fill={e.intersection ? "#555" : "white"}
                    stroke="currentColor"
                  />
                </svg>
                <span className="small-triangle" />
              </>
            }
          >
            <p className="intersection-help">
              Bật Intersection để tạo các điểm bắt tại chỗ cắt nhau. Chọn ∅ để
              ẩn dấu giao điểm nhưng vẫn giữ khả năng bắt điểm.
            </p>
            <label className="menu-check">
              <input
                type="checkbox"
                checked={selected.every(
                  (item) => !!item.intersection && !item.blockIntersection,
                )}
                onChange={(ev) =>
                  onPatch({
                    intersection: ev.target.checked,
                    intersectionWith: undefined,
                    blockIntersection: false,
                    ...(ev.target.checked ? intersectionDefaultPatch : {}),
                  })
                }
              />
              Intersection
            </label>
            <div className="intersection-symbols">
              {(["circle", "dot", "cross"] as const).map((kind) => (
                <button
                  key={kind}
                  title={kind}
                  aria-label={`Intersection ${kind}`}
                  aria-pressed={
                    !e.intersectionHidden &&
                    (e.intersectionKind ?? "circle") === kind
                  }
                  onClick={() =>
                    onPatch({
                      intersection: true,
                      intersectionWith: undefined,
                      blockIntersection: false,
                      intersectionKind: kind,
                      intersectionHidden: false,
                      ...intersectionDefaultPatch,
                    })
                  }
                >
                  {kind === "circle" ? "○" : kind === "dot" ? "●" : "×"}
                </button>
              ))}
              <button
                title="Ẩn điểm giao (chỉ bắt điểm)"
                aria-label="Intersection hidden"
                aria-pressed={!!e.intersectionHidden}
                onClick={() =>
                  onPatch({
                    intersection: true,
                    intersectionWith: undefined,
                    blockIntersection: false,
                    intersectionHidden: true,
                    ...intersectionDefaultPatch,
                  })
                }
              >
                ∅
              </button>
            </div>
            {!e.intersectionHidden && (
              <SizeSlider
                label="Intersection size"
                value={Math.max(
                  0.1,
                  Math.min(
                    2,
                    e.intersectionMarkerSize ??
                      (e.intersectionSize === undefined
                        ? DEFAULT_INTERSECTION_MARKER_SIZE
                        : e.intersectionSize / 4),
                  ),
                )}
                onChange={(intersectionMarkerSize) =>
                  onPatch({ intersectionMarkerSize })
                }
              />
            )}
          </Dropdown>
          <button
            title="Block Intersection: hide this object's intersection marks"
            aria-label="Block Intersection"
            aria-pressed={!!e.blockIntersection}
            className={e.blockIntersection ? "pressed" : ""}
            onClick={() =>
              onPatch({
                blockIntersection: !e.blockIntersection,
                intersection: false,
              })
            }
          >
            <svg width="25" height="22" viewBox="0 0 25 22">
              <path d="M2 19L23 3M3 3L22 19" stroke="currentColor" />
              <circle cx="12.5" cy="11" r="4" fill="white" stroke="#c65c5c" />
              <path d="M9 14L16 7" stroke="#c65c5c" />
            </svg>
          </button>
          {text && (
            <>
              <ColorControl
                label="Text Color"
                kind="text"
                value={e.textColor ?? "#000000"}
                onChange={(textColor) => onPatch({ textColor })}
              />
              <NumberControl
                label="Font Size"
                value={e.fontSize ?? 17}
                onChange={(fontSize) => onPatch({ fontSize })}
                min={6}
                max={180}
                unit="px"
              />
              <button title="Edit Text" onClick={command("edit-text")}>
                Edit
              </button>
              <Sep />
            </>
          )}
          {e.type === "plot" && (
            <button
              className="toolbar-text-button"
              onClick={command("edit-plot")}
            >
              Settings
            </button>
          )}
          {[
            "regular-polygon",
            "star",
            "hexagon",
            "octagon",
            "decagon",
            "pentagon",
          ].includes(e.shape ?? "") && (
            <NumberControl
              label={
                e.shape === "regular-polygon"
                  ? "Number of Sides"
                  : "Sides / Points"
              }
              value={
                e.parameters?.sides ??
                (e.shape === "regular-polygon" ||
                e.shape === "star" ||
                e.shape === "pentagon"
                  ? 5
                  : e.shape === "hexagon"
                    ? 6
                    : e.shape === "octagon"
                      ? 8
                      : 10)
              }
              onChange={(sides) =>
                onPatch({
                  parameters: { ...e.parameters, sides: Math.round(sides) },
                })
              }
              min={3}
              max={e.shape === "regular-polygon" ? 100 : 40}
              icon={e.shape === "regular-polygon" ? "Sides" : "#"}
            />
          )}
        </>
      )}
      <Dropdown
        title="More Actions"
        className="actions-dropdown"
        label={<span className="ellipsis">···</span>}
      >
        <button
          className="menu-row"
          data-close-menu
          disabled={!canUndo}
          onClick={command("undo")}
        >
          Undo <kbd>Ctrl Z</kbd>
        </button>
        <button
          className="menu-row"
          data-close-menu
          disabled={!canRedo}
          onClick={command("redo")}
        >
          Redo <kbd>Ctrl Shift Z</kbd>
        </button>
        <hr />
        {e && (
          <>
            <button
              className="menu-row"
              data-close-menu
              onClick={command("copy")}
            >
              Copy <kbd>Ctrl C</kbd>
            </button>
            <button
              className="menu-row"
              data-close-menu
              onClick={command("duplicate")}
            >
              Duplicate <kbd>Ctrl D</kbd>
            </button>
            <button
              className="menu-row"
              data-close-menu
              disabled={selected.length < 2}
              onClick={command("group")}
            >
              Group <kbd>Ctrl G</kbd>
            </button>
            <button
              className="menu-row"
              data-close-menu
              disabled={!e.groupId}
              onClick={command("ungroup")}
            >
              Ungroup <kbd>Ctrl Shift G</kbd>
            </button>
            <button
              className="menu-row"
              data-close-menu
              onClick={command("front")}
            >
              Bring to Front
            </button>
            <button
              className="menu-row"
              data-close-menu
              onClick={command("back")}
            >
              Send to Back
            </button>
            {selected.length > 1 && (
              <>
                <hr />
                {[
                  "left",
                  "center",
                  "right",
                  "top",
                  "middle",
                  "bottom",
                  "horizontal",
                  "vertical",
                ].map((align) => (
                  <button
                    key={align}
                    className="menu-row"
                    data-close-menu
                    onClick={command(`align-${align}`)}
                  >
                    {align === "horizontal" || align === "vertical"
                      ? "Distribute"
                      : "Align"}{" "}
                    {align}
                  </button>
                ))}
              </>
            )}
            <hr />
            <button
              className="menu-row"
              data-close-menu
              onClick={() => onPatch({ locked: !e.locked })}
            >
              {e.locked ? "Unlock" : "Lock"}
            </button>
            <div className="menu-number">
              Opacity{" "}
              <NumberControl
                label="Opacity"
                min={0}
                max={100}
                value={Math.round(e.style.opacity * 100)}
                onChange={(opacity) => onStyle({ opacity: opacity / 100 })}
                unit="%"
              />
            </div>
            <hr />
          </>
        )}
        <button className="menu-row" data-close-menu onClick={command("paste")}>
          Paste <kbd>Ctrl V</kbd>
        </button>
        <button
          className="menu-row"
          data-close-menu
          onClick={command("select-all")}
        >
          Select All <kbd>Ctrl A</kbd>
        </button>
        <hr />
        <button className="menu-row" data-close-menu onClick={command("new")}>
          New Drawing
        </button>
        <button className="menu-row" data-close-menu onClick={command("demo")}>
          Load Example
        </button>
        <button
          className="menu-row"
          data-close-menu
          onClick={command("import")}
        >
          Open JSON…
        </button>
        <button className="menu-row" data-close-menu onClick={command("json")}>
          Save JSON
        </button>
        <button
          className="menu-row"
          data-close-menu
          onClick={command("canvas-size")}
        >
          Drawing Size…
        </button>
        <hr />
        <button className="menu-row" data-close-menu onClick={command("help")}>
          Keyboard Shortcuts
        </button>
      </Dropdown>
      {e && (
        <button
          className="delete-tool"
          title="Remove Selection"
          aria-label="Remove Selection"
          onClick={command("delete")}
        >
          <svg width="23" height="23">
            <circle cx="11.5" cy="11.5" r="9" fill="#e24646" />
            <path d="M8 8L15 15M15 8L8 15" stroke="white" strokeWidth="1.5" />
          </svg>
        </button>
      )}
    </div>
  );
}