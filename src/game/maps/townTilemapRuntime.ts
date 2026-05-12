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
    /** После flatten из TSX — нужен для диапазона GID воды. */
    tilecount?: number;
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

function readPropCaseInsensitive(
  obj: TmjMapObject,
  name: string
): string | undefined {
  const needle = name.toLowerCase();
  const p = obj.properties?.find((x) => x.name.toLowerCase() === needle);
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

/** Прямоугольники коллизий: координаты как в Tiled (левый верх), без фильтрации по размеру. */
export type TownInteractKind =
  | "well"
  | "fishing"
  | "fog"
  | "fired"
  | "abandon";

export type TownInteractZone = {
  id: string;
  kind: TownInteractKind;
  x: number;
  y: number;
  w: number;
  h: number;
};

function normalizeTownInteractKind(raw: string): TownInteractKind | null {
  const v = raw.trim().toLowerCase();
  if (
    v === "well" ||
    v === "fishing" ||
    v === "fog" ||
    v === "fired" ||
    v === "abandon"
  ) {
    return v;
  }
  return null;
}

export function parseTownInteractZones(
  tmj: TownTmjJson
): TownInteractZone[] {
  const layer = findTownObjectGroup(tmj.layers, "Interact");
  if (!layer?.objects?.length) return [];

  const out: TownInteractZone[] = [];
  for (const obj of layer.objects) {
    const kindRaw = readPropCaseInsensitive(obj, "Interact");
    if (!kindRaw) continue;
    const kind = normalizeTownInteractKind(kindRaw);
    if (!kind) continue;

    const w = Math.max(1, round(obj.width ?? 0));
    const h = Math.max(1, round(obj.height ?? 0));
    if (w < 2 || h < 2) continue;
    out.push({
      id: `town_interact_${obj.id ?? out.length}`,
      kind,
      x: round(obj.x ?? 0),
      y: round(obj.y ?? 0),
      w,
      h,
    });
  }
  return out;
}

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

  /** Только реально привязанные к текстурам тайлсеты — иначе WebGL-рендер падает на null.width. */
  const linkedTilesetNames: string[] = [];
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
    const linked = map.addTilesetImage(ts.name, texKey);
    if (!linked) {
      // eslint-disable-next-line no-console
      console.warn("[town] addTilesetImage не удался:", ts.name, texKey);
      continue;
    }
    linkedTilesetNames.push(ts.name);
  }

  if (linkedTilesetNames.length === 0) {
    // eslint-disable-next-line no-console
    console.warn("[town] ни один тайлсет не привязан — слои карты не создаём");
    map.destroy();
    return null;
  }

  const userPlaneIdx = tmj ? findTownUserPlaneLayerIndex(tmj) : null;

  let terrainOrder = 0;
  let structureOrder = 0;
  let overlayOrder = 0;
  for (let i = 0; i < map.layers.length; i++) {
    const tileLayer = map.createLayer(i, linkedTilesetNames);
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

/** Имена тумана «как в Tiled до flatten» — подстраховка, если слои без префикса Above_Fog_. */
export const TOWN_FOG_DRIFT_LEGACY_LAYER_NAMES = [
  "fog",
  "fog2",
  "fog3",
  "fog4",
] as const;

const fogDriftBaseWorld = new WeakMap<
  Phaser.Tilemaps.TilemapLayer,
  { x: number; y: number }
>();

/** Порядок слоя тумана для фазы анимации (1…4 после flatten). */
function townFogLayerOrdinalFromName(name: string): number {
  const n = name.toLowerCase().replace(/\s+/g, "");
  /** После flatten: `above_fog_fog1_id51` или `above_fog_fog_1_id51` (с подчёркиванием перед номером). */
  const mFlat = n.match(/^above_fog_fog_?(\d+)_id\d+$/);
  if (mFlat) return parseInt(mFlat[1], 10);
  const mShort = n.match(/^fog(\d+)$/);
  if (mShort) return parseInt(mShort[1], 10);
  if (n === "fog") return 1;
  return 0;
}

function isTownFogDriftTileLayerName(name: string): boolean {
  const n = name.toLowerCase().replace(/\s+/g, "");
  if (TOWN_FOG_DRIFT_LEGACY_LAYER_NAMES.some((w) => n === w.toLowerCase())) {
    return true;
  }
  return /^above_fog_fog_?\d+_id\d+$/.test(n);
}

/** Все тайловые слои тумана в порядке номера в имени (Fog 1 … Fog 4). */
export function collectTownFogDriftTileLayers(
  map: Phaser.Tilemaps.Tilemap
): Phaser.Tilemaps.TilemapLayer[] {
  const found: { ord: number; name: string; tl: Phaser.Tilemaps.TilemapLayer }[] =
    [];
  for (const ld of map.layers) {
    const nm = String(ld.name ?? "");
    const tl = ld.tilemapLayer;
    if (!tl || !isTownFogDriftTileLayerName(nm)) continue;
    const ord = townFogLayerOrdinalFromName(nm);
    found.push({ ord, name: nm, tl });
  }
  found.sort((a, b) => a.ord - b.ord || a.name.localeCompare(b.name));
  return found.map((x) => x.tl);
}

/**
 * Плавное смещение слоёв тумана: ~±10 px по синусоидам с разными фазами + лёгкая привязка к позиции героя.
 * Вызывать каждый кадр, пока активна деревня и живой `Tilemap`.
 */
export function updateTownFogLayerDrift(
  map: Phaser.Tilemaps.Tilemap | null,
  timeMs: number,
  player: { x: number; y: number }
): void {
  if (!map) return;
  const layers = collectTownFogDriftTileLayers(map);
  if (layers.length === 0) return;

  const sec = timeMs * 0.001;
  /** Пиковое смещение по одной оси (сумма волн ≤ ~10 px). */
  const amp = 10;
  const omega = 0.4;

  const px = Math.max(-3.5, Math.min(3.5, player.x * 0.008));
  const py = Math.max(-3.5, Math.min(3.5, player.y * 0.008));

  for (let i = 0; i < layers.length; i++) {
    const tl = layers[i]!;
    if (!fogDriftBaseWorld.has(tl)) {
      fogDriftBaseWorld.set(tl, { x: tl.x, y: tl.y });
    }
    const base = fogDriftBaseWorld.get(tl)!;

    const phase = i * 1.55;
    const ox =
      Math.sin(sec * omega + phase) * amp * 0.62 +
      Math.sin(sec * omega * 0.67 + phase * 2.2) * amp * 0.38;
    const oy =
      Math.cos(sec * omega * 0.91 + phase * 1.25) * amp * 0.58 +
      Math.cos(sec * omega * 0.58 + phase * 0.85) * amp * 0.42;

    const wx = base.x + ox + px * 0.4;
    const wy = base.y + oy + py * 0.4;
    tl.setPosition(wx, wy);
    /** Часть расчётов читает `LayerData.x/y`; держим в синхроне с игровым объектом слоя. */
    tl.layer.x = wx;
    tl.layer.y = wy;
  }
}

const TOWN_WATER_LAYER_NAME_RE = /water|grass-water/i;

/**
 * Коллизия по **тайлам** тайлсета воды (GID из TMJ): один механизм вместо десятков object-прямоугольников
 * вдоль берега. Arcade не умеет полигоны; Matter — отдельный движок.
 *
 * Обрабатываются слои, в имени которых есть `water` / `grass-water` (как `Below_Grass-water_id1`).
 * После проверки в игре можно удалить дублирующие прямоугольники у воды из object-слоя Collider.
 */
export function enableTownWaterTileCollision(
  map: Phaser.Tilemaps.Tilemap,
  tmj: TownTmjJson
): Phaser.Tilemaps.TilemapLayer[] {
  const meta = tmj.tilesets.find((t) => /water/i.test(String(t.name ?? "")));
  const tilecount =
    meta && typeof meta.tilecount === "number" ? meta.tilecount : null;
  if (!meta || tilecount == null || tilecount < 1) {
    // eslint-disable-next-line no-console
    console.warn(
      "[town] нет tilecount у тайлсета воды в TMJ — тайловая коллизия воды отключена"
    );
    return [];
  }
  const gidStart = meta.firstgid;
  const gidEnd = meta.firstgid + tilecount - 1;
  const out: Phaser.Tilemaps.TilemapLayer[] = [];
  for (const layerData of map.layers) {
    const nm = String(layerData.name ?? "");
    if (!TOWN_WATER_LAYER_NAME_RE.test(nm)) continue;
    const tileLayer = layerData.tilemapLayer;
    if (!tileLayer) continue;
    map.setCollisionBetween(gidStart, gidEnd, true, true, tileLayer);
    out.push(tileLayer);
  }
  if (out.length === 0) {
    // eslint-disable-next-line no-console
    console.warn(
      "[town] нет тайловых слоёв с именем *water* — коллизия воды по тайлам не включена"
    );
  }
  return out;
}
