"use client";

import dynamic from "next/dynamic";
import Link from "next/link";

const MapEditorRoot = dynamic(
  () => import("@/src/game/mapEditor/MapEditorRoot"),
  {
    ssr: false,
    loading: () => (
      <p className="text-sm text-zinc-400">Загрузка редактора…</p>
    ),
  }
);

export default function MapEditorGate() {
  return (
    <div className="min-h-screen bg-zinc-950 px-3 py-6 text-zinc-100 sm:px-4">
      <div className="mx-auto mb-4 flex flex-wrap items-center gap-3 max-w-[min(1920px,100%)]">
        <Link
          href="/"
          className="text-sm text-emerald-400 hover:text-emerald-300"
        >
          ← На главную
        </Link>
      </div>
      <div className="mx-auto flex min-h-0 w-full max-w-[min(1920px,100%)] flex-col gap-4">
        <MapEditorRoot />
      </div>
    </div>
  );
}
