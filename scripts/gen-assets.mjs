/**
 * Единственный активный источник ассетов — Pixel Crawler Free Pack.
 * Генерирует public/assets/world/* и manifest.json для Phaser.
 *
 * Деревья и камни игрового мира — `src/game/data/nature-decor-map.json` + `public/assets/nature/*.txt` / `*.png`.
 * Остальной декор Pixel Crawler — `src/game/data/pc-pack-decor-extracts.json`;
 * перед нарезкой сверяем размер PNG с `canvas` из соседнего `*.aseprite.spec.json` (npm run gen:aseprite-spec).
 *
 * Листы героя Body_A/Animations — единый реестр в `src/game/data/heroAnimSheets.json`
 * (копирование, spritesheet load и блок `hero` в manifest собираются из него).
 *
 * Враги Orc Crew / Skeleton Crew — `src/game/data/mobAnimSheets.json` + `manifest.mobs`.
 */
import sharp from "sharp";
import { execFileSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { buildNatureDecorFromMap } from "./nature-decor-extract.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const outRoot = path.join(root, "public", "assets", "world");

const PC = path.join(root, "public", "assets", "Pixel Crawler - Free Pack");

const PC_BODY = path.join(
  PC,
  "Entities",
  "Characters",
  "Body_A",
  "Animations"
);

const PC_NPC = path.join(PC, "Entities", "Npc's");
const PC_MOBS = path.join(PC, "Entities", "Mobs");

const TILE = 16;

const FLOORS = path.join(PC, "Environment", "Tilesets", "Floors_Tiles.png");
const WATER = path.join(PC, "Environment", "Tilesets", "Water_tiles.png");
const WALLS = path.join(PC, "Environment", "Structures", "Buildings", "Walls.png");
const ROOFS = path.join(PC, "Environment", "Structures", "Buildings", "Roofs.png");

function mkdirp(p) {
  fs.mkdirSync(p, { recursive: true });
}

function copy(from, to) {
  mkdirp(path.dirname(to));
  fs.copyFileSync(from, to);
}

function extractTile(srcPath, col, row, tw = TILE, th = TILE) {
  return sharp(srcPath).extract({
    left: col * tw,
    top: row * th,
    width: tw,
    height: th,
  });
}

/** Вертикальная полоска кадров → один горизонтальный лист для Phaser spritesheet. */
async function verticalStripToHorizontal(
  srcPath,
  frameW,
  frameH,
  count,
  outPath
) {
  const composites = [];
  for (let i = 0; i < count; i++) {
    const buf = await sharp(srcPath)
      .extract({ left: 0, top: i * frameH, width: frameW, height: frameH })
      .png()
      .toBuffer();
    composites.push({ input: buf, left: i * frameW, top: 0 });
  }
  await sharp({
    create: {
      width: frameW * count,
      height: frameH,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite(composites)
    .png()
    .toFile(outPath);
}

async function buildHousePng() {
  // Простой пиксель-арт домик, т.к. готовые дома в Pixel Crawler — только
  // каталоги тайлов стен/крыш без чёткой композиции под 1-комнатную хижину.
  const W = 80;
  const H = 96;
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" shape-rendering="crispEdges">
      <!-- фундамент -->
      <rect x="6" y="90" width="68" height="6" fill="#3b2a1a"/>
      <!-- стены (тёплое дерево) -->
      <rect x="8" y="48" width="64" height="46" fill="#7a4a22"/>
      <!-- горизонтальные доски -->
      <rect x="8" y="58" width="64" height="2" fill="#5a3315"/>
      <rect x="8" y="72" width="64" height="2" fill="#5a3315"/>
      <rect x="8" y="86" width="64" height="2" fill="#5a3315"/>
      <!-- дверь -->
      <rect x="34" y="68" width="14" height="22" fill="#2b1a0c"/>
      <rect x="45" y="78" width="2" height="2" fill="#e6c46a"/>
      <!-- окно слева -->
      <rect x="14" y="56" width="12" height="10" fill="#87ceeb"/>
      <rect x="14" y="56" width="12" height="10" fill="none" stroke="#3b2a1a" stroke-width="2"/>
      <rect x="20" y="56" width="2" height="10" fill="#3b2a1a"/>
      <!-- окно справа -->
      <rect x="54" y="56" width="12" height="10" fill="#87ceeb"/>
      <rect x="54" y="56" width="12" height="10" fill="none" stroke="#3b2a1a" stroke-width="2"/>
      <rect x="60" y="56" width="2" height="10" fill="#3b2a1a"/>
      <!-- крыша (треугольник с досчатой текстурой) -->
      <polygon points="2,48 40,10 78,48" fill="#8a2e2e"/>
      <polygon points="2,48 40,10 78,48" fill="none" stroke="#3b0f0f" stroke-width="2"/>
      <line x1="10" y1="44" x2="40" y2="14" stroke="#6a1f1f" stroke-width="1"/>
      <line x1="20" y1="44" x2="40" y2="18" stroke="#6a1f1f" stroke-width="1"/>
      <line x1="30" y1="44" x2="40" y2="34" stroke="#6a1f1f" stroke-width="1"/>
      <line x1="50" y1="44" x2="40" y2="34" stroke="#6a1f1f" stroke-width="1"/>
      <line x1="60" y1="44" x2="40" y2="18" stroke="#6a1f1f" stroke-width="1"/>
      <line x1="70" y1="44" x2="40" y2="14" stroke="#6a1f1f" stroke-width="1"/>
      <!-- труба -->
      <rect x="54" y="14" width="8" height="14" fill="#4a4a4a"/>
      <rect x="52" y="12" width="12" height="4" fill="#3a3a3a"/>
    </svg>
  `;
  await sharp(Buffer.from(svg))
    .png()
    .toFile(path.join(outRoot, "buildings", "house.png"));
}

async function buildPondPng() {
  const cols = 5;
  const rows = 4;
  const W = cols * TILE;
  const H = rows * TILE;
  const inset = 3;
  const iw = W - 2 * inset;
  const ih = H - 2 * inset;
  const inner = await extractTile(WATER, 1, 5).png().toBuffer();
  const layers = [];
  const nc = Math.ceil(iw / TILE);
  const nr = Math.ceil(ih / TILE);
  for (let r = 0; r < nr; r++) {
    for (let c = 0; c < nc; c++) {
      layers.push({
        input: inner,
        left: inset + c * TILE,
        top: inset + r * TILE,
      });
    }
  }
  const muddy = { r: 52, g: 70, b: 44, alpha: 1 };
  await sharp({
    create: {
      width: W,
      height: H,
      channels: 4,
      background: muddy,
    },
  })
    .composite(layers)
    .png()
    .toFile(path.join(outRoot, "decor", "pond.png"));
}

async function cropToFile(srcPath, left, top, width, height, outPath) {
  await sharp(srcPath)
    .extract({ left, top, width, height })
    .png()
    .toFile(outPath);
}

/** Детерминированный RNG для мозаики без шва. */
function mulberry32(seed) {
  return function rand() {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Fill/decal для рантайм-тайла grass.png/dirt.png и фонов world/forest — см.
 * `scripts/pc-terrain-autotile.json`, `scripts/pc-terrain-decals.json`.
 */

/** Дублирует `src/game/locations/town.ts` → PATH_SEGMENTS (менять вместе). */
const PATH_SEGMENTS_LAYOUT = [
  { x: 0, y: 458, w: 1280, h: 44 },
  { x: 618, y: 0, w: 44, h: 960 },
  { x: 222, y: 260, w: 44, h: 260 },
  { x: 978, y: 260, w: 44, h: 260 },
  { x: 298, y: 500, w: 44, h: 430 },
  { x: 662, y: 588, w: 520, h: 44 },
];

/** Лес: центральная тропа — дублирует `src/game/locations/forest.ts` → FOREST_PATH_SEGMENTS. */
const FOREST_PATH_SEGMENTS_LAYOUT = [
  { x: 580, y: 0, w: 120, h: 960 },
];

function pointInPathSegment(px, py, seg, margin = 0) {
  return (
    px >= seg.x - margin &&
    px <= seg.x + seg.w + margin &&
    py >= seg.y - margin &&
    py <= seg.y + seg.h + margin
  );
}

/**
 * Маска логики «тропа = dirt»: 1 — клетка внутри сегмента, 0 — трава.
 * @returns {Uint8Array} длина cols*rows, индекс row*cols+col
 */
function buildLogicalMask(pathSegments, cols, rows) {
  const mask = new Uint8Array(cols * rows);
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const px = col * TILE + TILE / 2;
      const py = row * TILE + TILE / 2;
      const dirt = pathSegments.some((s) => pointInPathSegment(px, py, s, 0));
      mask[row * cols + col] = dirt ? 1 : 0;
    }
  }
  return mask;
}

/**
 * 8 бит: сосед отличается от центра (другая поверхность).
 * Порядок бит: N, E, S, W, NE, SE, SW, NW (младший = N).
 * За пределами карты считаем того же типа, что центр — без ложных кромок.
 */
function neighborMask8(mask, col, row, cols, rows) {
  const center = mask[row * cols + col];
  const diff = (dc, dr) => {
    const nc = col + dc;
    const nr = row + dr;
    if (nc < 0 || nr < 0 || nc >= cols || nr >= rows) return 0;
    return mask[nr * cols + nc] !== center ? 1 : 0;
  };
  let m = 0;
  if (diff(0, -1)) m |= 1 << 0;
  if (diff(1, 0)) m |= 1 << 1;
  if (diff(0, 1)) m |= 1 << 2;
  if (diff(-1, 0)) m |= 1 << 3;
  if (diff(1, -1)) m |= 1 << 4;
  if (diff(1, 1)) m |= 1 << 5;
  if (diff(-1, 1)) m |= 1 << 6;
  if (diff(-1, -1)) m |= 1 << 7;
  return m;
}

/** Кардинальная часть neighborMask8 (биты N,E,S,W). */
function cardinalMask4(mask8) {
  return mask8 & 0xf;
}

/**
 * Таблица смещений (dx,dy) внутри 5×5 wang-блока для полупрозрачных кромок.
 * Ключ — битмаска N(1)|E(2)|S(4)|W(8).
 */
const AUTOTILE_OVERLAY_BY_MASK4 = {
  0: null,
  1: [
    [1, 0],
    [2, 0],
    [3, 0],
  ],
  2: [
    [4, 1],
    [4, 2],
    [4, 3],
  ],
  4: [
    [1, 4],
    [2, 4],
    [3, 4],
  ],
  8: [
    [0, 1],
    [0, 2],
    [0, 3],
  ],
  3: [[4, 0]],
  9: [[0, 0]],
  6: [[4, 4]],
  12: [[0, 4]],
  5: [[2, 2]],
  10: [
    [2, 1],
    [2, 3],
  ],
  7: [[4, 2]],
  11: [[2, 0]],
  13: [[0, 2]],
  14: [[2, 4]],
  15: [[2, 2]],
};

/**
 * @param {number} mask8 — из neighborMask8
 * @returns {[number, number]|null} смещение (dx,dy) в блоке 5×5
 */
function pickAutotileTile(mask8, rand) {
  const m4 = cardinalMask4(mask8);
  const opts = AUTOTILE_OVERLAY_BY_MASK4[m4];
  if (!opts || opts.length === 0) return null;
  return opts[Math.floor(rand() * opts.length)];
}

/** Value-noise [0..1] на сетке gw×gh, билинейная интерполяция из lowW×lowH. */
function valueNoise2D(seed, gw, gh, lowW, lowH) {
  const rand = mulberry32(seed >>> 0);
  const grid = new Float32Array(lowW * lowH);
  for (let i = 0; i < grid.length; i++) grid[i] = rand();
  const out = new Float32Array(gw * gh);
  const denomX = Math.max(gw - 1, 1);
  const denomY = Math.max(gh - 1, 1);
  const lx = Math.max(lowW - 1, 1);
  const ly = Math.max(lowH - 1, 1);
  for (let y = 0; y < gh; y++) {
    for (let x = 0; x < gw; x++) {
      const fx = (x / denomX) * lx;
      const fy = (y / denomY) * ly;
      const x0 = Math.floor(fx);
      const y0 = Math.floor(fy);
      const x1 = Math.min(x0 + 1, lowW - 1);
      const y1 = Math.min(y0 + 1, lowH - 1);
      const tx = fx - x0;
      const ty = fy - y0;
      const i00 = y0 * lowW + x0;
      const i10 = y0 * lowW + x1;
      const i01 = y1 * lowW + x0;
      const i11 = y1 * lowW + x1;
      const v00 = grid[i00];
      const v10 = grid[i10];
      const v01 = grid[i01];
      const v11 = grid[i11];
      out[y * gw + x] =
        v00 * (1 - tx) * (1 - ty) +
        v10 * tx * (1 - ty) +
        v01 * (1 - tx) * ty +
        v11 * tx * ty;
    }
  }
  return out;
}

async function floorTileBuf(col, row) {
  return extractTile(FLOORS, col, row).png().toBuffer();
}

/** Предзагрузка 5×5 wang-блока для terrain-ключа. */
async function preloadAutotileBlock5(autotileCfg, terrainKey) {
  const t = autotileCfg.terrains[terrainKey];
  if (!t) throw new Error(`pc-terrain-autotile: нет terrain "${terrainKey}"`);
  const [bx, by] = t.block;
  const bufs = [];
  for (let dy = 0; dy < 5; dy++) {
    for (let dx = 0; dx < 5; dx++) {
      bufs.push(await floorTileBuf(bx + dx, by + dy));
    }
  }
  return bufs;
}

async function preloadFillPools(autotileCfg, terrainKey) {
  const t = autotileCfg.terrains[terrainKey];
  const light = await Promise.all(
    t.fillCols.map((fc) => floorTileBuf(fc, t.fillRow))
  );
  const dark = await Promise.all(
    t.fillCols.map((fc) => floorTileBuf(fc, t.darkRow))
  );
  return { light, dark };
}

async function loadDecalPoolBufs(decalsCfg, poolName) {
  const vegRel = decalsCfg.vegetationRel.replace(/\//g, path.sep);
  const rocksRel = decalsCfg.rocksRel.replace(/\//g, path.sep);
  const vegPath = path.join(PC, vegRel);
  const rocksPath = path.join(PC, rocksRel);
  const list = decalsCfg[poolName];
  if (!Array.isArray(list) || list.length === 0) return [];
  const out = [];
  for (const roi of list) {
    const src = roi.src === "rocks" ? rocksPath : vegPath;
    const buf = await sharp(src)
      .extract({
        left: roi.x,
        top: roi.y,
        width: roi.w,
        height: roi.h,
      })
      .png()
      .toBuffer();
    out.push(buf);
  }
  return out;
}

function block5At(bufs, dx, dy) {
  return bufs[dy * 5 + dx];
}

/**
 * Фон 1280×960: (1) fill + тёмные пятна по noise, (2) wang-autotile кромки 5×5,
 * (3) декали Vegetation/Rocks на внутренних клетках.
 */
async function buildGroundPng({
  outFile,
  pathSegments,
  seed,
  bg,
  terrainHighKey,
  darkThreshold = 0.55,
  decalChance = 0.05,
  noiseLowW = 12,
  noiseLowH = 10,
  autotileCfg,
  decalsCfg,
}) {
  const GW = 1280;
  const GH = 960;
  const cols = GW / TILE;
  const rows = GH / TILE;
  const rand = mulberry32(seed >>> 0);
  const mask = buildLogicalMask(pathSegments, cols, rows);
  const noise = valueNoise2D(
    (seed + 0x112233) >>> 0,
    cols,
    rows,
    noiseLowW,
    noiseLowH
  );

  const grassFills = await preloadFillPools(autotileCfg, "grass");
  const highFills = await preloadFillPools(autotileCfg, terrainHighKey);
  const grassBlock5 = await preloadAutotileBlock5(autotileCfg, "grass");
  const highBlock5 = await preloadAutotileBlock5(autotileCfg, terrainHighKey);
  const blockByKey = new Map([
    ["grass", grassBlock5],
    [terrainHighKey, highBlock5],
  ]);

  const grassDecalBufs = await loadDecalPoolBufs(decalsCfg, "grass");
  const dirtDecalBufs = await loadDecalPoolBufs(decalsCfg, "dirt");

  const composites = [];

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const isDirt = mask[row * cols + col];
      const fills = isDirt ? highFills : grassFills;
      const n = noise[row * cols + col];
      const pool = n > darkThreshold ? fills.dark : fills.light;
      const input = pool[Math.floor(rand() * pool.length)];
      composites.push({ input, left: col * TILE, top: row * TILE });
    }
  }

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const m8 = neighborMask8(mask, col, row, cols, rows);
      if (m8 === 0) continue;
      const off = pickAutotileTile(m8, rand);
      if (!off) continue;
      const isDirt = mask[row * cols + col];
      const tKey = isDirt ? terrainHighKey : "grass";
      const bufs = blockByKey.get(tKey);
      const input = block5At(bufs, off[0], off[1]);
      composites.push({ input, left: col * TILE, top: row * TILE });
    }
  }

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const m8 = neighborMask8(mask, col, row, cols, rows);
      if (m8 !== 0) continue;
      if (rand() >= decalChance) continue;
      const isDirt = mask[row * cols + col];
      const decs = isDirt ? dirtDecalBufs : grassDecalBufs;
      if (decs.length === 0) continue;
      const input = decs[Math.floor(rand() * decs.length)];
      composites.push({ input, left: col * TILE, top: row * TILE });
    }
  }

  await sharp({
    create: {
      width: GW,
      height: GH,
      channels: 4,
      background: bg,
    },
  })
    .composite(composites)
    .png()
    .toFile(outFile);
}

async function buildWorldGroundPng(autotileCfg, decalsCfg) {
  await buildGroundPng({
    outFile: path.join(outRoot, "world_ground.png"),
    pathSegments: PATH_SEGMENTS_LAYOUT,
    seed: 0x4e4147,
    bg: { r: 51, g: 119, b: 3, alpha: 1 },
    terrainHighKey: "dirt_warm",
    darkThreshold: 0.55,
    decalChance: 0.05,
    autotileCfg,
    decalsCfg,
  });
}

async function buildForestGroundPng(autotileCfg, decalsCfg) {
  await buildGroundPng({
    outFile: path.join(outRoot, "forest_ground.png"),
    pathSegments: FOREST_PATH_SEGMENTS_LAYOUT,
    seed: 0x51b2a3,
    bg: { r: 45, g: 95, b: 3, alpha: 1 },
    terrainHighKey: "dirt_red",
    darkThreshold: 0.48,
    decalChance: 0.08,
    autotileCfg,
    decalsCfg,
  });
}

/**
 * 64×64 бесшовный блок: 4×4 из light/dark fill (`fillRow`/`darkRow`/`fillCols`)
 * без флипов и без декалей — чистая плитка для рантайм tileSprite.
 */
async function buildSeamlessTerrain64(
  outRel,
  terrainKey,
  autotileCfg,
  seed,
  darkChance = 0.12
) {
  const rand = mulberry32(seed >>> 0);
  const t = autotileCfg.terrains[terrainKey];
  const light = await Promise.all(
    t.fillCols.map((fc) => floorTileBuf(fc, t.fillRow))
  );
  const dark = await Promise.all(
    t.fillCols.map((fc) => floorTileBuf(fc, t.darkRow))
  );
  const composites = [];
  for (let gy = 0; gy < 4; gy++) {
    for (let gx = 0; gx < 4; gx++) {
      const useDark = rand() < darkChance;
      const pool = useDark ? dark : light;
      const input = pool[Math.floor(rand() * pool.length)];
      composites.push({ input, left: gx * TILE, top: gy * TILE });
    }
  }
  await sharp({
    create: {
      width: 64,
      height: 64,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite(composites)
    .png()
    .toFile(path.join(outRoot, outRel));
}

async function buildGrassDecorAtlas() {
  const veg = path.join(PC, "Environment", "Props", "Static", "Vegetation.png");
  const rocks = path.join(PC, "Environment", "Props", "Static", "Rocks.png");
  const crops = [
    await extractTile(veg, 8, 16).png().toBuffer(),
    await extractTile(veg, 14, 18).png().toBuffer(),
    await sharp(rocks).extract({ left: 48, top: 96, width: 16, height: 16 }).png().toBuffer(),
    await extractTile(veg, 12, 14).png().toBuffer(),
  ];
  const FW = 32;
  const FH = 32;
  const composites = [];
  for (let i = 0; i < 4; i++) {
    const padded = await sharp(crops[i])
      .resize(FW, FH, { kernel: sharp.kernel.nearest, fit: "contain", position: "south" })
      .png()
      .toBuffer();
    composites.push({ input: padded, left: i * FW, top: 0 });
  }
  await sharp({
    create: {
      width: FW * 4,
      height: FH,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite(composites)
    .png()
    .toFile(path.join(outRoot, "decor", "grass_decor.png"));
}

async function assertPngMatchesAsepriteSpec(srcAbs, specAbs) {
  if (!fs.existsSync(specAbs)) {
    throw new Error(`Нет файла спецификации: ${specAbs}`);
  }
  const spec = JSON.parse(fs.readFileSync(specAbs, "utf8"));
  const cw = spec?.canvas?.width;
  const ch = spec?.canvas?.height;
  if (typeof cw !== "number" || typeof ch !== "number") {
    throw new Error(`В spec нет canvas.width/height: ${specAbs}`);
  }
  const meta = await sharp(srcAbs).metadata();
  const w = meta.width ?? 0;
  const h = meta.height ?? 0;
  if (w !== cw || h !== ch) {
    throw new Error(
      `PNG не совпадает с холстом из Aseprite (${w}×${h} vs ${cw}×${ch}): ${srcAbs}`
    );
  }
}

/**
 * Декоративные вырезы из Pixel Crawler — единый реестр
 * `src/game/data/pc-pack-decor-extracts.json` + проверка размеров по `*.aseprite.spec.json`.
 */
async function buildDecorFromPcPackManifest() {
  const manifestPath = path.join(
    root,
    "src",
    "game",
    "data",
    "pc-pack-decor-extracts.json"
  );
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`Нет ${manifestPath}`);
  }
  const { extractions } = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  if (!Array.isArray(extractions)) {
    throw new Error("pc-pack-decor-extracts.json: ожидается массив extractions");
  }
  for (const ex of extractions) {
    const kind = ex.kind ?? "extract";
    const srcAbs = path.join(PC, ...String(ex.srcRel).split("/"));
    if (!fs.existsSync(srcAbs)) {
      throw new Error(`Нет исходника декора: ${srcAbs}`);
    }
    if (ex.asepriteSpecRel) {
      const specAbs = path.join(PC, ...String(ex.asepriteSpecRel).split("/"));
      await assertPngMatchesAsepriteSpec(srcAbs, specAbs);
    }
    const outAbs = path.join(outRoot, ...String(ex.outRel).split("/"));
    mkdirp(path.dirname(outAbs));
    if (kind === "extract") {
      const s = ex.slice;
      if (
        typeof s?.left !== "number" ||
        typeof s?.top !== "number" ||
        typeof s?.width !== "number" ||
        typeof s?.height !== "number"
      ) {
        throw new Error(`extract «${ex.id}»: неверный slice`);
      }
      await cropToFile(srcAbs, s.left, s.top, s.width, s.height, outAbs);
    } else if (kind === "verticalStripToHorizontal") {
      const fw = ex.frameWidth;
      const fh = ex.frameHeight;
      const fc = ex.frameCount;
      if (
        typeof fw !== "number" ||
        typeof fh !== "number" ||
        typeof fc !== "number" ||
        fw < 1 ||
        fh < 1 ||
        fc < 1
      ) {
        throw new Error(`verticalStrip «${ex.id}»: неверные размеры/кадры`);
      }
      await verticalStripToHorizontal(srcAbs, fw, fh, fc, outAbs);
    } else {
      throw new Error(`Неизвестный kind декора: ${kind} (${ex.id})`);
    }
  }
}

async function main() {
  mkdirp(path.join(outRoot, "units"));
  mkdirp(path.join(outRoot, "buildings"));
  mkdirp(path.join(outRoot, "decor"));

  const required = [
    PC,
    FLOORS,
    WATER,
    WALLS,
    ROOFS,
    PC_BODY,
    PC_NPC,
    PC_MOBS,
  ];
  for (const p of required) {
    if (!fs.existsSync(p)) {
      throw new Error(`Отсутствует Pixel Crawler: ${p}`);
    }
  }

  const autotileCfgPath = path.join(__dirname, "pc-terrain-autotile.json");
  const decalsCfgPath = path.join(__dirname, "pc-terrain-decals.json");
  if (!fs.existsSync(autotileCfgPath)) {
    throw new Error(`Нет ${autotileCfgPath}`);
  }
  if (!fs.existsSync(decalsCfgPath)) {
    throw new Error(`Нет ${decalsCfgPath}`);
  }
  const autotileCfg = JSON.parse(fs.readFileSync(autotileCfgPath, "utf8"));
  const decalsCfg = JSON.parse(fs.readFileSync(decalsCfgPath, "utf8"));

  const vegDec = path.join(PC, decalsCfg.vegetationRel.replace(/\//g, path.sep));
  const rocksDec = path.join(PC, decalsCfg.rocksRel.replace(/\//g, path.sep));
  for (const p of [vegDec, rocksDec]) {
    if (!fs.existsSync(p)) {
      throw new Error(`Отсутствует декаль-источник: ${p}`);
    }
  }

  await buildSeamlessTerrain64("grass.png", "grass", autotileCfg, 0x47114, 0.12);
  await buildSeamlessTerrain64(
    "dirt.png",
    "dirt_warm",
    autotileCfg,
    0x81733,
    0.12
  );
  await buildGrassDecorAtlas();
  await buildWorldGroundPng(autotileCfg, decalsCfg);
  await buildForestGroundPng(autotileCfg, decalsCfg);

  await buildHousePng();
  await buildPondPng();

  await buildDecorFromPcPackManifest();
  await buildNatureDecorFromMap({ root, outRoot });

  const heroDataPath = path.join(root, "src", "game", "data", "heroAnimSheets.json");
  const heroData = JSON.parse(fs.readFileSync(heroDataPath, "utf8"));
  const { clips, frameSize: heroFrameSizeFromJson, heroManifest } = heroData;
  if (!Array.isArray(clips) || clips.length < 1) {
    throw new Error("heroAnimSheets.json: ожидается непустой массив clips");
  }
  if (!heroManifest || typeof heroManifest !== "object") {
    throw new Error("heroAnimSheets.json: отсутствует heroManifest");
  }
  for (const c of clips) {
    const rel = c.rel.replace(/\//g, path.sep);
    const src = path.join(PC_BODY, rel);
    if (!fs.existsSync(src)) {
      throw new Error(`Нет листа героя: ${src}`);
    }
    copy(src, path.join(outRoot, "units", `${c.textureKey}.png`));
  }

  const npcCopies = [
    ["Knight", "knight"],
    ["Rogue", "rogue"],
    ["Wizzard", "wizzard"],
  ];
  for (const [folder, key] of npcCopies) {
    copy(
      path.join(PC_NPC, folder, "Idle", "Idle-Sheet.png"),
      path.join(outRoot, "units", `npc_${key}_idle.png`)
    );
    copy(
      path.join(PC_NPC, folder, "Run", "Run-Sheet.png"),
      path.join(outRoot, "units", `npc_${key}_run.png`)
    );
  }

  const mobDataPath = path.join(root, "src", "game", "data", "mobAnimSheets.json");
  const mobData = JSON.parse(fs.readFileSync(mobDataPath, "utf8"));
  if (!Array.isArray(mobData.mobs) || mobData.mobs.length < 1) {
    throw new Error("mobAnimSheets.json: ожидается непустой массив mobs");
  }

  const mobIdleF = 32;
  const mobRunF = 64;
  const mobIdleFrames = 4;
  const mobRunFrames = 6;

  /** @type {Array<Record<string, unknown>>} */
  const mobLoadEntries = [];
  /** @type {Array<Record<string, unknown>>} */
  const mobAnimEntries = [];
  const manifestMobs = {};

  const mobAnimKey = (id, part) => `a-mob-${id.replace(/_/g, "-")}-${part}`;

  for (const m of mobData.mobs) {
    const id = m.id;
    const rel = m.folder.replace(/\//g, path.sep);
    const baseDir = path.join(PC_MOBS, rel);
    const idleSrc = path.join(baseDir, "Idle", "Idle-Sheet.png");
    const runSrc = path.join(baseDir, "Run", "Run-Sheet.png");
    if (!fs.existsSync(idleSrc)) {
      throw new Error(`Нет Idle моба: ${idleSrc}`);
    }
    if (!fs.existsSync(runSrc)) {
      throw new Error(`Нет Run моба: ${runSrc}`);
    }
    const tkIdle = `mob_${id}_idle`;
    const tkRun = `mob_${id}_run`;
    copy(idleSrc, path.join(outRoot, "units", `${tkIdle}.png`));
    copy(runSrc, path.join(outRoot, "units", `${tkRun}.png`));
    const idleAnim = mobAnimKey(id, "idle");
    const runAnim = mobAnimKey(id, "run");
    mobLoadEntries.push(
      {
        key: tkIdle,
        type: "spritesheet",
        url: `/assets/world/units/${tkIdle}.png`,
        frameWidth: mobIdleF,
        frameHeight: mobIdleF,
      },
      {
        key: tkRun,
        type: "spritesheet",
        url: `/assets/world/units/${tkRun}.png`,
        frameWidth: mobRunF,
        frameHeight: mobRunF,
      }
    );
    mobAnimEntries.push(
      {
        key: idleAnim,
        textureKey: tkIdle,
        start: 0,
        end: mobIdleFrames - 1,
        frameRate: 6,
        repeat: -1,
      },
      {
        key: runAnim,
        textureKey: tkRun,
        start: 0,
        end: mobRunFrames - 1,
        frameRate: 10,
        repeat: -1,
      }
    );
    manifestMobs[id] = { idleAnim, runAnim, textureKeyIdle: tkIdle };
  }

  const PCF = typeof heroFrameSizeFromJson === "number" ? heroFrameSizeFromJson : 64;

  const pcHeroLoads = clips.map((c) => ({
    key: c.textureKey,
    type: "spritesheet",
    url: `/assets/world/units/${c.textureKey}.png`,
    frameWidth: PCF,
    frameHeight: PCF,
  }));

  const pcHeroAnimations = clips.map((c) => ({
    key: c.animKey,
    textureKey: c.textureKey,
    start: 0,
    end: c.frames - 1,
    frameRate: c.fps,
    repeat: c.repeat,
  }));

  const manifestHero = { frameSize: PCF, ...heroManifest };

  const npcIdleF = 32;
  const npcRunF = 64;

  const npcIdleFrames = 4;
  const npcRunFrames = 6;

  const manifest = {
    world: { width: 1280, height: 960 },
    load: [
      { key: "grass", type: "image", url: "/assets/world/grass.png" },
      { key: "dirt", type: "image", url: "/assets/world/dirt.png" },
      {
        key: "world_ground",
        type: "image",
        url: "/assets/world/world_ground.png",
      },
      {
        key: "forest_ground",
        type: "image",
        url: "/assets/world/forest_ground.png",
      },
      {
        key: "grass_decor",
        type: "spritesheet",
        url: "/assets/world/decor/grass_decor.png",
        frameWidth: 32,
        frameHeight: 32,
      },
      {
        key: "house",
        type: "image",
        url: "/assets/world/buildings/house.png",
      },
      { key: "pond", type: "image", url: "/assets/world/decor/pond.png" },
      { key: "tree1", type: "image", url: "/assets/world/decor/tree1.png" },
      { key: "tree1_autumn", type: "image", url: "/assets/world/decor/tree1_autumn.png" },
      { key: "tree2", type: "image", url: "/assets/world/decor/tree2.png" },
      { key: "tree3", type: "image", url: "/assets/world/decor/tree3.png" },
      { key: "tree3_red", type: "image", url: "/assets/world/decor/tree3_red.png" },
      {
        key: "tree_chopped_pine",
        type: "image",
        url: "/assets/world/decor/tree_chopped_pine.png",
      },
      {
        key: "tree_chopped_fir",
        type: "image",
        url: "/assets/world/decor/tree_chopped_fir.png",
      },
      {
        key: "tree_chopped_grand_fir",
        type: "image",
        url: "/assets/world/decor/tree_chopped_grand_fir.png",
      },
      { key: "rock1", type: "image", url: "/assets/world/decor/rock1.png" },
      { key: "rock2", type: "image", url: "/assets/world/decor/rock2.png" },
      {
        key: "nature_rocks",
        type: "image",
        url: "/assets/nature/Rocks.png",
      },
      { key: "bush1", type: "image", url: "/assets/world/decor/bush1.png" },
      { key: "bush2", type: "image", url: "/assets/world/decor/bush2.png" },
      { key: "bench", type: "image", url: "/assets/world/decor/bench.png" },
      { key: "chest", type: "image", url: "/assets/world/decor/chest.png" },
      {
        key: "bonfire_sheet",
        type: "spritesheet",
        url: "/assets/world/decor/bonfire_sheet.png",
        frameWidth: 64,
        frameHeight: 64,
      },
      {
        key: "craft_wb_house",
        type: "image",
        url: "/assets/stations/Workbench.png",
      },
      {
        key: "craft_wb_workshop",
        type: "image",
        url: "/assets/stations/Workbench.png",
      },
      {
        key: "craft_sawmill",
        type: "image",
        url: "/assets/stations/Sawmill.png",
      },
      {
        key: "craft_anvil",
        type: "image",
        url: "/assets/stations/Anvil.png",
      },
      {
        key: "craft_cooking",
        type: "image",
        url: "/assets/stations/Cooking.png",
      },
      {
        key: "craft_alchemy",
        type: "image",
        url: "/assets/stations/Alchemy.png",
      },
      ...pcHeroLoads,
      ...mobLoadEntries,
      {
        key: "npc_knight_idle",
        type: "spritesheet",
        url: "/assets/world/units/npc_knight_idle.png",
        frameWidth: npcIdleF,
        frameHeight: npcIdleF,
      },
      {
        key: "npc_knight_run",
        type: "spritesheet",
        url: "/assets/world/units/npc_knight_run.png",
        frameWidth: npcRunF,
        frameHeight: npcRunF,
      },
      {
        key: "npc_rogue_idle",
        type: "spritesheet",
        url: "/assets/world/units/npc_rogue_idle.png",
        frameWidth: npcIdleF,
        frameHeight: npcIdleF,
      },
      {
        key: "npc_rogue_run",
        type: "spritesheet",
        url: "/assets/world/units/npc_rogue_run.png",
        frameWidth: npcRunF,
        frameHeight: npcRunF,
      },
      {
        key: "npc_wizzard_idle",
        type: "spritesheet",
        url: "/assets/world/units/npc_wizzard_idle.png",
        frameWidth: npcIdleF,
        frameHeight: npcIdleF,
      },
      {
        key: "npc_wizzard_run",
        type: "spritesheet",
        url: "/assets/world/units/npc_wizzard_run.png",
        frameWidth: npcRunF,
        frameHeight: npcRunF,
      },
    ],
    animations: [
      ...pcHeroAnimations,
      ...mobAnimEntries,
      {
        key: "a-bonfire",
        textureKey: "bonfire_sheet",
        start: 0,
        end: 5,
        frameRate: 8,
        repeat: -1,
      },
      {
        key: "a-knight-idle",
        textureKey: "npc_knight_idle",
        start: 0,
        end: npcIdleFrames - 1,
        frameRate: 6,
        repeat: -1,
      },
      {
        key: "a-knight-run",
        textureKey: "npc_knight_run",
        start: 0,
        end: npcRunFrames - 1,
        frameRate: 10,
        repeat: -1,
      },
      {
        key: "a-rogue-idle",
        textureKey: "npc_rogue_idle",
        start: 0,
        end: npcIdleFrames - 1,
        frameRate: 6,
        repeat: -1,
      },
      {
        key: "a-rogue-run",
        textureKey: "npc_rogue_run",
        start: 0,
        end: npcRunFrames - 1,
        frameRate: 10,
        repeat: -1,
      },
      {
        key: "a-wizzard-idle",
        textureKey: "npc_wizzard_idle",
        start: 0,
        end: npcIdleFrames - 1,
        frameRate: 6,
        repeat: -1,
      },
      {
        key: "a-wizzard-run",
        textureKey: "npc_wizzard_run",
        start: 0,
        end: npcRunFrames - 1,
        frameRate: 10,
        repeat: -1,
      },
    ],
    hero: manifestHero,
    units: {
      elena: { idleAnim: "a-wizzard-idle", runAnim: "a-wizzard-run" },
      marcus: { idleAnim: "a-knight-idle", runAnim: "a-knight-run" },
      igor: { idleAnim: "a-rogue-idle", runAnim: "a-rogue-run" },
    },
    mobs: manifestMobs,
  };

  fs.writeFileSync(
    path.join(outRoot, "manifest.json"),
    JSON.stringify(manifest, null, 2),
    "utf8"
  );

  execFileSync(
    process.execPath,
    [path.join(__dirname, "gen-pixel-crawler-auto-slices.mjs")],
    { cwd: root, stdio: "inherit" }
  );
  execFileSync(
    process.execPath,
    [path.join(__dirname, "gen-pixel-crawler-environment-load.mjs")],
    { cwd: root, stdio: "inherit" }
  );
  execFileSync(
    process.execPath,
    [path.join(__dirname, "gen-pixel-crawler-slices.mjs")],
    { cwd: root, stdio: "inherit" }
  );

  console.log("world/manifest.json + assets OK (Pixel Crawler only)");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
