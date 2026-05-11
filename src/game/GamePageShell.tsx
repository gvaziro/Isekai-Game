"use client";

import {
  Suspense,
  lazy,
  useCallback,
  useState,
} from "react";
import { useIsElectronClient } from "@/src/game/hooks/useIsElectronClient";
import { useGameStore } from "@/src/game/state/gameStore";
import { isElectronClient } from "@/src/game/desktop";
import { flushElectronProfileWrites } from "@/src/game/saves/electronProfileStateStorage";
import { resetLoreJournalToNewGame } from "@/src/game/state/loreJournalStore";
import { resetNpcDialogueProgressToNewGame } from "@/src/game/state/npcDialogueProgressStore";
import { resetQuestsToNewGame } from "@/src/game/state/questStore";

const GameRoot = lazy(() => import("@/src/game/GameRoot"));

export default function GamePageShell() {
  const electron = useIsElectronClient();

  const [gameMountKey, setGameMountKey] = useState(0);

  const handleNewGame = useCallback(async () => {
    if (
      !window.confirm(
        "Стереть весь прогресс и начать сначала? Текущее сохранение будет удалено."
      )
    ) {
      return;
    }
    resetQuestsToNewGame();
    resetLoreJournalToNewGame();
    resetNpcDialogueProgressToNewGame();
    useGameStore.getState().resetToNewGame();
    if (isElectronClient()) {
      await flushElectronProfileWrites();
    }
    setGameMountKey((k) => k + 1);
  }, []);

  return (
    <div
      className={
        electron
          ? "flex h-full min-h-0 w-full flex-1 flex-col gap-0"
          : "flex w-full max-w-[1152px] flex-1 flex-col items-center gap-4"
      }
    >
      {!electron ? (
        <div className="flex w-full flex-col gap-3 rounded-lg border border-zinc-800 bg-zinc-900/60 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 flex-col gap-1 sm:flex-1">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- оболочка игры без next/link (Electron и др.) */}
              <a
                href="/"
                className="shrink-0 text-sm text-emerald-400 hover:text-emerald-300"
              >
                ← На главную
              </a>
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
              <kbd className="rounded bg-zinc-800 px-0.5">Z</kbd> — сон (деревня /
              лес / дорога за деревней: длительность ползунком, шаг 30 мин),{" "}
              <kbd className="rounded bg-zinc-800 px-0.5">M</kbd> — карта
              подземелья (в катакомбах),{" "}
              <kbd className="rounded bg-zinc-800 px-0.5">Alt+Enter</kbd> — на
              весь экран. Прогресс сохраняется сам.
            </p>
          </div>
          <button
            type="button"
            className="shrink-0 rounded-lg border border-amber-800 bg-amber-950/80 px-3 py-2 text-xs font-semibold text-amber-100 hover:bg-amber-900/90"
            onClick={() => void handleNewGame()}
          >
            Новая игра
          </button>
        </div>
      ) : null}

      <Suspense
        fallback={
          <p
            className={
              electron
                ? "flex flex-1 items-center justify-center text-sm text-zinc-500"
                : "text-sm text-zinc-500"
            }
          >
            Загрузка движка…
          </p>
        }
      >
        <GameRoot key={gameMountKey} />
      </Suspense>
    </div>
  );
}
