"use client";

import dynamic from "next/dynamic";
import Link from "next/link";

const ItemsAdmin = dynamic(() => import("./ItemsAdmin"), {
  ssr: false,
  loading: () => (
    <p className="text-sm text-zinc-400">Загрузка каталога…</p>
  ),
});

export default function ItemsAdminGate() {
  return (
    <div className="min-h-screen bg-zinc-950 px-3 py-6 text-zinc-100 sm:px-4">
      <div className="mx-auto mb-4 flex max-w-[min(1920px,100%)] flex-wrap items-center justify-between gap-2">
        <Link
          href="/"
          className="text-sm text-emerald-400 hover:text-emerald-300"
        >
          ← На главную
        </Link>
        <Link
          href="/dev/buffs"
          className="text-sm text-sky-400 hover:text-sky-300"
        >
          Бафы →
        </Link>
      </div>
      <div className="mx-auto flex min-h-0 w-full max-w-[min(1920px,100%)] flex-col gap-4">
        <ItemsAdmin />
      </div>
    </div>
  );
}
