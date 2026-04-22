"use client";

import Link from "next/link";
import RecipesAdmin from "./RecipesAdmin";

export default function RecipesAdminGate() {
  return (
    <div className="min-h-screen bg-zinc-950 px-3 py-6 text-zinc-100 sm:px-4">
      <div className="mx-auto mb-4 flex max-w-[min(960px,100%)] flex-wrap items-center gap-3">
        <Link
          href="/"
          className="text-sm text-emerald-400 hover:text-emerald-300"
        >
          ← На главную
        </Link>
        <Link
          href="/dev/items"
          className="text-sm text-zinc-400 hover:text-zinc-300"
        >
          Каталог предметов
        </Link>
      </div>
      <header className="mx-auto mb-6 max-w-[min(960px,100%)]">
        <h1 className="text-lg font-semibold text-zinc-100">
          Рецепты крафта (dev)
        </h1>
        <p className="mt-1 text-sm text-zinc-500">
          Редактор <code className="text-zinc-400">src/game/data/recipes.json</code>
          . Станции — id из станций города; предметы — curated id из размеченного
          каталога.
        </p>
      </header>
      <RecipesAdmin />
    </div>
  );
}
