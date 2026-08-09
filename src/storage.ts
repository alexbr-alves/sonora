import type { SoundLayout, SoundPad } from "./types";

const DB_NAME = "soundpad-audio";
const STORE_NAME = "files";
const META_KEY = "soundpad:library:v1";
const LAYOUTS_KEY = "soundpad:layouts:v1";
const CURRENT_LAYOUT_KEY = "soundpad:current-layout:v1";

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function saveAudioBlob(id: string, blob: Blob): Promise<void> {
  const db = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).put(blob, id);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
  db.close();
}

export async function getAudioBlob(id: string): Promise<Blob | undefined> {
  const db = await openDatabase();
  const blob = await new Promise<Blob | undefined>((resolve, reject) => {
    const request = db.transaction(STORE_NAME).objectStore(STORE_NAME).get(id);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  db.close();
  return blob;
}

export async function deleteAudioBlob(id: string): Promise<void> {
  const db = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).delete(id);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
  db.close();
}

export function loadLibrary(): SoundPad[] {
  try {
    return JSON.parse(localStorage.getItem(META_KEY) ?? "[]") as SoundPad[];
  } catch {
    return [];
  }
}

export function saveLibrary(pads: SoundPad[]): void {
  localStorage.setItem(META_KEY, JSON.stringify(pads));
}

export function loadLayouts(pads: SoundPad[]): SoundLayout[] {
  try {
    const saved = JSON.parse(localStorage.getItem(LAYOUTS_KEY) ?? "[]") as SoundLayout[];
    if (saved.length) return saved.map((layout) => ({
      ...layout,
      rows: Math.max(1, Math.min(5, Number(layout.rows) || 3)),
      columns: Math.max(1, Math.min(5, Number(layout.columns) || 3))
    }));
  } catch {
    // Migra para o layout inicial abaixo.
  }
  return [{ id: "default", name: "Principal", rows: 3, columns: 3, padIds: pads.slice(0, 9).map((pad) => pad.id) }];
}

export function saveLayouts(layouts: SoundLayout[]): void {
  localStorage.setItem(LAYOUTS_KEY, JSON.stringify(layouts));
}

export function loadCurrentLayoutId(): string {
  return localStorage.getItem(CURRENT_LAYOUT_KEY) ?? "default";
}

export function saveCurrentLayoutId(id: string): void {
  localStorage.setItem(CURRENT_LAYOUT_KEY, id);
}
