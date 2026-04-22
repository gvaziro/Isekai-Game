"use client";

import type { ReactNode } from "react";
import "@/src/game/ui/paper-ui.css";

/** Квадратная ячейка без растягивания PNG на всю область. */
export function PaperSlotChrome({
  children,
  picked,
}: {
  children: ReactNode;
  picked?: boolean;
}) {
  return (
    <div
      className={`paper-pixelated relative overflow-hidden rounded-[3px] border border-[#5a4a30]/55 bg-[#efe3c8] p-[3px] shadow-[inset_0_1px_0_rgba(255,255,255,0.35)] transition-[box-shadow,ring-color] ${
        picked
          ? "ring-2 ring-[#2a8f6a] shadow-[inset_0_0_0_1px_rgba(42,143,106,0.35)]"
          : "ring-2 ring-transparent hover:ring-[#2a8f6a]/75"
      }`}
    >
      {children}
    </div>
  );
}
