import { ENEMY_LEVEL_MAX } from "@/src/game/data/balance";
import { FOREST_HUB_SPAWNS } from "@/src/game/locations/forestChunkGen";

const AX = FOREST_HUB_SPAWNS.from_town.x;
const AY = FOREST_HUB_SPAWNS.from_town.y;

/** Расстояние от точки появления при входе из города (мир. пиксели). */
export function forestDistanceFromTownEntry(worldX: number, worldY: number): number {
  return Math.hypot(worldX - AX, worldY - AY);
}

/**
 * 0 — у перехода (тишина), 1 — далеко в лесу (полная «угроза»).
 * Линейный участок между d0 и d1 пикселей от входа.
 */
export function forestThreatGradient01(worldX: number, worldY: number): number {
  const dist = forestDistanceFromTownEntry(worldX, worldY);
  const d0 = 300;
  const d1 = 2680;
  if (dist <= d0) return 0;
  if (dist >= d1) return 1;
  return (dist - d0) / (d1 - d0);
}

/**
 * Уровень моба: у входа — 1, с дистанцией растёт до потолка, зависящего от шаблона JSON.
 */
export function forestMobLevelFromTemplate(
  templateLevel: number | undefined,
  worldX: number,
  worldY: number
): number {
  const t = forestThreatGradient01(worldX, worldY);
  const tpl = Math.max(1, templateLevel ?? 1);
  const farPeak = Math.min(ENEMY_LEVEL_MAX, Math.max(13, tpl + 8));
  return Math.max(1, Math.min(farPeak, Math.round(1 + t * (farPeak - 1))));
}

/**
 * Дополнительный множитель к задержке респавна лесных мобов (после базового `respawnMs`).
 */
export const FOREST_MOB_RESPAWN_GLOBAL_MULT = 2.85;

/**
 * Множитель к базовой задержке респавна: дольше у входа, во «глубине» всё равно не быстрее старого центра.
 */
export function forestRespawnDelayMultiplier(worldX: number, worldY: number): number {
  const t = forestThreatGradient01(worldX, worldY);
  const nearMult = 1.72;
  const farMult = 1.08;
  return nearMult - t * (nearMult - farMult);
}

/**
 * Вероятность, что при срабатывании таймера моб реально появится (остальное — отложенный повтор).
 * У входа плотность ниже, но не «пустыня».
 */
export function forestSpawnPresenceChance(worldX: number, worldY: number): number {
  const t = forestThreatGradient01(worldX, worldY);
  const nearPresence = 0.62;
  const farPresence = 0.98;
  return nearPresence + (farPresence - nearPresence) * t;
}
