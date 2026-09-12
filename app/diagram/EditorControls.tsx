"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { ArrowHead } from "./types";

export function Dropdown({
  label,
  title,
  children,
  className = "",
}: {
  label: ReactNode;
  title: string;
  children: ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [offset, setOffset] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const popover = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) {
      setOffset(0);
      return;
    }
    const fit = () => {
      const x = root.current?.getBoundingClientRect().left ?? 0;
      const width = popover.current?.offsetWidth ?? 0;
      setOffset(
        Math.max(8 - x, Math.min(0, window.innerWidth - 8 - x - width)),
      );
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [open]);
  useEffect(() => {
    const close = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("pointerdown", close, true);
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("pointerdown", close, true);
      window.removeEventListener("keydown", key);
    };
  }, []);
  return (
    <div ref={root} className={`control-dropdown ${className}`}>
      <button
        title={title}
        aria-label={title}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        {label}
      </button>
      {open && (
        <div
          ref={popover}
          className="control-popover"
          style={{ left: offset }}
          onClick={(e) => {
            if ((e.target as Element).closest("[data-close-menu]"))
              setOpen(false);
          }}
        >
          {children}
        </div>
      )}
    </div>
  );
}

export function NumberControl({
  label,
  value,
  onChange,
  min = -9999,
  max = 9999,
  step = 1,
  icon,
  unit,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  min?: number;
  max?: number;
  step?: number;
  icon?: ReactNode;
  unit?: string;
}) {
  const drag = useRef<{ x: number; value: number } | null>(null);
  const [draft, setDraft] = useState<string | null>(null);
  const bound = (n: number) => Math.max(min, Math.min(max, n));
  return (
    <label className="number-control" title={label}>
      {icon && (
        <span
          className="number-drag"
          onPointerDown={(e) => {
            e.preventDefault();
            drag.current = { x: e.clientX, value };
            e.currentTarget.setPointerCapture(e.pointerId);
          }}
          onPointerMove={(e) => {
            if (drag.current)
              onChange(
                bound(
                  Math.round(
                    (drag.current.value + (e.clientX - drag.current.x) * step) /
                      step,
                  ) * step,
                ),
              );
          }}
          onPointerUp={() => {
            drag.current = null;
          }}
        >
          {icon}
        </span>
      )}
      <input
        type="text"
        inputMode="decimal"
        aria-label={label}
        value={draft ?? String(+value.toFixed(2))}
        onFocus={() => setDraft(String(+value.toFixed(2)))}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          const n = Number(draft);
          if (draft !== null && Number.isFinite(n)) onChange(bound(n));
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
      {unit && <span>{unit}</span>}
    </label>
  );
}

const MARKERS: { type: ArrowHead; symbol: string; name: string }[] = [
  { type: "none", symbol: "∅", name: "No marker" },
  { type: "arrow", symbol: "▶", name: "Arrow" },
  { type: "open", symbol: "❯", name: "Chevron" },
  { type: "arc", symbol: ")", name: "Arc" },
  { type: "bar", symbol: "|", name: "Bar" },
  { type: "double-bar", symbol: "‖", name: "Double bar" },
  { type: "double-open", symbol: "»", name: "Double chevron" },
  { type: "bar-open", symbol: "↦", name: "Bar and chevron" },
  { type: "cross", symbol: "×", name: "Cross" },
  { type: "plus", symbol: "+", name: "Plus" },
  { type: "dot", symbol: "●", name: "Dot" },
  { type: "circle", symbol: "○", name: "Circle" },
  {
    type: "right-angle-inside-left",
    symbol: "⌜",
    name: "Right angle upper-left",
  },
  {
    type: "right-angle-inside-right",
    symbol: "⌞",
    name: "Right angle lower-left",
  },
  {
    type: "right-angle-outside-left",
    symbol: "⌝",
    name: "Right angle upper-right",
  },
  {
    type: "right-angle-outside-right",
    symbol: "⌟",
    name: "Right angle lower-right",
  },
];
export function MarkerPicker({
  label,
  value,
  size,
  onChange,
  onSizeChange,
}: {
  label: string;
  value: ArrowHead;
  size: number;
  onChange: (type: ArrowHead) => void;
  onSizeChange: (size: number) => void;
}) {
  const current = MARKERS.find((m) => m.type === value) ?? MARKERS[0];
  return (
    <Dropdown
      title={label}
      className="marker-picker"
      label={
        <span className="marker-button-label">
          <small>{label === "Middle Marker" ? "Middle" : label}</small>
          <span className="marker-preview" aria-hidden="true">
            {current.symbol}
          </span>
          <span className="small-triangle" />
        </span>
      }
    >
      <div className="marker-grid" aria-label={`${label} symbols`}>
        {MARKERS.map((m) => (
          <button
            key={m.type}
            aria-label={`${label} ${m.name}`}
            title={m.name}
            aria-pressed={value === m.type}
            className={value === m.type ? "selected" : ""}
            onClick={() => onChange(m.type)}
          >
            {m.symbol}
          </button>
        ))}
      </div>
      <SizeSlider
        label={`${label} size`}
        value={size}
        onChange={onSizeChange}
      />
    </Dropdown>
  );
}
export function SizeSlider({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (size: number) => void;
}) {
  return (
    <label className="size-slider">
      Size{" "}
      <input
        type="range"
        aria-label={label}
        min="0.1"
        max="2"
        step="0.1"
        value={value}
        onChange={(e) => onChange(+e.target.value)}
      />
      <output>{value.toFixed(1)} px</output>
    </label>
  );
}
export function ThicknessControl({
  value,
  onChange,
}: {
  value: number;
  onChange: (n: number) => void;
}) {
  return (
    <Dropdown
      title="Stroke Thickness"
      label={
        <svg width="25" height="22">
          <path d="M8 3L12 7L16 3M8 19L12 15L16 19" fill="#bbb" />
          <path d="M2 11H23" stroke="currentColor" strokeWidth="1" />
        </svg>
      }
    >
      <label className="size-slider thickness-slider">
        Size
        <input
          aria-label="Stroke size"
          type="range"
          min="0.1"
          max="2"
          step="0.1"
          value={Math.max(0.1, Math.min(2, value))}
          onChange={(e) => onChange(+e.target.value)}
        />
        <NumberControl
          label="Stroke thickness in pixels"
          value={value}
          min={0.1}
          max={2}
          step={0.1}
          unit="px"
          onChange={onChange}
        />
      </label>
    </Dropdown>
  );
}
export function GridIcon({ major = false }: { major?: boolean }) {
  return (
    <svg width="23" height="23" viewBox="0 0 24 24">
      <path
        d="M3 3H21V21H3ZM3 9H21M3 15H21M9 3V21M15 3V21"
        fill="none"
        stroke={major ? "#888" : "#bcbcbc"}
        strokeWidth={major ? 1.2 : 0.7}
      />
    </svg>
  );
}
