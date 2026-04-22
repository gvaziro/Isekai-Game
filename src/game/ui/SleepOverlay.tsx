"use client";

import { useEffect, useRef, useState } from "react";
import { SLEEP_CHANNEL_MS } from "@/src/game/data/balance";
import { useGameStore } from "@/src/game/state/gameStore";

export default function SleepOverlay({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [progress, setProgress] = useState(0);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (!open) {
      setProgress(0);
      return;
    }

    let cancelled = false;
    const t0 =
      typeof performance !== "undefined" && performance.now
        ? performance.now()
        : Date.now();

    const tick = () => {
      if (cancelled) return;
      const now =
        typeof performance !== "undefined" && performance.now
          ? performance.now()
          : Date.now();
      const elapsed = now - t0;
      const p = Math.min(1, elapsed / SLEEP_CHANNEL_MS);
      setProgress(p);
      if (p >= 1) {
        rafRef.current = null;
        useGameStore.getState().applySleepRecovery();
        window.dispatchEvent(
          new CustomEvent("nagibatop-toast", {
            detail: { message: "Вы выспались. Силы восстановлены." },
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
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        if (rafRef.current !== null) {
          cancelAnimationFrame(rafRef.current);
          rafRef.current = null;
        }
        setProgress(0);
        onClose();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, onClose]);

  if (!open) return null;

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
        <p className="mb-4 text-center text-sm text-zinc-200">
          Вы засыпаете… Не двигайтесь. Дождитесь конца полоски.
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
            onClose();
          }}
        >
          Прервать (Esc — без эффекта)
        </button>
      </div>
    </div>
  );
}
