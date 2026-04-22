import { questDefSchema, type QuestDef } from "@/src/game/data/schemas/quest";

/** Контент квестов (проверка на старте). */
const RAW_QUESTS = [
  {
    id: "intro_village",
    title: "Знакомство с деревней",
    description:
      "Поговорите с паладином у северо-восточной площади, загляните к перекрёстку и откройте сундук у северо-западного дома.",
    stages: [
      {
        id: "meet_marcus",
        summary: "Поговорить с Маркусом",
        objective: { kind: "talk_to" as const, npcId: "marcus" },
      },
      {
        id: "visit_crossroads",
        summary: "Дойти до центрального перекрёстка",
        objective: {
          kind: "reach_point" as const,
          x: 618,
          y: 458,
          radius: 96,
        },
      },
      {
        id: "open_nw_chest",
        summary: "Открыть сундук у северо-западного дома",
        objective: {
          kind: "open_chest" as const,
          chestId: "chest_nw_house",
        },
      },
    ],
  },
  {
    id: "clear_crossroads",
    title: "Угроза у дороги",
    description:
      "После осмотра деревни разберитесь с бандитом у южного перекрёстка.",
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
