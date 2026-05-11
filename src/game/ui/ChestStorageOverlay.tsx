"use client";

import {
  useCallback,
  useEffect,
  useState,
  type DragEvent,
} from "react";
import {
  CHEST_STORAGE_SLOTS,
  isDeathCorpseChestId,
} from "@/src/game/constants/gameplay";
import { isDungeonBossChestId } from "@/src/game/data/dungeonBoss";
import { getCuratedItem } from "@/src/game/data/itemRegistry";
import { ITEM_ATLAS } from "@/src/game/data/items.generated";
import {
  ItemAtlasIcon,
  type ItemAtlasFramesFile,
} from "@/src/game/ui/ItemAtlasIcon";
import {
  DEATH_CORPSE_CHEST_PANEL_SLOTS,
  useGameStore,
} from "@/src/game/state/gameStore";
import { PaperModalChrome } from "@/src/game/ui/paper/PaperChrome";
import { PaperSectionLabel } from "@/src/game/ui/paper/PaperSectionLabel";
import { PaperSlotChrome } from "@/src/game/ui/paper/PaperSlotChrome";

const CHEST_DRAG_MIME = "application/x-last-summon-chest-dnd";

type DragSource = { kind: "inv" | "chest"; index: number };

function parseChestDrag(e: DragEvent): DragSource | null {
  const raw =
    e.dataTransfer.getData(CHEST_DRAG_MIME) ||
    e.dataTransfer.getData("text/plain");
  if (!raw) return null;
  try {
    const j = JSON.parse(raw) as { kind?: unknown; index?: unknown };
    if (
      (j.kind === "inv" || j.kind === "chest") &&
      typeof j.index === "number" &&
      Number.isFinite(j.index)
    ) {
      return { kind: j.kind, index: j.index };
    }
  } catch {
    /* ignore */
  }
  return null;
}

export default function ChestStorageOverlay({
  open,
  chestId,
  chestX,
  chestY,
  onClose,
}: {
  open: boolean;
  chestId: string | null;
  chestX: number;
  chestY: number;
  onClose: () => void;
}) {
  const inventorySlots = useGameStore((s) => s.inventorySlots);
  const chestSlotsMap = useGameStore((s) => s.chestSlots);
  const swapSlots = useGameStore((s) => s.swapSlots);
  const swapChestSlots = useGameStore((s) => s.swapChestSlots);
  const moveBetweenInvAndChest = useGameStore((s) => s.moveBetweenInvAndChest);
  const applyTownChestLootSeedIfNeeded = useGameStore(
    (s) => s.applyTownChestLootSeedIfNeeded
  );
  const applyBossChestLootIfNeeded = useGameStore(
    (s) => s.applyBossChestLootIfNeeded
  );
  const grantXp = useGameStore((s) => s.grantXp);
  const markChestOpened = useGameStore((s) => s.markChestOpened);

  const [atlas, setAtlas] = useState<ItemAtlasFramesFile | null>(null);
  const [dragging, setDragging] = useState<DragSource | null>(null);
  const [hoverInv, setHoverInv] = useState<number | null>(null);
  const [hoverChest, setHoverChest] = useState<number | null>(null);

  const chestSlotCount =
    chestId && isDeathCorpseChestId(chestId)
      ? DEATH_CORPSE_CHEST_PANEL_SLOTS
      : CHEST_STORAGE_SLOTS;

  const chestRow =
    chestId && chestSlotsMap[chestId]
      ? chestSlotsMap[chestId]!
      : Array.from({ length: chestSlotCount }, () => null);

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
    if (!open || !chestId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, chestId, onClose]);

  useEffect(() => {
    if (!open || !chestId) return;

    const st = useGameStore.getState();
    st.ensureChestStorageRow(chestId);

    if (!isDeathCorpseChestId(chestId)) {
      let totalXp = 0;

      if (isDungeonBossChestId(chestId)) {
        const r = st.applyBossChestLootIfNeeded(chestId, chestX, chestY);
        if (r.applied) {
          totalXp += r.xp;
          if (r.toastLines.length > 0) {
            window.dispatchEvent(
              new CustomEvent("last-summon-toast", {
                detail: {
                  message:
                    r.xp > 0
                      ? `В сундуке: ${r.toastLines.join(", ")}`
                      : r.toastLines.join(", "),
                },
              })
            );
          }
        }
      } else {
        const xp = st.applyTownChestLootSeedIfNeeded(chestId);
        if (xp !== null) {
          totalXp += xp;
        }
      }

      if (totalXp > 0) {
        grantXp(totalXp);
      }

      const st2 = useGameStore.getState();
      if (!st2.openedChestIds[chestId]) {
        markChestOpened(chestId);
      }
    }
  }, [open, chestId, chestX, chestY, grantXp, markChestOpened]);

  useEffect(() => {
    if (!open) {
      setDragging(null);
      setHoverInv(null);
      setHoverChest(null);
    }
  }, [open]);

  const clearDragUi = useCallback(() => {
    setDragging(null);
    setHoverInv(null);
    setHoverChest(null);
  }, []);

  const onDragStart = useCallback((e: DragEvent, src: DragSource) => {
    const payload = JSON.stringify(src);
    e.dataTransfer.setData(CHEST_DRAG_MIME, payload);
    e.dataTransfer.setData("text/plain", payload);
    e.dataTransfer.effectAllowed = "move";
    setDragging(src);
  }, []);

  const onDropOnInv = useCallback(
    (e: DragEvent, index: number) => {
      e.preventDefault();
      const from = parseChestDrag(e);
      clearDragUi();
      if (from === null || !chestId) return;
      if (from.kind === "inv" && from.index === index) return;
      if (from.kind === "inv") {
        swapSlots(from.index, index);
      } else {
        moveBetweenInvAndChest(chestId, from, { kind: "inv", index });
      }
    },
    [chestId, clearDragUi, moveBetweenInvAndChest, swapSlots]
  );

  const onDropOnChest = useCallback(
    (e: DragEvent, index: number) => {
      e.preventDefault();
      const from = parseChestDrag(e);
      clearDragUi();
      if (from === null || !chestId) return;
      if (from.kind === "chest" && from.index === index) return;
      if (from.kind === "chest") {
        swapChestSlots(chestId, from.index, index);
      } else {
        moveBetweenInvAndChest(chestId, from, { kind: "chest", index });
      }
    },
    [chestId, clearDragUi, moveBetweenInvAndChest, swapChestSlots]
  );

  const cell = 44;

  if (!open || !chestId) return null;

  const corpseChest = chestId !== null && isDeathCorpseChestId(chestId);

  return (
    <PaperModalChrome
      title={corpseChest ? "У тела" : "Сундук"}
      onClose={onClose}
    >
      <div className="flex min-h-0 flex-1 flex-col gap-4 pb-2 pt-0.5 lg:flex-row">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2">
          <PaperSectionLabel>Рюкзак</PaperSectionLabel>
          <p className="text-[10px] leading-snug text-[#5c5346] sm:text-[11px]">
            {corpseChest
              ? "Перетащите вещи между рюкзаком и телом. Совпадающие стеки сливаются до лимита."
              : "Перетащите предметы между рюкзаком и сундуком. Совпадающие стаки сливаются до лимита стека."}
          </p>
          <div className="paper-scroll grid max-h-[min(36vh,280px)] grid-cols-4 gap-2 overflow-y-auto overflow-x-hidden pb-1 sm:grid-cols-6">
            {inventorySlots.map((stack, i) => {
              const def = stack ? getCuratedItem(stack.curatedId) : undefined;
              const hi =
                dragging !== null && hoverInv === i && dragging.index !== i;
              return (
                <button
                  key={i}
                  type="button"
                  title={
                    stack && def
                      ? `${def.name}${stack.qty > 1 ? ` ×${stack.qty}` : ""}`
                      : `Пустой слот ${i + 1}`
                  }
                  draggable={!!stack}
                  onDragStart={
                    stack
                      ? (e) => onDragStart(e, { kind: "inv", index: i })
                      : undefined
                  }
                  onDragEnd={clearDragUi}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = "move";
                    setHoverInv(i);
                    setHoverChest(null);
                  }}
                  onDrop={(e) => onDropOnInv(e, i)}
                  className={`select-none rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1b6b52] ${
                    hi
                      ? "ring-2 ring-[#2a8f6a] ring-offset-1 ring-offset-[#ebe3d2]"
                      : ""
                  } ${dragging?.kind === "inv" && dragging.index === i ? "opacity-55" : ""}`}
                >
                  <PaperSlotChrome
                    picked={dragging?.kind === "inv" && dragging.index === i}
                  >
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
        </div>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2">
          <PaperSectionLabel>
            {corpseChest ? "Вещи у тела" : "Хранилище сундука"}
          </PaperSectionLabel>
          <div className="paper-scroll grid max-h-[min(36vh,280px)] grid-cols-4 gap-2 overflow-y-auto overflow-x-hidden pb-1 sm:grid-cols-6">
            {Array.from({ length: chestSlotCount }, (_, i) => {
              const stack = chestRow[i] ?? null;
              const def = stack ? getCuratedItem(stack.curatedId) : undefined;
              const hi =
                dragging !== null &&
                hoverChest === i &&
                !(dragging.kind === "chest" && dragging.index === i);
              return (
                <button
                  key={i}
                  type="button"
                  title={
                    stack && def
                      ? `${def.name}${stack.qty > 1 ? ` ×${stack.qty}` : ""}`
                      : corpseChest
                        ? `У тела · слот ${i + 1}`
                        : `Сундук · слот ${i + 1}`
                  }
                  draggable={!!stack}
                  onDragStart={
                    stack
                      ? (e) => onDragStart(e, { kind: "chest", index: i })
                      : undefined
                  }
                  onDragEnd={clearDragUi}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = "move";
                    setHoverChest(i);
                    setHoverInv(null);
                  }}
                  onDrop={(e) => onDropOnChest(e, i)}
                  className={`select-none rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1b6b52] ${
                    hi
                      ? "ring-2 ring-[#2a8f6a] ring-offset-1 ring-offset-[#ebe3d2]"
                      : ""
                  } ${dragging?.kind === "chest" && dragging.index === i ? "opacity-55" : ""}`}
                >
                  <PaperSlotChrome
                    picked={
                      dragging?.kind === "chest" && dragging.index === i
                    }
                  >
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
        </div>
      </div>
    </PaperModalChrome>
  );
}
