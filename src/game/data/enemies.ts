/**
 * Данные врагов по `mobVisualId` (редактируются в /dev/enemies).
 */

import enemiesData from "./enemies.json";
import type { EnemyGruntScaledStats, MobAggroRadii } from "./balance";
import { ENEMY_LEVEL_MAX } from "./balance";

export const ENEMY_DEFAULT_KEY = "__default" as const;

export const ENEMY_BASE_FIELD_KEYS = [
  "hp",
  "atk",
  "armor",
  "speed",
  "attackRange",
  "attackCooldownMs",
] as const;

export const ENEMY_SCALING_FIELD_KEYS = [
  "hpLinear",
  "hpQuad",
  "atkPerLevel",
  "armorPerLevel",
  "speedPerLevel",
  "speedCap",
  "attackRangePerLevelInv",
  "cooldownDecayPerLevel",
  "cooldownDecayLevelCap",
  "cooldownMin",
] as const;

export const ENEMY_AI_FIELD_KEYS = [
  "aggroRadius",
  "loseAggroRadius",
  "leashRadius",
] as const;

export type EnemyBaseStats = {
  hp: number;
  atk: number;
  armor: number;
  speed: number;
  attackRange: number;
  attackCooldownMs: number;
};

export type EnemyScaling = {
  hpLinear: number;
  hpQuad: number;
  atkPerLevel: number;
  armorPerLevel: number;
  speedPerLevel: number;
  speedCap: number;
  attackRangePerLevelInv: number;
  cooldownDecayPerLevel: number;
  cooldownDecayLevelCap: number;
  cooldownMin: number;
};

export type EnemyAiRadii = {
  aggroRadius: number;
  loseAggroRadius: number;
  leashRadius: number;
};

export type EnemyDef = {
  label: string;
  /** Если true — моб не спавнится и не респавнится (данные сохраняются в JSON). */
  archived?: boolean;
  base: EnemyBaseStats;
  scaling: EnemyScaling;
  ai: EnemyAiRadii;
  respawnMs: number;
};

type EnemiesFile = {
  updatedAt?: string;
  enemies: Record<string, EnemyDef>;
};

const file = enemiesData as EnemiesFile;

/** Снимок из JSON (мутируется только через PUT /api/dev/enemies в dev). */
export const ENEMIES: Record<string, EnemyDef> = file.enemies ?? {};

export function getEnemiesUpdatedAt(): string | undefined {
  return file.updatedAt;
}

export function getEnemyDef(mobVisualId: string): EnemyDef {
  const d = ENEMIES[mobVisualId] ?? ENEMIES[ENEMY_DEFAULT_KEY];
  if (!d) {
    throw new Error(
      "[enemies] Нет записи __default в enemies.json — проверьте данные"
    );
  }
  return d;
}

/** Заархивированные мобы не появляются в мире (спавн/респавн пропускаются). */
export function isEnemyArchived(mobVisualId: string): boolean {
  if (mobVisualId === ENEMY_DEFAULT_KEY) return false;
  const d = ENEMIES[mobVisualId];
  return Boolean(d?.archived);
}

function scaleEnemyToLevel(def: EnemyDef, level: number): EnemyGruntScaledStats {
  const L = Math.max(1, Math.min(ENEMY_LEVEL_MAX, Math.floor(level)));
  const t = L - 1;
  const b = def.base;
  const s = def.scaling;
  const hp = Math.floor(b.hp * (1 + s.hpLinear * t + s.hpQuad * t * t));
  const atk = b.atk + Math.floor(s.atkPerLevel * t);
  const armor = b.armor + Math.floor(s.armorPerLevel * t);
  const speed = Math.min(
    s.speedCap,
    b.speed + Math.floor(s.speedPerLevel * t)
  );
  const inv = Math.max(1, s.attackRangePerLevelInv);
  const attackRange = b.attackRange + Math.floor(t / inv);
  const attackCooldownMs = Math.max(
    s.cooldownMin,
    Math.floor(
      b.attackCooldownMs *
        (1 -
          s.cooldownDecayPerLevel *
            Math.min(t, Math.max(0, s.cooldownDecayLevelCap)))
    )
  );
  return {
    level: L,
    hp,
    atk,
    armor,
    speed,
    attackRange,
    attackCooldownMs,
  };
}

/** Статы моба по визуальному id и уровню (для спавна и респавна). */
export function getEnemyStatsForVisual(
  mobVisualId: string,
  level: number
): EnemyGruntScaledStats {
  return scaleEnemyToLevel(getEnemyDef(mobVisualId), level);
}

/** Для превью в админке из черновика записи (ещё не сохранённой в JSON). */
export function computeEnemyScaledStatsFromDef(
  def: EnemyDef,
  level: number
): EnemyGruntScaledStats {
  return scaleEnemyToLevel(def, level);
}

/** Дефолтные радиусы AI для merge с оверрайдами из спавна локации. */
export function getEnemyAiRadii(mobVisualId: string): MobAggroRadii {
  const d = getEnemyDef(mobVisualId);
  return {
    aggroRadius: d.ai.aggroRadius,
    loseAggroRadius: d.ai.loseAggroRadius,
    leashRadius: d.ai.leashRadius,
  };
}

export function getEnemyRespawnMs(mobVisualId: string): number {
  const ms = getEnemyDef(mobVisualId).respawnMs;
  return Math.max(1000, Math.floor(ms));
}

/**
 * @deprecated Используйте `getEnemyStatsForVisual(mobVisualId, level)`.
 * Эквивалент `getEnemyStatsForVisual("__default", level)`.
 */
export function getEnemyGruntStatsForLevel(
  level: number
): EnemyGruntScaledStats {
  return getEnemyStatsForVisual(ENEMY_DEFAULT_KEY, level);
}
