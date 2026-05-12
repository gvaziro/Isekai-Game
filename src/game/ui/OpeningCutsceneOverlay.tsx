"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { OPENING_CUTSCENE_LINES } from "@/src/game/data/openingCutscene";
import {
  normalizePlayerName,
  useGameStore,
} from "@/src/game/state/gameStore";
import { PaperButton } from "@/src/game/ui/paper/PaperButton";

type OpeningStep =
  | "wake"
  | "marcus-check"
  | "name"
  | "name-reaction"
  | "memory"
  | "memory-reaction"
  | "final";

const OPENING_STEPS: OpeningStep[] = [
  "wake",
  "marcus-check",
  "name",
  "name-reaction",
  "memory",
  "memory-reaction",
  "final",
];

const MEMORY_CHOICES = [
  {
    label: "Не помню. Очнулся у дороги.",
    reaction: "Честно. Лучше, чем выдумывать на месте.",
  },
  {
    label: "Был дома, потом всё сорвалось.",
    reaction: "Звучит как бред, но глаза у тебя не врут.",
  },
  {
    label: "Долгая история. Лучше позже.",
    reaction: "Ладно. Дорога не место для долгих историй.",
  },
] as const;

export default function OpeningCutsceneOverlay({
  open,
  onComplete,
}: {
  open: boolean;
  onComplete: () => void;
}) {
  const [index, setIndex] = useState(0);
  const [nameDraft, setNameDraft] = useState("");
  const [confirmedName, setConfirmedName] = useState("");
  const [memoryReaction, setMemoryReaction] = useState("");
  const primaryRef = useRef<HTMLButtonElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const playerName = useGameStore((s) => s.playerName);
  const setPlayerName = useGameStore((s) => s.setPlayerName);

  const step = OPENING_STEPS[index] ?? "final";
  const last = step === "final";
  const needsName = step === "name";
  const needsMemoryChoice = step === "memory";
  const line =
    step === "wake"
      ? OPENING_CUTSCENE_LINES[0]
      : step === "marcus-check"
        ? OPENING_CUTSCENE_LINES[1]
        : step === "name"
          ? OPENING_CUTSCENE_LINES[2]
          : step === "memory"
            ? OPENING_CUTSCENE_LINES[3]
            : step === "final"
              ? OPENING_CUTSCENE_LINES[4]
              : {
                  speakerLabel: "Маркус",
                  body:
                    step === "name-reaction"
                      ? `Ладно, ${confirmedName || playerName}. На ногах держишься — уже хорошо.`
                      : memoryReaction,
                };

  const confirmName = useCallback(() => {
    const nextName = normalizePlayerName(nameDraft);
    setPlayerName(nextName);
    setConfirmedName(nextName);
    setIndex((i) => i + 1);
  }, [nameDraft, setPlayerName]);

  const advance = useCallback(() => {
    if (needsMemoryChoice) return;
    if (last) {
      onComplete();
      return;
    }
    setIndex((i) => i + 1);
  }, [last, needsMemoryChoice, onComplete]);

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
        if (el?.closest?.("button, a, input, textarea, select")) return;
        e.preventDefault();
        if (needsName) {
          nameInputRef.current?.focus({ preventScroll: true });
          return;
        }
        advance();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
    };
  }, [open, advance, skip, needsName]);

  useEffect(() => {
    if (!open) return;
    const focusPrimaryOrName = () => {
      if (needsName) {
        const ae = document.activeElement;
        if (
          ae instanceof HTMLElement &&
          ae.closest(".last-summon-phaser-root")
        ) {
          ae.blur();
        }
        nameInputRef.current?.focus({ preventScroll: true });
        return;
      }
      primaryRef.current?.focus({ preventScroll: true });
    };
    const t = window.setTimeout(focusPrimaryOrName, 0);
    let rafOuter = 0;
    if (needsName) {
      rafOuter = window.requestAnimationFrame(() => {
        window.requestAnimationFrame(focusPrimaryOrName);
      });
    }
    return () => {
      window.clearTimeout(t);
      if (rafOuter) window.cancelAnimationFrame(rafOuter);
    };
  }, [open, index, needsName]);

  if (!open || !line) return null;

  return (
    <div
      className="pointer-events-auto fixed inset-0 z-[220] flex flex-col items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="opening-cutscene-speaker"
      aria-describedby="opening-cutscene-live"
    >
      <div
        className={`paper-pixelated w-full max-w-lg cursor-default rounded-lg border-2 border-[#5a5346] bg-[#f4ecd8] p-5 shadow-2xl ${
          needsName ? "" : "select-none"
        }`}
        onClick={(e) => {
          if (needsName) {
            return;
          }
          if (
            (e.target as HTMLElement).closest(
              "button, a, input, textarea, select"
            )
          ) {
            return;
          }
          advance();
        }}
        tabIndex={needsName ? undefined : -1}
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

        {needsName ? (
          <div
            className="relative z-10 mb-5 select-text"
            onClick={(e) => e.stopPropagation()}
          >
            <label
              htmlFor="opening-player-name"
              className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.16em] text-[#5c5248]"
            >
              Имя
            </label>
            <input
              ref={nameInputRef}
              id="opening-player-name"
              autoFocus
              value={nameDraft}
              maxLength={24}
              placeholder="Странник"
              className="w-full cursor-text rounded-md border border-[#8a8074] bg-[#fff8e8] px-3 py-2 text-sm text-[#2c2820] outline-none [transform:translateZ(0)] focus:border-[#4a6b58] focus:ring-2 focus:ring-[#4a6b58]/25"
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => setNameDraft(e.target.value)}
              onMouseDown={(e) => {
                e.stopPropagation();
                e.currentTarget.focus({ preventScroll: true });
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  confirmName();
                }
              }}
            />
          </div>
        ) : null}

        {needsMemoryChoice ? (
          <div className="mb-5 flex flex-col gap-2">
            {MEMORY_CHOICES.map((choice) => (
              <button
                key={choice.label}
                type="button"
                className="rounded-md border border-[#8a8074] bg-[#fff8e8] px-3 py-2.5 text-left text-sm leading-snug text-[#2c2820] hover:border-[#4a6b58] hover:bg-[#f9efd8] focus:outline-none focus:ring-2 focus:ring-[#4a6b58]/25"
                onClick={(e) => {
                  e.stopPropagation();
                  setMemoryReaction(choice.reaction);
                  setIndex((i) => i + 1);
                }}
              >
                {choice.label}
              </button>
            ))}
          </div>
        ) : null}

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
          {!needsMemoryChoice ? (
            <PaperButton
              ref={primaryRef}
              variant="accent"
              className="min-w-[8rem]"
              onClick={(e) => {
                e.stopPropagation();
                if (needsName) {
                  confirmName();
                } else {
                  advance();
                }
              }}
            >
              {needsName ? "Запомнить" : last ? "Начать" : "Далее"}
            </PaperButton>
          ) : null}
        </div>
        <p className="mt-3 text-center text-[10px] text-[#6b6258]">
          {needsName
            ? "Введите имя и нажмите «Запомнить» или Enter в поле"
            : "Пробел или Enter — следующая реплика"}
        </p>
      </div>
    </div>
  );
}
