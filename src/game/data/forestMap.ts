/** Размер клетки мини-карты леса (мир в пикселях). */
export const FOREST_MAP_CELL = 16;

/** Радиус раскрытия вокруг игрока (в клетках сетки, диск по r²). */
export const FOREST_REVEAL_RADIUS_CELLS = 6;

const KEY_PREFIX = "forest:";

const MAX_PERSISTED_FOREST_MAP_KEYS = 40_000;

export function worldToForestCell(
  worldX: number,
  worldY: number
): { gx: number; gy: number } {
  return {
    gx: Math.floor(worldX / FOREST_MAP_CELL),
    gy: Math.floor(worldY / FOREST_MAP_CELL),
  };
}

export function forestCellKey(gx: number, gy: number): string {
  return `${KEY_PREFIX}${gx},${gy}`;
}

export function parseForestCellKey(key: string): {
  gx: number;
  gy: number;
} | null {
  if (!key.startsWith(KEY_PREFIX)) return null;
  const rest = key.slice(KEY_PREFIX.length);
  const j = rest.indexOf(",");
  if (j <= 0) return null;
  const gx = Number(rest.slice(0, j));
  const gy = Number(rest.slice(j + 1));
  if (!Number.isFinite(gx) || !Number.isFinite(gy)) return null;
  return { gx: Math.floor(gx), gy: Math.floor(gy) };
}

/** Ключи клеток в диске вокруг центра (без clamp — бесконечная сетка). */
export function revealForestCellKeysAround(
  centerGx: number,
  centerGy: number,
  radiusCells: number
): string[] {
  const r2 = radiusCells * radiusCells;
  const keys: string[] = [];
  for (let dy = -radiusCells; dy <= radiusCells; dy++) {
    for (let dx = -radiusCells; dx <= radiusCells; dx++) {
      if (dx * dx + dy * dy > r2) continue;
      keys.push(forestCellKey(centerGx + dx, centerGy + dy));
    }
  }
  return keys;
}

/** Восстановление из сейва: только `true`, валидные ключи, лимит размера. */
export function sanitizeForestRevealedCellsPersist(
  raw: unknown
): Record<string, boolean> {
  if (!raw || typeof raw !== "object") return {};
  const out: Record<string, boolean> = {};
  let n = 0;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (n >= MAX_PERSISTED_FOREST_MAP_KEYS) break;
    if (v !== true) continue;
    const coords = parseForestCellKey(k);
    if (!coords) continue;
    out[forestCellKey(coords.gx, coords.gy)] = true;
    n++;
  }
  return out;
}
