import { describe, expect, it } from "vitest";
import {
  FOREST_PROCEDURAL_TREE_MAX,
  FOREST_PROCEDURAL_TREE_MIN_DIST,
  generateForestTreeProps,
} from "@/src/game/locations/forestTreeGen";
import { FOREST_LOCATION } from "@/src/game/locations/forest";
import {
  pointInSegment,
  type LayoutImageProp,
} from "@/src/game/locations/types";

function isTreeProp(p: LayoutImageProp): boolean {
  return p.texture.toLowerCase().startsWith("tree");
}

describe("generateForestTreeProps / FOREST_LOCATION", () => {
  it("never exceeds maxTrees and respects minDistance", () => {
    const trees = FOREST_LOCATION.imageProps.filter(isTreeProp);
    expect(trees.length).toBeGreaterThan(0);
    expect(trees.length).toBeLessThanOrEqual(FOREST_PROCEDURAL_TREE_MAX);

    const minSq = FOREST_PROCEDURAL_TREE_MIN_DIST * FOREST_PROCEDURAL_TREE_MIN_DIST;
    for (let i = 0; i < trees.length; i++) {
      for (let j = i + 1; j < trees.length; j++) {
        const a = trees[i]!;
        const b = trees[j]!;
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        expect(dx * dx + dy * dy).toBeGreaterThanOrEqual(minSq - 1e-6);
      }
    }
  });

  it("keeps trees outside the path corridor (same margin as generator)", () => {
    const marginPath = 36;
    const trees = FOREST_LOCATION.imageProps.filter(isTreeProp);
    const seg = FOREST_LOCATION.pathSegments[0]!;
    for (const t of trees) {
      expect(pointInSegment(t.x, t.y, seg, marginPath)).toBe(false);
    }
  });

  it("is deterministic for the same seed", () => {
    const base = {
      ...FOREST_LOCATION,
      imageProps: FOREST_LOCATION.imageProps.filter((p) => !isTreeProp(p)),
    };
    const a = generateForestTreeProps(base, { seed: 0xabc123 });
    const b = generateForestTreeProps(base, { seed: 0xabc123 });
    expect(a).toEqual(b);
  });
});
