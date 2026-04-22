import { describe, expect, it } from "vitest";
import {
  createForestWildMobSpawn,
  isForestWildDynamicMobId,
  parseWildForestMobChunkKey,
  wildForestMobInstanceId,
  wildMobSlotsForChunk,
} from "@/src/game/locations/forestWildEncounters";

describe("forestWildEncounters", () => {
  it("no wild spawns on hub chunk 0,0", () => {
    expect(createForestWildMobSpawn(0, 0, 0, 42, 99)).toBeNull();
  });

  it("parses chunk key from instance id", () => {
    const id = wildForestMobInstanceId(7, -1, 3, 1);
    expect(parseWildForestMobChunkKey(id)).toBe("-1,3");
    expect(isForestWildDynamicMobId(id)).toBe(true);
  });

  it("creates stable spawn for fixed seed/slot", () => {
    const a = createForestWildMobSpawn(0, 1, 0, 12345, 0xabc);
    const b = createForestWildMobSpawn(0, 1, 0, 12345, 0xabc);
    expect(a).not.toBeNull();
    expect(b).not.toBeNull();
    expect(a!.x).toBe(b!.x);
    expect(a!.y).toBe(b!.y);
    expect(a!.id).toBe(b!.id);
    expect(a!.mobVisualId).toBeTruthy();
  });

  it("different visit salt gives different ids", () => {
    const a = createForestWildMobSpawn(1, 1, 0, 1, 1)!;
    const b = createForestWildMobSpawn(1, 1, 0, 2, 1)!;
    expect(a.id).not.toBe(b.id);
  });

  it("wildMobSlotsForChunk increases with depth", () => {
    expect(wildMobSlotsForChunk(0).length).toBe(1);
    expect(wildMobSlotsForChunk(2).length).toBe(2);
    expect(wildMobSlotsForChunk(5).length).toBe(3);
  });
});
