import { isElectronClient } from "@/src/game/desktop";
import {
  flushElectronProfileWrites,
  writeGameSnapshotEntryStrings,
} from "@/src/game/saves/electronProfileStateStorage";
import { readLiveGameSnapshotEntryStrings } from "@/src/game/saves/liveGameProfileSnapshot";
import { setPendingLoadPose } from "@/src/game/saves/pendingLoadPose";
import type { SaveSlotPayload } from "@/src/game/state/saveSlotsStore";
import {
  waitForSaveSlotsHydration,
  writeAutosaveSlot0FromGameSnapshot,
} from "@/src/game/state/saveSlotsStore";
import { useGameStore, waitForGameStoreHydration } from "@/src/game/state/gameStore";
import { useLoreJournalStore, waitForLoreJournalHydration } from "@/src/game/state/loreJournalStore";
import {
  useNpcDialogueProgressStore,
  waitForNpcDialogueProgressHydration,
} from "@/src/game/state/npcDialogueProgressStore";
import { useQuestStore, waitForQuestStoreHydration } from "@/src/game/state/questStore";

function awaitRehydrate(v: void | Promise<void>): Promise<void> {
  return Promise.resolve(v).then(() => {});
}

/**
 * Подменяет четыре игровых persist-блоба данными из слота и перегружает сторы из storage.
 */
export async function applySaveSlotPayload(
  payload: SaveSlotPayload
): Promise<{ ok: boolean; error?: string }> {
  if (typeof window === "undefined") {
    return { ok: false, error: "Загрузка недоступна на сервере." };
  }

  await Promise.all([
    waitForGameStoreHydration(),
    waitForQuestStoreHydration(),
    waitForLoreJournalHydration(),
    waitForNpcDialogueProgressHydration(),
    waitForSaveSlotsHydration(),
  ]);

  try {
    await writeGameSnapshotEntryStrings(payload.entries);
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Не удалось записать сейв в хранилище.",
    };
  }

  try {
    await Promise.all([
      awaitRehydrate(useGameStore.persist.rehydrate()),
      awaitRehydrate(useQuestStore.persist.rehydrate()),
      awaitRehydrate(useLoreJournalStore.persist.rehydrate()),
      awaitRehydrate(useNpcDialogueProgressStore.persist.rehydrate()),
    ]);
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Ошибка при чтении сейва в память.",
    };
  }

  /**
   * Захватываем и позу, и живой снимок сторов НЕМЕДЛЕННО после rehydrate —
   * синхронно, до любого await. Старый Phaser продолжает работать в RAF
   * и может через await затереть стор своим throttled setPlayerPosition.
   * pending-поза защитит новый MainScene от этой гонки;
   * fresh-снимок защитит автослот 0 — второй F9 загрузит правильное состояние.
   */
  setPendingLoadPose(useGameStore.getState().player);
  let freshSnapshot: ReturnType<typeof readLiveGameSnapshotEntryStrings> | null = null;
  try {
    freshSnapshot = readLiveGameSnapshotEntryStrings();
  } catch {
    /* не критично */
  }

  const flushedOk = await flushElectronProfileWrites();
  if (!flushedOk && isElectronClient()) {
    return {
      ok: false,
      error: "Не удалось сбросить профиль на диск после загрузки.",
    };
  }

  if (freshSnapshot) {
    try {
      await writeAutosaveSlot0FromGameSnapshot(freshSnapshot);
    } catch {
      /* автослот — вторично, не ломаем успешную загрузку */
    }
  }

  return { ok: true };
}
