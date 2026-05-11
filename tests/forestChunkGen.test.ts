import { describe, expect, it } from "vitest";
import {
  FOREST_CHUNK_H,
  FOREST_CHUNK_W,
  FOREST_HUB_SPAWNS,
  forestTreePatchDensity01,
  generateForestChunkPayload,
  getMainTrailSegmentsForChunk,
  mixForestChunkSeed,
  pointIsInForestMainTrail,
} from "@/src/game/locations/forestChunkGen";

describe("forestChunkGen", () => {
  it("mixForestChunkSeed is deterministic", () => {
    expect(mixForestChunkSeed(0xabc, 2, -1)).toBe(mixForestChunkSeed(0xabc, 2, -1));
  });

  it("generateForestChunkPayload is stable per seed and chunk", () => {
    const a = generateForestChunkPayload(1, -1, 0xdeadbeef);
    const b = generateForestChunkPayload(1, -1, 0xdeadbeef);
    expect(a.imageProps).toEqual(b.imageProps);
    expect(a.grassDecor).toEqual(b.grassDecor);
  });

  it("wild chunk south of hub includes main trail path segments", () => {
    const seed = 0x12345678;
    const wild = generateForestChunkPayload(0, 1, seed);
    expect(wild.pathSegments.length).toBeGreaterThan(0);
    const seg = wild.pathSegments[0]!;
    expect(seg.w).toBeGreaterThan(0);
    expect(seg.h).toBeGreaterThan(0);
    expect(getMainTrailSegmentsForChunk(0, 1, seed)).toEqual(wild.pathSegments);
  });

  it("hub chunk has spacing for trees (кластеры могут быть ближе якорей)", () => {
    const hub = generateForestChunkPayload(0, 0, 0x12345678);
    const minPairSq = 28 * 28;
    const trees = hub.imageProps.filter((p) =>
      p.texture.toLowerCase().startsWith("tree")
    );
    expect(trees.length).toBeGreaterThan(0);
    for (let i = 0; i < trees.length; i++) {
      for (let j = i + 1; j < trees.length; j++) {
        const a = trees[i]!;
        const b = trees[j]!;
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        expect(dx * dx + dy * dy).toBeGreaterThanOrEqual(minPairSq - 1);
      }
    }
    for (const t of trees) {
      expect(t.x).toBeGreaterThanOrEqual(0);
      expect(t.x).toBeLessThanOrEqual(FOREST_CHUNK_W);
      expect(t.y).toBeGreaterThanOrEqual(0);
      expect(t.y).toBeLessThanOrEqual(FOREST_CHUNK_H);
    }
  });

  it("hub trees keep clear of main trail (wider margin)", () => {
    const seed = 0xabcdef01;
    const hub = generateForestChunkPayload(0, 0, seed);
    const trees = hub.imageProps.filter((p) =>
      p.texture.toLowerCase().startsWith("tree")
    );
    expect(trees.length).toBeGreaterThan(0);
    for (const t of trees) {
      expect(pointIsInForestMainTrail(t.x, t.y, 50, seed)).toBe(false);
    }
  });

  it("wild trees keep clear of trail corridor", () => {
    const seed = 0x55aa55aa;
    const wild = generateForestChunkPayload(0, 1, seed);
    const trees = wild.imageProps.filter((p) =>
      p.texture.toLowerCase().startsWith("tree")
    );
    expect(trees.length).toBeGreaterThan(0);
    for (const t of trees) {
      expect(pointIsInForestMainTrail(t.x, t.y, 58, seed)).toBe(false);
    }
  });

  it("forestTreePatchDensity01 is bounded", () => {
    for (let i = 0; i < 40; i++) {
      const d = forestTreePatchDensity01(i * 17, i * 23, 0x9e3779b9);
      expect(d).toBeGreaterThanOrEqual(0.21);
      expect(d).toBeLessThanOrEqual(1.01);
    }
  });

  it("hub chunk includes fixed spawn note pickup (item629)", () => {
    const hub = generateForestChunkPayload(0, 0, 0x99aabbcc);
    const note = hub.forestForage.find((f) => f.id === "forest_hub_spawn_note_v1");
    expect(note).toBeDefined();
    expect(note!.curatedId).toBe("item629");
    expect(note!.qty).toBe(1);
    expect(note!.x).toBe(FOREST_HUB_SPAWNS.default.x);
    expect(note!.y).toBe(FOREST_HUB_SPAWNS.default.y + 22);
  });
});
