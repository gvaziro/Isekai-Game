import type { PlayerWorldPose } from "@/src/game/state/gameStore";

/**
 * Поза игрока, которую нужно восстановить при следующем старте MainScene.
 *
 * Устанавливается в `applySaveSlotPayload` СРАЗУ после rehydrate — пока старый
 * Phaser ещё жив и продолжает писать свою (устаревшую) позицию в Zustand через
 * throttled setPlayerPosition. Новый MainScene читает это значение в bootstrap
 * и обнуляет его, полностью игнорируя то, что за это время оказалось в сторе.
 */
let _pending: PlayerWorldPose | null = null;

export function setPendingLoadPose(pose: PlayerWorldPose): void {
  _pending = { ...pose };
}

/** Забирает сохранённую позу и очищает буфер (повторный вызов вернёт null). */
export function consumePendingLoadPose(): PlayerWorldPose | null {
  const p = _pending;
  _pending = null;
  return p;
}
