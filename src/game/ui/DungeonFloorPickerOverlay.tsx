"use client";

import {
  DUNGEON_MAX_FLOOR,
  fastTravelAnchorsAvailable,
  getMaxEnterableFloor,
} from "@/src/game/data/dungeonFloorScaling";
import { useGameStore } from "@/src/game/state/gameStore";

export default function DungeonFloorPickerOverlay({
  open,
  spawnId,
  onClose,
}: {
  open: boolean;
  spawnId: string;
  onClose: () => void;
}) {
  const maxCleared = useGameStore((s) => s.dungeonMaxClearedFloor);
  const enterDungeonFloor = useGameStore((s) => s.enterDungeonFloor);

  if (!open) return null;

  const maxEnterable = getMaxEnterableFloor(maxCleared);
  const anchors = fastTravelAnchorsAvailable(maxCleared);
  const nextLabel = maxEnterable;

  const choose = (floor: number) => {
    const r = enterDungeonFloor(floor);
    if (!r.ok) {
      window.dispatchEvent(
        new CustomEvent("nagibatop-toast", {
          detail: { message: r.reason ?? "Нельзя войти на этот этаж" },
        })
      );
      return;
    }
    window.dispatchEvent(
      new CustomEvent("nagibatop-dungeon-enter", {
        detail: { spawnId },
      })
    );
    onClose();
  };

  return (
    <div
      className="pointer-events-auto fixed inset-0 z-[96] flex flex-col items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Выбор этажа подземелья"
    >
      <div className="max-h-[min(88vh,720px)] w-full max-w-md overflow-y-auto rounded-xl border border-violet-900/50 bg-zinc-950/96 p-5 shadow-2xl">
        <p className="mb-1 text-center text-[10px] font-semibold uppercase tracking-[0.18em] text-violet-400/90">
          Катакомбы
        </p>
        <h2 className="mb-3 text-center text-base font-semibold text-zinc-100">
          Куда спускаемся?
        </h2>
        <p className="mb-4 text-center text-xs leading-relaxed text-zinc-400">
          Пройдено этажей:{" "}
          <span className="font-mono text-violet-200">{maxCleared}</span> /{" "}
          {DUNGEON_MAX_FLOOR}. Следующий по сюжету:{" "}
          <span className="font-mono text-violet-200">{nextLabel}</span>.
        </p>

        <p className="mb-2 text-xs font-medium text-zinc-300">Обычный маршрут</p>
        <div className="mb-4 flex flex-wrap gap-2">
          {Array.from({ length: maxEnterable }, (_, i) => i + 1).map((f) => (
            <button
              key={f}
              type="button"
              className={
                f === maxCleared + 1
                  ? "rounded-lg border border-emerald-600 bg-emerald-950/80 px-3 py-2 text-sm font-semibold text-emerald-100 shadow-[0_0_22px_rgba(52,211,153,0.35)] ring-2 ring-emerald-400/45 ring-offset-2 ring-offset-zinc-950 animate-pulse hover:bg-emerald-900/90"
                  : "rounded-lg border border-zinc-700 bg-zinc-900/80 px-3 py-2 text-sm text-zinc-200 hover:border-violet-700/50 hover:bg-zinc-800"
              }
              onClick={() => choose(f)}
            >
              Этаж {f}
              {f <= maxCleared ? (
                <span className="ml-1 text-[10px] font-normal text-zinc-500">
                  (повтор)
                </span>
              ) : null}
            </button>
          ))}
        </div>

        {anchors.length > 0 ? (
          <>
            <p className="mb-2 text-xs font-medium text-zinc-300">
              Быстрый переход{" "}
              <span className="font-normal text-zinc-500">
                (открыто после зачистки этажа)
              </span>
            </p>
            <div className="mb-4 flex flex-wrap gap-2">
              {anchors.map((k) => (
                <button
                  key={k}
                  type="button"
                  className="rounded-lg border border-amber-800/80 bg-amber-950/50 px-3 py-2 text-sm font-medium text-amber-100 hover:bg-amber-900/70"
                  onClick={() => choose(k)}
                >
                  → {k}
                </button>
              ))}
            </div>
          </>
        ) : null}

        <button
          type="button"
          className="w-full rounded-md border border-zinc-600 py-2 text-xs text-zinc-400 hover:bg-zinc-800"
          onClick={onClose}
        >
          Отмена
        </button>
      </div>
    </div>
  );
}
