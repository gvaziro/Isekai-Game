import { describe, expect, it } from "vitest";
import { shiftHotbarIndex, wrapHotbarIndex } from "@/src/game/hotbarIndex";

describe("wrapHotbarIndex", () => {
  it("нормализует в диапазон 0..len-1", () => {
    expect(wrapHotbarIndex(0, 9)).toBe(0);
    expect(wrapHotbarIndex(8, 9)).toBe(8);
    expect(wrapHotbarIndex(9, 9)).toBe(0);
    expect(wrapHotbarIndex(-1, 9)).toBe(8);
  });
});

describe("shiftHotbarIndex", () => {
  it("шаг вперёд и назад с wrap", () => {
    expect(shiftHotbarIndex(0, 1, 9)).toBe(1);
    expect(shiftHotbarIndex(8, 1, 9)).toBe(0);
    expect(shiftHotbarIndex(0, -1, 9)).toBe(8);
  });

  it("ноль шагов не меняет индекс", () => {
    expect(shiftHotbarIndex(3, 0, 9)).toBe(3);
  });
});
