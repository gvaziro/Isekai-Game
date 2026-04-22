/**
 * Упаковка всех PNG из public/assets/items/ в один атлас для Phaser (JSON Hash).
 * Формат atlas JSON совместим с this.load.atlas("items_atlas", png, json).
 *
 * Алгоритм: shelf packing при фиксированной ширине листа (см. ATLAS_MAX_W).
 * При переполнении по высоте (> ATLAS_MAX_H) — процесс завершается с ошибкой;
 * при необходимости увеличьте константы или разбейте на несколько страниц вручную.
 */

import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import sharp from "sharp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const ITEMS_DIR = path.join(ROOT, "public", "assets", "items");
const OUT_DIR = path.join(ROOT, "public", "assets", "world");
const GENERATED_TS = path.join(ROOT, "src", "game", "data", "items.generated.ts");

const PAD = 2;
const ATLAS_MAX_W = 8192;
const ATLAS_MAX_H = 8192;

function naturalCompare(a, b) {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
}

async function collectPngPaths(dir) {
  const out = [];
  const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      out.push(...(await collectPngPaths(full)));
    } else if (e.isFile() && e.name.toLowerCase().endsWith(".png")) {
      out.push(full);
    }
  }
  return out;
}

async function main() {
  const pngPaths = await collectPngPaths(ITEMS_DIR);
  if (pngPaths.length === 0) {
    console.warn("[items-catalog] Нет PNG в", ITEMS_DIR);
    await fs.mkdir(OUT_DIR, { recursive: true });
    await writeStubGenerated();
    return;
  }

  pngPaths.sort((a, b) => naturalCompare(path.basename(a), path.basename(b)));

  const items = [];
  for (const filePath of pngPaths) {
    const meta = await sharp(filePath).metadata();
    const w = meta.width ?? 0;
    const h = meta.height ?? 0;
    const key = path.basename(filePath, ".png");
    items.push({ filePath, key, w, h });
  }

  items.sort((a, b) => b.h - a.h || naturalCompare(a.key, b.key));

  let x = PAD;
  let y = PAD;
  let rowH = 0;
  const placements = [];

  for (const it of items) {
    if (it.w + 2 * PAD > ATLAS_MAX_W || it.h + 2 * PAD > ATLAS_MAX_H) {
      console.error(
        `[items-catalog] Слишком большой спрайт: ${it.key} (${it.w}×${it.h}), лимит листа ${ATLAS_MAX_W}×${ATLAS_MAX_H}`
      );
      process.exit(1);
    }
    const iw = it.w + PAD;
    if (x + iw > ATLAS_MAX_W && x > PAD) {
      y += rowH + PAD;
      x = PAD;
      rowH = 0;
    }
    if (y + it.h + PAD > ATLAS_MAX_H) {
      console.error(
        `[items-catalog] Переполнение атласа (${items.length} файлов). Увеличьте ATLAS_MAX_W/H или разбейте ассеты.`
      );
      process.exit(1);
    }
    placements.push({
      ...it,
      px: x,
      py: y,
    });
    rowH = Math.max(rowH, it.h);
    x += it.w + PAD;
  }

  let maxX = PAD;
  let maxY = PAD;
  for (const p of placements) {
    maxX = Math.max(maxX, p.px + p.w + PAD);
    maxY = Math.max(maxY, p.py + p.h + PAD);
  }
  const atlasW = Math.min(ATLAS_MAX_W, maxX);
  const atlasH = Math.min(ATLAS_MAX_H, maxY);

  const composites = [];
  const frames = {};

  for (const p of placements) {
    const buf = await fs.readFile(p.filePath);
    composites.push({
      input: buf,
      left: p.px,
      top: p.py,
    });
    frames[p.key] = {
      frame: { x: p.px, y: p.py, w: p.w, h: p.h },
      rotated: false,
      trimmed: false,
      spriteSourceSize: { x: 0, y: 0, w: p.w, h: p.h },
      sourceSize: { w: p.w, h: p.h },
    };
  }

  await fs.mkdir(OUT_DIR, { recursive: true });

  const pngOut = path.join(OUT_DIR, "items_atlas.png");
  const jsonOut = path.join(OUT_DIR, "items_atlas.json");

  await sharp({
    create: {
      width: atlasW,
      height: atlasH,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite(composites)
    .png()
    .toFile(pngOut);

  const atlasJson = {
    frames,
    meta: {
      image: "items_atlas.png",
      format: "RGBA8888",
      size: { w: atlasW, h: atlasH },
      scale: "1",
    },
  };

  await fs.writeFile(jsonOut, JSON.stringify(atlasJson, null, 2), "utf8");

  const sortedKeys = placements.slice().sort((a, b) => naturalCompare(a.key, b.key));
  await writeGeneratedTs(sortedKeys.map((p) => p.key), atlasW, atlasH);

  console.log(
    `[items-catalog] OK: ${placements.length} спрайтов → ${path.relative(ROOT, pngOut)} (${atlasW}×${atlasH})`
  );
}

async function writeStubGenerated() {
  const stub = `/**
 * Stub: no PNG in public/assets/items -- run npm run gen-items after adding icons.
 */
export const ITEM_ATLAS_WIDTH = 0;
export const ITEM_ATLAS_HEIGHT = 0;

export const ITEM_ATLAS_FRAME_KEYS = [] as const;

export type ItemAtlasFrameKey = string;

export const ITEM_ATLAS = {
  textureKey: "items_atlas",
  pngUrl: "/assets/world/items_atlas.png",
  jsonUrl: "/assets/world/items_atlas.json",
  /** Атлас отсутствует или пуст */
  available: false as const,
};
`;
  await fs.mkdir(path.dirname(GENERATED_TS), { recursive: true });
  await fs.writeFile(GENERATED_TS, stub, "utf8");
}

async function writeGeneratedTs(keys, atlasW, atlasH) {
  const keysJson = JSON.stringify(keys);
  const body = `/**
 * Generated by scripts/items-catalog.mjs -- do not edit by hand.
 * Regenerate: npm run gen-items
 */
export const ITEM_ATLAS_WIDTH = ${atlasW};
export const ITEM_ATLAS_HEIGHT = ${atlasH};

/** Frame keys in the atlas (png basenames without extension) */
export const ITEM_ATLAS_FRAME_KEYS: readonly string[] = ${keysJson};

export type ItemAtlasFrameKey = string;

export const ITEM_ATLAS = {
  textureKey: "items_atlas",
  pngUrl: "/assets/world/items_atlas.png",
  jsonUrl: "/assets/world/items_atlas.json",
  available: true as const,
};
`;
  await fs.mkdir(path.dirname(GENERATED_TS), { recursive: true });
  await fs.writeFile(GENERATED_TS, body, "utf8");
}

await main();
