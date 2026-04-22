"use client";

import dynamic from "next/dynamic";
import Link from "next/link";

const TilesetAtlasRoot = dynamic(
  () => import("@/src/game/mapEditor/TilesetAtlasRoot"),
  {
    ssr: false,
    loading: () => (
      <p className="text-sm text-zinc-400">Загрузка…</p>
    ),
  }
);

export default function TilesetAtlasGate() {
  return (
    <div className="min-h-screen bg-zinc-950 px-3 py-6 text-zinc-100 sm:px-4">
      <div className="mx-auto mb-4 flex flex-wrap items-center gap-3 max-w-[min(1920px,100%)]">
        <Link
          href="/"
          className="text-sm text-emerald-400 hover:text-emerald-300"
        >
          ← На главную
        </Link>
        <Link
          href="/dev/map-editor"
          className="text-sm text-zinc-400 hover:text-zinc-300"
        >
          Редактор карт
        </Link>
      </div>
      <header className="mx-auto mb-6 max-w-[min(1920px,100%)]">
        <h1 className="text-lg font-semibold text-zinc-100">
          Карта тайлсетов (dev)
        </h1>
        <p className="mt-1 text-sm text-zinc-500">
          Сетка и индексы кадров без загрузки редактора карты.
        </p>
      </header>
      <div className="mx-auto w-full max-w-[min(1920px,100%)]">
        <TilesetAtlasRoot />
      </div>
    </div>
  );
}
