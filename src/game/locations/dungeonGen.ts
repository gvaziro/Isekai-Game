import {
  dungeonBossChestIdForFloor,
  registerDungeonLayoutForFloor,
} from "@/src/game/data/dungeonBoss";
import type { GameLocationJson } from "@/src/game/locations/locationSchema";
import { mulberry32 } from "@/src/game/locations/types";

/** Базовый сид; с этажом смешивается для уникальных катакомб. */
export const CATACOMBS_SEED = 0xca7ac0;

/** Размер тайла подземелья (Wall_Variations / Floors_Tiles — 16×16). */
const CELL = 16;

// Стены подземелья должны занимать нижнюю "базу" тайла, а не весь 16x16 кадр,
// иначе для героя с фут-хитбоксом блок ощущается висящим над стеной.
const WALL_COLL = { w: CELL, h: 10, oy: 5 } as const;
// Сундук масштабируется `getEffectivePropCollider()` от исходного source-slice.
const CHEST_COLL = { w: 26, h: 14, oy: 8 } as const;

const DUNGEON_TILESET_TEX = "pc_env_tilesets_dungeon_tiles";
const WALL_TEX = DUNGEON_TILESET_TEX;
const WALL_COLS = 25;
const frame = (col: number, row: number): number => row * WALL_COLS + col;

const WALL_TOP_FRAMES: number[] = [
  frame(0, 0),
  frame(1, 0),
  frame(2, 0),
];

const WALL_FACE_FRAMES: number[] = [
  frame(0, 1),
  frame(1, 1),
  frame(2, 1),
];

const FLOOR_TEX = DUNGEON_TILESET_TEX;
const FLOOR_FRAMES: number[] = [
  frame(4, 0),
  frame(5, 0),
  frame(6, 0),
  frame(7, 0),
  frame(4, 1),
  frame(5, 1),
  frame(6, 1),
  frame(7, 1),
  frame(4, 2),
  frame(5, 2),
  frame(6, 2),
  frame(7, 2),
];

type Rect = { x: number; y: number; w: number; h: number };
type Room = {
  x: number;
  y: number;
  w: number;
  h: number;
  cx: number;
  cy: number;
};

type BSPNode = { rect: Rect; left?: BSPNode; right?: BSPNode; room?: Room };

function key(gx: number, gy: number): string {
  return `${gx},${gy}`;
}

function splitRect(
  r: Rect,
  rand: () => number,
  minSplit: number
): [Rect, Rect] | null {
  const canV = r.w >= minSplit * 2;
  const canH = r.h >= minSplit * 2;
  if (!canV && !canH) return null;
  const preferV = canV && (!canH || rand() < 0.5);
  if (preferV) {
    const span = r.w - 2 * minSplit;
    const splitAt = r.x + minSplit + Math.floor(rand() * Math.max(1, span));
    return [
      { x: r.x, y: r.y, w: splitAt - r.x, h: r.h },
      { x: splitAt, y: r.y, w: r.x + r.w - splitAt, h: r.h },
    ];
  }
  const span = r.h - 2 * minSplit;
  const splitAt = r.y + minSplit + Math.floor(rand() * Math.max(1, span));
  return [
    { x: r.x, y: r.y, w: r.w, h: splitAt - r.y },
    { x: r.x, y: splitAt, w: r.w, h: r.y + r.h - splitAt },
  ];
}

function createRoomInLeaf(rect: Rect, rand: () => number): Room {
  const minRw = 10;
  const minRh = 8;
  const maxRw = Math.max(minRw, rect.w - 4);
  const maxRh = Math.max(minRh, rect.h - 4);
  const rw =
    minRw + Math.floor(rand() * Math.min(12, maxRw - minRw + 1));
  const rh =
    minRh + Math.floor(rand() * Math.min(10, maxRh - minRh + 1));
  const rwClamped = Math.min(rw, maxRw);
  const rhClamped = Math.min(rh, maxRh);
  const maxOx = Math.max(0, rect.w - rwClamped - 4);
  const maxOy = Math.max(0, rect.h - rhClamped - 4);
  const ox = 2 + (maxOx > 0 ? Math.floor(rand() * (maxOx + 1)) : 0);
  const oy = 2 + (maxOy > 0 ? Math.floor(rand() * (maxOy + 1)) : 0);
  const x = rect.x + ox;
  const y = rect.y + oy;
  const cx = Math.floor(x + rwClamped / 2);
  const cy = Math.floor(y + rhClamped / 2);
  return { x, y, w: rwClamped, h: rhClamped, cx, cy };
}

function buildBSP(
  rect: Rect,
  depth: number,
  rand: () => number,
  minSplit: number,
  maxBspDepth: number
): BSPNode {
  const parts = splitRect(rect, rand, minSplit);
  if (!parts || depth >= maxBspDepth) {
    return { rect, room: createRoomInLeaf(rect, rand) };
  }
  const [a, b] = parts;
  return {
    rect,
    left: buildBSP(a, depth + 1, rand, minSplit, maxBspDepth),
    right: buildBSP(b, depth + 1, rand, minSplit, maxBspDepth),
  };
}

function collectRooms(n: BSPNode): Room[] {
  if (n.room) return [n.room];
  if (!n.left || !n.right) return [];
  return [...collectRooms(n.left), ...collectRooms(n.right)];
}

function addFloorCell(
  floor: Set<string>,
  gx: number,
  gy: number,
  gw: number,
  gh: number
): void {
  if (gx < 1 || gx >= gw - 1 || gy < 1 || gy >= gh - 1) return;
  floor.add(key(gx, gy));
}

function carveCorridor(
  floor: Set<string>,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  gw: number,
  gh: number
): void {
  const x0 = Math.min(ax, bx);
  const x1 = Math.max(ax, bx);
  for (let x = x0; x <= x1; x++) {
    for (let d = -2; d <= 1; d++) addFloorCell(floor, x, ay + d, gw, gh);
  }
  const y0 = Math.min(ay, by);
  const y1 = Math.max(ay, by);
  for (let y = y0; y <= y1; y++) {
    for (let d = -2; d <= 1; d++) addFloorCell(floor, bx + d, y, gw, gh);
  }
}

function addRoomFloor(
  floor: Set<string>,
  room: Room,
  gw: number,
  gh: number
): void {
  for (let gx = room.x; gx < room.x + room.w; gx++) {
    for (let gy = room.y; gy < room.y + room.h; gy++) {
      addFloorCell(floor, gx, gy, gw, gh);
    }
  }
}

function connectAllRoomsPrim(
  rooms: Room[],
  spawnIdx: number,
  floor: Set<string>,
  gw: number,
  gh: number
): void {
  const n = rooms.length;
  if (n === 0) return;
  const connected = new Set<number>([spawnIdx]);
  while (connected.size < n) {
    let bestA = -1;
    let bestB = -1;
    let bestD = Infinity;
    for (const a of connected) {
      for (let b = 0; b < n; b++) {
        if (connected.has(b)) continue;
        const ra = rooms[a]!;
        const rb = rooms[b]!;
        const dx = ra.cx - rb.cx;
        const dy = ra.cy - rb.cy;
        const d = dx * dx + dy * dy;
        if (d < bestD) {
          bestD = d;
          bestA = a;
          bestB = b;
        }
      }
    }
    if (bestA < 0 || bestB < 0) break;
    const ra = rooms[bestA]!;
    const rb = rooms[bestB]!;
    carveCorridor(floor, ra.cx, ra.cy, rb.cx, rb.cy, gw, gh);
    connected.add(bestB);
  }
}

function floorToPathSegments(
  floor: Set<string>,
  gw: number,
  gh: number
): GameLocationJson["pathSegments"] {
  const has = (gx: number, gy: number) => floor.has(key(gx, gy));
  const segs: GameLocationJson["pathSegments"] = [];
  for (let gy = 0; gy < gh; gy++) {
    let gx = 0;
    while (gx < gw) {
      if (!has(gx, gy)) {
        gx++;
        continue;
      }
      const start = gx;
      while (gx + 1 < gw && has(gx + 1, gy)) gx++;
      const end = gx;
      segs.push({
        x: start * CELL,
        y: gy * CELL,
        w: (end - start + 1) * CELL,
        h: CELL,
      });
      gx++;
    }
  }
  return segs;
}

function pickFrame(rand: () => number, frames: number[]): number {
  return frames[Math.floor(rand() * frames.length)] ?? frames[0]!;
}

function pickWallFrame(
  rand: () => number,
  floor: Set<string>,
  gx: number,
  gy: number
): number | null {
  const floorAbove = floor.has(key(gx, gy - 1));
  const floorBelow = floor.has(key(gx, gy + 1));
  const floorLeft = floor.has(key(gx - 1, gy));
  const floorRight = floor.has(key(gx + 1, gy));
  if (!floorAbove && !floorBelow && !floorLeft && !floorRight) return null;

  if (floorBelow && !floorAbove) {
    return pickFrame(rand, WALL_TOP_FRAMES);
  }
  return pickFrame(rand, WALL_FACE_FRAMES);
}

/**
 * Процедурные катакомбы для этажа: размер мира, BSP и сид уникальны для каждого F.
 */
export function generateCatacombsForFloor(floor: number): GameLocationJson {
  const F = Math.max(1, Math.floor(floor));
  const seed = ((CATACOMBS_SEED ^ Math.imul(F, 2654435761)) >>> 0);
  const randMeta = mulberry32(seed);
  /** Ширина/высота мира кратны 32 px — разные этажи заметно отличаются по площади. */
  const worldW = 1760 + Math.floor(randMeta() * 32) * 32;
  const worldH = 1344 + Math.floor(randMeta() * 36) * 32;
  const minSplit = 13 + Math.floor(randMeta() * 17);
  const maxBspDepth = 5 + Math.floor(randMeta() * 5);

  const gw = Math.floor(worldW / CELL);
  const gh = Math.floor(worldH / CELL);

  const rand = mulberry32((seed ^ 0xdeadbeef) >>> 0);

  const root: Rect = { x: 4, y: 4, w: gw - 8, h: gh - 8 };
  const tree = buildBSP(root, 0, rand, minSplit, maxBspDepth);
  const rooms = collectRooms(tree);
  if (rooms.length === 0) {
    throw new Error("generateCatacombsForFloor: no rooms");
  }

  const anchorGx = Math.max(8, Math.floor(gw * 0.06));
  const anchorGy = Math.max(12, gh - Math.floor(gh * 0.09));

  let spawnIdx = 0;
  let best = Infinity;
  for (let i = 0; i < rooms.length; i++) {
    const r = rooms[i]!;
    const dx = r.cx - anchorGx;
    const dy = r.cy - anchorGy;
    const d = dx * dx + dy * dy;
    if (d < best) {
      best = d;
      spawnIdx = i;
    }
  }

  const spawnRoom = rooms[spawnIdx]!;
  let bossIdx = spawnIdx;
  let bestBoss = -1;
  for (let i = 0; i < rooms.length; i++) {
    if (i === spawnIdx && rooms.length > 1) continue;
    const r = rooms[i]!;
    const dx = r.cx - spawnRoom.cx;
    const dy = r.cy - spawnRoom.cy;
    const d = dx * dx + dy * dy;
    if (d > bestBoss) {
      bestBoss = d;
      bossIdx = i;
    }
  }
  const bossRoom = rooms[bossIdx]!;

  const floorCells = new Set<string>();
  for (const r of rooms) addRoomFloor(floorCells, r, gw, gh);
  connectAllRoomsPrim(rooms, spawnIdx, floorCells, gw, gh);

  const pathSegments = floorToPathSegments(floorCells, gw, gh);

  const floorTiles: GameLocationJson["floorTiles"] = [];
  for (const k of floorCells) {
    const [gxStr, gyStr] = k.split(",");
    const gx = Number(gxStr);
    const gy = Number(gyStr);
    floorTiles.push({
      x: gx * CELL,
      y: gy * CELL,
      texture: FLOOR_TEX,
      frame: pickFrame(rand, FLOOR_FRAMES),
    });
  }

  const imageProps: GameLocationJson["imageProps"] = [];
  for (let gx = 0; gx < gw; gx++) {
    for (let gy = 0; gy < gh; gy++) {
      if (floorCells.has(key(gx, gy))) continue;
      const wallFrame = pickWallFrame(rand, floorCells, gx, gy);
      if (wallFrame === null) continue;
      const x = gx * CELL + CELL / 2;
      const y = (gy + 1) * CELL;
      imageProps.push({
        x,
        y,
        texture: WALL_TEX,
        frame: wallFrame,
        collider: { ...WALL_COLL },
      });
    }
  }

  const bossCx = bossRoom.cx * CELL + CELL / 2;
  const bossCy = bossRoom.cy * CELL + CELL / 2;
  const chestX = bossCx - 56;
  const chestY = bossCy;
  const bossX = bossCx + 32;
  const bossY = bossCy;

  imageProps.push({
    x: chestX,
    y: chestY,
    texture: "chest",
    collider: { ...CHEST_COLL },
  });

  const spawnPx = spawnRoom.cx * CELL + CELL / 2;
  const spawnPy = spawnRoom.cy * CELL + CELL / 2;

  const exitTownH = Math.min(spawnRoom.h * CELL - 32, 160);
  const exitTownW = 96;
  const exitTownX = spawnRoom.x * CELL + 8;
  const exitTownY = spawnPy - exitTownH / 2;

  const exitFloorsW = 96;
  const exitFloorsH = Math.min(bossRoom.h * CELL - 32, 160);
  const bossRoomPixTop = bossRoom.y * CELL;
  const bossRoomPixBot = (bossRoom.y + bossRoom.h) * CELL;
  const exitFloorsX = (bossRoom.x + bossRoom.w) * CELL - exitFloorsW - 8;
  let exitFloorsY = bossCy - exitFloorsH / 2;
  const minEy = bossRoomPixTop + 12;
  const maxEy = bossRoomPixBot - exitFloorsH - 12;
  if (minEy <= maxEy) {
    exitFloorsY = Math.max(minEy, Math.min(maxEy, exitFloorsY));
  }

  const gruntRoomCenters = rooms.map((r) => ({
    x: r.cx * CELL + CELL / 2,
    y: r.cy * CELL + CELL / 2,
  }));

  registerDungeonLayoutForFloor(F, {
    gruntRoomCenters,
    bossSpawn: {
      x: bossX,
      y: bossY,
      mobVisualId: "orc_shaman",
      lootTable: "boss",
    },
    bossChest: {
      id: dungeonBossChestIdForFloor(F),
      x: chestX,
      y: chestY,
    },
  });

  return {
    id: "dungeon",
    world: { width: worldW, height: worldH },
    backgroundFill: "#14121a",
    groundTextureKey: "dungeon_void",
    pathSegments,
    imageProps,
    animStations: [],
    npcIdleTexture: {
      elena: "npc_wizzard_idle",
      marcus: "npc_knight_idle",
      igor: "npc_rogue_idle",
    },
    enemySpawns: [],
    spawns: {
      default: { x: spawnPx, y: spawnPy },
      from_town: { x: spawnPx, y: spawnPy },
    },
    exits: [
      {
        id: "to_town",
        x: exitTownX,
        y: exitTownY,
        w: exitTownW,
        h: exitTownH,
        targetLocationId: "town",
        targetSpawnId: "from_dungeon",
        label: "Наружу",
      },
      {
        id: "dungeon_change_floor",
        x: exitFloorsX,
        y: exitFloorsY,
        w: exitFloorsW,
        h: exitFloorsH,
        targetLocationId: "dungeon",
        targetSpawnId: "default",
        label: "Другой этаж…",
      },
    ],
    floorTiles,
    grassDecorSeed: "#2a1f33",
    grassDecorCount: 0,
  };
}

/** @deprecated Используйте generateCatacombsForFloor. */
export function generateCatacombs(seed: number): GameLocationJson {
  void seed;
  return generateCatacombsForFloor(1);
}
