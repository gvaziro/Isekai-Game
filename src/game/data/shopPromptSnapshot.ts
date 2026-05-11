import {
  applyShopRestock,
  computeBuyUnitPrice,
  initialShopRuntime,
  type ShopDef,
  type ShopPersistState,
} from "@/src/game/data/shops";
import {
  getConsumableEffect,
  getCuratedItem,
  getEquipBonuses,
  getItemBasePrice,
} from "@/src/game/data/itemRegistry";
import type { CuratedItemDef, ItemSlot } from "@/src/game/data/items.curated";

export type ShopPromptSnapshotOptions = {
  shop: ShopDef;
  runtime?: ShopPersistState;
  characterLevel: number;
  gold: number;
  nowMs?: number;
};

const SLOT_LABELS: Record<ItemSlot, string> = {
  weapon: "оружие",
  offhand: "щит/левая рука",
  helmet: "шлем",
  chest: "броня",
  pants: "поножи",
  boots: "обувь",
  backpack: "рюкзак",
  consumable: "расходник",
  active_item: "активный предмет",
  fish: "рыба",
  loot: "добыча",
  material: "материал",
  quest: "особый предмет",
  pickaxe: "кирка",
  axe: "топор",
  fishing_rod: "удочка",
};

function clampInt(n: number, fallback = 0): number {
  return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : fallback;
}

function formatEquipBonuses(curatedId: string): string | null {
  const bonuses = getEquipBonuses(curatedId);
  if (!bonuses) return null;
  const parts = Object.entries(bonuses)
    .filter(([, value]) => typeof value === "number" && value > 0)
    .map(([key, value]) => `+${value} ${key}`);
  return parts.length > 0 ? `бонусы ${parts.join(", ")}` : null;
}

function formatConsumableEffect(curatedId: string): string | null {
  const fx = getConsumableEffect(curatedId);
  if (!fx) return null;
  const parts: string[] = [];
  if (typeof fx.healHp === "number" && fx.healHp > 0) {
    parts.push(`лечит ${Math.floor(fx.healHp)} HP`);
  }
  if (typeof fx.restoreSta === "number" && fx.restoreSta > 0) {
    parts.push(`восстанавливает ${Math.floor(fx.restoreSta)} STA`);
  }
  if (fx.applyBuffs?.length) {
    parts.push(`баффы: ${fx.applyBuffs.map((b) => b.id).join(", ")}`);
  }
  return parts.length > 0 ? parts.join("; ") : null;
}

function formatItemUse(def: CuratedItemDef): string {
  const details = [
    SLOT_LABELS[def.slot],
    formatConsumableEffect(def.id),
    formatEquipBonuses(def.id),
    def.inventoryBonusSlots ? `+${def.inventoryBonusSlots} ячеек инвентаря` : null,
    def.tags?.length ? `теги: ${def.tags.join(", ")}` : null,
  ].filter(Boolean);
  return details.join("; ");
}

export function buildShopPromptSnapshot({
  shop,
  runtime,
  characterLevel,
  gold,
  nowMs = Date.now(),
}: ShopPromptSnapshotOptions): string {
  const level = clampInt(characterLevel, 1);
  const currentRuntime = applyShopRestock(
    shop,
    runtime ?? initialShopRuntime(shop),
    nowMs
  );

  const available: string[] = [];
  const outOfStock: string[] = [];
  const locked: string[] = [];

  for (const entry of shop.entries) {
    const def = getCuratedItem(entry.curatedId);
    if (!def) continue;

    const stock = clampInt(currentRuntime.stock[entry.curatedId] ?? entry.stock);
    const price = computeBuyUnitPrice(shop, entry, getItemBasePrice(entry.curatedId));
    const requiredLevel = entry.requiredLevel ?? 1;
    const base = `${def.name} (${entry.curatedId})`;
    const line = `${base}: ${formatItemUse(def)}; цена ${price} зол.; остаток ${stock}`;

    if (requiredLevel > level) {
      locked.push(`${line}; доступно с уровня ${requiredLevel}`);
    } else if (stock <= 0) {
      outOfStock.push(`${base}: нет в наличии; обычная цена ${price} зол.`);
    } else {
      available.push(line);
    }
  }

  const lines = [
    `Лавка: ${shop.title} (NPC ${shop.npcId}).`,
    `Игрок сейчас: уровень ${level}, золото ${clampInt(gold)}.`,
    "Это актуальный склад этого NPC. Если игрок спрашивает, что купить или что есть для подземелья, советуй только из этих позиций, учитывай цену, остаток, уровень и пользу предмета. Не выдумывай товары, цены и бесконечный склад.",
    "В наличии:",
    ...(available.length ? available.map((line) => `- ${line}`) : ["- ничего доступного"]),
  ];

  if (outOfStock.length) {
    lines.push("Нет в наличии:", ...outOfStock.map((line) => `- ${line}`));
  }
  if (locked.length) {
    lines.push("Пока недоступно игроку:", ...locked.map((line) => `- ${line}`));
  }

  return lines.join("\n");
}
