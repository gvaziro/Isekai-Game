import { HOTBAR_SLOT_COUNT } from "@/src/game/constants/gameplay";

/** Циклический индекс в диапазоне [0, len). */
export function wrapHotbarIndex(index: number, len: number): number {
  const L = Math.max(1, Math.floor(len));
  const i = Math.floor(index);
  return ((i % L) + L) % L;
}

/** Сдвиг на один шаг по колесу (deltaSteps: +1 или -1). */
export function shiftHotbarIndex(
  current: number,
  deltaSteps: number,
  len: number = HOTBAR_SLOT_COUNT
): number {
  const L = Math.max(1, Math.floor(len));
  const step = deltaSteps > 0 ? 1 : deltaSteps < 0 ? -1 : 0;
  return wrapHotbarIndex(current + step, L);
}
