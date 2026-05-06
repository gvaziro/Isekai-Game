/**
 * Собирает runtime-карту города: встраивает внешние .tsx в TMJ, разворачивает group-слои
 * в плоский список (Phaser без вложенных групп), пишет список PNG для загрузчика.
 *
 * Запуск: node scripts/flatten-town-tmj.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { PNG } from "pngjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const townDir = path.join(root, "public", "assets", "world", "maps", "town");
const cyrSrc = path.join(townDir, "Таун.tmj");
const ascSrc = path.join(townDir, "town.tmj");
const outMap = path.join(townDir, "town.tmj");
const outLoad = path.join(townDir, "town-tilesets.load.json");
const outGenTs = path.join(root, "src", "game", "maps", "townTilesetPreload.gen.ts");

function parseTsx(xml) {
  const tilesetTag = xml.match(/<tileset\b[^>]*>/);
  const nameM = tilesetTag?.[0]?.match(/\bname="([^"]+)"/);
  const tw = Number(xml.match(/tilewidth="(\d+)"/)?.[1] ?? 16);
  const th = Number(xml.match(/tileheight="(\d+)"/)?.[1] ?? 16);
  const tilecount = Number(xml.match(/tilecount="(\d+)"/)?.[1] ?? 0);
  const columns = Number(xml.match(/columns="(\d+)"/)?.[1] ?? 1);
  const imgM = xml.match(
    /<image\s+source="([^"]+)"\s+width="(\d+)"\s+height="(\d+)"/m
  );
  if (!imgM) {
    throw new Error("parseTsx: нет <image> в tsx");
  }
  return {
    name: nameM?.[1] ?? "tileset",
    tilewidth: tw,
    tileheight: th,
    tilecount,
    columns,
    margin: Number(xml.match(/margin="(\d+)"/)?.[1] ?? 0),
    spacing: Number(xml.match(/spacing="(\d+)"/)?.[1] ?? 0),
    image: imgM[1],
    imagewidth: Number(imgM[2]),
    imageheight: Number(imgM[3]),
  };
}

function embedTilesets(mapJson) {
  const tilesets = mapJson.tilesets;
  const next = [];
  for (const ts of tilesets) {
    if (ts.source) {
      let tsPath = path.join(townDir, ts.source);
      if (!fs.existsSync(tsPath)) {
        const alt = path.join(townDir, "Деревья.tsx");
        if (ts.source.includes("\u0414") && fs.existsSync(alt)) {
          tsPath = alt;
        }
      }
      if (!fs.existsSync(tsPath)) {
        throw new Error(`Нет файла тайлсета: ${ts.source}`);
      }
      const raw = fs.readFileSync(tsPath, "utf8");
      const p = parseTsx(raw);
      next.push({
        columns: p.columns,
        firstgid: ts.firstgid,
        image: p.image.replace(/\\/g, "/"),
        imageheight: p.imageheight,
        imagewidth: p.imagewidth,
        margin: p.margin,
        name: p.name,
        spacing: p.spacing,
        tilecount: p.tilecount,
        tileheight: p.tileheight,
        tilewidth: p.tilewidth,
      });
    } else {
      if (ts.image) {
        next.push({
          ...ts,
          image: String(ts.image).replace(/\\/g, "/"),
        });
      } else {
        next.push(ts);
      }
    }
  }
  mapJson.tilesets = next;
}

/** Два тайлсета могут иметь одинаковое имя `Size_03` (разные PNG) — уникализируем для Phaser. */
function dedupeTilesetNames(tilesets) {
  const seen = new Map();
  for (const ts of tilesets) {
    const base = ts.name;
    if (!seen.has(base)) {
      seen.set(base, true);
      continue;
    }
    ts.name = `${base}_${ts.firstgid}`;
  }
}

/**
 * Tileset деревьев Model_01 должен отличаться по имени от Model_02 Size_03.
 * После первого flatten без external source это имя могло остаться неверным.
 */
function fixMisnamedTreeTilesets(tilesets) {
  for (const ts of tilesets) {
    const img = ts.image ? String(ts.image).replace(/\\/g, "/") : "";
    if (
      img.includes("Trees/Model_01/Size_03.png") &&
      ts.name === "Size_03"
    ) {
      ts.name = "Trees_M01";
    }
  }
}

/** Реальные размеры PNG → TMJ (Phaser ругается, если атлас не бьётся в сетку тайла). */
function syncTilesetImageDimensionsFromPng(mapJson) {
  for (const ts of mapJson.tilesets) {
    if (!ts.image) continue;
    const rel = String(ts.image).replace(/\\/g, "/");
    const pngPath = path.join(townDir, rel);
    if (!fs.existsSync(pngPath)) {
      console.warn("[flatten-town] нет PNG для тайлсета:", rel);
      continue;
    }
    let w;
    let h;
    try {
      const buf = fs.readFileSync(pngPath);
      const parsed = PNG.sync.read(buf);
      w = parsed.width;
      h = parsed.height;
    } catch (e) {
      console.warn("[flatten-town] не прочитан PNG:", rel, e);
      continue;
    }
    ts.imagewidth = w;
    ts.imageheight = h;
    const tw = ts.tilewidth ?? 16;
    const th = ts.tileheight ?? 16;
    const margin = ts.margin ?? 0;
    const spacing = ts.spacing ?? 0;
    const cols = Math.floor((w - margin * 2 + spacing) / (tw + spacing));
    const rows = Math.floor((h - margin * 2 + spacing) / (th + spacing));
    if (cols > 0 && rows > 0) {
      ts.columns = cols;
      ts.tilecount = cols * rows;
    }
  }
}

/** Разворачивает group в линейный список слоёв; имена делаем уникальными. */
function flattenLayers(layers, prefix = "") {
  if (!Array.isArray(layers)) return [];
  const out = [];
  for (const layer of layers) {
    if (layer.type === "group") {
      const p =
        prefix +
        String(layer.name ?? "group")
          .replace(/\s+/g, "_")
          .replace(/[^\w\u0400-\u04FF_-]/g, "") +
        "_";
      out.push(...flattenLayers(layer.layers, p));
    } else {
      const rawBase = String(layer.name ?? "layer");
      const base = rawBase.replace(/(_id\d+)+$/g, "");
      const idPart = layer.id != null ? `_id${layer.id}` : "";
      out.push({
        ...layer,
        name: `${prefix}${base}${idPart}`,
      });
    }
  }
  return out;
}

function collectTilesetImages(mapJson) {
  const urls = [];
  for (const ts of mapJson.tilesets) {
    if (!ts.image) continue;
    const safeName = String(ts.name).replace(/[^a-zA-Z0-9_]/g, "_");
    const key = `town_ts_${safeName}_${ts.firstgid}`;
    const url = `/assets/world/maps/town/${ts.image}`.replace(/\\/g, "/");
    urls.push({ key, url });
  }
  return { urls };
}

function mkdirp(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function main() {
  const srcMap = fs.existsSync(cyrSrc) ? cyrSrc : ascSrc;
  if (!fs.existsSync(srcMap)) {
    console.error("Нет TMJ (ожидали Таун.tmj или town.tmj):", townDir);
    process.exit(1);
  }
  const raw = fs.readFileSync(srcMap, "utf8");
  const mapJson = JSON.parse(raw);
  embedTilesets(mapJson);
  fixMisnamedTreeTilesets(mapJson.tilesets);
  dedupeTilesetNames(mapJson.tilesets);
  syncTilesetImageDimensionsFromPng(mapJson);
  mapJson.layers = flattenLayers(mapJson.layers);
  fs.writeFileSync(outMap, JSON.stringify(mapJson));
  const { urls } = collectTilesetImages(mapJson);
  fs.writeFileSync(outLoad, JSON.stringify({ load: urls }, null, 2));
  const genBody = `/** Авто из scripts/flatten-town-tmj.mjs — не править вручную. */
export const TOWN_TILESET_LOAD = ${JSON.stringify(urls, null, 2)} as const;
`;
  mkdirp(path.dirname(outGenTs));
  fs.writeFileSync(outGenTs, genBody);
  console.log("OK:", outMap);
  console.log("OK:", outLoad, `(${urls.length} textures)`);
  console.log("OK:", outGenTs);
}

main();
