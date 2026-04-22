"use client";

import { useEffect, useState } from "react";
import { useGameStore } from "@/src/game/state/gameStore";
import { useUiSettingsStore } from "@/src/game/state/uiSettingsStore";
import { PaperButton } from "@/src/game/ui/paper/PaperButton";
import { PaperModalChrome } from "@/src/game/ui/paper/PaperChrome";

type SettingsTab = "sound" | "stats";

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-[#c9b89a]/60 py-1.5 text-sm last:border-b-0">
      <span className="text-[#4a4338]">{label}</span>
      <span className="font-mono tabular-nums text-[#2a241c]">{value}</span>
    </div>
  );
}

export default function SettingsOverlay({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<SettingsTab>("sound");
  const sfxVolume = useUiSettingsStore((s) => s.sfxVolume);
  const setSfxVolume = useUiSettingsStore((s) => s.setSfxVolume);
  const footstepVolume = useUiSettingsStore((s) => s.footstepVolume);
  const setFootstepVolume = useUiSettingsStore((s) => s.setFootstepVolume);

  const lifetimeStats = useGameStore((s) => s.lifetimeStats);
  const level = useGameStore((s) => s.character.level);
  const gold = useGameStore((s) => s.character.gold);
  const dungeonMax = useGameStore((s) => s.dungeonMaxClearedFloor);

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
    if (open) setTab("sound");
  }, [open]);

  if (!open) return null;

  const pct = Math.round(sfxVolume * 100);
  const footPct = Math.round(footstepVolume * 100);

  return (
    <PaperModalChrome title="Настройки" onClose={onClose}>
      <div className="flex min-h-0 flex-col gap-3 px-1 py-2 sm:px-2">
        <div className="flex flex-wrap gap-1.5">
          <PaperButton
            type="button"
            variant={tab === "sound" ? "accent" : "primary"}
            className="!px-2 !py-0.5 !text-[10px]"
            onClick={() => setTab("sound")}
          >
            Звук
          </PaperButton>
          <PaperButton
            type="button"
            variant={tab === "stats" ? "accent" : "primary"}
            className="!px-2 !py-0.5 !text-[10px]"
            onClick={() => setTab("stats")}
          >
            Статистика
          </PaperButton>
        </div>

        {tab === "sound" && (
          <div className="flex flex-col gap-4">
            <label className="flex flex-col gap-2 text-sm text-[#4a4338]">
              <span className="font-medium text-[#3d2914]">
                Громкость звуков{" "}
                <span className="font-mono tabular-nums">{pct}%</span>
              </span>
              <input
                type="range"
                min={0}
                max={100}
                value={pct}
                onChange={(e) => {
                  setSfxVolume(Number(e.target.value) / 100);
                }}
                className="w-full accent-amber-700"
              />
            </label>
            <label className="flex flex-col gap-2 text-sm text-[#4a4338]">
              <span className="font-medium text-[#3d2914]">
                Громкость шагов{" "}
                <span className="font-mono tabular-nums">{footPct}%</span>
              </span>
              <input
                type="range"
                min={0}
                max={100}
                value={footPct}
                onChange={(e) => {
                  setFootstepVolume(Number(e.target.value) / 100);
                }}
                className="w-full accent-amber-700"
              />
            </label>
            <p className="text-xs leading-relaxed text-[#6b5d4a]">
              Сохраняется в этом браузере. Редактор карт по-прежнему без звука.
            </p>
          </div>
        )}

        {tab === "stats" && (
          <div className="max-h-[min(60vh,420px)] min-h-0 overflow-y-auto pr-1">
            <p className="mb-2 text-xs text-[#6b5d4a]">
              Накопительные значения за текущее сохранение.
            </p>
            <div className="rounded border border-[#b8a88c] bg-[#f6f0e4]/80 px-2 py-1">
              <StatRow label="Уровень" value={String(level)} />
              <StatRow label="Золото сейчас" value={String(Math.floor(gold))} />
              <StatRow
                label="Всего получено золота"
                value={String(lifetimeStats.totalGoldEarned)}
              />
              <StatRow
                label="Всего потрачено золота"
                value={String(lifetimeStats.totalGoldSpent)}
              />
              <StatRow
                label="Всего начислено опыта"
                value={String(lifetimeStats.totalXpGained)}
              />
              <StatRow
                label="Побеждено врагов"
                value={String(lifetimeStats.enemiesKilled)}
              />
              <StatRow
                label="Уникальных сундуков"
                value={String(lifetimeStats.uniqueChestsOpened)}
              />
              <StatRow
                label="Уникальных пикапов в мире"
                value={String(lifetimeStats.uniqueWorldPickupsTaken)}
              />
              <StatRow
                label="Поражений (респавн)"
                value={String(lifetimeStats.playerDeaths)}
              />
              <StatRow
                label="Макс. этаж подземелья"
                value={String(dungeonMax)}
              />
              <StatRow
                label="Зачисток этажа (босс)"
                value={String(lifetimeStats.dungeonBossFirstClears)}
              />
            </div>
          </div>
        )}
      </div>
    </PaperModalChrome>
  );
}
