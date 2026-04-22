/**
 * Соответствие ключей манифеста материнским листам и прямоугольнику `sharp.extract`:
 * - Pixel Crawler — [pc-pack-decor-extracts.json](pc-pack-decor-extracts.json)
 * - Камни из nature — [nature-decor-map.json](nature-decor-map.json) → `/assets/nature/Rocks.png`
 */

import natureDecor from "./nature-decor-map.json";
import pcPackDecor from "./pc-pack-decor-extracts.json";

export type AssetSourceSlice = {
  manifestKey: string;
  parentUrl: string;
  /** left, top, width, height в пикселях исходного PNG */
  slice: { left: number; top: number; width: number; height: number };
  /** Привязка границ к сетке (0 — без привязки) */
  snapGrid?: number;
  /** Подсказка для буфера: путь к исходнику в gen-assets */
  cropSrcJoinHint: string;
};

type PcDecorEntry = (typeof pcPackDecor.extractions)[number];
type NatureOutput = (typeof natureDecor.outputs)[number];

function cropSrcJoinHintFromPcRel(srcRel: string): string {
  const parts = srcRel.split("/");
  return `path.join(PC, ${parts.map((p) => JSON.stringify(p)).join(", ")})`;
}

function parentUrlFromPcSrcRel(srcRel: string): string {
  const base = pcPackDecor.packRootUrl.replace(/\/$/, "");
  const tail = srcRel
    .split("/")
    .map((seg) => encodeURIComponent(seg))
    .join("/");
  return `${base}/${tail}`;
}

function parentUrlFromNatureSheet(sheet: string): string {
  const base = natureDecor.natureRootUrl.replace(/\/$/, "");
  return `${base}/${encodeURIComponent(sheet)}.png`;
}

function cropSrcJoinHintNaturePng(sheet: string): string {
  return `path.join(root, "public", "assets", "nature", ${JSON.stringify(
    `${sheet}.png`
  )})`;
}

const SLICES_FROM_PC: AssetSourceSlice[] = pcPackDecor.extractions
  .filter(
    (e: PcDecorEntry): e is PcDecorEntry & { manifestKey: string } =>
      typeof (e as { manifestKey?: string }).manifestKey === "string" &&
      (e as { manifestKey: string }).manifestKey.length > 0
  )
  .map((e) => ({
    manifestKey: e.manifestKey,
    parentUrl: parentUrlFromPcSrcRel(e.srcRel),
    slice: e.slice,
    snapGrid:
      typeof e.snapGrid === "number" && Number.isFinite(e.snapGrid)
        ? e.snapGrid
        : undefined,
    cropSrcJoinHint: cropSrcJoinHintFromPcRel(e.srcRel),
  }));

function isNatureRockSlice(
  o: NatureOutput
): o is NatureOutput & {
  manifestKey: string;
  slice: { left: number; top: number; width: number; height: number };
} {
  return (
    typeof o.manifestKey === "string" &&
    o.manifestKey.length > 0 &&
    typeof o.slice === "object" &&
    o.slice !== null &&
    typeof (o.slice as { left?: unknown }).left === "number" &&
    typeof (o.slice as { top?: unknown }).top === "number" &&
    typeof (o.slice as { width?: unknown }).width === "number" &&
    typeof (o.slice as { height?: unknown }).height === "number"
  );
}

const SLICES_FROM_NATURE: AssetSourceSlice[] = natureDecor.outputs
  .filter(isNatureRockSlice)
  .map((o) => ({
    manifestKey: o.manifestKey,
    parentUrl: parentUrlFromNatureSheet(String(o.sheet)),
    slice: o.slice,
    snapGrid:
      typeof o.snapGrid === "number" && Number.isFinite(o.snapGrid)
        ? o.snapGrid
        : undefined,
    cropSrcJoinHint: cropSrcJoinHintNaturePng(String(o.sheet)),
  }));

export const ASSET_SOURCE_SLICES: readonly AssetSourceSlice[] = [
  ...SLICES_FROM_PC,
  ...SLICES_FROM_NATURE,
];

const SLICE_BY_KEY: Record<string, AssetSourceSlice> = Object.fromEntries(
  ASSET_SOURCE_SLICES.map((s) => [s.manifestKey, s])
);

export function getAssetSourceSlice(
  manifestKey: string
): AssetSourceSlice | undefined {
  return SLICE_BY_KEY[manifestKey];
}

export function isSliceEditableKey(manifestKey: string): boolean {
  return manifestKey in SLICE_BY_KEY;
}
