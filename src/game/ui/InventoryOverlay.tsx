"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
} from "react";
import {
  BASE_INVENTORY_SLOTS,
  MAX_INVENTORY_SLOTS,
} from "@/src/game/constants/gameplay";
import { BUFFS, ITEM_EQUIP_BONUSES, professionXpToNext } from "@/src/game/data/balance";
import {
  GATHER_PROFESSION_IDS,
  GATHER_PROFESSION_LABELS,
} from "@/src/game/data/professions";
import type { EquipSlot } from "@/src/game/data/items.curated";
import {
  getBackpackInventoryBonusSlots,
  getConsumableCooldownMs,
  getConsumableEffect,
  getCuratedItem,
  getEffectiveInventorySlotCount,
  hotbarItemIsImmediatelyUsable,
  itemSlotSupportsUsableEffect,
} from "@/src/game/data/itemRegistry";
import { ITEM_ATLAS } from "@/src/game/data/items.generated";
import {
  ItemAtlasIcon,
  type ItemAtlasFramesFile,
} from "@/src/game/ui/ItemAtlasIcon";
import { getDerivedCombatStats } from "@/src/game/rpg/derivedStats";
import {
  formatItemRarityLabel,
  isWeaponOrArmorSlot,
  itemRarityNameClass,
  itemRarityOutlineClass,
} from "@/src/game/data/itemRarity";
import { useGameStore } from "@/src/game/state/gameStore";
import { PaperModalChrome } from "@/src/game/ui/paper/PaperChrome";
import { PaperButton } from "@/src/game/ui/paper/PaperButton";
import { PaperSectionLabel } from "@/src/game/ui/paper/PaperSectionLabel";
import { PaperSlotChrome } from "@/src/game/ui/paper/PaperSlotChrome";

const EQUIP_ORDER: EquipSlot[] = [
  "weapon",
  "offhand",
  "helmet",
  "chest",
  "pants",
  "boots",
  "backpack",
  "pickaxe",
  "axe",
  "fishing_rod",
];

const EQUIP_LABEL: Record<EquipSlot, string> = {
  weapon: "Оружие",
  offhand: "Левая рука",
  helmet: "Голова",
  chest: "Тело",
  pants: "Штаны",
  boots: "Обувь",
  backpack: "Рюкзак",
  pickaxe: "Кирка",
  axe: "Топор",
  fishing_rod: "Удочка",
};

const SLOT_LABEL: Record<string, string> = {
  weapon: "Оружие",
  offhand: "Левая рука",
  helmet: "Голова",
  chest: "Тело",
  pants: "Штаны",
  boots: "Обувь",
  backpack: "Рюкзак",
  consumable: "Расходник",
  active_item: "Активный предмет",
  fish: "Рыба",
  loot: "Лут",
  material: "Материал",
  quest: "Квест",
  pickaxe: "Кирка",
  axe: "Топор",
  fishing_rod: "Удочка",
};

function formatEquipBonuses(id: string): string | null {
  const b = ITEM_EQUIP_BONUSES[id];
  if (!b) return null;
  const parts: string[] = [];
  if (b.atk) parts.push(`ATK +${b.atk}`);
  if (b.def) parts.push(`DEF +${b.def}`);
  if (b.hp) parts.push(`HP +${b.hp}`);
  if (b.sta) parts.push(`Стамина +${b.sta}`);
  if (b.spd) parts.push(`SPD +${b.spd}`);
  if (b.luck) parts.push(`Удача +${b.luck}`);
  return parts.length ? parts.join(" · ") : null;
}

function formatConsumableFx(id: string): string | null {
  const fx = getConsumableEffect(id);
  if (!fx) return null;
  const parts: string[] = [];
  if (fx.healHp) parts.push(`HP +${fx.healHp}`);
  if (fx.restoreSta) parts.push(`Стамина +${fx.restoreSta}`);
  if (fx.applyBuffs?.length) {
    for (const a of fx.applyBuffs) {
      const name = BUFFS[a.id]?.label ?? a.id;
      parts.push(`${name} (${a.durationSec}с)`);
    }
  }
  const cdMs = getConsumableCooldownMs(id);
  if (cdMs > 0) {
    parts.push(`КД ${(cdMs / 1000).toFixed(cdMs % 1000 === 0 ? 0 : 1)} с`);
  }
  return parts.length ? parts.join(" · ") : null;
}

/** Строка эффекта расходника в карточке/тултипе: цифры только после первого применения. */
function consumableFxSummaryForUi(
  curatedId: string,
  revealed: Record<string, true>
): string | null {
  const fx = getConsumableEffect(curatedId);
  if (!fx) return null;
  if (!revealed[curatedId]) {
    return "Эффект неизвестен · сначала используйте предмет";
  }
  return formatConsumableFx(curatedId);
}

const INV_DRAG_MIME = "application/x-nagibatop-inv";

function parseInventoryDragIndex(e: DragEvent): number | null {
  const raw =
    e.dataTransfer.getData(INV_DRAG_MIME) ||
    e.dataTransfer.getData("text/plain");
  if (!raw) return null;
  try {
    const j = JSON.parse(raw) as { from?: unknown };
    if (typeof j.from === "number" && Number.isFinite(j.from)) {
      return j.from;
    }
  } catch {
    /* ignore */
  }
  return null;
}

function buildItemTooltip(
  curatedId: string,
  qty: number,
  slotKind: string,
  consumableFxRevealed: Record<string, true>
): string {
  const def = getCuratedItem(curatedId);
  const name = def?.name ?? curatedId;
  const slotRu = SLOT_LABEL[slotKind] ?? slotKind;
  let body = `${name}\nТип: ${slotRu}`;
  if (qty > 1) body += `\nКоличество: ${qty}`;
  const eq = formatEquipBonuses(curatedId);
  if (eq) body += `\n${eq}`;
  const bagExtra = getBackpackInventoryBonusSlots(curatedId);
  if (bagExtra > 0) {
    body += `\n+${bagExtra} ячеек инвентаря при экипировке`;
  }
  const fxLine = consumableFxSummaryForUi(curatedId, consumableFxRevealed);
  if (fxLine) {
    body += consumableFxRevealed[curatedId]
      ? `\nЭффект: ${fxLine}`
      : `\n${fxLine}`;
  }
  if (def && isWeaponOrArmorSlot(def.slot)) {
    body += `\nРедкость: ${formatItemRarityLabel(def.rarity)}`;
  }
  return body;
}

export default function InventoryOverlay({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const inventorySlots = useGameStore((s) => s.inventorySlots);
  const equipped = useGameStore((s) => s.equipped);
  const character = useGameStore((s) => s.character);
  const professions = useGameStore((s) => s.professions);
  const originBonus = useGameStore((s) =>
    s.isekaiOrigin?.completed === true ? s.isekaiOrigin.bonus : undefined
  );
  const swapSlots = useGameStore((s) => s.swapSlots);
  const equipFromInventorySlot = useGameStore((s) => s.equipFromInventorySlot);
  const unequip = useGameStore((s) => s.unequip);
  const consumeFromSlot = useGameStore((s) => s.useConsumableAt);
  const dropSlot = useGameStore((s) => s.dropSlot);
  const splitStack = useGameStore((s) => s.splitStack);
  const consumableFxRevealed = useGameStore((s) => s.consumableEffectsRevealed);

  const [atlas, setAtlas] = useState<ItemAtlasFramesFile | null>(null);
  /** Индекс рюкзака, с которого тянут предмет (подсветка источника) */
  const [draggingFrom, setDraggingFrom] = useState<number | null>(null);
  /** Подсветка ячейки рюкзака под курсором при дропе */
  const [hoverBagIndex, setHoverBagIndex] = useState<number | null>(null);
  /** Подсветка слота экипировки под курсором */
  const [hoverEquipSlot, setHoverEquipSlot] = useState<EquipSlot | null>(null);
  /** Подсветка полосы «выбросить на землю» */
  const [hoverGroundStrip, setHoverGroundStrip] = useState(false);
  /** Ячейка для панели деталей */
  const [detailSlot, setDetailSlot] = useState<number | null>(null);
  /** После drag браузер иногда шлёт лишний click по ячейке — игнорируем один раз */
  const suppressBagClickAfterDrag = useRef(false);

  const derived = useMemo(
    () =>
      getDerivedCombatStats(
        character.level,
        equipped,
        originBonus,
        character.attrs
      ),
    [character.level, equipped, originBonus, character.attrs]
  );

  const usableInvSlots = useMemo(
    () => getEffectiveInventorySlotCount(equipped),
    [equipped]
  );

  useEffect(() => {
    if (!open) return;
    if (detailSlot !== null && detailSlot >= usableInvSlots) {
      setDetailSlot(null);
    }
  }, [open, detailSlot, usableInvSlots]);

  useEffect(() => {
    if (!open || !ITEM_ATLAS.available) return;
    let cancelled = false;
    void fetch(ITEM_ATLAS.jsonUrl)
      .then((r) => r.json())
      .then((j: ItemAtlasFramesFile) => {
        if (!cancelled) setAtlas(j);
      })
      .catch(() => {
        if (!cancelled) setAtlas(null);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) {
      setDraggingFrom(null);
      setHoverBagIndex(null);
      setHoverEquipSlot(null);
      setDetailSlot(null);
    }
  }, [open]);

  const clearDragUi = useCallback(() => {
    setDraggingFrom(null);
    setHoverBagIndex(null);
    setHoverEquipSlot(null);
    setHoverGroundStrip(false);
  }, []);

  const toast = useCallback((message: string) => {
    window.dispatchEvent(
      new CustomEvent("nagibatop-toast", { detail: { message } })
    );
  }, []);

  const onBagSlotClick = useCallback((index: number) => {
    if (suppressBagClickAfterDrag.current) {
      suppressBagClickAfterDrag.current = false;
      return;
    }
    setDetailSlot(index);
  }, []);

  const onBagDragEnd = useCallback(
    (_e: DragEvent) => {
      suppressBagClickAfterDrag.current = true;
      window.setTimeout(() => {
        suppressBagClickAfterDrag.current = false;
      }, 0);
      clearDragUi();
    },
    [clearDragUi]
  );

  const onInventoryDragStart = useCallback(
    (e: DragEvent, index: number) => {
      const payload = JSON.stringify({ from: index });
      e.dataTransfer.setData(INV_DRAG_MIME, payload);
      e.dataTransfer.setData("text/plain", payload);
      e.dataTransfer.effectAllowed = "move";
      setDraggingFrom(index);
    },
    []
  );

  const onBagSlotDragOver = useCallback(
    (e: DragEvent, index: number) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      setHoverBagIndex(index);
      setHoverEquipSlot(null);
    },
    []
  );

  const onBagSlotDrop = useCallback(
    (e: DragEvent, index: number) => {
      e.preventDefault();
      const from = parseInventoryDragIndex(e);
      clearDragUi();
      if (from === null || from === index) return;
      swapSlots(from, index);
    },
    [clearDragUi, swapSlots]
  );

  const onEquipSlotDragOver = useCallback(
    (e: DragEvent, slot: EquipSlot) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      setHoverEquipSlot(slot);
      setHoverBagIndex(null);
    },
    []
  );

  const onEquipSlotDrop = useCallback(
    (e: DragEvent, slot: EquipSlot) => {
      e.preventDefault();
      const from = parseInventoryDragIndex(e);
      clearDragUi();
      if (from === null) return;
      const stack = inventorySlots[from];
      if (!stack) return;
      const def = getCuratedItem(stack.curatedId);
      if (!def) return;
      if ((def.slot as EquipSlot) !== slot) {
        toast("Этот предмет не подходит в этот слот.");
        return;
      }
      const ok = equipFromInventorySlot(from);
      if (!ok) {
        toast(
          "Не удалось надеть: есть предметы в закрытых ячейках сумки или нет места под снятый предмет."
        );
      }
    },
    [
      clearDragUi,
      equipFromInventorySlot,
      inventorySlots,
      toast,
    ]
  );

  const onGroundStripDragOver = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setHoverGroundStrip(true);
    setHoverBagIndex(null);
    setHoverEquipSlot(null);
  }, []);

  const onGroundStripDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault();
      const from = parseInventoryDragIndex(e);
      clearDragUi();
      if (from === null) return;
      const stack = inventorySlots[from];
      if (!stack) return;
      dropSlot(from);
      if (detailSlot === from) setDetailSlot(null);
    },
    [clearDragUi, detailSlot, dropSlot, inventorySlots]
  );

  const onUseConsumable = useCallback(
    (slotIndex: number) => {
      const r = consumeFromSlot(slotIndex);
      if (!r.ok && r.reason) toast(r.reason);
    },
    [consumeFromSlot, toast]
  );

  const cell = 44;

  const detailStack =
    detailSlot !== null ? inventorySlots[detailSlot] : null;
  const detailDef = detailStack
    ? getCuratedItem(detailStack.curatedId)
    : undefined;

  const canEquipDetail =
    detailDef && EQUIP_ORDER.includes(detailDef.slot as EquipSlot);
  const canUseDetail =
    !!detailDef &&
    itemSlotSupportsUsableEffect(detailDef.slot) &&
    !!detailStack &&
    hotbarItemIsImmediatelyUsable(detailStack.curatedId);

  const detailConsumableFxLine =
    detailStack &&
    consumableFxSummaryForUi(detailStack.curatedId, consumableFxRevealed);

  const handleDrop = useCallback(() => {
    if (detailSlot === null || !detailStack) return;
    dropSlot(detailSlot);
    setDetailSlot(null);
  }, [detailSlot, detailStack, dropSlot]);

  const handleSplit = useCallback(() => {
    if (detailSlot === null || !detailStack || detailStack.qty < 2) return;
    const half = Math.floor(detailStack.qty / 2);
    const r = splitStack(detailSlot, half);
    if (!r.ok && r.reason) toast(r.reason);
  }, [detailSlot, detailStack, splitStack, toast]);

  if (!open) return null;

  return (
    <PaperModalChrome title="Инвентарь" onClose={onClose}>
      <div className="flex min-h-0 flex-1 flex-col gap-3 pb-3 pt-0.5 lg:flex-row lg:gap-4">
        {/* Левая колонка: экипировка + сводка */}
        <div className="flex w-full shrink-0 flex-col gap-2 lg:max-w-[240px]">
          <PaperSectionLabel>Экипировка</PaperSectionLabel>
          <p className="text-[10px] leading-snug text-[#5c5346] sm:text-[11px]">
            Перетащите предмет из рюкзака на нужный слот, чтобы надеть. Клик по
            надетому — снять в рюкзак (если есть место). Рюкзак расширяет число
            ячеек сумки; кирка, топор и удочка надеваются в свои слоты внизу сетки.
          </p>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-2">
            {EQUIP_ORDER.map((slot) => {
              const id = equipped[slot];
              const def = id ? getCuratedItem(id) : undefined;
              const equipHighlight =
                draggingFrom !== null && hoverEquipSlot === slot;
              return (
                <div key={slot} className="flex flex-col items-center gap-1">
                  <span className="max-w-[5.5rem] truncate text-center text-[10px] font-medium text-[#4a4338] sm:text-[11px]">
                    {EQUIP_LABEL[slot]}
                  </span>
                  <button
                    type="button"
                    title={
                      def
                        ? `${def.name}${
                            isWeaponOrArmorSlot(def.slot)
                              ? ` · ${formatItemRarityLabel(def.rarity)}`
                              : ""
                          }\n${formatEquipBonuses(def.id) ?? ""}`.trim()
                        : "Пусто · перетащите сюда предмет из рюкзака"
                    }
                    className={`rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1b6b52] ${
                      equipHighlight
                        ? "ring-2 ring-[#2a8f6a] ring-offset-1 ring-offset-[#ebe3d2]"
                        : ""
                    }`}
                    onClick={() => {
                      if (!id) return;
                      const ok = unequip(slot);
                      if (!ok) {
                        toast(
                          "Не удалось снять: нет места в инвентаре или в «закрытых» ячейках ещё лежат вещи (с уменьшением рюкзака их нужно переложить)."
                        );
                      }
                    }}
                    onDragOver={(e) => onEquipSlotDragOver(e, slot)}
                    onDrop={(e) => onEquipSlotDrop(e, slot)}
                  >
                    {def && isWeaponOrArmorSlot(def.slot) ? (
                      <div className={itemRarityOutlineClass(def.rarity)}>
                        <PaperSlotChrome>
                          <ItemAtlasIcon
                            atlas={atlas}
                            frameKey={def?.atlasFrame ?? null}
                            cell={cell}
                          />
                        </PaperSlotChrome>
                      </div>
                    ) : (
                      <PaperSlotChrome>
                        <ItemAtlasIcon
                          atlas={atlas}
                          frameKey={def?.atlasFrame ?? null}
                          cell={cell}
                        />
                      </PaperSlotChrome>
                    )}
                  </button>
                </div>
              );
            })}
          </div>

          <PaperSectionLabel>Персонаж</PaperSectionLabel>
          <div className="rounded-md border border-[#5c4a32]/25 bg-[rgba(42,36,28,0.06)] px-2 py-2 text-[11px] text-[#4a4338] sm:text-xs">
            <div className="flex justify-between gap-2 font-semibold text-[#3d2914]">
              <span>Уровень {character.level}</span>
            </div>
            <div className="mt-1.5 space-y-2 border-t border-[#5c4a32]/20 pt-1.5">
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-wide text-[#8a8270]">
                  Ресурсы
                </div>
                <div className="mt-1 space-y-1">
                  <div className="flex justify-between gap-2">
                    <span className="text-[#6d6658]">HP</span>
                    <span>
                      {Math.ceil(character.hp)} / {derived.maxHp}
                    </span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-[#6d6658]">Стамина</span>
                    <span>
                      {Math.ceil(character.sta)} / {derived.maxSta}
                    </span>
                  </div>
                </div>
              </div>

              <div className="border-t border-[#5c4a32]/15 pt-1.5">
                <div className="text-[10px] font-semibold uppercase tracking-wide text-[#8a8270]">
                  Профессии
                </div>
                <div className="mt-1 space-y-1.5">
                  {GATHER_PROFESSION_IDS.map((id) => {
                    const pr = professions[id];
                    const need = professionXpToNext(pr.level);
                    const pct =
                      need <= 0
                        ? 100
                        : Math.min(
                            100,
                            Math.round((pr.xp / need) * 100)
                          );
                    return (
                      <div key={id}>
                        <div className="flex justify-between gap-2 text-[10px]">
                          <span className="text-[#6d6658]">
                            {GATHER_PROFESSION_LABELS[id]}
                          </span>
                          <span className="font-mono tabular-nums text-[#3d2914]">
                            Ур. {pr.level} · {Math.floor(pr.xp)}/{need}
                          </span>
                        </div>
                        <div className="mt-0.5 h-1.5 w-full overflow-hidden rounded-full bg-[#e8e0d0]">
                          <div
                            className="h-full rounded-full bg-[#2a8f6a]/85 transition-[width] duration-150"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="border-t border-[#5c4a32]/15 pt-1.5">
                <div className="text-[10px] font-semibold uppercase tracking-wide text-[#8a8270]">
                  Навыки (очки)
                </div>
                <dl className="mt-1 grid grid-cols-1 gap-y-0.5 text-[10px] sm:grid-cols-2 sm:gap-x-3 sm:text-[11px]">
                  <div className="flex justify-between gap-2">
                    <dt className="text-[#6d6658]">Сила</dt>
                    <dd className="font-mono tabular-nums text-[#3d2914]">
                      {character.attrs.str}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-[#6d6658]">Ловкость</dt>
                    <dd className="font-mono tabular-nums text-[#3d2914]">
                      {character.attrs.agi}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-[#6d6658]">Живучесть</dt>
                    <dd className="font-mono tabular-nums text-[#3d2914]">
                      {character.attrs.vit}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-[#6d6658]">Стойкость</dt>
                    <dd className="font-mono tabular-nums text-[#3d2914]">
                      {character.attrs.tgh}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-[#6d6658]">Выносливость</dt>
                    <dd className="font-mono tabular-nums text-[#3d2914]">
                      {character.attrs.end}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-[#6d6658]">Скорость</dt>
                    <dd className="font-mono tabular-nums text-[#3d2914]">
                      {character.attrs.mob}
                    </dd>
                  </div>
                </dl>
              </div>

              <div className="border-t border-[#5c4a32]/15 pt-1.5">
                <div className="text-[10px] font-semibold uppercase tracking-wide text-[#8a8270]">
                  Бой (итог)
                </div>
                <p className="mt-0.5 text-[9px] leading-snug text-[#8a8270]">
                  Уровень, снаряжение и баффы уже учтены.
                </p>
                <div className="mt-1 space-y-1">
                  <div className="flex justify-between gap-2">
                    <span className="text-[#6d6658]">Атака</span>
                    <span className="font-mono tabular-nums">{derived.atk}</span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-[#6d6658]">Защита</span>
                    <span className="font-mono tabular-nums">{derived.def}</span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-[#6d6658]">Скорость боя</span>
                    <span className="font-mono tabular-nums">{derived.spd}</span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-[#6d6658]">Удача</span>
                    <span className="font-mono tabular-nums">{derived.luck}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Правая колонка: рюкзак + детали */}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2">
          <PaperSectionLabel>
            Рюкзак · перетащите предмет на другую ячейку, чтобы поменять местами
          </PaperSectionLabel>
          <div className="paper-scroll grid max-h-[min(42vh,320px)] grid-cols-4 gap-2 overflow-y-auto overflow-x-hidden pb-1 sm:grid-cols-6 md:max-h-[min(48vh,380px)] md:gap-2.5">
            {inventorySlots.slice(0, usableInvSlots).map((stack, i) => {
              const def = stack ? getCuratedItem(stack.curatedId) : undefined;
              const detailSel = detailSlot === i;
              const bagDropHighlight =
                draggingFrom !== null &&
                hoverBagIndex === i &&
                draggingFrom !== i;
              const tooltip =
                stack && def
                  ? buildItemTooltip(
                      stack.curatedId,
                      stack.qty,
                      def.slot,
                      consumableFxRevealed
                    )
                  : `Пустой слот ${i + 1}`;
              return (
                <button
                  key={i}
                  type="button"
                  title={tooltip}
                  aria-pressed={detailSel}
                  draggable={!!stack}
                  onDragStart={
                    stack
                      ? (e) => onInventoryDragStart(e, i)
                      : undefined
                  }
                  onDragEnd={onBagDragEnd}
                  onDragOver={(e) => onBagSlotDragOver(e, i)}
                  onDrop={(e) => onBagSlotDrop(e, i)}
                  className={`select-none rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1b6b52] ${
                    detailSel ? "ring-2 ring-amber-700/80 ring-offset-1 ring-offset-[#ebe3d2]" : ""
                  } ${
                    bagDropHighlight
                      ? "ring-2 ring-[#2a8f6a] ring-offset-1 ring-offset-[#ebe3d2]"
                      : ""
                  } ${draggingFrom === i ? "opacity-55" : ""}`}
                  onClick={() => onBagSlotClick(i)}
                >
                  {def && isWeaponOrArmorSlot(def.slot) ? (
                    <div className={itemRarityOutlineClass(def.rarity)}>
                      <PaperSlotChrome picked={draggingFrom === i}>
                        <ItemAtlasIcon
                          atlas={atlas}
                          frameKey={def?.atlasFrame ?? null}
                          cell={cell}
                        />
                        {stack && stack.qty > 1 ? (
                          <span className="absolute bottom-0.5 right-0.5 text-[10px] font-bold text-[#1a3228] drop-shadow-[0_0_2px_rgba(255,255,255,0.85)]">
                            {stack.qty}
                          </span>
                        ) : null}
                      </PaperSlotChrome>
                    </div>
                  ) : (
                    <PaperSlotChrome picked={draggingFrom === i}>
                      <ItemAtlasIcon
                        atlas={atlas}
                        frameKey={def?.atlasFrame ?? null}
                        cell={cell}
                      />
                      {stack && stack.qty > 1 ? (
                        <span className="absolute bottom-0.5 right-0.5 text-[10px] font-bold text-[#1a3228] drop-shadow-[0_0_2px_rgba(255,255,255,0.85)]">
                          {stack.qty}
                        </span>
                      ) : null}
                    </PaperSlotChrome>
                  )}
                </button>
              );
            })}
          </div>

          <PaperSectionLabel>Выбранный предмет</PaperSectionLabel>
          <div className="flex min-h-[7rem] flex-col gap-2 rounded-md border border-[#5c4a32]/25 bg-[rgba(42,36,28,0.06)] px-2 py-2 sm:min-h-[7.5rem] sm:px-3">
            {!detailStack || !detailDef ? (
              <p className="text-center text-[11px] leading-relaxed text-[#6d6658] sm:text-xs">
                Кликните по ячейке рюкзака, чтобы увидеть описание и действия.
              </p>
            ) : (
              <>
                <div className="flex gap-2">
                  {isWeaponOrArmorSlot(detailDef.slot) ? (
                    <div className={itemRarityOutlineClass(detailDef.rarity)}>
                      <PaperSlotChrome>
                        <ItemAtlasIcon
                          atlas={atlas}
                          frameKey={detailDef.atlasFrame ?? null}
                          cell={cell}
                        />
                      </PaperSlotChrome>
                    </div>
                  ) : (
                    <PaperSlotChrome>
                      <ItemAtlasIcon
                        atlas={atlas}
                        frameKey={detailDef.atlasFrame ?? null}
                        cell={cell}
                      />
                    </PaperSlotChrome>
                  )}
                  <div className="min-w-0 flex-1">
                    <h3 className="text-sm font-semibold text-[#3d2914] sm:text-base">
                      {detailDef.name}
                    </h3>
                    {isWeaponOrArmorSlot(detailDef.slot) ? (
                      <p
                        className={`mt-0.5 text-[10px] font-semibold sm:text-[11px] ${itemRarityNameClass(detailDef.rarity)}`}
                      >
                        {formatItemRarityLabel(detailDef.rarity)}
                      </p>
                    ) : null}
                    <p className="mt-0.5 text-[10px] text-[#6d6658] sm:text-[11px]">
                      {SLOT_LABEL[detailDef.slot] ?? detailDef.slot}
                      {detailStack.qty > 1 ? ` · ×${detailStack.qty}` : ""}
                    </p>
                    {detailDef.slot === "backpack" &&
                    getBackpackInventoryBonusSlots(detailStack.curatedId) > 0 ? (
                      <p className="mt-1 text-[11px] text-[#4a4338]">
                        +
                        {getBackpackInventoryBonusSlots(detailStack.curatedId)}{" "}
                        ячеек инвентаря при надевании
                      </p>
                    ) : null}
                    {formatEquipBonuses(detailStack.curatedId) ? (
                      <p className="mt-1 text-[11px] text-[#4a4338]">
                        {formatEquipBonuses(detailStack.curatedId)}
                      </p>
                    ) : null}
                    {detailConsumableFxLine ? (
                      <p className="mt-1 text-[11px] text-[#4a4338]">
                        {consumableFxRevealed[detailStack.curatedId]
                          ? `Эффект: ${detailConsumableFxLine}`
                          : detailConsumableFxLine}
                      </p>
                    ) : null}
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5 border-t border-[#5c4a32]/20 pt-2">
                  {canEquipDetail ? (
                    <PaperButton
                      type="button"
                      variant="primary"
                      className="min-w-[5rem] px-2 py-1.5 text-[10px] sm:text-[11px]"
                      onClick={() => {
                        if (detailSlot === null) return;
                        const ok = equipFromInventorySlot(detailSlot);
                        if (!ok) {
                          toast(
                            "Не удалось надеть: есть предметы в закрытых ячейках сумки или нет места под снятый предмет."
                          );
                        }
                      }}
                    >
                      Надеть
                    </PaperButton>
                  ) : null}
                  {canUseDetail ? (
                    <PaperButton
                      type="button"
                      variant="accent"
                      className="min-w-[5rem] px-2 py-1.5 text-[10px] sm:text-[11px]"
                      onClick={() => {
                        if (detailSlot === null) return;
                        onUseConsumable(detailSlot);
                      }}
                    >
                      Использовать
                    </PaperButton>
                  ) : null}
                  {detailStack.qty > 1 ? (
                    <PaperButton
                      type="button"
                      variant="primary"
                      className="min-w-[5rem] px-2 py-1.5 text-[10px] sm:text-[11px]"
                      onClick={handleSplit}
                    >
                      Разделить (½)
                    </PaperButton>
                  ) : null}
                  <PaperButton
                    type="button"
                    variant="close"
                    className="min-w-[5rem] px-2 py-1.5 text-[10px] sm:text-[11px]"
                    onClick={handleDrop}
                  >
                    Выбросить
                  </PaperButton>
                </div>
              </>
            )}
          </div>

          <div
            role="region"
            aria-label="Выбросить предмет на землю"
            onDragOver={onGroundStripDragOver}
            onDragLeave={() => setHoverGroundStrip(false)}
            onDrop={onGroundStripDrop}
            className={`shrink-0 rounded-md border border-dashed px-2 py-2 text-center transition-colors ${
              hoverGroundStrip
                ? "border-[#2a8f6a] bg-[rgba(42,143,106,0.12)] ring-2 ring-[#2a8f6a]/50"
                : "border-[#5c4a32]/45 bg-[rgba(42,36,28,0.04)]"
            }`}
          >
            <p className="text-[10px] leading-snug text-[#6d6658] sm:text-[11px]">
              Перетащите сюда предмет из рюкзака — он появится на земле рядом с
              героем (как при «Выбросить» в карточке).
            </p>
          </div>

          <p className="shrink-0 border-t border-[#5c4a32]/25 pb-1 pt-2 text-center text-[10px] leading-snug text-[#5c5346] sm:text-[11px]">
            Слотов: {usableInvSlots} (база {BASE_INVENTORY_SLOTS}, предел сумки{" "}
            {MAX_INVENTORY_SLOTS}) ·{" "}
            <kbd className="rounded border border-[#5a5346]/60 bg-[#f4ecd8] px-1 font-mono text-[#2a241c]">
              I
            </kbd>{" "}
            — закрыть · перетащите на слот экипировки, чтобы надеть
          </p>
        </div>
      </div>
    </PaperModalChrome>
  );
}
