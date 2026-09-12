import {
  CURRENT_DOCUMENT_VERSION,
  type ArrowHead,
  type RightAngleMarker,
} from "./types";
import { isRightAngleMarker } from "./lineMarkers";

type JsonObject = Record<string, unknown>;
type Migration = (document: JsonObject) => JsonObject;

const migrateV1ToV2: Migration = (document) => ({
  ...document,
  version: 2,
  elements: Array.isArray(document.elements)
    ? document.elements.map((value) => {
        if (!value || typeof value !== "object") return value;
        const element = value as JsonObject;
        const endHead = element.endHead;
        const startHead = element.startHead;
        const isLegacyMarker = (head: unknown) =>
          typeof head === "string" && isRightAngleMarker(head as ArrowHead);
        const legacy = isLegacyMarker(endHead)
          ? { marker: endHead as RightAngleMarker, at: 1 }
          : isLegacyMarker(startHead)
            ? { marker: startHead as RightAngleMarker, at: 0 }
            : undefined;
        if (!legacy || element.rightAngle) return element;
        return {
          ...element,
          rightAngle: legacy,
          ...(isLegacyMarker(endHead) ? { endHead: "none" } : {}),
          ...(isLegacyMarker(startHead) ? { startHead: "none" } : {}),
        };
      })
    : document.elements,
});

const MIGRATIONS: Record<number, Migration> = { 1: migrateV1ToV2 };

/** Upgrade a supported historical JSON value without mutating the source. */
export function migrateDocument(value: unknown): JsonObject | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  let document = structuredClone(value) as JsonObject;
  let version = document.version;
  if (!Number.isInteger(version) || typeof version !== "number") return null;
  if (version < 1 || version > CURRENT_DOCUMENT_VERSION) return null;
  while (version < CURRENT_DOCUMENT_VERSION) {
    const migrate = MIGRATIONS[version];
    if (!migrate) return null;
    document = migrate(document);
    version = document.version;
    if (!Number.isInteger(version) || typeof version !== "number") return null;
  }
  return document;
}
