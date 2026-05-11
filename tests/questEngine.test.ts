import { describe, expect, it } from "vitest";
import type { QuestDef } from "@/src/game/data/schemas/quest";
import {
  tickQuestState,
  type QuestEvalContext,
} from "@/src/game/systems/questEngine";

function ctx(overrides: Partial<QuestEvalContext> = {}): QuestEvalContext {
  return {
    playerX: 0,
    playerY: 0,
    inventoryCount: () => 0,
    craftedRecipeCount: () => 0,
    enemyKillCount: () => 0,
    chestContainsItem: () => 0,
    dungeonCurrentFloor: 1,
    dungeonMaxClearedFloor: 0,
    ...overrides,
  };
}

function quest(objective: QuestDef["stages"][number]["objective"]): QuestDef {
  return {
    id: "q",
    title: "Quest",
    description: "Quest",
    stages: [{ id: "s", summary: "Stage", objective }],
  };
}

describe("questEngine objectives", () => {
  it("completes collect_item from current inventory", () => {
    const q = quest({ kind: "collect_item", curatedId: "item588", qty: 6 });
    const r = tickQuestState(
      { q },
      { questId: "q", stageIndex: 0 },
      [],
      ctx({ inventoryCount: (id) => (id === "item588" ? 6 : 0) }),
      { type: "reevaluate" }
    );

    expect(r.completedQuestIds).toEqual(["q"]);
  });

  it("completes craft_recipe from persisted craft stats", () => {
    const q = quest({
      kind: "craft_recipe",
      recipeId: "rope_from_mats_workbench",
      qty: 1,
    });
    const r = tickQuestState(
      { q },
      { questId: "q", stageIndex: 0 },
      [],
      ctx({
        craftedRecipeCount: (id) =>
          id === "rope_from_mats_workbench" ? 1 : 0,
      }),
      { type: "reevaluate" }
    );

    expect(r.completedQuestIds).toEqual(["q"]);
  });

  it("completes kill_count by mob visual id", () => {
    const q = quest({
      kind: "kill_count",
      mobVisualId: "skeleton_rogue",
      qty: 1,
    });
    const r = tickQuestState(
      { q },
      { questId: "q", stageIndex: 0 },
      [],
      ctx({
        enemyKillCount: ({ mobVisualId }) =>
          mobVisualId === "skeleton_rogue" ? 1 : 0,
      }),
      { type: "reevaluate" }
    );

    expect(r.completedQuestIds).toEqual(["q"]);
  });

  it("completes dungeon_floor_reached from current floor", () => {
    const q = quest({ kind: "dungeon_floor_reached", floor: 3 });
    const r = tickQuestState(
      { q },
      { questId: "q", stageIndex: 0 },
      [],
      ctx({ dungeonCurrentFloor: 3 }),
      { type: "reevaluate" }
    );

    expect(r.completedQuestIds).toEqual(["q"]);
  });

  it("completes dungeon_floor_reached from cleared floor progress", () => {
    const q = quest({ kind: "dungeon_floor_reached", floor: 3 });
    const r = tickQuestState(
      { q },
      { questId: "q", stageIndex: 0 },
      [],
      ctx({ dungeonCurrentFloor: 1, dungeonMaxClearedFloor: 3 }),
      { type: "reevaluate" }
    );

    expect(r.completedQuestIds).toEqual(["q"]);
  });

  it("completes open_chest_contains_item from chest slots", () => {
    const q = quest({
      kind: "open_chest_contains_item",
      chestId: "chest_dungeon_boss_f3",
      curatedId: "fog_seal_shard",
      qty: 1,
    });
    const r = tickQuestState(
      { q },
      { questId: "q", stageIndex: 0 },
      [],
      ctx({
        chestContainsItem: (chestId, curatedId) =>
          chestId === "chest_dungeon_boss_f3" &&
          curatedId === "fog_seal_shard"
            ? 1
            : 0,
      }),
      { type: "chest_opened", chestId: "chest_dungeon_boss_f3" }
    );

    expect(r.completedQuestIds).toEqual(["q"]);
  });

  it("does not complete talk_to from dialogue_close alone", () => {
    const q = quest({ kind: "talk_to", npcId: "marcus" });
    const r = tickQuestState(
      { q },
      { questId: "q", stageIndex: 0 },
      [],
      ctx(),
      { type: "dialogue_close", npcId: "marcus" }
    );

    expect(r.completedQuestIds).toEqual([]);
    expect(r.active).toEqual({ questId: "q", stageIndex: 0 });
  });

  it("completes talk_to from npc_script_completed for the matching npc", () => {
    const q = quest({ kind: "talk_to", npcId: "marcus" });
    const r = tickQuestState(
      { q },
      { questId: "q", stageIndex: 0 },
      [],
      ctx(),
      {
        type: "npc_script_completed",
        npcId: "marcus",
        questId: "q",
        stageId: "s",
      }
    );

    expect(r.completedQuestIds).toEqual(["q"]);
  });

  it("does not complete talk_to from npc_script_completed for another npc", () => {
    const q = quest({ kind: "talk_to", npcId: "marcus" });
    const r = tickQuestState(
      { q },
      { questId: "q", stageIndex: 0 },
      [],
      ctx(),
      {
        type: "npc_script_completed",
        npcId: "elena",
        questId: "q",
        stageId: "s",
      }
    );

    expect(r.completedQuestIds).toEqual([]);
    expect(r.active).toEqual({ questId: "q", stageIndex: 0 });
  });
});
