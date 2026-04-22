/**
 * Авто-нарезка композитных листов Pixel Crawler (деревья и т.п.) на отдельные
 * объекты. Алгоритм:
 *   1) альфа-bbox листа → «стволами» считаем столбцы с непрозрачными пикселями
 *      в нижней полоске bottomStripPx высотой (читай: корни/тень/ствол).
 *   2) идут контиги стволов; между соседними стволами ищем столбец с
 *      минимальной суммой альфы по всему листу — это линия реза (гарантирует,
 *      что крона одного дерева не «цепляется» за следующее).
 *   3) каждую вертикальную полоску обрезаем до альфа-bbox (пиксель-арт дружит
 *      с tight-bbox: pivot-якорь по низу даёт корректное размещение в
 *      редакторе).
 *
 * Конфиг: scripts/pc-env-autoslice.json (`targets` + опционально `excludeSourceRels`
 * — скрыть исходные листы из pc-env без генерации авто-нарезки).
 * Выход:
 *   - PNG: public/assets/world/pc-env-autoslices/<slug>/<slug>__NN.png
 *   - public/assets/world/pixel-crawler-autoslices.load.json
 *   - public/assets/world/pixel-crawler-autoslices.excluded.json
 *     (список url исходников, которые надо скрыть из pc-env load — читается
 *     gen-pixel-crawler-environment-load.mjs).
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
const configFile = path.join(__dirname, "pc-env-autoslice.json");
const outRoot = path.join(root, "public", "assets", "world", "pc-env-autoslices");
const outLoad = path.join(
  root,
  "public",
  "assets",
  "world",
  "pixel-crawler-autoslices.load.json"
);
const outExcluded = path.join(
  root,
  "public",
  "assets",
  "world",
  "pixel-crawler-autoslices.excluded.json"
);

const PACK_DIR = "Pixel Crawler - Free Pack";

function mkdirp(p) {
  fs.mkdirSync(p, { recursive: true });
}

function rmrfDir(dir) {
  if (!fs.existsSync(dir)) return;
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const st = fs.statSync(full);
    if (st.isDirectory()) rmrfDir(full);
    else fs.unlinkSync(full);
  }
  fs.rmdirSync(dir);
}

function slug(s) {
  return String(s)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function encodePublicUrl(...segments) {
  return "/" + segments
    .map((s) => String(s).split("/"))
    .flat()
    .filter(Boolean)
    .map((p) => encodeURIComponent(p))
    .join("/");
}

/**
 * Разделить лист на ряды «деревьев». Каждый ряд — диапазон y0..y1 включительно.
 *
 * Пиксель-арт деревья в sheet-e стоят на «земле»: у каждого ряда внизу есть
 * полоска, где rowSum резко падает (остаётся только ствол/тень). Используем
 * это: локальный минимум rowSum, глубина которого < maxRowSum * lowFrac —
 * маркирует низ одного ряда деревьев. Между такими минимумами — band.
 */
function findRowBands(data, W, H, alphaThreshold, lowFrac = 0.12) {
  const rowSum = new Int32Array(H);
  let maxSum = 0;
  for (let y = 0; y < H; y++) {
    let c = 0;
    for (let x = 0; x < W; x++) {
      if (data[(y * W + x) * 4 + 3] > alphaThreshold) c++;
    }
    rowSum[y] = c;
    if (c > maxSum) maxSum = c;
  }
  if (maxSum === 0) return [];
  const thr = Math.max(1, Math.floor(maxSum * lowFrac));

  const lowRuns = [];
  let s = -1;
  for (let y = 0; y <= H; y++) {
    const isLow = y < H && rowSum[y] <= thr;
    if (isLow) {
      if (s < 0) s = y;
    } else if (s >= 0) {
      lowRuns.push([s, y - 1]);
      s = -1;
    }
  }

  const bottoms = [];
  for (const [a, b] of lowRuns) {
    if (a === 0) continue;
    const mid = Math.floor((a + b) / 2);
    bottoms.push(mid);
  }
  if (bottoms.length === 0 || bottoms[bottoms.length - 1] !== H - 1) {
    bottoms.push(H - 1);
  }

  const bands = [];
  let prev = -1;
  for (const bot of bottoms) {
    const y0 = prev + 1;
    const y1 = bot;
    if (y1 >= y0) bands.push([y0, y1]);
    prev = bot;
  }
  if (bands.length === 0) bands.push([0, H - 1]);
  return bands;
}

/**
 * Хэш пикселей полосы по альфа-mask для дедупа одинаковых рядов.
 */
function stripAlphaHash(data, W, H, strip, alphaThreshold) {
  let h = 2166136261 >>> 0;
  for (let y = strip.y; y < strip.y + strip.h; y++) {
    for (let x = strip.x; x < strip.x + strip.w; x++) {
      const a = data[(y * W + x) * 4 + 3] > alphaThreshold ? 1 : 0;
      h ^= a;
      h = Math.imul(h, 16777619);
    }
  }
  return `${strip.w}x${strip.h}:${(h >>> 0).toString(16)}`;
}

/**
 * Найти полосы (strips) — каждый strip = {x, y, w, h} в координатах листа,
 * уже обрезанный до альфа-bbox.
 *
 * @param {Buffer} data  RGBA
 * @param {number} W
 * @param {number} H
 * @param {{bottomStripPx:number, alphaThreshold:number, minTrunkWidth:number, minCellWidth:number, rowEmptyRun:number, onlyFirstRow?:boolean}} opts
 */
function sliceByTrunks(data, W, H, opts) {
  const alphaThreshold = opts.alphaThreshold | 0;
  const bottomStripPxMin = Math.max(1, opts.bottomStripPx | 0);
  const bottomFrac = Number(opts.bottomFrac ?? 0.06);
  const minTrunkWidth = Math.max(1, opts.minTrunkWidth | 0);
  const minCellWidth = Math.max(1, opts.minCellWidth | 0);
  const rowLowFrac = Number(opts.rowLowFrac ?? 0.15);
  const minBandFrac = Number(opts.minBandFrac ?? 0.6);
  const minCellHeightFrac = Number(opts.minCellHeightFrac ?? 0.35);
  const minCellHeightPx = Math.max(1, (opts.minCellHeightPx ?? 10) | 0);
  const dedupeRows = opts.dedupeRows !== false;

  const bands = findRowBands(data, W, H, alphaThreshold, rowLowFrac);
  if (bands.length === 0) return [];
  const maxBandH = bands.reduce((m, [a, b]) => Math.max(m, b - a + 1), 0);
  let useBands = bands.filter(([a, b]) => {
    const bh = b - a + 1;
    return bh >= maxBandH * minBandFrac;
  });
  if (opts.onlyFirstRow && useBands.length > 0) useBands = [useBands[0]];

  const strips = [];
  const seenHashes = new Set();
  for (const [y0, y1] of useBands) {
    const bandH = y1 - y0 + 1;
    const bottomStripPx = Math.max(
      bottomStripPxMin,
      Math.ceil(bandH * bottomFrac)
    );
    const minCellHeight = Math.max(
      minCellHeightPx,
      Math.ceil(bandH * minCellHeightFrac)
    );
    const rowStrips = sliceBandByTrunks(data, W, H, y0, y1, {
      alphaThreshold,
      bottomStripPx,
      minTrunkWidth,
      minCellWidth,
      minCellHeight,
    });
    for (const s of rowStrips) {
      if (dedupeRows) {
        const hash = stripAlphaHash(data, W, H, s, alphaThreshold);
        if (seenHashes.has(hash)) continue;
        seenHashes.add(hash);
      }
      strips.push(s);
    }
  }
  return strips;
}

function sliceBandByTrunks(data, W, H, y0, y1, opts) {
  const {
    alphaThreshold,
    bottomStripPx,
    minTrunkWidth,
    minCellWidth,
    minCellHeight,
  } = opts;

  let bboxMinX = W;
  let bboxMaxX = -1;
  let bboxMinY = y1 + 1;
  let bboxMaxY = y0 - 1;
  for (let y = y0; y <= y1; y++) {
    for (let x = 0; x < W; x++) {
      if (data[(y * W + x) * 4 + 3] > alphaThreshold) {
        if (x < bboxMinX) bboxMinX = x;
        if (x > bboxMaxX) bboxMaxX = x;
        if (y < bboxMinY) bboxMinY = y;
        if (y > bboxMaxY) bboxMaxY = y;
      }
    }
  }
  if (bboxMaxY < bboxMinY) return [];

  const stripStartY = Math.max(bboxMinY, bboxMaxY - bottomStripPx + 1);

  const colMask = new Uint8Array(W);
  for (let x = 0; x < W; x++) {
    for (let y = stripStartY; y <= bboxMaxY; y++) {
      if (data[(y * W + x) * 4 + 3] > alphaThreshold) {
        colMask[x] = 1;
        break;
      }
    }
  }

  const trunks = [];
  let s = -1;
  for (let x = 0; x <= W; x++) {
    const on = x < W && colMask[x] === 1;
    if (on) {
      if (s < 0) s = x;
    } else if (s >= 0) {
      if (x - s >= minTrunkWidth) trunks.push([s, x - 1]);
      s = -1;
    }
  }
  if (trunks.length === 0) return [];

  const alphaCol = new Int32Array(W);
  for (let x = 0; x < W; x++) {
    let c = 0;
    for (let y = y0; y <= y1; y++) {
      if (data[(y * W + x) * 4 + 3] > alphaThreshold) c++;
    }
    alphaCol[x] = c;
  }

  const bounds = [0];
  for (let i = 0; i + 1 < trunks.length; i++) {
    const rightA = trunks[i][1];
    const leftB = trunks[i + 1][0];
    const from = rightA + 1;
    const to = leftB - 1;
    let bestX = Math.max(from, Math.floor((rightA + leftB + 1) / 2));
    let bestVal = alphaCol[bestX] ?? Number.POSITIVE_INFINITY;
    for (let x = from; x <= to; x++) {
      if (alphaCol[x] < bestVal) {
        bestVal = alphaCol[x];
        bestX = x;
      }
    }
    bounds.push(bestX);
  }
  bounds.push(W);

  const strips = [];
  for (let i = 0; i + 1 < bounds.length; i++) {
    const x0 = bounds[i];
    const x1 = bounds[i + 1];
    let minX = x1;
    let maxX = x0 - 1;
    let minY = y1 + 1;
    let maxY = y0 - 1;
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x < x1; x++) {
        if (data[(y * W + x) * 4 + 3] > alphaThreshold) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    if (maxX < minX || maxY < minY) continue;
    const w = maxX - minX + 1;
    const h = maxY - minY + 1;
    if (w < minCellWidth) continue;
    if (h < minCellHeight) continue;
    strips.push({ x: minX, y: minY, w, h });
  }
  return strips;
}

async function main() {
  let cfg;
  try {
    cfg = JSON.parse(fs.readFileSync(configFile, "utf8"));
  } catch (e) {
    console.warn("[gen-pc-autoslices] нет/битый pc-env-autoslice.json:", e);
    cfg = { targets: [], defaults: {} };
  }
  const defaults = {
    bottomStripPx: 3,
    minTrunkWidth: 2,
    minCellWidth: 6,
    alphaThreshold: 0,
    excludeSource: true,
    ...(cfg.defaults ?? {}),
  };
  const targets = Array.isArray(cfg.targets) ? cfg.targets : [];
  const excludeSourceRelsAlways = Array.isArray(cfg.excludeSourceRels)
    ? cfg.excludeSourceRels
    : [];

  rmrfDir(outRoot);
  mkdirp(outRoot);

  /** @type {Array<{key:string,type:string,url:string}>} */
  const load = [];
  /** @type {Set<string>} */
  const excludedUrlSet = new Set();
  const usedKeys = new Set();

  function pushExcludedUrlFromSourceRel(sourceRel) {
    const url =
      "/" +
      ["assets", PACK_DIR, "Environment", ...String(sourceRel).split("/")]
        .map((p) => encodeURIComponent(p))
        .join("/");
    excludedUrlSet.add(url);
  }

  for (const rawT of targets) {
    const t = { ...defaults, ...rawT };
    const sourceRel = t.sourceRel;
    if (!sourceRel) continue;
    const abs = path.join(envRoot, ...String(sourceRel).split("/"));
    if (!fs.existsSync(abs)) {
      console.warn("[gen-pc-autoslices] нет файла:", abs);
      continue;
    }
    const base = slug(sourceRel.replace(/\.png$/i, ""));
    const buf = await sharp(abs).raw().ensureAlpha().toBuffer({ resolveWithObject: true });
    const { data, info } = buf;
    const W = info.width;
    const H = info.height;
    const strips = sliceByTrunks(data, W, H, t);
    if (strips.length === 0) {
      console.warn(`[gen-pc-autoslices] ${sourceRel}: стволы не найдены, пропуск`);
      continue;
    }

    const dirOut = path.join(outRoot, base);
    mkdirp(dirOut);
    let idx = 1;
    for (const s of strips) {
      const num = String(idx++).padStart(2, "0");
      let key = `pc_auto_${base}_${num}`;
      let n = 2;
      while (usedKeys.has(key)) key = `pc_auto_${base}_${num}__${n++}`;
      usedKeys.add(key);
      const fname = `${base}__${num}.png`;
      const outPng = path.join(dirOut, fname);
      await sharp(abs)
        .extract({ left: s.x, top: s.y, width: s.w, height: s.h })
        .png()
        .toFile(outPng);
      load.push({
        key,
        type: "image",
        url: encodePublicUrl(
          "assets",
          "world",
          "pc-env-autoslices",
          base,
          fname
        ),
      });
    }
    console.log(
      `[gen-pc-autoslices] ${sourceRel}: ${strips.length} шт. → pc-env-autoslices/${base}/`
    );

    if (t.excludeSource) {
      pushExcludedUrlFromSourceRel(sourceRel);
    }
  }

  for (const rel of excludeSourceRelsAlways) {
    pushExcludedUrlFromSourceRel(rel);
  }

  const excludedUrls = [...excludedUrlSet].sort((a, b) =>
    a.localeCompare(b, "en")
  );

  load.sort((a, b) => a.key.localeCompare(b.key, "en"));
  mkdirp(path.dirname(outLoad));
  fs.writeFileSync(outLoad, JSON.stringify({ load }, null, 2) + "\n", "utf8");
  fs.writeFileSync(
    outExcluded,
    JSON.stringify({ urls: excludedUrls }, null, 2) + "\n",
    "utf8"
  );
  console.log(
    `[gen-pc-autoslices] ${load.length} PNG, исключено из env: ${excludedUrls.length}`
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
