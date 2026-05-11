import type {
  GameProfileSnapshotKey,
} from "@/src/game/saves/electronProfileStateStorage";
import { GAME_PROFILE_SNAPSHOT_KEYS } from "@/src/game/saves/electronProfileStateStorage";
import { useGameStore } from "@/src/game/state/gameStore";
import { useLoreJournalStore } from "@/src/game/state/loreJournalStore";
import { useNpcDialogueProgressStore } from "@/src/game/state/npcDialogueProgressStore";
import { useQuestStore } from "@/src/game/state/questStore";

type PersistedZustandStore = {
  getState: () => object;
  persist: {
    getOptions: () => {
      partialize?: (s: never) => unknown;
      version?: number;
    };
  };
};

function serializePersistBlob(store: PersistedZustandStore): string {
  const opts = store.persist.getOptions();
  const state = opts.partialize
    ? opts.partialize({ ...store.getState() } as never)
    : { ...store.getState() };
  return JSON.stringify({
    state,
    version: opts.version ?? 0,
  });
}

const LIVE_SNAPSHOT_STORES = {
  "last-summon-save-v1": useGameStore as unknown as PersistedZustandStore,
  "last-summon-quest-v1": useQuestStore as unknown as PersistedZustandStore,
  "last-summon-lore-journal-v1":
    useLoreJournalStore as unknown as PersistedZustandStore,
  "last-summon-npc-dialogue-progress-v1":
    useNpcDialogueProgressStore as unknown as PersistedZustandStore,
} satisfies Record<GameProfileSnapshotKey, PersistedZustandStore>;

/**
 * Снимок четырёх persist-блобов из текущей памяти (как при записи zustand/persist).
 * Не читает storage — исключает гонку «память уже обновлена, а getItem ещё старый».
 */
export function readLiveGameSnapshotEntryStrings(): Record<
  GameProfileSnapshotKey,
  string
> {
  const out = {} as Record<GameProfileSnapshotKey, string>;
  for (const key of GAME_PROFILE_SNAPSHOT_KEYS) {
    out[key] = serializePersistBlob(LIVE_SNAPSHOT_STORES[key]);
  }
  return out;
}
