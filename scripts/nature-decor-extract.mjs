/**
 * Вырезы из public/assets/nature по CSV (*.txt) — реестр src/game/data/nature-decor-map.json.
 */
import fs from "fs";
import path from "path";
import sharp from "sharp";

/**
 * @param {string} txtAbs
 * @returns {Map<string, { left: number, top: number, width: number, height: number }>}
 */
export function parseNatureSpriteTxt(txtAbs) {
  const raw = fs.readFileSync(txtAbs, "utf8");
  const map = new Map();
  for (const line of raw.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const parts = t.split(",").map((s) => s.trim());
    if (parts.length < 5) continue;
    const name = parts[0];
    const x = Number(parts[1]);
    const y = Number(parts[2]);
    const w = Number(parts[3]);
    const h = Number(parts[4]);
    if (!name || !Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(w) || !Number.isFinite(h)) {
      continue;
    }
    if (w < 1 || h < 1 || x < 0 || y < 0) {
      continue;
    }
    map.set(name, { left: x, top: y, width: w, height: h });
  }
  if (map.size === 0) {
    throw new Error(`Пустая или битая спецификация: ${txtAbs}`);
  }
  return map;
}

/**
 * @param {import("sharp").Metadata} meta
 * @param {{ left: number, top: number, width: number, height: number }} r
 */
function assertRectInsidePng(meta, r, label) {
  const iw = meta.width ?? 0;
  const ih = meta.height ?? 0;
  if (iw < 1 || ih < 1) {
    throw new Error(`Нет размеров PNG: ${label}`);
  }
  if (
    r.left + r.width > iw ||
    r.top + r.height > ih ||
    r.left < 0 ||
    r.top < 0
  ) {
    throw new Error(
      `Вырез выходит за PNG (${iw}×${ih}): ${label} → left=${r.left} top=${r.top} ${r.width}×${r.height}`
    );
  }
}

/**
 * @param {object} opts
 * @param {string} opts.root - корень репозитория
 * @param {string} opts.outRoot - public/assets/world
 */
export async function buildNatureDecorFromMap({ root, outRoot }) {
  const manifestPath = path.join(
    root,
    "src",
    "game",
    "data",
    "nature-decor-map.json"
  );
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`Нет ${manifestPath}`);
  }
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const outputs = manifest.outputs;
  if (!Array.isArray(outputs) || outputs.length < 1) {
    throw new Error("nature-decor-map.json: ожидается непустой outputs");
  }

  const natureRoot = path.join(root, "public", "assets", "nature");
  if (!fs.existsSync(natureRoot)) {
    throw new Error(`Нет папки nature: ${natureRoot}`);
  }

  /** @type {Map<string, Map<string, { left: number, top: number, width: number, height: number }>>} */
  const sheetMaps = new Map();

  function getSheetMap(sheetBase) {
    const key = String(sheetBase);
    let m = sheetMaps.get(key);
    if (m) return m;
    const txtAbs = path.join(natureRoot, `${key}.txt`);
    if (!fs.existsSync(txtAbs)) {
      throw new Error(`Нет спецификации листа: ${txtAbs}`);
    }
    m = parseNatureSpriteTxt(txtAbs);
    sheetMaps.set(key, m);
    return m;
  }

  function mkdirp(p) {
    fs.mkdirSync(p, { recursive: true });
  }

  for (const row of outputs) {
    const sheet = row.sheet;
    const sprite = row.sprite;
    const textureKey = row.textureKey;
    const outRel = row.outRel;
    if (!sheet || !sprite || !textureKey || !outRel) {
      throw new Error("nature-decor-map: у записи нужны sheet, sprite, textureKey, outRel");
    }

    const pngAbs = path.join(natureRoot, `${sheet}.png`);
    if (!fs.existsSync(pngAbs)) {
      throw new Error(`Нет PNG листа: ${pngAbs}`);
    }

    const map = getSheetMap(sheet);
    const parsed = map.get(sprite);
    if (!parsed) {
      const sample = Array.from(map.keys()).slice(0, 12).join(", ");
      throw new Error(
        `Спрайт «${sprite}» не найден в ${sheet}.txt (например: ${sample || "—"})`
      );
    }

    if (row.slice) {
      const s = row.slice;
      if (
        parsed.left !== s.left ||
        parsed.top !== s.top ||
        parsed.width !== s.width ||
        parsed.height !== s.height
      ) {
        throw new Error(
          `nature-decor-map.slice для «${textureKey}» не совпадает с ${sheet}.txt (${JSON.stringify(s)} vs ${JSON.stringify(parsed)})`
        );
      }
    }

    const meta = await sharp(pngAbs).metadata();
    assertRectInsidePng(meta, parsed, `${textureKey} ← ${sheet}.png`);

    const outAbs = path.join(outRoot, ...String(outRel).split("/"));
    mkdirp(path.dirname(outAbs));
    await sharp(pngAbs)
      .extract({
        left: parsed.left,
        top: parsed.top,
        width: parsed.width,
        height: parsed.height,
      })
      .png()
      .toFile(outAbs);
  }

  console.log(
    `[nature-decor] ${outputs.length} вырезов → world/decor (листы из public/assets/nature)`
  );
}
