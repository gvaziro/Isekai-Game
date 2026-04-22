import { describe, expect, it } from "vitest";
import {
  XP_TO_NEXT_BASE,
  applyXpDeathPenalty,
  xpEnemyKillForPlayer,
  xpDeathPenaltyLoseAmount,
  xpToNext,
} from "@/src/game/data/balance";

describe("xpToNext", () => {
  it("первый порог равен базе (100)", () => {
    expect(xpToNext(1)).toBe(XP_TO_NEXT_BASE);
  });

  it("растёт с уровнем (мягкая экспонента)", () => {
    expect(xpToNext(2)).toBeGreaterThan(xpToNext(1));
    expect(xpToNext(10)).toBeGreaterThan(xpToNext(9));
    expect(xpToNext(30)).toBeGreaterThan(xpToNext(29));
  });

  it("монотонность для уровней 1..60", () => {
    let prev = xpToNext(1);
    for (let L = 2; L <= 60; L++) {
      const cur = xpToNext(L);
      expect(cur).toBeGreaterThanOrEqual(prev);
      prev = cur;
    }
  });
});

describe("xpEnemyKillForPlayer", () => {
  it("моб выше игрока даёт больше, чем равный уровень", () => {
    const same = xpEnemyKillForPlayer(5, 5);
    const above = xpEnemyKillForPlayer(8, 5);
    expect(above).toBeGreaterThan(same);
  });

  it("моб ниже игрока даёт меньше, чем равный уровень", () => {
    const same = xpEnemyKillForPlayer(5, 5);
    const below = xpEnemyKillForPlayer(3, 5);
    expect(below).toBeLessThan(same);
  });

  it("минимум 1 XP за убийство", () => {
    expect(xpEnemyKillForPlayer(1, 99)).toBeGreaterThanOrEqual(1);
  });
});

describe("applyXpDeathPenalty", () => {
  it("только потеря XP без смены уровня", () => {
    const lose = xpDeathPenaltyLoseAmount(5, 200);
    const r = applyXpDeathPenalty(5, 200);
    expect(r.level).toBe(5);
    expect(r.xp).toBe(200 - lose);
  });

  it("падение на уровень ниже при большом штрафе", () => {
    const r = applyXpDeathPenalty(2, 0);
    expect(r.level).toBe(1);
    const lose = xpDeathPenaltyLoseAmount(2, 0);
    expect(r.xp).toBe(xpToNext(1) - lose);
  });

  it("на 1-м уровне xp не уходит в минус", () => {
    const r = applyXpDeathPenalty(1, 0);
    expect(r.level).toBe(1);
    expect(r.xp).toBe(0);
  });

  it("несколько уровней подряд при огромной потере", () => {
    const r = applyXpDeathPenalty(10, 0);
    expect(r.level).toBeGreaterThanOrEqual(1);
    expect(r.level).toBeLessThan(10);
    expect(r.xp).toBeGreaterThanOrEqual(0);
  });
});
