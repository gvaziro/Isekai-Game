import { describe, expect, it } from "vitest";
import {
  SAVE_VERSION,
  migrateMarcusVillageIntroWalkDone,
} from "@/src/game/state/gameStore";

describe("migrateMarcusVillageIntroWalkDone", () => {
  it("явный false остаётся false", () => {
    expect(migrateMarcusVillageIntroWalkDone(SAVE_VERSION, false)).toBe(false);
  });

  it("явный true остаётся true", () => {
    expect(migrateMarcusVillageIntroWalkDone(1, true)).toBe(true);
  });

  it("старый сейв без поля и saveVersion < SAVE_VERSION → true", () => {
    expect(migrateMarcusVillageIntroWalkDone(36, undefined)).toBe(true);
  });

  it("сейв без поля при неизвестной версии → false", () => {
    expect(migrateMarcusVillageIntroWalkDone(undefined, undefined)).toBe(false);
  });
});
