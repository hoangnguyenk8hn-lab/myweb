"use client";
import { useEffect, useRef, useState, type PointerEvent } from "react";
import { Dropdown } from "./EditorControls";
import {
  clamp,
  colorCss,
  colorHex,
  hsvRgb,
  parseColor,
  rgbHsv,
  type HSV,
} from "./colorModel";
import type { FillPaint } from "./types";

const PRESETS = [
  "#cf0024",
  "#ffa8a8",
  "#000000",
  "#8c5828",
  "#7bd51d",
  "#407300",
  "#c40cde",
  "#920dff",
  "#4a90e2",
  "#48dfbd",
  "#b8e986",
  "#4a4a4a",
  "#9b9b9b",
  "#808080",
  "#ffffff",
];
const PRESET_KEY = "diagram-draw-color-presets";

function ColorField({
  label,
  value,
  onChange,
  max,
}: {
  label: string;
  value: string | number;
  onChange: (value: string) => void;
  max?: number;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <label className={`color-field ${label === "Hex" ? "hex-field" : ""}`}>
      <input
        aria-label={label}
        inputMode={label === "Hex" ? "text" : "numeric"}
        value={draft ?? value}
        onFocus={() => setDraft(String(value))}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          if (draft !== null)
            onChange(
              max === undefined
                ? draft
                : String(clamp(Number(draft) || 0, max)),
            );
          setDraft(null);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") {
            setDraft(null);
            e.currentTarget.blur();
          }
        }}
      />
      <span>{label}</span>
    </label>
  );
}

export function ColorPanel({
  value,
  onChange,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  label: string;
}) {
  const [hsv, setHsv] = useState(() => parseColor(value));
  const last = useRef(value),
    active = useRef(false);
  const [presets, setPresets] = useState(PRESETS),
    [editing, setEditing] = useState(false);
  useEffect(() => {
    if (value !== last.current) {
      setHsv(parseColor(value));
      last.current = value;
    }
  }, [value]);
  useEffect(() => {
    try {
      const p = JSON.parse(localStorage.getItem(PRESET_KEY) ?? "null");
      if (
        Array.isArray(p) &&
        p.length === 15 &&
        p.every((c) => /^#[\da-f]{6}$/i.test(c))
      )
        setPresets(p);
    } catch {}
  }, []);
  const change = (next: HSV) => {
    setHsv(next);
    const css = colorCss(next);
    last.current = css;
    onChange(css);
  };
  const plane = (e: PointerEvent<HTMLDivElement>) => {
    const b = e.currentTarget.getBoundingClientRect();
    change({
      ...hsv,
      a: hsv.a === 0 ? 1 : hsv.a,
      s: clamp((e.clientX - b.left) / b.width),
      v: 1 - clamp((e.clientY - b.top) / b.height),
    });
  };
  const rgb = hsvRgb(hsv),
    hex = colorHex(hsv);
  const numeric = (key: number, n: string) => {
    const next = [...rgb];
    next[key] = Number(n);
    change(rgbHsv(next[0], next[1], next[2], hsv.a));
  };
  return (
    <div className="color-panel">
      <div
        className="color-sv"
        data-color-plane
        style={{ backgroundColor: `hsl(${hsv.h},100%,50%)` }}
        role="group"
        aria-label={`${label} saturation and brightness`}
        onPointerDown={(e) => {
          e.preventDefault();
          active.current = true;
          e.currentTarget.setPointerCapture(e.pointerId);
          plane(e);
        }}
        onPointerMove={(e) => {
          if (active.current) plane(e);
        }}
        onPointerUp={() => {
          active.current = false;
        }}
        onPointerCancel={() => {
          active.current = false;
        }}
      >
        <div className="color-sv-white" />
        <div className="color-sv-black" />
        <span
          className="color-cursor"
          style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%` }}
        />
      </div>
      <div className="color-rails">
        <div className="color-sliders">
          <input
            className="hue-slider"
            aria-label={`${label} Hue`}
            type="range"
            min="0"
            max="359.9"
            step="0.1"
            value={hsv.h}
            onChange={(e) => change({ ...hsv, h: +e.target.value })}
          />
          <div className="alpha-checker">
            <input
              className="alpha-slider"
              style={{
                background: `linear-gradient(to right,transparent,#${hex})`,
              }}
              aria-label={`${label} Alpha`}
              type="range"
              min="0"
              max="100"
              step="1"
              value={Math.round(hsv.a * 100)}
              onChange={(e) => change({ ...hsv, a: +e.target.value / 100 })}
            />
          </div>
        </div>
        <span className="color-current checker">
          <span style={{ background: colorCss(hsv) }} />
        </span>
      </div>
      <div className="color-fields">
        <ColorField
          label="Hex"
          value={hex.toUpperCase()}
          onChange={(s) => {
            if (/^#?[\da-f]{6}$/i.test(s))
              change({
                ...parseColor(s.startsWith("#") ? s : "#" + s),
                a: hsv.a,
              });
          }}
        />
        {["R", "G", "B"].map((c, i) => (
          <ColorField
            key={c}
            label={c}
            value={rgb[i]}
            max={255}
            onChange={(s) => numeric(i, s)}
          />
        ))}
        <ColorField
          label="A"
          value={Math.round(hsv.a * 100)}
          max={100}
          onChange={(s) => change({ ...hsv, a: +s / 100 })}
        />
      </div>
      <div className="color-presets" aria-label="Preset colors">
        {presets.map((c, i) => (
          <button
            key={i}
            type="button"
            title={editing ? `Replace preset ${i + 1} with current color` : c}
            aria-label={editing ? `Replace preset ${i + 1}` : `${label} ${c}`}
            style={{ background: c }}
            className={c.toLowerCase() === `#${hex}` ? "selected" : ""}
            onClick={() => {
              if (editing) {
                const p = presets.map((p, j) => (j === i ? `#${hex}` : p));
                setPresets(p);
                try {
                  localStorage.setItem(PRESET_KEY, JSON.stringify(p));
                } catch {}
              } else change({ ...parseColor(c), a: hsv.a === 0 ? 1 : hsv.a });
            }}
          />
        ))}
      </div>
      <button
        className="change-presets"
        aria-pressed={editing}
        onClick={() => setEditing(!editing)}
      >
        {editing
          ? "Done — click a swatch to replace it"
          : "Change Preset Colors"}
      </button>
    </div>
  );
}

export function ColorControl({
  label,
  value,
  onChange,
  kind = "stroke",
  paint,
  onPaintChange,
}: {
  label: string;
  value: string;
  onChange: (color: string) => void;
  kind?: "stroke" | "fill" | "text";
  paint?: FillPaint;
  onPaintChange?: (paint: FillPaint | undefined) => void;
}) {
  const [tab, setTab] = useState<"basic" | "gradient" | "pattern">(
    paint?.kind ?? "basic",
  );
  const [stop, setStop] = useState<"from" | "to">("from"),
    [part, setPart] = useState<"foreground" | "background">("foreground");
  useEffect(() => setTab(paint?.kind ?? "basic"), [paint?.kind]);
  const gradient: Extract<FillPaint, { kind: "gradient" }> =
    paint?.kind === "gradient"
      ? paint
      : {
          kind: "gradient",
          type: "linear",
          from: value === "transparent" ? "#ffffff" : value,
          to: "#4a90e2",
          angle: 0,
        };
  const pattern: Extract<FillPaint, { kind: "pattern" }> =
    paint?.kind === "pattern"
      ? paint
      : {
          kind: "pattern",
          type: "diagonal",
          foreground: "#000000",
          background: value === "transparent" ? "transparent" : value,
          size: 8,
        };
  const color =
    tab === "gradient"
      ? gradient[stop]
      : tab === "pattern"
        ? pattern[part]
        : value;
  const change = (v: string) =>
    tab === "gradient"
      ? onPaintChange?.({ ...gradient, [stop]: v })
      : tab === "pattern"
        ? onPaintChange?.({ ...pattern, [part]: v })
        : onChange(v);
  const preview =
    paint?.kind === "gradient"
      ? `linear-gradient(${paint.angle}deg,${paint.from},${paint.to})`
      : paint?.kind === "pattern"
        ? paint.foreground
        : value;
  return (
    <Dropdown
      title={label}
      className="color-picker"
      label={
        <span className="color-trigger">
          {kind === "text" ? (
            <i>A</i>
          ) : (
            <svg viewBox="0 0 24 20">
              <path
                d={
                  kind === "fill"
                    ? "M4 11L12 3L19 10L11 18ZM3 4L12 13M19 13Q24 18 19 18Q16 18 19 13Z"
                    : "M5 14L16 3L20 7L9 18L4 19ZM13 6L17 10"
                }
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
              />
            </svg>
          )}
          <span
            className="color-underline"
            style={{
              background:
                preview === "transparent"
                  ? "linear-gradient(135deg,#fff 42%,#c44 43%,#c44 57%,#fff 58%)"
                  : preview,
            }}
          />
        </span>
      }
    >
      {kind === "fill" && (
        <div className="color-tabs" role="tablist" aria-label="Fill type">
          {(["basic", "gradient", "pattern"] as const).map((t) => (
            <button
              key={t}
              role="tab"
              aria-selected={tab === t}
              onClick={() => {
                setTab(t);
                onPaintChange?.(
                  t === "basic"
                    ? undefined
                    : t === "gradient"
                      ? gradient
                      : pattern,
                );
              }}
            >
              {t[0].toUpperCase() + t.slice(1)}
            </button>
          ))}
          <button
            title="Close color picker"
            aria-label="Close color picker"
            data-close-menu
          >
            ×
          </button>
        </div>
      )}
      <button
        className="no-color-row"
        onClick={() => {
          onChange("transparent");
          onPaintChange?.(undefined);
          setTab("basic");
        }}
      >
        No Color
      </button>
      {tab === "gradient" && (
        <div className="paint-options">
          <select
            aria-label="Gradient type"
            value={gradient.type}
            onChange={(e) =>
              onPaintChange?.({
                ...gradient,
                type: e.target.value as "linear" | "radial",
              })
            }
          >
            <option value="linear">Linear</option>
            <option value="radial">Radial</option>
          </select>
          <label>
            Angle{" "}
            <input
              aria-label="Gradient angle"
              type="number"
              min="0"
              max="360"
              value={gradient.angle}
              onChange={(e) =>
                onPaintChange?.({
                  ...gradient,
                  angle: clamp(+e.target.value, 360),
                })
              }
            />
          </label>
          <div className="paint-stops">
            {(["from", "to"] as const).map((s) => (
              <button
                key={s}
                aria-pressed={stop === s}
                onClick={() => setStop(s)}
              >
                <span style={{ background: gradient[s] }} />
                {s === "from" ? "Start" : "End"}
              </button>
            ))}
          </div>
        </div>
      )}
      {tab === "pattern" && (
        <div className="paint-options">
          <select
            aria-label="Pattern type"
            value={pattern.type}
            onChange={(e) =>
              onPaintChange?.({
                ...pattern,
                type: e.target.value as typeof pattern.type,
              })
            }
          >
            {["diagonal", "crosshatch", "dots", "grid"].map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
          <label>
            Spacing{" "}
            <input
              aria-label="Pattern spacing"
              type="number"
              min="2"
              max="40"
              value={pattern.size}
              onChange={(e) =>
                onPaintChange?.({
                  ...pattern,
                  size: Math.max(2, clamp(+e.target.value, 40)),
                })
              }
            />
          </label>
          <div className="paint-stops">
            {(["foreground", "background"] as const).map((s) => (
              <button
                key={s}
                aria-pressed={part === s}
                onClick={() => setPart(s)}
              >
                <span style={{ background: pattern[s] }} />
                {s === "foreground" ? "Pattern" : "Background"}
              </button>
            ))}
          </div>
        </div>
      )}
      <ColorPanel
        key={`${tab}-${tab === "gradient" ? stop : part}`}
        label={label}
        value={color}
        onChange={change}
      />
    </Dropdown>
  );
}
