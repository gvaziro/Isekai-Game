"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  LORE_CATEGORY_LABEL_RU,
  LORE_FACT_CATEGORIES,
  LORE_FACTS_BY_ID,
  type LoreFactCategoryId,
} from "@/src/game/data/loreJournal";
import { useLoreJournalStore } from "@/src/game/state/loreJournalStore";
import { PaperModalChrome } from "@/src/game/ui/paper/PaperChrome";
import { PaperButton } from "@/src/game/ui/paper/PaperButton";
import { PaperSectionLabel } from "@/src/game/ui/paper/PaperSectionLabel";

export default function LoreJournalOverlay({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const unlockedFactIds = useLoreJournalStore((s) => s.unlockedFactIds);
  const readFactIds = useLoreJournalStore((s) => s.readFactIds);
  const markLoreFactRead = useLoreJournalStore((s) => s.markLoreFactRead);

  const [filter, setFilter] = useState<LoreFactCategoryId | "all">("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const filteredIds = useMemo(() => {
    if (filter === "all") return unlockedFactIds;
    return unlockedFactIds.filter((id) => {
      const def = LORE_FACTS_BY_ID[id];
      return def?.category === filter;
    });
  }, [unlockedFactIds, filter]);

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

  useEffect(() => {
    if (!open) {
      setSelectedId(null);
      return;
    }
    if (
      selectedId !== null &&
      !filteredIds.includes(selectedId) &&
      filter !== "all"
    ) {
      setSelectedId(filteredIds[0] ?? null);
    }
  }, [open, selectedId, filteredIds, filter]);

  useEffect(() => {
    if (!open || unlockedFactIds.length === 0) return;
    setSelectedId((cur) => {
      if (cur && unlockedFactIds.includes(cur)) return cur;
      return unlockedFactIds[0] ?? null;
    });
  }, [open, unlockedFactIds]);

  const selectFact = useCallback((id: string) => {
    setSelectedId(id);
  }, []);

  useEffect(() => {
    if (!open || !selectedId) return;
    markLoreFactRead(selectedId);
  }, [open, selectedId, markLoreFactRead]);

  if (!open) return null;

  const selectedDef = selectedId ? LORE_FACTS_BY_ID[selectedId] : undefined;

  const modalTitle = (
    <span className="inline-flex flex-wrap items-center justify-center gap-x-2 gap-y-0.5">
      <span>Дневник знаний</span>
      <span
        className="text-[11px] font-normal tabular-nums text-[#5c5346] sm:text-xs"
        title="Открытых записей"
      >
        {unlockedFactIds.length}
      </span>
    </span>
  );

  return (
    <PaperModalChrome title={modalTitle} onClose={onClose}>
      {unlockedFactIds.length === 0 ? (
        <p className="paper-scroll flex min-h-[8rem] flex-1 flex-col justify-center overflow-y-auto rounded-md border border-[#5c4a32]/25 bg-[rgba(42,36,28,0.06)] px-3 py-6 text-center text-sm leading-relaxed text-[#5c5346] sm:min-h-[10rem] sm:text-[15px]">
          Пока ничего не записано. Факты появятся сами, когда ты узнаешь что-то
          важное из разговоров, книг или мира.
        </p>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col gap-3 md:flex-row md:items-stretch">
          <div className="flex min-h-0 w-full shrink-0 flex-col gap-2 md:max-w-[min(100%,280px)]">
            <PaperSectionLabel>Раздел</PaperSectionLabel>
            <div className="flex flex-wrap gap-1.5">
              <PaperButton
                type="button"
                variant={filter === "all" ? "accent" : "primary"}
                className="min-w-0 px-2 py-1 text-[10px] sm:text-[11px]"
                onClick={() => setFilter("all")}
              >
                Все
              </PaperButton>
              {LORE_FACT_CATEGORIES.map((cat) => (
                <PaperButton
                  key={cat}
                  type="button"
                  variant={filter === cat ? "accent" : "primary"}
                  className="min-w-0 px-2 py-1 text-[10px] sm:text-[11px]"
                  onClick={() => setFilter(cat)}
                >
                  {LORE_CATEGORY_LABEL_RU[cat]}
                </PaperButton>
              ))}
            </div>

            <PaperSectionLabel>Записи</PaperSectionLabel>
            <div className="paper-scroll flex max-h-[min(42vh,280px)] min-h-0 flex-col gap-1 overflow-y-auto rounded-md border border-[#5c4a32]/20 bg-[rgba(42,36,28,0.06)] p-1.5 md:max-h-[min(52vh,360px)]">
              {filteredIds.length === 0 ? (
                <p className="px-2 py-4 text-center text-[11px] text-[#8a8270]">
                  В этом разделе пока пусто.
                </p>
              ) : (
                filteredIds.map((id) => {
                  const def = LORE_FACTS_BY_ID[id];
                  if (!def) return null;
                  const sel = selectedId === id;
                  const unread = !readFactIds[id];
                  return (
                    <button
                      key={id}
                      type="button"
                      title={def.title}
                      aria-current={sel ? "true" : undefined}
                      className={`rounded-sm px-2 py-1.5 text-left text-[11px] leading-snug transition-colors sm:text-[12px] ${
                        sel
                          ? "bg-[#c9e8dc]/90 font-semibold text-[#143228] ring-1 ring-[#1b6b52]/40"
                          : "text-[#4a4338] hover:bg-[rgba(42,36,28,0.12)]"
                      }`}
                      onClick={() => selectFact(id)}
                    >
                      <span className="flex items-start justify-between gap-2">
                        <span className="min-w-0 flex-1">{def.title}</span>
                        {unread ? (
                          <span
                            className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#7a5218]"
                            title="Не прочитано"
                            aria-hidden
                          />
                        ) : null}
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          <div className="paper-scroll flex min-h-0 min-w-0 flex-1 flex-col gap-2 overflow-y-auto md:border-l md:border-[#5c4a32]/25 md:pl-4">
            <PaperSectionLabel>Текст</PaperSectionLabel>
            {!selectedDef ? (
              <p className="text-[11px] text-[#8a8270] sm:text-xs">
                Выберите запись слева.
              </p>
            ) : (
              <div className="rounded-md border border-[#5c4a32]/20 bg-[rgba(42,36,28,0.06)] px-3 py-2.5 sm:px-4">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-[#6d6658]">
                  {LORE_CATEGORY_LABEL_RU[selectedDef.category]}
                </p>
                <h3 className="mt-1 text-base font-semibold text-[#3d2914] sm:text-lg">
                  {selectedDef.title}
                </h3>
                <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-[#4a4338] sm:text-[15px]">
                  {selectedDef.body}
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      <p className="mt-3 shrink-0 border-t border-[#5c4a32]/25 pt-2 text-center text-[10px] text-[#5c5346] sm:text-[11px]">
        <kbd className="rounded border border-[#5a5346]/60 bg-[#f4ecd8] px-1 font-mono text-[#2a241c]">
          K
        </kbd>{" "}
        — закрыть
      </p>
    </PaperModalChrome>
  );
}
