import { describe, expect, it } from "vitest";
import {
  getPlayerAttackCooldownMs,
  getPlayerEvadeChance,
  migrateAttrsFromLegacyLevel,
} from "@/src/game/data/balance";
import { getDerivedCombatStats } from "@/src/game/rpg/derivedStats";
import { ZERO_ATTRIBUTES } from "@/src/game/rpg/characterAttributes";

describe("migrateAttrsFromLegacyLevel", () => {
  it("уровень 1: миграция без старых распределяемых очков, но с компенсацией HP/STA от уровня", () => {
    expect(migrateAttrsFromLegacyLevel(1)).toEqual({
      str: 0,
      agi: 0,
      vit: 1,
      tgh: 0,
      end: 1,
      mob: 0,
    });
  });

  it("растёт с уровнем (миграция со старой формулы)", () => {
    const a5 = migrateAttrsFromLegacyLevel(5);
    const a10 = migrateAttrsFromLegacyLevel(10);
    expect(a10.str).toBeGreaterThanOrEqual(a5.str);
    expect(a10.tgh).toBeGreaterThanOrEqual(a5.tgh);
    expect(a10.vit).toBeGreaterThanOrEqual(a5.vit);
    expect(a10.end).toBeGreaterThanOrEqual(a5.end);
    expect(a10.mob).toBeGreaterThanOrEqual(a5.mob);
  });
});

describe("getPlayerAttackCooldownMs", () => {
  it("базовые нулевые статы дают базовое кд", () => {
    expect(getPlayerAttackCooldownMs(ZERO_ATTRIBUTES)).toBe(340);
  });

  it("больше mob и agi не опускают кд ниже минимума", () => {
    const cd = getPlayerAttackCooldownMs({
      str: 0,
      agi: 200,
      vit: 0,
      tgh: 0,
      end: 0,
      mob: 200,
    });
    expect(cd).toBeGreaterThanOrEqual(200);
    expect(cd).toBeLessThanOrEqual(340);
  });
});

describe("getPlayerEvadeChance", () => {
  it("ограничено сверху", () => {
    expect(getPlayerEvadeChance(999, 1)).toBeLessThanOrEqual(0.4);
  });

  it("снижается с уровнем врага при той же ловкости", () => {
    const low = getPlayerEvadeChance(40, 1);
    const high = getPlayerEvadeChance(40, 50);
    expect(high).toBeLessThan(low);
  });
});

describe("getDerivedCombatStats", () => {
  it("больше силы не уменьшает atk", () => {
    const low = getDerivedCombatStats(5, {}, undefined, { ...ZERO_ATTRIBUTES, str: 2 });
    const high = getDerivedCombatStats(5, {}, undefined, { ...ZERO_ATTRIBUTES, str: 8 });
    expect(high.atk).toBeGreaterThan(low.atk);
  });

  it("больше стойкости не уменьшает def", () => {
    const low = getDerivedCombatStats(5, {}, undefined, { ...ZERO_ATTRIBUTES, tgh: 1 });
    const high = getDerivedCombatStats(5, {}, undefined, { ...ZERO_ATTRIBUTES, tgh: 5 });
    expect(high.def).toBeGreaterThan(low.def);
  });
});
