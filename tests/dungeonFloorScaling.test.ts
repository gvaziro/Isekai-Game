import { describe, expect, it } from "vitest";
import {
  canEnterDungeonFloor,
  clampDungeonFloor,
  DUNGEON_MAX_FLOOR,
  fastTravelAnchorsAvailable,
  getBossLevel,
  getDungeonSpawnIntervalMs,
  getDungeonSpawnMaxAlive,
  getGruntLevelRange,
  getMaxEnterableFloor,
} from "@/src/game/data/dungeonFloorScaling";

describe("dungeonFloorScaling", () => {
  it("clampDungeonFloor clamps to 1..100", () => {
    expect(clampDungeonFloor(0)).toBe(1);
    expect(clampDungeonFloor(1)).toBe(1);
    expect(clampDungeonFloor(100)).toBe(100);
    expect(clampDungeonFloor(101)).toBe(100);
  });

  it("getMaxEnterableFloor caps at DUNGEON_MAX_FLOOR", () => {
    expect(getMaxEnterableFloor(0)).toBe(1);
    expect(getMaxEnterableFloor(99)).toBe(100);
    expect(getMaxEnterableFloor(100)).toBe(100);
  });

  it("getBossLevel never exceeds 99", () => {
    expect(getBossLevel(100, 99)).toBeLessThanOrEqual(99);
    expect(getBossLevel(1, 1)).toBeGreaterThanOrEqual(1);
  });

  it("getGruntLevelRange stays within 1..99", () => {
    for (const f of [1, 50, 100]) {
      for (const p of [1, 50, 99]) {
        const r = getGruntLevelRange(f, p);
        expect(r.min).toBeGreaterThanOrEqual(1);
        expect(r.max).toBeLessThanOrEqual(99);
        expect(r.min).toBeLessThanOrEqual(r.max);
      }
    }
  });

  it("spawn density scales with floor", () => {
    const low = getDungeonSpawnMaxAlive(1);
    const high = getDungeonSpawnMaxAlive(100);
    expect(high).toBeGreaterThanOrEqual(low);
    expect(getDungeonSpawnIntervalMs(1)).toBeGreaterThanOrEqual(
      getDungeonSpawnIntervalMs(100)
    );
  });

  it("canEnterDungeonFloor: sequential and fast travel", () => {
    expect(canEnterDungeonFloor(1, 0)).toBe(true);
    expect(canEnterDungeonFloor(2, 0)).toBe(false);
    expect(canEnterDungeonFloor(2, 1)).toBe(true);
    expect(canEnterDungeonFloor(10, 9)).toBe(true);
    expect(canEnterDungeonFloor(10, 8)).toBe(false);
    expect(canEnterDungeonFloor(10, 10)).toBe(true);
  });

  it("fastTravelAnchorsAvailable lists milestones", () => {
    expect(fastTravelAnchorsAvailable(0)).toEqual([]);
    expect(fastTravelAnchorsAvailable(9)).toEqual([]);
    expect(fastTravelAnchorsAvailable(10)).toEqual([10]);
    expect(fastTravelAnchorsAvailable(25)).toEqual([10, 20]);
    expect(fastTravelAnchorsAvailable(100).length).toBe(10);
    expect(fastTravelAnchorsAvailable(100)[9]).toBe(100);
  });

  it("DUNGEON_MAX_FLOOR is 100", () => {
    expect(DUNGEON_MAX_FLOOR).toBe(100);
  });
});
