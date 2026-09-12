import { CURRENT_DOCUMENT_VERSION } from "./types";

type JsonObject = Record<string, unknown>;
type Migration = (document: JsonObject) => JsonObject;

const migrateV1ToV2: Migration = (document) => ({
  ...document,
  version: 2,
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
