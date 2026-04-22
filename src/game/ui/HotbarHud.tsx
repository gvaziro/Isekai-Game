"use client";

import { useEffect, useRef, useState } from "react";
import {
  HOTBAR_SLOT_COUNT,
  HOTBAR_WHEEL_NUDGE_EVENT,
} from "@/src/game/constants/gameplay";
import { ITEM_ATLAS } from "@/src/game/data/items.generated";
import {
  getConsumableCooldownMs,
  getCuratedItem,
  itemSlotSupportsUsableEffect,
} from "@/src/game/data/itemRegistry";
import {
  ItemAtlasIcon,
  type ItemAtlasFramesFile,
} from "@/src/game/ui/ItemAtlasIcon";
import { useGameStore } from "@/src/game/state/gameStore";

export default function HotbarHud() {
  const inventorySlots = useGameStore((s) => s.inventorySlots);
  const cooldownUntil = useGameStore((s) => s.consumableCooldownUntil);
  const selected = useGameStore((s) => s.hotbarSelectedIndex);
  const setHotbarSelectedIndex = useGameStore((s) => s.setHotbarSelectedIndex);
  const [atlas, setAtlas] = useState<ItemAtlasFramesFile | null>(null);
  const [wheelHint, setWheelHint] = useState<string | null>(null);
  const wheelHintHideRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [, setNowTick] = useState(0);

  useEffect(() => {
    if (!ITEM_ATLAS.available) return;
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
  }, []);

  useEffect(() => {
    const showHintAfterWheel = () => {
      const st = useGameStore.getState();
      const idx = st.hotbarSelectedIndex;
      const stack = st.inventorySlots[idx];
      const def = stack ? getCuratedItem(stack.curatedId) : undefined;
      const line =
        stack && def
          ? `${def.name}${stack.qty > 1 ? ` ×${stack.qty}` : ""}`
          : "Пусто";
      setWheelHint(`Слот ${idx + 1} · ${line}`);
      if (wheelHintHideRef.current) clearTimeout(wheelHintHideRef.current);
      wheelHintHideRef.current = setTimeout(() => {
        setWheelHint(null);
        wheelHintHideRef.current = null;
      }, 1600);
    };
    window.addEventListener(HOTBAR_WHEEL_NUDGE_EVENT, showHintAfterWheel);
    return () => {
      window.removeEventListener(HOTBAR_WHEEL_NUDGE_EVENT, showHintAfterWheel);
      if (wheelHintHideRef.current) clearTimeout(wheelHintHideRef.current);
    };
  }, []);

  useEffect(() => {
    const anyCd = Object.values(cooldownUntil).some((t) => t > Date.now());
    if (!anyCd) return;
    const id = window.setInterval(() => setNowTick((n) => n + 1), 80);
    return () => window.clearInterval(id);
  }, [cooldownUntil]);

  const cell = 40;
  const timeNow = Date.now();

  return (
    <div className="pointer-events-auto absolute bottom-2 left-1/2 z-[35] flex max-w-[calc(100%-1rem)] -translate-x-1/2 flex-col items-center gap-0.5">
      {wheelHint ? (
        <div
          className="pointer-events-none max-w-[min(100vw-2rem,320px)] truncate rounded-md border border-zinc-600/90 bg-zinc-900/95 px-2 py-1 text-center text-[11px] font-medium text-zinc-100 shadow-md ring-1 ring-black/30"
          role="status"
          aria-live="polite"
        >
          {wheelHint}
        </div>
      ) : null}
      <div
        className="flex gap-1 rounded-lg border border-zinc-700/90 bg-zinc-950/90 px-1.5 py-1 shadow-lg backdrop-blur-sm sm:gap-1.5 sm:px-2"
        role="toolbar"
        aria-label="Быстрый доступ"
      >
        {Array.from({ length: HOTBAR_SLOT_COUNT }, (_, i) => {
          const stack = inventorySlots[i];
          const def = stack ? getCuratedItem(stack.curatedId) : undefined;
          const isSel = i === selected;
          const title =
            stack && def
              ? `${def.name}${stack.qty > 1 ? ` ×${stack.qty}` : ""} · слот ${i + 1}`
              : `Пусто · слот ${i + 1}`;
          const id = stack?.curatedId;
          const cdTotal =
            id && def && itemSlotSupportsUsableEffect(def.slot)
              ? getConsumableCooldownMs(id)
              : 0;
          const cdEnd = id ? (cooldownUntil[id] ?? 0) : 0;
          const remaining =
            cdTotal > 0 && cdEnd > timeNow
              ? Math.min(cdTotal, cdEnd - timeNow)
              : 0;
          const cdRatio = cdTotal > 0 ? remaining / cdTotal : 0;
          const cdSec = remaining > 0 ? Math.ceil(remaining / 1000) : 0;

          return (
            <button
              key={i}
              type="button"
              title={title}
              aria-pressed={isSel}
              aria-label={`Слот ${i + 1}`}
              onClick={() => setHotbarSelectedIndex(i)}
              className={`relative shrink-0 overflow-hidden rounded-md border transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-emerald-500/80 ${
                isSel
                  ? "border-amber-500/90 bg-amber-950/50 ring-1 ring-amber-400/60"
                  : "border-zinc-700/80 bg-zinc-900/60 hover:border-zinc-600"
              }`}
            >
              <ItemAtlasIcon
                atlas={atlas}
                frameKey={def?.atlasFrame ?? null}
                cell={cell}
              />
              {remaining > 0 && cdTotal > 0 ? (
                <>
                  <div
                    className="pointer-events-none absolute inset-x-0 top-0 z-[5] bg-zinc-950/72 backdrop-blur-[0.5px]"
                    style={{ height: `${cdRatio * 100}%` }}
                    aria-hidden
                  />
                  <span className="pointer-events-none absolute inset-0 z-[6] flex items-center justify-center text-[10px] font-bold tabular-nums text-zinc-100 drop-shadow-[0_0_3px_rgba(0,0,0,0.95)]">
                    {cdSec}
                  </span>
                </>
              ) : null}
              {stack && stack.qty > 1 ? (
                <span className="pointer-events-none absolute bottom-0.5 right-0.5 z-[8] text-[9px] font-bold text-zinc-100 drop-shadow-[0_0_2px_rgba(0,0,0,0.9)]">
                  {stack.qty}
                </span>
              ) : null}
              <span className="pointer-events-none absolute -top-0.5 left-0.5 z-[8] text-[7px] font-mono text-zinc-500">
                {i + 1}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
