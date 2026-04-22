import { describe, expect, it } from "vitest";
import {
  createForestMinimapChunkCache,
  sampleForestMinimapTerrain,
} from "@/src/game/data/forestMapTerrain";
import { isForestChunkAllowed } from "@/src/game/locations/forestChunkGen";
import { generateForestChunkPayload } from "@/src/game/locations/forestChunkGen";

describe("forestMapTerrain / chunk rules", () => {
  it("isForestChunkAllowed blocks north", () => {
    expect(isForestChunkAllowed(0, -1)).toBe(false);
    expect(isForestChunkAllowed(0, 0)).toBe(true);
  });

  it("generateForestChunkPayload returns empty north of hub", () => {
    const p = generateForestChunkPayload(0, -1, 0x1234);
    expect(p.imageProps).toHaveLength(0);
    expect(p.grassDecor).toHaveLength(0);
  });

  it("sampleForestMinimapTerrain detects hub road cell", () => {
    const cache = createForestMinimapChunkCache();
    const seed = 0xabcdef;
    const kind = sampleForestMinimapTerrain(20, 10, seed, cache);
    expect(kind).toBe("path");
  });
});
