import { create } from "zustand";
import { persist } from "zustand/middleware";

export const UI_SETTINGS_PERSIST_VERSION = 1;

function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 1;
  return Math.max(0, Math.min(1, v));
}

export type UiSettingsState = {
  uiSettingsVersion: number;
  /** Множитель громкости SFX (0…1), дублируется в Phaser `scene.sound.volume`. */
  sfxVolume: number;
  setSfxVolume: (value: number) => void;
  /** Множитель громкости шагов (0…1), умножается на базовую громкость шагов в сцене. */
  footstepVolume: number;
  setFootstepVolume: (value: number) => void;
};

export const useUiSettingsStore = create<UiSettingsState>()(
  persist(
    (set) => ({
      uiSettingsVersion: UI_SETTINGS_PERSIST_VERSION,
      sfxVolume: 1,
      setSfxVolume: (value) => set({ sfxVolume: clamp01(value) }),
      footstepVolume: 1,
      setFootstepVolume: (value) => set({ footstepVolume: clamp01(value) }),
    }),
    {
      name: "nagibatop-ui-settings-v1",
      partialize: (s) => ({
        sfxVolume: s.sfxVolume,
        footstepVolume: s.footstepVolume,
        uiSettingsVersion: s.uiSettingsVersion,
      }),
      merge: (persisted, current) => {
        const p = persisted as
          | Partial<Pick<UiSettingsState, "sfxVolume" | "footstepVolume">>
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
          uiSettingsVersion: UI_SETTINGS_PERSIST_VERSION,
        };
      },
    }
  )
);
