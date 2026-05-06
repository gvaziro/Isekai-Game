"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { useGameStore, waitForGameStoreHydration } from "@/src/game/state/gameStore";
import {
  resetQuestsToNewGame,
  waitForQuestStoreHydration,
} from "@/src/game/state/questStore";

const menuItemClass =
  "flex w-full items-center justify-center px-6 py-3.5 text-[15px] font-medium tracking-wide text-amber-100 shadow-[0_1px_3px_rgba(0,0,0,0.95),0_0_24px_rgba(0,0,0,0.65)] transition-colors hover:bg-black/35 hover:text-amber-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400/90";

const menuItemMutedClass =
  "flex w-full items-center justify-center px-6 py-2.5 text-xs font-medium tracking-wide text-zinc-300/95 shadow-[0_1px_3px_rgba(0,0,0,0.95)] transition-colors hover:bg-black/35 hover:text-zinc-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-400/80";

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
        waitForQuestStoreHydration(),
      ]);
      resetQuestsToNewGame();
      useGameStore.getState().resetToNewGame();
      router.push("/game");
    } catch (e) {
      console.warn("[HomePlayMenu] new game", e);
      resetQuestsToNewGame();
      useGameStore.getState().resetToNewGame();
      router.push("/game");
    } finally {
      setBusy(false);
    }
  }, [router]);

  return (
    <nav
      className="select-none rounded-md border border-amber-900/60"
      aria-label="Главное меню"
    >
      <ul className="divide-y divide-amber-950/45">
        <li>
          <Link href="/game" className={menuItemClass}>
            Продолжить
          </Link>
        </li>
        <li>
          <button
            type="button"
            disabled={busy}
            className={`${menuItemClass} disabled:cursor-wait disabled:opacity-70`}
            onClick={() => void onNewGame()}
          >
            {busy ? "Подготовка…" : "Новая игра"}
          </button>
        </li>
      </ul>

      {process.env.NODE_ENV === "development" ? (
        <>
          <p className="border-t border-amber-950/45 px-4 py-2 text-center text-[10px] font-semibold uppercase tracking-[0.2em] text-amber-700/90">
            Разработка
          </p>
          <ul className="divide-y divide-amber-950/35 border-t border-amber-950/35">
            <li>
              <Link href="/dev/map-editor" className={menuItemMutedClass}>
                Редактор карты
              </Link>
            </li>
            <li>
              <Link href="/dev/character-editor" className={menuItemMutedClass}>
                Редактор персонажей
              </Link>
            </li>
            <li>
              <Link href="/dev/tileset-atlas" className={menuItemMutedClass}>
                Карта тайлсетов
              </Link>
            </li>
            <li>
              <Link href="/dev/items" className={menuItemMutedClass}>
                Каталог предметов
              </Link>
            </li>
            <li>
              <Link href="/dev/buffs" className={menuItemMutedClass}>
                Менеджер бафов
              </Link>
            </li>
            <li>
              <Link href="/dev/enemies" className={menuItemMutedClass}>
                Редактор врагов
              </Link>
            </li>
            <li>
              <Link href="/dev/recipes" className={menuItemMutedClass}>
                Рецепты крафта
              </Link>
            </li>
          </ul>
        </>
      ) : null}
    </nav>
  );
}
