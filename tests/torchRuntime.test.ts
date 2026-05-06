import { describe, expect, it } from "vitest";
import { drainTorchGameMinutes } from "@/src/game/data/torchRuntime";
import {
  gameMinutesFromRealMs,
  REAL_MS_PER_GAME_DAY,
} from "@/src/game/time/dayNight";

describe("torch runtime", () => {
  it("drainTorchGameMinutes догорает до null", () => {
    expect(drainTorchGameMinutes({ remainingGameMinutes: 10 }, 10)).toBeNull();
    expect(drainTorchGameMinutes({ remainingGameMinutes: 10 }, 3)).toEqual({
      remainingGameMinutes: 7,
    });
  });

  it("gameMinutesFromRealMs согласовано с одним игровым днём за REAL_MS_PER_GAME_DAY", () => {
    const m = gameMinutesFromRealMs(REAL_MS_PER_GAME_DAY);
    expect(m).toBeCloseTo(24 * 60, 5);
  });
});
