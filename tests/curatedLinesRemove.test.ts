import { describe, expect, it } from "vitest";
import { simulateRemoveCuratedLinesFromInvAndEquipped } from "@/src/game/systems/craftInventory";

describe("simulateRemoveCuratedLinesFromInvAndEquipped", () => {
  it("снимает с рюкзака и с экипировки атомарно", () => {
    const slots = [
      { curatedId: "pickaxe", qty: 1 },
      { curatedId: "axe_hatchet", qty: 1 },
    ];
    const equipped: Partial<Record<string, string>> = {};
    const r = simulateRemoveCuratedLinesFromInvAndEquipped(slots, equipped, [
      { curatedId: "pickaxe", qty: 1 },
      { curatedId: "axe_hatchet", qty: 1 },
    ]);
    expect(r).not.toBeNull();
    if (!r) return;
    expect(r.slots.filter(Boolean).length).toBe(0);
  });

  it("снимает экипированную кирку, если в рюкзаке нет", () => {
    const slots = Array.from({ length: 24 }, () => null);
    const equipped = { pickaxe: "pickaxe", axe: "axe_hatchet" };
    const r = simulateRemoveCuratedLinesFromInvAndEquipped(slots, equipped, [
      { curatedId: "pickaxe", qty: 1 },
      { curatedId: "axe_hatchet", qty: 1 },
    ]);
    expect(r).not.toBeNull();
    if (!r) return;
    expect(r.equipped.pickaxe).toBeUndefined();
    expect(r.equipped.axe).toBeUndefined();
  });

  it("возвращает null, если не хватает второй позиции (без частичного снятия)", () => {
    const slots = [{ curatedId: "pickaxe", qty: 1 }];
    const equipped: Partial<Record<string, string>> = {};
    const r = simulateRemoveCuratedLinesFromInvAndEquipped(slots, equipped, [
      { curatedId: "pickaxe", qty: 1 },
      { curatedId: "axe_hatchet", qty: 1 },
    ]);
    expect(r).toBeNull();
    expect(slots[0]?.qty).toBe(1);
  });
});
