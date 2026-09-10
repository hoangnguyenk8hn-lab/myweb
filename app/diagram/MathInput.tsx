"use client";
import { useEffect, useRef } from "react";
import type { MathfieldElement } from "mathlive";
export function MathInput({
  value,
  onChange,
  onDone,
  onCancel,
}: {
  value: string;
  onChange: (value: string) => void;
  onDone: () => void;
  onCancel: () => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const callbacks = useRef({ onChange, onDone, onCancel });
  useEffect(() => {
    callbacks.current = { onChange, onDone, onCancel };
  }, [onChange, onDone, onCancel]);
  const initial = useRef(value);
  useEffect(() => {
    let field: MathfieldElement | undefined;
    let cancelled = false;
    import("mathlive").then(({ MathfieldElement }) => {
      if (cancelled || !host.current) return;
      MathfieldElement.fontsDirectory = "/mathlive/fonts";
      MathfieldElement.soundsDirectory = null;
      field = new MathfieldElement();
      field.value = initial.current;
      field.mathVirtualKeyboardPolicy = "manual";
      field.smartFence = true;
      field.setAttribute("aria-label", "Edit math formula");
      field.addEventListener("input", () =>
        callbacks.current.onChange(field!.value),
      );
      field.addEventListener("keydown", (event) => {
        event.stopPropagation();
        if (event.key === "Escape") {
          event.preventDefault();
          callbacks.current.onCancel();
        }
        if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
          event.preventDefault();
          callbacks.current.onDone();
        }
      });
      host.current.replaceChildren(field);
      field.focus();
      field.select();
    });
    return () => {
      cancelled = true;
      field?.remove();
    };
  }, []);
  return (
    <div
      className="math-input-host"
      ref={host}
      onPointerDown={(e) => e.stopPropagation()}
    />
  );
}
