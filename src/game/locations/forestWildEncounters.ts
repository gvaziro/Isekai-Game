import {
  FOREST_CHUNK_H,
  FOREST_CHUNK_W,
  generateForestChunkPayload,
  isForestChunkAllowed,
  mixForestChunkSeed,
} from "@/src/game/locations/forestChunkGen";
import type { LocationEnemySpawn } from "@/src/game/locations/types";
import { mulberry32, pointInSegment } from "@/src/game/locations/types";

const MOBS = [
  { mobVisualId: "orc_warrior", lootTable: "grunt" },
  { mobVisualId: "skeleton_rogue", lootTable: "grunt" },
  { mobVisualId: "orc_shaman", lootTable: "grunt" },
  { mobVisualId: "skeleton_warrior", lootTable: "grunt" },
] as const;

export function wildForestMobInstanceId(
  visitSalt: number,
  cx: number,
  cy: number,
  slot: number
): string {
  return `forest_w_${visitSalt}_${cx}_${cy}_${slot}`;
}

/** Возвращает ключ чанка `cx,cy` для `ForestChunkManager`, либо null. */
export function parseWildForestMobChunkKey(instanceId: string): string | null {
  const m = /^forest_w_\d+_(-?\d+)_(-?\d+)_\d+$/.exec(instanceId);
  if (!m) return null;
  return `${m[1]},${m[2]}`;
}

export function isForestWildDynamicMobId(instanceId: string): boolean {
  return /^forest_w_\d+_-?\d+_-?\d+_\d+$/.test(instanceId);
}

function mobCountForChunk(cy: number): number {
  if (cy >= 5) return 3;
  if (cy >= 2) return 2;
  return 1;
}

export function wildMobSlotsForChunk(cy: number): number[] {
  const n = mobCountForChunk(cy);
  return Array.from({ length: n }, (_, i) => i);
}

function pickPointInChunk(
  cx: number,
  cy: number,
  worldSeed: number,
  visitSalt: number,
  slot: number,
  payload: ReturnType<typeof generateForestChunkPayload>,
  rand: () => number
): { x: number; y: number } {
  const ox = cx * FOREST_CHUNK_W;
  const oy = cy * FOREST_CHUNK_H;
  const segs = payload.pathSegments;
  if (segs.length > 0) {
    const s = segs[0]!;
    if (s.w > 56 && s.h > 100) {
      return {
        x: s.x + 28 + rand() * (s.w - 56),
        y: s.y + 50 + rand() * (s.h - 100),
      };
    }
  }
  for (let a = 0; a < 36; a++) {
    const x = ox + 56 + rand() * (FOREST_CHUNK_W - 112);
    const y = oy + 56 + rand() * (FOREST_CHUNK_H - 112);
    if (payload.pathSegments.some((seg) => pointInSegment(x, y, seg, 40))) {
      continue;
    }
    let ok = true;
    for (const p of payload.imageProps) {
      const t = p.texture.toLowerCase();
      const d = Math.hypot(p.x - x, p.y - y);
      if (t.startsWith("tree") && d < 44) {
        ok = false;
        break;
      }
      if (t.startsWith("rock") && d < 30) {
        ok = false;
        break;
      }
    }
    if (ok) return { x, y };
  }
  return { x: ox + FOREST_CHUNK_W / 2, y: oy + FOREST_CHUNK_H / 2 };
}

export function createForestWildMobSpawn(
  cx: number,
  cy: number,
  slot: number,
  visitSalt: number,
  worldSeed: number
): LocationEnemySpawn | null {
  if (!isForestChunkAllowed(cx, cy)) return null;
  if (cx === 0 && cy === 0) return null;
  const seed =
    (mixForestChunkSeed(worldSeed, cx, cy) ^
      (Math.imul(visitSalt, 0x9e3779b1) >>> 0) ^
      Math.imul(slot + 1, 65537)) >>>
    0;
  const rand = mulberry32(seed);
  const payload = generateForestChunkPayload(cx, cy, worldSeed);
  const pt = pickPointInChunk(cx, cy, worldSeed, visitSalt, slot, payload, rand);
  const mob = MOBS[(rand() * MOBS.length) | 0] ?? MOBS[0]!;
  return {
    id: wildForestMobInstanceId(visitSalt, cx, cy, slot),
    zoneId: `wild_${cx}_${cy}`,
    x: pt.x,
    y: pt.y,
    lootTable: mob.lootTable,
    mobVisualId: mob.mobVisualId,
  };
}
