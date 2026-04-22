import type { ItemSlot } from "@/src/game/data/items.curated";

/** Уровни редкости для оружия и брони (маппинг / каталог). */
export const ITEM_RARITY_IDS = [
  "common",
  "uncommon",
  "rare",
  "epic",
  "ancient",
  "legendary",
  "divine",
] as const;

export type ItemRarity = (typeof ITEM_RARITY_IDS)[number];

const RARITY_SET = new Set<string>(ITEM_RARITY_IDS);

export const ITEM_RARITY_LABEL_RU: Record<ItemRarity, string> = {
  common: "Обычный",
  uncommon: "Необычный",
  rare: "Редкий",
  epic: "Эпический",
  ancient: "Древний",
  legendary: "Легендарный",
  divine: "Божественный",
};

/** Слоты, для которых задаётся редкость (оружие и броня). */
export function isWeaponOrArmorSlot(slot: ItemSlot): boolean {
  return (
    slot === "weapon" ||
    slot === "offhand" ||
    slot === "helmet" ||
    slot === "chest" ||
    slot === "pants" ||
    slot === "boots"
  );
}

export function parseItemRarity(raw: unknown): ItemRarity | undefined {
  if (typeof raw !== "string") return undefined;
  const k = raw.trim();
  return RARITY_SET.has(k) ? (k as ItemRarity) : undefined;
}

/** Текст для UI (по умолчанию — обычный, если не задано). */
export function formatItemRarityLabel(rarity: ItemRarity | undefined): string {
  const r = rarity ?? "common";
  return ITEM_RARITY_LABEL_RU[r];
}

/** Классы Tailwind для цвета названия редкости в интерфейсе. */
export function itemRarityNameClass(rarity: ItemRarity | undefined): string {
  switch (rarity ?? "common") {
    case "common":
      return "text-zinc-400";
    case "uncommon":
      return "text-emerald-400";
    case "rare":
      return "text-sky-400";
    case "epic":
      return "text-violet-400";
    case "ancient":
      return "text-teal-400";
    case "legendary":
      return "text-amber-400";
    case "divine":
      return "text-amber-200";
    default:
      return "text-zinc-400";
  }
}

/** Обводка превью (экипировка): тонкая рамка по редкости; для common — без акцента. */
export function itemRarityOutlineClass(rarity: ItemRarity | undefined): string {
  switch (rarity ?? "common") {
    case "common":
      return "";
    case "uncommon":
      return "ring-2 ring-emerald-600/65 ring-offset-1 ring-offset-[#ebe3d2]";
    case "rare":
      return "ring-2 ring-sky-500/70 ring-offset-1 ring-offset-[#ebe3d2]";
    case "epic":
      return "ring-2 ring-violet-500/75 ring-offset-1 ring-offset-[#ebe3d2]";
    case "ancient":
      return "ring-2 ring-teal-400/75 ring-offset-1 ring-offset-[#ebe3d2]";
    case "legendary":
      return "ring-2 ring-amber-400/85 ring-offset-1 ring-offset-[#ebe3d2]";
    case "divine":
      return "ring-2 ring-amber-100/90 ring-offset-1 ring-offset-[#ebe3d2] shadow-[0_0_12px_rgba(253,224,71,0.35)]";
    default:
      return "";
  }
}
