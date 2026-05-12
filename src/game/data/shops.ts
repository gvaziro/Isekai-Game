/** Определения торговых лавок (NPC id = shop id). */

export type ShopEntry = {
  curatedId: string;
  /** Стартовый запас и максимум после пополнения */
  stock: number;
  /** Множитель к базовой цене покупки у торговца */
  buyMult?: number;
  /** Множитель к базовой цене выкупа */
  sellMult?: number;
  /** Минимальный уровень персонажа, с которого товар доступен */
  requiredLevel?: number;
};

export type ShopDef = {
  id: string;
  npcId: string;
  title: string;
  buyMult: number;
  sellMult: number;
  restockIntervalMs: number;
  entries: readonly ShopEntry[];
};

export type ShopPersistState = {
  stock: Record<string, number>;
  lastRestockAt: number;
};

const FIVE_MIN = 5 * 60 * 1000;

/** Три лавки: расходники (+ удочка) / экипировка (+ топор) / материалы (+ кирка) */
export const SHOPS: readonly ShopDef[] = [
  {
    id: "elena",
    npcId: "elena",
    title: "Лавка Елены",
    buyMult: 1.2,
    sellMult: 0.4,
    restockIntervalMs: FIVE_MIN,
    entries: [
      { curatedId: "hp_small", stock: 14 },
      { curatedId: "hp_medium", stock: 8 },
      { curatedId: "bread", stock: 12 },
      { curatedId: "apple", stock: 18 },
      { curatedId: "potion_blue", stock: 5 },
      { curatedId: "item327", stock: 10 },
      { curatedId: "fishing_rod_simple", stock: 4 },
      { curatedId: "hand_torch", stock: 12 },
    ],
  },
  {
    id: "igor",
    npcId: "igor",
    title: "Лавка Игоря",
    buyMult: 1.15,
    sellMult: 0.42,
    restockIntervalMs: FIVE_MIN,
    entries: [
      { curatedId: "blade_rusty", stock: 4 },
      { curatedId: "mace", stock: 3 },
      { curatedId: "spear_short", stock: 3 },
      { curatedId: "shield_round", stock: 3 },
      { curatedId: "helm_leather", stock: 4 },
      { curatedId: "coat_travel", stock: 3 },
      { curatedId: "axe_hatchet", stock: 4 },
      { curatedId: "item682", stock: 4 },
      { curatedId: "item674", stock: 3, requiredLevel: 20 },
      { curatedId: "item675", stock: 2, requiredLevel: 50 },
    ],
  },
  {
    id: "marcus",
    npcId: "marcus",
    title: "Лавка Маркуса",
    buyMult: 1.25,
    sellMult: 0.38,
    restockIntervalMs: FIVE_MIN,
    entries: [
      { curatedId: "rope_coil", stock: 10 },
      { curatedId: "iron_ore", stock: 16 },
      { curatedId: "nails", stock: 20 },
      { curatedId: "hammer_tool", stock: 5 },
      { curatedId: "pickaxe", stock: 4 },
      { curatedId: "coin_stack", stock: 8 },
    ],
  },
];

export function getShopDefById(id: string): ShopDef | undefined {
  return SHOPS.find((s) => s.id === id);
}

export function getShopByNpc(npcId: string): ShopDef | undefined {
  return SHOPS.find((s) => s.npcId === npcId);
}

export function getShopEntry(
  def: ShopDef,
  curatedId: string
): ShopEntry | undefined {
  return def.entries.find((e) => e.curatedId === curatedId);
}

export function initialShopRuntime(def: ShopDef): ShopPersistState {
  const stock: Record<string, number> = {};
  for (const e of def.entries) {
    stock[e.curatedId] = e.stock;
  }
  return { stock, lastRestockAt: Date.now() };
}

/** Пополнение склада: за каждый прошедший интервал +1 к каждой позиции, не выше максимума */
export function applyShopRestock(
  def: ShopDef,
  runtime: ShopPersistState,
  nowMs: number
): ShopPersistState {
  const interval = def.restockIntervalMs;
  if (interval <= 0 || def.entries.length === 0) return runtime;
  const elapsed = nowMs - runtime.lastRestockAt;
  const ticks = Math.floor(elapsed / interval);
  if (ticks <= 0) return runtime;
  const stock = { ...runtime.stock };
  for (const ent of def.entries) {
    const max = ent.stock;
    const cur = stock[ent.curatedId] ?? 0;
    stock[ent.curatedId] = Math.min(max, cur + ticks);
  }
  return {
    stock,
    lastRestockAt: runtime.lastRestockAt + ticks * interval,
  };
}

export function computeBuyUnitPrice(
  def: ShopDef,
  entry: ShopEntry,
  basePrice: number
): number {
  const mult = (entry.buyMult ?? 1) * def.buyMult;
  return Math.max(0, Math.ceil(basePrice * mult));
}

export function computeSellUnitPrice(
  def: ShopDef,
  entry: ShopEntry | undefined,
  basePrice: number
): number {
  const em = entry?.sellMult ?? 1;
  const mult = em * def.sellMult;
  return Math.max(0, Math.floor(basePrice * mult));
}
