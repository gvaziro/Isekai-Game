/**
 * Статическое PNG-превью карты (sharp): ground + декор травы + пропсы, маркеры героя/NPC (town).
 * Локация `forest` в рантайме и здесь берётся из `getLocation` — деревья леса
 * процедурные (`forestTreeGen` + merge в `forest.ts`), статический декор в
 * `src/game/locations/data/forest.json`.
 * Запуск: npm run preview:static
 * Другая локация: npm run preview:static -- --location=forest
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import sharp from "sharp";
import {
  getGrassDecor,
  getLocation,
  isLocationId,
  type LocationId,
} from "../src/game/locations";

type ManifestLoad = {
  key: string;
  type: string;
  url: string;
  frameWidth?: number;
  frameHeight?: number;
};

type Manifest = {
  load: ManifestLoad[];
};

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

function toPublicFile(url: string): string {
  if (!url.startsWith("/")) throw new Error(`Unexpected asset url: ${url}`);
  return path.join(root, "public", url.slice(1));
}

function hexToRgb(hex: number): { r: number; g: number; b: number } {
  return {
    r: (hex >> 16) & 0xff,
    g: (hex >> 8) & 0xff,
    b: hex & 0xff,
  };
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const locParam = argv.find((a) => a.startsWith("--location="));
  const rawLoc = locParam?.split("=", 2)[1]?.trim().toLowerCase() ?? "town";
  const locationId: LocationId = isLocationId(rawLoc) ? rawLoc : "town";

  const loc = getLocation(locationId);

  const manifestPath = path.join(root, "public/assets/world/manifest.json");
  const manifest = JSON.parse(
    fs.readFileSync(manifestPath, "utf8")
  ) as Manifest;

  const byKey = new Map(manifest.load.map((e) => [e.key, e]));

  const rgb = hexToRgb(loc.backgroundFill);

  const groundEntry = byKey.get(loc.groundTextureKey);
  if (!groundEntry || groundEntry.type !== "image") {
    throw new Error(
      `manifest: нет ${loc.groundTextureKey} — выполните: npm run gen-assets`
    );
  }

  const groundBuf = await sharp(toPublicFile(groundEntry.url))
    .ensureAlpha()
    .png()
    .toBuffer();

  const composites: sharp.OverlayOptions[] = [
    { input: groundBuf, left: 0, top: 0 },
  ];

  const decorEntry = byKey.get("grass_decor");
  if (!decorEntry || decorEntry.type !== "spritesheet") {
    throw new Error("manifest: нет grass_decor spritesheet");
  }
  const decorPath = toPublicFile(decorEntry.url);
  const decoW = decorEntry.frameWidth ?? 32;
  const decoH = decorEntry.frameHeight ?? 32;

  const grassDecor = getGrassDecor(locationId);
  for (const d of grassDecor) {
    const crop = await sharp(decorPath)
      .extract({
        left: d.variant * decoW,
        top: 0,
        width: decoW,
        height: decoH,
      })
      .ensureAlpha()
      .png()
      .toBuffer();
    const dm = await sharp(crop).metadata();
    const iw = dm.width ?? decoW;
    const ih = dm.height ?? decoH;
    composites.push({
      input: crop,
      left: Math.round(d.x - iw / 2),
      top: Math.round(d.y - ih),
    });
  }

  async function pushImageProp(textureKey: string, destLeft: number, destTopFeet: number): Promise<void> {
    const entry = byKey.get(textureKey);
    if (!entry || entry.type !== "image") {
      throw new Error(`Нет image entry для ${textureKey}`);
    }
    const png = await sharp(toPublicFile(entry.url))
      .ensureAlpha()
      .png()
      .toBuffer();
    const meta = await sharp(png).metadata();
    const iw = meta.width ?? 0;
    const ih = meta.height ?? 0;
    const left = Math.round(destLeft - iw / 2);
    const top = Math.round(destTopFeet - ih);
    composites.push({ input: png, left, top });
  }

  async function pushSpritesheetFrame0(
    textureKey: string,
    destLeft: number,
    destTopFeet: number
  ): Promise<void> {
    const entry = byKey.get(textureKey);
    if (!entry || entry.type !== "spritesheet") {
      throw new Error(`Нет spritesheet entry для ${textureKey}`);
    }
    const fw = entry.frameWidth ?? 64;
    const fh = entry.frameHeight ?? 64;
    const frame = await sharp(toPublicFile(entry.url))
      .extract({ left: 0, top: 0, width: fw, height: fh })
      .ensureAlpha()
      .png()
      .toBuffer();
    const meta = await sharp(frame).metadata();
    const iw = meta.width ?? fw;
    const ih = meta.height ?? fh;
    const left = Math.round(destLeft - iw / 2);
    const top = Math.round(destTopFeet - ih);
    composites.push({ input: frame, left, top });
  }

  const sortedImages = [...loc.imageProps].sort((a, b) => a.y - b.y);
  for (const p of sortedImages) {
    await pushImageProp(p.texture, p.x, p.y);
  }

  for (const s of loc.animStations) {
    await pushSpritesheetFrame0(s.texture, s.x, s.y);
  }

  const heroR = 10;
  const heroSvg = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${heroR * 2}" height="${heroR * 2}">
      <circle cx="${heroR}" cy="${heroR}" r="${heroR - 1}" fill="#ef4444" stroke="#7f1d1d" stroke-width="2"/>
    </svg>`
  );
  const spawn = loc.spawns.default;
  composites.push({
    input: heroSvg,
    left: Math.round(spawn.x - heroR),
    top: Math.round(spawn.y - heroR),
  });

  const npcRoot = path.join(root, "npcs");
  const npcIds =
    locationId === "town" && fs.existsSync(npcRoot)
      ? fs
          .readdirSync(npcRoot, { withFileTypes: true })
          .filter((d) => d.isDirectory())
          .map((d) => d.name)
          .sort()
      : [];

  const npcR = 8;
  for (const id of npcIds) {
    const routePath = path.join(npcRoot, id, "route.json");
    if (!fs.existsSync(routePath)) continue;
    const route = JSON.parse(fs.readFileSync(routePath, "utf8")) as {
      spawn?: { x: number; y: number };
    };
    const sx = route.spawn?.x ?? 0;
    const sy = route.spawn?.y ?? 0;

    const dotSvg = Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${npcR * 2}" height="${npcR * 2}">
        <circle cx="${npcR}" cy="${npcR}" r="${npcR - 1}" fill="#facc15" stroke="#854d0e" stroke-width="2"/>
      </svg>`
    );
    composites.push({
      input: dotSvg,
      left: Math.round(sx - npcR),
      top: Math.round(sy - npcR),
    });

    const labelSvg = Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="22">
        <text x="0" y="16" font-family="monospace" font-size="12" fill="#fef08a" stroke="#422006" stroke-width="3" paint-order="stroke">${id}</text>
      </svg>`
    );
    composites.push({
      input: labelSvg,
      left: Math.round(sx + npcR + 4),
      top: Math.round(sy - 20),
    });
  }

  const outDir = path.join(root, "preview");
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, `map_${locationId}.png`);

  await sharp({
    create: {
      width: loc.world.width,
      height: loc.world.height,
      channels: 4,
      background: { ...rgb, alpha: 1 },
    },
  })
    .composite(composites)
    .png()
    .toFile(outPath);

  const smallPath = path.join(outDir, `map_${locationId}_small.png`);
  await sharp(outPath)
    .resize({
      width: Math.floor(loc.world.width * 0.5),
      height: Math.floor(loc.world.height * 0.5),
    })
    .png()
    .toFile(smallPath);

  console.log(`Wrote ${outPath}, ${smallPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
