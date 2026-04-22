/**
 * Читает scripts/pc-env-slices.json, вырезает регионы sharp →
 * public/assets/world/pc-env-slices/*.png и пишет pixel-crawler-slices.load.json.
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
const slicesConfig = path.join(__dirname, "pc-env-slices.json");
const outDir = path.join(root, "public", "assets", "world", "pc-env-slices");
const outJson = path.join(
  root,
  "public",
  "assets",
  "world",
  "pixel-crawler-slices.load.json"
);

function mkdirp(p) {
  fs.mkdirSync(p, { recursive: true });
}

function slug(s) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

let raw;
try {
  raw = JSON.parse(fs.readFileSync(slicesConfig, "utf8"));
} catch (e) {
  console.warn("[gen-pc-slices] нет или битый pc-env-slices.json", e);
  raw = { slices: [] };
}

const slices = Array.isArray(raw.slices) ? raw.slices : [];
/** @type {{ key: string, type: string, url: string }[]} */
const load = [];
const usedKeys = new Set();

for (const block of slices) {
  const sourceRel = block?.sourceRel;
  const items = Array.isArray(block?.items) ? block.items : [];
  if (!sourceRel || items.length === 0) continue;
  const abs = path.join(envRoot, ...String(sourceRel).split("/"));
  if (!fs.existsSync(abs)) {
    console.warn("[gen-pc-slices] нет файла:", abs);
    continue;
  }
  const baseSlug = slug(sourceRel.replace(/\.png$/i, ""));
  for (const it of items) {
    const id = it?.id;
    const x = Number(it?.x);
    const y = Number(it?.y);
    const w = Number(it?.w);
    const h = Number(it?.h);
    if (!id || !Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(w) || !Number.isFinite(h) || w < 1 || h < 1) {
      console.warn("[gen-pc-slices] пропуск элемента:", it);
      continue;
    }
    let key = `pc_slice_${baseSlug}_${slug(String(id))}`;
    let n = 2;
    while (usedKeys.has(key)) {
      key = `pc_slice_${baseSlug}_${slug(String(id))}__${n++}`;
    }
    usedKeys.add(key);
    const fname = `${key}.png`;
    mkdirp(outDir);
    const outPath = path.join(outDir, fname);
    await sharp(abs)
      .extract({ left: x, top: y, width: w, height: h })
      .png()
      .toFile(outPath);
    load.push({
      key,
      type: "image",
      url: `/assets/world/pc-env-slices/${fname}`,
    });
  }
}

mkdirp(path.dirname(outJson));
fs.writeFileSync(
  outJson,
  JSON.stringify({ load }, null, 2) + "\n",
  "utf8"
);
console.log(
  `[gen-pc-slices] ${load.length} PNG → ${path.relative(root, outJson)}`
);
