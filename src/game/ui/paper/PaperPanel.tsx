"use client";

import type { ReactNode } from "react";
import { PAPER_UI } from "@/src/game/ui/paper/paperUrls";
import "@/src/game/ui/paper-ui.css";

type PaperPanelProps = {
  children: ReactNode;
  /** Верхняя полоса: лента с заголовком по центру. */
  header?: ReactNode;
  /** Кнопки в правом верхнем углу панели (не перекрывают ленту с заголовком). */
  topRight?: ReactNode;
  /** Растягивать панель по высоте доступного пространства. */
  fillHeight?: boolean;
  /** Доп. классы на внешней обёртке панели (фон пергамента). */
  className?: string;
};

/**
 * Фон модального окна: пергамент без растягивания декоративного PNG на весь блок.
 */
export function PaperPanel({
  children,
  header,
  topRight,
  fillHeight = true,
  className = "",
}: PaperPanelProps) {
  return (
    <div
      className={`paper-pixelated paper-parchment-bg relative flex max-h-full min-h-0 w-full max-w-3xl flex-col gap-2 overflow-hidden px-6 pb-8 pt-4 ring-1 ring-[#5c4a32]/35 sm:gap-2 sm:px-8 sm:pb-8 sm:pt-5 ${fillHeight ? "h-full" : ""} ${className}`}
    >
      {topRight ? (
        <div className="absolute right-2.5 top-2.5 z-30 sm:right-3.5 sm:top-3.5">
          {topRight}
        </div>
      ) : null}

      {header ? (
        <div className="relative z-20 shrink-0 pr-[min(42%,11rem)] pt-0 text-[#2a241c]">
          {header}
        </div>
      ) : null}

      <div
        className={`relative z-10 flex min-h-0 flex-col overflow-x-hidden overflow-y-auto text-[#2a241c] ${
          fillHeight ? "flex-1" : ""
        }`}
      >
        {children}
      </div>
    </div>
  );
}

type PaperTitleRibbonProps = {
  title: ReactNode;
};

/** Лента заголовка по центру (без кнопок — их выносим в `PaperPanel.topRight`). */
export function PaperTitleRibbon({ title }: PaperTitleRibbonProps) {
  return (
    <div className="relative flex min-h-[34px] items-center justify-center sm:min-h-[38px]">
      <div className="paper-pixelated relative mx-auto flex min-h-[34px] w-[min(100%,420px)] max-w-[min(100%,calc(100%-1rem))] items-center justify-center px-6 py-1 sm:min-h-[38px] sm:max-w-[min(100%,480px)] sm:px-7 sm:py-1.5">
        <div
          className="absolute inset-0 bg-contain bg-center bg-no-repeat opacity-95"
          style={{ backgroundImage: `url(${PAPER_UI.titleRibbon})` }}
          aria-hidden
        />
        <h2 className="relative z-10 text-center text-sm font-semibold leading-tight tracking-wide text-[#2a241c] sm:text-base">
          {title}
        </h2>
      </div>
    </div>
  );
}
