import { isElectronClient } from "@/src/game/desktop";
import { flushElectronProfileWrites } from "@/src/game/saves/electronProfileStateStorage";
import { readLiveGameSnapshotEntryStrings } from "@/src/game/saves/liveGameProfileSnapshot";
import { syncPhaserPlayerPositionToGameStore } from "@/src/game/saves/syncPhaserPlayerPositionToGameStore";
import { waitForGameStoreHydration } from "@/src/game/state/gameStore";
import { useLoreJournalStore, waitForLoreJournalHydration } from "@/src/game/state/loreJournalStore";
import {
  useNpcDialogueProgressStore,
  waitForNpcDialogueProgressHydration,
} from "@/src/game/state/npcDialogueProgressStore";
import { useQuestStore, waitForQuestStoreHydration } from "@/src/game/state/questStore";
import {
  waitForSaveSlotsHydration,
  writeAutosaveSlot0FromGameSnapshot,
} from "@/src/game/state/saveSlotsStore";

function awaitPersistReturn(v: void | Promise<unknown>): Promise<void> {
  return Promise.resolve(v).then(() => {});
}

/**
 * Принудительно сериализует все профильные zustand-сторы и в Electron сразу пишет файл профиля.
 */
export async function saveProfileNow(): Promise<{ ok: boolean; error?: string }> {
  if (typeof window === "undefined") {
    return { ok: false, error: "Сохранение недоступно на сервере." };
  }

  await Promise.all([
    waitForGameStoreHydration(),
    waitForQuestStoreHydration(),
    waitForLoreJournalHydration(),
    waitForNpcDialogueProgressHydration(),
    waitForSaveSlotsHydration(),
  ]);

  await syncPhaserPlayerPositionToGameStore();
  await awaitPersistReturn(
    useQuestStore.setState((s) => ({
      completedQuestIds: [...s.completedQuestIds],
    }))
  );
  await awaitPersistReturn(
    useLoreJournalStore.setState((s) => ({
      unlockedFactIds: [...s.unlockedFactIds],
      entriesById: { ...s.entriesById },
      readFactIds: { ...s.readFactIds },
    }))
  );
  await awaitPersistReturn(
    useNpcDialogueProgressStore.setState((s) => ({
      completedIntroByNpcId: { ...s.completedIntroByNpcId },
    }))
  );

  const flushedOk = await flushElectronProfileWrites();
  if (isElectronClient() && !flushedOk) {
    return {
      ok: false,
      error: "Не удалось записать профиль на диск (Electron).",
    };
  }

  try {
    const snap = readLiveGameSnapshotEntryStrings();
    await writeAutosaveSlot0FromGameSnapshot(snap);
  } catch {
    /* слоты — вторично, не ломаем успешное основное сохранение */
  }

  return { ok: true };
}
