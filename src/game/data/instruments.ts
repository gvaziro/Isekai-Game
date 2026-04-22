import type { EquipSlot } from "@/src/game/data/items.curated";
import { getCuratedItem } from "@/src/game/data/itemRegistry";

/** Общий класс в тегах маппинга (опционально). */
export const TAG_INSTRUMENT = "instrument";

/** Роли = имена слотов предмета/экипировки. */
export const TAG_AXE = "axe";
export const TAG_PICKAXE = "pickaxe";
export const TAG_FISHING_ROD = "fishing_rod";

export type InstrumentRole =
  | typeof TAG_AXE
  | typeof TAG_PICKAXE
  | typeof TAG_FISHING_ROD;

export function curatedItemHasTag(curatedId: string, tag: string): boolean {
  const d = getCuratedItem(curatedId);
  return !!d?.tags?.includes(tag);
}

type InvLike = { curatedId: string; qty: number } | null;

/** Суммарное количество предмета в ячейках (инвентарь + хотбар — один массив). */
export function inventoryQtyOf(
  slots: readonly InvLike[],
  curatedId: string
): number {
  let n = 0;
  for (const s of slots) {
    if (s && s.curatedId === curatedId) n += s.qty;
  }
  return n;
}

/** Предмет с нужным слотом (`pickaxe` / `axe` / `fishing_rod`) в рюкзаке. */
export function inventoryHasInstrumentRole(
  slots: readonly InvLike[],
  role: InstrumentRole
): boolean {
  for (const s of slots) {
    if (!s || s.qty < 1) continue;
    const d = getCuratedItem(s.curatedId);
    if (d?.slot === role) return true;
  }
  return false;
}

export function equippedHasInstrumentRole(
  equipped: Partial<Record<EquipSlot, string>>,
  role: InstrumentRole
): boolean {
  const id = equipped[role as EquipSlot];
  return typeof id === "string" && id.length > 0;
}

/** Надето в слот или лежит в инвентаре. */
export function playerHasInstrumentRole(
  slots: readonly InvLike[],
  equipped: Partial<Record<EquipSlot, string>>,
  role: InstrumentRole
): boolean {
  return (
    equippedHasInstrumentRole(equipped, role) ||
    inventoryHasInstrumentRole(slots, role)
  );
}
