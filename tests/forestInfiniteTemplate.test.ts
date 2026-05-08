import { describe, expect, it, afterEach } from "vitest";
import { generateForestChunkPayload } from "@/src/game/locations/forestChunkGen";
import { getForestInfiniteTemplateLocation } from "@/src/game/locations/forestInfinite";
import { registerForestWorldSeedReader } from "@/src/game/locations/forestTemplateSeed";
import { useGameStore } from "@/src/game/state/gameStore";

describe("forest infinite template vs chunk trail", () => {
  afterEach(() => {
    registerForestWorldSeedReader(() => useGameStore.getState().forestWorldSeed);
  });

  it("pathSegments match hub chunk payload when seed reader is set", () => {
    const seed = 0xfeedf00d;
    registerForestWorldSeedReader(() => seed);
    const loc = getForestInfiniteTemplateLocation();
    const chunk = generateForestChunkPayload(0, 0, seed);
    expect(loc.pathSegments).toEqual(chunk.pathSegments);
  });

  it("with zero seed reader, template still uses getMainTrail (seed 0)", () => {
    registerForestWorldSeedReader(() => 0);
    const loc = getForestInfiniteTemplateLocation();
    const chunk = generateForestChunkPayload(0, 0, 0);
    expect(loc.pathSegments).toEqual(chunk.pathSegments);
  });
});
