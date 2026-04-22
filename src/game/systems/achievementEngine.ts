import { ACHIEVEMENTS } from "@/src/game/data/achievements";
import type {
  AchievementCondition,
  AchievementDef,
} from "@/src/game/data/achievementTypes";
import type { LifetimeStats } from "@/src/game/data/lifetimeStats";
import { getAchievementQuestCompletedCount } from "@/src/game/state/achievementQuestCount";

export type { AchievementCondition } from "@/src/game/data/achievementTypes";

export type AchievementSnapshot = {
  lifetime: LifetimeStats;
  characterLevel: number;
  dungeonMaxClearedFloor: number;
  /** Число завершённых квестов (id в цепочке), из quest store. */
  questsCompleted: number;
};

/** Прогресс по одному порогу или агрегат для `and` (минимум процентов частей). */
export type AchievementProgress = {
  current: number;
  target: number;
  /** 0…100 */
  percent: number;
  /** Для `and`: «минимальный процент» без осмысленных current/target. */
  isCompoundMin?: boolean;
};

function ratio(current: number, target: number): AchievementProgress {
  const t = Math.max(1, Math.floor(target));
  const c = Math.max(0, Math.floor(current));
  return {
    current: c,
    target: t,
    percent: Math.min(100, Math.floor((100 * c) / t)),
  };
}

function conditionMet(
  c: AchievementCondition,
  snap: AchievementSnapshot
): boolean {
  switch (c.kind) {
    case "lifetime_gte":
      return snap.lifetime[c.key] >= c.value;
    case "level_gte":
      return snap.characterLevel >= c.value;
    case "dungeon_max_floor_gte":
      return snap.dungeonMaxClearedFloor >= c.value;
    case "quests_completed_gte":
      return snap.questsCompleted >= c.value;
    case "mob_visual_kills_gte": {
      const cur =
        snap.lifetime.enemiesKilledByMobVisualId[c.mobVisualId] ?? 0;
      return cur >= c.value;
    }
    case "and":
      return c.parts.every((p) => conditionMet(p, snap));
    default:
      return false;
  }
}

export function buildAchievementSnapshot(input: {
  lifetimeStats: LifetimeStats;
  characterLevel: number;
  dungeonMaxClearedFloor: number;
  /** Для тестов; иначе из `getAchievementQuestCompletedCount`. */
  questsCompleted?: number;
}): AchievementSnapshot {
  return {
    lifetime: input.lifetimeStats,
    characterLevel: Math.max(1, Math.floor(input.characterLevel)),
    dungeonMaxClearedFloor: Math.max(
      0,
      Math.floor(input.dungeonMaxClearedFloor)
    ),
    questsCompleted:
      input.questsCompleted !== undefined
        ? Math.max(0, Math.floor(input.questsCompleted))
        : getAchievementQuestCompletedCount(),
  };
}

/** Прогресс для UI; для `and` — минимальный процент среди частей (слабое звено). */
export function getAchievementProgressForCondition(
  c: AchievementCondition,
  snap: AchievementSnapshot
): AchievementProgress | null {
  switch (c.kind) {
    case "lifetime_gte":
      return ratio(snap.lifetime[c.key], c.value);
    case "level_gte":
      return ratio(snap.characterLevel, c.value);
    case "dungeon_max_floor_gte":
      return ratio(snap.dungeonMaxClearedFloor, c.value);
    case "quests_completed_gte":
      return ratio(snap.questsCompleted, c.value);
    case "mob_visual_kills_gte": {
      const cur =
        snap.lifetime.enemiesKilledByMobVisualId[c.mobVisualId] ?? 0;
      return ratio(cur, c.value);
    }
    case "and": {
      const parts: AchievementProgress[] = [];
      for (const p of c.parts) {
        const sub = getAchievementProgressForCondition(p, snap);
        if (sub === null) return null;
        parts.push(sub);
      }
      if (parts.length === 0) return null;
      const percent = Math.min(...parts.map((p) => p.percent));
      return {
        current: percent,
        target: 100,
        percent,
        isCompoundMin: true,
      };
    }
    default:
      return null;
  }
}

export function getAchievementProgressForDef(
  def: Pick<AchievementDef, "condition">,
  snap: AchievementSnapshot
): AchievementProgress | null {
  return getAchievementProgressForCondition(def.condition, snap);
}

/** Id достижений, которые только что выполнили условие и ещё не в `unlocked`. */
export function computeNewlyUnlockedAchievementIds(
  unlocked: Readonly<Record<string, number>>,
  snap: AchievementSnapshot
): string[] {
  const out: string[] = [];
  for (const def of ACHIEVEMENTS) {
    if (unlocked[def.id] !== undefined) continue;
    if (conditionMet(def.condition, snap)) out.push(def.id);
  }
  return out;
}
