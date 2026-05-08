"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { OPENING_CUTSCENE_LINES } from "@/src/game/data/openingCutscene";
import { PaperButton } from "@/src/game/ui/paper/PaperButton";

export default function OpeningCutsceneOverlay({
  open,
  onComplete,
}: {
  open: boolean;
  onComplete: () => void;
}) {
  const [index, setIndex] = useState(0);
  const primaryRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    setIndex(0);
  }, [open]);

  const last = index >= OPENING_CUTSCENE_LINES.length - 1;
  const line = OPENING_CUTSCENE_LINES[index];

  const advance = useCallback(() => {
    if (last) {
      onComplete();
      return;
    }
    setIndex((i) => i + 1);
  }, [last, onComplete]);

  const skip = useCallback(() => {
    onComplete();
  }, [onComplete]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        skip();
        return;
      }
      if (e.key === " " || e.key === "Enter") {
        const el = e.target as HTMLElement | null;
        if (el?.closest?.("button, a")) return;
        e.preventDefault();
        advance();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
    };
  }, [open, advance, skip]);

  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => {
      primaryRef.current?.focus({ preventScroll: true });
    }, 0);
    return () => window.clearTimeout(t);
  }, [open, index]);

  if (!open || !line) return null;

  return (
    <div
      className="pointer-events-auto fixed inset-0 z-[100] flex flex-col items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="opening-cutscene-speaker"
      aria-describedby="opening-cutscene-live"
    >
      <div
        className="paper-pixelated w-full max-w-lg cursor-default select-none rounded-lg border-2 border-[#5a5346] bg-[#f4ecd8] p-5 shadow-2xl"
        onClick={(e) => {
          if ((e.target as HTMLElement).closest("button, a")) return;
          advance();
        }}
        tabIndex={-1}
      >
        <div
          id="opening-cutscene-live"
          key={index}
          aria-live="polite"
          aria-atomic="true"
          className="mb-6 min-h-[4.5rem]"
        >
          <p
            id="opening-cutscene-speaker"
            className="mb-2 text-center text-[10px] font-semibold uppercase tracking-[0.18em] text-[#4a6b58]"
          >
            {line.speakerLabel}
          </p>
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-[#2c2820]">
            {line.body}
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <button
            type="button"
            className="text-left text-[11px] text-[#5c5248] underline decoration-[#8a8074] underline-offset-2 hover:text-[#2c2820]"
            onClick={(e) => {
              e.stopPropagation();
              skip();
            }}
          >
            Пропустить (Esc)
          </button>
          <PaperButton
            ref={primaryRef}
            variant="accent"
            className="min-w-[8rem]"
            onClick={(e) => {
              e.stopPropagation();
              advance();
            }}
          >
            {last ? "Начать" : "Далее"}
          </PaperButton>
        </div>
        <p className="mt-3 text-center text-[10px] text-[#6b6258]">
          Пробел или Enter — следующая реплика
        </p>
      </div>
    </div>
  );
}
