"use client";

import { useCallback, useMemo, useState } from "react";
import {
  computeIsekaiOriginBonus,
  getCircumstanceById,
  getProfessionById,
  ISEKAI_CIRCUMSTANCES,
  ISEKAI_PROFESSIONS,
  ISEKAI_SYSTEM_INTRO,
} from "@/src/game/data/isekaiOrigin";
import { getDerivedCombatStats } from "@/src/game/rpg/derivedStats";
import { ZERO_ATTRIBUTES } from "@/src/game/rpg/characterAttributes";
import { useGameStore } from "@/src/game/state/gameStore";

type Step = "intro" | "profession" | "circumstance" | "confirm";

function formatBonusLines(bonus: ReturnType<typeof computeIsekaiOriginBonus>): string[] {
  const lines: string[] = [];
  if (bonus.atk) lines.push(`ATK +${bonus.atk}`);
  if (bonus.def) lines.push(`DEF +${bonus.def}`);
  if (bonus.hp) lines.push(`HP +${bonus.hp}`);
  if (bonus.sta) lines.push(`Стамина +${bonus.sta}`);
  if (bonus.spd) lines.push(`SPD +${bonus.spd}`);
  if (bonus.luck) lines.push(`Удача +${bonus.luck}`);
  return lines.length ? lines : ["Без числовых бонусов"];
}

export default function IsekaiOriginOverlay({
  onComplete,
}: {
  onComplete: () => void;
}) {
  const completeIsekaiOrigin = useGameStore((s) => s.completeIsekaiOrigin);
  const [step, setStep] = useState<Step>("intro");
  const [professionId, setProfessionId] = useState<string | null>(null);
  const [circumstanceId, setCircumstanceId] = useState<string | null>(null);

  const previewBonus = useMemo(() => {
    if (!professionId || !circumstanceId) return null;
    return computeIsekaiOriginBonus(professionId, circumstanceId);
  }, [professionId, circumstanceId]);

  const statPreview = useMemo(() => {
    if (!previewBonus) return null;
    const base = getDerivedCombatStats(1, {}, undefined, ZERO_ATTRIBUTES);
    const withO = getDerivedCombatStats(1, {}, previewBonus, ZERO_ATTRIBUTES);
    return { base, withO };
  }, [previewBonus]);

  const finish = useCallback(() => {
    if (!professionId || !circumstanceId) return;
    completeIsekaiOrigin(professionId, circumstanceId);
    onComplete();
  }, [professionId, circumstanceId, completeIsekaiOrigin, onComplete]);

  return (
    <div
      className="pointer-events-auto fixed inset-0 z-[100] flex flex-col items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Пролог: новый мир"
    >
      <div className="max-h-[min(90vh,640px)] w-full max-w-lg overflow-y-auto rounded-xl border border-cyan-900/50 bg-zinc-950/95 p-5 shadow-2xl">
        {step === "intro" ? (
          <>
            <p className="mb-1 text-center text-[10px] font-semibold uppercase tracking-[0.2em] text-cyan-400/90">
              Система
            </p>
            <p className="mb-5 whitespace-pre-wrap text-sm leading-relaxed text-zinc-200">
              {ISEKAI_SYSTEM_INTRO}
            </p>
            <button
              type="button"
              className="w-full rounded-lg bg-cyan-800 px-4 py-3 text-sm font-semibold text-white hover:bg-cyan-700"
              onClick={() => setStep("profession")}
            >
              Продолжить
            </button>
          </>
        ) : null}

        {step === "profession" ? (
          <>
            <p className="mb-3 text-center text-sm font-medium text-zinc-100">
              Кем ты был до перехода?
            </p>
            <div className="flex flex-col gap-2">
              {ISEKAI_PROFESSIONS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className="rounded-lg border border-zinc-700 bg-zinc-900/80 px-3 py-2.5 text-left text-sm text-zinc-100 hover:border-cyan-700/60 hover:bg-zinc-800/90"
                  onClick={() => {
                    setProfessionId(p.id);
                    setStep("circumstance");
                  }}
                >
                  <span className="font-semibold text-cyan-200/95">{p.title}</span>
                  <span className="mt-0.5 block text-xs text-zinc-400">{p.blurb}</span>
                </button>
              ))}
            </div>
            <button
              type="button"
              className="mt-4 w-full rounded-md border border-zinc-600 py-2 text-xs text-zinc-400 hover:bg-zinc-800"
              onClick={() => setStep("intro")}
            >
              Назад
            </button>
          </>
        ) : null}

        {step === "circumstance" ? (
          <>
            <p className="mb-3 text-center text-sm font-medium text-zinc-100">
              Как ты сюда попал?
            </p>
            <div className="flex flex-col gap-2">
              {ISEKAI_CIRCUMSTANCES.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className="rounded-lg border border-zinc-700 bg-zinc-900/80 px-3 py-2.5 text-left text-sm text-zinc-100 hover:border-cyan-700/60 hover:bg-zinc-800/90"
                  onClick={() => {
                    setCircumstanceId(c.id);
                    setStep("confirm");
                  }}
                >
                  <span className="font-semibold text-cyan-200/95">{c.title}</span>
                  <span className="mt-0.5 block text-xs text-zinc-400">{c.blurb}</span>
                </button>
              ))}
            </div>
            <button
              type="button"
              className="mt-4 w-full rounded-md border border-zinc-600 py-2 text-xs text-zinc-400 hover:bg-zinc-800"
              onClick={() => setStep("profession")}
            >
              Назад
            </button>
          </>
        ) : null}

        {step === "confirm" && professionId && circumstanceId && previewBonus && statPreview ? (
          <>
            <p className="mb-3 text-center text-sm font-medium text-zinc-100">
              Запись в систему
            </p>
            <div className="mb-4 rounded-lg border border-zinc-700 bg-zinc-900/60 px-3 py-3 text-sm text-zinc-300">
              <p>
                <span className="text-zinc-500">Прошлое:</span>{" "}
                {getProfessionById(professionId)?.title ?? professionId}
              </p>
              <p className="mt-1">
                <span className="text-zinc-500">Переход:</span>{" "}
                {getCircumstanceById(circumstanceId)?.title ?? circumstanceId}
              </p>
              <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-cyan-500/90">
                Влияние на статы (ур. 1, без экипировки)
              </p>
              <ul className="mt-1 list-inside list-disc text-xs text-zinc-400">
                {formatBonusLines(previewBonus).map((line, i) => (
                  <li key={i}>{line}</li>
                ))}
              </ul>
              <p className="mt-2 font-mono text-[10px] text-zinc-500">
                ATK {statPreview.base.atk}→{statPreview.withO.atk} · DEF{" "}
                {statPreview.base.def}→{statPreview.withO.def} · SPD{" "}
                {statPreview.base.spd}→{statPreview.withO.spd} · LCK{" "}
                {statPreview.base.luck}→{statPreview.withO.luck} · HP{" "}
                {statPreview.base.maxHp}→{statPreview.withO.maxHp} · STA{" "}
                {statPreview.base.maxSta}→{statPreview.withO.maxSta}
              </p>
            </div>
            <button
              type="button"
              className="w-full rounded-lg bg-emerald-700 px-4 py-3 text-sm font-semibold text-white hover:bg-emerald-600"
              onClick={() => void finish()}
            >
              Появиться в мире
            </button>
            <button
              type="button"
              className="mt-3 w-full rounded-md border border-zinc-600 py-2 text-xs text-zinc-400 hover:bg-zinc-800"
              onClick={() => setStep("circumstance")}
            >
              Назад
            </button>
          </>
        ) : null}
      </div>
    </div>
  );
}
