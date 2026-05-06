import type * as Phaser from "phaser";
import type { LocationExit } from "@/src/game/locations/types";

/** Совпадает с логикой `collectTilesetImages` в scripts/flatten-town-tmj.mjs */
export function townTilesetTextureKey(ts: {
  name: string;
  firstgid: number;
}): string {
  const safeName = String(ts.name).replace(/[^a-zA-Z0-9_]/g, "_");
  return `town_ts_${safeName}_${ts.firstgid}`;
}

export type TownTmjLayer = {
  type?: string;
  name?: string;
  id?: number;
  width?: number;
  height?: number;
  /** Одномерный массив gid (как в экспорте Tiled) для tilelayer */
  data?: number[];
  objects?: TmjMapObject[];
  layers?: TownTmjLayer[];
};

export type TmjMapObject = {
  id?: number;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  ellipse?: boolean;
  properties?: { name: string; type?: string; value?: unknown }[];
};

export type TownTmjJson = {
  width: number;
  height: number;
  tilewidth: number;
  tileheight: number;
  layers: TownTmjLayer[];
  tilesets: {
    name: string;
    firstgid: number;
    image?: string;
  }[];
};

function readProp(
  obj: TmjMapObject,
  name: string
): string | undefined {
  const p = obj.properties?.find((x) => x.name === name);
  if (!p) return undefined;
  return String(p.value ?? "");
}

function round(n: number): number {
  return Math.round(n);
}

/** JSON карты города из кэша Phaser (`tilemapTiledJSON`, не `load.json`). */
export function getTownTmjData(scene: Phaser.Scene): TownTmjJson | undefined {
  const entry = scene.cache.tilemap.get("townMapJson") as
    | { data?: TownTmjJson }
    | undefined;
  const fromTilemap = entry?.data;
  if (fromTilemap) return fromTilemap;
  return scene.cache.json.get("townMapJson") as TownTmjJson | undefined;
}

/** Находит objectgroup по подстроке в имени (после flatten имён слоёв). */
export function findTownObjectGroup(
  layers: TownTmjLayer[] | undefined,
  substr: string
): TownTmjLayer | undefined {
  if (!layers) return undefined;
  for (const L of layers) {
    if (L.type === "objectgroup" && L.name && L.name.includes(substr)) {
      return L;
    }
    if (L.layers?.length) {
      const inner = findTownObjectGroup(L.layers, substr);
      if (inner) return inner;
    }
  }
  return undefined;
}

export function parseTownTravelExits(tmj: TownTmjJson): LocationExit[] {
  const layer = findTownObjectGroup(tmj.layers, "Travel");
  if (!layer?.objects?.length) return [];

  const out: LocationExit[] = [];
  for (const obj of layer.objects) {
    const travel = readProp(obj, "travel");
    if (!travel) continue;
    const w = Math.max(8, round(obj.width ?? 0));
    const h = Math.max(8, round(obj.height ?? 0));
    const x = round(obj.x ?? 0);
    const y = Math.max(0, round(obj.y ?? 0));

    if (travel === "forest") {
      out.push({
        id: "to_forest",
        x,
        y,
        w,
        h,
        targetLocationId: "forest",
        targetSpawnId: "from_town",
        label: "В лес",
      });
    } else if (travel === "dungeon") {
      out.push({
        id: "to_dungeon",
        x,
        y,
        w,
        h,
        targetLocationId: "dungeon",
        targetSpawnId: "from_town",
        label: "В подземелье (этаж)",
      });
    }
  }
  return out;
}

/** Прямоугольники коллизий: координаты как в Tiled (левый верх). */
export function parseTownColliderRects(
  tmj: TownTmjJson
): { x: number; y: number; w: number; h: number }[] {
  const layer = findTownObjectGroup(tmj.layers, "Collider");
  if (!layer?.objects?.length) return [];
  const rects: { x: number; y: number; w: number; h: number }[] = [];
  for (const obj of layer.objects) {
    const w = Math.max(1, round(obj.width ?? 0));
    const h = Math.max(1, round(obj.height ?? 0));
    if (w < 2 || h < 2) continue;
    rects.push({
      x: round(obj.x ?? 0),
      y: round(obj.y ?? 0),
      w,
      h,
    });
  }
  return rects;
}

/** Точка спавна по умолчанию из слоя «Спавн» (эллипс/точка). */
export function parseTownDefaultSpawn(
  tmj: TownTmjJson
): { x: number; y: number } | null {
  const layer = findTownObjectGroup(tmj.layers, "Spawn");
  const obj = layer?.objects?.[0];
  if (!obj) return null;
  const x = round(obj.x ?? 0);
  const y = round(obj.y ?? 0);
  return { x, y };
}

/** Герой: `setDepth(player.y)`. Ландшафт и здания — малый depth по порядку слоёв в Tiled; крыши/крона — отдельный блок. */
const TOWN_TERRAIN_DEPTH_START = 0.05;
const TOWN_TERRAIN_DEPTH_STEP = 0.001;
const TOWN_STRUCTURE_DEPTH_START = 0.15;
const TOWN_STRUCTURE_DEPTH_STEP = 0.02;
const TOWN_OVERLAY_DEPTH_START = 12_000;
const TOWN_OVERLAY_DEPTH_STEP = 0.02;

type TiledLayerProp = { name: string; value?: unknown };

function readLayerBoolProp(
  props: unknown,
  propName: string
): boolean | undefined {
  if (!Array.isArray(props)) return undefined;
  const p = (props as TiledLayerProp[]).find((x) => x.name === propName);
  if (!p) return undefined;
  const v = p.value;
  if (typeof v === "boolean") return v;
  if (typeof v === "string")
    return v === "true" || v === "1" || v.toLowerCase() === "yes";
  return undefined;
}

/**
 * В Tiled: свойство слоя `abovePlayer` = true/false (приоритет над эвристикой по имени).
 * Иначе — крыши, трубы, крона деревьев по подстрокам в имени (после flatten).
 */
export function townTileLayerNameImpliesAbovePlayer(layerName: string): boolean {
  const n = layerName.toLowerCase();
  if (n.includes("крыш")) return true;
  if (n.includes("_roof") || n.includes("roof_")) return true;
  if (n.includes("труба") || n.includes("truba")) return true;
  if (n.startsWith("trees_")) return true;
  return false;
}

function townPhaserTileLayerIsAbovePlayer(
  layer: Phaser.Tilemaps.LayerData
): boolean {
  const explicit = readLayerBoolProp(layer.properties, "abovePlayer");
  if (explicit !== undefined) return explicit;
  return townTileLayerNameImpliesAbovePlayer(String(layer.name ?? ""));
}

function townLayerIsTerrain(name: string): boolean {
  const n = name.toLowerCase();
  return (
    n.startsWith("below_ground_") ||
    n.startsWith("below_sand_") ||
    n.startsWith("below_grass-water") ||
    n.startsWith("below_roads_") ||
    n.startsWith("below_flowers_") ||
    n.startsWith("ground_") ||
    n.startsWith("sand_") ||
    n.startsWith("grass-water") ||
    n.startsWith("roads_") ||
    n.startsWith("flowers_")
  );
}

/**
 * Пустой objectgroup `User_*` в Tiled: всё выше в списке слоёв — поверх героя,
 * всё ниже — под героем (depth героя ≈ `player.y`, см. MainScene).
 */
function findTownUserPlaneLayerIndex(tmj: TownTmjJson): number | null {
  const list = tmj.layers;
  if (!list?.length) return null;
  for (let i = 0; i < list.length; i++) {
    const L = list[i]!;
    if (L.type !== "objectgroup") continue;
    const name = String(L.name ?? "");
    if (/^user_/i.test(name) || name.toLowerCase() === "user") return i;
  }
  return null;
}

function townTmjTileLayers(tmj: TownTmjJson): TownTmjLayer[] {
  return tmj.layers.filter((L) => L.type === "tilelayer");
}

function townWallDataArraysEqual(a?: number[], b?: number[]): boolean {
  if (!a || !b || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/** Подсказка: в TMJ часто копируют слой дома и забывают сдвинуть тайлы — в игре будет один «стек». */
function warnDuplicateTownWallLayers(rawTileLayers: TownTmjLayer[]): void {
  const walls = rawTileLayers.filter(
    (L) => L.name && /house_\d+_стены/i.test(L.name.toLowerCase()) && L.data
  );
  for (let i = 0; i < walls.length; i++) {
    for (let j = i + 1; j < walls.length; j++) {
      if (townWallDataArraysEqual(walls[i]!.data, walls[j]!.data)) {
        // eslint-disable-next-line no-console
        console.warn(
          "[town] слои стен совпадают по тайлам — в Tiled сдвиньте дом или пересоберите карту:",
          walls[i]!.name,
          "↔",
          walls[j]!.name
        );
      }
    }
  }
}

/**
 * Рисует тайловые слои города. Возвращает Tilemap для последующего destroy().
 * Глубина: ландшафт → остальные слои (стены, окна, двери, декор) строго в порядке TMJ;
 * крыши/трубы/крона — поверх героя (большой depth). Если в TMJ есть objectgroup `User_*`,
 * он задаёт плоскость героя: слои ниже — под ним, выше — над ним (имена вроде `Above_*` не обязаны совпадать с эвристикой `trees_`).
 */
export function createTownTilemapLayers(
  scene: Phaser.Scene
): Phaser.Tilemaps.Tilemap | null {
  const tilemapCache = scene.cache.tilemap.get("townMapJson");
  if (!tilemapCache?.data) {
    // eslint-disable-next-line no-console
    console.warn(
      "[town] нет данных tilemap для townMapJson — нужен load.tilemapTiledJSON в BootScene"
    );
    return null;
  }

  const tmj = getTownTmjData(scene);
  const rawTileLayers = tmj ? townTmjTileLayers(tmj) : [];
  if (rawTileLayers.length) warnDuplicateTownWallLayers(rawTileLayers);

  const map = scene.make.tilemap({ key: "townMapJson" });
  const tilesetNames = map.tilesets.map((t) => t.name);

  for (const ts of map.tilesets) {
    const texKey = townTilesetTextureKey({
      name: ts.name,
      firstgid: ts.firstgid,
    });
    if (!scene.textures.exists(texKey)) {
      // eslint-disable-next-line no-console
      console.warn("[town] нет текстуры тайлсета:", texKey, ts.name);
      continue;
    }
    map.addTilesetImage(ts.name, texKey);
  }

  const userPlaneIdx = tmj ? findTownUserPlaneLayerIndex(tmj) : null;

  let terrainOrder = 0;
  let structureOrder = 0;
  let overlayOrder = 0;
  for (let i = 0; i < map.layers.length; i++) {
    const tileLayer = map.createLayer(i, tilesetNames);
    if (!tileLayer) continue;
    const layerData = map.layers[i];
    const name = String(layerData.name ?? "");
    const raw = rawTileLayers[i];
    if (raw && raw.name !== name) {
      // eslint-disable-next-line no-console
      console.warn(
        "[town] несовпадение имени слоя TMJ/Phaser:",
        i,
        raw.name,
        name
      );
    }

    let isOverlay = townPhaserTileLayerIsAbovePlayer(layerData);
    if (userPlaneIdx != null) {
      if (i < userPlaneIdx) isOverlay = false;
      else if (i > userPlaneIdx) isOverlay = true;
    } else {
      if (name.startsWith("Below_")) isOverlay = false;
      if (name.startsWith("Above_")) isOverlay = true;
    }
    let depth: number;
    if (townLayerIsTerrain(name)) {
      depth =
        TOWN_TERRAIN_DEPTH_START + terrainOrder * TOWN_TERRAIN_DEPTH_STEP;
      terrainOrder += 1;
    } else if (isOverlay) {
      depth =
        TOWN_OVERLAY_DEPTH_START + overlayOrder * TOWN_OVERLAY_DEPTH_STEP;
      overlayOrder += 1;
    } else {
      depth =
        TOWN_STRUCTURE_DEPTH_START +
        structureOrder * TOWN_STRUCTURE_DEPTH_STEP;
      structureOrder += 1;
    }
    tileLayer.setDepth(depth);
  }

  return map;
}
