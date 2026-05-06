"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  computeBuyUnitPrice,
  computeSellUnitPrice,
  getShopDefById,
  getShopEntry,
} from "@/src/game/data/shops";
import { getCuratedItem, getItemBasePrice } from "@/src/game/data/itemRegistry";
import { ITEM_ATLAS } from "@/src/game/data/items.generated";
import {
  ItemAtlasIcon,
  type ItemAtlasFramesFile,
} from "@/src/game/ui/ItemAtlasIcon";
import {
  BASE_INVENTORY_SLOTS,
  MAX_INVENTORY_SLOTS,
} from "@/src/game/constants/gameplay";
import type { InventoryStack } from "@/src/game/state/gameStore";
import { useGameStore } from "@/src/game/state/gameStore";
import { PaperModalChrome } from "@/src/game/ui/paper/PaperChrome";
import { PaperButton } from "@/src/game/ui/paper/PaperButton";
import { PaperSectionLabel } from "@/src/game/ui/paper/PaperSectionLabel";
import { PaperSlotChrome } from "@/src/game/ui/paper/PaperSlotChrome";

function toast(message: string): void {
  window.dispatchEvent(new CustomEvent("nagibatop-toast", { detail: { message } }));
}

export default function ShopOverlay({
  open,
  shopId,
  shopTitle,
  onClose,
}: {
  open: boolean;
  shopId: string;
  shopTitle: string;
  onClose: () => void;
}) {
  const inventorySlots = useGameStore((s) => s.inventorySlots);
  const gold = useGameStore((s) => s.character.gold);
  const characterLevel = useGameStore((s) => s.character.level);
  const shops = useGameStore((s) => s.shops);
  const touchShopRestock = useGameStore((s) => s.touchShopRestock);
  const buyFromShop = useGameStore((s) => s.buyFromShop);
  const sellToShop = useGameStore((s) => s.sellToShop);

  const [atlas, setAtlas] = useState<ItemAtlasFramesFile | null>(null);
  const [pickedInv, setPickedInv] = useState<number | null>(null);

  const shopDef = useMemo(() => getShopDefById(shopId), [shopId]);
  const visibleShopEntries = useMemo(() => {
    if (!shopDef) return [];
    return shopDef.entries.filter(
      (e) => (e.requiredLevel ?? 0) <= characterLevel
    );
  }, [shopDef, characterLevel]);
  const runtime = shops[shopId];

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
    if (!open || !shopDef) return;
    touchShopRestock(shopId);
  }, [open, shopId, shopDef, touchShopRestock]);

  const cell = 40;

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

  const runBuy = useCallback(
    (curatedId: string, qty: number) => {
      const r = buyFromShop(shopId, curatedId, qty);
      if (!r.ok && r.reason) toast(r.reason);
      touchShopRestock(shopId);
    },
    [buyFromShop, shopId, touchShopRestock]
  );

  const runSell = useCallback(
    (slotIndex: number, qty: number) => {
      const r = sellToShop(shopId, slotIndex, qty);
      if (!r.ok && r.reason) toast(r.reason);
      touchShopRestock(shopId);
      const st = useGameStore.getState().inventorySlots[slotIndex];
      if (!st) setPickedInv(null);
    },
    [sellToShop, shopId, touchShopRestock]
  );

  if (!open || !shopDef) return null;

  return (
    <PaperModalChrome title={shopTitle} onClose={onClose}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-[#5c4a32]/25 pb-3 text-[11px] text-[#4a4338] sm:text-xs">
        <span className="font-semibold text-[#3d2914]">
          Золото:{" "}
          <span className="font-mono tabular-nums">{Math.floor(gold)}</span>
        </span>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-4 lg:flex-row lg:gap-6">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2">
          <PaperSectionLabel>Товар торговца</PaperSectionLabel>
          <div className="paper-scroll flex max-h-[min(42vh,280px)] flex-col gap-2 overflow-y-auto pr-1">
            {visibleShopEntries.map((entry) => {
              const def = getCuratedItem(entry.curatedId);
              const base = getItemBasePrice(entry.curatedId);
              const unit = computeBuyUnitPrice(shopDef, entry, base);
              const avail = runtime?.stock[entry.curatedId] ?? entry.stock;
              const maxCash = unit > 0 ? Math.floor(gold / unit) : 0;
              const maxBuy = Math.min(avail, maxCash);
              const qty5 = Math.min(5, avail, maxCash);
              return (
                <div
                  key={entry.curatedId}
                  className="flex flex-wrap items-center gap-2 rounded-md border border-[#5c4a32]/20 bg-[rgba(42,36,28,0.06)] px-2 py-2 sm:gap-3"
                >
                  <PaperSlotChrome>
                    <ItemAtlasIcon
                      atlas={atlas}
                      frameKey={def?.atlasFrame ?? null}
                      cell={cell}
                    />
                  </PaperSlotChrome>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-xs font-semibold text-[#3d2914] sm:text-sm">
                      {def?.name ?? entry.curatedId}
                    </div>
                    <div className="mt-0.5 flex flex-wrap gap-x-3 text-[10px] text-[#6d6658] sm:text-[11px]">
                      <span>В наличии: {avail}</span>
                      <span>
                        Цена:{" "}
                        <span className="font-mono tabular-nums">{unit}</span>
                      </span>
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-1">
                    <PaperButton
                      type="button"
                      variant="accent"
                      className="!min-h-[28px] !px-2 !py-1 !text-[10px]"
                      disabled={avail < 1 || unit > gold}
                      onClick={() => runBuy(entry.curatedId, 1)}
                    >
                      ×1
                    </PaperButton>
                    <PaperButton
                      type="button"
                      variant="accent"
                      className="!min-h-[28px] !px-2 !py-1 !text-[10px]"
                      disabled={qty5 < 1}
                      onClick={() => runBuy(entry.curatedId, qty5)}
                    >
                      ×5
                    </PaperButton>
                    <PaperButton
                      type="button"
                      variant="accent"
                      className="!min-h-[28px] !px-2 !py-1 !text-[10px]"
                      disabled={maxBuy < 1}
                      onClick={() => runBuy(entry.curatedId, maxBuy)}
                    >
                      Всё
                    </PaperButton>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2 lg:max-w-[380px]">
          <PaperSectionLabel>Ваш инвентарь (продать торговцу)</PaperSectionLabel>
          <div className="paper-scroll grid max-h-[min(36vh,240px)] grid-cols-5 gap-2 overflow-y-auto sm:grid-cols-6">
            {inventorySlots.map((stack: InventoryStack | null, i: number) => {
              const def = stack ? getCuratedItem(stack.curatedId) : undefined;
              const sel = pickedInv === i;
              return (
                <button
                  key={i}
                  type="button"
                  aria-pressed={sel}
                  className={`rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1b6b52] ${
                    sel
                      ? "ring-2 ring-amber-700/80 ring-offset-1 ring-offset-[#ebe3d2]"
                      : ""
                  }`}
                  title={stack && def ? def.name : `Пустой слот ${i + 1}`}
                  onClick={() =>
                    setPickedInv((p) => (p === i ? null : stack ? i : null))
                  }
                  disabled={!stack}
                >
                  <PaperSlotChrome picked={sel}>
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
                </button>
              );
            })}
          </div>

          <div className="rounded-md border border-[#5c4a32]/25 bg-[rgba(42,36,28,0.06)] px-2 py-2 text-[11px] text-[#4a4338]">
            {pickedInv === null ||
            !inventorySlots[pickedInv] ? (
              <p className="text-center text-[#6d6658]">
                Выберите предмет из сетки, затем продайте пачку кнопками ниже.
              </p>
            ) : (
              (() => {
                const stack = inventorySlots[pickedInv]!;
                const idef = getCuratedItem(stack.curatedId);
                const base = getItemBasePrice(stack.curatedId);
                const entry = getShopEntry(shopDef, stack.curatedId);
                const unitSell =
                  base > 0
                    ? computeSellUnitPrice(shopDef, entry, base)
                    : 0;
                const sqty = stack.qty;
                return (
                  <>
                    <div className="font-semibold text-[#3d2914]">
                      {idef?.name ?? stack.curatedId}
                    </div>
                    <div className="mt-1 text-[10px] text-[#6d6658]">
                      Выкуп за шт.:{" "}
                      <span className="font-mono tabular-nums text-[#4a4338]">
                        {unitSell}
                      </span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1">
                      <PaperButton
                        type="button"
                        variant="primary"
                        className="!min-h-[28px] !px-2 !py-1 !text-[10px]"
                        disabled={unitSell < 1}
                        onClick={() => runSell(pickedInv!, 1)}
                      >
                        Продать ×1
                      </PaperButton>
                      <PaperButton
                        type="button"
                        variant="primary"
                        className="!min-h-[28px] !px-2 !py-1 !text-[10px]"
                        disabled={unitSell < 1 || sqty < 2}
                        onClick={() =>
                          runSell(pickedInv!, Math.min(5, sqty))
                        }
                      >
                        ×5
                      </PaperButton>
                      <PaperButton
                        type="button"
                        variant="primary"
                        className="!min-h-[28px] !px-2 !py-1 !text-[10px]"
                        disabled={unitSell < 1 || sqty < 1}
                        onClick={() => runSell(pickedInv!, sqty)}
                      >
                        Всё ({sqty})
                      </PaperButton>
                    </div>
                  </>
                );
              })()
            )}
          </div>
          <p className="text-[10px] leading-snug text-[#6d6658]">
            Слоты рюкзака: база{" "}
            <span className="font-mono tabular-nums">
              {BASE_INVENTORY_SLOTS}
            </span>
            , максимум с рюкзаком-расширением{" "}
            <span className="font-mono tabular-nums">
              {MAX_INVENTORY_SLOTS}
            </span>
            . Цены зависят от базовой стоимости предмета и политики лавки.
          </p>
        </div>
      </div>
    </PaperModalChrome>
  );
}
