"use client";

import { useEffect, useState } from "react";
import { useGameStore } from "@/src/game/state/gameStore";
import {
  DEFAULT_NIGHT_TINT_MUL,
  DEFAULT_NIGHT_VIGNETTE_MUL,
  useUiSettingsStore,
} from "@/src/game/state/uiSettingsStore";
import { PaperButton } from "@/src/game/ui/paper/PaperButton";
import { PaperModalChrome } from "@/src/game/ui/paper/PaperChrome";
import {
  PLAY_RENDER_PRESETS,
  type PlayRenderPresetId,
} from "@/src/game/constants/renderPresets";

type SettingsTab = "sound" | "display" | "stats";

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
  const nightTintMul = useUiSettingsStore((s) => s.nightTintMul);
  const setNightTintMul = useUiSettingsStore((s) => s.setNightTintMul);
  const nightVignetteMul = useUiSettingsStore((s) => s.nightVignetteMul);
  const setNightVignetteMul = useUiSettingsStore((s) => s.setNightVignetteMul);
  const resetNightVisibilityCalibration = useUiSettingsStore(
    (s) => s.resetNightVisibilityCalibration
  );
  const playRenderPreset = useUiSettingsStore((s) => s.playRenderPreset);
  const setPlayRenderPreset = useUiSettingsStore((s) => s.setPlayRenderPreset);

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
  const tintPct = Math.round(nightTintMul * 100);
  const vigPct = Math.round(nightVignetteMul * 100);

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
            variant={tab === "display" ? "accent" : "primary"}
            className="!px-2 !py-0.5 !text-[10px]"
            onClick={() => setTab("display")}
          >
            Экран
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

        {tab === "display" && (
          <div className="flex flex-col gap-4">
            <label className="flex flex-col gap-1.5 text-sm text-[#4a4338]">
              <span className="font-medium text-[#3d2914]">
                Разрешение рендера (внутреннее 16:9)
              </span>
              <select
                className="rounded border border-[#b8a88c] bg-[#f6f0e4] px-2 py-1.5 text-sm text-[#2a241c]"
                value={playRenderPreset}
                onChange={(e) =>
                  setPlayRenderPreset(e.target.value as PlayRenderPresetId)
                }
              >
                {(Object.keys(PLAY_RENDER_PRESETS) as PlayRenderPresetId[]).map(
                  (id) => (
                    <option key={id} value={id}>
                      {PLAY_RENDER_PRESETS[id].label}
                    </option>
                  )
                )}
              </select>
              <span className="text-[11px] leading-snug text-[#6b5d4a]">
                Смена пересоздаёт игру (короткая перезагрузка сцены). В окне не
                16:9 возможны чёрные поля по краям — это нормально для Scale.FIT.
              </span>
            </label>
            <p className="text-xs leading-relaxed text-[#6b5d4a]">
              Два множителя к встроенной кривой суток. 100% — без усиления от
              ползунка; по умолчанию в игре выставлено сильнее (см. сброс).
              Сохраняется локально.
            </p>
            <label className="flex flex-col gap-2 text-sm text-[#4a4338]">
              <span className="font-medium text-[#3d2914]">
                Затемнение суток{" "}
                <span className="font-mono tabular-nums">{tintPct}%</span>
              </span>
              <input
                type="range"
                min={0}
                max={200}
                value={tintPct}
                onChange={(e) => {
                  setNightTintMul(Number(e.target.value) / 100);
                }}
                className="w-full accent-amber-700"
              />
            </label>
            <label className="flex flex-col gap-2 text-sm text-[#4a4338]">
              <span className="font-medium text-[#3d2914]">
                Виньетка (края экрана){" "}
                <span className="font-mono tabular-nums">{vigPct}%</span>
              </span>
              <input
                type="range"
                min={0}
                max={200}
                value={vigPct}
                onChange={(e) => {
                  setNightVignetteMul(Number(e.target.value) / 100);
                }}
                className="w-full accent-amber-700"
              />
            </label>
            <div className="flex flex-wrap items-center gap-2">
              <PaperButton
                type="button"
                variant="primary"
                className="!px-2 !py-0.5 !text-[10px]"
                onClick={() => resetNightVisibilityCalibration()}
              >
                Сбросить ночь (
                {Math.round(DEFAULT_NIGHT_TINT_MUL * 100)}% /{" "}
                {Math.round(DEFAULT_NIGHT_VIGNETTE_MUL * 100)}%)
              </PaperButton>
            </div>
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
