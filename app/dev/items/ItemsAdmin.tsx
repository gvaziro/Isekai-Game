"use client";

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
} from "react";
import {
  BASE_INVENTORY_SLOTS,
  MAX_BACKPACK_BONUS_SLOTS,
} from "@/src/game/constants/gameplay";
import type { BuffId, ConsumableFx } from "@/src/game/data/balance";
import {
  ITEM_RARITY_IDS,
  ITEM_RARITY_LABEL_RU,
  type ItemRarity,
  isWeaponOrArmorSlot,
  itemRarityNameClass,
} from "@/src/game/data/itemRarity";
import type { ItemSlot } from "@/src/game/data/items.curated";
import {
  BUFFS,
  CONSUMABLE_EFFECTS,
  ITEM_EQUIP_BONUSES,
} from "@/src/game/data/balance";
import type { EquipBonuses } from "@/src/game/data/items.curated";

type Slot =
  | "weapon"
  | "offhand"
  | "helmet"
  | "chest"
  | "pants"
  | "boots"
  | "consumable"
  | "active_item"
  | "fish"
  | "loot"
  | "material"
  | "quest"
  | "pickaxe"
  | "axe"
  | "fishing_rod"
  | "backpack"
  | "unknown";

type Entry = {
  frameKey: string;
  id: string;
  name: string;
  slot: Slot;
  tags?: string[];
  notes?: string;
  /** Локальные переопределения; пусто = только balance.CONSUMABLE_EFFECTS[id] */
  consumableFx?: ConsumableFx;
  /** Показывать иконку из другого кадра атласа (как в игре) */
  iconFrameKey?: string;
  /** Переопределение бонусов экипировки; сливается с ITEM_EQUIP_BONUSES[id] */
  equipBonuses?: EquipBonuses;
  /** Только slot backpack — дополнительные ячейки инвентаря при экипировке */
  inventoryBonusSlots?: number;
  /** Оружие и броня: редкость */
  rarity?: ItemRarity;
};

type MappingFile = {
  updatedAt?: string;
  items: Entry[];
};

const SLOTS: readonly Slot[] = [
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
];

const SLOT_LABEL: Record<Slot, string> = {
  unknown: "не размечен",
  weapon: "Оружие",
  offhand: "Левая рука",
  helmet: "Шлем",
  chest: "Нагрудник",
  pants: "Штаны",
  boots: "Обувь",
  consumable: "Расходник",
  active_item: "Активный предмет",
  fish: "Рыба",
  loot: "Лут",
  material: "Материал",
  quest: "Квест",
  pickaxe: "Кирка",
  axe: "Топор",
  fishing_rod: "Удочка",
  backpack: "Рюкзак",
};

const SLOT_COLOR: Record<Slot, string> = {
  unknown: "bg-zinc-800 text-zinc-400 ring-zinc-700",
  weapon: "bg-red-950/70 text-red-200 ring-red-700/70",
  offhand: "bg-orange-950/70 text-orange-200 ring-orange-700/70",
  helmet: "bg-amber-950/70 text-amber-200 ring-amber-700/70",
  chest: "bg-yellow-950/70 text-yellow-200 ring-yellow-700/70",
  pants: "bg-teal-950/70 text-teal-200 ring-teal-700/70",
  boots: "bg-lime-950/70 text-lime-200 ring-lime-700/70",
  consumable: "bg-emerald-950/70 text-emerald-200 ring-emerald-700/70",
  active_item: "bg-indigo-950/70 text-indigo-200 ring-indigo-700/70",
  fish: "bg-blue-950/70 text-blue-200 ring-blue-700/70",
  loot: "bg-rose-950/70 text-rose-200 ring-rose-700/70",
  material: "bg-sky-950/70 text-sky-200 ring-sky-700/70",
  quest: "bg-violet-950/70 text-violet-200 ring-violet-700/70",
  pickaxe: "bg-stone-950/70 text-stone-200 ring-stone-700/70",
  axe: "bg-amber-950/70 text-amber-200 ring-amber-800/70",
  fishing_rod: "bg-cyan-950/70 text-cyan-200 ring-cyan-700/70",
  backpack: "bg-purple-950/70 text-purple-100 ring-purple-700/70",
};

const EQUIP_SLOTS: readonly Slot[] = [
  "weapon",
  "offhand",
  "helmet",
  "chest",
  "pants",
  "boots",
];

function isEquipSlot(s: Slot): boolean {
  return (EQUIP_SLOTS as readonly string[]).includes(s);
}

/** Слоты, в которых в каталоге допустим `consumableFx` (как в игре: расходник / активный предмет). */
function slotKeepsConsumableFx(s: Slot): boolean {
  return s === "consumable" || s === "active_item";
}

const SLOT_BUTTON: Record<Slot, string> = {
  unknown: "bg-zinc-800 hover:bg-zinc-700 text-zinc-200",
  weapon: "bg-red-700 hover:bg-red-600 text-white",
  offhand: "bg-orange-700 hover:bg-orange-600 text-white",
  helmet: "bg-amber-700 hover:bg-amber-600 text-white",
  chest: "bg-yellow-700 hover:bg-yellow-600 text-white",
  pants: "bg-teal-700 hover:bg-teal-600 text-white",
  boots: "bg-lime-700 hover:bg-lime-600 text-white",
  consumable: "bg-emerald-700 hover:bg-emerald-600 text-white",
  active_item: "bg-indigo-700 hover:bg-indigo-600 text-white",
  fish: "bg-blue-700 hover:bg-blue-600 text-white",
  loot: "bg-rose-700 hover:bg-rose-600 text-white",
  material: "bg-sky-700 hover:bg-sky-600 text-white",
  quest: "bg-violet-700 hover:bg-violet-600 text-white",
  pickaxe: "bg-stone-600 hover:bg-stone-500 text-white",
  axe: "bg-amber-700 hover:bg-amber-600 text-white",
  fishing_rod: "bg-cyan-700 hover:bg-cyan-600 text-white",
  backpack: "bg-purple-700 hover:bg-purple-600 text-white",
};

type SortMode = "frameKey" | "slot_name" | "unknown_first";

const GRID_CELL_MIN_KEY = "last-summon-items-admin-grid-cell-min";
const GRID_CELL_MIN_DEFAULT = 108;
const GRID_CELL_MIN_LO = 64;
const GRID_CELL_MIN_HI = 280;

function readStoredGridCellMin(): number {
  if (typeof window === "undefined") return GRID_CELL_MIN_DEFAULT;
  const raw = localStorage.getItem(GRID_CELL_MIN_KEY);
  const n = raw === null ? NaN : Number(raw);
  if (!Number.isFinite(n)) return GRID_CELL_MIN_DEFAULT;
  return Math.min(GRID_CELL_MIN_HI, Math.max(GRID_CELL_MIN_LO, Math.round(n)));
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/ё/g, "e")
    .replace(/[^a-z0-9\s_-]+/g, "")
    .trim()
    .replace(/\s+/g, "_")
    .slice(0, 48);
}

function naturalKey(s: string): [string, number] {
  const m = /^(\D*)(\d+)?/.exec(s);
  if (!m) return [s, 0];
  return [m[1] ?? "", m[2] ? Number(m[2]) : 0];
}

/** Кадр PNG для превью в игре и в админке */
function effectiveIconFrame(entry: Entry): string {
  const o = entry.iconFrameKey?.trim();
  return o && o.length > 0 ? o : entry.frameKey;
}

/**
 * Режим ввода: хоткеи каталога не должны перехватывать клавиши.
 * Учитываем и `document.activeElement`, и `KeyboardEvent.target` — в редких
 * случаях (ретаргетинг, порталы) они могут расходиться.
 */
function isTypingContext(e?: KeyboardEvent): boolean {
  const fromEvent =
    e?.target instanceof HTMLElement ? (e.target as HTMLElement) : null;
  const fromFocus =
    document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
  const seen = new Set<HTMLElement>();
  for (const el of [fromEvent, fromFocus]) {
    if (!el || seen.has(el)) continue;
    seen.add(el);
    if (el.closest("[data-catalog-no-hotkeys]")) return true;
    const tag = el.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
    if (el.isContentEditable) return true;
  }
  return false;
}

function applyPartialEntry(base: Entry, p: Partial<Entry>, frameKey: string): Entry {
  const merged: Entry = { ...base, ...p, frameKey };
  if (Object.prototype.hasOwnProperty.call(p, "consumableFx")) {
    if (p.consumableFx === undefined) {
      delete merged.consumableFx;
    } else {
      merged.consumableFx = p.consumableFx;
    }
  }
  if (
    Object.prototype.hasOwnProperty.call(p, "slot") &&
    p.slot !== undefined &&
    !slotKeepsConsumableFx(p.slot)
  ) {
    delete merged.consumableFx;
  }
  if (Object.prototype.hasOwnProperty.call(p, "iconFrameKey")) {
    if (p.iconFrameKey === undefined || p.iconFrameKey === "") {
      delete merged.iconFrameKey;
    } else {
      const t = p.iconFrameKey.trim();
      if (!t || t === frameKey) {
        delete merged.iconFrameKey;
      } else {
        merged.iconFrameKey = t;
      }
    }
  }
  if (Object.prototype.hasOwnProperty.call(p, "equipBonuses")) {
    if (
      p.equipBonuses === undefined ||
      (p.equipBonuses && Object.keys(p.equipBonuses).length === 0)
    ) {
      delete merged.equipBonuses;
    } else {
      merged.equipBonuses = p.equipBonuses;
    }
  }
  if (
    Object.prototype.hasOwnProperty.call(p, "slot") &&
    p.slot !== undefined &&
    !isEquipSlot(p.slot)
  ) {
    delete merged.equipBonuses;
  }
  if (
    Object.prototype.hasOwnProperty.call(p, "slot") &&
    p.slot !== undefined &&
    p.slot !== "backpack"
  ) {
    delete merged.inventoryBonusSlots;
  }
  if (Object.prototype.hasOwnProperty.call(p, "inventoryBonusSlots")) {
    if (p.inventoryBonusSlots === undefined) {
      delete merged.inventoryBonusSlots;
    } else {
      const n = Math.floor(Number(p.inventoryBonusSlots));
      if (!Number.isFinite(n) || n < 0) {
        merged.inventoryBonusSlots = 0;
      } else {
        merged.inventoryBonusSlots = Math.min(MAX_BACKPACK_BONUS_SLOTS, n);
      }
    }
  }
  if (Object.prototype.hasOwnProperty.call(p, "rarity")) {
    if (p.rarity === undefined) {
      delete merged.rarity;
    } else {
      merged.rarity = p.rarity;
    }
  }
  if (
    merged.slot === "unknown" ||
    !isWeaponOrArmorSlot(merged.slot as ItemSlot)
  ) {
    delete merged.rarity;
  }
  return merged;
}

export default function ItemsAdmin() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [dirty, setDirty] = useState<Map<string, Entry>>(new Map());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | undefined>();

  const [query, setQuery] = useState("");
  const [slotFilter, setSlotFilter] = useState<"all" | Slot>("all");
  const [onlyUnknown, setOnlyUnknown] = useState(false);
  const [pageSize, setPageSize] = useState(400);
  const [page, setPage] = useState(0);
  const [sortMode, setSortMode] = useState<SortMode>("frameKey");

  const [selection, setSelection] = useState<Set<string>>(new Set());
  const [anchorKey, setAnchorKey] = useState<string | null>(null);
  const [focusKey, setFocusKey] = useState<string | null>(null);

  const [renameOpen, setRenameOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [gridCellMin, setGridCellMin] = useState(GRID_CELL_MIN_DEFAULT);

  useEffect(() => {
    setGridCellMin(readStoredGridCellMin());
  }, []);

  const setGridCellMinPersist = useCallback((next: number) => {
    const v = Math.min(
      GRID_CELL_MIN_HI,
      Math.max(GRID_CELL_MIN_LO, Math.round(next))
    );
    setGridCellMin(v);
    if (typeof window !== "undefined") {
      localStorage.setItem(GRID_CELL_MIN_KEY, String(v));
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/dev/items-mapping", {
          cache: "no-store",
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as MappingFile;
        if (cancelled) return;
        setEntries(data.items);
        setUpdatedAt(data.updatedAt);
        setLoading(false);
      } catch (e) {
        if (cancelled) return;
        setError((e as Error).message);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const originalRef = useRef<Map<string, Entry>>(new Map());
  useEffect(() => {
    originalRef.current = new Map(entries.map((e) => [e.frameKey, e]));
  }, [entries]);

  const mergedList = useMemo<Entry[]>(
    () => entries.map((e) => dirty.get(e.frameKey) ?? e),
    [entries, dirty]
  );

  const totals = useMemo(() => {
    let classified = 0;
    const counts: Record<Slot, number> = {
      unknown: 0,
      weapon: 0,
      offhand: 0,
      helmet: 0,
      chest: 0,
      pants: 0,
      boots: 0,
      consumable: 0,
      active_item: 0,
      fish: 0,
      loot: 0,
      material: 0,
      quest: 0,
      pickaxe: 0,
      axe: 0,
      fishing_rod: 0,
      backpack: 0,
    };
    for (const e of mergedList) {
      counts[e.slot]++;
      if (e.slot !== "unknown" && e.name.trim()) classified++;
    }
    return { total: mergedList.length, classified, counts };
  }, [mergedList]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let out = mergedList.filter((e) => {
      if (onlyUnknown && e.slot !== "unknown") return false;
      if (slotFilter !== "all" && e.slot !== slotFilter) return false;
      if (!q) return true;
      return (
        e.frameKey.toLowerCase().includes(q) ||
        e.id.toLowerCase().includes(q) ||
        e.name.toLowerCase().includes(q)
      );
    });
    const slotOrder: Record<Slot, number> = {
      unknown: 99,
      weapon: 0,
      offhand: 1,
      helmet: 2,
      chest: 3,
      pants: 4,
      boots: 5,
      backpack: 6,
      consumable: 7,
      active_item: 8,
      fish: 9,
      loot: 10,
      material: 11,
      quest: 12,
      pickaxe: 13,
      axe: 14,
      fishing_rod: 15,
    };
    if (sortMode === "slot_name") {
      out = [...out].sort((a, b) => {
        const s = slotOrder[a.slot] - slotOrder[b.slot];
        if (s !== 0) return s;
        return (a.name || a.frameKey).localeCompare(b.name || b.frameKey, "ru");
      });
    } else if (sortMode === "unknown_first") {
      out = [...out].sort((a, b) => {
        const au = a.slot === "unknown" ? 0 : 1;
        const bu = b.slot === "unknown" ? 0 : 1;
        if (au !== bu) return au - bu;
        const [aa, an] = naturalKey(a.frameKey);
        const [ba, bn] = naturalKey(b.frameKey);
        if (aa !== ba) return aa.localeCompare(ba);
        return an - bn;
      });
    } else {
      out = [...out].sort((a, b) => {
        const [aa, an] = naturalKey(a.frameKey);
        const [ba, bn] = naturalKey(b.frameKey);
        if (aa !== ba) return aa.localeCompare(ba);
        return an - bn;
      });
    }
    return out;
  }, [mergedList, query, slotFilter, onlyUnknown, sortMode]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, pageCount - 1);
  const pageItems = filtered.slice(
    safePage * pageSize,
    safePage * pageSize + pageSize
  );

  // ---------- мутации ----------
  const patchOne = useCallback((frameKey: string, p: Partial<Entry>) => {
    setDirty((prev) => {
      const next = new Map(prev);
      const base =
        next.get(frameKey) ?? originalRef.current.get(frameKey);
      if (!base) return prev;
      const merged = applyPartialEntry(base, p, frameKey);
      const orig = originalRef.current.get(frameKey);
      if (orig && entriesEqual(orig, merged)) {
        next.delete(frameKey);
      } else {
        next.set(frameKey, merged);
      }
      return next;
    });
  }, []);

  const patchMany = useCallback(
    (keys: Iterable<string>, p: Partial<Entry>) => {
      setDirty((prev) => {
        const next = new Map(prev);
        for (const k of keys) {
          const base = next.get(k) ?? originalRef.current.get(k);
          if (!base) continue;
          const merged = applyPartialEntry(base, p, k);
          const orig = originalRef.current.get(k);
          if (orig && entriesEqual(orig, merged)) {
            next.delete(k);
          } else {
            next.set(k, merged);
          }
        }
        return next;
      });
    },
    []
  );

  const save = useCallback(async () => {
    if (dirty.size === 0) return;
    setSaving(true);
    setError(null);
    try {
      const updates = Array.from(dirty.values()).map((u) => {
        const orig = originalRef.current.get(u.frameKey);
        const prevIcon = orig?.iconFrameKey?.trim() ?? "";
        const nextIcon = u.iconFrameKey?.trim() ?? "";
        const iconChanged = prevIcon !== nextIcon;
        const prevEb = JSON.stringify(orig?.equipBonuses ?? null);
        const nextEb = JSON.stringify(u.equipBonuses ?? null);
        const equipChanged = prevEb !== nextEb;
        if (!iconChanged && !equipChanged) return u;
        return {
          ...u,
          ...(iconChanged
            ? { iconFrameKey: nextIcon.length > 0 ? nextIcon : null }
            : {}),
          ...(equipChanged
            ? {
                equipBonuses:
                  u.equipBonuses && Object.keys(u.equipBonuses).length > 0
                    ? u.equipBonuses
                    : null,
              }
            : {}),
        } as Entry & {
          iconFrameKey?: string | null;
          equipBonuses?: EquipBonuses | null;
        };
      });
      const res = await fetch("/api/dev/items-mapping", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ updates }),
      });
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(`HTTP ${res.status}: ${txt}`);
      }
      setEntries((prev) => prev.map((e) => dirty.get(e.frameKey) ?? e));
      setDirty(new Map());
      setUpdatedAt(new Date().toISOString());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }, [dirty]);

  const discard = useCallback(() => {
    if (dirty.size === 0) return;
    if (!confirm(`Отбросить несохранённые правки (${dirty.size})?`)) return;
    setDirty(new Map());
  }, [dirty]);

  const removeFromCatalog = useCallback(async (frameKeys: string[]) => {
    const uniq = [...new Set(frameKeys.map((k) => k.trim()).filter(Boolean))];
    if (uniq.length === 0) return;
    const preview =
      uniq.length <= 3
        ? uniq.join(", ")
        : `${uniq.slice(0, 3).join(", ")}… (+${uniq.length - 3})`;
    const ok = confirm(
      uniq.length === 1
        ? `Удалить запись «${uniq[0]}» из items.mapping.json? Она исчезнет из каталога; для игры может понадобиться пересборка (gen-items).`
        : `Удалить ${uniq.length} записей из items.mapping.json (${preview})? Для игры может понадобиться пересборка (gen-items).`
    );
    if (!ok) return;
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch("/api/dev/items-mapping", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ frameKeys: uniq }),
      });
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(`HTTP ${res.status}: ${txt}`);
      }
      const drop = new Set(uniq);
      setEntries((prev) => prev.filter((e) => !drop.has(e.frameKey)));
      setDirty((prev) => {
        if (prev.size === 0) return prev;
        const next = new Map(prev);
        for (const k of drop) next.delete(k);
        return next;
      });
      setSelection((prev) => {
        if (prev.size === 0) return prev;
        const next = new Set(prev);
        for (const k of drop) next.delete(k);
        return next;
      });
      setFocusKey((fk) => (fk && drop.has(fk) ? null : fk));
      setUpdatedAt(new Date().toISOString());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setDeleting(false);
    }
  }, []);

  // ---------- выделение ----------
  const filteredKeys = useMemo(
    () => filtered.map((e) => e.frameKey),
    [filtered]
  );

  const handleTileActivate = useCallback(
    (
      frameKey: string,
      mod: { shiftKey: boolean; ctrlKey: boolean; metaKey: boolean }
    ) => {
      setFocusKey(frameKey);
      if (mod.shiftKey && anchorKey) {
        const a = filteredKeys.indexOf(anchorKey);
        const b = filteredKeys.indexOf(frameKey);
        if (a !== -1 && b !== -1) {
          const [lo, hi] = a < b ? [a, b] : [b, a];
          const range = filteredKeys.slice(lo, hi + 1);
          setSelection((prev) => {
            const next = mod.ctrlKey || mod.metaKey ? new Set(prev) : new Set<string>();
            for (const k of range) next.add(k);
            return next;
          });
          return;
        }
      }
      if (mod.ctrlKey || mod.metaKey) {
        setSelection((prev) => {
          const next = new Set(prev);
          if (next.has(frameKey)) next.delete(frameKey);
          else next.add(frameKey);
          return next;
        });
        setAnchorKey(frameKey);
        return;
      }
      setSelection(new Set([frameKey]));
      setAnchorKey(frameKey);
    },
    [anchorKey, filteredKeys]
  );

  const selectAllVisible = useCallback(() => {
    setSelection(new Set(filteredKeys));
    if (filteredKeys.length > 0) {
      setAnchorKey(filteredKeys[0]);
      setFocusKey(filteredKeys[0]);
    }
  }, [filteredKeys]);

  const clearSelection = useCallback(() => {
    setSelection(new Set());
    setAnchorKey(null);
  }, []);

  // хоткеи
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey) {
        if (e.key.toLowerCase() === "s") {
          e.preventDefault();
          void save();
          return;
        }
        if (e.key.toLowerCase() === "a" && !isTypingContext(e)) {
          e.preventDefault();
          selectAllVisible();
          return;
        }
      }
      if (isTypingContext(e)) return;
      if (e.key === "Escape") {
        clearSelection();
        return;
      }
      if (/^[0-9]$/.test(e.key) && selection.size > 0) {
        const idx = e.key === "0" ? SLOTS.indexOf("unknown") : Number(e.key) - 1;
        const slot = SLOTS[idx];
        if (slot) {
          patchMany(selection, { slot });
        }
        return;
      }
      if (e.key === "Delete" && e.shiftKey && selection.size > 0) {
        e.preventDefault();
        void removeFromCatalog(Array.from(selection));
        return;
      }
      if (e.key === "Delete" && !e.shiftKey && selection.size > 0) {
        if (confirm(`Очистить имена у ${selection.size} шт.?`)) {
          patchMany(selection, { name: "" });
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    save,
    selectAllVisible,
    clearSelection,
    selection,
    patchMany,
    removeFromCatalog,
  ]);

  if (loading) {
    return <p className="text-sm text-zinc-300">Загрузка маппинга…</p>;
  }

  const mergedByKey = new Map(mergedList.map((e) => [e.frameKey, e]));
  const selectedEntries = Array.from(selection)
    .map((k) => mergedByKey.get(k))
    .filter((x): x is Entry => Boolean(x));

  return (
    <div className="flex flex-col gap-3">
      {/* Sticky header */}
      <header className="sticky top-0 z-20 -mx-3 flex flex-col gap-2 bg-zinc-950/85 px-3 py-2 backdrop-blur sm:-mx-4 sm:px-4">
        <div className="flex flex-wrap items-baseline gap-3">
          <h1 className="text-xl font-semibold">Каталог иконок предметов</h1>
          <span className="text-sm text-zinc-300">
            размечено{" "}
            <b className="text-emerald-400">{totals.classified}</b> / {totals.total}
          </span>
          {updatedAt ? (
            <span className="text-xs text-zinc-500">
              сохранено: {new Date(updatedAt).toLocaleString()}
            </span>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900/60 p-2">
          <input
            type="search"
            placeholder="Поиск по frameKey / id / имени…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(0);
            }}
            className="min-w-[220px] flex-1 rounded bg-zinc-950 px-3 py-1.5 text-sm text-zinc-100 outline-none ring-1 ring-zinc-800 focus:ring-emerald-600"
          />
          <select
            value={slotFilter}
            onChange={(e) => {
              setSlotFilter(e.target.value as "all" | Slot);
              setPage(0);
            }}
            className="rounded bg-zinc-950 px-2 py-1.5 text-sm text-zinc-100 ring-1 ring-zinc-800"
          >
            <option value="all">Все слоты ({totals.total})</option>
            {SLOTS.map((s) => (
              <option key={s} value={s}>
                {SLOT_LABEL[s]} ({totals.counts[s]})
              </option>
            ))}
          </select>
          <select
            value={sortMode}
            onChange={(e) => setSortMode(e.target.value as SortMode)}
            className="rounded bg-zinc-950 px-2 py-1.5 text-sm text-zinc-100 ring-1 ring-zinc-800"
            title="Сортировка"
          >
            <option value="frameKey">по frameKey</option>
            <option value="slot_name">по слоту и имени</option>
            <option value="unknown_first">unknown сверху</option>
          </select>
          <label className="flex items-center gap-1.5 rounded bg-zinc-950 px-2 py-1.5 text-sm text-zinc-200 ring-1 ring-zinc-800">
            <input
              type="checkbox"
              checked={onlyUnknown}
              onChange={(e) => {
                setOnlyUnknown(e.target.checked);
                setPage(0);
              }}
            />
            только unknown
          </label>
          <select
            value={pageSize}
            onChange={(e) => {
              setPageSize(Number(e.target.value));
              setPage(0);
            }}
            className="rounded bg-zinc-950 px-2 py-1.5 text-sm text-zinc-100 ring-1 ring-zinc-800"
          >
            {[200, 400, 800, 2000].map((n) => (
              <option key={n} value={n}>
                по {n}
              </option>
            ))}
          </select>

          <label
            className="flex min-w-[200px] max-w-[min(100%,320px)] flex-1 items-center gap-2 rounded bg-zinc-950 px-2 py-1.5 text-xs text-zinc-300 ring-1 ring-zinc-800"
            title="Минимальная ширина ячейки сетки (крупнее — лучше видно пиксели)"
          >
            <span className="shrink-0 whitespace-nowrap">Сетка</span>
            <input
              type="range"
              min={GRID_CELL_MIN_LO}
              max={GRID_CELL_MIN_HI}
              step={4}
              value={gridCellMin}
              onChange={(e) => setGridCellMinPersist(Number(e.target.value))}
              className="h-2 min-w-0 flex-1 cursor-pointer accent-emerald-500"
            />
            <span className="w-9 shrink-0 tabular-nums text-zinc-400">
              {gridCellMin}px
            </span>
          </label>

          <div className="ml-auto flex items-center gap-2">
            <span className="text-xs text-zinc-400">
              правок: <b className="text-amber-300">{dirty.size}</b>
            </span>
            <button
              type="button"
              onClick={discard}
              disabled={dirty.size === 0 || saving}
              className="rounded bg-zinc-800 px-3 py-1.5 text-sm text-zinc-100 hover:bg-zinc-700 disabled:opacity-40"
            >
              Отбросить
            </button>
            <button
              type="button"
              onClick={save}
              disabled={dirty.size === 0 || saving || deleting}
              className="rounded bg-emerald-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-40"
              title="Ctrl/Cmd + S"
            >
              {saving ? "Сохраняем…" : `Сохранить${dirty.size ? ` (${dirty.size})` : ""}`}
            </button>
          </div>
        </div>

        {error ? (
          <div className="rounded border border-red-700 bg-red-950/60 px-3 py-2 text-sm text-red-200">
            Ошибка: {error}
          </div>
        ) : null}

        {selection.size > 0 ? (
          <BulkBar
            count={selection.size}
            onClear={clearSelection}
            onSetSlot={(slot) => patchMany(selection, { slot })}
            onOpenRename={() => setRenameOpen(true)}
            onClearNames={() => {
              if (confirm(`Очистить имена у ${selection.size} шт.?`))
                patchMany(selection, { name: "" });
            }}
            onClearNotes={() => {
              if (confirm(`Очистить заметки у ${selection.size} шт.?`))
                patchMany(selection, { notes: "" });
            }}
            onDeleteFromCatalog={() =>
              void removeFromCatalog(Array.from(selection))
            }
            deleting={deleting}
          />
        ) : null}
      </header>

      {/* Body */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_360px]">
        <div className="flex flex-col gap-2">
          <nav className="flex items-center gap-2 text-sm text-zinc-300">
            <button
              type="button"
              className="rounded bg-zinc-800 px-2 py-1 hover:bg-zinc-700 disabled:opacity-40"
              disabled={safePage === 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
            >
              ←
            </button>
            <span>
              стр. {safePage + 1} / {pageCount} · найдено {filtered.length}
              {selection.size > 0 ? (
                <>
                  {" "}
                  · выделено{" "}
                  <b className="text-emerald-400">{selection.size}</b>
                </>
              ) : null}
            </span>
            <button
              type="button"
              className="rounded bg-zinc-800 px-2 py-1 hover:bg-zinc-700 disabled:opacity-40"
              disabled={safePage >= pageCount - 1}
              onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
            >
              →
            </button>
          </nav>

          <div
            className="grid gap-1.5"
            style={{
              gridTemplateColumns: `repeat(auto-fill, minmax(${gridCellMin}px, 1fr))`,
            }}
          >
            {pageItems.map((e) => (
              <ItemTile
                key={e.frameKey}
                entry={e}
                isDirty={dirty.has(e.frameKey)}
                isSelected={selection.has(e.frameKey)}
                isFocused={focusKey === e.frameKey}
                onActivate={(ev) =>
                  handleTileActivate(e.frameKey, {
                    shiftKey: ev.shiftKey,
                    ctrlKey: ev.ctrlKey,
                    metaKey: ev.metaKey,
                  })
                }
                onRemove={() => void removeFromCatalog([e.frameKey])}
                removeDisabled={deleting}
              />
            ))}
            {pageItems.length === 0 ? (
              <p className="col-span-full py-8 text-center text-sm text-zinc-400">
                Ничего не найдено.
              </p>
            ) : null}
          </div>
        </div>

        <aside className="lg:sticky lg:top-[150px] lg:self-start">
          <SidePanel
            selected={selectedEntries}
            focusKey={focusKey}
            catalogEntries={mergedList}
            gridCellMin={gridCellMin}
            onPatchOne={patchOne}
            onPatchMany={(p) => patchMany(selection, p)}
            onClearSelection={clearSelection}
          />
        </aside>
      </div>

      {renameOpen ? (
        <RenameModal
          count={selection.size}
          onCancel={() => setRenameOpen(false)}
          onApply={(pattern, start) => {
            const keys = Array.from(selection);
            setDirty((prev) => {
              const next = new Map(prev);
              keys.forEach((k, idx) => {
                const base = next.get(k) ?? originalRef.current.get(k);
                if (!base) return;
                const i = start + idx;
                const name = pattern.replace(/\{i\}/g, String(i));
                const id =
                  !base.id || base.id === base.frameKey
                    ? slugify(name) || base.frameKey
                    : base.id;
                const merged: Entry = { ...base, name, id, frameKey: k };
                const orig = originalRef.current.get(k);
                if (orig && entriesEqual(orig, merged)) next.delete(k);
                else next.set(k, merged);
              });
              return next;
            });
            setRenameOpen(false);
          }}
        />
      ) : null}
    </div>
  );
}

function entriesEqual(a: Entry, b: Entry): boolean {
  if (a.frameKey !== b.frameKey) return false;
  if (a.id !== b.id) return false;
  if (a.name !== b.name) return false;
  if (a.slot !== b.slot) return false;
  if ((a.notes ?? "") !== (b.notes ?? "")) return false;
  const at = (a.tags ?? []).join(",");
  const bt = (b.tags ?? []).join(",");
  if (at !== bt) return false;
  if (JSON.stringify(a.consumableFx ?? null) !== JSON.stringify(b.consumableFx ?? null)) {
    return false;
  }
  if ((a.iconFrameKey ?? "") !== (b.iconFrameKey ?? "")) {
    return false;
  }
  if (JSON.stringify(a.equipBonuses ?? null) !== JSON.stringify(b.equipBonuses ?? null)) {
    return false;
  }
  if ((a.inventoryBonusSlots ?? -1) !== (b.inventoryBonusSlots ?? -1)) {
    return false;
  }
  const ra = a.rarity ?? "common";
  const rb = b.rarity ?? "common";
  if (ra !== rb) return false;
  return true;
}

function ItemTile({
  entry,
  isDirty,
  isSelected,
  isFocused,
  onActivate,
  onRemove,
  removeDisabled,
}: {
  entry: Entry;
  isDirty: boolean;
  isSelected: boolean;
  isFocused: boolean;
  onActivate: (e: ReactMouseEvent<HTMLDivElement> | ReactKeyboardEvent<HTMLDivElement>) => void;
  onRemove: () => void;
  removeDisabled: boolean;
}) {
  const label = entry.name.trim() || entry.frameKey;
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={(e) => onActivate(e)}
      onKeyDown={(e) => {
        if (e.key !== "Enter" && e.key !== " ") return;
        // Не глотать Space/Enter с вложенной кнопки «✕» — иначе ломается
        // стандартная активация и может мешать вводу при странном фокусе.
        if (e.target !== e.currentTarget) return;
        e.preventDefault();
        onActivate(e);
      }}
      className={[
        "group relative flex cursor-pointer select-none flex-col items-stretch overflow-hidden rounded-md border text-left transition outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/80",
        isSelected
          ? "border-emerald-400 bg-emerald-500/10 ring-2 ring-emerald-400"
          : isFocused
            ? "border-zinc-600 bg-zinc-900/80"
            : "border-zinc-800 bg-zinc-900/40 hover:border-zinc-600 hover:bg-zinc-900/70",
        entry.slot === "unknown" ? "opacity-80" : "",
      ].join(" ")}
      title={`${entry.frameKey} · ${SLOT_LABEL[entry.slot]}${entry.id ? ` · ${entry.id}` : ""}`}
    >
      {isDirty ? (
        <span
          aria-hidden
          className="absolute right-1 top-1 z-[1] h-2 w-2 rounded-full bg-amber-400 shadow"
        />
      ) : null}
      <button
        type="button"
        title="Удалить из каталога (items.mapping.json)"
        disabled={removeDisabled}
        onClick={(ev) => {
          ev.stopPropagation();
          onRemove();
        }}
        className="absolute bottom-1 right-1 z-[2] rounded bg-red-900/90 px-1 py-0.5 text-[9px] font-medium text-red-100 opacity-0 shadow ring-1 ring-red-700/80 transition-opacity hover:bg-red-800 group-hover:opacity-100 disabled:opacity-40"
      >
        ✕
      </button>
      <span
        className={`absolute left-1 top-1 z-[1] rounded px-1 py-0.5 text-[9px] font-medium uppercase leading-none tracking-wide ring-1 ${SLOT_COLOR[entry.slot]}`}
      >
        {SLOT_LABEL[entry.slot]}
      </span>
      <div className="relative aspect-square w-full min-w-0 bg-zinc-950">
        {entry.iconFrameKey?.trim() ? (
          <span
            className="absolute bottom-1 right-1 z-[1] rounded bg-indigo-600/90 px-1 py-0.5 text-[8px] font-medium text-white"
            title="Иконка переопределена"
          >
            ↗
          </span>
        ) : null}
        <div className="absolute inset-[8%] min-h-0 min-w-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`/assets/items/${effectiveIconFrame(entry)}.png`}
            alt={effectiveIconFrame(entry)}
            className="block h-full w-full object-contain object-center"
            style={{ imageRendering: "pixelated" }}
            loading="lazy"
            draggable={false}
          />
        </div>
      </div>
      <div className="flex flex-col px-1.5 py-1">
        <span className="truncate text-[11px] text-zinc-200">{label}</span>
        <span className="truncate font-mono text-[9px] text-zinc-500">
          {entry.frameKey}
        </span>
      </div>
    </div>
  );
}

function BulkBar({
  count,
  onClear,
  onSetSlot,
  onOpenRename,
  onClearNames,
  onClearNotes,
  onDeleteFromCatalog,
  deleting,
}: {
  count: number;
  onClear: () => void;
  onSetSlot: (s: Slot) => void;
  onOpenRename: () => void;
  onClearNames: () => void;
  onClearNotes: () => void;
  onDeleteFromCatalog: () => void;
  deleting: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-emerald-700/60 bg-emerald-950/30 p-2">
      <span className="text-sm text-emerald-200">
        Выделено: <b>{count}</b>
      </span>
      <button
        type="button"
        onClick={onClear}
        className="rounded bg-zinc-800 px-2 py-1 text-xs text-zinc-100 hover:bg-zinc-700"
        title="Esc"
      >
        снять
      </button>
      <span className="mx-1 h-5 w-px bg-zinc-700" />
      <span className="text-xs text-zinc-400">Назначить слот:</span>
      {SLOTS.map((s, i) => (
        <button
          key={s}
          type="button"
          onClick={() => onSetSlot(s)}
          className={`rounded px-2 py-1 text-xs font-medium ${SLOT_BUTTON[s]}`}
          title={`Хоткей: ${s === "unknown" ? "0" : i + 1}`}
        >
          {SLOT_LABEL[s]}
        </button>
      ))}
      <span className="mx-1 h-5 w-px bg-zinc-700" />
      <button
        type="button"
        onClick={onOpenRename}
        className="rounded bg-indigo-700 px-2 py-1 text-xs font-medium text-white hover:bg-indigo-600"
      >
        Переименовать по шаблону…
      </button>
      <button
        type="button"
        onClick={onClearNames}
        className="rounded bg-zinc-800 px-2 py-1 text-xs text-zinc-100 hover:bg-zinc-700"
      >
        Очистить имена
      </button>
      <button
        type="button"
        onClick={onClearNotes}
        className="rounded bg-zinc-800 px-2 py-1 text-xs text-zinc-100 hover:bg-zinc-700"
      >
        Очистить заметки
      </button>
      <span className="mx-1 h-5 w-px bg-zinc-700" />
      <button
        type="button"
        onClick={onDeleteFromCatalog}
        disabled={deleting}
        className="rounded bg-red-900/80 px-2 py-1 text-xs font-medium text-red-100 ring-1 ring-red-700/70 hover:bg-red-800 disabled:opacity-40"
        title="Удалить выделенные строки из items.mapping.json (Shift+Delete)"
      >
        {deleting ? "Удаляем…" : "Удалить из каталога"}
      </button>
    </div>
  );
}

function SidePanel({
  selected,
  focusKey,
  catalogEntries,
  gridCellMin,
  onPatchOne,
  onPatchMany,
  onClearSelection,
}: {
  selected: Entry[];
  focusKey: string | null;
  catalogEntries: Entry[];
  gridCellMin: number;
  onPatchOne: (frameKey: string, p: Partial<Entry>) => void;
  onPatchMany: (p: Partial<Entry>) => void;
  onClearSelection: () => void;
}) {
  if (selected.length === 0) {
    return (
      <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-3 text-sm text-zinc-300">
        <div className="mb-2 font-semibold text-zinc-100">Нет выделения</div>
        <p className="mb-2 text-zinc-400">
          Кликните по плитке, чтобы открыть редактор.
        </p>
        <ul className="space-y-1 text-xs text-zinc-400">
          <li>
            <kbd className="rounded bg-zinc-800 px-1">Shift</kbd>+клик —
            диапазон
          </li>
          <li>
            <kbd className="rounded bg-zinc-800 px-1">Ctrl/Cmd</kbd>+клик —
            toggle
          </li>
          <li>
            <kbd className="rounded bg-zinc-800 px-1">Ctrl/Cmd</kbd>+A —
            выделить видимое
          </li>
          <li>
            <kbd className="rounded bg-zinc-800 px-1">Esc</kbd> — снять
            выделение
          </li>
          <li>
            <kbd className="rounded bg-zinc-800 px-1">1..9</kbd> / <kbd className="rounded bg-zinc-800 px-1">0</kbd> — слот выделенным
          </li>
          <li>
            <kbd className="rounded bg-zinc-800 px-1">Del</kbd> — очистить
            имена
          </li>
          <li>
            <kbd className="rounded bg-zinc-800 px-1">Shift</kbd>+
            <kbd className="rounded bg-zinc-800 px-1">Del</kbd> — удалить
            из каталога (JSON)
          </li>
          <li>
            <kbd className="rounded bg-zinc-800 px-1">Ctrl/Cmd</kbd>+S —
            сохранить
          </li>
        </ul>
      </div>
    );
  }

  if (selected.length === 1) {
    const e = selected[0];
    return (
      <SingleEditor
        entry={e}
        catalogEntries={catalogEntries}
        gridCellMin={gridCellMin}
        onPatch={(p) => onPatchOne(e.frameKey, p)}
      />
    );
  }

  return (
    <MultiEditor
      selected={selected}
      focusKey={focusKey}
      onPatchMany={onPatchMany}
      onClearSelection={onClearSelection}
    />
  );
}

const EQUIP_BONUS_FIELDS: {
  key: keyof EquipBonuses;
  label: string;
}[] = [
  { key: "atk", label: "Атака" },
  { key: "def", label: "Защита" },
  { key: "hp", label: "HP (макс.)" },
  { key: "sta", label: "Стамина (макс.)" },
  { key: "spd", label: "Скорость" },
  { key: "luck", label: "Удача" },
];

function EquipBonusesEditor({
  entry,
  onPatch,
}: {
  entry: Entry;
  onPatch: (p: Partial<Entry>) => void;
}) {
  const leg = ITEM_EQUIP_BONUSES[entry.id];
  const ov = entry.equipBonuses;

  const patchBonuses = (next: EquipBonuses | undefined) => {
    if (!next || Object.keys(next).length === 0) {
      onPatch({ equipBonuses: undefined });
    } else {
      onPatch({ equipBonuses: next });
    }
  };

  const base = (): EquipBonuses => ({ ...(entry.equipBonuses ?? {}) });

  const slotHint =
    entry.slot === "weapon" || entry.slot === "offhand"
      ? "Оружие / левая рука: чаще atk; щит — def."
      : "Броня (шлем, нагрудник, обувь): чаще def, hp, spd.";

  return (
    <div className="mb-3 rounded border border-amber-900/40 bg-amber-950/20 p-2">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-medium text-amber-200">
          Бонусы при экипировке
        </span>
        <button
          type="button"
          className="text-[10px] text-zinc-400 underline-offset-2 hover:text-zinc-200 hover:underline"
          onClick={() => onPatch({ equipBonuses: undefined })}
        >
          Сбросить свои значения
        </button>
      </div>
      <p className="mb-2 text-[10px] leading-snug text-zinc-500">{slotHint}</p>
      <p className="mb-2 text-[10px] leading-snug text-zinc-500">
        База — <code className="rounded bg-zinc-800 px-0.5">ITEM_EQUIP_BONUSES</code>.
        Пустое поле = взять число из баланса (если есть для этого id). Введённое
        значение в каталоге перекрывает баланс для этого ключа.
      </p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {EQUIP_BONUS_FIELDS.map(({ key, label }) => {
          const legVal = leg?.[key];
          const ovVal = ov?.[key];
          return (
            <label key={key} className="block text-[10px] text-zinc-400">
              {label}
              <input
                type="number"
                min={0}
                value={ovVal !== undefined ? ovVal : ""}
                placeholder={
                  legVal != null ? `баланс: ${legVal}` : "—"
                }
                className="mt-0.5 w-full rounded bg-zinc-950 px-2 py-1 text-sm text-zinc-100 outline-none ring-1 ring-zinc-800 focus:ring-amber-600"
                onChange={(e) => {
                  const v = e.target.value;
                  const b = base();
                  if (v === "") {
                    delete b[key];
                    patchBonuses(Object.keys(b).length ? b : undefined);
                  } else {
                    const n = Math.max(0, Math.floor(Number(v)));
                    if (!Number.isFinite(n)) return;
                    b[key] = n;
                    patchBonuses(b);
                  }
                }}
              />
            </label>
          );
        })}
      </div>
    </div>
  );
}

function RarityEditor({
  entry,
  onPatch,
}: {
  entry: Entry;
  onPatch: (p: Partial<Entry>) => void;
}) {
  const current = entry.rarity ?? "common";
  return (
    <div className="mb-3 rounded border border-fuchsia-900/35 bg-fuchsia-950/15 p-2">
      <div className="mb-2 text-xs font-medium text-fuchsia-200">
        Редкость (оружие и броня)
      </div>
      <div className="flex flex-wrap gap-1">
        {ITEM_RARITY_IDS.map((id) => (
          <button
            key={id}
            type="button"
            onClick={() => {
              if (id === "common") {
                onPatch({ rarity: undefined });
              } else {
                onPatch({ rarity: id });
              }
            }}
            className={`rounded px-2 py-1 text-[10px] ring-1 transition-colors ${
              current === id
                ? "ring-fuchsia-400 bg-zinc-800"
                : "ring-zinc-700 hover:bg-zinc-800/80"
            } ${itemRarityNameClass(id)}`}
          >
            {ITEM_RARITY_LABEL_RU[id]}
          </button>
        ))}
      </div>
    </div>
  );
}

function BackpackSlotsEditor({
  entry,
  onPatch,
}: {
  entry: Entry;
  onPatch: (p: Partial<Entry>) => void;
}) {
  const raw = entry.inventoryBonusSlots;
  const display =
    typeof raw === "number" && Number.isFinite(raw) ? String(raw) : "";

  return (
    <div className="mb-3 rounded border border-purple-900/40 bg-purple-950/25 p-2">
      <div className="mb-2 text-xs font-medium text-purple-200">
        Рюкзак: дополнительные ячейки сумки
      </div>
      <p className="mb-2 text-[10px] leading-snug text-zinc-500">
        При надевании к базовым {BASE_INVENTORY_SLOTS} слотам добавляется не
        больше {MAX_BACKPACK_BONUS_SLOTS} ячеек (ограничение игры).
      </p>
      <label className="block text-[10px] text-zinc-400">
        Дополнительных ячеек
        <input
          type="number"
          min={0}
          max={MAX_BACKPACK_BONUS_SLOTS}
          value={display}
          placeholder="0"
          className="mt-0.5 w-full rounded bg-zinc-950 px-2 py-1 text-sm text-zinc-100 outline-none ring-1 ring-zinc-800 focus:ring-purple-600"
          onChange={(e) => {
            const t = e.target.value.trim();
            if (t === "") {
              onPatch({ inventoryBonusSlots: 0 });
              return;
            }
            const n = Math.max(
              0,
              Math.min(MAX_BACKPACK_BONUS_SLOTS, Math.floor(Number(t)))
            );
            if (!Number.isFinite(n)) return;
            onPatch({ inventoryBonusSlots: n });
          }}
        />
      </label>
    </div>
  );
}

function ConsumableFxEditor({
  entry,
  onPatch,
}: {
  entry: Entry;
  onPatch: (p: Partial<Entry>) => void;
}) {
  const leg = CONSUMABLE_EFFECTS[entry.id];
  const ov = entry.consumableFx;

  const patchFx = (next: ConsumableFx | undefined) => {
    if (!next || Object.keys(next).length === 0) {
      onPatch({ consumableFx: undefined });
    } else {
      onPatch({ consumableFx: next });
    }
  };

  const base = (): ConsumableFx => ({ ...(entry.consumableFx ?? {}) });

  const buffIds = Object.keys(BUFFS) as BuffId[];
  const displayBuffs =
    ov?.applyBuffs !== undefined ? ov.applyBuffs : leg?.applyBuffs ?? [];

  return (
    <div className="mb-3 rounded border border-emerald-900/40 bg-emerald-950/25 p-2">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-medium text-emerald-200">
          Эффект при использовании
        </span>
        <button
          type="button"
          className="text-[10px] text-zinc-400 underline-offset-2 hover:text-zinc-200 hover:underline"
          onClick={() => onPatch({ consumableFx: undefined })}
        >
          Сбросить свои значения
        </button>
      </div>
      <p className="mb-2 text-[10px] leading-snug text-zinc-500">
        База — <code className="rounded bg-zinc-800 px-0.5">CONSUMABLE_EFFECTS</code>{" "}
        в балансе. Пустое поле ниже = взять число оттуда (если есть для этого
        id). Любое введённое число сохраняется в каталоге и перекрывает баланс.
      </p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <label className="block text-[10px] text-zinc-400">
          HP (лечение)
          <input
            type="number"
            min={0}
            value={ov?.healHp !== undefined ? ov.healHp : ""}
            placeholder={leg?.healHp != null ? `баланс: ${leg.healHp}` : "—"}
            className="mt-0.5 w-full rounded bg-zinc-950 px-2 py-1 text-sm text-zinc-100 outline-none ring-1 ring-zinc-800 focus:ring-emerald-600"
            onChange={(e) => {
              const v = e.target.value;
              const b = base();
              if (v === "") {
                delete b.healHp;
                patchFx(Object.keys(b).length ? b : undefined);
              } else {
                const n = Math.max(0, Math.floor(Number(v)));
                if (!Number.isFinite(n)) return;
                b.healHp = n;
                patchFx(b);
              }
            }}
          />
        </label>
        <label className="block text-[10px] text-zinc-400">
          Стамина
          <input
            type="number"
            min={0}
            value={ov?.restoreSta !== undefined ? ov.restoreSta : ""}
            placeholder={leg?.restoreSta != null ? `баланс: ${leg.restoreSta}` : "—"}
            className="mt-0.5 w-full rounded bg-zinc-950 px-2 py-1 text-sm text-zinc-100 outline-none ring-1 ring-zinc-800 focus:ring-emerald-600"
            onChange={(e) => {
              const v = e.target.value;
              const b = base();
              if (v === "") {
                delete b.restoreSta;
                patchFx(Object.keys(b).length ? b : undefined);
              } else {
                const n = Math.max(0, Math.floor(Number(v)));
                if (!Number.isFinite(n)) return;
                b.restoreSta = n;
                patchFx(b);
              }
            }}
          />
        </label>
        <label className="block text-[10px] text-zinc-400">
          Откат (мс, КД)
          <input
            type="number"
            min={0}
            value={ov?.cooldownMs !== undefined ? ov.cooldownMs : ""}
            placeholder={
              leg?.cooldownMs != null ? `баланс: ${leg.cooldownMs}` : "—"
            }
            className="mt-0.5 w-full rounded bg-zinc-950 px-2 py-1 text-sm text-zinc-100 outline-none ring-1 ring-zinc-800 focus:ring-emerald-600"
            onChange={(e) => {
              const v = e.target.value;
              const b = base();
              if (v === "") {
                delete b.cooldownMs;
                patchFx(Object.keys(b).length ? b : undefined);
              } else {
                const n = Math.max(0, Math.floor(Number(v)));
                if (!Number.isFinite(n)) return;
                b.cooldownMs = n;
                patchFx(b);
              }
            }}
          />
        </label>
      </div>

      <div className="mt-2">
        <div className="mb-1 text-[10px] text-zinc-400">Баффы (временные)</div>
        <div className="flex flex-col gap-1.5">
          {displayBuffs.map((row, idx) => (
            <div key={idx} className="flex flex-wrap items-center gap-1">
              <select
                value={row.id}
                className="rounded bg-zinc-950 px-1.5 py-1 text-[11px] text-zinc-100 ring-1 ring-zinc-800"
                onChange={(e) => {
                  const id = e.target.value as BuffId;
                  const next = [...displayBuffs];
                  next[idx] = { ...next[idx], id };
                  const b = base();
                  b.applyBuffs = next;
                  patchFx(b);
                }}
              >
                {buffIds.map((bid) => (
                  <option key={bid} value={bid}>
                    {BUFFS[bid].label} ({bid})
                  </option>
                ))}
              </select>
              <input
                type="number"
                min={1}
                value={row.durationSec}
                className="w-20 rounded bg-zinc-950 px-1.5 py-1 text-[11px] text-zinc-100 ring-1 ring-zinc-800"
                onChange={(e) => {
                  const n = Math.max(1, Math.floor(Number(e.target.value)));
                  if (!Number.isFinite(n)) return;
                  const next = [...displayBuffs];
                  next[idx] = { ...next[idx], durationSec: n };
                  const b = base();
                  b.applyBuffs = next;
                  patchFx(b);
                }}
              />
              <span className="text-[10px] text-zinc-500">сек</span>
              <button
                type="button"
                className="text-[10px] text-red-400 hover:underline"
                onClick={() => {
                  const next = displayBuffs.filter((_, i) => i !== idx);
                  const b = base();
                  if (next.length === 0) {
                    delete b.applyBuffs;
                  } else {
                    b.applyBuffs = next;
                  }
                  patchFx(Object.keys(b).length ? b : undefined);
                }}
              >
                убрать
              </button>
            </div>
          ))}
        </div>
        <button
          type="button"
          className="mt-1.5 text-[10px] text-emerald-400 hover:underline"
          onClick={() => {
            const b = base();
            const next = [
              ...displayBuffs,
              { id: buffIds[0] ?? "vigor", durationSec: 30 },
            ];
            b.applyBuffs = next;
            patchFx(b);
          }}
        >
          + бафф
        </button>
      </div>
    </div>
  );
}

function SingleEditor({
  entry,
  catalogEntries,
  gridCellMin,
  onPatch,
}: {
  entry: Entry;
  catalogEntries: Entry[];
  gridCellMin: number;
  onPatch: (p: Partial<Entry>) => void;
}) {
  const [iconPickOpen, setIconPickOpen] = useState(false);
  const nameFieldId = useId();

  const onName = (ev: ChangeEvent<HTMLInputElement>) => {
    const name = ev.target.value;
    const autoId =
      !entry.id || entry.id === entry.frameKey
        ? slugify(name) || entry.frameKey
        : entry.id;
    onPatch({ name, id: autoId });
  };
  const onAutoId = () => {
    onPatch({ id: slugify(entry.name) || entry.frameKey });
  };

  return (
    <div
      data-catalog-no-hotkeys
      className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-3 text-sm"
    >
      <div className="mb-3 flex items-center gap-3">
        <div className="relative flex h-24 w-24 shrink-0 items-center justify-center rounded bg-zinc-950 ring-1 ring-zinc-800">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`/assets/items/${effectiveIconFrame(entry)}.png`}
            alt={effectiveIconFrame(entry)}
            className="max-h-20 max-w-20 object-contain"
            style={{ imageRendering: "pixelated" }}
          />
        </div>
        <div className="min-w-0">
          <div className="truncate font-mono text-xs text-zinc-400">
            строка: {entry.frameKey}
          </div>
          {entry.iconFrameKey?.trim() ? (
            <div className="truncate font-mono text-[10px] text-indigo-300">
              иконка: {effectiveIconFrame(entry)}
            </div>
          ) : null}
          <div
            className={`mt-1 inline-block rounded px-1.5 py-0.5 text-[10px] font-medium ring-1 ${SLOT_COLOR[entry.slot]}`}
          >
            {SLOT_LABEL[entry.slot]}
          </div>
        </div>
      </div>

      <div className="mb-3 rounded border border-zinc-800 bg-zinc-950/40 p-2">
        <div className="mb-1 text-xs font-medium text-zinc-200">
          Иконка в игре
        </div>
        <p className="mb-2 text-[10px] leading-snug text-zinc-500">
          По умолчанию берётся кадр строки каталога. Укажите другой{" "}
          <code className="rounded bg-zinc-800 px-0.5">frameKey</code>, если
          картинка не совпадает с названием.
        </p>
        <div className="flex flex-wrap gap-1.5">
          <input
            type="text"
            value={entry.iconFrameKey ?? ""}
            onChange={(e) => {
              const v = e.target.value;
              if (!v.trim()) {
                onPatch({ iconFrameKey: undefined });
              } else {
                onPatch({ iconFrameKey: v.trim() });
              }
            }}
            placeholder={entry.frameKey}
            className="min-w-0 flex-1 rounded bg-zinc-950 px-2 py-1.5 font-mono text-xs text-zinc-100 outline-none ring-1 ring-zinc-800 focus:ring-indigo-600"
          />
          <button
            type="button"
            className="rounded bg-indigo-700 px-2 py-1.5 text-xs font-medium text-white hover:bg-indigo-600"
            onClick={() => setIconPickOpen(true)}
          >
            Выбрать…
          </button>
          <button
            type="button"
            className="rounded bg-zinc-800 px-2 py-1.5 text-xs text-zinc-200 hover:bg-zinc-700 disabled:opacity-40"
            disabled={!entry.iconFrameKey?.trim()}
            onClick={() => onPatch({ iconFrameKey: undefined })}
          >
            Сбросить
          </button>
        </div>
      </div>

      {iconPickOpen ? (
        <IconFramePickerModal
          entries={catalogEntries}
          currentFrameKey={entry.frameKey}
          gridCellMin={gridCellMin}
          onCancel={() => setIconPickOpen(false)}
          onPick={(fk) => {
            if (fk === entry.frameKey) {
              onPatch({ iconFrameKey: undefined });
            } else {
              onPatch({ iconFrameKey: fk });
            }
            setIconPickOpen(false);
          }}
        />
      ) : null}

      <label className="mb-1 block text-xs text-zinc-400" htmlFor={nameFieldId}>
        Название
      </label>
      <input
        id={nameFieldId}
        type="text"
        value={entry.name}
        onChange={onName}
        onKeyDown={(e) => {
          if (e.key === " ") e.stopPropagation();
        }}
        placeholder="например «Железный меч»"
        className="mb-2 w-full rounded bg-zinc-950 px-2 py-1.5 text-sm text-zinc-100 outline-none ring-1 ring-zinc-800 focus:ring-emerald-600"
      />

      <label className="mb-1 block text-xs text-zinc-400">ID (semantic)</label>
      <div className="mb-2 flex gap-1">
        <input
          type="text"
          value={entry.id}
          onChange={(e) => onPatch({ id: e.target.value })}
          placeholder={entry.frameKey}
          className="flex-1 rounded bg-zinc-950 px-2 py-1.5 font-mono text-xs text-zinc-100 outline-none ring-1 ring-zinc-800 focus:ring-emerald-600"
        />
        <button
          type="button"
          onClick={onAutoId}
          className="rounded bg-zinc-800 px-2 text-xs text-zinc-100 hover:bg-zinc-700"
          title="Сгенерировать id из названия"
        >
          auto
        </button>
      </div>

      <label className="mb-1 block text-xs text-zinc-400">Слот</label>
      <div className="mb-3 flex flex-wrap gap-1">
        {SLOTS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => {
              const next: Partial<Entry> = { slot: s };
              if (slotKeepsConsumableFx(entry.slot) && !slotKeepsConsumableFx(s)) {
                next.consumableFx = undefined;
              }
              if (isEquipSlot(entry.slot) && !isEquipSlot(s)) {
                next.equipBonuses = undefined;
              }
              if (!slotKeepsConsumableFx(entry.slot) && slotKeepsConsumableFx(s)) {
                if (isEquipSlot(entry.slot)) next.equipBonuses = undefined;
              }
              if (entry.slot === "backpack" && s !== "backpack") {
                next.inventoryBonusSlots = undefined;
              }
              onPatch(next);
            }}
            className={`rounded px-2 py-1 text-[11px] ring-1 ${SLOT_COLOR[s]} ${
              entry.slot === s ? "outline outline-2 outline-emerald-400" : ""
            }`}
          >
            {SLOT_LABEL[s]}
          </button>
        ))}
      </div>

      {isEquipSlot(entry.slot) ? (
        <EquipBonusesEditor entry={entry} onPatch={onPatch} />
      ) : null}

      {entry.slot === "backpack" ? (
        <BackpackSlotsEditor entry={entry} onPatch={onPatch} />
      ) : null}

      {entry.slot !== "unknown" && isWeaponOrArmorSlot(entry.slot as ItemSlot) ? (
        <RarityEditor entry={entry} onPatch={onPatch} />
      ) : null}

      {slotKeepsConsumableFx(entry.slot) ? (
        <ConsumableFxEditor entry={entry} onPatch={onPatch} />
      ) : null}

      <label className="mb-1 block text-xs text-zinc-400">Теги</label>
      <TagsEditor
        tags={entry.tags ?? []}
        onChange={(tags) => onPatch({ tags })}
      />

      <label className="mb-1 mt-2 block text-xs text-zinc-400">Заметки</label>
      <textarea
        value={entry.notes ?? ""}
        onChange={(e) => onPatch({ notes: e.target.value })}
        rows={3}
        className="w-full resize-y rounded bg-zinc-950 px-2 py-1.5 text-xs text-zinc-100 outline-none ring-1 ring-zinc-800 focus:ring-emerald-600"
      />
    </div>
  );
}

function MultiEditor({
  selected,
  focusKey,
  onPatchMany,
  onClearSelection,
}: {
  selected: Entry[];
  focusKey: string | null;
  onPatchMany: (p: Partial<Entry>) => void;
  onClearSelection: () => void;
}) {
  const slots = new Set(selected.map((e) => e.slot));
  const commonSlot = slots.size === 1 ? selected[0].slot : null;
  const preview = selected.slice(0, 8);
  const more = selected.length - preview.length;
  const focused = selected.find((e) => e.frameKey === focusKey) ?? selected[0];

  return (
    <div
      data-catalog-no-hotkeys
      className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-3 text-sm"
    >
      <div className="mb-3 flex items-center justify-between">
        <div className="font-semibold text-zinc-100">
          Выделено: {selected.length}
        </div>
        <button
          type="button"
          onClick={onClearSelection}
          className="rounded bg-zinc-800 px-2 py-1 text-xs text-zinc-100 hover:bg-zinc-700"
        >
          снять
        </button>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-1">
        {preview.map((e) => (
          <div
            key={e.frameKey}
            className={`flex h-10 w-10 items-center justify-center rounded bg-zinc-950 ring-1 ${
              e.frameKey === focused.frameKey
                ? "ring-emerald-500"
                : "ring-zinc-800"
            }`}
            title={e.frameKey}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`/assets/items/${effectiveIconFrame(e)}.png`}
              alt={e.frameKey}
              className="max-h-8 max-w-8 object-contain"
              style={{ imageRendering: "pixelated" }}
            />
          </div>
        ))}
        {more > 0 ? (
          <div className="flex h-10 min-w-10 items-center justify-center rounded bg-zinc-800 px-2 text-xs text-zinc-200">
            +{more}
          </div>
        ) : null}
      </div>

      <label className="mb-1 block text-xs text-zinc-400">
        Слот {commonSlot ? "" : "(разные)"}
      </label>
      <div className="mb-3 flex flex-wrap gap-1">
        {SLOTS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => onPatchMany({ slot: s })}
            className={`rounded px-2 py-1 text-[11px] ring-1 ${SLOT_COLOR[s]} ${
              commonSlot === s ? "outline outline-2 outline-emerald-400" : ""
            }`}
          >
            {SLOT_LABEL[s]}
          </button>
        ))}
      </div>

      <label className="mb-1 block text-xs text-zinc-400">
        Заметки (применить ко всем)
      </label>
      <textarea
        placeholder="— разные —"
        rows={2}
        onBlur={(e) => {
          const v = e.target.value;
          if (v.length > 0) onPatchMany({ notes: v });
        }}
        className="w-full resize-y rounded bg-zinc-950 px-2 py-1.5 text-xs text-zinc-100 outline-none ring-1 ring-zinc-800 focus:ring-emerald-600"
      />
      <p className="mt-1 text-[11px] text-zinc-500">
        Текст применится ко всем выделенным при потере фокуса поля.
      </p>
    </div>
  );
}

function TagsEditor({
  tags,
  onChange,
}: {
  tags: string[];
  onChange: (next: string[]) => void;
}) {
  const [draft, setDraft] = useState("");
  const commit = () => {
    const parts = draft
      .split(/[,\n]/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    if (parts.length === 0) return;
    const next = Array.from(new Set([...tags, ...parts]));
    onChange(next);
    setDraft("");
  };
  return (
    <div className="flex flex-wrap items-center gap-1 rounded bg-zinc-950 p-1 ring-1 ring-zinc-800">
      {tags.map((t) => (
        <span
          key={t}
          className="inline-flex items-center gap-1 rounded bg-zinc-800 px-1.5 py-0.5 text-[11px] text-zinc-200"
        >
          {t}
          <button
            type="button"
            className="text-zinc-400 hover:text-red-300"
            onClick={() => onChange(tags.filter((x) => x !== t))}
            aria-label={`Удалить тег ${t}`}
          >
            ×
          </button>
        </span>
      ))}
      <input
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            commit();
          } else if (e.key === "Backspace" && draft === "" && tags.length > 0) {
            onChange(tags.slice(0, -1));
          }
        }}
        onBlur={commit}
        placeholder="добавить…"
        className="min-w-[80px] flex-1 bg-transparent px-1 text-[11px] text-zinc-100 outline-none"
      />
    </div>
  );
}

function IconFramePickerModal({
  entries,
  currentFrameKey,
  gridCellMin,
  onCancel,
  onPick,
}: {
  entries: Entry[];
  currentFrameKey: string;
  /** Совпадает с основной сеткой каталога */
  gridCellMin: number;
  onCancel: () => void;
  onPick: (frameKey: string) => void;
}) {
  const [q, setQ] = useState("");
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    const list = s
      ? entries.filter(
          (e) =>
            e.frameKey.toLowerCase().includes(s) ||
            e.name.toLowerCase().includes(s) ||
            e.id.toLowerCase().includes(s)
        )
      : entries;
    return [...list].sort((a, b) =>
      a.frameKey.localeCompare(b.frameKey, "en", { numeric: true })
    );
  }, [entries, q]);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4"
      onClick={onCancel}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-3xl flex-col rounded-lg border border-zinc-700 bg-zinc-900 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-zinc-800 px-4 py-3">
          <h3 className="text-lg font-semibold text-zinc-100">
            Выберите кадр иконки
          </h3>
          <p className="mt-1 text-[11px] text-zinc-500">
            Текущая строка каталога:{" "}
            <code className="rounded bg-zinc-800 px-1">{currentFrameKey}</code>.
            Клик по плитке задаёт этот{" "}
            <code className="rounded bg-zinc-800 px-1">frameKey</code> как иконку
            в игре.
          </p>
          <input
            type="search"
            autoFocus
            placeholder="Поиск по frameKey, id, имени…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="mt-2 w-full rounded bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none ring-1 ring-zinc-800 focus:ring-indigo-600"
          />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          <div
            className="grid gap-2"
            style={{
              gridTemplateColumns: `repeat(auto-fill, minmax(${gridCellMin}px, 1fr))`,
            }}
          >
            {filtered.map((e) => (
              <button
                key={e.frameKey}
                type="button"
                onClick={() => onPick(e.frameKey)}
                className={`flex flex-col items-stretch overflow-hidden rounded-md border text-left transition hover:border-indigo-500 hover:bg-zinc-800/80 ${
                  e.frameKey === currentFrameKey
                    ? "border-zinc-600 bg-zinc-800/40"
                    : "border-zinc-800 bg-zinc-900/40"
                }`}
              >
                <div className="relative aspect-square w-full min-w-0 bg-zinc-950">
                  <div className="absolute inset-[8%] min-h-0 min-w-0">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={`/assets/items/${effectiveIconFrame(e)}.png`}
                      alt=""
                      className="block h-full w-full object-contain object-center"
                      style={{ imageRendering: "pixelated" }}
                      draggable={false}
                    />
                  </div>
                </div>
                <div className="px-1.5 py-1">
                  <div className="truncate font-mono text-[10px] text-zinc-300">
                    {e.frameKey}
                  </div>
                  <div className="truncate text-[9px] text-zinc-500">
                    {e.name.trim() || "—"}
                  </div>
                </div>
              </button>
            ))}
          </div>
          {filtered.length === 0 ? (
            <p className="py-8 text-center text-sm text-zinc-500">
              Ничего не найдено.
            </p>
          ) : null}
        </div>
        <div className="flex justify-end gap-2 border-t border-zinc-800 px-4 py-3">
          <button
            type="button"
            onClick={onCancel}
            className="rounded bg-zinc-800 px-3 py-1.5 text-sm text-zinc-100 hover:bg-zinc-700"
          >
            Отмена
          </button>
        </div>
      </div>
    </div>
  );
}

function RenameModal({
  count,
  onCancel,
  onApply,
}: {
  count: number;
  onCancel: () => void;
  onApply: (pattern: string, start: number) => void;
}) {
  const [pattern, setPattern] = useState("Предмет {i}");
  const [start, setStart] = useState(1);
  const preview = pattern.replace(/\{i\}/g, String(start));

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-md rounded-lg border border-zinc-700 bg-zinc-900 p-4 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="mb-2 text-lg font-semibold text-zinc-100">
          Переименовать {count} шт.
        </h3>
        <p className="mb-3 text-xs text-zinc-400">
          Используйте <code className="rounded bg-zinc-800 px-1">{"{i}"}</code>{" "}
          как номер. id будет сгенерирован из имени, если он не задан вручную.
        </p>

        <label className="mb-1 block text-xs text-zinc-400">Шаблон</label>
        <input
          autoFocus
          type="text"
          value={pattern}
          onChange={(e) => setPattern(e.target.value)}
          className="mb-2 w-full rounded bg-zinc-950 px-2 py-1.5 text-sm text-zinc-100 outline-none ring-1 ring-zinc-800 focus:ring-emerald-600"
        />

        <label className="mb-1 block text-xs text-zinc-400">
          Начальный индекс
        </label>
        <input
          type="number"
          value={start}
          onChange={(e) => setStart(Number(e.target.value) || 0)}
          className="mb-3 w-32 rounded bg-zinc-950 px-2 py-1.5 text-sm text-zinc-100 outline-none ring-1 ring-zinc-800 focus:ring-emerald-600"
        />

        <div className="mb-4 rounded bg-zinc-950 px-2 py-1.5 text-xs text-zinc-300 ring-1 ring-zinc-800">
          Пример: <span className="text-emerald-300">{preview || "—"}</span>
        </div>

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded bg-zinc-800 px-3 py-1.5 text-sm text-zinc-100 hover:bg-zinc-700"
          >
            Отмена
          </button>
          <button
            type="button"
            onClick={() => onApply(pattern, start)}
            className="rounded bg-emerald-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-emerald-500"
          >
            Применить
          </button>
        </div>
      </div>
    </div>
  );
}
