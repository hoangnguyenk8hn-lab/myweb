import type { DiagramDocument } from "./types";

const DATABASE = "diagram-draw-assets";
const STORE = "images";
const PREFIX = "asset:";
const dataUrlCache = new Map<string, Promise<string | null>>();
const EMBEDDED_IMAGE =
  /^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/;

export const isImageAssetReference = (value: string) =>
  /^asset:[a-zA-Z0-9_-]+$/.test(value);

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE))
        request.result.createObjectStore(STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function withStore<T>(
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const database = await openDatabase();
  try {
    return await new Promise<T>((resolve, reject) => {
      const request = action(database.transaction(STORE, mode).objectStore(STORE));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } finally {
    database.close();
  }
}

function id() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

export async function storeImageAsset(blob: Blob): Promise<string> {
  const reference = `${PREFIX}${id()}`;
  await withStore("readwrite", (store) => store.put(blob, reference));
  return reference;
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

async function dataUrlToBlob(value: string) {
  const response = await fetch(value);
  if (!response.ok) throw new Error("Invalid embedded image data.");
  return response.blob();
}

export function resolveImageAsset(reference?: string): Promise<string | null> {
  if (!reference) return Promise.resolve(null);
  if (!isImageAssetReference(reference)) return Promise.resolve(reference);
  let cached = dataUrlCache.get(reference);
  if (!cached) {
    cached = withStore<Blob | undefined>("readonly", (store) =>
      store.get(reference),
    ).then((blob) => (blob ? blobToDataUrl(blob) : null));
    dataUrlCache.set(reference, cached);
  }
  return cached;
}

/** Move legacy embedded base64 payloads into IndexedDB before validation/save. */
export async function externalizeDocumentImages(
  document: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  if (!Array.isArray(document.elements)) return document;
  let changed = false;
  const elements = await Promise.all(
    document.elements.map(async (value) => {
      if (!value || typeof value !== "object") return value;
      const element = value as Record<string, unknown>;
      const href = element.imageHref;
      if (
        element.type !== "image" ||
        typeof href !== "string" ||
        !EMBEDDED_IMAGE.test(href) ||
        href.length > 17_000_000
      )
        return element;
      const reference = await storeImageAsset(await dataUrlToBlob(href));
      changed = true;
      return { ...element, imageHref: reference };
    }),
  );
  return changed ? { ...document, elements } : document;
}

/** JSON exports stay portable even though autosave/history keep only asset ids. */
export async function portableDocument(
  document: DiagramDocument,
): Promise<DiagramDocument> {
  const elements = await Promise.all(
    document.elements.map(async (element) => {
      if (element.type !== "image" || !element.imageHref) return element;
      const href = await resolveImageAsset(element.imageHref);
      if (!href) throw new Error("An image asset is missing from this browser.");
      return { ...element, imageHref: href };
    }),
  );
  return { ...document, elements };
}
