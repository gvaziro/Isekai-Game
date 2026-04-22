/**
 * Координаты вырезов на листе `public/assets/nature/Rocks.png`
 * (формат строк в `Rocks.txt`: name,left,top,width,height).
 */

export const NATURE_ROCKS_TEXTURE_KEY = "nature_rocks";

export type NatureRockVariantDef = {
  crop: { x: number; y: number; w: number; h: number };
  /**
   * Сдвиг точки «ног» от координаты пропа в чанке (px мира).
   * После `setCrop` непрозрачная масса в кадре часто не совпадает с центром
   * прямоугольника выреза — подгоняем спрайт и коллайдер вместе.
   */
  placementOffset: { x: number; y: number };
};

/** Rock_Gray_Big — крупный серый камень (основной валун). */
export const NATURE_ROCK_GRAY_BIG: NatureRockVariantDef = {
  crop: { x: 98, y: 19, w: 28, h: 43 },
  placementOffset: { x: -7, y: 9 },
};

/** Rock_Gray_Medium — средний серый. */
export const NATURE_ROCK_GRAY_MEDIUM: NatureRockVariantDef = {
  crop: { x: 131, y: 19, w: 26, h: 27 },
  placementOffset: { x: -5, y: 7 },
};
