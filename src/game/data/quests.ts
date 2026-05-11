import { questDefSchema, type QuestDef } from "@/src/game/data/schemas/quest";
import { DUNGEON_MAX_FLOOR } from "@/src/game/data/dungeonFloorScaling";

export const FOG_SEAL_SHARD_ITEM_ID = "fog_seal_shard";

/** Контент квестов (проверка на старте). */
const RAW_QUESTS = [
  {
    id: "village_briefing",
    title: "Первые слова у ворот",
    description:
      "Маркус держит порядок у дорог и знает, почему деревня живет настороже. Поговорите с ним, чтобы понять, что туман не дает уйти наружу, а катакомбы под деревней связаны с первой большой бедой.",
    stages: [
      {
        id: "talk_to_marcus",
        summary: "Поговорить с Маркусом у деревенской дороги",
        objective: { kind: "talk_to" as const, npcId: "marcus" },
      },
      {
        id: "talk_to_elena",
        summary: "Найти Елену и спросить о первых поручениях",
        objective: { kind: "talk_to" as const, npcId: "elena" },
      },
    ],
  },
  {
    id: "elena_basic_supplies",
    title: "Запас на первый выход",
    description:
      "Елена просит собрать простые материалы у кромки леса. Древесина и камень пригодятся для первых рецептов, ремонта и подготовки к дороге.",
    stages: [
      {
        id: "collect_wood",
        summary: "Собрать древесину ×6",
        objective: {
          kind: "collect_item" as const,
          curatedId: "item588",
          qty: 6,
        },
      },
      {
        id: "collect_stone",
        summary: "Собрать камень ×6",
        objective: {
          kind: "collect_item" as const,
          curatedId: "item586",
          qty: 6,
        },
      },
      {
        id: "report_to_elena",
        summary: "Вернуться к Елене с материалами",
        objective: { kind: "talk_to" as const, npcId: "elena" },
      },
    ],
  },
  {
    id: "igor_first_craft",
    title: "Инструмент для леса",
    description:
      "Игорь показывает, как деревенские выжимают пользу из любых запасов. Скрафтите первый топорик на верстаке, чтобы закрепить механику рецептов.",
    stages: [
      {
        id: "talk_to_igor",
        summary: "Поговорить с Игорем о снаряжении",
        objective: { kind: "talk_to" as const, npcId: "igor" },
      },
      {
        id: "craft_hatchet",
        summary: "Скрафтить топорик на верстаке",
        objective: {
          kind: "craft_recipe" as const,
          recipeId: "rope_from_mats_workbench",
        },
      },
      {
        id: "report_to_igor",
        summary: "Показать Игорю готовый топорик",
        objective: { kind: "talk_to" as const, npcId: "igor" },
      },
    ],
  },
  {
    id: "forest_edge_patrol",
    title: "Тропа под присмотром",
    description:
      "У лесной кромки уже бродят слабые твари. Прежде чем лезть глубже, зачистите ближайшие угрозы и привыкните к бою вне деревни.",
    stages: [
      {
        id: "defeat_skeleton_rogue",
        summary: "Победить скелета-разбойника в лесу",
        objective: {
          kind: "kill_count" as const,
          mobVisualId: "skeleton_rogue",
          qty: 1,
        },
      },
      {
        id: "defeat_orc_shaman",
        summary: "Победить орка-шамана в лесу",
        objective: {
          kind: "kill_count" as const,
          mobVisualId: "orc_shaman",
          qty: 1,
        },
      },
      {
        id: "report_to_marcus",
        summary: "Доложить Маркусу о лесной тропе",
        objective: { kind: "talk_to" as const, npcId: "marcus" },
      },
    ],
  },
  {
    id: "catacombs_first_descent",
    title: "Первый след печати",
    description:
      "Катакомбы под деревней становятся опаснее с каждым этажом. Доберитесь до третьего этажа и проверьте сундук стража: там должен быть осколок, который докажет связь подземелья с туманом.",
    stages: [
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
        id: "reach_floor_3",
        summary: "Достичь 3-го этажа катакомб",
        objective: { kind: "dungeon_floor_reached" as const, floor: 3 },
      },
      {
        id: "clear_floor_3",
        summary: "Победить стража 3-го этажа",
        objective: { kind: "dungeon_cleared_to_floor" as const, floor: 3 },
      },
      {
        id: "open_floor_3_chest",
        summary: "Найти Осколок туманной печати в сундуке 3-го этажа",
        objective: {
          kind: "open_chest_contains_item" as const,
          chestId: "chest_dungeon_boss_f3",
          curatedId: FOG_SEAL_SHARD_ITEM_ID,
          qty: 1,
        },
      },
      {
        id: "report_shard_to_elena",
        summary: "Показать осколок Елене",
        objective: { kind: "talk_to" as const, npcId: "elena" },
      },
    ],
  },
  {
    id: "marcus_road_pressure",
    title: "Шум у старой дороги",
    description:
      "После первого следа печати Маркус просит сбить давление у лесной дороги. Если твари привыкнут подходить к деревне, следующий выход в катакомбы станет опаснее еще до входа.",
    stages: [
      {
        id: "defeat_skeleton_rogues",
        summary: "Победить скелетов-разбойников у лесной дороги ×2",
        objective: {
          kind: "kill_count" as const,
          mobVisualId: "skeleton_rogue",
          qty: 2,
        },
      },
      {
        id: "defeat_orc_shamans",
        summary: "Победить орков-шаманов у лесной дороги ×2",
        objective: {
          kind: "kill_count" as const,
          mobVisualId: "orc_shaman",
          qty: 2,
        },
      },
      {
        id: "report_pressure_to_marcus",
        summary: "Доложить Маркусу, что дорога стала тише",
        objective: { kind: "talk_to" as const, npcId: "marcus" },
      },
    ],
  },
  {
    id: "igor_deep_supplies",
    title: "Запас для нижних этажей",
    description:
      "Игорь не верит в героизм без сухой веревки и железа в сумке. Соберите материалы для ремонтного набора, чтобы следующий спуск не закончился у первой сломанной лестницы.",
    stages: [
      {
        id: "collect_iron_ore",
        summary: "Собрать железную руду ×4",
        objective: {
          kind: "collect_item" as const,
          curatedId: "iron_ore",
          qty: 4,
        },
      },
      {
        id: "collect_rope",
        summary: "Собрать мотки веревки ×2",
        objective: {
          kind: "collect_item" as const,
          curatedId: "rope_coil",
          qty: 2,
        },
      },
      {
        id: "report_supplies_to_igor",
        summary: "Показать Игорю запас для глубокого спуска",
        objective: { kind: "talk_to" as const, npcId: "igor" },
      },
    ],
  },
  {
    id: "catacombs_second_proof",
    title: "Второй узел печати",
    description:
      "Первый осколок показал направление, но не силу печати. Доберитесь до шестого этажа, зачистите его стража и принесите Елене подтверждение, что нижние узлы держат туман плотнее верхних.",
    stages: [
      {
        id: "reach_floor_6",
        summary: "Достичь 6-го этажа катакомб",
        objective: { kind: "dungeon_floor_reached" as const, floor: 6 },
      },
      {
        id: "clear_floor_6",
        summary: "Победить стража 6-го этажа",
        objective: { kind: "dungeon_cleared_to_floor" as const, floor: 6 },
      },
      {
        id: "report_second_proof_to_elena",
        summary: "Рассказать Елене о втором узле печати",
        objective: { kind: "talk_to" as const, npcId: "elena" },
      },
    ],
  },
  {
    id: "escape_village",
    title: "Сквозь туман",
    description:
      "Осколок подтвердил связь катакомб с туманом. Спуститесь глубже, зачистите все этажи и победите Короля гоблинов на нижнем пороге — тогда дорога наружу должна открыться.",
    stages: [
      {
        id: "clear_catacombs",
        summary: `Победить Короля гоблинов на ${DUNGEON_MAX_FLOOR}-м этаже катакомб`,
        objective: {
          kind: "dungeon_cleared_to_floor" as const,
          floor: DUNGEON_MAX_FLOOR,
        },
      },
      {
        id: "report_back",
        summary: "Доложить Маркусу о победе в катакомбах",
        objective: { kind: "talk_to" as const, npcId: "marcus" },
      },
    ],
  },
];

export const QUEST_CHAIN_IDS: readonly string[] = RAW_QUESTS.map((q) => q.id);

export const QUESTS: QuestDef[] = RAW_QUESTS.map((q) => questDefSchema.parse(q));

export const QUESTS_BY_ID: Record<string, QuestDef> = Object.fromEntries(
  QUESTS.map((q) => [q.id, q])
);
