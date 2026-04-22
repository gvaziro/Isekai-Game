import { describe, expect, it } from "vitest";
import { ACHIEVEMENTS } from "@/src/game/data/achievements";
import {
  ACHIEVEMENT_TREE,
  collectAchievementIdsFromTree,
} from "@/src/game/data/achievementTree";
import { initialLifetimeStats } from "@/src/game/data/lifetimeStats";
import {
  buildAchievementSnapshot,
  computeNewlyUnlockedAchievementIds,
  getAchievementProgressForCondition,
} from "@/src/game/systems/achievementEngine";

describe("computeNewlyUnlockedAchievementIds", () => {
  it("не дублирует уже разблокированные", () => {
    const snap = buildAchievementSnapshot({
      lifetimeStats: { ...initialLifetimeStats(), enemiesKilled: 100 },
      characterLevel: 10,
      dungeonMaxClearedFloor: 5,
      questsCompleted: 0,
    });
    const unlocked = { first_blood: 1, hunter_25: 1 };
    const next = computeNewlyUnlockedAchievementIds(unlocked, snap);
    expect(next).not.toContain("first_blood");
    expect(next).not.toContain("hunter_25");
  });

  it("разблокирует first_blood при первом убийстве", () => {
    const snap = buildAchievementSnapshot({
      lifetimeStats: { ...initialLifetimeStats(), enemiesKilled: 1 },
      characterLevel: 1,
      dungeonMaxClearedFloor: 0,
      questsCompleted: 0,
    });
    expect(computeNewlyUnlockedAchievementIds({}, snap)).toContain("first_blood");
  });

  it("level_gte срабатывает на уровне", () => {
    const snap = buildAchievementSnapshot({
      lifetimeStats: initialLifetimeStats(),
      characterLevel: 5,
      dungeonMaxClearedFloor: 0,
      questsCompleted: 0,
    });
    expect(computeNewlyUnlockedAchievementIds({}, snap)).toContain("level_5");
  });

  it("dungeon_max_floor_gte", () => {
    const snap = buildAchievementSnapshot({
      lifetimeStats: initialLifetimeStats(),
      characterLevel: 1,
      dungeonMaxClearedFloor: 1,
      questsCompleted: 0,
    });
    expect(computeNewlyUnlockedAchievementIds({}, snap)).toContain(
      "dungeon_floor_1"
    );
  });
});

describe("каталог достижений", () => {
  it("id уникальны", () => {
    const ids = ACHIEVEMENTS.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("дерево достижений содержит ровно все id из каталога", () => {
    const fromTree = new Set(collectAchievementIdsFromTree(ACHIEVEMENT_TREE));
    const fromCatalog = new Set(ACHIEVEMENTS.map((a) => a.id));
    expect(fromTree).toEqual(fromCatalog);
  });
});

describe("getAchievementProgressForCondition", () => {
  it("lifetime_gte: процент от текущего к цели", () => {
    const snap = buildAchievementSnapshot({
      lifetimeStats: { ...initialLifetimeStats(), enemiesKilled: 3 },
      characterLevel: 1,
      dungeonMaxClearedFloor: 0,
      questsCompleted: 0,
    });
    const p = getAchievementProgressForCondition(
      { kind: "lifetime_gte", key: "enemiesKilled", value: 10 },
      snap
    );
    expect(p).toMatchObject({
      current: 3,
      target: 10,
      percent: 30,
    });
  });

  it("and: минимальный процент среди частей", () => {
    const snap = buildAchievementSnapshot({
      lifetimeStats: { ...initialLifetimeStats(), enemiesKilled: 50 },
      characterLevel: 8,
      dungeonMaxClearedFloor: 0,
      questsCompleted: 1,
    });
    const p = getAchievementProgressForCondition(
      {
        kind: "and",
        parts: [
          { kind: "level_gte", value: 10 },
          { kind: "lifetime_gte", key: "enemiesKilled", value: 100 },
        ],
      },
      snap
    );
    expect(p?.isCompoundMin).toBe(true);
    expect(p?.percent).toBe(50);
  });

  it("quests_completed_gte", () => {
    const snap = buildAchievementSnapshot({
      lifetimeStats: initialLifetimeStats(),
      characterLevel: 1,
      dungeonMaxClearedFloor: 0,
      questsCompleted: 1,
    });
    expect(
      getAchievementProgressForCondition(
        { kind: "quests_completed_gte", value: 2 },
        snap
      )?.percent
    ).toBe(50);
  });
});

describe("идемпотентность uniqueChestsOpened (логика)", () => {
  it("повторное открытие того же id не должно увеличивать счётчик — проверка условия", () => {
    const opened: Record<string, boolean> = {};
    const bump = (chestId: string) => {
      const was = opened[chestId] === true;
      opened[chestId] = true;
      return was ? 0 : 1;
    };
    expect(bump("c1")).toBe(1);
    expect(bump("c1")).toBe(0);
    expect(bump("c2")).toBe(1);
  });
});
