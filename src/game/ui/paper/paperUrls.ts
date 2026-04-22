/** Корневая папка кита в `public/assets`. */
const PAPER_KIT_DIR = "Humble Gift - Paper UI System v1.1";

/**
 * URL к PNG внутри кита. Сегменты кодируются для пробелов и `&` в путях.
 */
export function paperAsset(relativePath: string): string {
  const trimmed = relativePath.replace(/^\/+/, "");
  const segments = [PAPER_KIT_DIR, ...trimmed.split("/").filter(Boolean)];
  return `/assets/${segments.map((s) => encodeURIComponent(s)).join("/")}`;
}

/** Зафиксированные спрайты для игровых оверлеев. */
export const PAPER_UI = {
  /** Квадратный кусок для border-image (9-slice), без растягивания всего окна. */
  plainPaperSlice: paperAsset("Sprites/Paper UI Pack/Plain/1 Paper/1.png"),
  modalPaper: paperAsset(
    "Sprites/Paper UI Pack/Folding & Cutout/8 Shop/1.png"
  ),
  titleRibbon: paperAsset(
    "Sprites/Paper UI Pack/Folding & Cutout/2 Headers/1.png"
  ),
  sectionBanner: paperAsset(
    "Sprites/Paper UI Pack/Folding & Cutout/3 Item Holder/1.png"
  ),
  /** Универсальная рамка слота экипировки из кита (квадратная иконка). */
  equipmentSlotFrame: paperAsset("Sprites/Content/8 Equipment/5.png"),
  inventorySlot: paperAsset("Sprites/Content/5 Holders/5.png"),
} as const;
