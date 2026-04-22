/**
 * Древо категорий для UI достижений (листья — id из `ACHIEVEMENTS`).
 */

export type AchievementTreeChild =
  | {
      kind: "group";
      id: string;
      title: string;
      children: AchievementTreeChild[];
    }
  | { kind: "leaf"; achievementId: string };

/** Корневые ветви (порядок = порядок на экране). */
export const ACHIEVEMENT_TREE: AchievementTreeChild[] = [
  {
    kind: "group",
    id: "combat",
    title: "Бой",
    children: [
      { kind: "leaf", achievementId: "first_blood" },
      { kind: "leaf", achievementId: "hunter_10" },
      { kind: "leaf", achievementId: "hunter_25" },
      { kind: "leaf", achievementId: "hunter_100" },
      { kind: "leaf", achievementId: "hunter_250" },
      { kind: "leaf", achievementId: "orc_slayer_15" },
      { kind: "leaf", achievementId: "skeleton_slayer_15" },
      { kind: "leaf", achievementId: "deaths_3" },
      { kind: "leaf", achievementId: "deaths_10" },
    ],
  },
  {
    kind: "group",
    id: "dungeon",
    title: "Подземелье",
    children: [
      { kind: "leaf", achievementId: "dungeon_floor_1" },
      { kind: "leaf", achievementId: "dungeon_floor_5" },
      { kind: "leaf", achievementId: "dungeon_floor_10" },
      { kind: "leaf", achievementId: "boss_clears_3" },
      { kind: "leaf", achievementId: "boss_clears_7" },
    ],
  },
  {
    kind: "group",
    id: "wealth",
    title: "Богатство и торговля",
    children: [
      { kind: "leaf", achievementId: "gold_1000" },
      { kind: "leaf", achievementId: "gold_5000" },
      { kind: "leaf", achievementId: "gold_25000" },
      { kind: "leaf", achievementId: "gold_spent_500" },
      { kind: "leaf", achievementId: "gold_spent_5000" },
      { kind: "leaf", achievementId: "sold_25" },
      { kind: "leaf", achievementId: "sold_150" },
      { kind: "leaf", achievementId: "bought_5" },
      { kind: "leaf", achievementId: "bought_40" },
    ],
  },
  {
    kind: "group",
    id: "growth",
    title: "Рост",
    children: [
      { kind: "leaf", achievementId: "level_5" },
      { kind: "leaf", achievementId: "level_10" },
      { kind: "leaf", achievementId: "level_15" },
      { kind: "leaf", achievementId: "level_20" },
      { kind: "leaf", achievementId: "xp_5000" },
      { kind: "leaf", achievementId: "xp_15000" },
      { kind: "leaf", achievementId: "xp_50000" },
    ],
  },
  {
    kind: "group",
    id: "explore",
    title: "Исследование",
    children: [
      { kind: "leaf", achievementId: "first_chest" },
      { kind: "leaf", achievementId: "chest_unique_5" },
      { kind: "leaf", achievementId: "chest_events_20" },
      { kind: "leaf", achievementId: "chest_events_75" },
      { kind: "leaf", achievementId: "first_pickup" },
      { kind: "leaf", achievementId: "pickups_5" },
      { kind: "leaf", achievementId: "pickups_12" },
    ],
  },
  {
    kind: "group",
    id: "consumables",
    title: "Расходники",
    children: [
      { kind: "leaf", achievementId: "consumables_5" },
      { kind: "leaf", achievementId: "consumables_30" },
      { kind: "leaf", achievementId: "consumables_100" },
    ],
  },
  {
    kind: "group",
    id: "quests",
    title: "Квесты и честь",
    children: [
      { kind: "leaf", achievementId: "quests_1" },
      { kind: "leaf", achievementId: "quests_all" },
      { kind: "leaf", achievementId: "veteran_triple" },
    ],
  },
];

/** Все id из дерева (для проверок). */
export function collectAchievementIdsFromTree(
  nodes: AchievementTreeChild[]
): string[] {
  const out: string[] = [];
  const walk = (n: AchievementTreeChild) => {
    if (n.kind === "leaf") out.push(n.achievementId);
    else for (const c of n.children) walk(c);
  };
  for (const n of nodes) walk(n);
  return out;
}
