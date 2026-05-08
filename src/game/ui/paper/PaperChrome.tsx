"use client";

import type { ReactNode } from "react";
import { PaperButton } from "@/src/game/ui/paper/PaperButton";
import { PaperPanel, PaperTitleRibbon } from "@/src/game/ui/paper/PaperPanel";

type PaperModalChromeProps = {
  title: ReactNode;
  children: ReactNode;
  onClose: () => void;
  closeLabel?: string;
  fitContent?: boolean;
};

/**
 * Затемнённый фон внутри игровой сцены + пергаментная панель и кнопка закрытия в углу.
 */
export function PaperModalChrome({
  title,
  children,
  onClose,
  closeLabel = "Закрыть (Esc)",
  fitContent = false,
}: PaperModalChromeProps) {
  return (
    <div
      className="pointer-events-auto absolute inset-0 z-40 flex min-h-0 w-full flex-col items-center justify-center overflow-hidden bg-black/70 px-3 pb-4 pt-2 backdrop-blur-[2px] sm:px-4 sm:pb-5 sm:pt-3"
      role="presentation"
      onMouseDown={(e) => e.stopPropagation()}
    >
      <PaperPanel
        className="min-h-0 w-full max-w-3xl shrink"
        fillHeight={!fitContent}
        topRight={
          <PaperButton type="button" variant="close" onClick={onClose}>
            {closeLabel}
          </PaperButton>
        }
        header={<PaperTitleRibbon title={title} />}
      >
        {children}
      </PaperPanel>
    </div>
  );
}
