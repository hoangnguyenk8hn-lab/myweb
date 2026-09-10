"use client";
import { useState } from "react";
import { DEFAULT_IMAGE_OPTIONS, type ImageOptions } from "./currentExporters";
export function ExportDialog({
  onExport,
  onClose,
  width,
  height,
}: {
  onExport: (options: ImageOptions) => Promise<void>;
  onClose: () => void;
  width: number;
  height: number;
}) {
  const [options, setOptions] = useState(DEFAULT_IMAGE_OPTIONS),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <div className="modal-shade">
      <section
        className="small-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Export Image"
      >
        <div className="dialog-heading">
          Export Image
          <button onClick={onClose} aria-label="Close export">
            ×
          </button>
        </div>
        <div className="dialog-content">
          <label>
            Format
            <select
              value={options.format}
              onChange={(e) =>
                setOptions({
                  ...options,
                  format: e.target.value as ImageOptions["format"],
                })
              }
            >
              <option value="png">PNG</option>
              <option value="jpeg">JPEG</option>
              <option value="svg">SVG (vector)</option>
            </select>
          </label>
          {options.format !== "svg" && (
            <label>
              Scale
              <select
                value={options.scale}
                onChange={(e) =>
                  setOptions({ ...options, scale: Number(e.target.value) })
                }
              >
                {[1, 2, 3, 4].map((n) => (
                  <option key={n} value={n}>
                    {n}× — {width * n} × {height * n} px
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="dialog-check">
            <input
              type="checkbox"
              checked={options.transparent}
              disabled={options.format === "jpeg"}
              onChange={(e) =>
                setOptions({ ...options, transparent: e.target.checked })
              }
            />
            Transparent Background
          </label>
          <label className="dialog-check">
            <input
              type="checkbox"
              checked={options.grid}
              onChange={(e) =>
                setOptions({ ...options, grid: e.target.checked })
              }
            />
            Include Grid
          </label>
          {error && <p className="error-message">{error}</p>}
        </div>
        <footer className="dialog-actions">
          <button onClick={onClose}>Cancel</button>
          <button
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await onExport(options);
                onClose();
              } catch (e) {
                setError(e instanceof Error ? e.message : "Export failed.");
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? "Exporting…" : "Download"}
          </button>
        </footer>
      </section>
    </div>
  );
}
