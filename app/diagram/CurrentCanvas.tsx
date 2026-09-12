"use client";

// Keep the public module stable while all pointer gestures live in one canvas
// interaction layer. Do not add capture handlers here: construction, snap and
// commit semantics are owned by CurrentCanvasCore.
export { CurrentCanvas } from "./CurrentCanvasCore";
