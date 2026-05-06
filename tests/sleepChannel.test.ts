import { describe, expect, it } from "vitest";
import {
  computeSleepChannelRealMs,
  SLEEP_CHANNEL_MS,
  SLEEP_CHANNEL_MS_MAX,
  SLEEP_CHANNEL_MS_MIN,
  SLEEP_CHANNEL_REF_GAME_MINUTES,
} from "@/src/game/data/balance";

describe("computeSleepChannelRealMs", () => {
  it("matches base channel at reference sleep length", () => {
    expect(computeSleepChannelRealMs(SLEEP_CHANNEL_REF_GAME_MINUTES)).toBe(
      SLEEP_CHANNEL_MS
    );
  });

  it("clamps to minimum", () => {
    expect(computeSleepChannelRealMs(15)).toBe(SLEEP_CHANNEL_MS_MIN);
  });

  it("clamps to maximum", () => {
    const huge = SLEEP_CHANNEL_REF_GAME_MINUTES * 100;
    expect(computeSleepChannelRealMs(huge)).toBe(SLEEP_CHANNEL_MS_MAX);
  });
});
