"use client";
import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { SceneElement } from "./SceneElement";
import { MAX_TIKZ_CHARS, parseTikz, placeTikz } from "./tikzImport";

import type { DiagramDocument } from "./types";

const example = [
  "\\begin{tikzpicture}",
  "  \\coordinate (A) at (0,0);",
  "  \\coordinate (B) at (4,0);",
  "  \\coordinate (C) at (1,2.5);",
  "  \\draw[blue, thick, fill=blue!10] (A) -- (B) -- (C) -- cycle;",
  "  \\node[below] at (A) {$A$};",
  "  \\node[below] at (B) {$B$};",
  "  \\node[above] at (C) {$C$};",
  "\\end{tikzpicture}",
].join("\n");

export default function TikzImportDialog({
  drawing,
  onClose,
  onInsert,
}: {
  drawing: DiagramDocument;
  onClose: () => void;
  onInsert: (next: DiagramDocument, selectedIds: string[]) => void;
}) {
  const [source, setSource] = useState(""),
    [error, setError] = useState("");
  const dialog = useRef<HTMLDialogElement>(null),
    input = useRef<HTMLInputElement>(null);
  const revision = useRef(0);
  const deferred = useDeferredValue(source);
  const result = useMemo(() => {
    if (!deferred.trim()) return {};
    try {
      return { picture: parseTikz(deferred) };
    } catch (e) {
      return { message: e instanceof Error ? e.message : "Invalid TikZ." };
    }
  }, [deferred]);
  useEffect(() => {
    const el = dialog.current!;
    el.showModal();
    return () => {
      el.close();
    };
  }, []);
  function update(text: string) {
    revision.current++;
    setError("");
    setSource(text);
  }
  const picture = deferred === source && !error ? result.picture : undefined;
  const bounds = picture?.bounds;
  const message = error || (deferred === source ? result.message : "");
  return (
    <dialog
      ref={dialog}
      className="tikz-import"
      aria-labelledby="import-tikz-title"
      onKeyDown={(event) => event.stopPropagation()}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <header className="dialog-heading">
        <strong id="import-tikz-title">Import TikZ</strong>
        <button aria-label="Close import" onClick={onClose}>
          ×
        </button>
      </header>
      <div className="tikz-import-body">
        <div className="tikz-source-pane">
          <label htmlFor="tikz-input">TikZ code</label>
          <textarea
            id="tikz-input"
            autoFocus
            spellCheck={false}
            value={source}
            placeholder={"\\draw (0,0) -- (3,1);"}
            aria-invalid={!!message}
            aria-describedby="tikz-import-status"
            onChange={(e) => update(e.target.value)}
          />
          <div className="tikz-source-actions">
            <button onClick={() => input.current?.click()}>Open .tex…</button>
            <button onClick={() => update(example)}>Use example</button>
          </div>
          <input
            hidden
            type="file"
            ref={input}
            accept=".tex,.tikz,text/plain"
            onChange={async (e) => {
              const file = e.currentTarget.files?.[0];
              e.currentTarget.value = "";
              if (!file) return;
              const id = ++revision.current;
              try {
                if (file.size > MAX_TIKZ_CHARS)
                  throw new Error("Choose a file smaller than 256 KiB.");
                const text = await file.text();
                if (id === revision.current) update(text);
              } catch (failure) {
                if (id === revision.current)
                  setError(
                    failure instanceof Error
                      ? failure.message
                      : "Could not read this file.",
                  );
              }
            }}
          />
        </div>
        <div className="tikz-preview-pane">
          <strong>Preview</strong>
          <div className="tikz-preview-surface">
            {picture && bounds ? (
              <svg
                role="img"
                aria-label="TikZ preview"
                viewBox={[
                  bounds.x - 10,
                  bounds.y - 10,
                  bounds.width + 20,
                  bounds.height + 20,
                ].join(" ")}
              >
                {picture.elements.map((e) => (
                  <SceneElement key={e.id} element={e} interactive={false} />
                ))}
              </svg>
            ) : (
              <span>
                {message
                  ? "Check the code to see the preview."
                  : "Paste code or try the triangle example."}
              </span>
            )}
          </div>
        </div>
      </div>
      <p
        id="tikz-import-status"
        aria-live="polite"
        className={message ? "tikz-import-error" : ""}
      >
        {message ||
          (picture
            ? picture.elements.length +
              (picture.elements.length === 1
                ? " editable object"
                : " editable objects") +
              ". After adding, drag an edge to move a shape or select it to edit its vertices."
            : "Supports paths, circles, rectangles, Bézier curves and text or math nodes.")}
      </p>
      <footer className="dialog-actions">
        <button onClick={onClose}>Cancel</button>
        <button
          className="tikz-add"
          disabled={!picture}
          onClick={() => {
            if (!picture) return;
            try {
              onInsert(
                placeTikz(drawing, picture),
                picture.elements.length === 1 ? [picture.elements[0].id] : [],
              );
            } catch (e) {
              setError(
                e instanceof Error ? e.message : "Could not add the drawing.",
              );
            }
          }}
        >
          Add to drawing
        </button>
      </footer>
    </dialog>
  );
}
