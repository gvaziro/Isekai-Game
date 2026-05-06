/**
 * Превью idle по `mobVisualId`: URL и размер одного кадра (как в `manifest.json` textures).
 * В админке показываем только первый кадр горизонтального листа (overflow + height 100%).
 * При добавлении моба в gen-assets / manifest — дополните карту.
 */

export type MobPortraitMeta = {
  url: string;
  frameWidth: number;
  frameHeight: number;
};

export const MOB_PORTRAIT_META_BY_VISUAL_ID: Record<string, MobPortraitMeta> = {
  orc_base: {
    url: "/assets/world/units/mob_orc_base_idle.png",
    frameWidth: 32,
    frameHeight: 32,
  },
  orc_rogue: {
    url: "/assets/world/units/mob_orc_rogue_idle.png",
    frameWidth: 32,
    frameHeight: 32,
  },
  orc_shaman: {
    url: "/assets/world/units/mob_orc_shaman_idle.png",
    frameWidth: 32,
    frameHeight: 32,
  },
  orc_warrior: {
    url: "/assets/world/units/mob_orc_warrior_idle.png",
    frameWidth: 32,
    frameHeight: 32,
  },
  skeleton_base: {
    url: "/assets/world/units/mob_skeleton_base_idle.png",
    frameWidth: 32,
    frameHeight: 32,
  },
  skeleton_mage: {
    url: "/assets/world/units/mob_skeleton_mage_idle.png",
    frameWidth: 32,
    frameHeight: 32,
  },
  skeleton_rogue: {
    url: "/assets/world/units/mob_skeleton_rogue_idle.png",
    frameWidth: 32,
    frameHeight: 32,
  },
  skeleton_warrior: {
    url: "/assets/world/units/mob_skeleton_warrior_idle.png",
    frameWidth: 32,
    frameHeight: 32,
  },
  slime_basic: {
    url: "/assets/enemies/slime_basic/idle/down.png",
    frameWidth: 64,
    frameHeight: 64,
  },
};

/** Для `__default` и неизвестных id — `undefined`. */
export function mobPortraitMeta(mobVisualId: string): MobPortraitMeta | undefined {
  return MOB_PORTRAIT_META_BY_VISUAL_ID[mobVisualId];
}

/** @deprecated предпочтительнее `mobPortraitMeta` (нужен размер кадра). */
export function mobPortraitUrl(mobVisualId: string): string | undefined {
  return mobPortraitMeta(mobVisualId)?.url;
}

/** Устаревшее имя карты — только URL; для превью кадра используйте `MOB_PORTRAIT_META_BY_VISUAL_ID`. */
export const MOB_PORTRAIT_BY_VISUAL_ID: Record<string, string> =
  Object.fromEntries(
    Object.entries(MOB_PORTRAIT_META_BY_VISUAL_ID).map(([k, v]) => [k, v.url])
  );
