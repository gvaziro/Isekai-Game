/**
 * Читает бинарные .aseprite и пишет рядом *.aseprite.spec.json —
 * холст, именованные срезы (Slices), теги кадров, слои и рамки целей (без пикселей).
 * Это «читаемая спецификация» для PNG-нарезки и для ассистента в IDE.
 *
 * Запуск: npm run gen:aseprite-spec
 * Корень поиска: public/assets/Pixel Crawler - Free Pack (см. ASEPRITE_SPEC_ROOT ниже).
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const Aseprite = require("ase-parser");

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

/** Корень, где лежат исходники Pixel Crawler (в т.ч. .aseprite). */
const ASEPRITE_SPEC_ROOT = path.join(
  root,
  "public",
  "assets",
  "Pixel Crawler - Free Pack"
);

function walkAsepriteFiles(dir, baseRel = "") {
  /** @type {string[]} */
  const out = [];
  if (!fs.existsSync(dir)) {
    console.warn("[aseprite-spec] нет папки:", dir);
    return out;
  }
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const rel = baseRel ? `${baseRel}/${ent.name}` : ent.name;
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      out.push(...walkAsepriteFiles(full, rel));
    } else if (ent.isFile() && ent.name.toLowerCase().endsWith(".aseprite")) {
      out.push(rel);
    }
  }
  return out.sort((a, b) => a.localeCompare(b, "en"));
}

function layerNameAt(layers, layerIndex) {
  const L = layers[layerIndex];
  return L && typeof L.name === "string" ? L.name : `layer_${layerIndex}`;
}

function buildSpec(absFile, relPosix) {
  const buf = fs.readFileSync(absFile);
  const name = path.basename(absFile);
  const ase = new Aseprite(buf, name);
  ase.parse();

  const layers = ase.layers ?? [];
  const frames = (ase.frames ?? []).map((frame, frameIndex) => ({
    index: frameIndex,
    durationMs: frame.frameDuration,
    cels: (frame.cels ?? []).map((cel) => ({
      layerIndex: cel.layerIndex,
      layerName: layerNameAt(layers, cel.layerIndex),
      x: cel.xpos,
      y: cel.ypos,
      width: cel.w,
      height: cel.h,
      celType: cel.celType,
    })),
  }));

  const slices = (ase.slices ?? []).map((s) => ({
    name: s.name,
    flags: s.flags,
    keys: (s.keys ?? []).map((k) => ({
      frameNumber: k.frameNumber,
      /** Прямоугольник на холсте — как в Aseprite Slice */
      rect: { x: k.x, y: k.y, width: k.width, height: k.height },
      patch: k.patch ?? undefined,
      pivot: k.pivot ?? undefined,
    })),
  }));

  return {
    format: "aseprite-spec-v1",
    sourceAseprite: relPosix.split(path.sep).join("/"),
    canvas: { width: ase.width, height: ase.height },
    colorDepth: ase.colorDepth,
    numFrames: ase.numFrames,
    layers: layers.map((L, i) => ({
      index: i,
      name: L.name,
      visible: L.flags?.visible !== false,
    })),
    tags: ase.tags ?? [],
    slices,
    frames,
  };
}

function main() {
  const rels = walkAsepriteFiles(ASEPRITE_SPEC_ROOT);
  if (!rels.length) {
    console.log("[aseprite-spec] нет .aseprite в", ASEPRITE_SPEC_ROOT);
    return;
  }
  let ok = 0;
  let fail = 0;
  for (const rel of rels) {
    const abs = path.join(ASEPRITE_SPEC_ROOT, ...rel.split("/"));
    const outPath = `${abs}.spec.json`;
    const relPosix = rel.split(path.sep).join("/");
    try {
      const spec = buildSpec(abs, relPosix);
      fs.writeFileSync(outPath, JSON.stringify(spec, null, 2) + "\n", "utf8");
      ok++;
    } catch (e) {
      fail++;
      console.warn(`[aseprite-spec] ошибка ${relPosix}:`, e?.message ?? e);
    }
  }
  console.log(
    `[aseprite-spec] готово: ${ok} файлов → *.aseprite.spec.json` +
      (fail ? `, ошибок: ${fail}` : "")
  );
}

main();
