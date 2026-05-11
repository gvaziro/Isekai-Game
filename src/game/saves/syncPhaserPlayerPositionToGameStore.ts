import { SYNC_PLAYER_POSITION_TO_STORE_EVENT } from "@/src/game/constants/gameplay";
import { useGameStore, waitForGameStoreHydration } from "@/src/game/state/gameStore";

function awaitPersistReturn(v: void | Promise<unknown>): Promise<void> {
  return Promise.resolve(v).then(() => {});
}

/**
 * Перед снимком профиля: координаты героя из Phaser (MainScene) → zustand и persist.
 * Иначе в сторе остаются значения с троттлингом ~200 ms и быстрый сейв ловит «старую» точку.
 */
export async function syncPhaserPlayerPositionToGameStore(): Promise<void> {
  if (typeof window === "undefined") return;
  await waitForGameStoreHydration();
  window.dispatchEvent(new CustomEvent(SYNC_PLAYER_POSITION_TO_STORE_EVENT));
  await awaitPersistReturn(
    useGameStore.setState((s) => ({
      player: { ...s.player },
    }))
  );
}
