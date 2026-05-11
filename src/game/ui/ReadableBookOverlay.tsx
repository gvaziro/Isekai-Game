"use client";

import { useEffect } from "react";
import { PaperModalChrome } from "@/src/game/ui/paper/PaperChrome";

export default function ReadableBookOverlay({
  open,
  title,
  body,
  onClose,
}: {
  open: boolean;
  title: string;
  body: string;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <PaperModalChrome title={title} onClose={onClose}>
      <div className="paper-scroll max-h-[min(62vh,420px)] min-h-[10rem] flex-1 overflow-y-auto rounded-md border border-[#5c4a32]/20 bg-[rgba(42,36,28,0.06)] px-3 py-3 sm:px-4 sm:py-4">
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-[#4a4338] sm:text-[15px]">
          {body}
        </p>
      </div>
      <p className="mt-3 shrink-0 border-t border-[#5c4a32]/25 pt-2 text-center text-[10px] text-[#5c5346] sm:text-[11px]">
        <kbd className="rounded border border-[#5a5346]/60 bg-[#f4ecd8] px-1 font-mono text-[#2a241c]">
          Esc
        </kbd>{" "}
        — закрыть
      </p>
    </PaperModalChrome>
  );
}
