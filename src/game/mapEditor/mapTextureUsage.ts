import type { GameLocation, LocationId } from "@/src/game/locations/types";

export type MapTextureUsageRow = {
  texture: string;
  frame?: number;
  /** Сколько раз встречается на каждой локации */
  byLocation: Record<LocationId, number>;
};

function bump(
  m: Map<string, MapTextureUsageRow>,
  locId: LocationId,
  texture: string,
  frame?: number
): void {
  const key = frame !== undefined ? `${texture}#${frame}` : texture;
  const cur = m.get(key) ?? {
    texture,
    frame,
    byLocation: { town: 0, forest: 0, dungeon: 0, beyond: 0 },
  };
  cur.byLocation[locId]++;
  m.set(key, cur);
}

/**
 * Уникальные текстуры (и кадры) из пропов и тайлов пола всех локаций.
 */
export function collectTextureUsageFromLocations(
  getLoc: (id: LocationId) => GameLocation
): MapTextureUsageRow[] {
  const m = new Map<string, MapTextureUsageRow>();
  const ids: LocationId[] = ["town", "forest", "dungeon", "beyond"];
  for (const locId of ids) {
    const loc = getLoc(locId);
    for (const p of loc.imageProps) {
      bump(m, locId, p.texture, p.frame);
    }
    for (const t of loc.floorTiles ?? []) {
      bump(m, locId, t.texture, t.frame);
    }
  }
  return [...m.values()].sort((a, b) => {
    const ak = a.frame !== undefined ? `${a.texture}#${a.frame}` : a.texture;
    const bk = b.frame !== undefined ? `${b.texture}#${b.frame}` : b.texture;
    return ak.localeCompare(bk, "en");
  });
}

export function formatUsageLocations(row: MapTextureUsageRow): string {
  const parts: string[] = [];
  (["town", "forest", "dungeon", "beyond"] as const).forEach((id) => {
    const n = row.byLocation[id];
    if (n > 0) parts.push(`${id}×${n}`);
  });
  return parts.join(", ") || "—";
}
