/**
 * Курируемые предметы: семантический id → кадр в атласе (ключ itemN как в PNG).
 *
 * Источник истины — `items.mapping.json` (редактируется админкой в /dev/items).
 * Сюда попадают только записи со slot ≠ "unknown" и непустым name.
 */

import mappingRaw from "./items.mapping.json";
import type { ConsumableFx } from "@/src/game/data/balance";
import type { ItemRarity } from "@/src/game/data/itemRarity";
import { isWeaponOrArmorSlot, parseItemRarity } from "@/src/game/data/itemRarity";

export type ItemSlot =
  | "weapon"
  | "offhand"
  | "helmet"
  | "chest"
  | "pants"
  | "boots"
  | "backpack"
  | "consumable"
  | "active_item"
  | "fish"
  | "loot"
  | "material"
  | "quest"
  | "pickaxe"
  | "axe"
  | "fishing_rod";

/** Слоты экипировки (не consumable/material/quest) */
export type EquipSlot = Extract<
  ItemSlot,
  | "weapon"
  | "offhand"
  | "helmet"
  | "chest"
  | "pants"
  | "boots"
  | "backpack"
  | "pickaxe"
  | "axe"
  | "fishing_rod"
>;

/** Плоские бонусы от предмета в слоте экипировки (как в balance.ITEM_EQUIP_BONUSES) */
export type EquipBonuses = {
  atk?: number;
  def?: number;
  hp?: number;
  sta?: number;
  spd?: number;
  luck?: number;
};

export type CuratedItemDef = {
  id: string;
  name: string;
  slot: ItemSlot;
  /** Эффективный кадр в textures.atlas: `iconFrameKey` из маппинга или иначе `frameKey` строки */
  atlasFrame: string;
  /** Базовая цена (переопределяет дефолт по слоту в itemRegistry) */
  basePrice?: number;
  /** Переопределение эффекта расходника; сливается с CONSUMABLE_EFFECTS[id] в рантайме */
  consumableFx?: ConsumableFx;
  /** Переопределение бонусов экипировки; сливается с ITEM_EQUIP_BONUSES[id] в рантайме */
  equipBonuses?: EquipBonuses;
  /**
   * Только slot === "backpack": сколько ячеек добавляет к базовому инвентарю при экипировке.
   */
  inventoryBonusSlots?: number;
  /** Теги из маппинга (например instrument + роль инструмента) */
  tags?: string[];
  /** Редкость оружия/брони (слоты weapon…boots) */
  rarity?: ItemRarity;
};

export type MappingEntry = {
  frameKey: string;
  id: string;
  name: string;
  /** "unknown" — не размечен; остальное — ItemSlot */
  slot: ItemSlot | "unknown";
  tags?: string[];
  notes?: string;
  consumableFx?: ConsumableFx;
  /** Базовая цена предмета для торговли */
  basePrice?: number;
  /** Показывать иконку из другого кадра атласа (ключ itemN); иначе используется frameKey */
  iconFrameKey?: string;
  /** Бонусы при экипировке; сливаются с ITEM_EQUIP_BONUSES[id] */
  equipBonuses?: EquipBonuses;
  /** Для slot backpack: дополнительные ячейки инвентаря при надевании */
  inventoryBonusSlots?: number;
  /** Редкость (JSON); только для оружия и брони */
  rarity?: string;
};

type MappingFile = {
  updatedAt?: string;
  items: MappingEntry[];
};

const mapping = mappingRaw as MappingFile;

const ITEM_SLOTS: readonly ItemSlot[] = [
  "weapon",
  "offhand",
  "helmet",
  "chest",
  "pants",
  "boots",
  "backpack",
  "consumable",
  "active_item",
  "fish",
  "loot",
  "material",
  "quest",
  "pickaxe",
  "axe",
  "fishing_rod",
];

function isItemSlot(v: string): v is ItemSlot {
  return (ITEM_SLOTS as readonly string[]).includes(v);
}

/** Полный список записей маппинга (включая unknown) */
export const ITEM_MAPPING: readonly MappingEntry[] = mapping.items;

/** Курируемые (размеченные) предметы. Порядок — как в mapping.json */
export const CURATED_ITEMS: readonly CuratedItemDef[] = mapping.items
  .filter(
    (e): e is MappingEntry & { slot: ItemSlot } =>
      isItemSlot(e.slot) && e.name.trim().length > 0 && e.id.trim().length > 0
  )
  .map((e) => {
    const icon = e.iconFrameKey?.trim();
    const atlasFrame =
      icon && icon.length > 0 ? icon : e.frameKey;
    const row: CuratedItemDef = {
      id: e.id,
      name: e.name,
      slot: e.slot,
      atlasFrame,
    };
    if (typeof e.basePrice === "number" && Number.isFinite(e.basePrice)) {
      row.basePrice = e.basePrice;
    }
    if (e.consumableFx && Object.keys(e.consumableFx).length > 0) {
      row.consumableFx = e.consumableFx;
    }
    if (e.equipBonuses && Object.keys(e.equipBonuses).length > 0) {
      row.equipBonuses = e.equipBonuses;
    }
    const tags = e.tags?.filter((t) => typeof t === "string" && t.trim().length > 0);
    if (tags && tags.length > 0) {
      row.tags = tags;
    }
    if (e.slot === "backpack") {
      const n = e.inventoryBonusSlots;
      if (typeof n === "number" && Number.isFinite(n) && n >= 0) {
        row.inventoryBonusSlots = Math.floor(n);
      }
    }
    if (isWeaponOrArmorSlot(e.slot)) {
      const r = parseItemRarity(e.rarity);
      if (r) row.rarity = r;
    }
    return row;
  });
