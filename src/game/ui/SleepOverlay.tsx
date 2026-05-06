"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  computeSleepChannelRealMs,
  SLEEP_FULL_RECOVERY_GAME_MINUTES,
} from "@/src/game/data/balance";
import { useGameStore } from "@/src/game/state/gameStore";
import {
  addGameMinutesToClock,
  formatClockHoursMinutes,
  formatWorldHudLine,
  MIN_SLEEP_GAME_MINUTES,
} from "@/src/game/time/dayNight";

/** Один шаг ползунка = 30 игровых минут (полчаса), только целые шаги */
const GAME_MINUTES_PER_SLOT = 30;
const MIN_SLEEP_SLOTS = Math.max(
  1,
  Math.ceil(MIN_SLEEP_GAME_MINUTES / GAME_MINUTES_PER_SLOT)
);
const MAX_SLEEP_SLOTS = 24 * 2;

function formatSleepSlotsRu(slots: number): string {
  const h = Math.floor(slots / 2);
  const half = slots % 2;
  if (half === 0) return `${h} ч`;
  if (h === 0) return "30 мин";
  return `${h} ч 30 мин`;
}

type Phase = "pick" | "channel";

export default function SleepOverlay({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [phase, setPhase] = useState<Phase>("pick");
  const [sleepSlots, setSleepSlots] = useState(16);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const rafRef = useRef<number | null>(null);
  const channelMsRef = useRef(5000);
  const pendingWakeRef = useRef<{ worldDay: number; worldTimeMinutes: number }>(
    { worldDay: 1, worldTimeMinutes: 0 }
  );
  const pendingSleepMinRef = useRef(480);

  const worldDay = useGameStore((s) => s.worldDay);
  const worldTimeMinutes = useGameStore((s) => s.worldTimeMinutes);

  useEffect(() => {
    if (!open) {
      setPhase("pick");
      setProgress(0);
      setError(null);
      return;
    }
    setSleepSlots(16);
  }, [open]);

  const nowClock = useMemo(
    () => ({ worldDay, worldTimeMinutes }),
    [worldDay, worldTimeMinutes]
  );

  const sleepGameMinutes = sleepSlots * GAME_MINUTES_PER_SLOT;
  const wakePreview = useMemo(
    () => addGameMinutesToClock(nowClock, sleepGameMinutes),
    [nowClock, sleepGameMinutes]
  );

  const startChannel = () => {
    const st = useGameStore.getState();
    const cur = {
      worldDay: st.worldDay,
      worldTimeMinutes: st.worldTimeMinutes,
    };
    const minutes = sleepSlots * GAME_MINUTES_PER_SLOT;
    if (minutes < MIN_SLEEP_GAME_MINUTES) {
      setError(
        `Сон слишком короткий: минимум ${formatSleepSlotsRu(MIN_SLEEP_SLOTS)} игрового времени.`
      );
      return;
    }
    setError(null);
    const wake = addGameMinutesToClock(cur, minutes);
    pendingWakeRef.current = wake;
    pendingSleepMinRef.current = minutes;
    channelMsRef.current = computeSleepChannelRealMs(minutes);
    setProgress(0);
    setPhase("channel");
  };

  useEffect(() => {
    if (!open || phase !== "channel") return;

    let cancelled = false;
    const t0 =
      typeof performance !== "undefined" && performance.now
        ? performance.now()
        : Date.now();
    const dur = channelMsRef.current;

    const tick = () => {
      if (cancelled) return;
      const now =
        typeof performance !== "undefined" && performance.now
          ? performance.now()
          : Date.now();
      const elapsed = now - t0;
      const p = Math.min(1, elapsed / dur);
      setProgress(p);
      if (p >= 1) {
        rafRef.current = null;
        useGameStore
          .getState()
          .applySleepSchedule(
            pendingWakeRef.current,
            pendingSleepMinRef.current
          );
        const w = pendingWakeRef.current;
        const full =
          pendingSleepMinRef.current >= SLEEP_FULL_RECOVERY_GAME_MINUTES;
        window.dispatchEvent(
          new CustomEvent("nagibatop-toast", {
            detail: {
              message: full
                ? `Вы проснулись (${formatWorldHudLine(w)}). Силы восстановлены.`
                : `Вы проснулись (${formatWorldHudLine(w)}). Отдых короткий — восстановление частичное.`,
            },
          })
        );
        onClose();
        return;
      }
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      cancelled = true;
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [open, phase, onClose]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      setProgress(0);
      if (phase === "channel") {
        setPhase("pick");
      } else {
        onClose();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, onClose, phase]);

  if (!open) return null;

  const nowLine = formatWorldHudLine(nowClock);
  const pct = Math.round(progress * 100);

  return (
    <div
      className="pointer-events-auto fixed inset-0 z-[97] flex flex-col items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Отдых"
    >
      <div className="w-full max-w-sm rounded-xl border border-indigo-900/50 bg-zinc-950/96 p-6 shadow-2xl">
        <p className="mb-1 text-center text-[10px] font-semibold uppercase tracking-[0.2em] text-indigo-400/90">
          Сон
        </p>
        {phase === "pick" ? (
          <>
            <p className="mb-1 text-center text-xs text-zinc-300">
              Засыпаете <span className="font-semibold text-zinc-100">сейчас</span>
              .
            </p>
            <p className="mb-4 text-center text-[11px] text-zinc-500">{nowLine}</p>
            <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
              Сколько спать (игровое время, шаг 30 мин)
            </label>
            <div className="mb-2 flex items-center gap-3">
              <input
                type="range"
                className="h-2 flex-1 cursor-pointer accent-indigo-500"
                min={MIN_SLEEP_SLOTS}
                max={MAX_SLEEP_SLOTS}
                step={1}
                value={Math.min(
                  MAX_SLEEP_SLOTS,
                  Math.max(MIN_SLEEP_SLOTS, sleepSlots)
                )}
                onChange={(e) =>
                  setSleepSlots(Number.parseInt(e.target.value, 10))
                }
              />
              <span className="min-w-[5.5rem] shrink-0 text-right font-mono text-sm text-zinc-200">
                {formatSleepSlotsRu(sleepSlots)}
              </span>
            </div>
            <div className="mb-3 flex flex-wrap gap-2">
              <button
                type="button"
                className="rounded border border-zinc-600 px-2 py-1 text-[10px] text-zinc-300 hover:bg-zinc-800"
                onClick={() => setSleepSlots(8)}
              >
                4 ч
              </button>
              <button
                type="button"
                className="rounded border border-zinc-600 px-2 py-1 text-[10px] text-zinc-300 hover:bg-zinc-800"
                onClick={() => setSleepSlots(12)}
              >
                6 ч
              </button>
              <button
                type="button"
                className="rounded border border-zinc-600 px-2 py-1 text-[10px] text-zinc-300 hover:bg-zinc-800"
                onClick={() => setSleepSlots(16)}
              >
                8 ч
              </button>
            </div>
            <p className="mb-3 text-center text-[11px] text-zinc-400">
              Проснётесь: день {wakePreview.worldDay}{" "}
              {formatClockHoursMinutes(wakePreview.worldTimeMinutes)} (
              {sleepGameMinutes} мин игр.)
            </p>
            {error ? (
              <p className="mb-3 text-center text-xs text-rose-400">{error}</p>
            ) : null}
            <button
              type="button"
              className="mb-2 w-full rounded-lg bg-indigo-600 py-2 text-sm font-medium text-white hover:bg-indigo-500"
              onClick={startChannel}
            >
              Уснуть
            </button>
            <button
              type="button"
              className="w-full rounded-lg border border-zinc-600 py-2 text-xs text-zinc-300 hover:bg-zinc-800"
              onClick={onClose}
            >
              Отмена
            </button>
          </>
        ) : (
          <>
            <p className="mb-4 text-center text-sm text-zinc-200">
              Вы засыпаете… Дождитесь конца полоски.
            </p>
            <div className="mb-2 h-2 w-full overflow-hidden rounded-full bg-zinc-800 ring-1 ring-zinc-600">
              <div
                className="h-full rounded-full bg-indigo-500 transition-[width] duration-75"
                style={{ width: `${pct}%` }}
              />
            </div>
            <p className="mb-4 text-center font-mono text-xs text-zinc-400">{pct}%</p>
            <button
              type="button"
              className="w-full rounded-lg border border-zinc-600 py-2 text-xs text-zinc-300 hover:bg-zinc-800"
              onClick={() => {
                if (rafRef.current !== null) {
                  cancelAnimationFrame(rafRef.current);
                  rafRef.current = null;
                }
                setProgress(0);
                setPhase("pick");
              }}
            >
              Прервать (Esc — назад к настройке)
            </button>
          </>
        )}
      </div>
    </div>
  );
}
