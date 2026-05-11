"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { isElectronClient } from "@/src/game/desktop";
import { flushElectronProfileWrites } from "@/src/game/saves/electronProfileStateStorage";
import { useGameStore, waitForGameStoreHydration } from "@/src/game/state/gameStore";
import {
  resetLoreJournalToNewGame,
  waitForLoreJournalHydration,
} from "@/src/game/state/loreJournalStore";
import {
  resetNpcDialogueProgressToNewGame,
  waitForNpcDialogueProgressHydration,
} from "@/src/game/state/npcDialogueProgressStore";
import {
  resetQuestsToNewGame,
  waitForQuestStoreHydration,
} from "@/src/game/state/questStore";
import { OPEN_LOAD_GAME_PANEL_SESSION_KEY } from "@/src/game/constants/gameplay";

const DEV_LINKS: readonly { href: string; label: string }[] = [
  { href: "/dev/map-editor", label: "Редактор карты" },
  { href: "/dev/character-editor", label: "Редактор персонажей" },
  { href: "/dev/tileset-atlas", label: "Карта тайлсетов" },
  { href: "/dev/items", label: "Каталог предметов" },
  { href: "/dev/buffs", label: "Менеджер бафов" },
  { href: "/dev/enemies", label: "Редактор врагов" },
  { href: "/dev/recipes", label: "Рецепты крафта" },
];

const panelClass =
  "overflow-hidden rounded-2xl border border-amber-200/15 bg-zinc-950/70 shadow-[0_25px_50px_-12px_rgba(0,0,0,0.85)] backdrop-blur-xl";

const menuItemClass =
  "flex min-h-[3.25rem] w-full items-center justify-center px-8 py-4 text-lg font-semibold tracking-wide text-amber-50 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] transition-colors hover:bg-white/10 hover:text-amber-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-amber-400/80";

const menuItemMutedClass =
  "flex min-h-[2.75rem] w-full items-center justify-center px-6 py-2.5 text-sm font-medium tracking-wide text-zinc-200/95 transition-colors hover:bg-white/8 hover:text-zinc-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-zinc-400/70";

const summaryClass =
  "flex min-h-[3rem] w-full cursor-pointer list-none items-center justify-between gap-3 px-6 py-3 text-sm font-semibold uppercase tracking-[0.18em] text-amber-600/95 transition-colors hover:bg-white/6 hover:text-amber-500 [&::-webkit-details-marker]:hidden";

export default function HomePlayMenu() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const onNewGame = useCallback(async () => {
    if (
      !window.confirm(
        "Стереть весь прогресс и начать сначала? Текущее сохранение будет удалено."
      )
    ) {
      return;
    }
    setBusy(true);
    try {
      await Promise.all([
        waitForGameStoreHydration(),
        waitForLoreJournalHydration(),
        waitForNpcDialogueProgressHydration(),
        waitForQuestStoreHydration(),
      ]);
      resetQuestsToNewGame();
      resetLoreJournalToNewGame();
      resetNpcDialogueProgressToNewGame();
      useGameStore.getState().resetToNewGame();
      if (isElectronClient()) {
        await flushElectronProfileWrites();
      }
      router.push("/game");
    } catch (e) {
      console.warn("[HomePlayMenu] new game", e);
      resetQuestsToNewGame();
      resetLoreJournalToNewGame();
      resetNpcDialogueProgressToNewGame();
      useGameStore.getState().resetToNewGame();
      if (isElectronClient()) {
        await flushElectronProfileWrites();
      }
      router.push("/game");
    } finally {
      setBusy(false);
    }
  }, [router]);

  return (
    <nav
      className={`select-none ${panelClass}`}
      aria-label="Главное меню"
    >
      <ul className="divide-y divide-amber-950/35">
        <li>
          <Link href="/game" className={menuItemClass}>
            Продолжить
          </Link>
        </li>
        <li>
          <Link
            href="/game"
            className={menuItemClass}
            onClick={() => {
              try {
                sessionStorage.setItem(OPEN_LOAD_GAME_PANEL_SESSION_KEY, "1");
              } catch {
                /* ignore */
              }
            }}
          >
            Загрузка
          </Link>
        </li>
        <li>
          <button
            type="button"
            disabled={busy}
            className={`${menuItemClass} disabled:cursor-wait disabled:opacity-60`}
            onClick={() => void onNewGame()}
          >
            {busy ? "Подготовка…" : "Новая игра"}
          </button>
        </li>
      </ul>

      {process.env.NODE_ENV === "development" ? (
        <details className="group border-t border-amber-950/40">
          <summary className={summaryClass}>
            <span>Разработка — инструменты</span>
            <span
              className="inline-block shrink-0 text-[10px] text-amber-500/90 transition-transform duration-200 group-open:rotate-180"
              aria-hidden
            >
              ▼
            </span>
          </summary>
          <ul className="divide-y divide-amber-950/30 border-t border-amber-950/25 bg-black/25">
            {DEV_LINKS.map(({ href, label }) => (
              <li key={href}>
                <Link href={href} className={menuItemMutedClass}>
                  {label}
                </Link>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </nav>
  );
}
