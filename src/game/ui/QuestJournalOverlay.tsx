"use client";

import { useEffect } from "react";
import { QUESTS_BY_ID } from "@/src/game/data/quests";
import type { QuestDef } from "@/src/game/data/schemas/quest";
import { useQuestStore } from "@/src/game/state/questStore";
import { PaperModalChrome } from "@/src/game/ui/paper/PaperChrome";
import { PaperSectionLabel } from "@/src/game/ui/paper/PaperSectionLabel";

function stageLine(
  quest: QuestDef,
  stageIndex: number,
  currentStageIndex: number,
  questDone: boolean
): { text: string; done: boolean; current: boolean } {
  const s = quest.stages[stageIndex];
  if (!s) {
    return { text: "—", done: false, current: false };
  }
  const done = questDone || stageIndex < currentStageIndex;
  const current = !questDone && stageIndex === currentStageIndex;
  return { text: s.summary, done, current };
}

export default function QuestJournalOverlay({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const active = useQuestStore((s) => s.active);
  const completed = useQuestStore((s) => s.completedQuestIds);

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

  const q = active ? QUESTS_BY_ID[active.questId] : null;
  const doneIds = new Set(completed);
  const allQuestDone = q ? doneIds.has(q.id) : false;

  return (
    <PaperModalChrome title="Журнал заданий" onClose={onClose}>
      {!q ? (
        <p className="paper-scroll flex min-h-[8rem] flex-1 flex-col justify-center overflow-y-auto rounded-md border border-[#5c4a32]/25 bg-[rgba(42,36,28,0.06)] px-3 py-6 text-center text-sm leading-relaxed text-[#5c5346] sm:min-h-[10rem] sm:text-[15px]">
          Нет активного задания. Все цепочки выполнены или ещё не начаты.
        </p>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col gap-4 md:flex-row md:items-stretch">
          <div className="paper-scroll flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto border-[#5c4a32]/30 pb-2 md:border-r md:pr-5 md:pb-0">
            <PaperSectionLabel>Текущее задание</PaperSectionLabel>
            <div className="rounded-md border border-[#5c4a32]/20 bg-[rgba(42,36,28,0.06)] px-2 py-2 sm:px-3">
              <h3 className="text-base font-semibold text-[#3d2914] sm:text-lg">
                {q.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-[#4a4338] sm:text-[15px]">
                {q.description}
              </p>
            </div>
          </div>

          <div className="paper-scroll flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto md:pl-1">
            <PaperSectionLabel>Этапы</PaperSectionLabel>
            <ol className="list-decimal space-y-2.5 pl-5 text-sm text-[#4a4338] sm:text-[15px]">
              {q.stages.map((st, i) => {
                const { text, done, current } = stageLine(
                  q,
                  i,
                  active!.stageIndex,
                  allQuestDone
                );
                return (
                  <li
                    key={st.id}
                    className={
                      done
                        ? "text-[#2d6d4f]/95 line-through decoration-[#1b6b52]/70"
                        : current
                          ? "font-semibold text-[#7a5218]"
                          : "text-[#6d6658]"
                    }
                  >
                    {text}
                  </li>
                );
              })}
            </ol>
          </div>
        </div>
      )}

      <p className="mt-3 shrink-0 border-t border-[#5c4a32]/25 pt-2 text-center text-[10px] text-[#5c5346] sm:text-[11px]">
        <kbd className="rounded border border-[#5a5346]/60 bg-[#f4ecd8] px-1 font-mono text-[#2a241c]">
          J
        </kbd>{" "}
        — закрыть
      </p>
    </PaperModalChrome>
  );
}
