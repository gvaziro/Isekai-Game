import { describe, expect, it } from "vitest";
import {
  applyShopRestock,
  computeBuyUnitPrice,
  computeSellUnitPrice,
  getShopByNpc,
  initialShopRuntime,
  type ShopDef,
  type ShopPersistState,
} from "@/src/game/data/shops";
import { getItemBasePrice } from "@/src/game/data/itemRegistry";
import { buildShopPromptSnapshot } from "@/src/game/data/shopPromptSnapshot";

const mockShop: ShopDef = {
  id: "test",
  npcId: "test",
  title: "Test",
  buyMult: 1.2,
  sellMult: 0.4,
  restockIntervalMs: 60_000,
  entries: [
    { curatedId: "hp_small", stock: 5 },
    { curatedId: "apple", stock: 3 },
  ],
};

describe("applyShopRestock", () => {
  it("adds one per item per elapsed interval, capped at max", () => {
    const t0 = 1_000_000;
    const start: ShopPersistState = {
      stock: { hp_small: 2, apple: 0 },
      lastRestockAt: t0,
    };
    const t1 = t0 + 2 * 60_000;
    const out = applyShopRestock(mockShop, start, t1);
    expect(out.stock.hp_small).toBe(4);
    expect(out.stock.apple).toBe(2);
    expect(out.lastRestockAt).toBe(t0 + 2 * 60_000);
  });

  it("does not exceed entry.stock maximum", () => {
    const t0 = 0;
    const start: ShopPersistState = {
      stock: { hp_small: 5, apple: 3 },
      lastRestockAt: t0,
    };
    const out = applyShopRestock(mockShop, start, t0 + 60_000);
    expect(out.stock.hp_small).toBe(5);
    expect(out.stock.apple).toBe(3);
  });
});

describe("initialShopRuntime", () => {
  it("fills stock to entry.stock for each item", () => {
    const rt = initialShopRuntime(mockShop);
    expect(rt.stock.hp_small).toBe(5);
    expect(rt.stock.apple).toBe(3);
    expect(rt.lastRestockAt).toBeGreaterThan(0);
  });
});

describe("computeBuyUnitPrice / computeSellUnitPrice", () => {
  it("buy uses ceil and shop + entry mults", () => {
    const entry = mockShop.entries[0]!;
    const base = 10;
    const unit = computeBuyUnitPrice(mockShop, entry, base);
    expect(unit).toBe(Math.ceil(10 * 1 * 1.2));
  });

  it("sell uses floor", () => {
    const entry = mockShop.entries[0]!;
    const base = 10;
    const unit = computeSellUnitPrice(mockShop, entry, base);
    expect(unit).toBe(Math.floor(10 * 1 * 0.4));
  });

  it("sell without catalog entry uses shop sellMult only", () => {
    const base = 50;
    const unit = computeSellUnitPrice(mockShop, undefined, base);
    expect(unit).toBe(Math.floor(50 * 0.4));
  });
});

describe("getItemBasePrice", () => {
  it("returns non-negative for known curated ids", () => {
    expect(getItemBasePrice("hp_small")).toBeGreaterThan(0);
    expect(getItemBasePrice("blade_rusty")).toBeGreaterThan(0);
  });

  it("returns 0 for unknown id", () => {
    expect(getItemBasePrice("__no_such_item__")).toBe(0);
  });
});

describe("buildShopPromptSnapshot", () => {
  it("describes current merchant stock, prices, effects, and unavailable items", () => {
    const shop = getShopByNpc("igor");
    expect(shop).toBeTruthy();
    const text = buildShopPromptSnapshot({
      shop: shop!,
      runtime: {
        stock: { blade_rusty: 0, mace: 2, shield_round: 1 },
        lastRestockAt: 1_000_000,
      },
      characterLevel: 1,
      gold: 35,
      nowMs: 1_000_000,
    });

    expect(text).toContain("NPC igor");
    expect(text).toContain("золото 35");
    expect(text).toContain("mace");
    expect(text).toContain("shield_round");
    expect(text).toContain("blade_rusty");
    expect(text).toContain("нет в наличии");
    expect(text).toContain("item674");
    expect(text).toContain("доступно с уровня 20");
  });
});
