"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useState } from "react";
import {
  useGameStore,
} from "@/src/game/state/gameStore";
import { resetLoreJournalToNewGame } from "@/src/game/state/loreJournalStore";
import { resetQuestsToNewGame } from "@/src/game/state/questStore";

const GameRoot = dynamic(() => import("@/src/game/GameRoot"), {
  ssr: false,
  loading: () => (
    <p className="text-sm text-zinc-500">Загрузка движка…</p>
  ),
});

export default function GameShell() {
  const [gameMountKey, setGameMountKey] = useState(0);

  const handleNewGame = useCallback(() => {
    if (
      !window.confirm(
        "Стереть весь прогресс и начать сначала? Текущее сохранение будет удалено."
      )
    ) {
      return;
    }
    resetQuestsToNewGame();
    resetLoreJournalToNewGame();
    useGameStore.getState().resetToNewGame();
    setGameMountKey((k) => k + 1);
  }, []);

  return (
    <div className="flex w-full max-w-[1152px] flex-1 flex-col items-center gap-4">
      <div className="flex w-full flex-col gap-3 rounded-lg border border-zinc-800 bg-zinc-900/60 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 flex-col gap-1 sm:flex-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <Link
              href="/"
              className="shrink-0 text-sm text-emerald-400 hover:text-emerald-300"
            >
              ← На главную
            </Link>
            <span className="text-sm font-medium text-zinc-200">
              Локация (прототип)
            </span>
          </div>
          <p className="text-xs text-zinc-500">
            WASD / стрелки — ходить,{" "}
            <kbd className="rounded bg-zinc-800 px-0.5">E</kbd> — действие,{" "}
            <kbd className="rounded bg-zinc-800 px-0.5">I</kbd> инвентарь,{" "}
            <kbd className="rounded bg-zinc-800 px-0.5">J</kbd> квесты,{" "}
            <kbd className="rounded bg-zinc-800 px-0.5">K</kbd> дневник
            знаний,{" "}
            <kbd className="rounded bg-zinc-800 px-0.5">Z</kbd> — сон (деревня / лес /
            дорога за деревней: длительность ползунком, шаг 30 мин),{" "}
            <kbd className="rounded bg-zinc-800 px-0.5">M</kbd> — карта подземелья
            (в катакомбах),{" "}
            <kbd className="rounded bg-zinc-800 px-0.5">Alt+Enter</kbd> — на весь
            экран. Прогресс сохраняется сам.
          </p>
        </div>
        <button
          type="button"
          className="shrink-0 rounded-lg border border-amber-800 bg-amber-950/80 px-3 py-2 text-xs font-semibold text-amber-100 hover:bg-amber-900/90"
          onClick={handleNewGame}
        >
          Новая игра
        </button>
      </div>

      <GameRoot key={gameMountKey} />
    </div>
  );
}
