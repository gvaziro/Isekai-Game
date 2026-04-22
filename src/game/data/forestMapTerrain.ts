import { FOREST_MAP_CELL } from "@/src/game/data/forestMap";
import {
  type ForestChunkPayload,
  generateForestChunkPayload,
  worldToForestChunk,
} from "@/src/game/locations/forestChunkGen";
import { pointInSegment } from "@/src/game/locations/types";

export type ForestMinimapTerrainKind =
  | "void"
  | "path"
  | "tree"
  | "rock"
  | "bush"
  | "grass";

const PATH_MARGIN = 14;

/**
 * Цвет клетки мини-карты по типу местности (согласован с тёмным UI).
 */
export const FOREST_MINIMAP_COLORS: Record<ForestMinimapTerrainKind, string> = {
  void: "#050506",
  grass: "#2d4a28",
  path: "#6b5344",
  tree: "#166534",
  rock: "#64748b",
  bush: "#3f7d4a",
};

/**
 * Один раз на кадр отрисовки: кэш чанков по ключу `cx,cy`.
 */
export function createForestMinimapChunkCache(): Map<string, ForestChunkPayload> {
  return new Map();
}

export function sampleForestMinimapTerrain(
  gx: number,
  gy: number,
  worldSeed: number,
  chunkCache: Map<string, ForestChunkPayload>
): ForestMinimapTerrainKind {
  const wx = (gx + 0.5) * FOREST_MAP_CELL;
  const wy = (gy + 0.5) * FOREST_MAP_CELL;
  const { cx, cy } = worldToForestChunk(wx, wy);
  if (cy < 0) return "void";

  const ck = `${cx},${cy}`;
  let payload = chunkCache.get(ck);
  if (!payload) {
    payload = generateForestChunkPayload(cx, cy, worldSeed);
    chunkCache.set(ck, payload);
  }

  if (payload.pathSegments.some((s) => pointInSegment(wx, wy, s, PATH_MARGIN))) {
    return "path";
  }

  for (const p of payload.imageProps) {
    const t = p.texture.toLowerCase();
    const d = Math.hypot(p.x - wx, p.y - wy);
    if (t.startsWith("tree") && d < 38) return "tree";
    if (t.startsWith("rock") && d < 26) return "rock";
    if (t.startsWith("bush") && d < 22) return "bush";
  }

  return "grass";
}
