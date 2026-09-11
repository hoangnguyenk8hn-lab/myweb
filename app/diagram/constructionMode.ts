export type AssistedLineConstruction = "perpendicular" | "angle-bisector";

let assistedLineConstruction: AssistedLineConstruction = "perpendicular";

export function setAssistedLineConstruction(mode: AssistedLineConstruction) {
  assistedLineConstruction = mode;
}

export function getAssistedLineConstruction(): AssistedLineConstruction {
  return assistedLineConstruction;
}
