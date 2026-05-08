import type { LifetimeStats } from "@/src/game/data/lifetimeStats";

export type LifetimeStatMetricKey = keyof Omit<
  LifetimeStats,
  "enemiesKilledByMobVisualId"
>;

export type AchievementCondition =
  | { kind: "lifetime_gte"; key: LifetimeStatMetricKey; value: number }
  | { kind: "level_gte"; value: number }
  | { kind: "dungeon_max_floor_gte"; value: number }
  | { kind: "quests_completed_gte"; value: number }
  | {
      kind: "mob_visual_kills_gte";
      mobVisualId: string;
      value: number;
    }
  | { kind: "and"; parts: AchievementCondition[] };

export type AchievementDef = {
  id: string;
  title: string;
  description: string;
  condition: AchievementCondition;
  /** Пока не разблокировано — в списке скрыты название, описание и прогресс. */
  hidden?: boolean;
};
