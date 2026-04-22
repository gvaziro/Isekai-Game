import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { MAX_BACKPACK_BONUS_SLOTS } from "@/src/game/constants/gameplay";
import type { BuffId, ConsumableFx } from "@/src/game/data/balance";
import { BUFFS } from "@/src/game/data/balance";
import type { ItemRarity } from "@/src/game/data/itemRarity";
import { ITEM_RARITY_IDS } from "@/src/game/data/itemRarity";
import { isWeaponOrArmorSlot } from "@/src/game/data/itemRarity";
import type { EquipBonuses, ItemSlot } from "@/src/game/data/items.curated";

const MAPPING_PATH = path.join(
  process.cwd(),
  "src",
  "game",
  "data",
  "items.mapping.json"
);

const ITEM_SLOTS = [
  "weapon",
  "offhand",
  "helmet",
  "chest",
  "pants",
  "boots",
  "consumable",
  "active_item",
  "fish",
  "loot",
  "material",
  "quest",
  "pickaxe",
  "axe",
  "fishing_rod",
  "backpack",
  "unknown",
] as const;

type Slot = (typeof ITEM_SLOTS)[number];

type Entry = {
  frameKey: string;
  id: string;
  name: string;
  slot: Slot;
  tags?: string[];
  notes?: string;
  consumableFx?: ConsumableFx;
  /** Иконка из другого кадра атласа; в игре используется вместо frameKey */
  iconFrameKey?: string;
  equipBonuses?: EquipBonuses;
  /** slot backpack: доп. ячейки инвентаря (0…MAX_BACKPACK_BONUS_SLOTS) */
  inventoryBonusSlots?: number;
  /** Оружие / броня */
  rarity?: ItemRarity;
};

type MappingFile = {
  $schema?: string;
  updatedAt?: string;
  items: Entry[];
};

function isDev() {
  return process.env.NODE_ENV === "development";
}

async function readMapping(): Promise<MappingFile> {
  const raw = await fs.readFile(MAPPING_PATH, "utf8");
  const parsed = JSON.parse(raw) as MappingFile;
  if (!parsed || !Array.isArray(parsed.items)) {
    throw new Error("Invalid mapping file");
  }
  return parsed;
}

const BUFF_ID_SET = new Set<string>(Object.keys(BUFFS));
const RARITY_ID_SET = new Set<string>(ITEM_RARITY_IDS);

function sanitizeConsumableFx(raw: unknown): ConsumableFx | undefined {
  if (raw === null) return undefined;
  if (typeof raw !== "object" || raw === null) return undefined;
  const o = raw as Record<string, unknown>;
  const out: ConsumableFx = {};
  if (typeof o.healHp === "number" && Number.isFinite(o.healHp) && o.healHp >= 0) {
    out.healHp = Math.floor(o.healHp);
  }
  if (
    typeof o.restoreSta === "number" &&
    Number.isFinite(o.restoreSta) &&
    o.restoreSta >= 0
  ) {
    out.restoreSta = Math.floor(o.restoreSta);
  }
  if (Array.isArray(o.applyBuffs)) {
    const rows: NonNullable<ConsumableFx["applyBuffs"]> = [];
    for (const row of o.applyBuffs) {
      if (typeof row !== "object" || row === null) continue;
      const r = row as Record<string, unknown>;
      const id =
        typeof r.id === "string" && BUFF_ID_SET.has(r.id)
          ? (r.id as BuffId)
          : null;
      const durationSec =
        typeof r.durationSec === "number" &&
        Number.isFinite(r.durationSec) &&
        r.durationSec > 0
          ? Math.floor(r.durationSec)
          : null;
      if (id && durationSec) rows.push({ id, durationSec });
    }
    if (rows.length > 0) out.applyBuffs = rows;
  }
  if (
    typeof o.cooldownMs === "number" &&
    Number.isFinite(o.cooldownMs) &&
    o.cooldownMs >= 0
  ) {
    out.cooldownMs = Math.floor(o.cooldownMs);
  }
  if (
    out.healHp === undefined &&
    out.restoreSta === undefined &&
    !out.applyBuffs?.length &&
    out.cooldownMs === undefined
  ) {
    return undefined;
  }
  return out;
}

function sanitizeEquipBonuses(raw: unknown): EquipBonuses | undefined {
  if (raw === null) return undefined;
  if (typeof raw !== "object" || raw === null) return undefined;
  const o = raw as Record<string, unknown>;
  const out: EquipBonuses = {};
  const keys: (keyof EquipBonuses)[] = [
    "atk",
    "def",
    "hp",
    "sta",
    "spd",
    "luck",
  ];
  for (const k of keys) {
    const v = o[k];
    if (typeof v === "number" && Number.isFinite(v) && v >= 0) {
      out[k] = Math.floor(v);
    }
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function sanitizeInventoryBonusSlots(
  raw: unknown
): number | undefined {
  if (typeof raw !== "number" || !Number.isFinite(raw)) return undefined;
  const n = Math.floor(raw);
  if (n < 0) return undefined;
  return Math.min(MAX_BACKPACK_BONUS_SLOTS, n);
}

function sanitizeEntry(input: unknown, prev?: Entry): Entry | null {
  if (typeof input !== "object" || input === null) return null;
  const o = input as Record<string, unknown>;
  const frameKey = typeof o.frameKey === "string" ? o.frameKey : prev?.frameKey;
  if (!frameKey) return null;
  const slotRaw = typeof o.slot === "string" ? o.slot : prev?.slot ?? "unknown";
  const slot: Slot = (ITEM_SLOTS as readonly string[]).includes(slotRaw)
    ? (slotRaw as Slot)
    : "unknown";
  const id =
    typeof o.id === "string" && o.id.trim().length > 0
      ? o.id.trim()
      : prev?.id ?? frameKey;
  const name = typeof o.name === "string" ? o.name : prev?.name ?? "";
  const tags = Array.isArray(o.tags)
    ? (o.tags as unknown[]).filter((t): t is string => typeof t === "string")
    : prev?.tags;
  const notes = typeof o.notes === "string" ? o.notes : prev?.notes;
  let consumableFx: ConsumableFx | undefined;
  if (o.consumableFx === null) {
    consumableFx = undefined;
  } else if (o.consumableFx !== undefined) {
    consumableFx = sanitizeConsumableFx(o.consumableFx);
  } else {
    consumableFx = prev?.consumableFx;
  }

  let iconFrameKey: string | undefined;
  if (Object.prototype.hasOwnProperty.call(o, "iconFrameKey")) {
    if (o.iconFrameKey === null) {
      iconFrameKey = undefined;
    } else if (typeof o.iconFrameKey === "string") {
      const t = o.iconFrameKey.trim();
      iconFrameKey =
        t.length > 0 && t !== frameKey ? t : undefined;
    } else {
      iconFrameKey = undefined;
    }
  } else {
    const prevIcon = prev?.iconFrameKey?.trim();
    iconFrameKey =
      prevIcon && prevIcon.length > 0 && prevIcon !== frameKey
        ? prevIcon
        : undefined;
  }

  let equipBonuses: EquipBonuses | undefined;
  if (Object.prototype.hasOwnProperty.call(o, "equipBonuses")) {
    if (o.equipBonuses === null) {
      equipBonuses = undefined;
    } else {
      equipBonuses = sanitizeEquipBonuses(o.equipBonuses);
    }
  } else {
    equipBonuses = prev?.equipBonuses;
  }

  let inventoryBonusSlots: number | undefined;
  if (slot === "backpack") {
    if (Object.prototype.hasOwnProperty.call(o, "inventoryBonusSlots")) {
      if (o.inventoryBonusSlots === null) {
        inventoryBonusSlots = undefined;
      } else {
        inventoryBonusSlots = sanitizeInventoryBonusSlots(
          o.inventoryBonusSlots
        );
      }
    } else {
      inventoryBonusSlots = prev?.inventoryBonusSlots;
    }
  } else {
    inventoryBonusSlots = undefined;
  }

  let rarity: ItemRarity | undefined;
  if (
    slot !== "unknown" &&
    isWeaponOrArmorSlot(slot as ItemSlot)
  ) {
    if (Object.prototype.hasOwnProperty.call(o, "rarity")) {
      if (o.rarity === null || o.rarity === undefined) {
        rarity = undefined;
      } else if (
        typeof o.rarity === "string" &&
        RARITY_ID_SET.has(o.rarity)
      ) {
        rarity = o.rarity as ItemRarity;
      } else {
        rarity = prev?.rarity;
      }
    } else {
      rarity = prev?.rarity;
    }
  } else {
    rarity = undefined;
  }

  const e: Entry = { frameKey, id, name, slot };
  if (tags && tags.length > 0) e.tags = tags;
  if (notes && notes.trim().length > 0) e.notes = notes;
  if (consumableFx && Object.keys(consumableFx).length > 0) {
    e.consumableFx = consumableFx;
  }
  if (iconFrameKey) e.iconFrameKey = iconFrameKey;
  if (equipBonuses && Object.keys(equipBonuses).length > 0) {
    e.equipBonuses = equipBonuses;
  }
  if (
    slot === "backpack" &&
    inventoryBonusSlots !== undefined
  ) {
    e.inventoryBonusSlots = inventoryBonusSlots;
  }
  if (rarity !== undefined) {
    e.rarity = rarity;
  }
  return e;
}

export async function GET() {
  if (!isDev()) return new NextResponse("Not found", { status: 404 });
  try {
    const data = await readMapping();
    return NextResponse.json(data, {
      headers: { "cache-control": "no-store" },
    });
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message },
      { status: 500 }
    );
  }
}

/**
 * PUT: частичное обновление.
 * Тело: { updates: Array<Partial<Entry> & { frameKey: string }> }
 * Все записи с известным frameKey мержатся поверх существующих, остальные пропускаются.
 */
export async function PUT(req: Request) {
  if (!isDev()) return new NextResponse("Not found", { status: 404 });
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Bad JSON" }, { status: 400 });
  }
  const updates =
    typeof body === "object" && body !== null
      ? (body as { updates?: unknown }).updates
      : undefined;
  if (!Array.isArray(updates)) {
    return NextResponse.json(
      { error: "Body must be { updates: [...] }" },
      { status: 400 }
    );
  }

  let current: MappingFile;
  try {
    current = await readMapping();
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message },
      { status: 500 }
    );
  }

  const byFrame = new Map(current.items.map((e) => [e.frameKey, e]));
  let touched = 0;
  for (const upd of updates) {
    if (typeof upd !== "object" || upd === null) continue;
    const frameKey = (upd as { frameKey?: unknown }).frameKey;
    if (typeof frameKey !== "string") continue;
    const prev = byFrame.get(frameKey);
    if (!prev) continue;
    const next = sanitizeEntry({ ...prev, ...upd }, prev);
    if (!next) continue;
    byFrame.set(frameKey, next);
    touched++;
  }

  const merged: MappingFile = {
    $schema: current.$schema,
    updatedAt: new Date().toISOString(),
    items: current.items.map((e) => byFrame.get(e.frameKey) ?? e),
  };

  await fs.writeFile(
    MAPPING_PATH,
    JSON.stringify(merged, null, 2) + "\n",
    "utf8"
  );

  return NextResponse.json({ ok: true, touched, total: merged.items.length });
}

/**
 * DELETE: удалить строки каталога по `frameKey`.
 * Тело: { frameKeys: string[] }
 */
export async function DELETE(req: Request) {
  if (!isDev()) return new NextResponse("Not found", { status: 404 });
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Bad JSON" }, { status: 400 });
  }
  const frameKeys =
    typeof body === "object" && body !== null
      ? (body as { frameKeys?: unknown }).frameKeys
      : undefined;
  if (!Array.isArray(frameKeys)) {
    return NextResponse.json(
      { error: "Body must be { frameKeys: string[] }" },
      { status: 400 }
    );
  }
  const drop = new Set<string>();
  for (const k of frameKeys) {
    if (typeof k === "string" && k.trim().length > 0) drop.add(k.trim());
  }
  if (drop.size === 0) {
    return NextResponse.json(
      { error: "frameKeys must contain at least one non-empty string" },
      { status: 400 }
    );
  }

  let current: MappingFile;
  try {
    current = await readMapping();
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message },
      { status: 500 }
    );
  }

  const before = current.items.length;
  const nextItems = current.items.filter((e) => !drop.has(e.frameKey));
  const removed = before - nextItems.length;

  const merged: MappingFile = {
    $schema: current.$schema,
    updatedAt: new Date().toISOString(),
    items: nextItems,
  };

  await fs.writeFile(
    MAPPING_PATH,
    JSON.stringify(merged, null, 2) + "\n",
    "utf8"
  );

  return NextResponse.json({
    ok: true,
    removed,
    total: merged.items.length,
    requested: drop.size,
  });
}
