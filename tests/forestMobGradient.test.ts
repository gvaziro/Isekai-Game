import { describe, expect, it } from "vitest";
import {
  forestDistanceFromTownEntry,
  forestMobLevelFromTemplate,
  forestRespawnDelayMultiplier,
  forestSpawnPresenceChance,
  forestThreatGradient01,
} from "@/src/game/data/forestMobGradient";
import { FOREST_HUB_SPAWNS } from "@/src/game/locations/forestChunkGen";

describe("forestMobGradient", () => {
  it("distance is zero at town entry spawn", () => {
    const { x, y } = FOREST_HUB_SPAWNS.from_town;
    expect(forestDistanceFromTownEntry(x, y)).toBe(0);
  });

  it("threat is 0 near crossroads grunt (closer than inner radius)", () => {
    const t = forestThreatGradient01(300, 360);
    expect(t).toBe(0);
  });

  it("threat grows with distance south", () => {
    const tNear = forestThreatGradient01(320, 900);
    const tFar = forestThreatGradient01(320, 3200);
    expect(tFar).toBeGreaterThan(tNear);
    expect(tFar).toBe(1);
  });

  it("mob level is 1 at hub crossroads for any template", () => {
    expect(forestMobLevelFromTemplate(3, 300, 360)).toBe(1);
  });

  it("respawn multiplier is higher near entry than far away", () => {
    const m0 = forestRespawnDelayMultiplier(
      FOREST_HUB_SPAWNS.from_town.x,
      FOREST_HUB_SPAWNS.from_town.y
    );
    const m1 = forestRespawnDelayMultiplier(320, 4000);
    expect(m0).toBeGreaterThan(m1);
  });

  it("spawn presence is lower near entry than far", () => {
    const p0 = forestSpawnPresenceChance(
      FOREST_HUB_SPAWNS.from_town.x,
      FOREST_HUB_SPAWNS.from_town.y
    );
    const p1 = forestSpawnPresenceChance(320, 4000);
    expect(p0).toBeLessThan(p1);
  });
});
