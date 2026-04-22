/**
 * Разбор manifest.json для каталога элементов редактора карты.
 */

export type ManifestLoadEntry = {
  key: string;
  type: string;
  url: string;
  frameWidth?: number;
  frameHeight?: number;
  /** Для spritesheet: число кадров (если задано генератором). */
  frameCount?: number;
};

export type CatalogItem = {
  key: string;
  url: string;
  type: "image" | "spritesheet";
  frameWidth?: number;
  frameHeight?: number;
  frameCount?: number;
  /** Группа для UI (вкладки / секции). */
  category: string;
};

/** Ключи image, которые не ставятся как пропы (фоны и т.п.). */
import { CRAFT_STATION_MANIFEST_KEYS } from "@/src/game/data/craftStationLayout";

export const PLACEABLE_IMAGE_DENY_KEYS = new Set([
  "grass",
  "dirt",
  "world_ground",
  "forest_ground",
  "dungeon_void",
  ...CRAFT_STATION_MANIFEST_KEYS,
]);

export function categorizeManifestEntry(entry: {
  type: string;
  url: string;
}): string {
  const lower = entry.url.toLowerCase();
  const dec = decodeURIComponent(lower);
  const isPcEnv =
    dec.includes("pixel crawler") &&
    dec.includes("/environment/");
  if (dec.includes("/pc-env-autoslices/")) {
    if (dec.includes("/trees/") || dec.includes("props_static_trees"))
      return "PC: деревья";
    return "PC: авто-нарезка";
  }
  if (dec.includes("/pc-env-slices/")) return "PC: слайсы";
  if (isPcEnv) {
    if (dec.includes("/environment/tilesets/")) return "PC: тайлсеты";
    if (dec.includes("/environment/props/")) return "PC: пропсы";
    if (dec.includes("/environment/structures/")) return "PC: структуры";
    return "PC: environment";
  }
  if (entry.type === "spritesheet") {
    if (lower.includes("/units/")) return "Юниты";
    if (lower.includes("/decor/")) return "Анимации / станции";
    return "Прочее";
  }
  if (lower.includes("/buildings/")) return "Здания";
  if (dec.includes("/assets/stations/")) return "Станции крафта";
  if (lower.includes("/decor/")) return "Декор";
  if (lower.includes("/units/")) return "Юниты";
  return "Прочее";
}

function isPlaceableImage(entry: ManifestLoadEntry): boolean {
  if (entry.type !== "image") return false;
  if (PLACEABLE_IMAGE_DENY_KEYS.has(entry.key)) return false;
  return true;
}

function isPlaceableSpritesheet(entry: ManifestLoadEntry): boolean {
  if (entry.type !== "spritesheet") return false;
  if (entry.key === "grass_decor") return false;
  return true;
}

export function buildCatalogFromManifestLoad(
  load: ManifestLoadEntry[]
): { images: CatalogItem[]; spritesheets: CatalogItem[] } {
  const images: CatalogItem[] = [];
  const spritesheets: CatalogItem[] = [];

  for (const e of load) {
    if (isPlaceableImage(e)) {
      images.push({
        key: e.key,
        url: e.url,
        type: "image",
        category: categorizeManifestEntry(e),
      });
    } else if (isPlaceableSpritesheet(e)) {
      spritesheets.push({
        key: e.key,
        url: e.url,
        type: "spritesheet",
        frameWidth: e.frameWidth,
        frameHeight: e.frameHeight,
        frameCount: e.frameCount,
        category: categorizeManifestEntry(e),
      });
    }
  }

  const sortByKey = (a: CatalogItem, b: CatalogItem) =>
    a.key.localeCompare(b.key, "en");
  images.sort(sortByKey);
  spritesheets.sort(sortByKey);

  return { images, spritesheets };
}

export function groupByCategory(
  items: CatalogItem[]
): Map<string, CatalogItem[]> {
  const m = new Map<string, CatalogItem[]>();
  for (const it of items) {
    const list = m.get(it.category) ?? [];
    list.push(it);
    m.set(it.category, list);
  }
  return m;
}
