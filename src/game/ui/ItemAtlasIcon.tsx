"use client";

import {
  ITEM_ATLAS,
  ITEM_ATLAS_HEIGHT,
  ITEM_ATLAS_WIDTH,
} from "@/src/game/data/items.generated";

export type ItemAtlasFramesFile = {
  frames: Record<
    string,
    { frame: { x: number; y: number; w: number; h: number } }
  >;
};

/**
 * Иконка кадра из items_atlas в React-оверлее.
 * Важно задавать `backgroundSize` пропорционально `scale`: иначе при увеличении
 * ячейки в окне видны лишние пиксели атласа (соседние предметы).
 */
export function ItemAtlasIcon({
  frameKey,
  atlas,
  cell,
}: {
  frameKey: string | null;
  atlas: ItemAtlasFramesFile | null;
  cell: number;
}) {
  if (!frameKey || !atlas?.frames[frameKey]) {
    return (
      <div
        className="rounded-[1px] bg-[#2a241c]/12 ring-1 ring-[#1b6b52]/25"
        style={{ width: cell, height: cell }}
      />
    );
  }
  const fr = atlas.frames[frameKey].frame;
  const scale = Math.min(cell / fr.w, cell / fr.h, 4);
  const w = Math.round(fr.w * scale);
  const h = Math.round(fr.h * scale);
  return (
    <div
      className="relative overflow-hidden rounded-[1px] bg-[#2a241c]/10 ring-1 ring-[#1b6b52]/30"
      style={{ width: cell, height: cell }}
    >
      <div
        className="absolute left-1/2 top-1/2 max-h-full max-w-full"
        style={{
          width: w,
          height: h,
          transform: "translate(-50%, -50%)",
          backgroundImage: `url(${ITEM_ATLAS.pngUrl})`,
          backgroundSize: `${ITEM_ATLAS_WIDTH * scale}px ${ITEM_ATLAS_HEIGHT * scale}px`,
          backgroundPosition: `-${fr.x * scale}px -${fr.y * scale}px`,
          backgroundRepeat: "no-repeat",
          imageRendering: "pixelated",
        }}
      />
    </div>
  );
}
