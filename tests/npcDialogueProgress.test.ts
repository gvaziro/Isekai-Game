import { beforeEach, describe, expect, it } from "vitest";
import {
  STARTER_NPC_AI_LORE_FACT_IDS,
  hasStarterNpcAiLoreAccess,
  isNpcIntroCompleted,
} from "@/src/game/data/npcDialogueProgress";
import {
  resetNpcDialogueProgressToNewGame,
  useNpcDialogueProgressStore,
} from "@/src/game/state/npcDialogueProgressStore";

describe("npc dialogue progress", () => {
  beforeEach(() => {
    resetNpcDialogueProgressToNewGame();
  });

  it("сохраняет прохождение intro по NPC и версии", () => {
    useNpcDialogueProgressStore
      .getState()
      .markNpcIntroCompleted("marcus", 1);

    const completed =
      useNpcDialogueProgressStore.getState().completedIntroByNpcId;
    expect(isNpcIntroCompleted(completed, "marcus", 1)).toBe(true);
    expect(isNpcIntroCompleted(completed, "marcus", 2)).toBe(false);
    expect(isNpcIntroCompleted(completed, "elena", 1)).toBe(false);
  });

  it("не считает дневник прохождением intro", () => {
    const unlocked = [...STARTER_NPC_AI_LORE_FACT_IDS];
    expect(hasStarterNpcAiLoreAccess(unlocked)).toBe(true);
    expect(
      isNpcIntroCompleted(
        useNpcDialogueProgressStore.getState().completedIntroByNpcId,
        "igor",
        1
      )
    ).toBe(false);
  });

  it("закрывает AI-gate только после всех стартовых фактов", () => {
    expect(hasStarterNpcAiLoreAccess([])).toBe(false);
    expect(hasStarterNpcAiLoreAccess(["places.village", "misc.journal"])).toBe(
      false
    );
    expect(hasStarterNpcAiLoreAccess([...STARTER_NPC_AI_LORE_FACT_IDS])).toBe(
      true
    );
  });
});
