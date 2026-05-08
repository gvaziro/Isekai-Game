import type { AchievementDef } from "@/src/game/data/achievementTypes";

export type { AchievementDef } from "@/src/game/data/achievementTypes";

export const ACHIEVEMENTS: AchievementDef[] = [
  {
    id: "first_blood",
    title: "Первая кровь",
    description: "Победите любого врага.",
    condition: { kind: "lifetime_gte", key: "enemiesKilled", value: 1 },
  },
  {
    id: "hunter_10",
    title: "Зачистка",
    description: "Победите 10 врагов.",
    condition: { kind: "lifetime_gte", key: "enemiesKilled", value: 10 },
  },
  {
    id: "hunter_25",
    title: "Охотник",
    description: "Победите 25 врагов.",
    condition: { kind: "lifetime_gte", key: "enemiesKilled", value: 25 },
  },
  {
    id: "hunter_100",
    title: "Мясник",
    description: "Победите 100 врагов.",
    condition: { kind: "lifetime_gte", key: "enemiesKilled", value: 100 },
  },
  {
    id: "hunter_250",
    title: "Резня",
    description: "Победите 250 врагов.",
    condition: { kind: "lifetime_gte", key: "enemiesKilled", value: 250 },
  },
  {
    id: "orc_slayer_15",
    title: "Ненависть к оркам",
    description: "Уничтожьте 15 орков-воинов в подземелье.",
    condition: {
      kind: "mob_visual_kills_gte",
      mobVisualId: "orc_warrior",
      value: 15,
    },
  },
  {
    id: "skeleton_slayer_15",
    title: "Костолом",
    description: "Уничтожьте 15 скелетов-воинов.",
    condition: {
      kind: "mob_visual_kills_gte",
      mobVisualId: "skeleton_warrior",
      value: 15,
    },
  },
  {
    id: "gold_1000",
    title: "Мешок золота",
    description: "Всего получите не менее 1000 золота (лут и продажа).",
    condition: { kind: "lifetime_gte", key: "totalGoldEarned", value: 1000 },
  },
  {
    id: "gold_5000",
    title: "Кубышка",
    description: "Всего получите не менее 5000 золота.",
    condition: { kind: "lifetime_gte", key: "totalGoldEarned", value: 5000 },
  },
  {
    id: "gold_25000",
    title: "Сокровищница",
    description: "Всего получите не менее 25000 золота.",
    condition: { kind: "lifetime_gte", key: "totalGoldEarned", value: 25000 },
  },
  {
    id: "gold_spent_500",
    title: "Покупатель",
    description: "Потратьте не менее 500 золота.",
    condition: { kind: "lifetime_gte", key: "totalGoldSpent", value: 500 },
  },
  {
    id: "gold_spent_5000",
    title: "Расточитель",
    description: "Потратьте не менее 5000 золота.",
    condition: { kind: "lifetime_gte", key: "totalGoldSpent", value: 5000 },
  },
  {
    id: "level_5",
    title: "Закалка",
    description: "Достигните 5 уровня.",
    condition: { kind: "level_gte", value: 5 },
  },
  {
    id: "level_10",
    title: "Ветеран поля боя",
    description: "Достигните 10 уровня.",
    condition: { kind: "level_gte", value: 10 },
  },
  {
    id: "level_15",
    title: "Закалённый",
    description: "Достигните 15 уровня.",
    condition: { kind: "level_gte", value: 15 },
  },
  {
    id: "level_20",
    title: "Легенда сёл",
    description: "Достигните 20 уровня.",
    condition: { kind: "level_gte", value: 20 },
  },
  {
    id: "xp_5000",
    title: "Тяга к знаниям",
    description: "Накопите не менее 5000 очков опыта (суммарно начисленного).",
    condition: { kind: "lifetime_gte", key: "totalXpGained", value: 5000 },
  },
  {
    id: "xp_15000",
    title: "Учёность",
    description: "Накопите не менее 15000 очков опыта.",
    condition: { kind: "lifetime_gte", key: "totalXpGained", value: 15000 },
  },
  {
    id: "xp_50000",
    title: "Эрудиция",
    description: "Накопите не менее 50000 очков опыта.",
    condition: { kind: "lifetime_gte", key: "totalXpGained", value: 50000 },
  },
  {
    id: "first_chest",
    title: "Любопытство",
    description: "Откройте любой сундук.",
    condition: { kind: "lifetime_gte", key: "uniqueChestsOpened", value: 1 },
  },
  {
    id: "chest_unique_5",
    title: "Сундук за сундуком",
    description: "Откройте 5 разных сундуков.",
    condition: { kind: "lifetime_gte", key: "uniqueChestsOpened", value: 5 },
  },
  {
    id: "chest_events_20",
    title: "Любитель ящиков",
    description: "Откройте сундуки 20 раз (включая повторные).",
    condition: { kind: "lifetime_gte", key: "chestOpenEvents", value: 20 },
  },
  {
    id: "chest_events_75",
    title: "Мародёр",
    description: "Откройте сундуки 75 раз.",
    condition: { kind: "lifetime_gte", key: "chestOpenEvents", value: 75 },
    hidden: true,
  },
  {
    id: "first_pickup",
    title: "Собиратель",
    description: "Подберите предмет в мире.",
    condition: {
      kind: "lifetime_gte",
      key: "uniqueWorldPickupsTaken",
      value: 1,
    },
  },
  {
    id: "pickups_5",
    title: "По следам добычи",
    description: "Подберите 5 разных мир-пикапов.",
    condition: {
      kind: "lifetime_gte",
      key: "uniqueWorldPickupsTaken",
      value: 5,
    },
  },
  {
    id: "pickups_12",
    title: "Уборщик поляны",
    description: "Подберите 12 разных мир-пикапов.",
    condition: {
      kind: "lifetime_gte",
      key: "uniqueWorldPickupsTaken",
      value: 12,
    },
  },
  {
    id: "dungeon_floor_1",
    title: "Вниз по ступеням",
    description: "Зачистите первый этаж подземелья.",
    condition: { kind: "dungeon_max_floor_gte", value: 1 },
  },
  {
    id: "dungeon_floor_5",
    title: "Глубже тьмы",
    description: "Достигните 5 этажа подземелья (макс. зачистка).",
    condition: { kind: "dungeon_max_floor_gte", value: 5 },
  },
  {
    id: "dungeon_floor_10",
    title: "Катакомбы",
    description: "Достигните 10 этажа подземелья.",
    condition: { kind: "dungeon_max_floor_gte", value: 10 },
  },
  {
    id: "boss_clears_3",
    title: "Три ступени вниз",
    description: "Зачистите три этажа боссами.",
    condition: { kind: "lifetime_gte", key: "dungeonBossFirstClears", value: 3 },
  },
  {
    id: "boss_clears_7",
    title: "Искатель глубин",
    description: "Зачистите семь этажей боссами.",
    condition: { kind: "lifetime_gte", key: "dungeonBossFirstClears", value: 7 },
  },
  {
    id: "deaths_3",
    title: "Упорство",
    description: "Переживите три поражения (респавн после нуля HP).",
    condition: { kind: "lifetime_gte", key: "playerDeaths", value: 3 },
  },
  {
    id: "deaths_10",
    title: "Феникс",
    description: "Переживите десять поражений.",
    condition: { kind: "lifetime_gte", key: "playerDeaths", value: 10 },
    hidden: true,
  },
  {
    id: "consumables_5",
    title: "Аптекарь",
    description: "Используйте 5 расходников.",
    condition: { kind: "lifetime_gte", key: "consumablesUsed", value: 5 },
  },
  {
    id: "consumables_30",
    title: "Запасливый",
    description: "Используйте 30 расходников.",
    condition: { kind: "lifetime_gte", key: "consumablesUsed", value: 30 },
  },
  {
    id: "consumables_100",
    title: "Алхимик",
    description: "Используйте 100 расходников.",
    condition: { kind: "lifetime_gte", key: "consumablesUsed", value: 100 },
  },
  {
    id: "sold_25",
    title: "Барыга",
    description: "Продайте лавке не менее 25 единиц товара.",
    condition: { kind: "lifetime_gte", key: "itemsSoldTotalQty", value: 25 },
  },
  {
    id: "sold_150",
    title: "Опт",
    description: "Продайте не менее 150 единиц товара.",
    condition: { kind: "lifetime_gte", key: "itemsSoldTotalQty", value: 150 },
  },
  {
    id: "bought_5",
    title: "Клиент",
    description: "Купите в лавке не менее 5 единиц товара.",
    condition: { kind: "lifetime_gte", key: "itemsBoughtTotalQty", value: 5 },
  },
  {
    id: "bought_40",
    title: "Постоянный покупатель",
    description: "Купите не менее 40 единиц товара.",
    condition: { kind: "lifetime_gte", key: "itemsBoughtTotalQty", value: 40 },
  },
  {
    id: "quests_1",
    title: "Слово сдержал",
    description: "Завершите один квест.",
    condition: { kind: "quests_completed_gte", value: 1 },
  },
  {
    id: "quests_all",
    title: "Герой деревни",
    description: "Завершите все квесты цепочки.",
    condition: { kind: "quests_completed_gte", value: 2 },
  },
  {
    id: "veteran_triple",
    title: "Тройная закалка",
    description: "10 уровень, 50 убийств и один завершённый квест.",
    condition: {
      kind: "and",
      parts: [
        { kind: "level_gte", value: 10 },
        { kind: "lifetime_gte", key: "enemiesKilled", value: 50 },
        { kind: "quests_completed_gte", value: 1 },
      ],
    },
    hidden: true,
  },
];

const byId = new Map<string, AchievementDef>();
for (const a of ACHIEVEMENTS) {
  byId.set(a.id, a);
}

export function getAchievementById(id: string): AchievementDef | undefined {
  return byId.get(id);
}
