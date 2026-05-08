import { questDefSchema, type QuestDef } from "@/src/game/data/schemas/quest";
import { DUNGEON_MAX_FLOOR } from "@/src/game/data/dungeonFloorScaling";

/** Контент квестов (проверка на старте). */
const RAW_QUESTS = [
  {
    id: "escape_village",
    title: "Сквозь туман",
    description:
      "Деревня заперта: с одной стороны бескрайний лес, с другой — магический туман на дороге. Легенда гласит: хранитель в катакомбах держит заклятие. Спуститесь в подземелье, зачистите все этажи и победите стража последнего уровня — тогда туман рассеется.",
    stages: [
      {
        id: "hear_briefing",
        summary: "Поговорить с Маркусом",
        objective: { kind: "talk_to" as const, npcId: "marcus" },
      },
      {
        id: "reach_dungeon_portal",
        summary: "Дойти до входа в катакомбы",
        objective: {
          kind: "reach_point" as const,
          x: 640,
          y: 720,
          radius: 110,
        },
      },
      {
        id: "clear_catacombs",
        summary: `Победить хранителя на ${DUNGEON_MAX_FLOOR}-м этаже катакомб`,
        objective: {
          kind: "dungeon_cleared_to_floor" as const,
          floor: DUNGEON_MAX_FLOOR,
        },
      },
      {
        id: "report_back",
        summary: "Доложить Маркусу",
        objective: { kind: "talk_to" as const, npcId: "marcus" },
      },
    ],
  },
  {
    id: "clear_crossroads",
    title: "Угроза у дороги",
    description:
      "Разберитесь с бандитом у южного перекрёстка.",
    stages: [
      {
        id: "beat_grunt",
        summary: "Победить бандита у перекрёстка",
        objective: {
          kind: "kill" as const,
          enemyId: "grunt_crossroads",
        },
      },
    ],
  },
];

export const QUEST_CHAIN_IDS: readonly string[] = RAW_QUESTS.map((q) => q.id);

export const QUESTS: QuestDef[] = RAW_QUESTS.map((q) => questDefSchema.parse(q));

export const QUESTS_BY_ID: Record<string, QuestDef> = Object.fromEntries(
  QUESTS.map((q) => [q.id, q])
);
