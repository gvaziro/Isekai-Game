"use client";

import { useEffect, useState } from "react";
import { PaperButton } from "@/src/game/ui/paper/PaperButton";
import "@/src/game/ui/paper-ui.css";

export type HeroThoughtOpen = {
  title: string;
  lines: string[];
};

export default function HeroThoughtOverlay({
  thought,
  onClose,
}: {
  thought: HeroThoughtOpen;
  onClose: () => void;
}) {
  const [index, setIndex] = useState(0);
  const line = thought.lines[index] ?? "";
  const last = index >= thought.lines.length - 1;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        if (last) onClose();
        else setIndex((i) => Math.min(thought.lines.length - 1, i + 1));
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [last, onClose, thought.lines.length]);

  const advance = () => {
    if (last) onClose();
    else setIndex((i) => Math.min(thought.lines.length - 1, i + 1));
  };

  return (
    <div
      className="pointer-events-auto absolute inset-0 z-[105] flex items-end justify-center bg-black/25 px-2 pb-2 pt-12 backdrop-blur-[1px] sm:px-4 sm:pb-4"
      role="presentation"
    >
      <section
        className="paper-pixelated paper-parchment-bg flex max-h-[44vh] min-h-[12rem] w-full max-w-[min(760px,calc(100vw-16px))] flex-col overflow-hidden border-2 border-[#5c4a32]/45 px-3 py-3 text-[#2a241c] shadow-2xl sm:max-h-[34vh] sm:max-w-[min(760px,calc(100vw-32px))] sm:px-4"
        role="dialog"
        aria-modal="true"
        aria-label={thought.title}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="mb-2 flex shrink-0 items-start justify-between gap-2 border-b border-[#5c4a32]/25 pb-2">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-[#7a6b55]">
              Размышление
            </p>
            <h2 className="truncate text-base font-semibold leading-tight text-[#2a241c] sm:text-lg">
              {thought.title}
            </h2>
          </div>
          <PaperButton
            type="button"
            variant="close"
            className="px-2 py-1 text-[10px] sm:text-[11px]"
            onClick={onClose}
          >
            Esc
          </PaperButton>
        </div>

        <div className="paper-scroll min-h-[5rem] flex-1 rounded-sm border border-[#5c4a32]/20 bg-[rgba(42,36,28,0.055)] px-2 py-2">
          <div className="grid grid-cols-[3.25rem_minmax(0,1fr)] gap-2 text-xs leading-relaxed sm:grid-cols-[4rem_minmax(0,1fr)]">
            <span className="font-semibold text-[#1b6b52]">Я</span>
            <p className="min-w-0 whitespace-pre-wrap break-words text-[#3d362c]">
              {line}
            </p>
          </div>
        </div>

        <div className="mt-2 flex shrink-0 justify-end">
          <PaperButton
            type="button"
            variant="accent"
            className="min-w-[7rem] px-3 py-1.5 text-[11px]"
            onClick={advance}
          >
            {last ? "Понятно" : "Дальше"}
          </PaperButton>
        </div>
      </section>
    </div>
  );
}
