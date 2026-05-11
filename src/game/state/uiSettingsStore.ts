import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  DEFAULT_PLAY_RENDER_PRESET,
  isPlayRenderPresetId,
  type PlayRenderPresetId,
} from "@/src/game/constants/renderPresets";

export const UI_SETTINGS_PERSIST_VERSION = 3;

/** Множитель альфы ночного «тинта» (полноэкранный слой суток), по умолчанию усилен. */
export const DEFAULT_NIGHT_TINT_MUL = 1.4;
/** Множитель силы виньетки (тёмные края ночью). */
export const DEFAULT_NIGHT_VIGNETTE_MUL = 1.45;

function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 1;
  return Math.max(0, Math.min(1, v));
}

function clampNightMul(v: number, fallback: number): number {
  if (!Number.isFinite(v)) return fallback;
  return Math.max(0, Math.min(2, v));
}

export type UiSettingsState = {
  uiSettingsVersion: number;
  /** Множитель громкости SFX (0…1), дублируется в Phaser `scene.sound.volume`. */
  sfxVolume: number;
  setSfxVolume: (value: number) => void;
  /** Множитель громкости шагов (0…1), умножается на базовую громкость шагов в сцене. */
  footstepVolume: number;
  setFootstepVolume: (value: number) => void;
  /** 0…2 — насколько сильнее базового затемнить экран по фазе суток (`DayNightLighting` rect). */
  nightTintMul: number;
  setNightTintMul: (value: number) => void;
  /** 0…2 — насколько усилить виньетку ночью / в сумерках. */
  nightVignetteMul: number;
  setNightVignetteMul: (value: number) => void;
  resetNightVisibilityCalibration: () => void;
  /** Внутреннее разрешение Phaser (16:9); смена пересоздаёт игру. */
  playRenderPreset: PlayRenderPresetId;
  setPlayRenderPreset: (id: PlayRenderPresetId) => void;
};

export const useUiSettingsStore = create<UiSettingsState>()(
  persist(
    (set) => ({
      uiSettingsVersion: UI_SETTINGS_PERSIST_VERSION,
      sfxVolume: 1,
      setSfxVolume: (value) => set({ sfxVolume: clamp01(value) }),
      footstepVolume: 1,
      setFootstepVolume: (value) => set({ footstepVolume: clamp01(value) }),
      nightTintMul: DEFAULT_NIGHT_TINT_MUL,
      setNightTintMul: (value) =>
        set({
          nightTintMul: clampNightMul(value, DEFAULT_NIGHT_TINT_MUL),
        }),
      nightVignetteMul: DEFAULT_NIGHT_VIGNETTE_MUL,
      setNightVignetteMul: (value) =>
        set({
          nightVignetteMul: clampNightMul(value, DEFAULT_NIGHT_VIGNETTE_MUL),
        }),
      resetNightVisibilityCalibration: () =>
        set({
          nightTintMul: DEFAULT_NIGHT_TINT_MUL,
          nightVignetteMul: DEFAULT_NIGHT_VIGNETTE_MUL,
        }),
      playRenderPreset: DEFAULT_PLAY_RENDER_PRESET,
      setPlayRenderPreset: (id) =>
        set({
          playRenderPreset: isPlayRenderPresetId(id)
            ? id
            : DEFAULT_PLAY_RENDER_PRESET,
        }),
    }),
    {
      name: "last-summon-ui-settings-v1",
      partialize: (s) => ({
        sfxVolume: s.sfxVolume,
        footstepVolume: s.footstepVolume,
        nightTintMul: s.nightTintMul,
        nightVignetteMul: s.nightVignetteMul,
        uiSettingsVersion: s.uiSettingsVersion,
        playRenderPreset: s.playRenderPreset,
      }),
      merge: (persisted, current) => {
        const p = persisted as
          | Partial<
              Pick<
                UiSettingsState,
                | "sfxVolume"
                | "footstepVolume"
                | "nightTintMul"
                | "nightVignetteMul"
                | "playRenderPreset"
              >
            >
          | undefined;
        return {
          ...current,
          sfxVolume: clamp01(
            typeof p?.sfxVolume === "number" ? p.sfxVolume : current.sfxVolume
          ),
          footstepVolume: clamp01(
            typeof p?.footstepVolume === "number"
              ? p.footstepVolume
              : current.footstepVolume
          ),
          nightTintMul: clampNightMul(
            typeof p?.nightTintMul === "number"
              ? p.nightTintMul
              : current.nightTintMul,
            DEFAULT_NIGHT_TINT_MUL
          ),
          nightVignetteMul: clampNightMul(
            typeof p?.nightVignetteMul === "number"
              ? p.nightVignetteMul
              : current.nightVignetteMul,
            DEFAULT_NIGHT_VIGNETTE_MUL
          ),
          playRenderPreset: isPlayRenderPresetId(p?.playRenderPreset)
            ? p.playRenderPreset
            : current.playRenderPreset,
          uiSettingsVersion: UI_SETTINGS_PERSIST_VERSION,
        };
      },
    }
  )
);
