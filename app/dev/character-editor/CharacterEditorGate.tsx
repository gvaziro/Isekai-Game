"use client";

import dynamic from "next/dynamic";
import Link from "next/link";

const CharacterEditorRoot = dynamic(
  () => import("@/src/game/characterEditor/CharacterEditorRoot"),
  {
    ssr: false,
    loading: () => (
      <p className="text-sm text-zinc-400">Загрузка редактора…</p>
    ),
  }
);

export default function CharacterEditorGate() {
  return (
    <div className="min-h-screen bg-zinc-950 px-3 py-6 text-zinc-100 sm:px-4">
      <div className="mx-auto mb-4 flex max-w-4xl flex-wrap items-center gap-3">
        <Link
          href="/"
          className="text-sm text-emerald-400 hover:text-emerald-300"
        >
          ← На главную
        </Link>
      </div>
      <CharacterEditorRoot />
    </div>
  );
}
