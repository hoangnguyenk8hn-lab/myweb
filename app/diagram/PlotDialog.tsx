"use client";
import { useState } from "react";
import type { PlotSettings } from "./types";
import { DEFAULT_PLOT, compileExpression } from "./plotting";
import { PlotGraphic } from "./PlotGraphic";
export function PlotDialog({
  initial,
  onApply,
  onClose,
}: {
  initial?: PlotSettings;
  onApply: (s: PlotSettings) => void;
  onClose: () => void;
}) {
  const [s, setS] = useState<PlotSettings>(initial ?? DEFAULT_PLOT);
  const [tab, setTab] = useState("Expressions");
  const [error, setError] = useState("");
  const patch = (v: Partial<PlotSettings>) => setS({ ...s, ...v });
  const apply = (close: boolean) => {
    try {
      if (s.xMin >= s.xMax || s.yMin >= s.yMax)
        throw new Error("The axis minimum must be smaller than the maximum.");
      if (["function", "parametric", "surface"].includes(s.kind))
        s.expressions.forEach(compileExpression);
      onApply(s);
      if (close) onClose();
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Check the expression.");
    }
  };
  return (
    <div className="modal-shade" onPointerDown={(e) => e.stopPropagation()}>
      <section
        className="plot-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Plot settings"
      >
        <div className="dialog-heading">
          Plot Settings
          <button onClick={onClose} aria-label="Close plot settings">
            ×
          </button>
        </div>
        <div className="plot-dialog-body">
          <div className="plot-config">
            <div className="dialog-tabs">
              {["Expressions", "Axes", "X Axis", "Y Axis"].map((t) => (
                <button
                  className={tab === t ? "active" : ""}
                  key={t}
                  onClick={() => setTab(t)}
                >
                  {t}
                </button>
              ))}
            </div>
            {tab === "Expressions" && (
              <>
                <label>
                  Type
                  <select
                    value={s.kind}
                    onChange={(e) =>
                      patch({ kind: e.target.value as PlotSettings["kind"] })
                    }
                  >
                    {[
                      "function",
                      "parametric",
                      "surface",
                      "scatter",
                      "line",
                      "area",
                      "bar",
                      "pie",
                    ].map((k) => (
                      <option key={k}>{k}</option>
                    ))}
                  </select>
                </label>
                {["function", "parametric", "surface"].includes(s.kind) ? (
                  <>
                    <label>
                      Expressions
                      <textarea
                        aria-label="Plot expressions"
                        value={s.expressions.join("\n")}
                        onChange={(e) =>
                          patch({ expressions: e.target.value.split("\n") })
                        }
                        rows={7}
                      />
                    </label>
                    <p className="dialog-hint">
                      One expression per line. Use x, sin(x), sqrt(x), exp(x),
                      pi.
                      <br />
                      Parametric: x(t) then y(t). Surface: f(x,y).
                    </p>
                  </>
                ) : (
                  <label>
                    Points (x,y)
                    <textarea
                      aria-label="Plot data"
                      rows={9}
                      defaultValue={s.data
                        .map((p) => `${p.x}, ${p.y}`)
                        .join("\n")}
                      onChange={(e) =>
                        patch({
                          data: e.target.value
                            .split("\n")
                            .map((row) => {
                              const [x, y] = row
                                .trim()
                                .split(/[,\s]+/)
                                .map(Number);
                              return { x, y };
                            })
                            .filter(
                              (p) =>
                                Number.isFinite(p.x) && Number.isFinite(p.y),
                            ),
                        })
                      }
                    />
                  </label>
                )}
              </>
            )}
            {tab === "Axes" && (
              <>
                {(["axes", "grid", "numbers"] as const).map((key) => (
                  <label className="dialog-check" key={key}>
                    <input
                      type="checkbox"
                      checked={s[key]}
                      onChange={(e) => patch({ [key]: e.target.checked })}
                    />
                    {key === "axes"
                      ? "Show axes"
                      : key === "grid"
                        ? "Show grid"
                        : "Show numbers"}
                  </label>
                ))}
              </>
            )}
            {(tab === "X Axis" || tab === "Y Axis") && (
              <>
                {(tab === "X Axis" ? ["xMin", "xMax"] : ["yMin", "yMax"]).map(
                  (key) => (
                    <label key={key}>
                      {key.endsWith("Min") ? "Minimum" : "Maximum"}
                      <input
                        aria-label={key}
                        type="number"
                        value={s[key as "xMin"]}
                        onChange={(e) =>
                          patch({ [key]: Number(e.target.value) })
                        }
                      />
                    </label>
                  ),
                )}
              </>
            )}
            {error && (
              <p className="error-message" role="alert">
                {error}
              </p>
            )}
          </div>
          <div className="plot-preview">
            <svg viewBox="0 0 100 100">
              <PlotGraphic settings={s} id="dialog-preview" />
            </svg>
          </div>
        </div>
        <footer className="dialog-actions">
          <button onClick={onClose}>Cancel</button>
          <button onClick={() => apply(false)}>Apply</button>
          <button onClick={() => apply(true)}>Ok</button>
        </footer>
      </section>
    </div>
  );
}
