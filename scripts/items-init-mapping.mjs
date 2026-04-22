/**
 * Одноразовая инициализация `src/game/data/items.mapping.json`.
 *
 * - Берёт все PNG из public/assets/items/ (frameKey = basename без .png).
 * - Подтягивает уже проставленные вручную записи из items.curated.ts (через regexp,
 *   чтобы не тащить TS-рантайм).
 * - Для не размеченных иконок выставляет slot="unknown" и name="" (пустое имя -> в UI падает placeholder).
 *
 * Повторный запуск безопасен: существующие записи в mapping.json НЕ перезаписываются,
 * добавляются только недостающие frameKey.
 */

import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const ITEMS_DIR = path.join(ROOT, "public", "assets", "items");
const CURATED_TS = path.join(ROOT, "src", "game", "data", "items.curated.ts");
const MAPPING_JSON = path.join(ROOT, "src", "game", "data", "items.mapping.json");

function naturalCompare(a, b) {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
}

async function readCuratedFromTs() {
  const src = await fs.readFile(CURATED_TS, "utf8").catch(() => "");
  if (!src) return [];
  const out = [];
  const re =
    /\{\s*id:\s*"([^"]+)"\s*,\s*name:\s*"([^"]+)"\s*,\s*slot:\s*"([^"]+)"\s*,\s*atlasFrame:\s*"([^"]+)"\s*\}/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    out.push({ id: m[1], name: m[2], slot: m[3], frameKey: m[4] });
  }
  return out;
}

async function main() {
  const dirents = await fs.readdir(ITEMS_DIR).catch(() => []);
  const frameKeys = dirents
    .filter((n) => n.toLowerCase().endsWith(".png"))
    .map((n) => n.replace(/\.png$/i, ""))
    .sort(naturalCompare);

  const curated = await readCuratedFromTs();
  const curatedByFrame = new Map(curated.map((c) => [c.frameKey, c]));

  /** @type {Array<{frameKey:string,id:string,name:string,slot:string,tags?:string[],notes?:string}>} */
  let existing = [];
  try {
    const raw = await fs.readFile(MAPPING_JSON, "utf8");
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed?.items)) existing = parsed.items;
  } catch {
    existing = [];
  }
  const existingByFrame = new Map(existing.map((e) => [e.frameKey, e]));

  const merged = [];
  for (const frameKey of frameKeys) {
    const prev = existingByFrame.get(frameKey);
    if (prev) {
      merged.push(prev);
      continue;
    }
    const cur = curatedByFrame.get(frameKey);
    if (cur) {
      merged.push({
        frameKey,
        id: cur.id,
        name: cur.name,
        slot: cur.slot,
      });
      continue;
    }
    merged.push({
      frameKey,
      id: frameKey,
      name: "",
      slot: "unknown",
    });
  }

  const out = {
    $schema: "./items.mapping.schema.json",
    updatedAt: new Date().toISOString(),
    items: merged,
  };
  await fs.writeFile(MAPPING_JSON, JSON.stringify(out, null, 2) + "\n", "utf8");

  const classified = merged.filter((i) => i.slot !== "unknown").length;
  console.log(
    `[items-init-mapping] OK: ${merged.length} записей, из них ${classified} размечены, ${merged.length - classified} unknown.`
  );
  console.log(`  → ${path.relative(ROOT, MAPPING_JSON)}`);
}

await main();
