import { createJSONStorage, type StateStorage } from "zustand/middleware";
import { getDesktopBridge, isElectronClient } from "@/src/game/desktop";

/** Четыре стора игрового прогресса (один «снимок» для слота / загрузки). */
export const GAME_PROFILE_SNAPSHOT_KEYS = [
  "last-summon-save-v1",
  "last-summon-quest-v1",
  "last-summon-lore-journal-v1",
  "last-summon-npc-dialogue-progress-v1",
] as const;

export type GameProfileSnapshotKey = (typeof GAME_PROFILE_SNAPSHOT_KEYS)[number];

/** Все ключи, которые пишутся в один файл профиля Electron. */
export const ELECTRON_PROFILE_PERSIST_KEYS = [
  ...GAME_PROFILE_SNAPSHOT_KEYS,
  "last-summon-slots-v1",
] as const;

export type ElectronProfilePersistKey =
  (typeof ELECTRON_PROFILE_PERSIST_KEYS)[number];

const LS_MIGRATION_FLAG = "last-summon-electron-profile-migrated-v1";

type ProfileBundle = {
  formatVersion: 1;
  migratedFromLocalStorage?: boolean;
  updatedAt?: number;
  entries: Record<string, string>;
};

const PROFILE_FORMAT_VERSION = 1 as const;

const noopServerStorage: StateStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
};

let loaded = false;
let loadWait: Promise<void> | null = null;
const entries: Record<string, string> = {};

function isAllowedPersistKey(name: string): name is ElectronProfilePersistKey {
  return (ELECTRON_PROFILE_PERSIST_KEYS as readonly string[]).includes(name);
}

function readLocalStorageSnapshot(): Record<string, string> {
  if (typeof window === "undefined") return {};
  const snap: Record<string, string> = {};
  for (const key of ELECTRON_PROFILE_PERSIST_KEYS) {
    try {
      const v = window.localStorage.getItem(key);
      if (v != null && v !== "") snap[key] = v;
    } catch {
      /* ignore */
    }
  }
  return snap;
}

function clearLocalStorageSnapshot(keys: readonly string[]): void {
  if (typeof window === "undefined") return;
  for (const key of keys) {
    try {
      window.localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  }
}

function parseBundleJson(raw: string): ProfileBundle | null {
  try {
    const o = JSON.parse(raw) as unknown;
    if (!o || typeof o !== "object") return null;
    const rec = o as Record<string, unknown>;
    if (rec.formatVersion !== 1) return null;
    const ent = rec.entries;
    if (!ent || typeof ent !== "object") return null;
    const entriesOut: Record<string, string> = {};
    for (const [k, v] of Object.entries(ent as Record<string, unknown>)) {
      if (!isAllowedPersistKey(k)) continue;
      if (typeof v !== "string") continue;
      entriesOut[k] = v;
    }
    return {
      formatVersion: 1,
      migratedFromLocalStorage:
        typeof rec.migratedFromLocalStorage === "boolean"
          ? rec.migratedFromLocalStorage
          : undefined,
      updatedAt:
        typeof rec.updatedAt === "number" && Number.isFinite(rec.updatedAt)
          ? rec.updatedAt
          : undefined,
      entries: entriesOut,
    };
  } catch {
    return null;
  }
}

async function pullFromMain(): Promise<string | null> {
  const b = getDesktopBridge();
  const read = b?.profileRead;
  if (!read) return null;
  try {
    const res = await read();
    if (!res.ok) {
      console.warn("[LastSummon] profileRead failed:", res.error);
      return null;
    }
    return res.data;
  } catch (e) {
    console.warn("[LastSummon] profileRead threw:", e);
    return null;
  }
}

async function pushToMain(json: string): Promise<boolean> {
  const b = getDesktopBridge();
  const write = b?.profileWrite;
  if (!write) return false;
  try {
    const res = await write(json);
    if (!res.ok) {
      console.warn("[LastSummon] profileWrite failed:", res.error);
      return false;
    }
    return true;
  } catch (e) {
    console.warn("[LastSummon] profileWrite threw:", e);
    return false;
  }
}

async function ensureLoadedFromDiskOrMigrate(): Promise<void> {
  if (loaded) return;
  if (!loadWait) {
    loadWait = (async () => {
      try {
        const raw = await pullFromMain();
        if (raw && raw.trim()) {
          const parsed = parseBundleJson(raw);
          if (parsed) {
            Object.assign(entries, parsed.entries);
            loaded = true;
            return;
          }
        }

        const fromLs = readLocalStorageSnapshot();
        const hasLs = Object.keys(fromLs).length > 0;
        const alreadyMigrated =
          typeof window !== "undefined" &&
          window.localStorage.getItem(LS_MIGRATION_FLAG) === "1";

        if (hasLs && !alreadyMigrated) {
          const bundle: ProfileBundle = {
            formatVersion: PROFILE_FORMAT_VERSION,
            migratedFromLocalStorage: true,
            updatedAt: Date.now(),
            entries: { ...fromLs },
          };
          const json = JSON.stringify(bundle);
          const ok = await pushToMain(json);
          if (ok) {
            try {
              window.localStorage.setItem(LS_MIGRATION_FLAG, "1");
            } catch {
              /* ignore */
            }
            clearLocalStorageSnapshot(ELECTRON_PROFILE_PERSIST_KEYS);
            Object.assign(entries, fromLs);
            loaded = true;
            return;
          }
          Object.assign(entries, fromLs);
          loaded = true;
          return;
        }

        if (hasLs) {
          Object.assign(entries, fromLs);
        }
        loaded = true;
      } catch (e) {
        console.warn("[LastSummon] profile load failed:", e);
        loaded = true;
      } finally {
        loadWait = null;
      }
    })();
  }
  await loadWait;
}

let flushTimer: ReturnType<typeof setTimeout> | null = null;
const FLUSH_DEBOUNCE_MS = 550;
let flushChain: Promise<void> = Promise.resolve();

function buildBundleJson(): string {
  const bundle: ProfileBundle = {
    formatVersion: PROFILE_FORMAT_VERSION,
    updatedAt: Date.now(),
    entries: { ...entries },
  };
  return JSON.stringify(bundle);
}

function scheduleFlushToDisk(): void {
  if (!isElectronClient()) return;
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = setTimeout(() => {
    flushTimer = null;
    void flushElectronProfileWritesNow();
  }, FLUSH_DEBOUNCE_MS);
}

async function flushElectronProfileWritesNow(): Promise<boolean> {
  const p = flushChain.then(async (): Promise<boolean> => {
    if (!isElectronClient()) return true;
    await ensureLoadedFromDiskOrMigrate();
    return await pushToMain(buildBundleJson());
  });
  flushChain = p.then(
    () => {},
    () => {}
  );
  return p;
}

/**
 * Сбросить очередь и записать профиль на диск (выход из приложения / скрытие окна).
 * В браузере всегда `true` (файла профиля нет). В Electron — результат записи в userData.
 */
export function flushElectronProfileWrites(): Promise<boolean> {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  return flushElectronProfileWritesNow();
}

const electronProfileStateStorage: StateStorage = {
  getItem: async (name) => {
    if (!isAllowedPersistKey(name)) return null;
    await ensureLoadedFromDiskOrMigrate();
    return entries[name] ?? null;
  },
  setItem: async (name, value) => {
    if (!isAllowedPersistKey(name)) return;
    await ensureLoadedFromDiskOrMigrate();
    entries[name] = value;
    scheduleFlushToDisk();
  },
  removeItem: async (name) => {
    if (!isAllowedPersistKey(name)) return;
    await ensureLoadedFromDiskOrMigrate();
    delete entries[name];
    scheduleFlushToDisk();
  },
};

function getClientStateStorage(): StateStorage {
  if (typeof window === "undefined") return noopServerStorage;
  if (isElectronClient() && getDesktopBridge()?.profileRead) {
    return electronProfileStateStorage;
  }
  return localStorage;
}

/**
 * Хранилище для `createJSONStorage` в zustand persist: в Electron — один JSON-файл
 * в userData; в браузере — `localStorage`.
 */
export function getClientPersistJsonStorage() {
  return createJSONStorage(() => getClientStateStorage());
}

/** Сырые JSON-строки persist четырёх игровых сторов (как в `entries` профиля). */
export async function readGameSnapshotEntryStrings(): Promise<Record<
  GameProfileSnapshotKey,
  string
> | null> {
  if (typeof window === "undefined") return null;
  const storage = getClientStateStorage();
  const out = {} as Record<GameProfileSnapshotKey, string>;
  for (const key of GAME_PROFILE_SNAPSHOT_KEYS) {
    const v = await Promise.resolve(storage.getItem(key));
    if (v == null || v === "") return null;
    out[key] = v;
  }
  return out;
}

/** Записать снимок в storage (обновляет `entries` в Electron и localStorage в браузере). */
export async function writeGameSnapshotEntryStrings(
  data: Record<GameProfileSnapshotKey, string>
): Promise<void> {
  if (typeof window === "undefined") return;
  const storage = getClientStateStorage();
  for (const key of GAME_PROFILE_SNAPSHOT_KEYS) {
    await Promise.resolve(storage.setItem(key, data[key]));
  }
}
