import { TORCH_FULL_GAME_MINUTES } from "@/src/game/data/balance";

export type ActiveTorchState = {
  /** Остаток горения в игровых минутах. */
  remainingGameMinutes: number;
};

/**
 * Уменьшает остаток факела на `deltaGameMinutes`.
 * Возвращает `null`, если факела не было или он догорел.
 */
export function drainTorchGameMinutes(
  torch: ActiveTorchState | null,
  deltaGameMinutes: number
): ActiveTorchState | null {
  if (!torch || deltaGameMinutes <= 0) return torch;
  const next = torch.remainingGameMinutes - deltaGameMinutes;
  if (next <= 0) return null;
  return { remainingGameMinutes: next };
}

export function clampTorchRemainingForPersist(
  torch: ActiveTorchState | null
): ActiveTorchState | null {
  if (!torch) return null;
  const r = torch.remainingGameMinutes;
  if (!Number.isFinite(r) || r <= 0) return null;
  return {
    remainingGameMinutes: Math.min(
      TORCH_FULL_GAME_MINUTES * 24,
      Math.max(0, r)
    ),
  };
}
