import type { CharacterPackJson } from "@/src/game/load/mergeAssetManifestExtras";
import type {
  AssetManifestAnimEntry,
  AssetManifestLoadEntry,
} from "@/src/game/types";

const DB_NAME = "nagibatop-character-editor";
const DB_VERSION = 1;
const STORE = "profiles";

export type CharacterEditorRole = "npc" | "mob";

/**
 * Сохранённый в IndexedDB персонаж редактора.
 * `gameId` — ключ в manifest.units (NPC) или manifest.mobs (mobVisualId).
 */
export type CharacterProfileRecord = {
  slug: string;
  displayName: string;
  role: CharacterEditorRole;
  gameId: string;
  pack: CharacterPackJson;
  updatedAt: number;
};

function dedupeLoadEntries(chunks: AssetManifestLoadEntry[][]): AssetManifestLoadEntry[] {
  const map = new Map<string, AssetManifestLoadEntry>();
  for (const chunk of chunks) {
    for (const e of chunk) {
      map.set(e.key, e);
    }
  }
  return [...map.values()];
}

function mergeAnimations(
  base: AssetManifestAnimEntry[],
  pack: AssetManifestAnimEntry[] | undefined
): AssetManifestAnimEntry[] {
  if (!pack?.length) return base;
  const packKeys = new Set(pack.map((a) => a.key));
  return [...base.filter((a) => !packKeys.has(a.key)), ...pack];
}

/** Слияние двух паков: второй перезаписывает совпадающие ключи load и animation.key */
export function mergeTwoCharacterPacks(
  a: CharacterPackJson,
  b: CharacterPackJson
): CharacterPackJson {
  const load = dedupeLoadEntries([a.load ?? [], b.load ?? []]);
  const animations = mergeAnimations(a.animations ?? [], b.animations);
  const units = { ...(a.units ?? {}), ...(b.units ?? {}) };
  const mobs = { ...(a.mobs ?? {}), ...(b.mobs ?? {}) };
  return { load, animations, units, mobs };
}

export function mergeAllProfilesToPack(
  profiles: CharacterProfileRecord[]
): CharacterPackJson {
  return profiles.reduce<CharacterPackJson>(
    (acc, p) => mergeTwoCharacterPacks(acc, p.pack ?? emptyPack()),
    emptyPack()
  );
}

export function emptyPack(): CharacterPackJson {
  return { load: [], animations: [], units: {}, mobs: {} };
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "slug" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB open failed"));
  });
}

export async function listProfiles(): Promise<CharacterProfileRecord[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const st = tx.objectStore(STORE);
    const r = st.getAll();
    r.onsuccess = () => {
      const rows = (r.result ?? []) as CharacterProfileRecord[];
      rows.sort((x, y) => y.updatedAt - x.updatedAt);
      resolve(rows);
    };
    r.onerror = () => reject(r.error);
  });
}

export async function getProfile(slug: string): Promise<CharacterProfileRecord | undefined> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const r = tx.objectStore(STORE).get(slug);
    r.onsuccess = () => resolve(r.result as CharacterProfileRecord | undefined);
    r.onerror = () => reject(r.error);
  });
}

export async function putProfile(record: CharacterProfileRecord): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put({
      ...record,
      updatedAt: Date.now(),
    });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function deleteProfile(slug: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(slug);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export function sanitizeSlug(raw: string): string {
  const s = raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
  return s.slice(0, 48) || "character";
}

export function pickUniqueSlug(base: string, taken: Set<string>): string {
  let slug = sanitizeSlug(base);
  if (!taken.has(slug)) return slug;
  let n = 2;
  while (taken.has(`${slug}_${n}`)) n++;
  return `${slug}_${n}`;
}
