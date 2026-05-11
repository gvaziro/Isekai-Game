"use client";

import { Fragment, useCallback, useEffect, useMemo, type ReactNode } from "react";
import { flushElectronProfileWrites } from "@/src/game/saves/electronProfileStateStorage";
import { readLiveGameSnapshotEntryStrings } from "@/src/game/saves/liveGameProfileSnapshot";
import { syncPhaserPlayerPositionToGameStore } from "@/src/game/saves/syncPhaserPlayerPositionToGameStore";
import {
  formatSaveSlotSummary,
  formatSaveSlotTime,
  getSaveSlotSummaryDetails,
  type SaveSlotSummaryDetails,
} from "@/src/game/saves/saveSlotSummary";
import {
  overwriteSaveSlot,
  SAVE_SLOT_COUNT,
  useSaveSlotsStore,
} from "@/src/game/state/saveSlotsStore";
import { PaperButton } from "@/src/game/ui/paper/PaperButton";
import { PaperModalChrome } from "@/src/game/ui/paper/PaperChrome";

function slotHeadline(index: number): string {
  if (index === 0) return "Автосохранение";
  return `Ручной слот ${index}`;
}

function IconClock({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      width="14"
      height="14"
      aria-hidden
    >
      <circle
        cx="12"
        cy="12"
        r="8.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
      />
      <path
        d="M12 8.25v4l2.75 1.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconInfo({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      width="16"
      height="16"
      aria-hidden
    >
      <circle
        cx="12"
        cy="12"
        r="9"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
      />
      <path
        d="M12 10.5V17M12 7.2v.1"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

const chipBase =
  "inline-flex max-w-full items-center gap-0.5 rounded-md border px-2 py-0.5 text-[11px] font-medium leading-tight";

function summaryHasChips(d: SaveSlotSummaryDetails): boolean {
  return (
    d.worldDay != null ||
    (d.locationLabel && d.locationLabel !== "—") ||
    d.level != null ||
    d.gold != null
  );
}

function SummaryChips({ d }: { d: SaveSlotSummaryDetails }) {
  const chips: { key: string; node: ReactNode }[] = [];
  if (d.worldDay != null) {
    chips.push({
      key: "day",
      node: (
        <span
          className={`${chipBase} border-[#b8a88c]/80 bg-[#faf6ee] text-[#4a4034]`}
        >
          День <span className="font-semibold tabular-nums">{d.worldDay}</span>
        </span>
      ),
    });
  }
  if (d.locationLabel && d.locationLabel !== "—") {
    chips.push({
      key: "loc",
      node: (
        <span
          className={`${chipBase} border-[#6b8f7a]/45 bg-[#eef6f0] text-[#2d4a38]`}
        >
          {d.locationLabel}
        </span>
      ),
    });
  }
  if (d.level != null) {
    chips.push({
      key: "lvl",
      node: (
        <span
          className={`${chipBase} border-[#9a8ab8]/50 bg-[#f2eef8] text-[#3a3250]`}
        >
          Ур.{" "}
          <span className="font-semibold tabular-nums">{d.level}</span>
        </span>
      ),
    });
  }
  if (d.gold != null) {
    chips.push({
      key: "gold",
      node: (
        <span
          className={`${chipBase} border-[#c9a86a]/70 bg-[#fff8e8] text-[#5c4518]`}
        >
          <span className="font-semibold tabular-nums">{d.gold}</span> зол
        </span>
      ),
    });
  }
  if (!chips.length) return null;
  return (
    <div className="mt-1.5 flex flex-wrap gap-1.5">
      {chips.map((c) => (
        <Fragment key={c.key}>{c.node}</Fragment>
      ))}
    </div>
  );
}

export default function SaveGameOverlay({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const slots = useSaveSlotsStore((s) => s.slots);

  const rows = useMemo(() => {
    const norm = [...slots];
    while (norm.length < SAVE_SLOT_COUNT) norm.push(null);
    return norm.slice(0, SAVE_SLOT_COUNT).map((slot, index) => {
      const raw = slot?.entries["last-summon-save-v1"];
      const details = raw ? getSaveSlotSummaryDetails(raw) : null;
      const formatted = raw ? formatSaveSlotSummary(raw).trim() : "";
      const summaryLine =
        formatted ||
        (raw && (!details || !summaryHasChips(details))
          ? "Сейв без сводки"
          : "");
      return {
        index,
        slot,
        details,
        summaryLine,
        time: slot ? formatSaveSlotTime(slot.updatedAt) : "",
      };
    });
  }, [slots]);

  const onSaveHere = useCallback(async (index: number) => {
    if (index === 0) return;
    if (
      !window.confirm(
        `Перезаписать ${slotHeadline(index)} текущей игрой из памяти?`
      )
    ) {
      return;
    }
    await syncPhaserPlayerPositionToGameStore();
    let snap: ReturnType<typeof readLiveGameSnapshotEntryStrings>;
    try {
      snap = readLiveGameSnapshotEntryStrings();
    } catch {
      window.dispatchEvent(
        new CustomEvent("last-summon-toast", {
          detail: { message: "Нет данных текущей игры для записи." },
        })
      );
      return;
    }
    try {
      await overwriteSaveSlot(index, snap);
      await flushElectronProfileWrites();
      window.dispatchEvent(
        new CustomEvent("last-summon-toast", {
          detail: { message: `Сохранено в ${slotHeadline(index)}` },
        })
      );
      onClose();
    } catch (e) {
      window.dispatchEvent(
        new CustomEvent("last-summon-toast", {
          detail: {
            message:
              e instanceof Error ? e.message : "Не удалось записать слот.",
          },
        })
      );
    }
  }, [onClose]);

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
    <PaperModalChrome title="Сохранение игры" onClose={onClose} fitContent>
      <div className="flex max-h-[min(78vh,560px)] min-h-0 flex-col gap-4 overflow-y-auto px-0.5 py-1 sm:px-1 sm:py-2">
        <div className="flex gap-2.5 rounded-lg border border-[#c9b89a]/60 bg-[#faf6ee]/90 px-3 py-2.5 shadow-sm">
          <IconInfo className="mt-0.5 shrink-0 text-[#6b5c48]" />
          <div className="min-w-0 text-[11px] leading-snug text-[#4a4034] sm:text-xs">
            <span className="font-semibold text-[#2e261c]">
              Куда писать прогресс
            </span>
            <p className="mt-1 text-[#5c4d38]">
              Слот{" "}
              <span className="rounded bg-[#e8dfd0] px-1 font-mono font-semibold text-[#2a241c]">
                0
              </span>{" "}
              обновляется автоматически при{" "}
              <span className="font-semibold">F5</span> или кнопке «Сохранить»
              в меню «?». Сюда запишите только слоты{" "}
              <span className="whitespace-nowrap font-mono font-semibold">
                1–4
              </span>
              .
            </p>
          </div>
        </div>

        <ul className="flex flex-col gap-3" role="list">
          {rows.map(({ index, slot, details, summaryLine, time }) => {
            const isAuto = index === 0;
            const filled = Boolean(slot);
            return (
              <li key={index} role="listitem">
                <div
                  className={`paper-pixelated flex min-w-0 flex-col gap-3 rounded-xl border-2 p-3 shadow-sm transition-shadow sm:flex-row sm:gap-4 sm:p-4 ${
                    filled ? "sm:items-stretch" : "sm:items-center"
                  } ${
                    isAuto
                      ? "border-amber-800/35 bg-gradient-to-br from-[#fffaf0] via-[#faf3e4] to-[#f2e8d4]"
                      : "border-[#7a6b52]/30 bg-gradient-to-br from-[#faf7ef] to-[#f0e9dc]"
                  } ${filled ? "ring-1 ring-[#5c4a32]/15" : ""}`}
                >
                  <div className="flex shrink-0 items-start gap-3 sm:items-center sm:pt-0.5">
                    <div
                      className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border-2 text-sm font-bold tabular-nums shadow-inner sm:h-14 sm:w-14 sm:text-base ${
                        isAuto
                          ? "border-amber-900/40 bg-[#fff3d6] text-amber-950"
                          : "border-[#5c6f5e]/40 bg-[#e8f0e9] text-[#1f3424]"
                      }`}
                      aria-hidden
                    >
                      {index}
                    </div>
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                      <h3 className="text-sm font-bold tracking-tight text-[#2a241c] sm:text-[15px]">
                        {slotHeadline(index)}
                      </h3>
                      {!filled && !isAuto ? (
                        <span className="rounded-full bg-[#e5ddd0] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#6b5f52]">
                          Пусто
                        </span>
                      ) : null}
                    </div>

                    {filled ? (
                      <>
                        {details ? <SummaryChips d={details} /> : null}
                        {summaryLine &&
                        (!details || !summaryHasChips(details)) ? (
                          <p className="mt-2 text-[11px] leading-snug text-[#5c4d38] sm:text-xs">
                            {summaryLine}
                          </p>
                        ) : null}
                        {time ? (
                          <div className="mt-2 flex items-center gap-1.5 text-[11px] text-[#6b5f52]">
                            <IconClock className="shrink-0 opacity-80" />
                            <span className="font-mono tabular-nums">{time}</span>
                          </div>
                        ) : null}
                      </>
                    ) : null}
                  </div>

                  <div className="flex shrink-0 flex-col gap-2 sm:w-[9.5rem] sm:justify-center">
                    {index > 0 ? (
                      <PaperButton
                        type="button"
                        variant="accent"
                        className="min-h-10 w-full justify-center px-3 py-2 text-xs font-bold sm:min-h-11"
                        onClick={() => void onSaveHere(index)}
                      >
                        Сохранить сюда
                      </PaperButton>
                    ) : (
                      <div className="flex min-h-10 items-center justify-center rounded-md border border-dashed border-[#b8a88c]/80 bg-[#faf6ee]/80 px-2 text-center text-[10px] font-medium leading-tight text-[#6b5f52] sm:min-h-11">
                        Не редактируется
                      </div>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </PaperModalChrome>
  );
}
