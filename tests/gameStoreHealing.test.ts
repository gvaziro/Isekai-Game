import { afterEach, describe, expect, it } from "vitest";
import {
  createFreshPersistedGameState,
  useGameStore,
} from "@/src/game/state/gameStore";

afterEach(() => {
  useGameStore.setState(createFreshPersistedGameState());
});

describe("healCharacterHp", () => {
  it("heals by amount and clamps to max HP", () => {
    const base = createFreshPersistedGameState();
    useGameStore.setState({
      ...base,
      character: { ...base.character, hp: 5 },
    });

    const first = useGameStore.getState().healCharacterHp(3);
    expect(first.before).toBe(5);
    expect(first.after).toBe(8);
    expect(useGameStore.getState().character.hp).toBe(8);

    const second = useGameStore.getState().healCharacterHp(999);
    expect(second.after).toBe(second.maxHp);
    expect(useGameStore.getState().character.hp).toBe(second.maxHp);
  });
});
