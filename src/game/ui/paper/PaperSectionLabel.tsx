"use client";

import type { ReactNode } from "react";

/** Компактный разделитель секции без широкого PNG-баннера. */
export function PaperSectionLabel({ children }: { children: ReactNode }) {
  return (
    <div
      className="flex min-h-[28px] w-full items-center gap-2 py-1 sm:min-h-[30px]"
      role="presentation"
    >
      <div
        className="h-px flex-1 bg-gradient-to-r from-transparent via-[#5c4a32]/45 to-[#5c4a32]/25"
        aria-hidden
      />
      <p className="shrink-0 text-center text-[10px] font-bold uppercase tracking-[0.14em] text-[#3d362c] sm:text-[11px]">
        {children}
      </p>
      <div
        className="h-px flex-1 bg-gradient-to-l from-transparent via-[#5c4a32]/45 to-[#5c4a32]/25"
        aria-hidden
      />
    </div>
  );
}
