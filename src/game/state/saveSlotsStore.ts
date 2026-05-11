import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { GameProfileSnapshotKey } from "@/src/game/saves/electronProfileStateStorage";
import {
  GAME_PROFILE_SNAPSHOT_KEYS,
  getClientPersistJsonStorage,
} from "@/src/game/saves/electronProfileStateStorage";

export const SAVE_SLOT_COUNT = 5 as const;

export type SaveSlotPayload = {
  updatedAt: number;
  entries: Record<GameProfileSnapshotKey, string>;
};

export function normalizeSlots(raw: unknown): (SaveSlotPayload | null)[] {
  const out: (SaveSlotPayload | null)[] = Array.from(
    { length: SAVE_SLOT_COUNT },
    () => null
  );
  if (!Array.isArray(raw)) return out;
  for (let i = 0; i < SAVE_SLOT_COUNT && i < raw.length; i++) {
    const x = raw[i];
    if (!x || typeof x !== "object") {
      out[i] = null;
      continue;
    }
    const o = x as Partial<SaveSlotPayload>;
    if (
      typeof o.updatedAt !== "number" ||
      !Number.isFinite(o.updatedAt) ||
      !o.entries ||
      typeof o.entries !== "object"
    ) {
      out[i] = null;
      continue;
    }
    const ent = o.entries as Record<string, string>;
    const keys: GameProfileSnapshotKey[] = [...GAME_PROFILE_SNAPSHOT_KEYS];
    let ok = true;
    const entries = {} as Record<GameProfileSnapshotKey, string>;
    for (const k of keys) {
      const v = ent[k];
      if (typeof v !== "string" || v.length === 0) {
        ok = false;
        break;
      }
      entries[k] = v;
    }
    out[i] = ok ? { updatedAt: o.updatedAt, entries } : null;
  }
  return out;
}

function awaitPersistReturn(v: void | Promise<unknown>): Promise<void> {
  return Promise.resolve(v).then(() => {});
}

export const useSaveSlotsStore = create<{
  slots: (SaveSlotPayload | null)[];
}>()(
  persist(
    () => ({
      slots: Array.from({ length: SAVE_SLOT_COUNT }, () => null),
    }),
    {
      name: "last-summon-slots-v1",
      storage: getClientPersistJsonStorage(),
      partialize: (s) => ({ slots: s.slots }),
      merge: (persisted, current) => {
        const p = persisted as Partial<{ slots: unknown }> | undefined;
        return {
          ...current,
          slots: normalizeSlots(p?.slots),
        };
      },
    }
  )
);

/** Перезаписать слот снимком четырёх persist-строк (ожидает завершения записи в storage). */
export async function overwriteSaveSlot(
  index: number,
  entries: Record<GameProfileSnapshotKey, string>
): Promise<void> {
  if (!Number.isInteger(index) || index < 0 || index >= SAVE_SLOT_COUNT) return;
  await awaitPersistReturn(
    useSaveSlotsStore.setState((s) => {
      const slots = normalizeSlots(s.slots);
      slots[index] = { updatedAt: Date.now(), entries: { ...entries } };
      return { slots };
    })
  );
}

export async function writeAutosaveSlot0FromGameSnapshot(
  entries: Record<GameProfileSnapshotKey, string>
): Promise<void> {
  await overwriteSaveSlot(0, entries);
}

export function waitForSaveSlotsHydration(): Promise<void> {
  return new Promise((resolve) => {
    const p = useSaveSlotsStore.persist;
    if (p.hasHydrated()) {
      resolve();
      return;
    }
    const unsub = p.onFinishHydration(() => {
      unsub();
      resolve();
    });
  });
}
