let altDown = false;

if (typeof window !== "undefined") {
  const syncKeyboard = (event: KeyboardEvent) => {
    altDown = event.altKey;
  };
  const syncPointer = (event: PointerEvent) => {
    altDown = event.altKey;
  };
  const clear = () => {
    altDown = false;
  };

  window.addEventListener("keydown", syncKeyboard, true);
  window.addEventListener("keyup", syncKeyboard, true);
  window.addEventListener("pointerdown", syncPointer, true);
  window.addEventListener("pointermove", syncPointer, true);
  window.addEventListener("pointerup", syncPointer, true);
  window.addEventListener("blur", clear);
}

export const isAltModifierDown = () => altDown;
