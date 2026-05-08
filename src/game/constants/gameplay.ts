/** Радиус взаимодействия с NPC / сундуком / станцией (пиксели мира). */
export const INTERACT_RADIUS_NPC = 52;

/** Рубка дерева в лесу: дистанция до ствола (мир). */
export const TREE_CHOP_RADIUS = 56;

/** Пауза между случайными репликами NPC при стоянии рядом (мс). */
export const NPC_BARK_COOLDOWN_MS_MIN = 7000;
export const NPC_BARK_COOLDOWN_MS_MAX = 14000;
/** Подбор предмета с земли */
export const PICKUP_RADIUS = 28;
/** Базовые ячейки рюкзака без надетого предмета «рюкзак». */
export const BASE_INVENTORY_SLOTS = 9;
/** Максимум дополнительных ячеек от надетого рюкзака (на предмет). */
export const MAX_BACKPACK_BONUS_SLOTS = 24;
/** Физический размер массива инвентаря в сохранении (база + макс. бонус). */
export const MAX_INVENTORY_SLOTS =
  BASE_INVENTORY_SLOTS + MAX_BACKPACK_BONUS_SLOTS;
/** Ячеек хранения в одном сундуке (отдельно от рюкзака). */
export const CHEST_STORAGE_SLOTS = 24;
/** Первые N ячеек рюкзака — быстрый доступ (хотбар). */
export const HOTBAR_SLOT_COUNT = 9;

/** После смены выбранного слота колесом мыши (подсказка с названием предмета). */
export const HOTBAR_WHEEL_NUDGE_EVENT = "nagibatop-hotbar-wheel-nudge";

/** Синтетический выход у западной границы деревни: туман / дорога наружу. */
export const VILLAGE_FOG_EXIT_ID = "village_fog_barrier";

/** Выброс из инвентаря: предмет появляется в мире рядом с героем. */
export const SPAWN_WORLD_PICKUP_EVENT = "nagibatop-spawn-world-pickup";

/** Сообщение о смерти: центральная модалка, закрывается только игроком (не тост). */
export const DEATH_MODAL_EVENT = "nagibatop-death-modal";

/** Временный «сундук» для лута с тела (`chestSlots`); в сейв не пишется. */
export const DEATH_CORPSE_CHEST_PREFIX = "__death_corpse__";

export function deathCorpseChestId(dropId: string): string {
  return `${DEATH_CORPSE_CHEST_PREFIX}${dropId}`;
}

export function isDeathCorpseChestId(
  chestId: string | null | undefined
): chestId is string {
  return (
    typeof chestId === "string" && chestId.startsWith(DEATH_CORPSE_CHEST_PREFIX)
  );
}

export function deathCorpseDropIdFromChestId(chestId: string): string {
  return chestId.slice(DEATH_CORPSE_CHEST_PREFIX.length);
}

/** После обмена с телом — перерисовать маркеры в сцене. */
export const RESYNC_CORPSE_PICKUPS_EVENT = "nagibatop-resync-corpse-pickups";

/**
 * Внутреннее разрешение Phaser в обычной игре (не `?preview=1` с полным кадром мира).
 * 16:9; при Scale.FIT мир 4:3 по-прежнему с боковыми полосами.
 */
export const PLAY_VIEWPORT_WIDTH = 1280;
export const PLAY_VIEWPORT_HEIGHT = 720;

if (HOTBAR_SLOT_COUNT > BASE_INVENTORY_SLOTS) {
  throw new Error("HOTBAR_SLOT_COUNT must not exceed BASE_INVENTORY_SLOTS");
}

export const MAX_STACK = 99;
