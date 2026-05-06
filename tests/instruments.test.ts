import { describe, expect, it } from "vitest";
import { MAX_INVENTORY_SLOTS } from "@/src/game/constants/gameplay";
import {
  equippedHasInstrumentRole,
  inventoryHasInstrumentRole,
  inventoryQtyOf,
  playerHasInstrumentRole,
  TAG_AXE,
  TAG_FISHING_ROD,
  TAG_INSTRUMENT,
  TAG_PICKAXE,
} from "@/src/game/data/instruments";
import { getCuratedItem } from "@/src/game/data/itemRegistry";
import {
  sanitizeEquippedVsCatalog,
  tryMergeItemIntoSlots,
} from "@/src/game/state/sanitizeEquippedInventory";

describe("instrument items from catalog", () => {
  it("кирка, топор и удочка — свои слоты и теги", () => {
    const pick = getCuratedItem("pickaxe");
    const axe = getCuratedItem("axe_hatchet");
    const rod = getCuratedItem("fishing_rod_simple");
    expect(pick?.slot).toBe("pickaxe");
    expect(axe?.slot).toBe("axe");
    expect(rod?.slot).toBe("fishing_rod");
    expect(pick?.tags).toEqual([TAG_INSTRUMENT, TAG_PICKAXE]);
    expect(axe?.tags).toEqual([TAG_INSTRUMENT, TAG_AXE]);
    expect(rod?.tags).toEqual([TAG_INSTRUMENT, TAG_FISHING_ROD]);
  });
});

describe("inventoryHasInstrumentRole", () => {
  it("находит инструмент по слоту предмета", () => {
    const slots = [{ curatedId: "pickaxe", qty: 1 }, null];
    expect(inventoryHasInstrumentRole(slots, TAG_PICKAXE)).toBe(true);
    expect(inventoryHasInstrumentRole(slots, TAG_AXE)).toBe(false);
  });
});

describe("playerHasInstrumentRole", () => {
  it("учитывает экип", () => {
    expect(
      playerHasInstrumentRole([null], { pickaxe: "pickaxe" }, TAG_PICKAXE)
    ).toBe(true);
    expect(equippedHasInstrumentRole({ axe: "axe_hatchet" }, TAG_AXE)).toBe(
      true
    );
  });
});

describe("inventoryQtyOf", () => {
  it("суммирует количество", () => {
    const slots = [
      { curatedId: "apple", qty: 2 },
      { curatedId: "apple", qty: 3 },
      null,
    ];
    expect(inventoryQtyOf(slots, "apple")).toBe(5);
  });
});

describe("sanitizeEquippedVsCatalog", () => {
  it("снимает кирку с слота оружия и кладёт в инвентарь", () => {
    const inv = Array.from({ length: MAX_INVENTORY_SLOTS }, () => null) as (
      | { curatedId: string; qty: number }
      | null
    )[];
    const eq = sanitizeEquippedVsCatalog({ weapon: "pickaxe" }, inv);
    expect(eq.weapon).toBeUndefined();
    const idx = inv.findIndex((s) => s?.curatedId === "pickaxe");
    expect(idx).toBeGreaterThanOrEqual(0);
    expect(inv[idx]?.qty).toBe(1);
  });

  it("валидное оружие оставляет", () => {
    const inv = Array.from({ length: MAX_INVENTORY_SLOTS }, () => null) as (
      | { curatedId: string; qty: number }
      | null
    )[];
    const eq = sanitizeEquippedVsCatalog({ weapon: "blade_rusty" }, inv);
    expect(eq.weapon).toBe("blade_rusty");
  });

  it("кирка в слоте кирки остаётся", () => {
    const inv = Array.from({ length: MAX_INVENTORY_SLOTS }, () => null) as (
      | { curatedId: string; qty: number }
      | null
    )[];
    const eq = sanitizeEquippedVsCatalog({ pickaxe: "pickaxe" }, inv);
    expect(eq.pickaxe).toBe("pickaxe");
  });
});

describe("tryMergeItemIntoSlots", () => {
  it("возвращает остаток при полном инвентаре", () => {
    const inv = Array.from({ length: 3 }, () => ({
      curatedId: "apple",
      qty: 99,
    })) as ({ curatedId: string; qty: number } | null)[];
    const left = tryMergeItemIntoSlots(inv, "bread", 1);
    expect(left).toBe(1);
  });
});
