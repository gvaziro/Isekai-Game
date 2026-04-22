import { describe, expect, it } from "vitest";
import {
  forestCellKey,
  parseForestCellKey,
  revealForestCellKeysAround,
  sanitizeForestRevealedCellsPersist,
  worldToForestCell,
} from "@/src/game/data/forestMap";

describe("forestMap", () => {
  it("worldToForestCell handles negatives", () => {
    expect(worldToForestCell(-1, -1)).toEqual({ gx: -1, gy: -1 });
    expect(worldToForestCell(0, 0)).toEqual({ gx: 0, gy: 0 });
  });

  it("round-trips forest cell keys", () => {
    const k = forestCellKey(-3, 12);
    expect(parseForestCellKey(k)).toEqual({ gx: -3, gy: 12 });
    expect(parseForestCellKey("dungeon:1,2")).toBeNull();
  });

  it("revealForestCellKeysAround is deterministic disk", () => {
    const keys = revealForestCellKeysAround(0, 0, 2);
    expect(keys.length).toBeGreaterThan(0);
    expect(keys.every((k) => k.startsWith("forest:"))).toBe(true);
  });

  it("sanitizeForestRevealedCellsPersist filters junk", () => {
    const out = sanitizeForestRevealedCellsPersist({
      "forest:0,0": true,
      bad: true,
      "forest:x,y": true,
    });
    expect(out["forest:0,0"]).toBe(true);
    expect(out.bad).toBeUndefined();
  });
});
