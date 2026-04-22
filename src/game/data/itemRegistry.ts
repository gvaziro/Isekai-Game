import {
  CONSUMABLE_EFFECTS,
  ITEM_EQUIP_BONUSES,
  resolveConsumableCooldownMs,
  type ConsumableFx,
} from "@/src/game/data/balance";
import {
  BASE_INVENTORY_SLOTS,
  MAX_BACKPACK_BONUS_SLOTS,
  MAX_INVENTORY_SLOTS,
} from "@/src/game/constants/gameplay";
import type { ItemRarity } from "@/src/game/data/itemRarity";
import { isWeaponOrArmorSlot } from "@/src/game/data/itemRarity";
import {
  CURATED_ITEMS,
  type CuratedItemDef,
  type EquipBonuses,
  type EquipSlot,
  type ItemSlot,
} from "@/src/game/data/items.curated";
import { ITEM_ATLAS, ITEM_ATLAS_FRAME_KEYS } from "@/src/game/data/items.generated";

const byCuratedId = new Map<string, CuratedItemDef>(
  CURATED_ITEMS.map((def) => [def.id, def])
);

const atlasFrameSet = new Set<string>(ITEM_ATLAS_FRAME_KEYS);

/** Слоты, для которых в рантайме читается эффект «использовать» (расходник / активный предмет). */
const USABLE_EFFECT_ITEM_SLOTS = new Set<ItemSlot>(["consumable", "active_item"]);

export function itemSlotSupportsUsableEffect(slot: ItemSlot): boolean {
  return USABLE_EFFECT_ITEM_SLOTS.has(slot);
}

const EQUIP_ITEM_SLOTS = new Set<ItemSlot>([
  "weapon",
  "offhand",
  "helmet",
  "chest",
  "pants",
  "boots",
  "backpack",
  "pickaxe",
  "axe",
  "fishing_rod",
]);

const EQUIP_BONUS_KEYS = [
  "atk",
  "def",
  "hp",
  "sta",
  "spd",
  "luck",
] as const satisfies readonly (keyof EquipBonuses)[];

function normalizeEquipBonuses(
  raw: EquipBonuses | undefined
): EquipBonuses | undefined {
  if (!raw) return undefined;
  const out: EquipBonuses = {};
  for (const k of EQUIP_BONUS_KEYS) {
    const v = raw[k];
    if (typeof v === "number" && Number.isFinite(v) && v >= 0) {
      out[k] = Math.floor(v);
    }
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/** Если в маппинге нет basePrice — ориентир для торговли */
const SLOT_DEFAULT_BASE_PRICE: Record<ItemSlot, number> = {
  weapon: 50,
  offhand: 45,
  helmet: 38,
  chest: 48,
  pants: 36,
  boots: 32,
  backpack: 40,
  consumable: 14,
  active_item: 20,
  fish: 12,
  loot: 11,
  material: 10,
  quest: 28,
  pickaxe: 22,
  axe: 22,
  fishing_rod: 22,
};

/** Базовая цена для экономики (маппинг или дефолт по слоту) */
export function getItemBasePrice(curatedId: string): number {
  const def = getCuratedItem(curatedId);
  if (!def) return 0;
  if (
    typeof def.basePrice === "number" &&
    Number.isFinite(def.basePrice) &&
    def.basePrice >= 0
  ) {
    return Math.floor(def.basePrice);
  }
  return SLOT_DEFAULT_BASE_PRICE[def.slot] ?? 0;
}

/** Описание курируемого предмета по семантическому id */
export function getCuratedItem(id: string): CuratedItemDef | undefined {
  return byCuratedId.get(id);
}

/** Редкость из каталога; только для оружия и брони. */
export function getItemRarity(id: string): ItemRarity | undefined {
  const def = getCuratedItem(id);
  if (!def || !isWeaponOrArmorSlot(def.slot)) return undefined;
  return def.rarity;
}

export const getItemDef = getCuratedItem;

export function listCuratedItems(): readonly CuratedItemDef[] {
  return CURATED_ITEMS;
}

/** Есть ли кадр в текущем атласе (после gen-items) */
export function atlasHasFrame(frameKey: string): boolean {
  if (!ITEM_ATLAS.available) return false;
  return atlasFrameSet.has(frameKey);
}

/** Курируемый предмет с проверкой, что кадр реально упакован */
export function getCuratedItemIfPacked(
  id: string
): (CuratedItemDef & { packed: boolean }) | undefined {
  const def = getCuratedItem(id);
  if (!def) return undefined;
  const packed = atlasHasFrame(def.atlasFrame);
  return { ...def, packed };
}

/**
 * Эффект расходника: встроенный баланс CONSUMABLE_EFFECTS[id], поверх — consumableFx из маппинга.
 */
export function getConsumableEffect(id: string): ConsumableFx | undefined {
  const def = getCuratedItem(id);
  if (!def || !itemSlotSupportsUsableEffect(def.slot)) return undefined;
  const leg = CONSUMABLE_EFFECTS[id];
  const ov = def.consumableFx;
  if (!ov || Object.keys(ov).length === 0) return leg;
  return {
    ...leg,
    ...ov,
    applyBuffs:
      ov.applyBuffs !== undefined ? ov.applyBuffs : leg?.applyBuffs,
    cooldownMs: ov.cooldownMs !== undefined ? ov.cooldownMs : leg?.cooldownMs,
  };
}

/** Полный откат предмета (мс) с учётом balance и каталога. */
export function getConsumableCooldownMs(id: string): number {
  return resolveConsumableCooldownMs(getConsumableEffect(id));
}

/** Дополнительные ячейки инвентаря от надетого рюкзака (0…MAX_BACKPACK_BONUS_SLOTS). */
export function getBackpackInventoryBonusSlots(
  curatedId: string | undefined
): number {
  if (!curatedId) return 0;
  const def = getCuratedItem(curatedId);
  if (!def || def.slot !== "backpack") return 0;
  const n = def.inventoryBonusSlots;
  if (typeof n !== "number" || !Number.isFinite(n) || n < 0) return 0;
  return Math.min(MAX_BACKPACK_BONUS_SLOTS, Math.floor(n));
}

/** Сколько ячеек рюкзака сейчас доступно (с учётом надетого предмета «рюкзак»). */
export function getEffectiveInventorySlotCount(
  equipped: Partial<Record<EquipSlot, string>>
): number {
  const bonus = getBackpackInventoryBonusSlots(equipped.backpack);
  return Math.min(MAX_INVENTORY_SLOTS, BASE_INVENTORY_SLOTS + bonus);
}

/**
 * Бонусы экипировки: встроенный баланс ITEM_EQUIP_BONUSES[id], поверх — equipBonuses из маппинга.
 * Только для слотов экипировки.
 */
export function getEquipBonuses(curatedId: string): EquipBonuses | undefined {
  const def = getCuratedItem(curatedId);
  if (!def || !EQUIP_ITEM_SLOTS.has(def.slot)) return undefined;
  const leg = ITEM_EQUIP_BONUSES[curatedId];
  const ov = def.equipBonuses;
  const merged: EquipBonuses = { ...(leg ?? {}), ...(ov ?? {}) };
  return normalizeEquipBonuses(merged);
}
