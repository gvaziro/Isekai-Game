/**
 * Сканирует все .png под Pixel Crawler …/Environment/
 * и пишет public/assets/world/pixel-crawler-environment.load.json для редактора карт.
 * Для ключей из scripts/pc-env-sheet-grids.json — type: spritesheet (проверка размеров sharp).
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import sharp from "sharp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const envRoot = path.join(
  root,
  "public",
  "assets",
  "Pixel Crawler - Free Pack",
  "Environment"
);
const gridsFile = path.join(__dirname, "pc-env-sheet-grids.json");
const outFile = path.join(
  root,
  "public",
  "assets",
  "world",
  "pixel-crawler-environment.load.json"
);
const excludedFile = path.join(
  root,
  "public",
  "assets",
  "world",
  "pixel-crawler-autoslices.excluded.json"
);

function readExcludedUrlSet() {
  try {
    const j = JSON.parse(fs.readFileSync(excludedFile, "utf8"));
    const arr = Array.isArray(j.urls) ? j.urls : [];
    return new Set(arr.map((s) => String(s)));
  } catch {
    return new Set();
  }
}

const PACK_DIR = "Pixel Crawler - Free Pack";

/** @typedef {{ keyPrefix: string, frameWidth: number, frameHeight: number }} GridRule */

function toPosix(p) {
  return p.split(path.sep).join("/");
}

function walkPngFiles(dir, baseRel = "") {
  /** @type {string[]} */
  const out = [];
  if (!fs.existsSync(dir)) {
    console.warn("[gen-pc-env] нет папки:", dir);
    return out;
  }
  for (const name of fs.readdirSync(dir, { withFileTypes: true })) {
    const rel = baseRel ? `${baseRel}/${name.name}` : name.name;
    const full = path.join(dir, name.name);
    if (name.isDirectory()) {
      out.push(...walkPngFiles(full, rel));
    } else if (name.isFile() && name.name.toLowerCase().endsWith(".png")) {
      out.push(toPosix(rel));
    }
  }
  return out.sort((a, b) => a.localeCompare(b, "en"));
}

function slugKey(relPosix) {
  const noExt = relPosix.replace(/\.png$/i, "");
  const s = noExt
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return `pc_env_${s}`;
}

function encodePublicUrl(relPosix) {
  const parts = [PACK_DIR, "Environment", ...relPosix.split("/")];
  return "/assets/" + parts.map((p) => encodeURIComponent(p)).join("/");
}

function readGrids() {
  try {
    const raw = fs.readFileSync(gridsFile, "utf8");
    const j = JSON.parse(raw);
    return Array.isArray(j.grids) ? /** @type {GridRule[]} */ (j.grids) : [];
  } catch {
    return [];
  }
}

/** @param {string} key */
function gridForKey(key, grids) {
  for (const g of grids) {
    if (typeof g.keyPrefix === "string" && key.startsWith(g.keyPrefix)) {
      return g;
    }
  }
  return null;
}

function mkdirp(p) {
  fs.mkdirSync(p, { recursive: true });
}

const rels = walkPngFiles(envRoot);
const used = new Set();
const grids = readGrids();
const excludedUrls = readExcludedUrlSet();

/** @type {object[]} */
const load = [];
let skippedAutosliced = 0;

for (const rel of rels) {
  let key = slugKey(rel);
  let n = 2;
  while (used.has(key)) {
    key = `${slugKey(rel)}__${n++}`;
  }
  used.add(key);

  const url = encodePublicUrl(rel);
  if (excludedUrls.has(url)) {
    skippedAutosliced++;
    continue;
  }

  const abs = path.join(envRoot, ...rel.split("/"));
  const grid = gridForKey(key, grids);

  if (!grid) {
    load.push({
      key,
      type: "image",
      url,
    });
    continue;
  }

  const meta = await sharp(abs).metadata();
  const w = meta.width ?? 0;
  const h = meta.height ?? 0;
  const fw = grid.frameWidth;
  const fh = grid.frameHeight;
  if (
    w <= 0 ||
    h <= 0 ||
    fw <= 0 ||
    fh <= 0 ||
    w % fw !== 0 ||
    h % fh !== 0
  ) {
    console.warn(
      `[gen-pc-env] сетка не подходит для ${key} (${w}×${h}, ячейка ${fw}×${fh}) — оставляем image`
    );
    load.push({
      key,
      type: "image",
      url,
    });
    continue;
  }

  const cols = Math.floor(w / fw);
  const rows = Math.floor(h / fh);
  const frameCount = cols * rows;
  load.push({
    key,
    type: "spritesheet",
    url,
    frameWidth: fw,
    frameHeight: fh,
    frameCount,
  });
}

mkdirp(path.dirname(outFile));
fs.writeFileSync(
  outFile,
  JSON.stringify({ load }, null, 2) + "\n",
  "utf8"
);
console.log(
  `[gen-pc-env] ${load.length} записей → ${path.relative(root, outFile)} (скрыто автонарезкой: ${skippedAutosliced})`
);
